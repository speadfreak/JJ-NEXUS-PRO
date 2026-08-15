---
name: Stream relay architecture
description: v4 stdin-pipe architecture — what worked, what failed, and why.
---

## CURRENT: v4 stdin-pipe (artifacts/api-server/src/routes/stream/index.ts)

### How it works
1. Browser MediaRecorder (1s VP8+Opus WebM chunks) → WebSocket binary frames
2. **Chunk 0** (init segment) captured in memory as `session.initSegment`
3. FFmpeg spawned immediately on first chunk with `-f matroska -i pipe:0`
4. Init segment written to `ffmpeg.stdin` first → subsequent chunks piped directly
5. FFmpeg encodes H.264/AAC → FLV → RTMP (Restream/TikTok/etc.)
6. On crash: new FFmpeg spawned, `initSegment` sent first to restore codec context

### Why this works
MediaRecorder.start(1000) produces a CONTINUOUS WebM stream:
- Chunk 0: full EBML header + SeekHead + Tracks + Info + first Cluster
- Chunks 1+: additional Clusters only
- Concatenated in order = valid live WebM stream → FFmpeg reads it without seeking

### Key FFmpeg flags for stdin pipe
- `-f matroska` (not `-f webm`) — Matroska demuxer handles streaming input better
- `-fflags +nobuffer+genpts` — no buffering + regenerate PTS (critical for crash recovery)
- `-err_detect ignore_err` — survive minor WebM quirks
- `-probesize 262144 -analyzeduration 500000` — fast startup for live input
- `-vsync cfr` — constant frame rate output despite variable input timestamps
- `-avoid_negative_ts make_zero` — fix timestamp issues after recovery

## What FAILED and why

### v3: FIFO-playlist concat demuxer
FFmpeg's concat demuxer internally calls `fseek()` on the playlist file.
Named pipes (FIFOs) do NOT support seeking → FFmpeg blocked in read() forever.
Segments were written and pushed to FIFO (confirmed by logs: seg 0-327+)
but FFmpeg never emitted a single encoded frame. The FIFO approach is INVALID
with FFmpeg's concat demuxer.

### v2: file-based relay loop
File segments work but respawn loop caused ~400ms gaps + RTMP reconnect each batch.
Visible glitch in viewer's stream every few seconds.

### v1: stdin pipe with raw concat
WebM chunk 0 has EBML header; chunks 1+ are clusters only.
Naive concatenation caused corruption if any chunk was dropped or out of order.
Also caused by the ws isBinary bug (now fixed).

## Crash Recovery (v4)
On FFmpeg crash (RTMP disconnect, network error):
- New FFmpeg spawned after exponential backoff (500ms × restartCount, max 3s)
- `session.initSegment` (chunk 0) written to new FFmpeg stdin first
- New segments continue piping → stream resumes with brief glitch
- restartCount ≥ 10 → give up and notify client

## Critical ws frame handling
ws library ALWAYS passes data as Buffer regardless of frame type.
Use ONLY `isBinary` parameter to distinguish text (JSON) from binary (video).
Do NOT use Buffer.isBuffer() — it's always true.

## Production / Deployment Critical
- `ffmpeg-static` MUST be in esbuild `external` array in `build.mjs`
- `pnpm.onlyBuiltDependencies` must include `ffmpeg-static` and `esbuild`
- PORT must be `5000` in production (external port 80 → local 5000)
- MediaRecorder codec order: VP8+Opus → VP9+Opus → H264+Opus → plain webm
