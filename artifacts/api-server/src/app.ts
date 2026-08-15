import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production: serve the pre-built frontend from this same Express server.
// This means ONE port handles everything: API routes, WebSocket upgrades (/api/stream/ws),
// and the React SPA. No Vite proxy needed — the browser WebSocket URL resolves correctly.
if (process.env.NODE_ENV === "production") {
  // Frontend is built into ethiostream-pro/dist/public (Replit artifact convention)
  const frontendDist = path.join(__dirname, "../../ethiostream-pro/dist/public");
  logger.info({ frontendDist }, "Serving frontend static files");

  app.use(express.static(frontendDist, { maxAge: "1d", index: false }));

  // SPA fallback — all non-API routes return index.html (Express 5 syntax)
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
