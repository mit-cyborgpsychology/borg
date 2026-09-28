# Research UMAP service

A Python worker on the ingestion Mac mini reads Chroma's `references` embeddings
and saves a seeded, two-dimensional UMAP using cosine distance. Every successful
embedding insert starts a one-shot Python update through the ingestion hook.
There is no polling. New papers get map points on each update. K-means and LLM
topic labeling run only when the captured total count is divisible by 10
(40, 50, 60, ...), plus initial setup when there are no topics. Between those
boundaries, existing papers retain their topics and new papers join the nearest
saved centroid by cosine similarity. Names and colors stay unchanged.

A failed update keeps the last successful map. Files are replaced atomically,
and a file lock serializes overlapping invocations. Insert+count operations are
serialized in ingestion; each hook carries its captured count, so a count-40
hook still reclusters if paper 41 arrives before computation starts.

The worker also runs seeded K-means on the original L2-normalized embeddings
(five groups, reduced for small or identical-vector corpora). Groups are matched
to their previous membership by maximum overlap to preserve IDs and colors.
The existing ingestion model names groups from their titles and summaries;
`label-topics.mjs` reuses the ingestion application's `openai` and `dotenv`
packages, private `OPENAI_API_KEY`, and model `gpt-5.6-luna`. Override the model
with `RESEARCH_LABEL_MODEL` in the ingestion `.env`, or the Node executable with
`RESEARCH_NODE_PATH` in the worker environment. The worker locates Node on PATH
or the existing mise shim. No new browser credentials are needed.

Labels are cached by group text in private `topic-label-cache.json`. Only changed
groups are sent for labeling (up to 24 papers per group, bounded summaries).
Provider failures retain previous labels or show temporary numbered topics;
labels are tried again at the next clustering boundary. Unchanged embeddings
reuse UMAP coordinates. An embedding dimension change forces new clusters.
Topic groups are browsing aids, not exclusive scientific categories.

The HTTP handler only serves saved coordinates and public topic fields. It never computes UMAP.
Vectors and credentials stay on the server. Search and filtering preserve the
layout; a new projection can move existing points.

Copy this directory to the ingestion service as `research-map`, then create an
isolated Python 3.10+ environment:

```sh
python3 -m venv research-map/.venv
research-map/.venv/bin/pip install -r research-map/requirements.txt
research-map/.venv/bin/python research-map/worker.py
```

Disable/remove the old `com.borg.research-map` LaunchAgent when upgrading from
polling. In `chroma.mjs`, replace `collection.add` with the insert-and-trigger helper:

```js
import { saveAndTriggerReference } from './research-map/trigger.mjs';
// Replace await collection.add(record):
await saveAndTriggerReference(collection, record);
```

The hook spawns Python in the background, writes to `research-map/worker.log`,
and returns without waiting for computation. Chroma defaults to
`http://127.0.0.1:8000`; override with `--chroma-url` for manual runs. Output
defaults to `research-map/map.json`; override with `--output`. For writes outside this ingestion helper, run the one-shot worker manually.

Set a dedicated random `RESEARCH_MAP_TOKEN` in the ingestion service's private
`.env`. Wire the handler into `server.mjs` before its webhook route:

```js
import { createResearchMapHandler } from './research-map/handler.mjs';
const researchMap = createResearchMapHandler();

// Inside the existing HTTP request handler:
if (req.method === 'GET' && req.url === '/research-map') {
	await researchMap(req, res);
	return;
}
```

Restart the ingestion service after installing the handler. The existing
`mac.cyborglab.org` tunnel carries this route; no Chroma port is exposed.
Borg's UI server uses `RESEARCH_MAP_URL=https://mac.cyborglab.org/research-map`
and the same `RESEARCH_MAP_TOKEN`. Configure both for a UI production deployment
as well. `/api/research/map` checks Firebase login and approval before proxying.

Run worker logic tests without modifying Chroma:

```sh
research-map/.venv/bin/python -m unittest discover -s research-map -p 'test_*.py'
```
