import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

// ── In-memory caches ──────────────────────────────────────────────────────────
let ratesCache: { data: Record<string, number>; timestamp: number; source: string } | null = null;
const RATES_TTL = 30 * 60 * 1000;

let calendarCache: { data: any[]; timestamp: number } | null = null;
const CALENDAR_TTL = 5 * 60 * 1000; // 5 minutes — keep data fresh (actuals release throughout the day)

async function fetchCalendarWeek(week: "thisweek" | "nextweek"): Promise<any[]> {
  const urls = [
    `https://nfs.faireconomy.media/ff_calendar_${week}.json`,
    `https://cdn-nfs.faireconomy.media/ff_calendar_${week}.json`,
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 JJNexusPro/2.0" },
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {}
  }
  throw new Error(`Calendar ${week} unavailable`);
}

async function getCalendarData(): Promise<any[]> {
  const now = Date.now();
  if (calendarCache && (now - calendarCache.timestamp) < CALENDAR_TTL) {
    return calendarCache.data;
  }

  // Fetch this week + next week in parallel, combine and sort
  const [thisWeek, nextWeek] = await Promise.allSettled([
    fetchCalendarWeek("thisweek"),
    fetchCalendarWeek("nextweek"),
  ]);

  const combined: any[] = [];
  if (thisWeek.status === "fulfilled") combined.push(...thisWeek.value);
  if (nextWeek.status === "fulfilled") combined.push(...nextWeek.value);

  if (combined.length === 0) throw new Error("Calendar data unavailable");

  // Sort by date ascending
  combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Deduplicate by title+date
  const seen = new Set<string>();
  const deduped = combined.filter(ev => {
    const key = `${ev.title}|${ev.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  calendarCache = { data: deduped, timestamp: now };
  return deduped;
}

router.get("/calendar", async (_req, res) => {
  try {
    res.json(await getCalendarData());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/calendar-thisweek", async (_req, res) => {
  try {
    res.json(await fetchCalendarWeek("thisweek"));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/calendar-nextweek", async (_req, res) => {
  try {
    res.json(await fetchCalendarWeek("nextweek"));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/sentiment", async (req, res) => {
  const pair = (req.query.pair as string) || "EURUSD";
  try {
    const url = `https://www.myfxbook.com/api/get-community-outlook.json?pair=${encodeURIComponent(pair)}`;
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "JJNexusPro/2.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) { res.status(resp.status).json({ error: "Sentiment fetch failed" }); return; }
    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const YAHOO_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "GC=F", XAGUSD: "SI=F", BTCUSD: "BTC-USD", ETHUSD: "ETH-USD",
  BNBUSD: "BNB-USD", SOLUSD: "SOL-USD", EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X",
  USDJPY: "JPY=X", USDCHF: "CHF=X", AUDUSD: "AUDUSD=X", NZDUSD: "NZDUSD=X",
  USDCAD: "CAD=X", EURJPY: "EURJPY=X", GBPJPY: "GBPJPY=X", EURGBP: "EURGBP=X",
  USOIL: "CL=F", UKOIL: "BZ=F", US30: "YM=F", NAS100: "NQ=F", SPX500: "ES=F",
  DXY: "DX-Y.NYB", VIX: "^VIX",
};

const INTERVAL_RANGE_MAP: Record<string, { yahooInterval: string; range: string }> = {
  M1: { yahooInterval: "1m", range: "1d" },
  M5: { yahooInterval: "5m", range: "5d" },
  M15: { yahooInterval: "15m", range: "5d" },
  M30: { yahooInterval: "30m", range: "5d" },
  H1: { yahooInterval: "1h", range: "5d" },
  H4: { yahooInterval: "1h", range: "60d" },
  D1: { yahooInterval: "1d", range: "1y" },
  W1: { yahooInterval: "1wk", range: "2y" },
  MN: { yahooInterval: "1mo", range: "5y" },
};

router.get("/ohlc", async (req, res) => {
  const symbol = (req.query.symbol as string) || "XAUUSD";
  const interval = (req.query.interval as string) || "H1";
  const yahooSym = YAHOO_SYMBOL_MAP[symbol] ?? `${symbol}=X`;
  const { yahooInterval, range } = INTERVAL_RANGE_MAP[interval] ?? { yahooInterval: "1h", range: "5d" };

  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${yahooInterval}&range=${range}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JJNexusPro/2.0)", "Accept": "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp ?? [];
      const quote = result.indicators?.quote?.[0] ?? {};
      const opens: number[] = quote.open ?? [];
      const highs: number[] = quote.high ?? [];
      const lows: number[] = quote.low ?? [];
      const closes: number[] = quote.close ?? [];
      const volumes: number[] = quote.volume ?? [];

      const candles = timestamps
        .map((t, i) => ({
          time: t,
          open: opens[i] ?? null,
          high: highs[i] ?? null,
          low: lows[i] ?? null,
          close: closes[i] ?? null,
          volume: volumes[i] ?? 0,
        }))
        .filter(c => c.open !== null && c.high !== null && c.low !== null && c.close !== null)
        .map(c => ({
          time: c.time,
          open: +c.open!.toFixed(4),
          high: +c.high!.toFixed(4),
          low: +c.low!.toFixed(4),
          close: +c.close!.toFixed(4),
          volume: c.volume,
        }));

      if (candles.length === 0) continue;

      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ symbol, interval, candles, meta: { yahooSymbol: yahooSym, currency: result.meta?.currency ?? "USD" } });
      return;
    } catch { continue; }
  }
  res.status(503).json({ error: "OHLC data unavailable", symbol, interval });
});

router.get("/forex-rates", async (_req, res) => {
  try {
    const resp = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CHF,AUD,NZD,CAD", {
      headers: { "Accept": "application/json" }
    });
    if (!resp.ok) { res.status(resp.status).json({ error: "Forex rate fetch failed" }); return; }
    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/gold-price", async (_req, res) => {
  const sources = [
    "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d",
    "https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d",
  ];
  for (const url of sources) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JJNexusPro/2.0)", "Accept": "application/json" }
      });
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 1500 && price < 15000) {
        res.json({ price: +price.toFixed(2), source: "yahoo" });
        return;
      }
    } catch { continue; }
  }
  try {
    const resp = await fetch("https://metals.live/api/spot", { headers: { "Accept": "application/json" } });
    if (resp.ok) {
      const data = await resp.json() as any[];
      if (Array.isArray(data)) {
        const gold = data.find((i: any) => i.metal === "gold" || i.symbol === "XAU");
        const price = gold?.price || gold?.ask;
        if (price && price > 1500) { res.json({ price: +price.toFixed(2), source: "metals.live" }); return; }
      }
    }
  } catch {}
  res.status(503).json({ error: "Gold price unavailable" });
});

router.get("/yahoo-price", async (req, res) => {
  const symbol = (req.query.symbol as string) || "";
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JJNexusPro/2.0)", "Accept": "application/json" }
      });
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) { res.json({ price: +price.toFixed(4), symbol }); return; }
    } catch { continue; }
  }
  res.status(503).json({ error: "Price unavailable", symbol });
});

router.get("/crypto", async (_req, res) => {
  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,binancecoin,cardano,dogecoin,polkadot&vs_currencies=usd&include_24hr_change=true";
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "JJNexusPro/2.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) { res.status(resp.status).json({ error: "Crypto fetch failed" }); return; }
    const data = await resp.json();
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/cftc", async (req, res) => {
  try {
    const limit = req.query.limit || 500;
    const url = `https://publicreporting.cftc.gov/api/views/6dca-aqww/rows.json?$limit=${limit}&$order=report_date_as_yyyy_mm_dd+DESC`;
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "JJNexusPro/2.0" }
    });
    if (!resp.ok) {
      res.status(resp.status).json({ error: "CFTC fetch failed", status: resp.status });
      return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── CFTC Contract-Filtered Proxy — fetches data for a single market by code ──
// Uses Socrata REST API which supports filtering by cftc_contract_market_code.
// This avoids downloading all 80k+ rows when only one market is needed.
router.get("/cftc-contract", async (req, res) => {
  try {
    const code = (req.query.code as string | undefined)?.trim();
    const limit = parseInt((req.query.limit as string) || "200", 10);
    if (!code) {
      res.status(400).json({ error: "Missing required query param: code" });
      return;
    }
    // Socrata JSON API — filtered, ordered, limited
    const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=${encodeURIComponent(code)}&$order=report_date_as_yyyy_mm_dd+DESC&$limit=${limit}`;
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "JJNexusPro/2.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) {
      res.status(resp.status).json({ error: "CFTC fetch failed", status: resp.status });
      return;
    }
    const data = await resp.json();
    res.setHeader("Cache-Control", "public, max-age=3600"); // 1-hour cache — data released weekly
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Central Bank Rates — Official APIs first, AI web_search second ────────────
router.get("/central-bank-rates", async (req, res) => {
  const forceRefresh = req.query.force === "true";
  // Serve from cache if still fresh (30 min TTL) — unless force=true busts the cache
  if (!forceRefresh && ratesCache && Date.now() - ratesCache.timestamp < RATES_TTL) {
    res.json({
      rates: ratesCache.data,
      cached: true,
      source: ratesCache.source,
      cacheAgeMinutes: Math.round((Date.now() - ratesCache.timestamp) / 60000),
      fetchedAt: new Date(ratesCache.timestamp).toISOString(),
    });
    return;
  }
  if (forceRefresh) {
    ratesCache = null;
    console.log("[central-bank-rates] Cache cleared by force=true — fetching fresh rates");
  }

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  console.log(`[central-bank-rates] Fetching live rates for ${today}...`);

  // ── Step 1: Hit official central bank APIs (free, no auth, real-time) ────────
  const [ecbRate, bocRate, rbaRate, rbnzRate] = await Promise.all([
    fetchECBRate(),      // EUR — ECB official data portal
    fetchBoCRate(),      // CAD — Bank of Canada Valet API
    fetchRBARate(),      // AUD — Reserve Bank of Australia
    fetchRBNZRate(),     // NZD — Reserve Bank of New Zealand
  ]);

  const officialRates: Record<string, number> = {};
  if (ecbRate !== null) { officialRates.EUR = ecbRate; console.log(`[central-bank-rates] ECB official: ${ecbRate}%`); }
  if (bocRate !== null) { officialRates.CAD = bocRate; console.log(`[central-bank-rates] BoC official: ${bocRate}%`); }
  if (rbaRate !== null) { officialRates.AUD = rbaRate; console.log(`[central-bank-rates] RBA official: ${rbaRate}%`); }
  if (rbnzRate !== null) { officialRates.NZD = rbnzRate; console.log(`[central-bank-rates] RBNZ official: ${rbnzRate}%`); }

  // ── Step 2: Anthropic web_search for the remaining currencies (USD, GBP, JPY, CHF) ─
  const integrationKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const groqKey = process.env.GROQ_API_KEY;

  const missingCurrencies = ["USD", "GBP", "JPY", "CHF"].filter(c => !(c in officialRates));
  const allCurrencies = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD"];

  if (integrationKey && integrationBaseUrl) {
    try {
      const client = new Anthropic({
        apiKey: integrationKey,
        baseURL: integrationBaseUrl,
        defaultHeaders: { "anthropic-beta": "web-search-2025-03-05" },
      });

      // Force web_search by asking for SPECIFIC searches — prevents training data fallback
      const searchTargets = missingCurrencies.length > 0
        ? missingCurrencies.map(c => {
            const names: Record<string, string> = {
              USD: "Federal Reserve federal funds rate",
              GBP: "Bank of England base rate",
              JPY: "Bank of Japan policy interest rate",
              CHF: "Swiss National Bank SNB policy rate",
            };
            return names[c] ?? c;
          })
        : ["Federal Reserve rate", "Bank of England rate", "Bank of Japan rate", "Swiss National Bank rate"];

      const prompt = `TODAY IS ${today}. You MUST use the web_search tool to find CURRENT official central bank policy rates.

REQUIRED SEARCHES (do not skip any):
${searchTargets.map((s, i) => `${i + 1}. Search for: "${s} ${new Date().getFullYear()} current"`).join("\n")}

After performing web searches, return ONLY this JSON (no markdown, no explanation):
{"USD":X.XX,"EUR":X.XX,"GBP":X.XX,"JPY":X.XX,"CHF":X.XX,"AUD":X.XX,"NZD":X.XX,"CAD":X.XX}

Rules:
- Values are decimal numbers (e.g. 4.25, not "4.25%")
- DO NOT use your training data — only use information found by web_search
- If you cannot find a rate via search, use null for that currency
- Japan BOJ rate is near 0% (0.1–0.5% range in 2026)
- Do not hallucinate rates`;

      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305" as any, name: "web_search" } as any],
        messages: [{ role: "user", content: prompt }],
      });

      let text = "";
      for (const b of msg.content) { if (b.type === "text") text += b.text; }

      const jsonMatch = text.match(/\{[^}]*"USD"[^}]*\}/s);
      if (jsonMatch) {
        const aiRates = JSON.parse(jsonMatch[0]) as Record<string, number>;
        // Merge: official APIs override AI for the currencies we have
        const merged: Record<string, number> = {};
        for (const c of allCurrencies) {
          if (officialRates[c] !== undefined) {
            merged[c] = officialRates[c];
          } else if (aiRates[c] !== undefined && aiRates[c] !== null) {
            merged[c] = aiRates[c];
          }
        }
        if (Object.keys(merged).length >= 6) {
          ratesCache = { data: merged, timestamp: Date.now(), source: "official_apis+web_search" };
          res.json({ rates: merged, cached: false, source: "official_apis+web_search", fetchedAt: new Date().toISOString() });
          return;
        }
      }
    } catch (e: any) {
      console.error("[central-bank-rates] Anthropic web_search failed:", e.message);
    }
  }

  // ── Step 3: If we got at least ECB + BoC from official APIs, use Groq for rest ─
  if (groqKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 256,
          messages: [{
            role: "user",
            content: `Today is ${today}. Based on your knowledge of central bank policies and recent rate decisions, what are the current official policy rates for: Federal Reserve (USD), Bank of England (GBP), Bank of Japan (JPY), Swiss National Bank (CHF)? (Note: ECB EUR=${ecbRate ?? "unknown"}, RBA AUD=${rbaRate ?? "unknown"}, RBNZ NZD=${rbnzRate ?? "unknown"}, BoC CAD=${bocRate ?? "unknown"} are already known from official sources.) Return ONLY valid JSON: {"USD":X.XX,"GBP":X.XX,"JPY":X.XX,"CHF":X.XX}`
          }],
        }),
      });
      if (response.ok) {
        const d = await response.json() as any;
        const groqText = d.choices?.[0]?.message?.content || "";
        const jsonMatch = groqText.match(/\{[^}]*(?:"USD"|"GBP"|"JPY")[^}]*\}/s);
        if (jsonMatch) {
          const groqRates = JSON.parse(jsonMatch[0]) as Record<string, number>;
          const merged: Record<string, number> = { ...groqRates, ...officialRates };
          ratesCache = { data: merged, timestamp: Date.now(), source: "official_apis+groq" };
          res.json({ rates: merged, cached: false, source: "official_apis+groq", fetchedAt: new Date().toISOString() });
          return;
        }
      }
    } catch (e: any) {
      console.error("[central-bank-rates] Groq fallback failed:", e.message);
    }
  }

  // ── Step 4: Final fallback — May 2026 data merged with official API results ───
  const fallback: Record<string, number> = {
    USD: 3.75, EUR: ecbRate ?? 2.15, GBP: 4.00, JPY: 0.75,
    CHF: 0.00, AUD: rbaRate ?? 3.85, NZD: rbnzRate ?? 3.00, CAD: bocRate ?? 2.50,
  };
  ratesCache = { data: fallback, timestamp: Date.now(), source: "fallback" };
  res.json({ rates: fallback, cached: false, source: "fallback", fetchedAt: new Date().toISOString() });
});

// ── Official central bank API fetchers — free, no auth needed ─────────────────

async function fetchECBRate(): Promise<number | null> {
  try {
    const url = "https://data.ecb.europa.eu/api/data/FM/B.U2.EUR.4F.KR.MRR_FR.LEV?lastNObservations=1&format=jsondata";
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "JJNexusPro/2.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const obs = data?.dataSets?.[0]?.series?.["0:0:0:0:0:0"]?.observations;
    if (!obs) return null;
    const keys = Object.keys(obs).sort((a, b) => +b - +a);
    const latest = obs[keys[0]]?.[0];
    if (typeof latest === "number" && latest >= 0 && latest < 20) return latest;
    return null;
  } catch { return null; }
}

async function fetchBoCRate(): Promise<number | null> {
  // Bank of Canada Valet API — official, free, JSON
  // V39079 = Target for the overnight rate
  try {
    const url = "https://www.bankofcanada.ca/valet/observations/V39079/json?recent=1";
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "JJNexusPro/2.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const obs = data?.observations;
    if (!Array.isArray(obs) || obs.length === 0) return null;
    const val = obs[obs.length - 1]?.V39079?.v;
    if (val !== undefined && !isNaN(+val)) return +val;
    return null;
  } catch { return null; }
}

async function fetchRBARate(): Promise<number | null> {
  // Reserve Bank of Australia — F1 table (cash rate target)
  try {
    const url = "https://www.rba.gov.au/statistics/tables/json/f1.json";
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "JJNexusPro/2.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    // RBA F1 JSON: find cash rate target series
    const series = data?.series ?? data?.data;
    if (!series) return null;
    // Look for the cash rate target
    for (const key of Object.keys(series)) {
      const s = series[key];
      const title = (s?.title ?? s?.name ?? "").toLowerCase();
      if (title.includes("cash rate") && title.includes("target")) {
        const obs = s?.observations ?? s?.values;
        if (Array.isArray(obs) && obs.length > 0) {
          const last = obs[obs.length - 1];
          const v = Array.isArray(last) ? last[1] : last?.value;
          if (v !== undefined && !isNaN(+v) && +v >= 0 && +v < 20) return +v;
        }
      }
    }
    return null;
  } catch { return null; }
}

async function fetchRBNZRate(): Promise<number | null> {
  // Reserve Bank of New Zealand — B2 table (official cash rate)
  try {
    const url = "https://www.rbnz.govt.nz/api/v1/series/B2/observations?recent=1";
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "JJNexusPro/2.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    // Try to extract the latest OCR value
    const observations = data?.observations ?? data?.data;
    if (Array.isArray(observations) && observations.length > 0) {
      const last = observations[observations.length - 1];
      const v = last?.value ?? last?.[1];
      if (v !== undefined && !isNaN(+v) && +v >= 0 && +v < 20) return +v;
    }
    return null;
  } catch { return null; }
}

// ── RSS proxy — fetch RSS feeds server-side to avoid CORS ────────────────────
router.get("/rss", async (req, res) => {
  const url = (req.query.url as string) || "";
  if (!url) { res.status(400).json({ error: "url required" }); return; }
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JJNexusPro/2.0; RSS Reader)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) { res.status(resp.status).json({ error: "RSS fetch failed" }); return; }
    const xml = await resp.text();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(xml);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── FX News Headlines (multi-source with fallback) ────────────────────────────
let newsCache: { data: any[]; timestamp: number } | null = null;
const NEWS_TTL = 30 * 1000; // 30 seconds — fast refresh for market-sensitive news

// ── All news sources fetched simultaneously in parallel ───────────────────────
// Only sources confirmed reachable from the server are listed here.
// Note: FinancialJuice has no public RSS (WebSocket-only feed).
//       FXStreet, DailyFX, CNBC, BabyPips block server-side requests (403).
const FX_NEWS_SOURCES = [
  // FX-specific — highest signal, fastest-moving
  { name: "ForexLive",     url: "https://www.forexlive.com/feed/news",                         category: "FX News",    timeout: 6000 },
  { name: "ForexCrunch",   url: "https://www.forexcrunch.com/feed/",                            category: "FX Analysis", timeout: 8000 },
  // Macro / markets
  { name: "Investing.com", url: "https://www.investing.com/rss/news.rss",                      category: "Markets",    timeout: 6000 },
  { name: "MarketWatch",   url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",  category: "Markets",    timeout: 6000 },
  { name: "WSJ Markets",   url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",               category: "Markets",    timeout: 6000 },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/rss/topfinstories",                 category: "Markets",    timeout: 6000 },
  { name: "ZeroHedge",     url: "https://feeds.feedburner.com/zerohedge/feed",                 category: "Markets",    timeout: 6000 },
  // General business
  { name: "Reuters",       url: "https://feeds.reuters.com/reuters/businessNews",               category: "Business",   timeout: 6000 },
  { name: "BBC Business",  url: "https://feeds.bbci.co.uk/news/business/rss.xml",              category: "Business",   timeout: 6000 },
];

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'",
  "&apos;": "'", "&nbsp;": " ", "&#8217;": "'", "&#8216;": "'",
  "&#8220;": '"', "&#8221;": '"', "&#8211;": "–", "&#8212;": "—",
};

function decodeHtml(str: string): string {
  return str.replace(/&[a-zA-Z0-9#]+;/g, e => HTML_ENTITIES[e] ?? e);
}

function stripTags(str: string): string {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Parses both RSS <item> and Atom <entry> formats
function parseXmlFeed(xml: string, sourceName: string, defaultCategory: string): any[] {
  const items: any[] = [];
  // Detect format: Atom uses <entry>, RSS uses <item>
  const isAtom = xml.includes("<feed") || xml.includes("<entry>");
  const blockTag = isAtom ? "entry" : "item";
  const blockRegex = new RegExp(`<${blockTag}[^>]*>([\\s\\S]*?)<\\/${blockTag}>`, "g");
  let match;

  while ((match = blockRegex.exec(xml)) !== null && items.length < 15) {
    const block = match[1];

    const getText = (tag: string): string => {
      // CDATA
      const cdataM = block.match(new RegExp(`<${tag}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
      if (cdataM) return cdataM[1].trim();
      // Normal tag
      const normM = block.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`));
      if (normM) return stripTags(normM[1]).trim();
      return "";
    };

    const getAttr = (tag: string, attr: string): string => {
      const m = block.match(new RegExp(`<${tag}[^>]+${attr}="([^"]+)"`));
      return m ? m[1] : "";
    };

    const title = decodeHtml(getText("title")).slice(0, 200);
    if (!title || title.length < 4) continue;

    // Link: Atom uses <link href="..."> or <link>url</link>; RSS uses <link>
    const link = getAttr("link", "href") ||
      getText("link") ||
      block.match(/<link>([^<\s][^<]*)<\/link>/)?.[1]?.trim() || "";

    // Date: try multiple fields
    const rawDate = getText("pubDate") || getText("dc:date") ||
      getText("published") || getText("updated") || "";
    const ts = rawDate ? new Date(rawDate).getTime() : Date.now();

    // Description/summary
    const desc = decodeHtml(
      stripTags(getText("description") || getText("summary") || getText("content") || "")
    ).slice(0, 220);

    const category = decodeHtml(getText("category") || getText("dc:subject") || defaultCategory);

    items.push({
      title,
      link,
      pubDate: rawDate,
      description: desc,
      category,
      source: sourceName,
      timestamp: isNaN(ts) ? Date.now() : ts,
    });
  }
  return items;
}

// Fetch a single source with its own configured timeout
async function fetchSource(source: { name: string; url: string; category: string; timeout?: number }): Promise<any[]> {
  try {
    const resp = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Referer": new URL(source.url).origin,
      },
      signal: AbortSignal.timeout(source.timeout ?? 6000),
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseXmlFeed(xml, source.name, source.category);
  } catch {
    return [];
  }
}

router.get("/fxstreet-news", async (_req, res) => {
  // Serve from cache if fresh
  if (newsCache && Date.now() - newsCache.timestamp < NEWS_TTL) {
    res.setHeader("Cache-Control", "public, max-age=15");
    res.json(newsCache.data);
    return;
  }

  // Fetch ALL sources simultaneously in parallel — fastest possible
  const results = await Promise.allSettled(FX_NEWS_SOURCES.map(fetchSource));

  const allItems: any[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allItems.push(...r.value);
  }

  if (allItems.length === 0) {
    // All sources failed — return stale cache if available
    if (newsCache) { res.json(newsCache.data); return; }
    res.status(503).json({ error: "All news sources unavailable" });
    return;
  }

  // Deduplicate by title (normalized), sort newest first
  const seen = new Set<string>();
  const deduped = allItems
    .filter(item => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 60); // cap at 60 articles

  newsCache = { data: deduped, timestamp: Date.now() };
  res.setHeader("Cache-Control", "public, max-age=15");
  res.json(deduped);
});

export default router;
