import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../lib/logger";
import { ALCHEMIST_SYSTEM_PROMPT, generateTrainingDataset } from "../../lib/generateTrainingDataset";

const router = Router();
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
const startedAt = Date.now();
type DatasetJob = { status: "generating" | "complete" | "error"; estimatedExamples: number; progress: number; startedAt: string; completedAt?: string; error?: string };
let datasetJob: DatasetJob = { status: "complete", estimatedExamples: 2500, progress: 100, startedAt: new Date().toISOString() };

function validMessages(value: unknown): value is ChatMessage[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 40 && value.every(item => {
    if (!item || typeof item !== "object") return false;
    const message = item as Record<string, unknown>;
    return ["system", "user", "assistant"].includes(String(message.role)) && typeof message.content === "string" && message.content.length <= 20_000;
  });
}

async function callAlchemist(messages: ChatMessage[], temperature: number, maxTokens: number, timeoutMs = 30_000): Promise<string> {
  const baseUrl = process.env.ALCHEMIST_API_URL;
  if (!baseUrl) throw new Error("ALCHEMIST_API_URL is not configured");
  const endpoint = baseUrl.endsWith("/generate") ? baseUrl : `${baseUrl.replace(/\/$/, "")}/generate`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.ALCHEMIST_API_KEY ? { Authorization: `Bearer ${process.env.ALCHEMIST_API_KEY}` } : {}) },
    body: JSON.stringify({ messages, temperature, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Alchemist endpoint returned ${response.status}`);
  const payload = await response.json() as { response?: string; generated_text?: string; text?: string };
  const text = payload.response ?? payload.generated_text ?? payload.text;
  if (!text) throw new Error("Alchemist endpoint returned no text");
  return text;
}

async function callClaude(messages: ChatMessage[], temperature: number, maxTokens: number): Promise<string> {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey) throw new Error("Claude fallback is not configured");
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const systemMessage = messages.find(message => message.role === "system")?.content ?? ALCHEMIST_SYSTEM_PROMPT;
  const history = messages.filter(message => message.role !== "system").map(message => ({ role: message.role as "user" | "assistant", content: message.content }));
  const result = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: maxTokens, temperature, system: systemMessage, messages: history });
  return result.content.filter(block => block.type === "text").map(block => block.text).join("");
}

function responseMeta(started: number, model: string, fallback = false) {
  const latencyMs = Math.round(performance.now() - started);
  return { model, fallback, latency_ms: latencyMs, latency: latencyMs };
}

router.post("/chat", async (req, res) => {
  const started = performance.now();
  const body = req.body as { messages?: unknown; model?: unknown; temperature?: unknown; maxTokens?: unknown };
  if (!validMessages(body.messages)) {
    res.status(400).json({ error: "messages must be a non-empty array of role/content objects" });
    return;
  }
  const requestedModel = body.model === "claude" ? "claude" : "alchemist";
  const temperature = typeof body.temperature === "number" ? Math.min(1, Math.max(0, body.temperature)) : 0.35;
  const maxTokens = typeof body.maxTokens === "number" ? Math.min(4096, Math.max(128, Math.floor(body.maxTokens))) : 1200;
  try {
    const response = requestedModel === "claude" ? await callClaude(body.messages, temperature, maxTokens) : await callAlchemist(body.messages, temperature, maxTokens);
    res.json({ response, ...responseMeta(started, requestedModel) });
  } catch (error) {
    if (requestedModel === "alchemist") {
      logger.warn({ err: error }, "Alchemist endpoint unavailable; using Claude fallback");
      try {
        const response = await callClaude(body.messages, temperature, maxTokens);
        res.json({ response, ...responseMeta(started, "claude", true) });
        return;
      } catch (fallbackError) {
        logger.error({ err: fallbackError }, "Alchemist and Claude fallback failed");
      }
    }
    res.status(502).json({ error: "AI provider unavailable", ...responseMeta(started, requestedModel, requestedModel === "alchemist") });
  }
});

router.get("/status", async (_req, res) => {
  const started = performance.now();
  const baseUrl = process.env.ALCHEMIST_API_URL;
  const modelVersion = process.env.ALCHEMIST_MODEL_VERSION ?? "alchemist-ai-v1";
  if (!baseUrl) {
    const alchemist = { status: "offline", model_version: modelVersion, modelVersion, model_name: "alchemist", queue_depth: 0, uptime: `${Math.floor((Date.now() - startedAt) / 1000)}s`, last_error: "ALCHEMIST_API_URL is not configured" };
    res.json({ alchemist, ...alchemist, ...responseMeta(started, "alchemist") });
    return;
  }
  try {
    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const healthUrl = normalizedBaseUrl.endsWith("/health")
      ? normalizedBaseUrl
      : `${normalizedBaseUrl.replace(/\/generate\/?$/, "")}/health`;
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) });
    const payload = await response.json().catch(() => ({})) as { status?: string; model_loaded?: boolean; model_name?: string; model_version?: string; modelVersion?: string; queue_depth?: number };
    const status = response.ok && (payload.status === "ok" || payload.status === "online") ? "online" : "degraded";
    const alchemist = {
      status,
      model_loaded: payload.model_loaded ?? false,
      model_name: payload.model_name ?? "alchemist",
      model_version: payload.model_version ?? payload.modelVersion ?? modelVersion,
      modelVersion: payload.modelVersion ?? payload.model_version ?? modelVersion,
      queue_depth: payload.queue_depth ?? 0,
      uptime: `${Math.floor((Date.now() - startedAt) / 1000)}s`,
      last_health_check: new Date().toISOString(),
    };
    res.json({ alchemist, ...alchemist, ...responseMeta(started, "alchemist") });
  } catch (error) {
    const alchemist = { status: "offline", model_loaded: false, model_name: "alchemist", model_version: modelVersion, modelVersion, queue_depth: 0, uptime: `${Math.floor((Date.now() - startedAt) / 1000)}s`, last_error: "Health check failed" };
    res.json({ alchemist, ...alchemist, ...responseMeta(started, "alchemist") });
  }
});

router.get("/dataset/status", (_req, res) => {
  res.json(datasetJob);
});

router.post("/dataset/generate", (_req, res) => {
  if (datasetJob.status === "generating") {
    res.status(202).json(datasetJob);
    return;
  }
  datasetJob = { status: "generating", estimatedExamples: 2500, progress: 0, startedAt: new Date().toISOString() };
  void generateTrainingDataset()
    .then(result => {
      datasetJob = { ...datasetJob, status: "complete", progress: 100, estimatedExamples: result.examples, completedAt: new Date().toISOString() };
      logger.info({ examples: result.examples }, "Alchemist training dataset generated");
    })
    .catch(error => {
      datasetJob = { ...datasetJob, status: "error", error: error instanceof Error ? error.message : "Dataset generation failed", completedAt: new Date().toISOString() };
      logger.error({ err: error }, "Alchemist training dataset generation failed");
    });
  res.status(202).json(datasetJob);
});

export default router;