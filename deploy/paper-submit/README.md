# Web paper submissions

Copy this directory alongside the Mac mini ingestion application's `server.mjs`.
Run `python3 paper-submit/install.py` from that application's root. It verifies
expected source markers and JavaScript syntax, backs up modified files, and adds
`/research-submit` to the existing server. Restart `com.borg.server` afterward.
The installer is idempotent; updating the handler itself requires a server restart.

Set a dedicated random `RESEARCH_INGEST_TOKEN` in the ingestion `.env`. Configure
that same private secret and
`RESEARCH_INGEST_URL=https://mac.cyborglab.org/research-submit` in Borg's UI server.
Do not prefix secrets with `VITE_`. This write credential is separate from the
read-only map credential. The UI verifies Firebase authentication and account
approval on both submission and status requests, and derives ownership from the
verified identity rather than the browser's body.

The route accepts token-authenticated POST JSON with either `{owner,sharedBy,url}`
or `{owner,action:"status",id}`. It returns only public job status fields. Each
owner can read only their own submissions. Files in private `jobs/` are written
atomically; queued/interrupted jobs resume when the ingestion server restarts.
The queue processes one web submission at a time and admits up to 20 pending jobs.
Simultaneous identical URLs share pipeline work, including with WhatsApp ingestion.

Web jobs reuse `processUrl`: fetch, classify, summarize, optional PDF archival,
Grist save and Chroma embedding. No web job sends a chat reply or reaction. Failed
Grist lookups/saves stop web ingestion; failed embedding reports a saved paper
with a warning. Resubmitting an existing paper repairs a missing embedding.
Existing embeddings are reused. The standard per-paper map hook remains in use;
K-means/labels still update at total counts divisible by ten.

Web fetching allows only public HTTP/HTTPS URLs on their standard ports. Every
redirect and socket DNS lookup is checked; private, loopback and link-local
addresses are rejected. Downloads are limited to 25 MB and 20-second timeouts.
WhatsApp fetching keeps its existing behavior. The pipeline installer adds a
fetch-adapter parameter so the same paper extraction methods can use these web
request restrictions.

Testing uses mocked pipeline results and temporary job directories. The browser
suite exercises a real duplicate submission (no new library record), then mocks
new-paper success and failure states. It never inserts arbitrary test papers.

The authenticated `{owner,action:"monitor"}` request returns queue counts and the
owner's latest 20 submissions, including completed jobs. Borg's References → Status
panel checks this alongside Grist, the saved map and the existing `/health` endpoint.
It checks every 30 seconds only while open and the page is visible; checks do not
trigger ingestion, map computation or clustering. WhatsApp health reports process
liveness, not an authenticated WhatsApp connection. The monitor requires the same
`RESEARCH_INGEST_URL` and `RESEARCH_INGEST_TOKEN` bindings as paper submission.

WhatsApp sends the summary after the Grist save attempt and before Chroma
embedding, map triggering, and optional Outline archival. Map computation remains
a detached Python process. To update an already-installed server, copy
`reply_before_indexing.py` into `paper-submit/` and run
`python3 paper-submit/reply_before_indexing.py` from the ingestion app root, then
restart the server. The installer also applies this change on fresh or existing
installations. Web submission status continues to wait for its indexing attempt.
