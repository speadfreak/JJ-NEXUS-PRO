---
name: WebSocket production URL fix
description: Replit's reverse proxy appends query params to WebSocket upgrade URLs, breaking exact-match checks
---

**Rule:** In `artifacts/api-server/src/index.ts`, the WebSocket upgrade handler must use `req.url.startsWith('/api/stream/ws')` not `req.url === '/api/stream/ws'`.

**Why:** Replit's production proxy appends query params (e.g. `?token=...`) to the upgrade URL. An exact `===` match silently rejects the upgrade — no error, the WebSocket just never opens. `startsWith` handles any appended params correctly.

**How to apply:** Any time a new WebSocket endpoint is added to the server, use `startsWith` for the URL check in the HTTP `upgrade` event handler.
