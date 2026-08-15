import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, TrendingUp, TrendingDown, RefreshCcw, Brain, Flame, Snowflake, BarChart2, ChevronRight } from 'lucide-react'
import { analyzeSeasonality } from '@/lib/claudeAPI'
import ReactMarkdown from 'react-markdown'
import { useLocation } from 'wouter'

const PAIRS = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','XAGUSD']
const PERIODS = ['3 Years','5 Years','10 Years','15 Years','20 Years']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Mon','Tue','Wed','Thu','Fri']

const SEASONAL_DATA: Record<string, { monthly: number[]; daily: number[]; dayBias: string[] }> = {
  XAUUSD: { monthly: [2.1,0.8,-0.9,0.4,1.2,-0.3,1.8,2.4,1.1,-0.7,-1.2,1.9], daily: [0.3,0.5,0.2,-0.1,0.4], dayBias: ['Neutral','Bullish','Neutral','Bearish','Bullish'] },
  EURUSD: { monthly: [-0.5,0.3,0.9,1.2,-0.4,-0.8,0.6,-0.3,0.7,0.4,-0.6,-0.9], daily: [-0.1,0.2,0.4,0.3,-0.2], dayBias: ['Bearish','Neutral','Bullish','Bullish','Bearish'] },
  GBPUSD: { monthly: [-0.3,0.5,1.1,0.8,-0.6,-1.0,0.4,-0.5,0.9,0.2,-0.8,-0.4], daily: [0.1,0.3,0.5,0.2,-0.3], dayBias: ['Neutral','Bullish','Bullish','Neutral','Bearish'] },
}

const getDefaultData = (pair: string) => SEASONAL_DATA[pair] || {
  monthly: Array.from({ length: 12 }, (_, i) => (Math.sin(i * 0.8) * 1.8 + (Math.random() - 0.5) * 0.6)),
  daily: Array.from({ length: 5 }, () => (Math.random() - 0.5) * 0.8),
  dayBias: ['Neutral','Bullish','Bullish','Neutral','Bearish'],
}

const SESSION_VOLATILITY = [
  { session: 'Sydney',       vol: 'Low',      width: 25, hot: false },
  { session: 'Tokyo',        vol: 'Low-Med',  width: 35, hot: false },
  { session: 'London Open',  vol: 'High',     width: 88, hot: true  },
  { session: 'NY Open',      vol: 'Extreme',  width: 95, hot: true  },
  { session: 'London Close', vol: 'Medium',   width: 55, hot: false },
  { session: 'NY Close',     vol: 'Low-Med',  width: 30, hot: false },
]

const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function Seasonality() {
  const [pair, setPair] = useState('XAUUSD')
  const [period, setPeriod] = useState('10 Years')
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(false)
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)
  const [, navigate] = useLocation()

  const data = getDefaultData(pair)
  const maxMonthly = Math.max(...data.monthly.map(Math.abs), 1)
  const currentMonthIdx = new Date().getMonth()
  const currentDayIdx = new Date().getDay() - 1 // 0=Mon
  const seasonScore = data.monthly.reduce((a, b) => a + b, 0)
  const bestMonth = data.monthly.indexOf(Math.max(...data.monthly))
  const worstMonth = data.monthly.indexOf(Math.min(...data.monthly))

  const handleAnalyze = async () => {
    setLoading(true); setAnalysis('')
    try { setAnalysis(await analyzeSeasonality(pair, period)) }
    catch (e: any) { setAnalysis(`⚠️ ${e.message}`) }
    finally { setLoading(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col gap-4">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden px-6 py-4" style={{ background: 'linear-gradient(135deg, #050510, #0a0820)', border: '1px solid rgba(167,139,250,0.25)' }}>
        {['top-0 left-0 border-t border-l','top-0 right-0 border-t border-r','bottom-0 left-0 border-b border-l','bottom-0 right-0 border-b border-r'].map((c,i) => (
          <div key={i} className={`absolute w-4 h-4 ${c} border-[rgba(167,139,250,0.35)]`} />
        ))}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)' }}>
              <CalendarDays className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-[0.15em] uppercase text-violet-400">Temporal Atlas</h1>
              <p className="text-[9px] text-gray-600 tracking-widest uppercase font-mono">Seasonality Intelligence · {period} of Market Memory</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-600 font-mono uppercase">Current Month:</span>
            <span className="text-xs font-black text-violet-400 border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 rounded-full">{MONTH_FULL[currentMonthIdx]}</span>
          </div>
        </div>
      </div>

      {/* ── CONTROLS ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {[{ val: pair, options: PAIRS, set: setPair, label: 'Pair' }, { val: period, options: PERIODS, set: setPeriod, label: 'Period' }].map(({ val, options, set, label }) => (
          <div key={label} className="relative">
            <label className="text-[8px] text-gray-700 uppercase tracking-widest font-mono block mb-1">{label}</label>
            <select value={val} onChange={e => set(e.target.value)}
              className="bg-black/70 border border-[rgba(167,139,250,0.25)] rounded-xl px-3 py-2 text-white font-bold appearance-none focus:outline-none focus:border-violet-400 font-mono text-sm pr-8">
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <button onClick={() => { setPair(pair); handleAnalyze() }}
          className="mt-5 flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm text-black transition-all"
          style={{ background: loading ? 'rgba(167,139,250,0.5)' : '#a78bfa', boxShadow: loading ? 'none' : '0 0 16px rgba(167,139,250,0.3)' }}
          disabled={loading}>
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'ANALYZING...' : 'ANALYZE'}
        </button>
        <div className="mt-5 flex gap-2 ml-auto">
          <button onClick={() => navigate('/session-oracle')} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs border border-blue-500/25 text-blue-400 hover:bg-blue-500/10 transition-colors font-bold">
            <ChevronRight className="w-3 h-3" />SESSION ORACLE
          </button>
          <button onClick={() => navigate('/scanner')} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs border border-[rgba(212,175,55,0.25)] text-[#D4AF37] hover:bg-[rgba(212,175,55,0.1)] transition-colors font-bold">
            <ChevronRight className="w-3 h-3" />SCAN PAIRS
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-4 min-h-0 overflow-y-auto">

        {/* ── LEFT: MONTHLY HEATMAP ─────────────────────────────────── */}
        <div className="xl:col-span-2 flex flex-col gap-4">

          {/* 12-cell month grid */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(167,139,250,0.15)' }}>
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-violet-400" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Monthly Bias Heatmap — {pair} ({period})</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
              {MONTHS.map((mo, i) => {
                const val = data.monthly[i]; const isPos = val >= 0
                const intensity = Math.abs(val) / maxMonthly
                const isCurrent = i === currentMonthIdx
                const isHovered = i === hoveredMonth
                return (
                  <motion.div key={mo}
                    whileHover={{ scale: 1.05 }} onHoverStart={() => setHoveredMonth(i)} onHoverEnd={() => setHoveredMonth(null)}
                    className="relative rounded-xl p-3 cursor-pointer border transition-all"
                    style={{
                      background: isPos
                        ? `rgba(34,197,94,${0.06 + intensity * 0.2})`
                        : `rgba(239,68,68,${0.06 + intensity * 0.2})`,
                      border: isCurrent
                        ? '1px solid rgba(167,139,250,0.6)'
                        : isPos ? `1px solid rgba(34,197,94,${0.15 + intensity * 0.2})` : `1px solid rgba(239,68,68,${0.15 + intensity * 0.2})`,
                      boxShadow: isCurrent ? '0 0 12px rgba(167,139,250,0.2)' : 'none',
                    }}>
                    {isCurrent && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet-400 border border-black flex items-center justify-center">
                        <span className="text-[5px] text-black font-black">●</span>
                      </div>
                    )}
                    <div className={`text-[10px] font-bold ${isCurrent ? 'text-violet-400' : 'text-gray-400'}`}>{mo}</div>
                    <div className={`text-sm font-black mt-0.5 ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                      {isPos ? '+' : ''}{val.toFixed(1)}%
                    </div>
                    <AnimatePresence>
                      {isHovered && (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 bg-black border border-gray-700 rounded-lg px-2 py-1 text-[9px] text-white whitespace-nowrap shadow-xl">
                          {MONTH_FULL[i]}: {isPos ? 'Bullish' : 'Bearish'} avg {Math.abs(val).toFixed(1)}%
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>

            {/* Diverging bar chart */}
            <div className="flex flex-col gap-1.5">
              {MONTHS.map((mo, i) => {
                const val = data.monthly[i]; const isPos = val >= 0
                const barW = Math.abs(val) / maxMonthly * 45
                const isCurrent = i === currentMonthIdx
                return (
                  <div key={mo} className="flex items-center gap-3">
                    <span className={`text-[9px] w-6 shrink-0 font-mono ${isCurrent ? 'text-violet-400 font-black' : 'text-gray-600'}`}>{mo}</span>
                    <div className="flex-1 flex items-center gap-1 h-4 relative">
                      <div className="absolute left-1/2 w-px h-full bg-gray-800 -translate-x-1/2" />
                      {isPos ? (
                        <>
                          <div className="w-1/2" />
                          <motion.div className="h-3 rounded-r-sm"
                            style={{ background: `linear-gradient(90deg, #22c55e88, #22c55e)`, boxShadow: val > 1.5 ? '0 0 6px rgba(34,197,94,0.5)' : 'none' }}
                            initial={{ width: 0 }} animate={{ width: `${barW}%` }} transition={{ duration: 0.7, delay: i*0.04 }} />
                        </>
                      ) : (
                        <>
                          <div className="w-1/2 flex justify-end">
                            <motion.div className="h-3 rounded-l-sm"
                              style={{ background: `linear-gradient(90deg, #ef4444, #ef444488)`, boxShadow: val < -1.5 ? '0 0 6px rgba(239,68,68,0.5)' : 'none' }}
                              initial={{ width: 0 }} animate={{ width: `${barW}%` }} transition={{ duration: 0.7, delay: i*0.04 }} />
                          </div>
                          <div className="w-1/2" />
                        </>
                      )}
                    </div>
                    <span className={`text-[9px] font-mono font-black w-12 text-right shrink-0 ${isPos ? 'text-green-500' : 'text-red-500'}`}>
                      {isPos ? '+' : ''}{val.toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Seasonal score gauge */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-gray-600 uppercase tracking-widest font-mono font-bold">Seasonal Score</span>
                <span className={`text-sm font-black font-mono ${seasonScore > 0 ? 'text-green-400' : 'text-red-400'}`}>{seasonScore > 0 ? '+' : ''}{seasonScore.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-black/60 rounded-full overflow-hidden">
                <motion.div className={`h-full rounded-full ${seasonScore > 3 ? 'bg-green-500' : seasonScore > 0 ? 'bg-green-600' : seasonScore > -3 ? 'bg-red-600' : 'bg-red-500'}`}
                  initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.abs(seasonScore) / maxMonthly / 12 * 1000 + 50)}%` }}
                  transition={{ duration: 1 }} style={{ boxShadow: seasonScore > 0 ? '0 0 8px rgba(34,197,94,0.4)' : '0 0 8px rgba(239,68,68,0.4)' }} />
              </div>
              <div className="flex justify-between text-[8px] text-gray-700 font-mono mt-1">
                <span>Best month: {MONTHS[bestMonth]} (+{data.monthly[bestMonth].toFixed(1)}%)</span>
                <span>Worst: {MONTHS[worstMonth]} ({data.monthly[worstMonth].toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANELS ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Current Season Summary */}
          <div className="rounded-2xl p-4" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Current Season</span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'This Month', val: `${MONTH_FULL[currentMonthIdx]}`, sub: `${data.monthly[currentMonthIdx] >= 0 ? '📈 Bullish' : '📉 Bearish'} avg ${data.monthly[currentMonthIdx].toFixed(1)}%` },
                { label: 'Best Month', val: MONTHS[bestMonth], sub: `+${data.monthly[bestMonth].toFixed(1)}% historically` },
                { label: 'Worst Month', val: MONTHS[worstMonth], sub: `${data.monthly[worstMonth].toFixed(1)}% historically` },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <div className="text-[8px] text-gray-700 uppercase tracking-widest font-mono">{item.label}</div>
                    <div className="text-xs font-black text-white">{item.val}</div>
                  </div>
                  <div className="text-[9px] text-gray-500 font-mono text-right">{item.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Day of Week */}
          <div className="rounded-2xl p-4" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.12)' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Day-of-Week Bias</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {DAYS.map((d, i) => {
                const val = data.daily[i]; const bias = data.dayBias[i]; const isPos = val >= 0
                const isCurrent = i === currentDayIdx
                return (
                  <div key={d} className={`rounded-xl p-2.5 text-center border transition-all ${
                    isCurrent ? 'border-[rgba(212,175,55,0.5)] bg-[rgba(212,175,55,0.08)] shadow-[0_0_10px_rgba(212,175,55,0.15)]' :
                    isPos ? 'border-green-500/20 bg-green-500/05' : 'border-red-500/20 bg-red-500/05'
                  }`}>
                    <div className={`text-[9px] font-black ${isCurrent ? 'text-[#D4AF37]' : 'text-gray-500'}`}>{d}</div>
                    <div className={`text-[10px] font-black mt-0.5 ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                      {isPos ? '+' : ''}{val.toFixed(2)}%
                    </div>
                    <div className="h-1 bg-black/40 rounded-full overflow-hidden mt-1.5">
                      <motion.div className={`h-full rounded-full ${isPos ? 'bg-green-500' : 'bg-red-500'}`}
                        initial={{ width: 0 }} animate={{ width: `${Math.abs(val) / 0.8 * 100}%` }}
                        transition={{ duration: 0.7, delay: i * 0.1 }} />
                    </div>
                    <div className={`text-[7px] mt-1 ${isPos ? 'text-green-600' : val < 0 ? 'text-red-600' : 'text-gray-600'}`}>{bias}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Session Volatility */}
          <div className="rounded-2xl p-4" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.12)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Time-of-Day Volatility</span>
            </div>
            {SESSION_VOLATILITY.map(sv => (
              <div key={sv.session} className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5">
                    {sv.hot ? <Flame className="w-3 h-3 text-orange-400" /> : <Snowflake className="w-3 h-3 text-blue-400" />}
                    <span className="text-[9px] text-gray-400 font-mono">{sv.session}</span>
                  </div>
                  <span className={`text-[9px] font-black ${sv.width >= 80 ? 'text-red-400' : sv.width >= 50 ? 'text-yellow-400' : sv.width >= 30 ? 'text-blue-400' : 'text-gray-600'}`}>{sv.vol}</span>
                </div>
                <div className="h-2 bg-black/60 rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full"
                    style={{ background: sv.width >= 80 ? 'linear-gradient(90deg, #dc2626, #f97316)' : sv.width >= 50 ? 'linear-gradient(90deg, #d97706, #fbbf24)' : sv.width >= 30 ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : '#374151',
                      boxShadow: sv.hot ? '0 0 6px rgba(249,115,22,0.5)' : 'none' }}
                    initial={{ width: 0 }} animate={{ width: `${sv.width}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
            ))}
          </div>

          {/* AI Analysis */}
          <div className="flex-1 rounded-2xl p-4 flex flex-col" style={{ minHeight: 160, background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(167,139,250,0.12)' }}>
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Brain className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">AI Seasonal Intelligence</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!analysis && !loading && <p className="text-xs text-gray-700 font-mono">Click ANALYZE for AI seasonal insights.</p>}
              {loading && (
                <div className="flex items-center gap-2 text-gray-600">
                  <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
                  <span className="text-xs font-mono">Analyzing patterns...</span>
                </div>
              )}
              {analysis && !loading && (
                <div className="prose prose-invert prose-xs max-w-none prose-headings:text-violet-400">
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
