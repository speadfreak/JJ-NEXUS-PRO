---
name: Replit dev WebSocket 502 fix
description: Why the -8080- direct hostname causes 502 on WebSocket upgrade and how to fix it
---

## Rule
In `getRelayUrls()`, always put the same-origin Vite-proxy URL **first**. Never use the `-8080-` hostname as the primary WebSocket target in dev.

## Why
Replit's edge proxy for port 8080 (`{replId}-8080-{id}.riker.replit.dev`) does not reliably handle WebSocket upgrade requests — it returns 502 Bad Gateway. The Vite dev server at port 5000 (`-00-` hostname) already has a working WebSocket proxy configured: `/api/stream/ws → ws://localhost:8080`. Using the same-origin URL routes through Vite's internal proxy, which works correctly behind Replit's mTLS layer.

## How to apply
```typescript
// CORRECT — same-origin first (goes through Vite proxy):
if (host.includes(".replit.dev")) {
  const sameOrigin = port ? `${host}:${port}` : host;
  const urls = [`${protocol}//${sameOrigin}/api/stream/ws`];
  if (host.includes("-00-")) {
    urls.push(`wss://${host.replace("-00-", "-8080-")}/api/stream/ws`); // fallback only
  }
  return urls;
}

// WRONG — -8080- hostname as primary causes 502:
const apiHost = host.replace("-00-", "-8080-");
return [`wss://${apiHost}/api/stream/ws`, `${protocol}//${host}/api/stream/ws`];
```

Also ensure vite.config.ts has:
```ts
proxy: {
  "/api/stream/ws": { target: "ws://localhost:8080", changeOrigin: true, ws: true },
  "/api": { target: "http://localhost:8080", changeOrigin: true },
}
```
