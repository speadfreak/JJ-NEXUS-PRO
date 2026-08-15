---
name: FFmpeg in Replit autoscale production
description: Why ffmpeg-static npm package is needed; how to enable its build scripts in pnpm; resolver strategy order.
---

## The problem
Replit autoscale deployment containers do NOT have the Nix PATH set up. Even if `pkgs.ffmpeg-full` is in `replit.nix`, `which ffmpeg` returns nothing and `/nix/store` may not be accessible in the container. This causes `code=-2` (ENOENT) when spawning FFmpeg.

## The fix: ffmpeg-static npm package
Install `ffmpeg-static` in the api-server package — it bundles a pre-built static FFmpeg binary that works in ANY Node.js environment, regardless of PATH or Nix.

```
pnpm --filter @workspace/api-server add ffmpeg-static @types/ffmpeg-static
```

**Critical**: pnpm blocks build scripts by default. Add to root `package.json`:
```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["core-js", "ffmpeg-static"]
  }
}
```
Then run `pnpm install` again — this triggers `ffmpeg-static`'s `install.js` which downloads the binary.

## Using it from ESM (api-server uses `"type": "module"`)
```typescript
import { createRequire } from "module";
const req = createRequire(import.meta.url);
const staticPath: string = req("ffmpeg-static");
```

## Resolver strategy order (most-reliable-in-production first)
1. `ffmpeg-static` npm package (always works in production)
2. `FFMPEG_PATH` env var override
3. `which ffmpeg` (works in dev)
4. Nix store O(1) ls-based scan (works in dev workspace)
5. Common absolute paths

**Why:** Replit autoscale deployment containers are Docker-based and don't activate the Nix profile. `ffmpeg-static` lives in `node_modules` alongside the app, so it's always available after `pnpm install`.

**How to apply:** Any time FFmpeg is spawned in a Replit production deployment, use `ffmpeg-static` as the first resolution strategy and ensure it's in `pnpm.onlyBuiltDependencies` in the root `package.json`.
