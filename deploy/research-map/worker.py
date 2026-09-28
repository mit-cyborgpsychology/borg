"""Keep a saved UMAP projection in sync with Chroma; never run from a web request."""

import argparse
import fcntl
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import time
from topics import TOPIC_VERSION, update_topics, digest
import urllib.parse
import urllib.request

PROJECTION_VERSION = 'umap-cosine-seed42-v1'


def read_embeddings(base_url):
    def request(path, body=None):
        req = urllib.request.Request(
            base_url.rstrip('/') + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.load(response)

    prefix = '/api/v2/tenants/default_tenant/databases/default_database/collections/'
    collection = request(prefix + 'references')
    records = []
    offset = 0
    while True:
        result = request(prefix + urllib.parse.quote(collection['id'], safe='') + '/get',
                         {'include': ['embeddings', 'documents', 'metadatas'], 'limit': 1000, 'offset': offset})
        ids, vectors = result['ids'], result['embeddings']
        if vectors is None or len(ids) != len(vectors):
            raise ValueError('Incomplete embedding response')
        documents = result.get('documents') or [''] * len(ids)
        metadata = result.get('metadatas') or [{}] * len(ids)
        if len(documents) != len(ids) or len(metadata) != len(ids):
            raise ValueError('Incomplete document response')
        records.extend({'url': url, 'embedding': vector,
                        'title': str((meta or {}).get('title') or ''),
                        'document': doc if isinstance(doc, str) else ''}
                       for url, vector, doc, meta in zip(ids, vectors, documents, metadata))
        if len(ids) < 1000:
            return records
        offset += len(ids)


def valid_records(records):
    candidates = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get('url'), str):
            continue
        try:
            url = urllib.parse.urlsplit(record['url'])
        except ValueError:
            continue
        vector = record.get('embedding')
        if url.scheme not in ('http', 'https') or not url.netloc or url.username:
            continue
        if not isinstance(vector, list) or not vector:
            continue
        if not all(isinstance(value, (float, int)) and not isinstance(value, bool)
                   and math.isfinite(value) for value in vector):
            continue
        if not any(value != 0 for value in vector):
            continue
        candidates.append(record)
    if not candidates:
        return []
    dimensions = Counter(len(record['embedding']) for record in candidates).most_common(1)[0][0]
    by_url = {record['url']: record for record in candidates if len(record['embedding']) == dimensions}
    return [by_url[url] for url in sorted(by_url)]


def fingerprint(records):
    payload = json.dumps([PROJECTION_VERSION, [{'url': r['url'], 'embedding': r['embedding']} for r in records]], separators=(',', ':'), sort_keys=True, allow_nan=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def project(records):
    if len(records) < 3:
        return {'method': 'insufficient-data', 'points': []}
    import numpy as np
    from umap import UMAP

    vectors = np.asarray([record['embedding'] for record in records], dtype=np.float64)
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    coordinates = UMAP(
        n_components=2, n_neighbors=min(10, len(records) - 1), min_dist=0.15,
        metric='cosine', random_state=42, n_jobs=1, n_epochs=350, init='random',
    ).fit_transform(vectors)
    if not np.isfinite(coordinates).all():
        raise ValueError('UMAP returned invalid coordinates')
    low, high = coordinates.min(axis=0), coordinates.max(axis=0)
    span = high - low
    coordinates = np.divide(coordinates - low, span, out=np.full_like(coordinates, 0.5), where=span != 0)
    return {'method': 'umap', 'points': [
        {'url': record['url'], 'x': float(point[0]), 'y': float(point[1])}
        for record, point in zip(records, coordinates)
    ]}


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.map-', delete=False) as output:
            name = output.name
            json.dump(value, output, allow_nan=False, separators=(',', ':'))
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)


def update_projection(records, output, projector=project, topic_builder=update_topics, now=None, paper_count=None):
    records = valid_records(records)
    embedding_digest = fingerprint(records)
    topic_digest = digest([TOPIC_VERSION, records])
    now = time.time() if now is None else now
    previous = {}
    try:
        previous = json.loads(Path(output).read_text())
        if not isinstance(previous, dict):
            previous = {}
    except (OSError, ValueError):
        pass
    same_projection = previous.get('fingerprint') == embedding_digest and isinstance(previous.get('points'), list)
    same_topics = previous.get('topicFingerprint') == topic_digest
    boundary_due = (paper_count is not None and paper_count > previous.get('clusteredCount', len(previous.get('points', []))) and paper_count % 10 == 0)
    if not boundary_due and same_projection and same_topics and (not previous.get('labelsPending') or now < previous.get('labelsRetryAt', 0)):
        return False
    result = ({'method': previous['method'], 'points': [dict(p) for p in previous['points']]}
              if same_projection else projector(records))
    cache_path = Path(output).with_name('topic-label-cache.json')
    try:
        cache = json.loads(cache_path.read_text())
        if not isinstance(cache, dict):
            cache = {}
    except (OSError, ValueError):
        cache = {}
    if paper_count is not None:
        result['triggerCount'] = paper_count
    result = topic_builder(records, result, previous, cache)
    atomic_json(cache_path, dict(list(cache.items())[-128:]))
    atomic_json(output, {**result, 'fingerprint': embedding_digest, 'topicFingerprint': topic_digest,
                        'labelsRetryAt': now + 300 if result.get('labelsPending') else 0,
                        'generatedAt': datetime.now(timezone.utc).isoformat()})
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chroma-url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', type=Path, default=Path(__file__).with_name('map.json'))
    parser.add_argument('--paper-count', type=int, help='Count captured after the ingestion insert')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Serialize hook invocations. A later boundary waits, then reads fresh data.
    with args.output.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        records = read_embeddings(args.chroma_url)
        if update_projection(records, args.output, paper_count=args.paper_count):
            print(f'Updated research map: {len(valid_records(records))} embedded papers', flush=True)


if __name__ == '__main__':
    main()
