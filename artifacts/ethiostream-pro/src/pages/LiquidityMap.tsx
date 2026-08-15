import { useState } from 'react'
import { motion } from 'framer-motion'
import { Droplets, RefreshCw, Zap, ArrowUp, ArrowDown } from 'lucide-react'
import { callAlchemistAI } from '@/utils/freeAI'

const PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD']

interface LiquidityLevel {
  price: number
  type: 'BSL' | 'SSL' | 'EQH' | 'EQL' | 'PDH' | 'PDL' | 'PWH' | 'PWL' | 'ROUND'
  label: string
  strength: 'High' | 'Medium' | 'Low'
  probability: number
  reason: string
  timeframe: string
  isAbove: boolean
}

const typeColors: Record<string, string> = {
  EQH: 'text-emerald-400', BSL: 'text-emerald-300',
  EQL: 'text-red-400', SSL: 'text-red-300',
  PDH: 'text-blue-400', PDL: 'text-blue-300',
  PWH: 'text-purple-400', PWL: 'text-purple-300',
  ROUND: 'text-[#D4AF37]',
}
const strengthBar = (p: number) => {
  const w = `${p}%`
  const col = p >= 70 ? '#10B981' : p >= 55 ? '#F59E0B' : '#6B7280'
  return <div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: w, background: col }} /></div><span className="text-xs text-gray-400 w-8">{p}%</span></div>
}

function getPairPrice(pair: string): number {
  try { const s = localStorage.getItem('jjnexus_prices'); if (s) { const p = JSON.parse(s); if (p[pair]) return p[pair] } } catch {}
  const d: Record<string, number> = { XAUUSD: 4725, EURUSD: 1.0845, GBPUSD: 1.2634, USDJPY: 149.5, AUDUSD: 0.6421, USDCAD: 1.3612 }
  return d[pair] || 1.0
}

function buildRoundLevels(price: number, pair: string): LiquidityLevel[] {
  const interval = price > 1000 ? 50 : price > 100 ? 5 : price > 10 ? 1 : 0.005
  const levels: LiquidityLevel[] = []
  for (let i = -6; i <= 6; i++) {
    if (i === 0) continue
    const roundLevel = Math.round(price / interval) * interval + (i * interval)
    const dist = Math.abs(roundLevel - price)
    if (dist < 0.001) continue
    levels.push({
      price: roundLevel, type: 'ROUND',
      label: `Round number ${roundLevel.toFixed(pair.includes('JPY') ? 1 : price > 100 ? 0 : 4)}`,
      strength: dist < interval * 1.5 ? 'High' : 'Medium',
      probability: dist < interval * 1.5 ? 65 : 45,
      reason: 'Round number — retail orders cluster here. Stops placed just beyond.',
      timeframe: 'All TFs', isAbove: roundLevel > price
    })
  }
  return levels
}

export default function LiquidityMap() {
  const [pair, setPair] = useState('XAUUSD')
  const [levels, setLevels] = useState<LiquidityLevel[]>([])
  const [aiInsight, setAiInsight] = useState('')
  const [loading, setLoading] = useState(false)
  const [price, setPrice] = useState(0)

  const analyze = async () => {
    setLoading(true)
    const p = getPairPrice(pair)
    setPrice(p)
    const roundLevels = buildRoundLevels(p, pair)

    const prompt = `Identify all liquidity levels for ${pair} at current price ${p}.

Return ONLY this JSON array (no other text, valid JSON):
[
  { "price": ${(p * 1.008).toFixed(2)}, "type": "EQH", "label": "Equal highs — triple top", "strength": "High", "probability": 78, "reason": "Three equal highs — buy stops stacked here, target for smart money", "timeframe": "H1", "isAbove": true },
  { "price": ${(p * 0.993).toFixed(2)}, "type": "EQL", "label": "Equal lows — double bottom", "strength": "High", "probability": 74, "reason": "Equal lows formed twice — sell stops cluster below here", "timeframe": "H1", "isAbove": false }
]

Include: EQH/EQL (equal highs/lows), PDH/PDL (prev day high/low), PWH/PWL (prev week high/low), BSL/SSL zones.
Use actual price ${p} as reference. Return 8-10 levels total.`

    try {
      const response = await callAlchemistAI(prompt, p, pair)
      const jsonMatch = response.match(/\[[\s\S]*?\]/)
      if (jsonMatch) {
        const parsed: LiquidityLevel[] = JSON.parse(jsonMatch[0])
        const combined = [...roundLevels, ...parsed].sort((a, b) =>
          Math.abs(a.price - p) - Math.abs(b.price - p)
        )
        setLevels(combined.slice(0, 16))
      } else {
        setLevels(roundLevels)
      }
    } catch { setLevels(roundLevels) }

    const insightPrompt = `Liquidity analysis for ${pair} at ${p}:
Levels: ${levels.map(l => `${l.price} (${l.type})`).slice(0, 6).join(', ')}

What is the most likely next liquidity target? Which direction will smart money move price? 
Give a specific 3-step Alchemist playbook to trade the next liquidity grab.`

    const insight = await callAlchemistAI(insightPrompt, p, pair)
    setAiInsight(insight)
    setLoading(false)
  }

  const aboveLevels = levels.filter(l => l.isAbove).sort((a, b) => a.price - b.price)
  const belowLevels = levels.filter(l => !l.isAbove).sort((a, b) => b.price - a.price)
  const topTarget = aboveLevels.sort((a, b) => b.probability - a.probability)[0]
  const bottomTarget = belowLevels.sort((a, b) => b.probability - a.probability)[0]
  const nextTarget = topTarget && bottomTarget
    ? (topTarget.probability >= bottomTarget.probability ? topTarget : bottomTarget)
    : topTarget || bottomTarget

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Droplets className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Liquidity Map</h1>
            <p className="text-xs text-gray-500">Where the stops are — anticipate smart money's next move</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {PAIRS.map(p => (
          <button key={p} onClick={() => { setPair(p); setLevels([]); setAiInsight('') }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${pair === p ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-[#1a1a1a] border-white/10 text-gray-300 hover:border-cyan-500/40'}`}>
            {p}
          </button>
        ))}
        <button onClick={analyze} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-700 text-white text-sm font-medium hover:bg-cyan-600 transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Mapping...' : 'Map Liquidity'}
        </button>
      </div>

      {!levels.length && !loading && (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-500">
          <Droplets className="w-12 h-12 opacity-30" />
          <p>Select a pair and map liquidity to see where the stops are</p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center h-48 gap-4">
          <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin" />
          <p className="text-gray-400 text-sm">AI mapping all liquidity levels...</p>
        </div>
      )}

      {levels.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Price Ladder */}
          <div className="bg-[#111] border border-white/5 rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-white">Price Liquidity Ladder</h2>
              <span className="text-xs text-gray-500">{pair}</span>
            </div>

            {/* Above levels */}
            <div className="space-y-1">
              {aboveLevels.slice(0, 6).reverse().map((l, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/3 transition-all">
                  <ArrowUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span className={`text-xs font-mono w-24 flex-shrink-0 ${typeColors[l.type] || 'text-gray-300'}`}>
                    {l.price > 100 ? l.price.toFixed(2) : l.price.toFixed(5)}
                  </span>
                  <span className="text-xs text-gray-500 flex-1 truncate">{l.type} — {l.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${l.strength === 'High' ? 'text-emerald-400 border-emerald-500/30' : 'text-gray-400 border-white/10'}`}>{l.probability}%</span>
                </motion.div>
              ))}
            </div>

            {/* Current price */}
            <div className="flex items-center gap-2 py-2 px-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg my-2">
              <div className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
              <span className="text-[#D4AF37] font-bold text-sm">
                PRICE: {price > 100 ? price.toFixed(2) : price.toFixed(5)}
              </span>
            </div>

            {/* Below levels */}
            <div className="space-y-1">
              {belowLevels.slice(0, 6).map((l, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/3 transition-all">
                  <ArrowDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                  <span className={`text-xs font-mono w-24 flex-shrink-0 ${typeColors[l.type] || 'text-gray-300'}`}>
                    {l.price > 100 ? l.price.toFixed(2) : l.price.toFixed(5)}
                  </span>
                  <span className="text-xs text-gray-500 flex-1 truncate">{l.type} — {l.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${l.strength === 'High' ? 'text-red-400 border-red-500/30' : 'text-gray-400 border-white/10'}`}>{l.probability}%</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* AI Intelligence */}
          <div className="space-y-4">
            {nextTarget && (
              <div className="bg-[#111] border border-[#D4AF37]/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="font-bold text-[#D4AF37]">Most Likely Next Target</h3>
                </div>
                <div className="flex items-center gap-3">
                  {nextTarget.isAbove ? <ArrowUp className="w-6 h-6 text-emerald-400" /> : <ArrowDown className="w-6 h-6 text-red-400" />}
                  <div>
                    <div className={`text-2xl font-black ${nextTarget.isAbove ? 'text-emerald-400' : 'text-red-400'}`}>
                      {nextTarget.price > 100 ? nextTarget.price.toFixed(2) : nextTarget.price.toFixed(5)}
                    </div>
                    <div className="text-xs text-gray-400">{nextTarget.label}</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-2xl font-black text-white">{nextTarget.probability}%</div>
                    <div className="text-xs text-gray-500">probability</div>
                  </div>
                </div>
                <p className="text-sm text-gray-300">{nextTarget.reason}</p>
              </div>
            )}

            {aiInsight && (
              <div className="bg-[#111] border border-white/5 rounded-xl p-4">
                <h3 className="font-semibold text-white mb-3">AI Liquidity Intelligence</h3>
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">{aiInsight}</div>
              </div>
            )}

            {/* Table */}
            <div className="bg-[#111] border border-white/5 rounded-xl p-4 overflow-x-auto">
              <h3 className="font-semibold text-white mb-2 text-sm">All Levels</h3>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-white/5">
                  <th className="text-left text-gray-500 py-1.5 pr-2">Price</th>
                  <th className="text-left text-gray-500 py-1.5 pr-2">Type</th>
                  <th className="text-left text-gray-500 py-1.5 pr-2">Strength</th>
                  <th className="text-right text-gray-500 py-1.5">Prob</th>
                </tr></thead>
                <tbody>
                  {[...aboveLevels, ...belowLevels].sort((a, b) => b.probability - a.probability).slice(0, 10).map((l, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className={`py-1.5 pr-2 font-mono ${l.isAbove ? 'text-emerald-400' : 'text-red-400'}`}>{l.price > 100 ? l.price.toFixed(2) : l.price.toFixed(5)}</td>
                      <td className={`py-1.5 pr-2 ${typeColors[l.type] || 'text-gray-400'}`}>{l.type}</td>
                      <td className="py-1.5 pr-2">{strengthBar(l.probability)}</td>
                      <td className="py-1.5 text-right text-gray-300 font-bold">{l.probability}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
