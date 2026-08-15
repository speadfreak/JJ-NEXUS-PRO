import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { handleStreamUpgrade } from "./routes/stream/index";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// Handle WebSocket upgrades — the stream relay lives at /api/stream/ws
server.on("upgrade", (req: http.IncomingMessage, socket: any, head: Buffer) => {
  const url = req.url ?? "";
  if (url.startsWith("/api/stream/ws")) {
    handleStreamUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening — backend + frontend + WebSocket relay on one port");
  logger.info({ port }, "Stream relay: /api/stream/ws | Health: /api/healthz");
});

// ── Production keep-warm ping ────────────────────────────────────────────────
// Replit Autoscale suspends idle instances after ~5 min of inactivity.
// A sleeping instance drops WebSocket connections before the user sees any error.
// Pinging localhost every 4 minutes keeps the process alive between streams.
// For belt-and-suspenders coverage, also add an external UptimeRobot monitor
// pointing to https://yourapp.replit.app/api/healthz every 5 minutes.
if (process.env.NODE_ENV === "production") {
  const keepWarmUrl = `http://localhost:${port}/api/healthz`;
  logger.info({ keepWarmUrl }, "Keep-warm ping enabled — polling every 4 min to prevent cold-sleep");
  setInterval(() => {
    fetch(keepWarmUrl, { signal: AbortSignal.timeout(8000) })
      .catch(() => { /* best-effort — silence failures */ });
  }, 4 * 60 * 1000);
}
