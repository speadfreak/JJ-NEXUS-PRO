---
name: Replit artifact-mode WebSocket fix
description: How to make WebSocket work in Replit autoscale artifact-mode deployments where static and API are split.
---

## The Problem

Replit's autoscale deployment auto-detects monorepo artifacts:
- `artifacts/ethiostream-pro/dist/public` → registers a Replit-internal static handler at external port 80
- `artifacts/api-server` → runs as a "runnable artifact" on PORT=8080

Result: Browser WebSocket to `wss://yourapp.replit.app/api/stream/ws` hits the static handler at port 80, which cannot do WebSocket upgrades. Port 8080 (API server) is not externally accessible.

## The Fix (applied May 2026)

**1. Move frontend build output into api-server/dist/public**

In `artifacts/ethiostream-pro/vite.config.ts`:
```typescript
build: {
  outDir: path.resolve(import.meta.dirname, "../api-server/dist/public"),
  emptyOutDir: false,  // esbuild wipes dist/ first
}
```

This eliminates `artifacts/ethiostream-pro/dist/public` so Replit does NOT register a static artifact. External port 80 then uses [[ports]] routing → local port 5000.

**2. Build order: API server first, then frontend**

esbuild wipes `api-server/dist/` entirely. Vite must run AFTER to populate `api-server/dist/public`.

Deployment build command:
```
rm -rf artifacts/ethiostream-pro/dist && pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/ethiostream-pro run build
```

**3. Update app.ts static path**

Change from the long `../../ethiostream-pro/dist/public` path to:
```typescript
const frontendDist = path.join(__dirname, "public");
```
(`__dirname` = `artifacts/api-server/dist/` in the esbuild output)

**4. Add port 5000 listener in production (index.ts)**

Replit's [[ports]] maps `localPort=5000 → externalPort=80`. In production, the artifact gets PORT=8080. We add a second HTTP server on port 5000 so WebSocket requests at the main app URL reach the API server:

```typescript
if (process.env.NODE_ENV === "production" && port !== 5000) {
  const prodServer = http.createServer(app);
  prodServer.on("upgrade", handleUpgrade);
  prodServer.listen(5000);
}
```

**Why:**
Without the static artifact, external port 80 → local port 5000 (from [[ports]]). The API server listening on 5000 handles WebSocket upgrades, static files, and API — all at the same external URL.

**How to apply:**
Any time streaming or WebSocket breaks in production in this monorepo, check: (a) does `artifacts/ethiostream-pro/dist/public` exist? If yes, Replit registers a static artifact and splits the deployment. (b) Is the API server listening on port 5000 in production?
