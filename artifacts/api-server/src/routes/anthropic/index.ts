import { Router, type IRouter, type Request } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { eq, desc } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import {
  CreateAnthropicConversationBody,
  GetAnthropicConversationParams,
  DeleteAnthropicConversationParams,
  ListAnthropicMessagesParams,
  SendAnthropicMessageParams,
  SendAnthropicMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ── Multi-provider AI abstraction ─────────────────────────────────────────────

type AIProvider =
  | { type: "openai-compat"; baseUrl: string; apiKey: string; model: string; name: string; extraHeaders?: Record<string, string> }
  | { type: "anthropic"; client: Anthropic; hasWebSearch: boolean; name: string };

function getProvider(req: Request): AIProvider | null {
  // Priority 1 — Replit free integration (always works, no key needed)
  const integrationKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (integrationKey && integrationBaseUrl) return {
    type: "anthropic",
    client: new Anthropic({ apiKey: integrationKey, baseURL: integrationBaseUrl }),
    hasWebSearch: false,
    name: "Replit Free AI (Claude)",
  };

  // Priority 2 — User's Grok (xAI) key
  const grokKey = (req.headers["x-grok-key"] as string) || "";
  if (grokKey) return {
    type: "openai-compat",
    baseUrl: "https://api.x.ai/v1",
    apiKey: grokKey,
    model: "grok-3-mini",
    name: "Grok (xAI)",
    extraHeaders: { "X-Title": "JJ NEXUS PRO" },
  };

  // Priority 3 — User's Groq key
  const groqKey = (req.headers["x-groq-key"] as string) || "";
  if (groqKey) return {
    type: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: groqKey,
    model: "llama-3.3-70b-versatile",
    name: "Groq (Llama 3.3 70B)",
  };

  // Priority 4 — User's own Anthropic key
  const userAnthropicKey = (req.headers["x-anthropic-key"] as string) || "";
  if (userAnthropicKey) return {
    type: "anthropic",
    client: new Anthropic({ apiKey: userAnthropicKey }),
    hasWebSearch: true,
    name: "Anthropic Claude (your key)",
  };

  // Priority 5 — OpenRouter
  const openrouterKey = (req.headers["x-openrouter-key"] as string) || "";
  if (openrouterKey) return {
    type: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: openrouterKey,
    model: "meta-llama/llama-3.3-70b-instruct:free",
    name: "OpenRouter (Llama 3.3 Free)",
    extraHeaders: { "HTTP-Referer": "https://jjnexuspro.app", "X-Title": "JJ NEXUS PRO" },
  };

  // Priority 6 — GitHub Models token
  const githubToken = (req.headers["x-github-token"] as string) || "";
  if (githubToken) return {
    type: "openai-compat",
    baseUrl: "https://models.inference.ai.azure.com",
    apiKey: githubToken,
    model: "meta-llama/Llama-3.3-70B-Instruct",
    name: "GitHub Models (Llama 3.3)",
  };

  // Priority 7 — Server-side GROQ_API_KEY env var (set in Replit Secrets)
  const serverGroqKey = process.env.GROQ_API_KEY || "";
  if (serverGroqKey) return {
    type: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: serverGroqKey,
    model: "llama-3.3-70b-versatile",
    name: "Groq (Llama 3.3 70B)",
  };

  return null;
}

function isCreditError(e: any): boolean {
  const msg = (e?.message || "").toLowerCase();
  return msg.includes("credit") || msg.includes("billing") || msg.includes("insufficient") || msg.includes("quota");
}

function isRateLimitError(e: any): boolean {
  const msg = (e?.message || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("429") || msg.includes("tokens per") || msg.includes("tpd") || msg.includes("tpm");
}

const GROQ_MODELS_CHAT = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

async function* streamGroqWithFallback(
  apiKey: string,
  messages: { role: string; content: string }[]
) {
  for (const model of GROQ_MODELS_CHAT) {
    let gotContent = false;
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: 8000, stream: true, temperature: 0.7 }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as any;
        const errMsg = err.error?.message || `API error ${response.status}`;
        if (response.status === 429 || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("tpd")) continue;
        throw new Error(errMsg);
      }
      const body = response.body as unknown as AsyncIterable<Uint8Array>;
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              const text = data.choices?.[0]?.delta?.content;
              if (text) { gotContent = true; yield text as string; }
            } catch {}
          }
        }
      }
      if (gotContent) return;
    } catch (e: any) {
      if (isRateLimitError(e) || (e.message || "").includes("tpd")) continue;
      throw e;
    }
  }
  throw new Error("All Groq models rate limited — try again later");
}

// ── OpenAI-compatible streaming ───────────────────────────────────────────────

async function* streamOpenAICompat(
  provider: Extract<AIProvider, { type: "openai-compat" }>,
  messages: { role: string; content: string }[]
) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: 8000,
      stream: true,
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as any;
    throw new Error(err.error?.message || `API error ${response.status}`);
  }
  const body = response.body as unknown as AsyncIterable<Uint8Array>;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.choices?.[0]?.delta?.content;
          if (text) yield text as string;
        } catch {}
      }
    }
  }
}

const TODAY = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const ALCHEMIST_SYSTEM = `You are Alchemist AI — the most elite Smart Money Concepts trading intelligence inside JJ NEXUS PRO. Today: ${TODAY}. XAUUSD gold is $4700+ in 2026. You are deeply trained in SMC/ICT: market structure (BOS/CHoCH/MSS), order blocks, fair value gaps, liquidity sweeps, kill zones, premium/discount zones. You have persistent memory of previous conversations with this user — reference past discussions when relevant, build on prior analysis, and provide continuity. Be professional, direct, and actionable. Always give specific price levels. Format responses in clean markdown. End every response: "— Alchemist AI | JJ NEXUS PRO"`;

const NO_AI_MSG = `⚠️ **AI Not Configured**

To enable the Alchemist AI chat, add a free **Groq API key** in **Settings → API & Keys**:
1. Go to **groq.com** → Sign up free (no credit card needed)
2. Create an API Key (starts with \`gsk_...\`)
3. Paste it in Settings → Groq API Key

Groq is completely free with 14,400 requests/day.

— Alchemist AI | JJ NEXUS PRO`;

// ── CRUD ──────────────────────────────────────────────────────────────────────

router.get("/conversations", async (_req, res) => {
  const all = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
  res.json(all);
});

router.post("/conversations", async (req, res) => {
  const body = CreateAnthropicConversationBody.parse(req.body);
  const [created] = await db.insert(conversations).values({ title: body.title }).returning();
  res.status(201).json(created);
});

router.get("/conversations/:id", async (req, res) => {
  const { id } = GetAnthropicConversationParams.parse(req.params);
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id));
  res.json({ ...conv, messages: msgs });
});

router.delete("/conversations/:id", async (req, res) => {
  const { id } = DeleteAnthropicConversationParams.parse(req.params);
  const deleted = await db.delete(conversations).where(eq(conversations.id, id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.status(204).send();
});

router.get("/conversations/:id/messages", async (req, res) => {
  const { id } = ListAnthropicMessagesParams.parse(req.params);
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id));
  res.json(msgs);
});

// ── Send message — all providers ──────────────────────────────────────────────

router.post("/conversations/:id/messages", async (req, res) => {
  const { id } = SendAnthropicMessageParams.parse(req.params);
  const body = SendAnthropicMessageBody.parse(req.body);

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  await db.insert(messages).values({ conversationId: id, role: "user", content: body.content });

  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id));
  const chatHistory = allMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const provider = getProvider(req);

  if (!provider) {
    res.write(`data: ${JSON.stringify({ content: NO_AI_MSG })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  let fullResponse = "";

  try {
    if (provider.type === "openai-compat") {
      const msgs = [{ role: "system", content: ALCHEMIST_SYSTEM }, ...chatHistory];
      // Use Groq fallback chain for rate limit resilience
      const streamFn = provider.baseUrl.includes("groq.com")
        ? streamGroqWithFallback(provider.apiKey, msgs)
        : streamOpenAICompat(provider, msgs);
      for await (const text of streamFn) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    } else {
      const stream = await provider.client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: ALCHEMIST_SYSTEM,
        messages: chatHistory as any,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
          res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
        }
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse || NO_AI_MSG });
  } catch (err: any) {
    const errorMsg = isCreditError(err)
      ? NO_AI_MSG
      : `\n\n⚠️ **${provider.name} error:** ${err.message}`;
    res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
    if (!fullResponse) {
      await db.insert(messages).values({ conversationId: id, role: "assistant", content: errorMsg }).catch(() => {});
    }
  }

  res.write(`data: ${JSON.stringify({ done: true, provider: provider.name })}\n\n`);
  res.end();
});

export default router;
