#!/usr/bin/env node
/**
 * JJ NEXUS PRO — Cloud Control Server
 * Runs inside the Codespace on port 7821.
 * The webapp connects here to start/stop streaming and navigate Chrome.
 *
 * Zero npm dependencies — only Node.js built-ins.
 */

'use strict';
const http  = require('http');
const cp    = require('child_process');
const fs    = require('fs');
const path  = require('path');

const PORT    = 7821;
const LOGDIR  = '/tmp/jjnexus/logs';
const PIDFILE = '/tmp/jjnexus/stream.pid';
const CONFIG  = path.resolve('.devcontainer/stream-config.json');

fs.mkdirSync(LOGDIR, { recursive: true });
fs.mkdirSync('/tmp/jjnexus', { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(res, data, status = 200) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function isStreaming() {
  try {
    const pid = fs.readFileSync(PIDFILE, 'utf8').trim();
    cp.execSync(`kill -0 ${pid}`, { stdio: 'ignore' });
    return parseInt(pid, 10);
  } catch { return 0; }
}

function streamUptimeSecs() {
  try {
    const stat = fs.statSync(PIDFILE);
    return Math.floor((Date.now() - stat.mtimeMs) / 1000);
  } catch { return 0; }
}

function cpuLoad() {
  try { return fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0]; } catch { return '?'; }
}

// ── SSE log broadcast ─────────────────────────────────────────────────────────

const sseClients = new Set();

function broadcast(line) {
  const frame = `data: ${JSON.stringify({ line, ts: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try { res.write(frame); } catch { sseClients.delete(res); }
  }
}

// Tail a file and broadcast new lines
function tailFile(filepath) {
  if (!fs.existsSync(filepath)) fs.writeFileSync(filepath, '');
  let pos = fs.statSync(filepath).size;
  setInterval(() => {
    try {
      const sz = fs.statSync(filepath).size;
      if (sz > pos) {
        const fd = fs.openSync(filepath, 'r');
        const buf = Buffer.alloc(sz - pos);
        fs.readSync(fd, buf, 0, buf.length, pos);
        fs.closeSync(fd);
        pos = sz;
        buf.toString().split('\n').filter(l => l.trim()).forEach(broadcast);
      } else if (sz < pos) {
        // file rotated / truncated
        pos = 0;
      }
    } catch {}
  }, 400);
}

// ── Chrome DevTools Protocol (CDP) navigation ────────────────────────────────
// Pure Node.js WebSocket client — no ws package needed.

function cdpNavigate(targetUrl) {
  return new Promise((resolve) => {
    // 1. Fetch the list of debuggable targets from Chrome
    const req = http.get('http://localhost:9222/json', (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        let page;
        try {
          const targets = JSON.parse(raw);
          page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        } catch {}

        if (!page) {
          broadcast(`⚠️  CDP: no page target found — Chrome may not have remote debugging enabled`);
          return resolve(false);
        }

        // 2. Open a WebSocket to the target and send Page.navigate
        const wsUrl = page.webSocketDebuggerUrl; // ws://localhost:9222/devtools/page/XXX
        const wsPath = wsUrl.replace(/^ws:\/\/[^/]+/, '');

        const wsReq = http.request({
          hostname : 'localhost',
          port     : 9222,
          path     : wsPath,
          headers  : {
            'Upgrade'               : 'websocket',
            'Connection'            : 'Upgrade',
            'Sec-WebSocket-Key'     : Buffer.from('jjnexuspro-ctrl').toString('base64'),
            'Sec-WebSocket-Version' : '13',
            'Host'                  : 'localhost:9222',
          },
        });

        wsReq.on('upgrade', (_res, socket) => {
          const msg = JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: targetUrl } });
          const payload = Buffer.from(msg, 'utf8');

          if (payload.length > 125) {
            // 2-byte extended length frame (max 65535 bytes — more than enough)
            const frame = Buffer.alloc(8 + payload.length);
            frame[0] = 0x81;                      // FIN + text opcode
            frame[1] = 0x80 | 126;                // MASK + 16-bit length indicator
            frame.writeUInt16BE(payload.length, 2);
            // mask = 0x00000000
            for (let i = 0; i < payload.length; i++) frame[8 + i] = payload[i];
            socket.write(frame);
          } else {
            const frame = Buffer.alloc(6 + payload.length);
            frame[0] = 0x81;
            frame[1] = 0x80 | payload.length;
            // mask = 0x00000000 (bytes 2-5 stay zero)
            payload.copy(frame, 6);
            socket.write(frame);
          }

          setTimeout(() => { try { socket.destroy(); } catch {} resolve(true); }, 600);
        });

        wsReq.on('error', () => {
          broadcast('⚠️  CDP WebSocket failed — trying xdotool fallback');
          // xdotool fallback for non-kiosk Chrome
          cp.exec(
            `DISPLAY=:99 xdotool search --class "Google-chrome" key ctrl+l 2>/dev/null && sleep 0.3 && DISPLAY=:99 xdotool type --clearmodifiers "${targetUrl}" && DISPLAY=:99 xdotool key Return`,
            () => resolve(false)
          );
        });

        wsReq.end();
      });
    });
    req.on('error', () => {
      broadcast('⚠️  Chrome remote debugging not responding on :9222');
      resolve(false);
    });
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // ── GET /api/status ──
  if (req.method === 'GET' && urlPath === '/api/status') {
    const pid = isStreaming();
    return json(res, {
      ok        : true,
      streaming : !!pid,
      pid,
      uptime    : streamUptimeSecs(),
      cpu       : cpuLoad(),
      configOk  : fs.existsSync(CONFIG),
      serverTime: new Date().toISOString(),
    });
  }

  // ── GET /api/config ── returns full config (no stream key)
  if (req.method === 'GET' && urlPath === '/api/config') {
    if (!fs.existsSync(CONFIG)) return json(res, { ok: false, error: 'No config file' }, 404);
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
      return json(res, {
        ok: true,
        jjnexusUrl   : cfg.jjnexusUrl,
        resolution   : cfg.resolution   || '1280x720',
        fps          : cfg.fps          || '24',
        videoBitrate : cfg.videoBitrate || '2500k',
        audioBitrate : cfg.audioBitrate || '128k',
      });
    } catch (e) {
      return json(res, { ok: false, error: String(e) }, 500);
    }
  }

  // ── POST /api/config ── update resolution / fps / bitrate from the webapp
  // Stream key is intentionally NOT writable via this endpoint.
  if (req.method === 'POST' && urlPath === '/api/config') {
    if (!fs.existsSync(CONFIG)) return json(res, { ok: false, error: 'No config file — run configure.sh first' }, 404);
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const updates = JSON.parse(body);
        const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
        // Only allow safe fields — never overwrite stream key or RTMP URL
        const allowed = ['resolution', 'fps', 'videoBitrate', 'audioBitrate', 'jjnexusUrl'];
        for (const key of allowed) {
          if (updates[key] !== undefined) cfg[key] = String(updates[key]);
        }
        fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
        broadcast(`⚙️ Config updated: ${Object.keys(updates).filter(k => allowed.includes(k)).map(k => `${k}=${updates[k]}`).join(', ')} — restart stream to apply`);
        return json(res, { ok: true, config: { resolution: cfg.resolution, fps: cfg.fps, videoBitrate: cfg.videoBitrate, audioBitrate: cfg.audioBitrate } });
      } catch (e) {
        return json(res, { ok: false, error: String(e) }, 500);
      }
    });
    return;
  }

  // ── POST /api/start ──
  if (req.method === 'POST' && urlPath === '/api/start') {
    if (isStreaming()) return json(res, { ok: true, message: 'Already streaming', pid: isStreaming() });
    if (!fs.existsSync(CONFIG)) return json(res, { ok: false, error: 'No stream config — run configure.sh first' }, 400);

    const logFile = `${LOGDIR}/stable-stream.log`;
    const out     = fs.openSync(logFile, 'a');
    const proc    = cp.spawn('bash', ['.devcontainer/stable-stream.sh'], {
      detached: true,
      stdio   : ['ignore', out, out],
      cwd     : process.cwd(),
    });
    proc.unref();
    fs.writeFileSync(PIDFILE, String(proc.pid));
    broadcast(`▶ Stream started (PID ${proc.pid})`);
    return json(res, { ok: true, pid: proc.pid });
  }

  // ── POST /api/stop ──
  if (req.method === 'POST' && urlPath === '/api/stop') {
    // Step 1: write sentinel so stable-stream.sh loop exits cleanly on its next check
    try { fs.writeFileSync('/tmp/jjnexus/stop.flag', 'STOP'); } catch {}

    // Step 2: kill the entire process group by PGID (most reliable)
    let pgidKill = '';
    try {
      const pgid = fs.readFileSync('/tmp/jjnexus/stream.pgid', 'utf8').trim();
      if (pgid && parseInt(pgid, 10) > 1) {
        pgidKill = `kill -TERM -- -${pgid} 2>/dev/null; sleep 1; kill -9 -- -${pgid} 2>/dev/null;`;
      }
    } catch {}

    const stopCmd = [
      pgidKill,
      // Belt-and-suspenders: kill by name too
      'pkill -TERM -f "stable-stream.sh" 2>/dev/null || true',
      'pkill -TERM -f "ffmpeg" 2>/dev/null || true',
      'sleep 1',
      'pkill -9 -f "stable-stream.sh" 2>/dev/null || true',
      'pkill -9 -f "ffmpeg" 2>/dev/null || true',
      'pkill -9 -f "google-chrome" 2>/dev/null || true',
      // Clean up PID files
      'rm -f /tmp/jjnexus/stream.pid /tmp/jjnexus/stream.pgid',
      // Remove sentinel AFTER everything is dead so a restart doesn't re-read it
      'rm -f /tmp/jjnexus/stop.flag',
    ].filter(Boolean).join('; ');

    cp.exec(stopCmd, () => {
      try { fs.unlinkSync(PIDFILE); } catch {}
      broadcast('⏹ Stream FORCE-STOPPED — all processes killed');
      return json(res, { ok: true });
    });
    return;
  }

  // ── POST /api/restart-env ── re-runs autostart without killing stream
  if (req.method === 'POST' && urlPath === '/api/restart-env') {
    cp.exec('bash .devcontainer/autostart.sh >> /tmp/jjnexus/logs/autostart.log 2>&1 &', () => {});
    broadcast('🔄 Environment restart triggered');
    return json(res, { ok: true });
  }

  // ── POST /api/navigate  body: { url: "https://..." } ──
  if (req.method === 'POST' && urlPath === '/api/navigate') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { url: target } = JSON.parse(body);
        if (!target || typeof target !== 'string') return json(res, { ok: false, error: 'Missing url' }, 400);
        const ok = await cdpNavigate(target);
        broadcast(`🔀 Navigated cloud Chrome → ${target}`);
        return json(res, { ok });
      } catch (e) {
        return json(res, { ok: false, error: String(e) }, 500);
      }
    });
    return;
  }

  // ── GET /api/logs — Server-Sent Events ──
  if (req.method === 'GET' && urlPath === '/api/logs') {
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type'    : 'text/event-stream',
      'Cache-Control'   : 'no-cache',
      'Connection'      : 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send last 60 lines of existing log
    try {
      const logFile = `${LOGDIR}/stable-stream.log`;
      if (fs.existsSync(logFile)) {
        const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-60);
        for (const line of lines) {
          res.write(`data: ${JSON.stringify({ line, ts: Date.now() })}\n\n`);
        }
      }
    } catch {}

    res.write(`data: ${JSON.stringify({ line: '🟢 Log stream connected — watching for FFmpeg output', ts: Date.now() })}\n\n`);

    // Heartbeat every 20s so proxies don't close the connection
    const hb = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); }
    }, 20000);

    sseClients.add(res);
    req.on('close', () => { sseClients.delete(res); clearInterval(hb); });
    return;
  }

  // ── 404 ──
  res.writeHead(404, CORS_HEADERS);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ JJ NEXUS Cloud Control Server on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/status`);

  // Start tailing log files (create them first if missing)
  setTimeout(() => {
    for (const name of ['stable-stream.log', 'ffmpeg.log']) {
      const f = path.join(LOGDIR, name);
      tailFile(f);
    }
  }, 1500);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));
