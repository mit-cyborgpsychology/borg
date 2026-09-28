"""Cluster original embeddings and name groups; no network work in the HTTP path."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

TOPIC_VERSION = 'kmeans5-normalized-seed42-label-v1'
COLORS = ['#5877ba', '#ae795a', '#59917b', '#9572b0', '#bd9761', '#558f9b', '#af6b88']


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def cluster(records):
    import numpy as np
    from sklearn.cluster import KMeans
    vectors = np.asarray([r['embedding'] for r in records], dtype=np.float64)
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    # Five groups at the current corpus size; fewer for tiny/duplicate corpora.
    k = min(5, max(1, len(records) // 3), len(np.unique(vectors, axis=0)))
    assignments = KMeans(n_clusters=k, random_state=42, n_init=20).fit_predict(vectors)
    return [[r for r, label in zip(records, assignments) if label == i] for i in sorted(set(assignments))]


def match_groups(groups, old_topics):
    """Globally match by membership overlap so numeric K-means labels cannot swap colors."""
    if not groups or not old_topics:
        return {}
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    scores = np.zeros((len(groups), len(old_topics)))
    for i, group in enumerate(groups):
        members = {r['url'] for r in group}
        for j, old in enumerate(old_topics):
            previous = set(old.get('members', []))
            scores[i, j] = len(members & previous) / len(members | previous) if previous else 0
    rows, cols = linear_sum_assignment(-scores)
    return {int(i): old_topics[j] for i, j in zip(rows, cols) if scores[i, j] >= 0.25}


def name_groups(groups):
    # Reuse the ingestion application's installed SDK, dotenv handling and model.
    node = os.environ.get('RESEARCH_NODE_PATH') or shutil.which('node')
    if not node:
        candidate = Path.home() / '.local/share/mise/shims/node'
        node = str(candidate) if candidate.exists() else 'node'
    script = Path(__file__).with_name('label-topics.mjs')
    result = subprocess.run([node, str(script)], input=json.dumps({'groups': groups}),
                            text=True, capture_output=True, timeout=55, check=True,
                            cwd=script.parent.parent)
    return json.loads(result.stdout)


def build_topics(records, projection, previous, cache, labeler=name_groups, grouper=cluster):
    points = {p['url']: p for p in projection['points']}
    mapped_records = [r for r in records if r['url'] in points]
    groups = grouper(mapped_records) if mapped_records else []
    old = previous.get('topics', [])
    matches = match_groups(groups, old)
    used_ids = {t['id'] for t in old}
    used_colors = {t['color'] for t in matches.values()}
    topics, requests = [], []
    for i, group in enumerate(groups):
        prior = matches.get(i, {})
        topic_id = prior.get('id')
        if not topic_id:
            serial = 1
            while f'topic-{serial}' in used_ids:
                serial += 1
            topic_id = f'topic-{serial}'
            used_ids.add(topic_id)
        color = prior.get('color') or next((c for c in COLORS if c not in used_colors), COLORS[i % len(COLORS)])
        used_colors.add(color)
        # Full membership/text participates in cache invalidation; bound LLM input.
        documents = [{'title': r.get('title', '')[:300], 'summary': r.get('document', '')[:1800]}
                     for r in sorted(group, key=lambda r: r['url'])]
        key = digest([TOPIC_VERSION, documents])
        cached = cache.get(key)
        label = cached if isinstance(cached, str) and 0 < len(cached) <= 64 else None
        members = [r['url'] for r in group]
        topic = {'id': topic_id, 'label': label or prior.get('label') or f'Topic {i + 1}',
                 'color': color, 'count': len(group), 'members': members, 'labelKey': key,
                 'labelSource': 'llm' if label else 'fallback',
                 'x': sum(points[url]['x'] for url in members) / len(members),
                 'y': sum(points[url]['y'] for url in members) / len(members)}
        topics.append(topic)
        for url in members:
            points[url]['topicId'] = topic_id
        if not label:
            requests.append({'id': topic_id, 'papers': documents[:24]})
    if requests:
        try:
            labels = labeler(requests)
            if not isinstance(labels, dict):
                raise ValueError('Invalid labels')
            for topic in topics:
                label = labels.get(topic['id'])
                if isinstance(label, str):
                    label = ' '.join(label.split())
                    if 0 < len(label) <= 64:
                        topic.update(label=label, labelSource='llm')
                        cache[topic['labelKey']] = label
        except Exception as error:
            # New papers remain visible even during provider failure. Worker retries later.
            print(f'Topic labels unavailable ({type(error).__name__}); using saved labels', flush=True)
    projection['topics'] = topics
    projection['labelsPending'] = any(t['labelSource'] != 'llm' for t in topics)
    return projection


def update_topics(records, projection, previous, cache, labeler=name_groups, grouper=cluster):
    """Keep topic membership/names between count boundaries; assign new papers by cosine."""
    import numpy as np
    points = {p['url']: p for p in projection['points']}
    mapped = [r for r in records if r['url'] in points]
    count = projection.pop('triggerCount', len(records))
    old = previous.get('topics', [])
    last_clustered = previous.get('clusteredCount', len(previous.get('points', [])))
    full_update = not old or (count > last_clustered and count % 10 == 0)
    by_url = {r['url']: r for r in mapped}

    def vector(record):
        v = np.asarray(record['embedding'], dtype=np.float64)
        return v / np.linalg.norm(v)

    def center(members):
        return np.mean([vector(by_url[url]) for url in members], axis=0).tolist()

    if full_update:
        result = build_topics(mapped, projection, previous, cache, labeler, grouper)
        for topic in result['topics']:
            topic['centroid'] = center(topic['members'])
        result['clusteredCount'] = count
        return result

    # Retain frozen centroids from the last full clustering. Migrate old artifacts once.
    topics = []
    for old_topic in old:
        topic = dict(old_topic)
        members = [url for url in topic['members'] if url in by_url]
        centroid = topic.get('centroid')
        if centroid is None and members:
            centroid = center(members)
        if centroid is None:
            continue
        if mapped and len(centroid) != len(mapped[0]['embedding']):
            # A different embedding model requires a new clustering regardless of count.
            return update_topics(records, projection, {}, cache, labeler, grouper)
        topic.update(members=members, centroid=centroid)
        topics.append(topic)
    if not topics and mapped:
        return update_topics(records, projection, {}, cache, labeler, grouper)
    assigned = {url for topic in topics for url in topic['members']}
    for record in mapped:
        if record['url'] not in assigned:
            v = vector(record)
            topic = max(topics, key=lambda t: float(np.dot(v, t['centroid']) / max(np.linalg.norm(t['centroid']), 1e-12)))
            topic['members'].append(record['url'])
    for topic in topics:
        topic['count'] = len(topic['members'])
        if topic['count']:
            topic['x'] = sum(points[url]['x'] for url in topic['members']) / topic['count']
            topic['y'] = sum(points[url]['y'] for url in topic['members']) / topic['count']
        for url in topic['members']:
            points[url]['topicId'] = topic['id']
    projection.update(topics=topics, clusteredCount=last_clustered,
                      labelsPending=any(t.get('labelSource') != 'llm' for t in topics))
    return projection
