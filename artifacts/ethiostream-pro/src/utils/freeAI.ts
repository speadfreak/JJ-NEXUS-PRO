const getToday = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
})

const API_BASE = '/api'

function getGroqKey(): string {
  return typeof window !== 'undefined' ? localStorage.getItem('jjnexus_groq_key') || '' : ''
}

function getGrokKey(): string {
  return typeof window !== 'undefined' ? localStorage.getItem('jjnexus_grok_key') || '' : ''
}

function getAnthropicKey(): string {
  // Settings page saves as 'jjnexus_api_key' — check both for backwards compat
  return typeof window !== 'undefined'
    ? localStorage.getItem('jjnexus_api_key') || localStorage.getItem('jjnexus_anthropic_key') || ''
    : ''
}

function getOpenRouterKey(): string {
  return typeof window !== 'undefined' ? localStorage.getItem('jjnexus_openrouter_key') || '' : ''
}

export function getAIHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // Send ALL available keys — backend picks best in priority order
  const grokKey = getGrokKey()
  if (grokKey) headers['x-grok-key'] = grokKey
  const groqKey = getGroqKey()
  if (groqKey) headers['x-groq-key'] = groqKey
  const anthropicKey = getAnthropicKey()
  if (anthropicKey) headers['x-anthropic-key'] = anthropicKey
  const openrouterKey = getOpenRouterKey()
  if (openrouterKey) headers['x-openrouter-key'] = openrouterKey
  const githubToken = typeof window !== 'undefined' ? localStorage.getItem('jjnexus_github_token') || '' : ''
  if (githubToken) headers['x-github-token'] = githubToken
  return headers
}

const ALCHEMIST_SYSTEM_PROMPT = (today: string, livePrice?: string) => `
You are ALCHEMIST AI — the most elite Smart Money Concepts trading intelligence ever built, deeply trained in the Alchemist strategy methodology. You live inside JJ NEXUS PRO.

TODAY: ${today}
${livePrice ? `LIVE MARKET PRICE (fetched from real-time API): ${livePrice} — USE THIS EXACT PRICE ONLY` : ''}

=== YOUR COMPLETE TRAINING: THE ALCHEMIST STRATEGY ===

MARKET STRUCTURE (MS):
- Higher Highs (HH) + Higher Lows (HL) = Bullish structure
- Lower Highs (LH) + Lower Lows (LL) = Bearish structure  
- Break of Structure (BOS) = continuation signal in trend direction
- Change of Character (CHoCH) = first sign of reversal, most important signal
- Market Structure Shift (MSS) = confirmed reversal after CHoCH + BOS in opposite direction
- Always analyze from Daily → H4 → H1 → M15 top-down. Higher timeframe structure dominates.

ORDER BLOCKS (OB):
- Bullish OB: last bearish candle before a strong bullish impulse move (imbalance candle)
- Bearish OB: last bullish candle before a strong bearish impulse move
- High quality OB requirements: strong impulse away, not yet tested, above/below 50% of range, near a liquidity zone
- Mitigation: OB is mitigated when price returns and closes through it — it is then invalidated
- OB quality rating: impulse strength (1-3) + liquidity nearby (1-3) + timeframe (1-4) = max 10
- Best OBs: Daily OB confluent with H4 OB = institutional interest

FAIR VALUE GAPS (FVG):
- Three consecutive candles where candle 1 high does not overlap with candle 3 low (bullish FVG) or candle 1 low does not overlap with candle 3 high (bearish FVG)
- Price always seeks to fill imbalances eventually — FVGs act as price magnets
- Optimal entry is 50% of the FVG (equilibrium point)
- FVG inside an OB = extremely high probability entry zone
- Inverse FVG: when price fills an FVG and continues — signals strong momentum

LIQUIDITY (LQ):
- Buy-side liquidity (BSL): equal highs, previous day high, round numbers above current price — retail buy stops sit here
- Sell-side liquidity (SSL): equal lows, previous day low, round numbers below current price — retail sell stops sit here
- Smart money ALWAYS hunts liquidity before reversing — this is the Judas Swing / liquidity sweep
- After sweeping BSL → expect bearish reversal. After sweeping SSL → expect bullish reversal

ALCHEMIST ENTRY MODEL:
1. Identify HTF (Daily/H4) market structure and bias
2. Wait for price to reach a premium/discount zone (Fibonacci: premium above 50%, discount below 50%)
3. Confirm liquidity sweep at that zone (stop hunt / wick beyond equal highs/lows)
4. Wait for CHoCH on the entry timeframe (M15 or H1) — first sign of reversal
5. Identify the OB that caused the CHoCH
6. Enter at the OB on retracement (with FVG as confirmation)
7. Stop loss: below the OB (or below the liquidity sweep wick)
8. Take profit: nearest liquidity on opposite side, HTF FVG, or previous structure

SESSIONS (ALCHEMIST TIMING):
- Asian session (00:00-09:00 UTC): liquidity building, creates range that London breaks
- London open (07:00-10:00 UTC): most important session, highest probability setups
- New York open (13:00-16:00 UTC): second highest probability, often reverses London
- Kill zones: London 07:00-09:00 UTC and NY 13:00-15:00 UTC — ONLY enter during these windows

GOLD (XAUUSD) SPECIFIC — 2026:
- Current price range: $4600-$4800+ (never use outdated pre-2026 prices)
- Gold is driven by DXY inverse correlation, geopolitical risk, Fed policy
- Key levels are round numbers: 4600, 4650, 4700, 4720, 4750, 4800
- 1 pip = $0.01 for standard lot ($10/pip)

=== RESPONSE RULES ===
- ALWAYS use the live price provided. Never use training data prices.
- Always give specific price levels based on the current live price.
- Always explain the WHY in Alchemist terminology.
- Be direct and actionable — a trader must be able to act immediately.
- Format in clean markdown with clear section headers.
- End every response: "— Alchemist AI | JJ NEXUS PRO | ${today}"
`

// ── Primary: Backend AI (uses Groq key if provided, else Replit integration) ──
async function callBackendAI(prompt: string, livePrice?: number, pair?: string): Promise<string> {
  const systemPrompt = ALCHEMIST_SYSTEM_PROMPT(
    getToday(),
    livePrice && pair ? `${pair} = ${livePrice.toFixed(livePrice > 500 ? 2 : pair?.includes('JPY') ? 3 : 5)}` : undefined
  )
  const res = await fetch(`${API_BASE}/analysis/analyze`, {
    method: 'POST',
    headers: getAIHeaders(),
    body: JSON.stringify({ prompt, pair, livePrice, stream: false, systemPrompt }),
  })
  if (!res.ok) throw new Error(`Backend AI error: ${res.status}`)
  const data = await res.json()
  if (data.text && data.text.length > 30) return data.text
  throw new Error('Empty response from backend AI')
}

// ── Fallback: Groq direct (if user configured key in Settings) ────────────────
async function callGroqDirect(prompt: string, livePrice?: number, pair?: string): Promise<string> {
  const key = getGroqKey()
  if (!key) throw new Error('No Groq key')
  const systemPrompt = ALCHEMIST_SYSTEM_PROMPT(
    getToday(),
    livePrice && pair ? `${pair} = ${livePrice.toFixed(livePrice > 500 ? 2 : pair?.includes('JPY') ? 3 : 5)}` : undefined
  )
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4000, temperature: 0.15
    })
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ── Fallback: GitHub Models ───────────────────────────────────────────────────
async function callGitHubModels(prompt: string, livePrice?: number, pair?: string): Promise<string> {
  const token = localStorage.getItem('jjnexus_github_token') || ''
  if (!token) throw new Error('No GitHub token')
  const systemPrompt = ALCHEMIST_SYSTEM_PROMPT(
    getToday(),
    livePrice && pair ? `${pair} = ${livePrice.toFixed(livePrice > 500 ? 2 : pair?.includes('JPY') ? 3 : 5)}` : undefined
  )
  const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      max_tokens: 2500
    })
  })
  if (!res.ok) throw new Error(`GitHub Models ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ── Fallback: OpenRouter ──────────────────────────────────────────────────────
async function callOpenRouter(prompt: string, livePrice?: number, pair?: string): Promise<string> {
  const key = localStorage.getItem('jjnexus_openrouter_key') || ''
  if (!key) throw new Error('No OpenRouter key')
  const systemPrompt = ALCHEMIST_SYSTEM_PROMPT(
    getToday(),
    livePrice && pair ? `${pair} = ${livePrice.toFixed(livePrice > 500 ? 2 : pair?.includes('JPY') ? 3 : 5)}` : undefined
  )
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://jjnexuspro.replit.app',
      'X-Title': 'JJ NEXUS PRO'
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      max_tokens: 2500
    })
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ── Main entry — backend first (with Groq key passthrough), then direct fallbacks ──
export async function callAlchemistAI(
  prompt: string,
  livePrice?: number,
  pair?: string
): Promise<string> {
  const priceContext = livePrice && livePrice > 0
    ? `\n\nCURRENT LIVE PRICE (fetched from real-time API): ${pair || 'Asset'} = ${livePrice.toFixed(pair?.includes('JPY') ? 3 : livePrice > 500 ? 2 : 5)}\nUse ONLY this price. Do not use any other price.`
    : ''

  const fullPrompt = priceContext + '\n\n' + prompt

  // Priority 1: Backend (uses Groq key from header, falls back to Replit integration)
  try {
    const result = await callBackendAI(fullPrompt, livePrice, pair)
    if (result && result.length > 50) return result
  } catch (e: any) {
    console.warn('Backend AI failed, trying fallbacks:', e.message)
  }

  // Priority 2: Groq direct (if user has key stored)
  // Priority 3: GitHub Models, Priority 4: OpenRouter
  const fallbacks = [
    { name: 'Groq', fn: () => callGroqDirect(fullPrompt, livePrice, pair) },
    { name: 'GitHub Models', fn: () => callGitHubModels(fullPrompt, livePrice, pair) },
    { name: 'OpenRouter', fn: () => callOpenRouter(fullPrompt, livePrice, pair) },
  ]

  for (const fb of fallbacks) {
    try {
      const result = await fb.fn()
      if (result && result.length > 50) {
        console.log(`AI fallback used: ${fb.name}`)
        return result
      }
    } catch { continue }
  }

  return `## ⚠️ AI Temporarily Unavailable

The AI system requires a **Groq API key** (free, no credit card needed).

**To fix this in 2 minutes:**
1. Go to **groq.com** → Sign up free
2. Create an API Key (starts with \`gsk_...\`)
3. Go to **Settings → API & Keys** in JJ NEXUS PRO
4. Paste your key and save

Groq is completely free with 14,400 requests/day.

— Alchemist AI | JJ NEXUS PRO`
}

export const analyzeTechnical = (pair: string, livePrice: number) =>
  callAlchemistAI(`
Analyze ${pair} using the full Alchemist SMC methodology.

LIVE PRICE: ${livePrice} (use this exact price for all levels)

## 🏗️ Market Structure (HTF → LTF)
- Weekly/Daily bias and trend
- H4 structure: current BOS or CHoCH with exact price
- H1 entry structure event

## 🟦 Order Blocks
- Nearest Bullish OB: [price zone] — quality rating X/10
- Nearest Bearish OB: [price zone] — quality rating X/10
- Has it been mitigated? Y/N

## 🌀 Fair Value Gaps
- Open FVG above: [range] — timeframe
- Open FVG below: [range] — timeframe
- FVG inside OB? Y/N (if yes = highest priority zone)

## 💧 Liquidity Map
- Buy-side liquidity (BSL) resting above: [exact price]
- Sell-side liquidity (SSL) resting below: [exact price]
- Most likely liquidity target: [price]

## 📐 Premium/Discount
- Current Fibonacci position: Premium / Equilibrium / Discount
- OTE zone: [exact range]

## 📈 Trade Plan (relative to live price: ${livePrice})
- **Bias:** Bullish / Bearish / Neutral
- **Entry zone:** [exact range]
- **Stop Loss:** [exact price] — why here
- **TP1:** [price] — 50% close
- **TP2:** [price] — 30% close  
- **TP3:** [price] — full exit
- **R:R:** X:1
- **Confluence score:** X/6 criteria met
- **Grade:** A+ / A / B / No Trade
`, livePrice, pair)

export const analyzeFundamental = (pair: string, livePrice: number) => {
  const base = pair.slice(0, 3)
  const quote = pair.slice(3, 6)
  return callAlchemistAI(`
Fundamental analysis for ${pair}. LIVE PRICE: ${livePrice}. Today: ${getToday()}

## 🌍 Macro Overview
- ${base}: GDP, CPI, employment latest figures
- ${quote}: same metrics

## 🏦 Central Banks
- ${base} bank: rate, last decision, next meeting
- ${quote} bank: rate, last decision, next meeting
- Policy divergence: favors [direction]

## 📰 Top News This Week
1. [news item] → impact: bullish/bearish for ${base}
2. [news item] → impact: [direction]
3. [news item] → impact: [direction]

## 📊 Fundamental Score
- ${base}: X/10 | ${quote}: X/10
- Overall bias: [direction] | Strength: [strong/moderate/weak]

## 📅 Key Upcoming Events
[Next 3 high-impact events with dates and expected impact]
`, livePrice, pair)
}

export const analyzeConfluence = (pair: string, livePrice: number) =>
  callAlchemistAI(`
Complete confluence analysis for ${pair}. LIVE PRICE: ${livePrice}

Run the full Alchemist confluence engine across all 6 criteria:
1. HTF structure supports direction — Score: X/20%
2. Price in premium/discount zone — Score: X/15%
3. Liquidity swept before entry — Score: X/20%
4. CHoCH confirmed on entry TF — Score: X/15%
5. Valid OB at entry zone — Score: X/15%
6. Correct session (London/NY kill zone) — Score: X/15%

## 🎯 Confluence Score
Total: X% — Grade: A+ / A / B / No Trade

## ⚖️ Final Verdict
**Bias:** [Strongly Bullish / Bullish / Neutral / Bearish / Strongly Bearish]
**Win Probability:** X%

## 📋 Complete Trade Plan
- Entry: [exact range]
- Stop Loss: [price + reason]
- TP1: [price] — close 50%
- TP2: [price] — close 30%
- TP3: [price] — full exit
- R:R: X:1

## ⚠️ Invalidation
- Bull case invalidated below: [price]
- Bear case invalidated above: [price]
`, livePrice, pair)

export const analyzeSentiment = (pair: string, livePrice: number) =>
  callAlchemistAI(`
Market sentiment analysis for ${pair}. LIVE PRICE: ${livePrice}. Today: ${getToday()}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "sentiment": "Bullish",
  "score": 72,
  "retailLong": "58%",
  "retailShort": "42%",
  "institutionalBias": "Bullish",
  "smartMoneyBias": "Accumulating Longs",
  "reason": "2-3 sentence explanation based on current conditions",
  "keyLevel": "${livePrice.toFixed(livePrice > 500 ? 0 : 2)}",
  "trend": "Uptrend",
  "momentum": "Strong",
  "fearGreedIndex": 65,
  "positioningNote": "Brief COT/institutional positioning note",
  "lastUpdated": "${new Date().toISOString()}"
}
`, livePrice, pair)

export const ghostCoPilotFree = (pair: string, livePrice: number) =>
  callAlchemistAI(`
Ghost AI trading whisper for ${pair}. Current live price: ${livePrice}

Generate a SHORT spoken-word trading alert (max 3 sentences) for a live stream.
Be like an elite trader whispering to another trader mid-stream.
Format: Setup type → price level → action. No fluff. Specific prices based on ${livePrice}.
`, livePrice, pair)

export const sessionOracle = (currentSession: string, activePairs: string[]) =>
  callAlchemistAI(`
Session Oracle analysis. Today: ${getToday()}, Current UTC time: ${new Date().toUTCString()}
Active session: ${currentSession}
Potentially active pairs: ${activePairs.join(', ')}

Provide:
1. Current session status and what this means for traders
2. Top 3 highest-probability pairs RIGHT NOW with specific reasons
3. Kill zone timing — are we in a kill zone?
4. Price action expectations for next 2-4 hours
5. Pairs to AVOID and why

Be specific. Real time-based analysis.
`)

export const sessionOracleReport = () =>
  callAlchemistAI(`
Full Session Oracle Report. Today: ${getToday()}, UTC: ${new Date().toUTCString()}

Provide a complete session intelligence report:

## 🌍 Session Status Right Now
[Which sessions: Sydney/Tokyo/London/NY — which overlap]

## 🔥 Kill Zone Analysis
[Are we in a kill zone? London 07-09 UTC, NY 13-15 UTC?]
[Next kill zone: when and which pairs]

## 🏆 Top Pairs This Session
1. [PAIR] — Score X/10 — reason
2. [PAIR] — Score X/10 — reason
3. [PAIR] — Score X/10 — reason

## ⚠️ Pairs to Avoid
[Which pairs and why — low volatility, news risk, etc.]

## 📊 Session Volatility Forecast
[Expected price action for the next 4-6 hours]

## 💡 Alchemist Session Intelligence
[2-3 sentences on best strategy type for current session]
`)
