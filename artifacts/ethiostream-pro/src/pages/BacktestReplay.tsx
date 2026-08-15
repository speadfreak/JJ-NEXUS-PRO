import { useState } from 'react'
import { motion } from 'framer-motion'
import { PlayCircle, SkipForward, TrendingUp, TrendingDown, Minus, Zap, Trophy } from 'lucide-react'
import { callAlchemistAI } from '@/utils/freeAI'

const PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NAS100']

interface ReplayDecision {
  id: string
  timestamp: string
  pair: string
  price: number
  userDecision: 'Buy' | 'Sell' | 'Skip'
  aiAnalysis: string
  aiGrade: string
  setupPresent: boolean
  setupQuality: string
}

const TRADINGVIEW_INTERVALS: Record<string, string> = {
  M1: '1', M5: '5', M15: '15', H1: '60', H4: '240', D1: 'D',
}

export default function BacktestReplay() {
  const [pair, setPair] = useState('XAUUSD')
  const [interval, setInterval] = useState('H1')
  const [decisions, setDecisions] = useState<ReplayDecision[]>([])
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [manualPrice, setManualPrice] = useState('')
  const [sessionStarted, setSessionStarted] = useState(false)

  const getPairPrice = (pair: string): number => {
    try { const s = localStorage.getItem('jjnexus_prices'); if (s) { const p = JSON.parse(s); if (p[pair]) return p[pair] } } catch {}
    const d: Record<string, number> = { XAUUSD: 4725, EURUSD: 1.0845, GBPUSD: 1.2634, USDJPY: 149.5, AUDUSD: 0.6421, NAS100: 19850 }
    return d[pair] || 1.0
  }

  const analyzePoint = async () => {
    setAiLoading(true)
    const price = parseFloat(manualPrice) || getPairPrice(pair)
    const now = new Date()
    const text = await callAlchemistAI(
      `Backtest replay analysis for ${pair}.
Current chart point price: ${price}
Timeframe: ${interval}
Time: ${now.toUTCString()}

Analyze what an Alchemist trader should see at this point:
1. What is the market structure on H4 and H1?
2. Is there a valid setup present? (OB, FVG, CHoCH, liquidity sweep)
3. If yes: describe the exact entry model, SL, and TP
4. If no: explain why this is NOT a valid Alchemist setup
5. Grade: A+ / A / B / C / No Setup

Begin your response with "SETUP: [YES/NO]" then "GRADE: [grade]" then full analysis.`,
      price, pair
    )
    setAiAnalysis(text)
    setAiLoading(false)
  }

  const recordDecision = (d: 'Buy' | 'Sell' | 'Skip') => {
    if (!aiAnalysis) return
    const price = parseFloat(manualPrice) || getPairPrice(pair)
    const setupPresent = aiAnalysis.includes('SETUP: YES')
    const gradeMatch = aiAnalysis.match(/GRADE:\s*([A-Z+]+)/)
    const grade = gradeMatch ? gradeMatch[1] : 'B'
    const decision: ReplayDecision = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      pair, price, userDecision: d,
      aiAnalysis, aiGrade: grade, setupPresent,
      setupQuality: grade
    }
    setDecisions(prev => [...prev, decision])
    setAiAnalysis('')
  }

  const totalDecisions = decisions.length
  const correctDecisions = decisions.filter(d => {
    if (!d.setupPresent && d.userDecision === 'Skip') return true
    if (d.setupPresent && d.userDecision !== 'Skip') return true
    return false
  }).length
  const accuracy = totalDecisions > 0 ? Math.round((correctDecisions / totalDecisions) * 100) : 0

  const tvSymbol = pair === 'XAUUSD' ? 'OANDA:XAUUSD' : pair === 'NAS100' ? 'NASDAQ:NDX' : `FX:${pair}`
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${tvSymbol}&interval=${TRADINGVIEW_INTERVALS[interval] || '60'}`

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
            <PlayCircle className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Backtest Replay Engine</h1>
            <p className="text-xs text-gray-500">Practice Alchemist setups on TradingView replay mode with AI grading</p>
          </div>
        </div>
        {totalDecisions > 0 && (
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className={`text-2xl font-black ${accuracy >= 70 ? 'text-emerald-400' : accuracy >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{accuracy}%</div>
              <div className="text-xs text-gray-500">accuracy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-white">{totalDecisions}</div>
              <div className="text-xs text-gray-500">decisions</div>
            </div>
          </div>
        )}
      </div>

      {/* Setup */}
      <div className="flex items-center gap-3 flex-wrap">
        {PAIRS.map(p => (
          <button key={p} onClick={() => { setPair(p); setAiAnalysis('') }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${pair === p ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-[#1a1a1a] border-white/10 text-gray-300 hover:border-violet-500/40'}`}>
            {p}
          </button>
        ))}
        <select value={interval} onChange={e => setInterval(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-white/10 text-gray-300 text-sm focus:outline-none">
          {Object.keys(TRADINGVIEW_INTERVALS).map(tf => <option key={tf}>{tf}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* TradingView Link + Controls */}
        <div className="lg:col-span-2 space-y-4">
          {/* TradingView chart frame */}
          <div className="bg-[#111] border border-white/5 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">TradingView — {pair} {interval}</span>
              <a href={tvUrl} target="_blank" rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg bg-[#D4AF37] text-black font-medium hover:bg-[#B8960C] transition-all">
                Open Full Chart ↗
              </a>
            </div>
            <div className="bg-[#0d0d0d] p-6 text-center space-y-4">
              <div className="text-gray-500 text-sm space-y-2">
                <p className="text-white font-medium">How to use Backtest Replay:</p>
                <ol className="text-left space-y-1.5 max-w-md mx-auto">
                  <li className="flex gap-2"><span className="text-[#D4AF37] font-bold">1.</span> Click "Open Full Chart" above to open TradingView</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37] font-bold">2.</span> In TradingView, click the Replay button (⏪) in the toolbar</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37] font-bold">3.</span> Select a date in the past to start replaying from</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37] font-bold">4.</span> Pause when you see a potential setup</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37] font-bold">5.</span> Enter the price and click "Analyze This Point" below</li>
                  <li className="flex gap-2"><span className="text-[#D4AF37] font-bold">6.</span> Make your decision — AI will grade you</li>
                </ol>
              </div>
              <a href={tvUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1a1a1a] border border-white/10 text-gray-300 hover:border-violet-500/50 transition-all text-sm font-medium">
                <PlayCircle className="w-5 h-5 text-violet-400" />
                Open TradingView with Replay Mode
              </a>
            </div>
          </div>

          {/* Analysis Controls */}
          <div className="bg-[#111] border border-white/5 rounded-xl p-4 space-y-3">
            <h3 className="font-bold text-white">Analyze a Decision Point</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Price at this point (from TradingView)</label>
                <input value={manualPrice} onChange={e => setManualPrice(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#D4AF37]/50 placeholder:text-gray-600"
                  placeholder={`e.g. ${getPairPrice(pair).toFixed(pair.includes('JPY') || pair === 'NAS100' ? 1 : 2)}`} />
              </div>
              <div className="flex items-end">
                <button onClick={analyzePoint} disabled={aiLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-all whitespace-nowrap">
                  <Zap className="w-4 h-4" />
                  {aiLoading ? 'Analyzing...' : 'Analyze This Point'}
                </button>
              </div>
            </div>

            {aiAnalysis && (
              <div className="space-y-3">
                <div className="bg-[#0d0d0d] rounded-xl p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto border border-white/5">
                  {aiAnalysis}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Your decision:</span>
                  {[
                    { d: 'Buy' as const, icon: <TrendingUp className="w-4 h-4" />, color: 'bg-emerald-600 hover:bg-emerald-700' },
                    { d: 'Sell' as const, icon: <TrendingDown className="w-4 h-4" />, color: 'bg-red-600 hover:bg-red-700' },
                    { d: 'Skip' as const, icon: <SkipForward className="w-4 h-4" />, color: 'bg-gray-700 hover:bg-gray-600' },
                  ].map(({ d, icon, color }) => (
                    <button key={d} onClick={() => recordDecision(d)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg ${color} text-white text-sm font-medium transition-all`}>
                      {icon} {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Decision History */}
        <div className="space-y-4">
          {/* Score */}
          {totalDecisions > 0 && (
            <div className="bg-[#111] border border-[#D4AF37]/20 rounded-xl p-4 text-center space-y-2">
              <Trophy className="w-6 h-6 text-[#D4AF37] mx-auto" />
              <div className={`text-4xl font-black ${accuracy >= 70 ? 'text-emerald-400' : accuracy >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{accuracy}%</div>
              <div className="text-sm text-gray-400">Decision Accuracy</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-[#0d0d0d] rounded-lg p-2"><div className="text-emerald-400 font-bold">{correctDecisions}</div><div className="text-gray-500 text-xs">Correct</div></div>
                <div className="bg-[#0d0d0d] rounded-lg p-2"><div className="text-red-400 font-bold">{totalDecisions - correctDecisions}</div><div className="text-gray-500 text-xs">Wrong</div></div>
              </div>
            </div>
          )}

          {/* History */}
          <div className="bg-[#111] border border-white/5 rounded-xl p-4 space-y-2">
            <h3 className="font-bold text-white text-sm">Decision History</h3>
            {decisions.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-6">No decisions yet — start analyzing points</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {[...decisions].reverse().map((dec) => {
                  const wasCorrect = (!dec.setupPresent && dec.userDecision === 'Skip') || (dec.setupPresent && dec.userDecision !== 'Skip')
                  return (
                    <motion.div key={dec.id} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                      className={`border rounded-lg p-2.5 text-xs ${wasCorrect ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium">{dec.pair} @ {dec.price.toFixed(dec.price > 100 ? 2 : 5)}</span>
                        <span className={wasCorrect ? 'text-emerald-400' : 'text-red-400'}>{wasCorrect ? '✅' : '❌'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <span>{dec.userDecision === 'Buy' ? '▲' : dec.userDecision === 'Sell' ? '▼' : '⏭️'} {dec.userDecision}</span>
                        <span>·</span>
                        <span>Grade: <span className="text-white">{dec.aiGrade}</span></span>
                        <span>·</span>
                        <span>{dec.timestamp}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
