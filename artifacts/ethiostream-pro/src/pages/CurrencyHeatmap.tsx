import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Flame, RefreshCcw, TrendingUp, TrendingDown, Brain } from 'lucide-react'
import { useLivePrices, formatPriceForSymbol } from '@/utils/priceEngine'
import { callAlchemistAI } from '@/utils/freeAI'
import ReactMarkdown from 'react-markdown'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD']
const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CHF: '🇨🇭', AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦',
}

function computeStrength(prices: Record<string, number>): Record<string, number> {
  const scores: Record<string, number> = {}
  CURRENCIES.forEach(c => { scores[c] = 50 })

  // USD is the base — compute relative strengths from live prices
  if (prices.EURUSD && prices.EURUSD > 0) scores.EUR = prices.EURUSD > 1.1 ? 75 : prices.EURUSD > 1.05 ? 60 : prices.EURUSD > 1.0 ? 45 : 30
  if (prices.GBPUSD && prices.GBPUSD > 0) scores.GBP = prices.GBPUSD > 1.3 ? 80 : prices.GBPUSD > 1.25 ? 65 : prices.GBPUSD > 1.2 ? 50 : 35
  if (prices.USDJPY && prices.USDJPY > 0) scores.JPY = prices.USDJPY > 155 ? 20 : prices.USDJPY > 145 ? 35 : prices.USDJPY > 135 ? 50 : 65
  if (prices.USDCHF && prices.USDCHF > 0) scores.CHF = prices.USDCHF > 0.95 ? 30 : prices.USDCHF > 0.90 ? 50 : prices.USDCHF > 0.85 ? 65 : 80
  if (prices.AUDUSD && prices.AUDUSD > 0) scores.AUD = prices.AUDUSD > 0.70 ? 70 : prices.AUDUSD > 0.65 ? 55 : prices.AUDUSD > 0.60 ? 40 : 25
  if (prices.NZDUSD && prices.NZDUSD > 0) scores.NZD = prices.NZDUSD > 0.65 ? 70 : prices.NZDUSD > 0.60 ? 55 : prices.NZDUSD > 0.55 ? 40 : 25
  if (prices.USDCAD && prices.USDCAD > 0) scores.CAD = prices.USDCAD > 1.40 ? 25 : prices.USDCAD > 1.35 ? 40 : prices.USDCAD > 1.30 ? 55 : 70

  // USD strength based on DXY if available, else derived
  if (prices.DXY && prices.DXY > 0) {
    scores.USD = prices.DXY > 106 ? 85 : prices.DXY > 102 ? 70 : prices.DXY > 98 ? 55 : prices.DXY > 94 ? 40 : 25
  } else {
    const othersAvg = CURRENCIES.filter(c => c !== 'USD').reduce((s, c) => s + scores[c], 0) / 7
    scores.USD = Math.round(100 - othersAvg)
  }

  // Normalize 0-100
  const vals = Object.values(scores)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  CURRENCIES.forEach(c => {
    scores[c] = Math.round(((scores[c] - min) / range) * 100)
  })

  return scores
}

function getCrossStrength(c1: string, c2: string, strength: Record<string, number>): number {
  if (c1 === c2) return 0
  return (strength[c1] - strength[c2]) / 100 // -1 to 1
}

function strengthColor(val: number): { bg: string; text: string } {
  if (val >= 80) return { bg: '#14532d', text: '#86efac' }
  if (val >= 65) return { bg: '#166534', text: '#4ade80' }
  if (val >= 50) return { bg: '#365314', text: '#a3e635' }
  if (val >= 35) return { bg: '#713f12', text: '#fbbf24' }
  if (val >= 20) return { bg: '#7f1d1d', text: '#f87171' }
  return { bg: '#450a0a', text: '#fca5a5' }
}

function crossColor(val: number): string {
  if (val > 0.6) return 'bg-[#14532d] text-[#86efac]'
  if (val > 0.3) return 'bg-[#166534] text-[#4ade80]'
  if (val > 0.1) return 'bg-[#3a5c1a] text-[#a3e635]'
  if (val > -0.1) return 'bg-gray-800 text-gray-500'
  if (val > -0.3) return 'bg-[#7f1d1d] text-[#fca5a5]'
  if (val > -0.6) return 'bg-[#7f1d1d] text-[#f87171]'
  return 'bg-[#450a0a] text-[#f87171]'
}

interface BestPair {
  pair: string
  reason: string
  score: number
  direction: 'BUY' | 'SELL'
}

function computeBestPairs(strength: Record<string, number>, prices: Record<string, number>): BestPair[] {
  const sorted = CURRENCIES.sort((a, b) => strength[b] - strength[a])
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]
  const pairs: BestPair[] = []

  // Top strength divergences
  for (let i = 0; i < 3; i++) {
    for (let j = CURRENCIES.length - 1; j >= CURRENCIES.length - 3; j--) {
      if (i >= j) continue
      const strong = sorted[i]
      const weak = sorted[j]
      const diff = strength[strong] - strength[weak]
      if (diff < 20) continue

      let pair = ''
      let direction: 'BUY' | 'SELL' = 'BUY'

      // Try to construct the pair
      if (strong === 'USD') {
        pair = `USD${weak}`
        direction = 'BUY'
      } else if (weak === 'USD') {
        pair = `${strong}USD`
        direction = 'BUY'
      } else {
        pair = `${strong}${weak}`
        direction = 'BUY'
      }

      const price = prices[pair]
      pairs.push({
        pair,
        reason: `${strong} strength: ${strength[strong]}% vs ${weak} weakness: ${strength[weak]}%`,
        score: Math.round((diff / 100) * 10 * 10) / 10,
        direction,
      })

      if (pairs.length >= 5) break
    }
    if (pairs.length >= 5) break
  }

  return pairs.slice(0, 5).sort((a, b) => b.score - a.score)
}

export default function CurrencyHeatmap() {
  const { prices, loading, lastUpdate } = useLivePrices()
  const [strength, setStrength] = useState<Record<string, number>>({})
  const [commentary, setCommentary] = useState('')
  const [loadingCommentary, setLoadingCommentary] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ c1: string; c2: string } | null>(null)

  useEffect(() => {
    if (Object.keys(prices).length > 0) {
      setStrength(computeStrength(prices))
    }
  }, [prices])

  const sortedByStrength = [...CURRENCIES].sort((a, b) => (strength[b] || 0) - (strength[a] || 0))
  const bestPairs = computeBestPairs(strength, prices)

  const handleCommentary = async () => {
    setLoadingCommentary(true)
    setCommentary('')
    const xauPrice = prices.XAUUSD || 0
    try {
      const res = await callAlchemistAI(`
Currency Strength Analysis based on live forex prices. 

Current live prices used for calculation:
${['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD'].map(p => `${p}: ${prices[p] ? formatPriceForSymbol(p, prices[p]) : 'N/A'}`).join(', ')}
${xauPrice > 0 ? `XAUUSD: ${formatPriceForSymbol('XAUUSD', xauPrice)}` : ''}

Currency strength rankings (0-100%):
${sortedByStrength.map((c, i) => `${i+1}. ${c}: ${strength[c] || 50}%`).join('\n')}

Provide concise currency strength commentary:
## 💱 Currency Strength Summary

**Strongest:** [Currency and why]
**Weakest:** [Currency and why]

**Key Observations:** [2-3 bullet points on notable strength shifts]

**Best Setup Right Now:** [Most compelling pair and direction based on strength divergence]

**Avoid:** [Which pair has conflicting strengths — avoid trading this]

Keep it concise, actionable, and grounded in the Alchemist SMC framework.
`, xauPrice, 'XAUUSD')
      setCommentary(res)
    } catch {
      setCommentary('⚠️ Commentary unavailable. Please try again.')
    }
    setLoadingCommentary(false)
  }

  const COMMODITIES_PAIRS = [
    { sym: 'XAUUSD', label: 'Gold', icon: '🥇' },
    { sym: 'XAGUSD', label: 'Silver', icon: '🥈' },
    { sym: 'USOIL', label: 'WTI Oil', icon: '🛢️' },
    { sym: 'UKOIL', label: 'Brent', icon: '⚫' },
  ]
  const INDICES_PAIRS = [
    { sym: 'US30', label: 'Dow Jones', icon: '🇺🇸' },
    { sym: 'NAS100', label: 'NASDAQ', icon: '💻' },
    { sym: 'SPX500', label: 'S&P 500', icon: '📊' },
    { sym: 'GER40', label: 'DAX', icon: '🇩🇪' },
    { sym: 'DXY', label: 'DXY Index', icon: '💵' },
    { sym: 'VIX', label: 'VIX', icon: '📉' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Flame className="w-7 h-7 text-[var(--gold)]" />
          <div>
            <h1 className="font-serif font-bold text-2xl text-[var(--gold)]">CURRENCY STRENGTH HEATMAP</h1>
            <p className="text-xs text-gray-500">
              {lastUpdate ? `Live data — updated ${lastUpdate.toLocaleTimeString()}` : 'Loading live prices...'}
            </p>
          </div>
        </div>
        {loading && <RefreshCcw className="w-4 h-4 text-[var(--gold)] animate-spin" />}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Heatmap Matrix */}
        <div className="xl:col-span-2 flex flex-col gap-5">
          <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] overflow-hidden">
            <div className="px-4 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/40">
              <span className="font-bold text-sm text-white">📊 CURRENCY STRENGTH MATRIX</span>
              <span className="text-xs text-gray-600 ml-3">Click any cell to see the pair</span>
            </div>
            <div className="p-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="w-12 p-1 text-gray-600 text-left"></th>
                    {CURRENCIES.map(c => (
                      <th key={c} className="p-1 text-center text-gray-500 font-bold">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CURRENCIES.map(c1 => (
                    <tr key={c1}>
                      <td className="p-1 text-gray-500 font-bold text-xs">{CURRENCY_FLAGS[c1]} {c1}</td>
                      {CURRENCIES.map(c2 => {
                        if (c1 === c2) return <td key={c2} className="p-0.5"><div className="w-full h-8 bg-gray-900 rounded flex items-center justify-center text-gray-700 text-xs">—</div></td>
                        const val = getCrossStrength(c1, c2, strength)
                        const pair = c1 === 'USD' ? `USD${c2}` : c2 === 'USD' ? `${c1}USD` : `${c1}${c2}`
                        const price = prices[pair] || prices[`${c2}${c1}`]
                        const isSelected = selectedCell?.c1 === c1 && selectedCell?.c2 === c2
                        return (
                          <td key={c2} className="p-0.5">
                            <button
                              onClick={() => setSelectedCell(isSelected ? null : { c1, c2 })}
                              title={`${pair}: ${price ? formatPriceForSymbol(pair, price) : 'N/A'}`}
                              className={`w-full h-8 rounded text-xs font-bold transition-all hover:scale-110 ${crossColor(val)} ${isSelected ? 'ring-2 ring-[var(--gold)]' : ''}`}
                            >
                              {val > 0 ? '+' : ''}{(val * 100).toFixed(0)}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-3 mt-3 justify-center text-[10px]">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#14532d]"></span> Strong Long</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-800"></span> Neutral</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#450a0a]"></span> Strong Short</span>
              </div>
            </div>
          </div>

          {/* Commodities & Indices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-4">
              <h3 className="font-bold text-sm text-[var(--gold)] mb-3">🥇 COMMODITIES</h3>
              <div className="space-y-2">
                {COMMODITIES_PAIRS.map(({ sym, label, icon }) => {
                  const price = prices[sym]
                  return (
                    <div key={sym} className="flex items-center gap-3 p-2 rounded-lg bg-black/30 border border-[rgba(212,175,55,0.08)]">
                      <span className="text-lg">{icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-white">{label}</div>
                        <div className="text-[10px] text-gray-500">{sym}</div>
                      </div>
                      <div className="font-mono text-sm font-bold text-[var(--gold)]">
                        {price && price > 0 ? formatPriceForSymbol(sym, price) : <span className="text-gray-700">—</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-4">
              <h3 className="font-bold text-sm text-[var(--gold)] mb-3">📈 INDICES</h3>
              <div className="space-y-2">
                {INDICES_PAIRS.map(({ sym, label, icon }) => {
                  const price = prices[sym]
                  return (
                    <div key={sym} className="flex items-center gap-3 p-2 rounded-lg bg-black/30 border border-[rgba(212,175,55,0.08)]">
                      <span className="text-lg">{icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-white">{label}</div>
                        <div className="text-[10px] text-gray-500">{sym}</div>
                      </div>
                      <div className="font-mono text-sm font-bold text-[var(--gold)]">
                        {price && price > 0 ? formatPriceForSymbol(sym, price) : <span className="text-gray-700">—</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Rankings + Best Pairs + Commentary */}
        <div className="flex flex-col gap-4">
          {/* Currency Rankings */}
          <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-4">
            <h3 className="font-bold text-sm text-[var(--gold)] mb-3">🏆 STRENGTH RANKINGS</h3>
            <div className="space-y-2">
              {sortedByStrength.map((c, i) => {
                const s = strength[c] || 0
                const { bg, text } = strengthColor(s)
                return (
                  <div key={c} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-4 font-mono">{i + 1}</span>
                    <span className="text-sm">{CURRENCY_FLAGS[c]}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white">{c}</span>
                        <span className="text-xs font-mono" style={{ color: text }}>{s}%</span>
                      </div>
                      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${s}%`, backgroundColor: bg === '#14532d' ? '#22c55e' : bg === '#166534' ? '#4ade80' : bg === '#365314' ? '#a3e635' : bg === '#713f12' ? '#f59e0b' : '#ef4444' }}
                        />
                      </div>
                    </div>
                    <span className="text-lg">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : s <= 20 ? '⚠️' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Best Pairs */}
          <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-4">
            <h3 className="font-bold text-sm text-[var(--gold)] mb-3">⚡ BEST PAIRS RIGHT NOW</h3>
            <div className="space-y-2">
              {bestPairs.map((bp, i) => {
                const price = prices[bp.pair] || prices[`${bp.pair.slice(3)}${bp.pair.slice(0,3)}`]
                return (
                  <div key={i} className="p-3 rounded-lg border border-[rgba(212,175,55,0.15)] bg-black/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white text-sm">{bp.pair}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${bp.direction === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {bp.direction}
                        </span>
                        <span className="text-xs text-[var(--gold)] font-bold">{bp.score}/10</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500">{bp.reason}</div>
                    {price && price > 0 && (
                      <div className="text-xs font-mono text-[var(--gold)] mt-1">{formatPriceForSymbol(bp.pair, price)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* AI Commentary */}
          <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] overflow-hidden flex-1">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/40">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-[var(--gold)]" />
                <span className="font-bold text-sm text-white">AI COMMENTARY</span>
              </div>
              <button
                onClick={handleCommentary}
                disabled={loadingCommentary}
                className="bg-[var(--gold)] text-black px-3 py-1 rounded text-xs font-bold hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCcw className={`w-3 h-3 ${loadingCommentary ? 'animate-spin' : ''}`} />
                {loadingCommentary ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
            <div className="p-4 min-h-[120px]">
              {loadingCommentary && (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <div className="w-4 h-4 border border-[rgba(212,175,55,0.3)] border-t-[var(--gold)] rounded-full animate-spin" />
                  Analyzing currency strengths...
                </div>
              )}
              {commentary && !loadingCommentary && (
                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-[var(--gold)] prose-strong:text-white text-xs">
                  <ReactMarkdown>{commentary}</ReactMarkdown>
                </div>
              )}
              {!commentary && !loadingCommentary && (
                <div className="text-gray-600 text-sm text-center py-4">
                  Click Analyze for AI currency strength commentary
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
