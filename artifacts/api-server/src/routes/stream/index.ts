import { Router } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, exec, execSync, ChildProcess } from "child_process";
import { createRequire } from "module";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import fs from "fs";
import os from "os";
import path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// STREAM RELAY v7 — stdin pipe → FFmpeg → RTMP
//
// ROOT CAUSE OF ALL PREVIOUS FAILURES (v3-v6):
//   MediaRecorder produces a CONTINUOUS WebM byte stream, not independent files.
//   • Chunk 0: EBML header + SeekHead + Tracks + Info + first Cluster
//   • Chunks 1+: additional Clusters ONLY — no EBML header
//
//   Approaches that failed:
//   v3 FIFO: fseek() on a named pipe blocks forever
//   v4 stdin: piped chunk 0 alone (no media data) → FFmpeg parsed header, found
//             nothing to encode, exited
//   v5 concat demuxer: tried to open each cluster-only chunk as an independent
//             WebM file → "EBML header parsing failed"
//   v6 batch file: wrote chunks 0-4 into one file and opened it; FFmpeg's file
//             mode matroska demuxer uses the SeekHead to seek forward/backward,
//             which confuses it when dealing with concatenated MediaRecorder chunks
//             whose SeekHead offsets point to data within chunk 0 only
//
// SOLUTION (v7):
//   Pipe ALL accumulated chunks to FFmpeg stdin at once, then route every
//   subsequent chunk directly to stdin as it arrives.
//
//   FFmpeg reads stdin with "-f matroska -seekable 0":
//   • "-seekable 0": disables backward seeks — reads linearly like a stream
//   • "-f matroska": explicit demuxer, bypasses format auto-detection
//   • stdin pipe: forces the PIPE code path in FFmpeg's matroska demuxer,
//     which handles open/incomplete clusters correctly
//
//   This is exactly how MediaRecorder output is DESIGNED to be consumed.
//   The chunks concatenated in order form a perfect, valid WebM stream.
//
//   On FFmpeg crash: restart with initChunk prepended to flush all pending
//   chunks that arrived since last restart, restoring WebM header context.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── FFmpeg binary ────────────────────────────────────────────────────────────
function resolveFFmpegBinary(): string {
  function works(p: string): boolean {
    try { execSync(`"${p}" -version 2>&1`, { timeout: 4000 }); return true; } catch { return false; }
  }
  try {
    const req = createRequire(import.meta.url);
    const p: string = req("ffmpeg-static");
    if (p && works(p)) { console.log("[StreamRelay] ✅ ffmpeg-static:", p); return p; }
  } catch {}
  if (process.env.FFMPEG_PATH && works(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    const w = execSync("which ffmpeg 2>/dev/null", { timeout: 3000, encoding: "utf8" }).trim();
    if (w && works(w)) { console.log("[StreamRelay] ✅ PATH ffmpeg:", w); return w; }
  } catch {}
  try {
    const dirs = execSync("ls /nix/store 2>/dev/null | grep ffmpeg | sort -r", { timeout: 6000, encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
    for (const d of [...dirs.filter(d => d.includes("ffmpeg-full")), ...dirs]) {
      const p = `/nix/store/${d}/bin/ffmpeg`;
      if (works(p)) { console.log("[StreamRelay] ✅ nix:", p); return p; }
    }
  } catch {}
  console.error("[StreamRelay] ❌ FFmpeg not found");
  return "ffmpeg";
}
const FFMPEG_BIN = resolveFFmpegBinary();

// ─── Session ──────────────────────────────────────────────────────────────────
interface RelaySession {
  id: string;
  ws: WebSocket;
  workDir: string;
  rtmpUrl: string;

  // WebM chunk accumulation
  initChunk: Buffer | null;      // chunk 0: re-used as pipe header on every FFmpeg restart
  pendingChunks: Buffer[];       // chunks waiting to be flushed to stdin
  totalChunks: number;
  pipeStarted: boolean;          // true once FFmpeg stdin has been opened

  // FFmpeg state
  ffmpeg: ChildProcess | null;
  isLive: boolean;
  encodingStarted: boolean;
  restartCount: number;
  firstEncodingConfirmed: boolean;

  // Config
  videoBitrate: string;
  audioBitrate: string;
  fps: number;
  resolution: string;

  // Misc
  initialized: boolean;
  startTime: number;
  lastChunkMs: number;
  watchdog: ReturnType<typeof setInterval> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, RelaySession>();

// ─── EBML validation ──────────────────────────────────────────────────────────
function isValidEBML(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

// ─── Spawn FFmpeg with stdin pipe ─────────────────────────────────────────────
// Writes initChunk + all pending chunks to stdin immediately, then keeps stdin
// open for subsequent chunks as they arrive.
function spawnFFmpegPipe(session: RelaySession): void {
  if (!sessions.has(session.id)) return;
  if (!session.rtmpUrl || !session.initChunk) return;

  const attempt = session.restartCount + 1;
  const vbr = session.videoBitrate || "2500k";
  const abr = session.audioBitrate || "128k";
  const fps = session.fps || 30;
  const gop = fps * 2;
  const vbInt = parseInt(vbr);

  const res = session.resolution || "";
  const m = res.match(/^(\d+)x(\d+)$/);
  const scaleFilter = m
    ? `scale=${m[1]}:${m[2]}:force_original_aspect_ratio=decrease,pad=${m[1]}:${m[2]}:(ow-iw)/2:(oh-ih)/2,setsar=1`
    : "scale=trunc(iw/2)*2:trunc(ih/2)*2";

  const args = [
    "-y",
    // Input: stdin as a continuous matroska/webm stream (no seeking)
    "-fflags", "nobuffer+genpts+discardcorrupt",
    "-flags", "low_delay",
    "-err_detect", "ignore_err",
    "-f", "matroska",
    "-seekable", "0",
    "-i", "pipe:0",

    // Video: H.264 ultrafast baseline for RTMP
    "-vf", scaleFilter,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-tune", "zerolatency",
    "-profile:v", "baseline",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-b:v", vbr,
    "-maxrate", `${Math.round(vbInt * 1.5)}k`,
    "-bufsize", `${vbInt * 4}k`,
    "-g", String(gop),
    "-keyint_min", String(gop),
    "-fps_mode", "cfr",
    "-r", String(fps),
    "-x264-params", "no-scenecut=1:bframes=0:nal-hrd=cbr",
    "-avoid_negative_ts", "make_zero",
    "-max_muxing_queue_size", "4096",

    // Audio: AAC 44.1kHz stereo
    "-c:a", "aac",
    "-b:a", abr,
    "-ar", "44100",
    "-ac", "2",
    "-af", "aresample=async=1000:min_hard_comp=0.1:first_pts=0",

    // Output: FLV → RTMP
    "-f", "flv",
    "-flvflags", "no_duration_filesize",
    "-flush_packets", "1",
    "-reconnect", "1",
    "-reconnect_at_eof", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    session.rtmpUrl,
  ];

  console.log(`[Relay-${session.id}] ▶ FFmpeg attempt=${attempt} pipe→matroska → ${maskKey(session.rtmpUrl)}`);

  let proc: ChildProcess;
  try {
    proc = spawn(FFMPEG_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    console.error(`[Relay-${session.id}] Spawn failed:`, e.message);
    safeSend(session.ws, { type: "error", message: `FFmpeg spawn failed: ${e.message}` });
    return;
  }

  session.ffmpeg = proc;
  session.isLive = true;
  session.encodingStarted = false;
  session.pipeStarted = true;
  const spawnedAt = Date.now();
  let stderrBuf = "";

  // ── Flush ALL accumulated chunks to stdin immediately ──────────────────────
  // Write initChunk first (EBML header), then all pending chunks
  const toFlush: Buffer[] = [session.initChunk];
  if (session.pendingChunks.length > 0) {
    toFlush.push(...session.pendingChunks.splice(0));
  }
  const initialData = Buffer.concat(toFlush);
  console.log(`[Relay-${session.id}] Flushing ${toFlush.length} chunks (${(initialData.length / 1024).toFixed(0)}KB) to stdin`);

  try {
    proc.stdin!.write(initialData);
  } catch (e: any) {
    console.error(`[Relay-${session.id}] stdin write error:`, e.message);
  }

  // ── Stderr handler ──────────────────────────────────────────────────────────
  proc.stderr!.on("data", (d: Buffer) => {
    const line = d.toString();
    stderrBuf = (stderrBuf + line).slice(-4000);

    if (Date.now() - spawnedAt < 20000) {
      const t = line.trim();
      if (t && !t.includes("fps=") && !t.includes("size=") && !t.includes("bitrate=")) {
        console.log(`[Relay-${session.id}] FFmpeg[${attempt}]: ${t.slice(0, 240)}`);
      }
    }

    if (!session.encodingStarted && (line.includes("fps=") || line.includes("frame=") || line.includes("size="))) {
      session.encodingStarted = true;
      session.restartCount = 0;
      const elapsed = Date.now() - spawnedAt;
      console.log(`[Relay-${session.id}] ✅ Encoding confirmed (attempt ${attempt}, ${elapsed}ms)`);
      if (!session.firstEncodingConfirmed) {
        session.firstEncodingConfirmed = true;
        safeSend(session.ws, { type: "stream_started", message: "🔴 LIVE — encoding and streaming to RTMP" });
      }
    }

    if (line.includes("fps=") || line.includes("bitrate=")) {
      const fpsM = line.match(/fps=\s*([\d.]+)/);
      const bpsM = line.match(/bitrate=\s*([\d.]+kbits\/s)/);
      const spdM = line.match(/speed=\s*([\d.]+x)/);
      if (fpsM || bpsM) {
        safeSend(session.ws, {
          type: "ffmpeg_progress",
          fps: fpsM?.[1] ?? "0",
          bitrate: bpsM?.[1] ?? "0kbits/s",
          speed: spdM?.[1] ?? "1x",
        });
      }
    }

    const lower = line.toLowerCase();
    if (lower.includes("403") || lower.includes("forbidden") || lower.includes("badauth") || lower.includes("netstream.failed")) {
      console.error(`[Relay-${session.id}] RTMP auth rejected`);
      safeSend(session.ws, { type: "error", message: "❌ Stream key rejected. Get a fresh key from your Restream dashboard." });
      session.restartCount = 9999;
    } else if (lower.includes("connection refused") || lower.includes("no route to host") || lower.includes("name or service not known")) {
      safeSend(session.ws, { type: "error", message: "❌ Cannot reach RTMP server. Check your RTMP URL." });
    }
  });

  proc.stdin!.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code !== "EPIPE") {
      console.error(`[Relay-${session.id}] stdin error: ${e.code} ${e.message}`);
    }
  });

  // ── Close handler ───────────────────────────────────────────────────────────
  proc.on("close", (code: number | null) => {
    const elapsed = Date.now() - spawnedAt;
    console.log(`[Relay-${session.id}] FFmpeg[${attempt}] exit code=${code} after ${elapsed}ms encoded=${session.encodingStarted}`);
    session.ffmpeg = null;
    session.isLive = false;

    if (!sessions.has(session.id)) return;
    if (session.restartCount >= 9999) return;
    if (session.restartCount >= 8) {
      try { fs.writeFileSync("/tmp/jjstream-debug-ffmpeg.log", stderrBuf); } catch {}
      safeSend(session.ws, { type: "error", message: "Stream failed repeatedly. Verify your stream key on Restream, then click Go Live again." });
      cleanupSession(session);
      return;
    }

    if (!session.encodingStarted) {
      try { fs.writeFileSync("/tmp/jjstream-debug-ffmpeg.log", stderrBuf); } catch {}
      console.error(`[Relay-${session.id}] Pre-encode fail stderr:\n${stderrBuf.slice(-800)}`);

      const lower = stderrBuf.toLowerCase();
      let hint: string;
      if (lower.includes("403") || lower.includes("forbidden") || lower.includes("badauth")) {
        hint = "❌ Stream key rejected. Get a fresh key from Restream dashboard.";
      } else if (lower.includes("libx264") || lower.includes("encoder not found")) {
        hint = "❌ H.264 encoder missing on server.";
      } else if (lower.includes("connection refused") || lower.includes("eof") || lower.includes("refused") || lower.includes("timeout")) {
        hint = "❌ Cannot connect to Restream. Check your stream key.";
      } else if (lower.includes("ebml") || lower.includes("invalid data") || lower.includes("moov atom") || lower.includes("no such file")) {
        hint = `❌ Video format error (attempt ${attempt}). Retrying…`;
      } else {
        hint = `❌ Encode error (attempt ${attempt}): ${stderrBuf.slice(-200).replace(/\n/g, " ")}`;
      }
      session.restartCount++;
      safeSend(session.ws, { type: "stream_recovering", message: hint });

      // Restart after 1s — pending chunks will have accumulated
      setTimeout(() => {
        if (!sessions.has(session.id)) return;
        if (session.pendingChunks.length === 0) {
          // Wait for more data
          const wait = () => {
            if (!sessions.has(session.id)) return;
            if (session.pendingChunks.length >= 2) spawnFFmpegPipe(session);
            else setTimeout(wait, 500);
          };
          setTimeout(wait, 500);
        } else {
          spawnFFmpegPipe(session);
        }
      }, 1000);
      return;
    }

    // Normal exit after encoding — restart immediately with pending chunks
    if (session.pendingChunks.length > 0) {
      setImmediate(() => {
        if (sessions.has(session.id) && session.ws.readyState === WebSocket.OPEN) {
          spawnFFmpegPipe(session);
        }
      });
    }
  });

  proc.on("error", (e: Error) => {
    const msg = (e as NodeJS.ErrnoException).code === "ENOENT"
      ? "❌ FFmpeg binary not found on server."
      : `❌ FFmpeg process error: ${e.message}`;
    console.error(`[Relay-${session.id}]`, msg);
    safeSend(session.ws, { type: "error", message: msg });
  });
}

// ─── Session cleanup ──────────────────────────────────────────────────────────
function cleanupSession(session: RelaySession): void {
  if (session.watchdog) { clearInterval(session.watchdog); session.watchdog = null; }
  if (session.cleanupTimer) { clearTimeout(session.cleanupTimer); session.cleanupTimer = null; }
  if (session.ffmpeg) {
    try { session.ffmpeg.stdin?.destroy(); } catch {}
    session.ffmpeg.removeAllListeners("close");
    try { session.ffmpeg.kill("SIGKILL"); } catch {}
    session.ffmpeg = null;
  }
  try { fs.rmSync(session.workDir, { recursive: true, force: true }); } catch {}
  sessions.delete(session.id);
  console.log(`[Relay-${session.id}] Session cleaned up`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function safeSend(ws: WebSocket, data: object): void {
  try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); } catch {}
}
function maskKey(url: string): string {
  return url ? url.replace(/\/[^/]+$/, "/***KEY***") : "none";
}

// ─── WebSocket server ─────────────────────────────────────────────────────────
let wss: WebSocketServer | null = null;

export function getStreamWss(): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const workDir = path.join(os.tmpdir(), `jjstream_${id}`);
      try { fs.mkdirSync(workDir, { recursive: true }); }
      catch (e: any) { console.error(`[Relay-${id}] mkdirSync failed:`, e.message); ws.close(1011); return; }

      console.log(`[Relay-${id}] ✅ WS connected from ${req.socket.remoteAddress}`);

      const session: RelaySession = {
        id, ws, workDir,
        rtmpUrl: "", resolution: "1280x720",
        initChunk: null,
        pendingChunks: [],
        totalChunks: 0,
        pipeStarted: false,
        ffmpeg: null,
        isLive: false,
        encodingStarted: false,
        restartCount: 0,
        firstEncodingConfirmed: false,
        videoBitrate: "2500k",
        audioBitrate: "128k",
        fps: 30,
        initialized: false,
        startTime: Date.now(),
        lastChunkMs: Date.now(),
        watchdog: null,
        cleanupTimer: null,
      };
      sessions.set(id, session);
      safeSend(ws, { type: "connected", sessionId: id, architecture: "stdin-pipe-v7" });

      const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); else clearInterval(ping); }, 25000);
      ws.on("pong", () => {});

      session.watchdog = setInterval(() => {
        if (!session.firstEncodingConfirmed) return;
        const stale = Date.now() - session.lastChunkMs;
        if (stale > 30000) safeSend(ws, { type: "warning", message: `No video data for ${Math.round(stale / 1000)}s — screen share may have paused.` });
      }, 15000);

      ws.on("message", (data: Buffer, isBinary: boolean) => {
        try {
          if (!isBinary) {
            // ── JSON control message ─────────────────────────────────────────
            let msg: any;
            try { msg = JSON.parse(data.toString()); } catch { return; }

            if (msg.type === "init") {
              const base = (msg.rtmpUrl ?? "").replace(/\/$/, "");
              const key = (msg.streamKey ?? "").trim();
              if (!key) { safeSend(ws, { type: "error", message: "Stream key is required" }); return; }
              session.rtmpUrl = `${base}/${key}`;
              session.videoBitrate = msg.videoBitrate || "2500k";
              session.audioBitrate = msg.audioBitrate || "128k";
              session.fps = parseInt(msg.fps) || 30;
              session.resolution = msg.resolution || "1280x720";
              session.initialized = true;
              console.log(`[Relay-${id}] Init: ${maskKey(session.rtmpUrl)} | ${session.videoBitrate} ${session.audioBitrate} ${session.fps}fps ${session.resolution}`);
              safeSend(ws, { type: "stream_buffering", message: "Relay ready — waiting for video stream…" });
            }

            else if (msg.type === "ping") {
              safeSend(ws, { type: "pong", timestamp: Date.now() });
            }

            else if (msg.type === "bitrate_update") {
              session.videoBitrate = msg.videoBitrate || session.videoBitrate;
              session.audioBitrate = msg.audioBitrate || session.audioBitrate;
              session.fps = parseInt(msg.fps) || session.fps;
              if (session.ffmpeg) {
                try { session.ffmpeg.stdin?.destroy(); } catch {}
                session.ffmpeg.removeAllListeners("close");
                try { session.ffmpeg.kill("SIGKILL"); } catch {}
                session.ffmpeg = null;
                session.isLive = false;
              }
              session.pipeStarted = false;
              session.restartCount = 0;
              safeSend(ws, { type: "bitrate_updated", videoBitrate: session.videoBitrate });
            }

          } else {
            // ── Binary: 1-second WebM chunk from MediaRecorder ───────────────
            if (!session.initialized) return;
            if (data.length < 50) return;

            session.totalChunks++;
            session.lastChunkMs = Date.now();
            const chunkBuf = Buffer.from(data);

            // Chunk 0 = EBML header + tracks — save as initChunk for restarts
            if (session.totalChunks === 1) {
              if (isValidEBML(chunkBuf)) {
                console.log(`[Relay-${id}] ✅ Chunk 0 valid EBML (${(chunkBuf.length / 1024).toFixed(0)}KB)`);
              } else {
                console.error(`[Relay-${id}] ❌ Chunk 0 bad EBML — got 0x${chunkBuf.subarray(0, 4).toString("hex")} (${(chunkBuf.length / 1024).toFixed(0)}KB)`);
              }
              session.initChunk = chunkBuf;
              // Save for debug
              try { fs.writeFileSync("/tmp/jjstream-debug-chunk0.webm", chunkBuf); } catch {}
            }

            const FIRST_BATCH_MIN = 5;

            if (!session.ffmpeg) {
              // Buffer until we have enough initial data
              session.pendingChunks.push(chunkBuf);
              console.log(`[Relay-${id}] Chunk ${session.totalChunks} (${(chunkBuf.length / 1024).toFixed(1)}KB) pending=${session.pendingChunks.length}`);

              if (!session.pipeStarted) {
                if (session.pendingChunks.length >= FIRST_BATCH_MIN) {
                  safeSend(ws, { type: "stream_buffering", message: "Starting encoder — connecting to Restream…" });
                  session.pipeStarted = true;
                  spawnFFmpegPipe(session);
                } else {
                  safeSend(ws, { type: "stream_buffering", message: `Buffering… ${session.pendingChunks.length}/${FIRST_BATCH_MIN} seconds ready` });
                }
              }
            } else {
              // FFmpeg is running — write directly to stdin
              try {
                if (session.ffmpeg.stdin && !session.ffmpeg.stdin.destroyed) {
                  session.ffmpeg.stdin.write(chunkBuf);
                  console.log(`[Relay-${id}] Piped chunk ${session.totalChunks} (${(chunkBuf.length / 1024).toFixed(1)}KB) → stdin`);
                }
              } catch (e: any) {
                if (e.code !== "EPIPE") {
                  console.error(`[Relay-${id}] stdin write chunk error:`, e.message);
                }
                // On EPIPE, FFmpeg is dying — the close handler will restart
                session.pendingChunks.push(chunkBuf);
              }
            }

            safeSend(ws, { type: "segment_ack", chunk: session.totalChunks });
          }
        } catch (e: any) {
          console.error(`[Relay-${id}] Handler error:`, e.message);
        }
      });

      ws.on("close", (code: number) => {
        console.log(`[Relay-${id}] WS close code=${code}`);
        clearInterval(ping);
        if (code === 1000) {
          cleanupSession(session);
        } else {
          if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
          session.cleanupTimer = setTimeout(() => cleanupSession(session), 8000);
        }
      });

      ws.on("error", (e: Error) => {
        console.error(`[Relay-${id}] WS error:`, e.message);
        clearInterval(ping);
      });
    });
  }
  return wss;
}

// ─── HTTP routes ──────────────────────────────────────────────────────────────
const router = Router();

router.post("/speed-test", (req, res) => {
  req.resume();
  req.on("end", () => res.json({ ok: true, serverTime: Date.now() }));
});

router.get("/health", (_req, res) => {
  exec(`"${FFMPEG_BIN}" -encoders 2>&1`, (err, stdout) => {
    res.json({
      status: "online",
      architecture: "stdin-pipe-v7",
      activeSessions: sessions.size,
      ffmpegAvailable: !err,
      libx264Available: !err && stdout.includes("libx264"),
      ffmpegBin: FFMPEG_BIN,
      environment: process.env.NODE_ENV ?? "development",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      sessions: Array.from(sessions.values()).map(s => ({
        id: s.id,
        isLive: s.isLive,
        encodingStarted: s.encodingStarted,
        firstEncodingConfirmed: s.firstEncodingConfirmed,
        restarts: s.restartCount,
        totalChunks: s.totalChunks,
        pending: s.pendingChunks.length,
        pipeStarted: s.pipeStarted,
      })),
    });
  });
});

router.get("/status", (_req, res) => {
  res.json({
    sessions: Array.from(sessions.values()).map(s => ({
      id: s.id,
      isLive: s.isLive,
      restarts: s.restartCount,
      rtmpUrl: maskKey(s.rtmpUrl),
      totalChunks: s.totalChunks,
      pending: s.pendingChunks.length,
    })),
  });
});

export function handleStreamUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  getStreamWss().handleUpgrade(req, socket, head, (ws) => {
    getStreamWss().emit("connection", ws, req);
  });
}

export default router;
