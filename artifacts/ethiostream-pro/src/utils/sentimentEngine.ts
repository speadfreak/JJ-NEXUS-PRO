import { getPrice } from './priceEngine'
import { callAlchemistAI } from './freeAI'

export interface SentimentData {
  pair: string
  sentiment: 'Strongly Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strongly Bearish'
  score: number
  retailLong: string
  retailShort: string
  institutionalBias: string
  smartMoneyBias: string
  reason: string
  keyLevel: string
  trend: string
  momentum: string
  weeklyBias: string
  dailyBias: string
  h4Bias: string
  fearGreed: string
  lastUpdated: string
  longPositions?: number
  shortPositions?: number
}

async function fetchMyfxbook(pair: string): Promise<Partial<SentimentData>> {
  try {
    const symbol = pair.toLowerCase().replace('/', '').replace('xau', 'gold').replace('usd', '').replace('eur', 'eur').replace('gbp', 'gbp')
    const url = `https://www.myfxbook.com/api/get-community-outlook.json?pair=${pair.toLowerCase()}`
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
    const wrapper = await res.json()
    const data = JSON.parse(wrapper.contents)
    if (data?.symbols?.[0]) {
      const sym = data.symbols[0]
      const longPct = parseFloat(sym.longPercentage)
      return {
        retailLong: `${sym.longPercentage}%`,
        retailShort: `${sym.shortPercentage}%`,
        longPositions: sym.longPositions,
        shortPositions: sym.shortPositions,
        institutionalBias: longPct > 65 ? 'Bearish' : longPct < 35 ? 'Bullish' : 'Neutral',
      }
    }
  } catch {}
  return {}
}

export async function fetchRealSentiment(pair: string): Promise<SentimentData> {
  const livePrice = getPrice(pair) || getPrice(pair.replace('/', ''))

  const [myfxbookData] = await Promise.allSettled([fetchMyfxbook(pair)])
  const retail = myfxbookData.status === 'fulfilled' ? myfxbookData.value : {}

  const aiPrompt = `Analyze current market sentiment for ${pair}${livePrice > 0 ? ` at live price ${livePrice}` : ''}.
Based on current market structure, price action, and macro conditions:
Return ONLY this exact JSON (no markdown, no code blocks, no other text):
{"sentiment":"Bullish","score":68,"retailLong":"${retail.retailLong || '55%'}","retailShort":"${retail.retailShort || '45%'}","institutionalBias":"${retail.institutionalBias || 'Bearish'}","smartMoneyBias":"Accumulating Longs","reason":"2-3 sentence explanation of current sentiment and why","keyLevel":"${livePrice > 0 ? livePrice.toFixed(2) : '0'}","trend":"Uptrend","momentum":"Moderate","weeklyBias":"Bullish","dailyBias":"Bullish","h4Bias":"Neutral","fearGreed":"Greed","lastUpdated":"${new Date().toISOString()}"}`

  try {
    const aiResponse = await callAlchemistAI(aiPrompt, livePrice, pair)
    const match = aiResponse.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return {
        pair,
        sentiment: parsed.sentiment || 'Neutral',
        score: parsed.score || 50,
        retailLong: retail.retailLong || parsed.retailLong || '50%',
        retailShort: retail.retailShort || parsed.retailShort || '50%',
        institutionalBias: retail.institutionalBias || parsed.institutionalBias || 'Neutral',
        smartMoneyBias: parsed.smartMoneyBias || 'Neutral',
        reason: parsed.reason || 'Market analysis complete.',
        keyLevel: parsed.keyLevel || livePrice.toFixed(2),
        trend: parsed.trend || 'Ranging',
        momentum: parsed.momentum || 'Moderate',
        weeklyBias: parsed.weeklyBias || 'Neutral',
        dailyBias: parsed.dailyBias || 'Neutral',
        h4Bias: parsed.h4Bias || 'Neutral',
        fearGreed: parsed.fearGreed || 'Neutral',
        lastUpdated: new Date().toISOString(),
        longPositions: retail.longPositions,
        shortPositions: retail.shortPositions,
      }
    }
  } catch {}

  return {
    pair,
    sentiment: 'Neutral',
    score: 50,
    retailLong: retail.retailLong || '50%',
    retailShort: retail.retailShort || '50%',
    institutionalBias: retail.institutionalBias || 'Neutral',
    smartMoneyBias: 'Neutral',
    reason: 'Unable to fetch sentiment at this time.',
    keyLevel: livePrice.toFixed(2),
    trend: 'Ranging',
    momentum: 'Moderate',
    weeklyBias: 'Neutral',
    dailyBias: 'Neutral',
    h4Bias: 'Neutral',
    fearGreed: 'Neutral',
    lastUpdated: new Date().toISOString(),
  }
}
