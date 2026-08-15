// claudeAPI.ts — Routes through backend AI endpoint (Groq-first, then Replit Anthropic)
// Used by: Seasonality.tsx, Teleprompter.tsx

const today = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
})

const getKey = (k: string) =>
  typeof window !== 'undefined' ? localStorage.getItem(k) || '' : ''

export function getAIHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // Send ALL available keys — backend picks best in priority order
  const grok = getKey('jjnexus_grok_key')
  if (grok) headers['x-grok-key'] = grok
  const groq = getKey('jjnexus_groq_key')
  if (groq) headers['x-groq-key'] = groq
  // Settings saves Anthropic key as 'jjnexus_api_key' — check both
  const anthropic = getKey('jjnexus_api_key') || getKey('jjnexus_anthropic_key')
  if (anthropic) headers['x-anthropic-key'] = anthropic
  const openrouter = getKey('jjnexus_openrouter_key')
  if (openrouter) headers['x-openrouter-key'] = openrouter
  const github = getKey('jjnexus_github_token')
  if (github) headers['x-github-token'] = github
  return headers
}

async function callBackendAI(message: string): Promise<string> {
  const res = await fetch('/api/analysis/analyze', {
    method: 'POST',
    headers: getAIHeaders(),
    body: JSON.stringify({ prompt: message, stream: false }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.error || `AI error ${res.status}. Add Groq key in Settings (free at groq.com).`)
  }
  const data = await res.json()
  if (data.text && data.text.length > 20) return data.text
  throw new Error('Empty response from AI. Please try again.')
}

export const analyzeTechnical = (pair: string) =>
  callBackendAI(`
Analyze ${pair} — Full SMC/ICT Technical Analysis. Today: ${today()}

## 📊 Live Price
State the approximate current price for ${pair} (2026 market conditions — XAUUSD is $4700+)

## 🏗️ Market Structure
- HTF trend (Weekly/Daily)
- Current BOS or CHoCH location with price levels
- Recent swing high: [price] | Recent swing low: [price]

## 🟦 Order Blocks
- Bullish OB zone: [price range] — strength: high/medium/low
- Bearish OB zone: [price range] — strength: high/medium/low

## 🌀 Fair Value Gaps
- Unfilled FVG above: [price range]
- Unfilled FVG below: [price range]

## 💧 Liquidity
- Buy-side liquidity resting at: [price]
- Sell-side liquidity resting at: [price]
- Recent liquidity grab: yes/no + details

## 📈 Trade Plan
- Bias: Bullish / Bearish / Neutral
- Entry zone: [exact range]
- Stop Loss: [exact price]
- TP1: [price] | TP2: [price] | TP3: [price]
- Risk:Reward: X:1 | Confidence: X%
`)

export const analyzeFundamental = (pair: string) => {
  const base = pair.slice(0, 3)
  const quote = pair.slice(3, 6)
  return callBackendAI(`
Fundamental analysis for ${pair}. Today: ${today()}

## 🌍 Macro Overview
- ${base}: GDP, CPI, employment latest figures (2026)
- ${quote}: same metrics

## 🏦 Central Banks
- ${base} bank: rate, last decision, next meeting
- ${quote} bank: rate, last decision, next meeting
- Policy divergence: favors [direction]

## 📰 Top News This Week
1. [news] → impact: [bullish/bearish for ${base}]
2. [news] → impact: [direction]
3. [news] → impact: [direction]

## 📊 Fundamental Score
- ${base}: X/10 | ${quote}: X/10
- Overall bias: [direction] | Strength: [strong/moderate/weak]

## 📅 Key Upcoming Events
[Next 3 high-impact events with dates]
`)
}

export const analyzeConfluence = (pair: string, tech: string, fund: string) =>
  callBackendAI(`
REAL CONFLUENCE DECISION for ${pair}. Today: ${today()}

TECHNICAL DATA: ${tech}
FUNDAMENTAL DATA: ${fund}

## 🎯 Confluence Score
Technical + Fundamental agreement: X/10
Aligned factors: [list each one]

## ⚖️ Final Verdict
**Bias:** [Strongly Bullish / Bullish / Neutral / Bearish / Strongly Bearish]
**Win Probability:** X% — basis: [explain]

## 📋 Complete Trade Plan
| | |
|---|---|
| Entry | [exact price or zone] |
| Stop Loss | [price + reason] |
| TP1 | [price] — partial close 50% |
| TP2 | [price] — partial close 30% |
| TP3 | [price] — full exit |
| R:R | X:1 |
| Risk | 1-2% max |

## ⚠️ Invalidation
Bull invalidated below: [price]
Bear invalidated above: [price]

## ⭐ Trade Rating: X/5
[Explanation of rating]
`)

export const analyzeSentiment = (pair: string) =>
  callBackendAI(`
Sentiment analysis for ${pair}. Today: ${today()}

Return ONLY this JSON (no markdown, no code blocks):
{"sentiment":"Bullish","score":72,"retailLong":"58%","retailShort":"42%","institutionalBias":"Bullish","smartMoneyBias":"Accumulating","reason":"Explanation of current sentiment","keyLevel":"4710.00","trend":"Uptrend","momentum":"Strong","fearGreedIndex":72,"positioningNote":"COT/institutional notes","lastUpdated":"${today()}"}
`)

export const runBacktest = (pair: string, strategy: string, period: string) =>
  callBackendAI(`
Deep backtest analysis: ${pair} | ${strategy} | ${period}. Today: ${today()}

## 📊 Backtest Summary
| Metric | Value |
|--------|-------|
| Total Trades | X |
| Win Rate | X% |
| Profit Factor | X.XX |
| Max Drawdown | X% |
| Avg Win | X pips |
| Avg Loss | X pips |
| Sharpe Ratio | X.XX |
| Net Return | X% |

## 📅 Monthly Breakdown
[Month-by-month P&L for the period]

## 🏆 Best 5 Setups
[Date, entry, result, why it worked]

## ❌ Worst 5 Setups — Lessons
[Date, what failed, lesson]

## 💡 Optimization Findings
[How to improve this strategy on ${pair}]
`)

export const ghostCoPilot = (pair: string, currentPrice: string) =>
  callBackendAI(`
Ghost AI whisper for live stream. ${pair} at ${currentPrice}. Today: ${today()}

Generate a SHORT, spoken-word trading alert (max 3 sentences) for a live stream.
Start with the setup type, give the price level, give the action.
Example: "Gold has just tapped the bearish order block at 4,712. This is a high-probability sell setup. Consider entries between 4,710 and 4,715 with a stop above 4,725."
Be direct. No fluff. Use the current price ${currentPrice} as reference.
`)

export const sessionOracle = () =>
  callBackendAI(`
Session Oracle analysis. Today: ${today()}, Time: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC

Based on current UTC time, which forex sessions are active? Provide:

## 🌍 Active Sessions Right Now
[Which sessions are open: Sydney/Tokyo/London/New York/Overlap]

## 🏆 Top 3 Pairs to Trade Right Now
1. [PAIR] — reason + expected volatility
2. [PAIR] — reason
3. [PAIR] — reason

## 💡 Session Intelligence
- Pairs to AVOID right now: [list + reason]
- Best strategy for current session: [trending/ranging/breakout]
- Next major session opens in: [time]
`)

export const generateStreamScript = (pair: string, analysis: string) =>
  callBackendAI(`
Write a professional live stream teleprompter script for a forex educator streaming about ${pair}.
Based on this market context: ${analysis.slice(0, 800)}

Script should be 5-7 minutes when read aloud at a natural pace.

[ENERGETIC INTRO - 15 seconds]
Welcome intro + hook

[MARKET OVERVIEW - 1 minute]
Current market conditions for ${pair}

[CHART ANALYSIS - 2 minutes]
Walk through the chart setup, key levels, structure

[TRADE SETUP - 1.5 minutes]
The specific opportunity, entry, SL, TP

[RISK MANAGEMENT - 1 minute]
Position sizing, risk rules

[OUTRO - 30 seconds]
Call to action, sign off

Include [PAUSE] markers and [CHART: show X] stage directions.
Keep it educational, engaging, and professional.
`)

export const weeklyReportCard = (journalEntries: string) =>
  callBackendAI(`
Generate a weekly trading performance report. Today: ${today()}
Journal data: ${journalEntries.slice(0, 2000)}

## 📊 JJ NEXUS PRO — Weekly Report Card
**Week of:** [dates]

### Performance Summary
| Metric | This Week | Trend |
|--------|-----------|-------|
| Win Rate | X% | ↑/↓ |
| Total Trades | X | |
| Best Trade | +X pips | |
| Worst Trade | -X pips | |
| Net Result | +/-X pips | |

### Psychological Pattern Analysis
[AI identifies recurring behavior patterns from journal]

### Most Common Mistake This Week
[Specific pattern with example]

### Top Improvement Tip
[One specific, actionable change for next week]

### Next Week Preview
[Key events, best pairs, market conditions]

### Overall Grade: A/B/C/D
[Brief explanation]
`)

export const analyzeSeasonality = (pair: string, period: string) =>
  callBackendAI(`
Seasonality and historical pattern analysis for ${pair} over ${period}. Today: ${today()}

## 📅 Monthly Bias (12 months)
For each month Jan-Dec provide:
- Month name: Average directional bias (Bullish/Bearish/Neutral) + brief reason

## 📆 Day-of-Week Patterns
- Monday: bias + reason
- Tuesday: bias + reason
- Wednesday: bias + reason
- Thursday: bias + reason
- Friday: bias + reason

## ⏰ Intraday Session Volatility for ${pair}
- Asian session (00:00-09:00 UTC): volatility level
- London open (07:00-10:00 UTC): volatility level
- New York open (13:00-16:00 UTC): volatility level
- London close (16:00-17:00 UTC): volatility level

## 🤖 AI Seasonal Intelligence
[3-4 sentences on seasonal patterns, current positioning, what to expect]

## 📊 Current Month Bias
[Specific analysis for the current month: ${new Date().toLocaleString('en-US', { month: 'long' })}]
`)

export const currencyStrengthCommentary = (strengthData: string) =>
  callBackendAI(`
Analyze this currency strength data and provide professional commentary:
${strengthData}

Provide a 2-3 sentence commentary on what the strength data means for traders right now.
Focus on the strongest and weakest currencies, best pair combinations, and any notable divergences.
`)
