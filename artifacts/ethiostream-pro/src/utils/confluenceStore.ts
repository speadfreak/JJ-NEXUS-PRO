/**
 * Cross-page Confluence Store
 * Each page saves its analysis result here.
 * AlchemistAI reads from all pages to compute master confluence.
 */

export interface PageAnalysis {
  page: string
  pair: string
  bias: 'Strongly Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strongly Bearish' | ''
  score: number // 0-100
  confidence: number // 0-100
  summary: string
  timestamp: number
  raw?: string
}

const STORE_KEY = 'jjnexus_confluence_store'
const MAX_AGE_MS = 4 * 60 * 60 * 1000 // 4 hours

function loadStore(): Record<string, PageAnalysis> {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveStore(store: Record<string, PageAnalysis>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {}
}

/** Save an analysis result from a page */
export function savePageAnalysis(analysis: PageAnalysis) {
  const store = loadStore()
  const key = `${analysis.page}:${analysis.pair}`
  store[key] = { ...analysis, timestamp: Date.now() }
  saveStore(store)
  // Dispatch event so AlchemistAI can react
  window.dispatchEvent(new CustomEvent('confluenceUpdate', { detail: analysis }))
}

/** Get all recent analyses for a specific pair */
export function getPairAnalyses(pair: string): PageAnalysis[] {
  const store = loadStore()
  const now = Date.now()
  return Object.values(store).filter(
    a => a.pair === pair && now - a.timestamp < MAX_AGE_MS
  )
}

/** Get the master confluence for a pair (weighted average of all pages) */
export function getMasterConfluence(pair: string): {
  overallBias: string
  score: number
  sources: PageAnalysis[]
  technicalBias: string
  fundamentalBias: string
  cotBias: string
  sentimentBias: string
} {
  const sources = getPairAnalyses(pair)

  const getBias = (page: string) =>
    sources.find(s => s.page === page)?.bias || ''
  const getSummary = (page: string) =>
    sources.find(s => s.page === page)?.summary || ''

  const technicalBias = getBias('technical') || getBias('alchemist')
  const fundamentalBias = getBias('fundamental')
  const cotBias = getBias('orderflow') || getBias('cot')
  const sentimentBias = getBias('sentiment') || getBias('watchlist')

  // Score each bias
  const biasScore = (b: string): number => {
    if (b.includes('Strongly Bullish')) return 2
    if (b.includes('Bullish')) return 1
    if (b.includes('Neutral') || b === '') return 0
    if (b.includes('Bearish') && !b.includes('Strongly')) return -1
    if (b.includes('Strongly Bearish')) return -2
    return 0
  }

  // Weights per source
  const weights: Record<string, number> = {
    technical: 0.35, alchemist: 0.35,
    fundamental: 0.25,
    orderflow: 0.25, cot: 0.25,
    sentiment: 0.15, watchlist: 0.15,
  }

  let totalWeight = 0
  let weightedScore = 0
  sources.forEach(s => {
    const w = weights[s.page] || 0.1
    totalWeight += w
    weightedScore += biasScore(s.bias) * w
  })

  const avgScore = totalWeight > 0 ? weightedScore / totalWeight : 0
  let overallBias = 'Neutral'
  if (avgScore > 1.2) overallBias = 'Strongly Bullish'
  else if (avgScore > 0.4) overallBias = 'Bullish'
  else if (avgScore < -1.2) overallBias = 'Strongly Bearish'
  else if (avgScore < -0.4) overallBias = 'Bearish'

  // Scale to 0-100
  const score = Math.round(50 + (avgScore / 2) * 50)

  return {
    overallBias,
    score: Math.max(0, Math.min(100, score)),
    sources,
    technicalBias: technicalBias + (getSummary('technical') ? ` | ${getSummary('technical')}` : ''),
    fundamentalBias: fundamentalBias + (getSummary('fundamental') ? ` | ${getSummary('fundamental')}` : ''),
    cotBias: cotBias + (getSummary('orderflow') ? ` | ${getSummary('orderflow')}` : ''),
    sentimentBias: sentimentBias + (getSummary('sentiment') ? ` | ${getSummary('sentiment')}` : ''),
  }
}

/** Clear stale entries */
export function clearStaleAnalyses() {
  const store = loadStore()
  const now = Date.now()
  let changed = false
  Object.keys(store).forEach(key => {
    if (now - store[key].timestamp > MAX_AGE_MS) {
      delete store[key]
      changed = true
    }
  })
  if (changed) saveStore(store)
}

/** Get all unique pairs with recent analyses */
export function getActivePairs(): string[] {
  const store = loadStore()
  const now = Date.now()
  const pairs = new Set<string>()
  Object.values(store).forEach(a => {
    if (now - a.timestamp < MAX_AGE_MS) pairs.add(a.pair)
  })
  return Array.from(pairs)
}
