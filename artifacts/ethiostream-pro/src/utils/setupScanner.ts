import { callAlchemistAI } from '@/utils/freeAI'

export const SCAN_PAIRS = [
  'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF',
  'AUDUSD', 'NZDUSD', 'USDCAD', 'GBPJPY', 'EURJPY',
  'EURGBP', 'XAGUSD', 'US30', 'NAS100', 'BTCUSD'
]

export interface SetupScore {
  pair: string
  score: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'No Trade'
  bias: 'Bullish' | 'Bearish' | 'Neutral'
  probability: number
  entry: string
  stopLoss: string
  tp1: string
  tp2?: string
  tp3?: string
  riskReward: number
  confluenceCount: number
  criteria: {
    htfStructure: boolean
    premiumDiscount: boolean
    liquiditySweep: boolean
    choch: boolean
    validOB: boolean
    sessionAlignment: boolean
  }
  reason: string
  lastScanned: Date
  priceAtScan: number
}

async function scorePair(pair: string, livePrice: number): Promise<SetupScore> {
  const prompt = `Quick Alchemist setup score for ${pair} at current price ${livePrice}.
Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Current UTC time: ${new Date().toUTCString()}

Analyze rapidly and return ONLY this JSON (no other text, no markdown, no code fences):
{
  "score": 78,
  "grade": "A",
  "bias": "Bullish",
  "probability": 74,
  "entry": "${livePrice.toFixed(livePrice > 500 ? 2 : 5)}",
  "stopLoss": "${(livePrice * 0.998).toFixed(livePrice > 500 ? 2 : 5)}",
  "tp1": "${(livePrice * 1.005).toFixed(livePrice > 500 ? 2 : 5)}",
  "tp2": "${(livePrice * 1.010).toFixed(livePrice > 500 ? 2 : 5)}",
  "tp3": "${(livePrice * 1.015).toFixed(livePrice > 500 ? 2 : 5)}",
  "riskReward": 3.2,
  "confluenceCount": 5,
  "criteria": {
    "htfStructure": true,
    "premiumDiscount": true,
    "liquiditySweep": true,
    "choch": true,
    "validOB": true,
    "sessionAlignment": false
  },
  "reason": "Short one-line reason based on current SMC conditions for ${pair} at ${livePrice}"
}

Scoring rules:
- score 80-100 = A+ (take this trade now)
- score 65-79 = A (strong setup)
- score 50-64 = B (moderate, wait for confirmation)
- score below 50 = C or No Trade
- Grade each criteria true/false based on Alchemist SMC rules
- Base entry/SL/TP on the live price: ${livePrice}
- For XAUUSD current price range is $4600-$4900+ (2026)`

  const response = await callAlchemistAI(prompt, livePrice, pair)

  try {
    const jsonMatch = response.match(/\{[\s\S]*?\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        pair,
        priceAtScan: livePrice,
        lastScanned: new Date(),
        score: parsed.score ?? 0,
        grade: parsed.grade ?? 'No Trade',
        bias: parsed.bias ?? 'Neutral',
        probability: parsed.probability ?? 0,
        entry: parsed.entry ?? `${livePrice.toFixed(2)}`,
        stopLoss: parsed.stopLoss ?? '0',
        tp1: parsed.tp1 ?? '0',
        tp2: parsed.tp2,
        tp3: parsed.tp3,
        riskReward: parsed.riskReward ?? 0,
        confluenceCount: parsed.confluenceCount ?? 0,
        criteria: {
          htfStructure: parsed.criteria?.htfStructure ?? false,
          premiumDiscount: parsed.criteria?.premiumDiscount ?? false,
          liquiditySweep: parsed.criteria?.liquiditySweep ?? false,
          choch: parsed.criteria?.choch ?? false,
          validOB: parsed.criteria?.validOB ?? false,
          sessionAlignment: parsed.criteria?.sessionAlignment ?? false,
        },
        reason: parsed.reason ?? 'No analysis available',
      }
    }
  } catch (e) {
    console.warn(`Score parse failed for ${pair}:`, e)
  }

  return {
    pair,
    score: 0,
    grade: 'No Trade',
    bias: 'Neutral',
    probability: 0,
    entry: `${livePrice.toFixed(2)}`,
    stopLoss: '0',
    tp1: '0',
    riskReward: 0,
    confluenceCount: 0,
    criteria: {
      htfStructure: false, premiumDiscount: false,
      liquiditySweep: false, choch: false,
      validOB: false, sessionAlignment: false
    },
    reason: 'Unable to score — AI response error',
    lastScanned: new Date(),
    priceAtScan: livePrice
  }
}

export async function scanAllPairs(
  prices: Record<string, number>,
  onProgress: (completed: number, total: number, currentPair: string) => void
): Promise<SetupScore[]> {
  const results: SetupScore[] = []
  const total = SCAN_PAIRS.length

  for (let i = 0; i < SCAN_PAIRS.length; i += 3) {
    const batch = SCAN_PAIRS.slice(i, i + 3)

    const batchResults = await Promise.allSettled(
      batch.map(async (pair, idx) => {
        const price = prices[pair] || 0
        onProgress(i + idx + 1, total, pair)
        if (price === 0) return null
        return await scorePair(pair, price)
      })
    )

    batchResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value)
      }
    })

    if (i + 3 < SCAN_PAIRS.length) {
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

export function getGradeBadgeClass(grade: string): string {
  switch (grade) {
    case 'A+': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
    case 'A': return 'bg-green-500/20 text-green-400 border border-green-500/40'
    case 'B': return 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
    case 'C': return 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
    default: return 'bg-gray-500/20 text-gray-400 border border-gray-500/40'
  }
}
