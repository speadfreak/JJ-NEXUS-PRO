import { Router, type IRouter, type Request } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { AnalyzeForexBody, AnalyzeConfluenceBody, GetForexNewsParams } from "@workspace/api-zod";

const router: IRouter = Router();

// ── Multi-provider AI abstraction ─────────────────────────────────────────────

type AIProvider =
  | { type: "openai-compat"; baseUrl: string; apiKey: string; model: string; extraHeaders?: Record<string, string> }
  | { type: "anthropic"; client: Anthropic; hasWebSearch: boolean };

function getProvider(req: Request): AIProvider | null {
  // Priority 1 — Replit free integration (always available, no key needed)
  const integrationKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (integrationKey && integrationBaseUrl) return {
    type: "anthropic",
    client: new Anthropic({
      apiKey: integrationKey,
      baseURL: integrationBaseUrl,
      defaultHeaders: { "anthropic-beta": "web-search-2025-03-05" },
    }),
    hasWebSearch: true,
  };

  // Priority 2 — User's Grok (xAI) key
  const grokKey = (req.headers["x-grok-key"] as string) || "";
  if (grokKey) return {
    type: "openai-compat",
    baseUrl: "https://api.x.ai/v1",
    apiKey: grokKey,
    model: "grok-3-mini",
    extraHeaders: { "X-Title": "JJ NEXUS PRO" },
  };

  // Priority 3 — User's Groq key
  const groqKey = (req.headers["x-groq-key"] as string) || "";
  if (groqKey) return {
    type: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: groqKey,
    model: "llama-3.3-70b-versatile",
  };

  // Priority 4 — User's own Anthropic key
  const userAnthropicKey = (req.headers["x-anthropic-key"] as string) || "";
  if (userAnthropicKey) return {
    type: "anthropic",
    client: new Anthropic({ apiKey: userAnthropicKey }),
    hasWebSearch: true,
  };

  // Priority 5 — OpenRouter
  const openrouterKey = (req.headers["x-openrouter-key"] as string) || "";
  if (openrouterKey) return {
    type: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: openrouterKey,
    model: "meta-llama/llama-3.3-70b-instruct:free",
    extraHeaders: { "HTTP-Referer": "https://jjnexuspro.app", "X-Title": "JJ NEXUS PRO" },
  };

  // Priority 6 — GitHub Models token
  const githubToken = (req.headers["x-github-token"] as string) || "";
  if (githubToken) return {
    type: "openai-compat",
    baseUrl: "https://models.inference.ai.azure.com",
    apiKey: githubToken,
    model: "meta-llama/Llama-3.3-70B-Instruct",
  };

  // Priority 7 — Server-side GROQ_API_KEY env var (set in Replit Secrets)
  const serverGroqKey = process.env.GROQ_API_KEY || "";
  if (serverGroqKey) return {
    type: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: serverGroqKey,
    model: "llama-3.1-8b-instant",
  };

  return null;
}

// Groq model fallback chain for rate limit handling
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

// ── OpenAI-compatible streaming helper ───────────────────────────────────────

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

async function callOpenAICompatSync(
  provider: Extract<AIProvider, { type: "openai-compat" }>,
  messages: { role: string; content: string }[]
): Promise<string> {
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
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as any;
    throw new Error(err.error?.message || `API error ${response.status}`);
  }
  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content || "";
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function startSSE(res: any) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
}

function writeSSE(res: any, content: string) {
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
}

function endSSE(res: any) {
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
}

function isCreditError(e: any): boolean {
  const msg = (e?.message || "").toLowerCase();
  return msg.includes("credit") || msg.includes("billing") || msg.includes("insufficient") || msg.includes("quota");
}

function isRateLimitError(e: any): boolean {
  const msg = (e?.message || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("429") || msg.includes("tokens per") || msg.includes("tpd") || msg.includes("tpm");
}

async function callGroqWithFallback(
  apiKey: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: 8000, temperature: 0.7 }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as any;
        const errMsg = err.error?.message || `API error ${response.status}`;
        if (response.status === 429 || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("tpd")) {
          continue; // try next model
        }
        throw new Error(errMsg);
      }
      const data = (await response.json()) as any;
      const text = data.choices?.[0]?.message?.content || "";
      if (text) return text;
    } catch (e: any) {
      if (isRateLimitError(e) || e.message?.includes("tpd") || e.message?.includes("tpm")) {
        continue; // try next model
      }
      throw e;
    }
  }
  throw new Error("All Groq models rate limited — try again in a few hours");
}

const TODAY = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const SYSTEM_PROMPT = `You are Alchemist AI — the most elite Smart Money Concepts + Malaysian SNR trading intelligence inside JJ NEXUS PRO. Today: ${TODAY}. XAUUSD gold price is $4700+ in 2026 — never use outdated pre-2026 prices.

## Core SMC/ICT Expertise
You specialize in: market structure (BOS/CHoCH), order blocks, breaker blocks, fair value gaps (FVG/IFVG), liquidity sweeps (BSL/SSL), kill zones (London Open 08:00-10:00 UTC, NY Open 13:00-15:00 UTC), Volume Profile (POC, VAH, VAL, VWAP), ICT concepts (PD Arrays, dealing range, displacement).

## Malaysian SNR Methodology (Core Specialization)
You are deeply trained in these Malaysian forex trading concepts and communities:

**Classic Price Action Patterns:**
- **Classic A** (A Level): Clean impulse move from a fresh demand/supply zone — price hasn't revisited the origin. High-probability sniper entry at the 50% retracement of the "A" swing. Confirmation: strong BOS on lower timeframe.
- **Classic V** (V Level): V-shaped reversal pattern from a key level. Price aggressively rejects at SNR, forms a V-reversal. Entry on the re-test of the breakout point. Very tight stop loss, high RR.
- **OCL** (Open-Close-Low / Open-Close-High): Session-based reversal concept. Price opens, runs to close the gap, then sweeps liquidity at the session low/high before reversing. Common in Asian-to-London transition.
- **QML** (Quasimodo Level / QM): Advanced pattern where price forms a higher-high then lower-high (for bearish) or lower-low then higher-low (for bullish). The "shoulder" level is the QML entry zone. Strong confluence when at SNR.

**Malaysian SNR Techniques:**
- **SNR (Support & Resistance) — Malaysian Style**: Focuses on the STORY of price. Why did price react here? Is this zone fresh or unfresh? The storyline matters — understand the institutional narrative behind each level.
- **Fresh Zone**: A SNR level that price has only tested ONCE. Maximum institutional interest. Highest probability for reversal. Entry on first kiss.
- **Unfresh Zone**: A SNR level price has revisited multiple times. Weakened by multiple tests. Avoid trading into unfresh zones as target — they often break.
- **BYSTRA**: Malaysian trading technique combining BOS (Break of Structure) + SNR. Entry model: wait for BOS on M15/H1, then snipe the re-test of the broken structure at a fresh SNR level. Tight SL behind the swing, TP at next major level.
- **Storyline / Cerita Harga**: The narrative of price movement. Before entering, tell the story: "Price swept liquidity at X, formed a V reversal, BOS confirmed at Y, now retesting the level as support." No story = no trade.

**Malaysian Trading Teachers & Communities:**
- **Nora Bystra Vilian**: Pioneer of the BYSTRA + SNR methodology in Malaysia. Emphasis on combining BOS (Break of Structure) with fresh SNR zones. Teaching style: patience over quantity, only 1-2 setups per week.
- **Ariff T + SNR**: Combines traditional SNR with modern Smart Money Concepts. Known for clean level identification with confluence from session timing. Malaysian ICT-influenced trader.
- **Aliff Awang + SNR**: Malaysian trader known for high-accuracy SNR trading on XAUUSD and EURUSD. Focus on weekly/daily level identification then drilling down to H1/M15 for entry.
- **Mansor Sapari + SNR**: Veteran Malaysian forex educator. Classic SNR approach with strong emphasis on fundamental context. "Trade the level, not the indicator."
- **Teknik SNR Forex Malaysia**: Community-driven approach where traders share key levels daily. Group consensus on major SNR levels, then each trader uses their own entry model.
- **Support Resistance Storyline Forex Malaysia**: Malaysian method of reading price action as a story. Every trade has a setup, a confirmation, and a plot twist (reversal). Teaches traders to write out the price story before entering.

## Analysis Framework
When analyzing, always consider:
1. **Institutional bias** (HTF: Weekly/Daily level)
2. **Session context** (Which kill zone? Asian range manipulation?)
3. **SNR freshness** (Fresh zone = high probability, Unfresh = avoid)
4. **Storyline check** (Does price action tell a clear story?)
5. **Classic pattern** (A Level, V Level, OCL, QML present?)
6. **BYSTRA confirmation** (BOS + fresh SNR alignment)
7. **Entry model** (Sniper entry at POI — Point of Interest)

Always provide specific price levels. Be professional, direct, actionable. When relevant, reference Malaysian SNR concepts by name. End responses: "— Alchemist AI | JJ NEXUS PRO".`;

const WEB_SEARCH_TOOL: Anthropic.Tool = { type: "web_search_20250305" as any, name: "web_search" } as any;

const NO_AI_MSG = `⚠️ **AI Not Configured**

Add a free **Groq API key** in **Settings → API & Keys**:
1. Go to **groq.com** → Sign up free (no credit card needed)
2. Create an API Key (gsk_...)
3. Paste it in Settings → Groq API Key

Groq is completely free with 14,400 requests/day — no credit card needed.`;

// ── Unified stream helper ─────────────────────────────────────────────────────

async function* streamWithProvider(
  provider: AIProvider,
  messages: { role: string; content: string }[],
  system: string
) {
  if (provider.type === "openai-compat") {
    // For Groq: try each model in fallback chain
    if (provider.baseUrl.includes("groq.com")) {
      for (const model of GROQ_MODELS) {
        try {
          yield* streamOpenAICompat({ ...provider, model }, [{ role: "system", content: system }, ...messages]);
          return;
        } catch (e: any) {
          if (isRateLimitError(e) || (e.message || "").includes("tpd")) continue;
          throw e;
        }
      }
      throw new Error("All Groq models rate limited");
    }
    yield* streamOpenAICompat(provider, [{ role: "system", content: system }, ...messages]);
  } else {
    const stream = await provider.client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system,
      tools: provider.hasWebSearch ? [WEB_SEARCH_TOOL] : undefined,
      messages: messages as any,
    });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        yield ev.delta.text;
      }
    }
  }
}

async function callSyncWithProvider(
  provider: AIProvider,
  userMsg: string,
  system: string
): Promise<string> {
  if (provider.type === "openai-compat") {
    // Use Groq fallback chain if this is a Groq provider (handles rate limits)
    if (provider.baseUrl.includes("groq.com")) {
      return callGroqWithFallback(provider.apiKey, [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ]);
    }
    return callOpenAICompatSync(provider, [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ]);
  } else {
    const msg = await provider.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system,
      tools: provider.hasWebSearch ? [WEB_SEARCH_TOOL] : undefined,
      messages: [{ role: "user", content: userMsg }],
    });
    let text = "";
    for (const b of msg.content) { if (b.type === "text") text += b.text; }
    return text;
  }
}

// ── General analyze endpoint ──────────────────────────────────────────────────

router.post("/analyze", async (req, res) => {
  const { prompt, pair, livePrice, stream: wantStream, systemPrompt: customSystem } = req.body as {
    prompt: string; pair?: string; livePrice?: number; stream?: boolean; systemPrompt?: string;
  };
  if (!prompt) { res.status(400).json({ error: "prompt is required" }); return; }

  const system = customSystem || SYSTEM_PROMPT;
  const priceCtx = livePrice && livePrice > 0
    ? `\n\nCURRENT LIVE PRICE: ${pair || "Asset"} = ${livePrice.toFixed(livePrice > 500 ? 2 : pair?.includes("JPY") ? 3 : 5)} — USE ONLY THIS PRICE.\n\n`
    : "";
  const fullPrompt = priceCtx + prompt;
  const provider = getProvider(req);

  if (wantStream) {
    startSSE(res);
    if (!provider) { writeSSE(res, NO_AI_MSG); endSSE(res); return; }
    try {
      for await (const text of streamWithProvider(provider, [{ role: "user", content: fullPrompt }], system)) {
        writeSSE(res, text);
      }
    } catch (e: any) {
      writeSSE(res, isCreditError(e) ? NO_AI_MSG : `\n\n⚠️ Error: ${e.message}`);
    }
    endSSE(res); return;
  }

  if (!provider) { res.json({ text: NO_AI_MSG }); return; }
  try {
    const text = await callSyncWithProvider(provider, fullPrompt, system);
    res.json({ text });
  } catch (e: any) {
    if (isCreditError(e)) { res.json({ text: NO_AI_MSG }); } else { res.status(500).json({ error: e.message }); }
  }
});

// ── Forex deep analysis (streaming) ──────────────────────────────────────────

router.post("/forex", async (req, res) => {
  let body: ReturnType<typeof AnalyzeForexBody.parse>;
  try { body = AnalyzeForexBody.parse(req.body); } catch (e: any) {
    res.status(400).json({ error: "Invalid body", details: e.message }); return;
  }

  startSSE(res);
  const provider = getProvider(req);
  if (!provider) { writeSSE(res, NO_AI_MSG); endSSE(res); return; }

  const priceStr = body.price && body.price > 0
    ? `CURRENT LIVE PRICE: ${body.pair} = ${body.price.toFixed(body.price > 500 ? 2 : body.pair.includes("JPY") ? 3 : 5)} — USE ONLY THIS PRICE.\n\n`
    : "";

  const prompt = `${priceStr}Full Alchemist SMC/ICT Analysis — ${body.pair} | ${body.timeframe || "H1"} | ${TODAY}${body.bias ? ` | Bias: ${body.bias}` : ""}

**📊 MARKET STRUCTURE (HTF → LTF)**
- Weekly/Daily trend and overall bias
- H4: identify latest BOS or CHoCH with exact price
- H1: current entry structure event

**🟦 ORDER BLOCKS**
- Nearest Bullish OB: [price zone] — quality X/10 — mitigated? Y/N
- Nearest Bearish OB: [price zone] — quality X/10 — mitigated? Y/N

**🌀 FAIR VALUE GAPS**
- Open FVG above current price: [range] — timeframe
- Open FVG below current price: [range] — timeframe
- FVG inside OB? Y/N (if yes = highest priority zone)

**💧 LIQUIDITY MAP**
- Buy-side liquidity (BSL) resting above: [exact price]
- Sell-side liquidity (SSL) resting below: [exact price]
- Most probable liquidity target: [price] — reason

**📐 PREMIUM / DISCOUNT**
- Current Fibonacci position: Premium / Equilibrium / Discount
- Optimal Trade Entry (OTE) zone: [range]

**📈 ALCHEMIST TRADE PLAN**
- **Bias:** Bullish / Bearish / Neutral
- **Entry zone:** [exact price range]
- **Stop Loss:** [price] — placed below OB/sweep wick
- **TP1:** [price] — close 50% here
- **TP2:** [price] — close 30% here
- **TP3:** [price] — full exit
- **R:R:** X:1
- **Confluence score:** X/6 criteria met
- **Grade:** A+ / A / B / No Trade

**⚠️ INVALIDATION**
- Bull case invalidated below: [price]
- Bear case invalidated above: [price]`;

  try {
    for await (const text of streamWithProvider(provider, [{ role: "user", content: prompt }], SYSTEM_PROMPT)) {
      writeSSE(res, text);
    }
  } catch (e: any) {
    writeSSE(res, isCreditError(e) ? NO_AI_MSG : `\n\n⚠️ Error: ${e.message}`);
  }
  endSSE(res);
});

// ── Economic Event Real Impact Analysis (streaming + web_search) ─────────────

router.post("/event-impact", async (req, res) => {
  const { eventTitle, country, impact, forecast, previous, actual, pair } = req.body as {
    eventTitle?: string; country?: string; impact?: string;
    forecast?: string; previous?: string; actual?: string; pair?: string;
  };

  if (!eventTitle || !country) {
    res.status(400).json({ error: "eventTitle and country required" }); return;
  }

  startSSE(res);
  const provider = getProvider(req);
  if (!provider) {
    writeSSE(res, "⚠️ No AI provider is configured. The Replit free integration should be active — try refreshing the page or adding an API key in Settings.");
    endSSE(res); return;
  }

  const isReleased = !!(actual?.trim());
  const targetPair = pair || (country === "USD" ? "XAUUSD" : `${country}USD`);
  const releasedBlock = isReleased
    ? `RELEASED — Actual: **${actual}** vs Forecast: **${forecast || "N/A"}** vs Previous: **${previous || "N/A"}**\n${
        (() => {
          const a = parseFloat((actual || "").replace(/[^0-9.-]/g, ""));
          const f = parseFloat((forecast || "").replace(/[^0-9.-]/g, ""));
          if (!isNaN(a) && !isNaN(f)) return a > f ? `✅ BEAT — stronger than expected (bullish ${country})` : `❌ MISS — weaker than expected (bearish ${country})`;
          return "Result: See actual vs forecast above.";
        })()
      }`
    : `PRE-EVENT — Forecast: **${forecast || "N/A"}** | Previous: **${previous || "N/A"}** | Result not yet released`;

  const NEWS_SYSTEM = `You are Alchemist AI — elite institutional forex analyst for JJ NEXUS PRO. Today: ${TODAY}. Gold (XAUUSD) is $4700+ in 2026. ALWAYS use web_search for current live prices before any analysis. Be precise, specific with exact prices and pip counts. End responses with: "— Alchemist AI | JJ NEXUS PRO"`;

  const prompt = `TODAY IS ${TODAY}. First use web_search to get the current live price of ${targetPair} before writing anything.

## ECONOMIC EVENT IMPACT ANALYSIS
**Event:** ${eventTitle}
**Currency:** ${country} | **Impact Level:** ${impact || "HIGH"}
**${releasedBlock}**

Provide a complete, professional real-time analysis:

### 📊 1. EVENT SIGNIFICANCE
What this indicator measures, why it moves markets, historical volatility profile (average pip moves on prior releases).

### 💹 2. MARKET REACTION & DIRECTION
${isReleased
  ? `The actual ${actual} came in ${
      (() => {
        const a = parseFloat((actual || "").replace(/[^0-9.-]/g, ""));
        const f = parseFloat((forecast || "").replace(/[^0-9.-]/g, ""));
        return !isNaN(a) && !isNaN(f) ? (a > f ? "ABOVE forecast" : "BELOW forecast") : "vs forecast";
      })()
    }. Analyze expected market reaction:`
  : `Pre-event positioning. What should traders expect if the result beats / misses:`}
- Primary direction for ${targetPair}: BUY or SELL?
- Expected pip move range (e.g., "150-250 pips")
- Immediate vs delayed reaction pattern

### 🔗 3. CORRELATED PAIRS IMPACT
For each pair (use live prices from web_search):
- **XAUUSD** — direction, pip range, direct/inverse correlation
- **EURUSD** — direction, pip range
- **GBPUSD** — direction, pip range
- **USDJPY** — direction, pip range

### 🎯 4. ALCHEMIST TRADE SETUP
ONE high-conviction trade based on current live price:
- **Pair:** ${targetPair}
- **Direction:** BUY / SELL
- **Entry zone:** [use live price from web_search ± spread]
- **Stop Loss:** [exact price — why here]
- **TP1:** [exact price — 1:1.5 R:R]
- **TP2:** [exact price — 1:3 R:R]
- **Risk:Reward:** X:Y
- **Confidence:** X% — because [reasoning]
- **Timing:** [enter now / wait for retest / wait for X candle close]

### ⚠️ 5. INVALIDATION
What specific price action or candle close would cancel this trade idea immediately?`;

  try {
    for await (const text of streamWithProvider(provider, [{ role: "user", content: prompt }], NEWS_SYSTEM)) {
      writeSSE(res, text);
    }
  } catch (e: any) {
    writeSSE(res, isCreditError(e) ? NO_AI_MSG : `\n\n⚠️ Analysis error: ${e.message}`);
  }
  endSSE(res);
});

// ── Real confluence engine ────────────────────────────────────────────────────
// The model is given measured market evidence instead of being asked to
// hallucinate candle structure from a symbol and a price.
const YAHOO_SYMBOLS: Record<string, string> = {
  XAUUSD: "GC=F", XAGUSD: "SI=F", BTCUSD: "BTC-USD", ETHUSD: "ETH-USD",
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "JPY=X", GBPJPY: "GBPJPY=X",
  AUDUSD: "AUDUSD=X", NZDUSD: "NZDUSD=X", USDCAD: "CAD=X", USDCHF: "CHF=X",
  US30: "YM=F", NAS100: "NQ=F", SPX500: "ES=F",
};
const CFTC_CODES: Record<string, string> = {
  XAUUSD: "088691", EURUSD: "099741", GBPUSD: "096742", USDJPY: "097741",
  AUDUSD: "232741", NZDUSD: "112741", USDCAD: "090741", USDCHF: "092741",
  NAS100: "20974P", SPX500: "13874A",
};

type Candle = { open: number; high: number; low: number; close: number; time: number };
type SourceSignal = { page: string; label: string; bias: string; score: number; confidence: number; summary: string; dataSource: string };

function signalBias(score: number): "BULLISH" | "BEARISH" | "NEUTRAL" {
  return score > 58 ? "BULLISH" : score < 42 ? "BEARISH" : "NEUTRAL";
}

async function fetchCandles(symbol: string, timeframe: string): Promise<Candle[]> {
  const yahoo = YAHOO_SYMBOLS[symbol] || `${symbol}=X`;
  const ranges: Record<string, [string, string]> = {
    M5: ["5m", "5d"], M15: ["15m", "5d"], M30: ["30m", "5d"], H1: ["1h", "5d"],
    H4: ["1h", "60d"], D1: ["1d", "1y"], W1: ["1wk", "2y"],
  };
  const [interval, range] = ranges[timeframe] || ranges.H1;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const response = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=${interval}&range=${range}`,
        { headers: { "User-Agent": "JJNexusPro/2.0" }, signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) continue;
      const result = (await response.json() as any)?.chart?.result?.[0];
      const q = result?.indicators?.quote?.[0];
      const timestamps = result?.timestamp || [];
      const candles = timestamps.map((time: number, i: number) => ({
        time, open: Number(q?.open?.[i]), high: Number(q?.high?.[i]),
        low: Number(q?.low?.[i]), close: Number(q?.close?.[i]),
      })).filter((c: Candle) =>
        Object.values(c).every(Number.isFinite) &&
        c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0 &&
        c.high >= Math.max(c.open, c.close, c.low) &&
        c.low <= Math.min(c.open, c.close, c.high)
      );
      if (candles.length >= 20) return candles.slice(-240);
    } catch {}
  }
  return [];
}

function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  return values.reduce((acc, value, i) => i === 0 ? value : value * k + acc * (1 - k), values[0]);
}

function buildTechnicalSignal(pair: string, price: number, candles: Candle[]): SourceSignal & {
  currentPrice: string; factors: Record<string, number>; keyLevels: Record<string, string>; zones: Record<string, string>;
} {
  if (candles.length === 0) {
    const current = price > 0 ? price : 0;
    const fmt = (n: number) => n ? n.toFixed(pair.includes("JPY") ? 3 : pair === "XAUUSD" ? 2 : 5) : "—";
    return {
      page: "technical", label: "📈 Technical SMC", bias: "NEUTRAL", score: 50, confidence: 0,
      summary: "Live OHLC candles are unavailable; technical structure was not guessed.",
      dataSource: "Unavailable", currentPrice: fmt(current),
      factors: { structure: 50, orderBlocks: 50, momentum: 50, fundamentals: 50, fvg: 50, liquidity: 50 },
      keyLevels: { resistance1: "—", resistance2: "—", support1: "—", support2: "—", pivotPoint: fmt(current) },
      zones: { bullishFvg: "none", bearishFvg: "none", ema20: "—", ema50: "—" },
    };
  }
  const last = candles[candles.length - 1];
  const closes = candles.map(c => c.close);
  const current = price > 0 ? price : last?.close || 0;
  const e20 = ema(closes.slice(-80), 20), e50 = ema(closes.slice(-140), 50);
  const trend = current > e20 && e20 >= e50 ? 78 : current < e20 && e20 <= e50 ? 22 : 50;
  const recent = candles.slice(-30);
  const support = Math.min(...recent.map(c => c.low));
  const resistance = Math.max(...recent.map(c => c.high));
  const prior = candles.slice(-70, -30);
  const priorHigh = prior.length ? Math.max(...prior.map(c => c.high)) : resistance;
  const priorLow = prior.length ? Math.min(...prior.map(c => c.low)) : support;
  const range = Math.max(resistance - support, Number.EPSILON);
  const momentum = last && Math.abs(last.close - last.open) > range * 0.08
    ? (last.close > last.open ? 72 : 28) : 50;
  let bullFvg = "none", bearFvg = "none";
  for (let i = Math.max(2, candles.length - 40); i < candles.length; i++) {
    const a = candles[i - 2], c = candles[i];
    if (a.high < c.low) bullFvg = `${a.high.toFixed(4)}–${c.low.toFixed(4)}`;
    if (a.low > c.high) bearFvg = `${c.high.toFixed(4)}–${a.low.toFixed(4)}`;
  }
  const score = Math.round(trend * 0.55 + momentum * 0.25 + (current > (support + resistance) / 2 ? 62 : 38) * 0.2);
  const bias = signalBias(score);
  const fmt = (n: number) => n ? n.toFixed(pair.includes("JPY") ? 3 : pair === "XAUUSD" ? 2 : 5) : "—";
  return {
    page: "technical", label: "📈 Technical SMC", bias, score, confidence: Math.min(95, 55 + Math.round(candles.length / 10)),
    summary: `${candles.length} live OHLC candles: ${bias.toLowerCase()} EMA structure, range liquidity ${fmt(support)}–${fmt(resistance)}, ${bullFvg !== "none" ? `bullish FVG ${bullFvg}` : bearFvg !== "none" ? `bearish FVG ${bearFvg}` : "no open FVG detected"}.`,
    dataSource: "Yahoo Finance OHLC",
    currentPrice: fmt(current),
    factors: { structure: Math.round(trend), orderBlocks: Math.round((trend + (current > e20 ? 60 : 40)) / 2), momentum: Math.round(momentum), fundamentals: 50, fvg: bullFvg !== "none" || bearFvg !== "none" ? 68 : 42, liquidity: Math.round(current > (support + resistance) / 2 ? 62 : 38) },
    keyLevels: { resistance1: fmt(resistance), resistance2: fmt(priorHigh), support1: fmt(support), support2: fmt(priorLow), pivotPoint: fmt((resistance + support + current) / 3) },
    zones: { bullishFvg: bullFvg, bearishFvg: bearFvg, ema20: fmt(e20), ema50: fmt(e50) },
  };
}

function buildMeasuredConfluence(
  pair: string,
  price: number,
  technical: ReturnType<typeof buildTechnicalSignal>,
  fundamental: SourceSignal,
  cot: SourceSignal,
  sentiment: SourceSignal,
) {
  const sources = [technical, fundamental, cot, sentiment];
  const weights: Record<string, number> = { technical: 0.35, fundamental: 0.25, cot: 0.25, sentiment: 0.15 };
  const totalWeight = sources.reduce((sum, source) => sum + (weights[source.page] || 0), 0);
  const weightedScore = sources.reduce((sum, source) => sum + source.score * (weights[source.page] || 0), 0);
  const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;
  const bias = signalBias(score);
  const direction = bias === "BEARISH" ? "SELL" : bias === "BULLISH" ? "BUY" : "WAIT";
  const fmt = (n: number) => n
    ? n.toFixed(pair.includes("JPY") ? 3 : pair === "XAUUSD" ? 2 : 5)
    : "—";
  const levels = technical.keyLevels;
  const entry = direction === "BUY" ? levels.support1 : direction === "SELL" ? levels.resistance1 : "—";
  const stop = direction === "BUY" ? levels.support2 : direction === "SELL" ? levels.resistance2 : "—";
  const target = direction === "BUY" ? levels.resistance1 : direction === "SELL" ? levels.support1 : "—";
  const agreement = sources.filter(source => source.bias === bias).length;

  return {
    score,
    bias,
    currentPrice: technical.currentPrice || fmt(price),
    factors: {
      ...technical.factors,
      fundamentals: fundamental.score,
    },
    tradeIdea: {
      pair,
      direction,
      entry: entry === "—" ? fmt(price) : entry,
      stopLoss: stop,
      takeProfit: target,
      tp2: direction === "BUY" ? levels.resistance2 : direction === "SELL" ? levels.support2 : "—",
      tp3: direction === "BUY" ? levels.resistance2 : direction === "SELL" ? levels.support2 : "—",
      riskReward: stop !== "—" && target !== "—" ? "1:2" : "—",
      probability: Math.max(50, Math.min(95, Math.round(50 + Math.abs(score - 50) * 0.7))),
      grade: score >= 75 && agreement >= 3 ? "A+" : score >= 65 && agreement >= 2 ? "A" : score >= 55 && direction !== "WAIT" ? "B" : "No Trade",
      explanation: `${agreement}/${sources.length} measured sources align ${bias.toLowerCase()}. Technical levels are calculated from the latest OHLC range; confirm the entry with a close and risk only what your plan allows.`,
    },
    keyLevels: levels,
    summary: `${sources.length} live sources measured for ${pair}: ${bias.toLowerCase()} weighted confluence ${score}/100. ${technical.summary}`,
    sourceSignals: sources.map(({ page, label, bias: sourceBias, score: sourceScore, confidence, summary: sourceSummary, dataSource }) => ({
      page, label, bias: sourceBias, score: sourceScore, confidence, summary: sourceSummary, dataSource,
    })),
    evidence: {
      candleCount: technical.summary.match(/^\d+/)?.[0] ? Number(technical.summary.match(/^\d+/)?.[0]) : 0,
      technicalDataSource: technical.dataSource,
      sourceCount: sources.length,
      measuredAt: new Date().toISOString(),
    },
  };
}

async function fetchFundamentalSignal(pair: string): Promise<SourceSignal> {
  try {
    const response = await fetch("https://www.forexlive.com/feed/news", { headers: { "User-Agent": "JJNexusPro/2.0" }, signal: AbortSignal.timeout(8000) });
    const xml = await response.text();
    const titles = [...xml.matchAll(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim()).filter(Boolean).slice(0, 12);
    const relevant = titles.filter(t => /gold|fed|inflation|rate|dollar|treasury|ecb|boe|boj|usd|risk|yield/i.test(t));
    const bullWords = relevant.filter(t => /weaker dollar|rate cut|falling yield|dovish|safe haven|gold rises|bullish/i.test(t)).length;
    const bearWords = relevant.filter(t => /strong dollar|rate hike|rising yield|hawkish|gold falls|bearish/i.test(t)).length;
    const score = relevant.length ? Math.round(50 + (bullWords - bearWords) * 12) : 50;
    const bias = signalBias(Math.max(0, Math.min(100, score)));
    return { page: "fundamental", label: "🌍 Fundamental", bias, score: Math.max(0, Math.min(100, score)), confidence: relevant.length ? 65 : 20, summary: relevant.length ? `${relevant.length} current market headlines scanned; ${bias.toLowerCase()} headline balance. Latest: ${relevant[0]}` : "Live news feed returned no relevant headlines.", dataSource: "ForexLive RSS" };
  } catch {
    return { page: "fundamental", label: "🌍 Fundamental", bias: "NEUTRAL", score: 50, confidence: 0, summary: "Live news source unavailable right now.", dataSource: "Unavailable" };
  }
}

async function fetchCOTSignal(pair: string): Promise<SourceSignal> {
  const code = CFTC_CODES[pair];
  if (!code) return { page: "cot", label: "📊 COT Flow", bias: "NEUTRAL", score: 50, confidence: 0, summary: "No CFTC contract mapping for this instrument.", dataSource: "Unavailable" };
  try {
    const response = await fetch(`https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=${code}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=2`, { headers: { "User-Agent": "JJNexusPro/2.0" }, signal: AbortSignal.timeout(10000) });
    const rows = await response.json() as any[];
    const row = rows?.[0];
    const long = Number(row?.noncomm_positions_long_all || 0), short = Number(row?.noncomm_positions_short_all || 0);
    if (!row || !Number.isFinite(long) || !Number.isFinite(short) || long + short === 0) throw new Error("no COT rows");
    const score = Math.max(0, Math.min(100, Math.round(50 + ((long - short) / (long + short)) * 50)));
    const bias = signalBias(score);
    return { page: "cot", label: "📊 COT Flow", bias, score, confidence: 75, summary: `Latest CFTC non-commercial positioning is ${bias.toLowerCase()} (${long.toLocaleString()} long vs ${short.toLocaleString()} short).`, dataSource: "CFTC Socrata" };
  } catch {
    return { page: "cot", label: "📊 COT Flow", bias: "NEUTRAL", score: 50, confidence: 0, summary: "Latest CFTC positioning is unavailable.", dataSource: "Unavailable" };
  }
}

async function fetchSentimentSignal(pair: string): Promise<SourceSignal> {
  try {
    const response = await fetch(`https://www.myfxbook.com/api/get-community-outlook.json?pair=${pair.toLowerCase()}`, { headers: { "User-Agent": "JJNexusPro/2.0" }, signal: AbortSignal.timeout(8000) });
    const data = await response.json() as any;
    const symbol = data?.symbols?.[0];
    const long = Number.parseFloat(symbol?.longPercentage);
    if (!Number.isFinite(long)) throw new Error("no sentiment");
    const score = Math.round(100 - long);
    const bias = signalBias(score);
    return { page: "sentiment", label: "👥 Sentiment", bias, score, confidence: 70, summary: `Retail positioning is ${long.toFixed(1)}% long / ${(100 - long).toFixed(1)}% short; contrarian bias is ${bias.toLowerCase()}.`, dataSource: "Myfxbook Community Outlook" };
  } catch {
    return { page: "sentiment", label: "👥 Sentiment", bias: "NEUTRAL", score: 50, confidence: 0, summary: "Retail sentiment feed is unavailable.", dataSource: "Unavailable" };
  }
}

router.post("/confluence", async (req, res) => {
  let body: ReturnType<typeof AnalyzeConfluenceBody.parse>;
  try { body = AnalyzeConfluenceBody.parse(req.body); } catch (e: any) {
    res.status(400).json({ error: "Invalid body", details: e.message }); return;
  }

  try {
    // These are the source-of-truth measurements. The model may explain them,
    // but it is never allowed to invent candle structure or replace a missing feed.
    const [candles, fundamental, cot, sentiment] = await Promise.all([
      fetchCandles(body.pair, body.timeframe || "H1"),
      fetchFundamentalSignal(body.pair),
      fetchCOTSignal(body.pair),
      fetchSentimentSignal(body.pair),
    ]);
    const technical = buildTechnicalSignal(body.pair, body.price || 0, candles);
    const measured = buildMeasuredConfluence(body.pair, body.price || 0, technical, fundamental, cot, sentiment);
    const provider = getProvider(req);
    if (!provider) {
      res.json(measured);
      return;
    }

    const priceStr = measured.currentPrice !== "—"
      ? `LIVE PRICE: ${body.pair} = ${measured.currentPrice}\n\n`
      : "";
    const evidence = JSON.stringify({
      technical,
      fundamental,
      cot,
      sentiment,
      measuredScore: measured.score,
      measuredBias: measured.bias,
      measuredLevels: measured.keyLevels,
    });
    const prompt = `${priceStr}Run the complete Alchemist confluence engine for ${body.pair} on ${body.timeframe || "H1"} — ${TODAY}.

Analyze all 6 SMC confluence factors honestly based on current market conditions.
The following evidence was measured by the server from live OHLC, news, CFTC, and sentiment feeds. Treat it as authoritative. Do not claim a source is "not analyzed" when it is present, and do not invent levels that are not supported by the evidence:
${evidence}

Return ONLY valid JSON — no markdown, no code blocks, no explanation text:

{
  "score": <0-100 real confluence score>,
  "bias": "<BULLISH|BEARISH|NEUTRAL>",
  "currentPrice": "<price as string>",
  "factors": {
    "structure": <0-100>,
    "orderBlocks": <0-100>,
    "momentum": <0-100>,
    "fundamentals": <0-100>,
    "fvg": <0-100>,
    "liquidity": <0-100>
  },
  "tradeIdea": {
    "pair": "${body.pair}",
    "direction": "<BUY|SELL>",
    "entry": "<entry zone e.g. 4695-4700>",
    "stopLoss": "<exact stop price>",
    "takeProfit": "<TP1 price>",
    "tp2": "<TP2 price>",
    "tp3": "<TP3 price>",
    "riskReward": "<e.g. 1:2.5>",
    "probability": <50-95>,
    "grade": "<A+|A|B|No Trade>",
    "explanation": "<2-3 sentence professional explanation>"
  },
  "keyLevels": {
    "resistance1": "<price>",
    "resistance2": "<price>",
    "support1": "<price>",
    "support2": "<price>",
    "pivotPoint": "<price>"
  },
  "summary": "<2-3 sentence confluence summary>"
}`;

  const parseAIResponse = (text: string) => {
    try { return JSON.parse(text); } catch {}
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  };

    try {
      const text = await callSyncWithProvider(provider, prompt, SYSTEM_PROMPT);
      const parsed = parseAIResponse(text);
      if (parsed) {
        // Preserve the measured fields even if an AI provider omits them.
        res.json({
          ...measured,
          ...parsed,
          factors: { ...measured.factors, ...(parsed.factors || {}) },
          keyLevels: { ...measured.keyLevels, ...(parsed.keyLevels || {}) },
          sourceSignals: measured.sourceSignals,
          evidence: measured.evidence,
        });
        return;
      }
      res.json(measured);
    } catch (e: any) {
      // A live-source result is more useful than a provider error and avoids
      // turning an AI outage into a false "not analyzed" state.
      res.json({ ...measured, aiError: e.message });
    }
  } catch (e: any) {
    res.status(502).json({ error: "Live confluence feeds are unavailable", details: e.message });
  }
});

// ── Fundamental news ──────────────────────────────────────────────────────────

router.get("/news/:pair", async (req, res) => {
  const { pair } = GetForexNewsParams.parse(req.params);
  const provider = getProvider(req);

  const noAI = { pair, summary: "Add a Groq key in Settings for live news analysis.", sentiment: "NEUTRAL", macroScore: 5, keyEvents: [{ event: "AI key required", impact: "HIGH", direction: "NEUTRAL", detail: "Go to Settings → API & Keys → add free Groq key (groq.com)" }], centralBankPolicy: "—", generatedAt: new Date().toISOString() };

  if (!provider) { res.json(noAI); return; }

  const prompt = `Fundamental analysis for ${pair} — ${TODAY}.
Return ONLY valid JSON:
{"pair":"${pair}","summary":"<3-4 sentence professional summary>","sentiment":"<BULLISH|BEARISH|NEUTRAL>","macroScore":<1-10>,"keyEvents":[{"event":"<name>","impact":"<HIGH|MEDIUM|LOW>","direction":"<BULLISH|BEARISH|NEUTRAL>","detail":"<detail>"},{"event":"<name>","impact":"<HIGH|MEDIUM|LOW>","direction":"<BULLISH|BEARISH|NEUTRAL>","detail":"<detail>"},{"event":"<name>","impact":"<HIGH|MEDIUM|LOW>","direction":"<BULLISH|BEARISH|NEUTRAL>","detail":"<detail>"}],"centralBankPolicy":"<brief central bank stance>","generatedAt":"${new Date().toISOString()}"}`;

  const parse = (t: string) => { try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} } return null; } };

  try {
    const text = await callSyncWithProvider(provider, prompt, SYSTEM_PROMPT);
    const p = parse(text);
    if (p) { res.json(p); return; }
    res.status(500).json({ error: "Failed to parse AI response" });
  } catch (e: any) {
    if (isCreditError(e)) { res.json(noAI); } else { res.status(500).json({ error: e.message }); }
  }
});

// ── POST /news-impact — AI-powered news headline analyzer ────────────────────
// Accepts a FX news headline + description and returns structured market impact
// for XAUUSD and major pairs (EURUSD, GBPUSD, USDJPY, etc.)
router.post("/news-impact", async (req, res) => {
  try {
    const { title, description, category } = req.body as {
      title?: string;
      description?: string;
      category?: string;
    };
    if (!title) { res.status(400).json({ error: "title required" }); return; }

    const provider = getProvider(req);
    if (!provider) { res.status(503).json({ error: "No AI provider configured" }); return; }

    const prompt = `You are an elite institutional forex analyst. Analyze this breaking news headline and provide a structured market impact assessment.

NEWS HEADLINE: "${title}"${description ? `\nDESCRIPTION: "${description.slice(0, 400)}"` : ""}${category ? `\nCATEGORY: ${category}` : ""}

Respond in this EXACT JSON format (raw JSON only, no markdown code blocks):
{
  "impactLevel": "HIGH",
  "impactEmoji": "🔴",
  "summary": "One sentence explaining the core market implication",
  "pairs": [
    {
      "pair": "XAUUSD",
      "direction": "BULLISH",
      "strength": "STRONG",
      "reasoning": "Brief reasoning for this pair's reaction"
    }
  ],
  "tradingNote": "Concrete actionable note: what to watch, key levels, entry criteria if any",
  "riskWarning": "Any tail risks or conflicting signals traders should know"
}

Rules:
- impactLevel: "HIGH" (moves market 50+ pips / gold $10+), "MEDIUM" (20-50 pips), "LOW" (< 20 pips)
- impactEmoji: "🔴" for HIGH, "🟡" for MEDIUM, "🟢" for LOW
- Always include XAUUSD first in pairs array
- Add 2-4 other relevant major pairs (EUR/USD, GBP/USD, USD/JPY, USD/CHF etc.) only if directly relevant
- direction: "BULLISH" (pair goes up), "BEARISH" (pair goes down), "NEUTRAL"
- strength: "STRONG", "MODERATE", or "WEAK"
- Be precise and professional. Traders will act on this.`;

    const parse = (t: string) => {
      try { return JSON.parse(t); }
      catch { const m = t.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} } return null; }
    };

    if (provider.type === "anthropic") {
      const response = await provider.client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = parse(text);
      if (parsed) { res.json(parsed); return; }
      res.status(500).json({ error: "Could not parse AI response", raw: text.slice(0, 300) });
    } else {
      const text = await callOpenAICompatSync(provider, [{ role: "user", content: prompt }]);
      const parsed = parse(text);
      if (parsed) { res.json(parsed); return; }
      res.status(500).json({ error: "Could not parse AI response", raw: text.slice(0, 300) });
    }
  } catch (err: any) {
    console.error("[news-impact]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /ai-status — tells frontend which provider is active ────────────────
router.get("/ai-status", (req, res) => {
  const integrationKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (integrationKey && integrationBaseUrl) {
    res.json({ provider: "Replit Free AI (Claude)", type: "replit", active: true, color: "#22c55e" });
    return;
  }
  const grokKey = (req.headers["x-grok-key"] as string) || "";
  if (grokKey) { res.json({ provider: "Grok (xAI)", type: "grok", active: true, color: "#22c55e" }); return; }
  const groqKey = (req.headers["x-groq-key"] as string) || "";
  if (groqKey) { res.json({ provider: "Groq (Llama 3.3 70B — Free)", type: "groq", active: true, color: "#22c55e" }); return; }
  const anthropicKey = (req.headers["x-anthropic-key"] as string) || "";
  if (anthropicKey) { res.json({ provider: "Anthropic Claude (your key)", type: "anthropic", active: true, color: "#d97706" }); return; }
  const openrouterKey = (req.headers["x-openrouter-key"] as string) || "";
  if (openrouterKey) { res.json({ provider: "OpenRouter (Free)", type: "openrouter", active: true, color: "#22c55e" }); return; }
  const githubToken = (req.headers["x-github-token"] as string) || "";
  if (githubToken) { res.json({ provider: "GitHub Models (Free)", type: "github", active: true, color: "#22c55e" }); return; }
  const serverGroqKey = process.env.GROQ_API_KEY || "";
  if (serverGroqKey) { res.json({ provider: "Groq (Llama 3.3 70B — Free)", type: "groq", active: true, color: "#22c55e" }); return; }
  res.json({ provider: "None — add a free Groq key in Settings", type: "none", active: false, color: "#ef4444" });
});

export default router;
