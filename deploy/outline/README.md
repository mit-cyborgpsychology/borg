# Project notes in Outline

Borg creates a project's collection only when its first note is created. New
collections grant workspace members `read_write` access; public sharing is off.
Existing collection permissions are preserved. Documents stay in Outline and can
be edited there independently. Removing a canvas node does not delete its document.

Set server-only `OUTLINE_API_URL` and `OUTLINE_API_TOKEN` in local `.env` and the
Cloudflare Pages production environment. The token needs collection and document
read/write access. The document route uses the caller's Firebase token for project
and node access, so Firestore rules remain authoritative; no admin credential is
needed for note creation. Do not send the Outline token to the browser.

Creation coordinates requests through a conditional Firestore project lease and
uses a stable, UUID-v4-formatted document ID per canvas node. A project marker in
the collection description lets a retry recover a created collection after an
interrupted save. An uncertain create waits two minutes before another attempt,
and checks for the existing collection first. A confirmed missing collection is
repaired on the next create; authentication failures never trigger replacement.

Borg refreshes document titles on node mount, when returning to the browser tab,
and when opening/closing the embedded editor. It does not copy or overwrite the
Outline document body. Existing documents can be linked from the same project
collection. A missing/archived document can be restored in Outline or replaced by
using **Change linked note**. No document webhook or task-comment sync is changed.

## Authenticated iframe editor

The self-hosted Outline response uses `X-Frame-Options: SAMEORIGIN`. The supplied
nginx proxy removes that header and adds a narrowly scoped `frame-ancestors`
policy while keeping Outline's existing CSP. It allows the production Borg domain
and local development ports 5173/5174 only. Login remains managed by Outline.
Sign into Outline in a top-level tab, then reload the editor if an SSO provider
cannot sign in inside the frame. No public share link or token-in-URL is used.

From the Outline Docker Compose directory, copy `borg-editor.conf` and
`install-proxy.py`, then run:

```sh
python3 install-proxy.py
docker compose config --quiet
docker compose pull borg-editor-proxy
docker compose run --rm --no-deps borg-editor-proxy nginx -t
docker compose up -d outline borg-editor-proxy
```

The installer backs up the compose file, moves host port 3000 to the proxy, and
keeps Outline reachable on the internal Docker network. The Cloudflare tunnel
continues using port 3000. When replacing the mounted config file, validate it in
a new one-off container and recreate `borg-editor-proxy` so its bind mount points
to the new file. Rollback: restore the saved compose file and recreate Outline,
removing the proxy container first to release host port 3000.

## Verification

`node --test tests/outline-project.test.mjs` covers lazy creation, recovery,
concurrent requests, title updates, and document linking. With the demo Firebase
emulators and a local dev server, `BORG_TEST_URL=http://127.0.0.1:5182 node
tests/browser/outline.mjs` checks the canvas flow against the real Outline API,
creates one temporary collection, and deletes it in cleanup. The iframe content
is mocked in that browser test; authenticated editing still requires an Outline
browser session. The self-hosted headers are verified separately.
