---
name: ws npm binary vs text frame bug
description: ws library always passes Buffer; only isBinary param reliably distinguishes text from binary WebSocket frames
---

## The Bug
In the `ws` npm WebSocket library, the `ws.on("message", (data, isBinary) => {...})` callback ALWAYS receives `data` as a `Buffer`, even for text frames.

This means `Buffer.isBuffer(data)` is ALWAYS `true` — it cannot distinguish frame types.

## Wrong pattern (breaks text frames):
```typescript
// WRONG: Buffer.isBuffer always true, so text JSON init is treated as binary
if (isBinary || Buffer.isBuffer(data)) {
  // binary path — processes init JSON as a blob → rtmpUrl never set → stream broken
}
```

## Correct pattern:
```typescript
// CORRECT: isBinary=false for text frames, isBinary=true for binary frames
if (!isBinary) {
  // text frame — parse as JSON
  const msg = JSON.parse(data.toString());
} else {
  // binary frame — treat as raw bytes
}
```

## Why This Caused the Streaming Bug
The stream relay's `ws.on("message")` handler had `if (isBinary || Buffer.isBuffer(data))`. Since `Buffer.isBuffer()` is always true, the text `{"type":"init","rtmpUrl":...}` message was treated as a binary segment blob. The `session.rtmpUrl` was never set. All subsequent binary blobs hit the `"Got segment before init — ignoring"` guard. FFmpeg was never spawned. The client stayed "Connecting" forever.

## Fix
Check ONLY `isBinary`. Never use `Buffer.isBuffer(data)` for frame-type detection in ws callbacks.

## How to Apply
Applies to any `ws` npm WebSocket server (`ws`, `wss`, `WebSocketServer`) where you need to distinguish text vs binary frames. The pattern holds for ws v7, v8, and newer.
