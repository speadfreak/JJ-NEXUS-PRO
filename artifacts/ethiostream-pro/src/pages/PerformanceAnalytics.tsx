import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart2, TrendingUp, TrendingDown, Zap, Trophy, Target, RefreshCw, BookOpen,
  Activity, Shield, Star, Flame, Brain, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { callAlchemistAI } from '@/utils/freeAI'
import { useLocation } from 'wouter'
import ReactMarkdown from 'react-markdown'

const GOLD = '#D4AF37'
const G10 = 'rgba(212,175,55,0.10)'
const G20 = 'rgba(212,175,55,0.20)'
const G30 = 'rgba(212,175,55,0.30)'

interface JournalTrade {
  id: string; pair: string; direction?: string; result?: string
  pnl?: number; pips?: number; rr?: number; date: string
  session?: string; strategy?: string; grade?: string; emotion?: string
}

interface PerformanceMetrics {
  totalTrades: number; wins: number; losses: number; winRate: number
  profitFactor: number; totalPnL: number; grossWins: number; grossLosses: number
  totalPips: number; avgRR: number; avgWin: number; avgLoss: number
  bestTrade: number; worstTrade: number
  equityCurve: { date: string; balance: number }[]
  winRateByPair: Record<string, { wins: number; losses: number; winRate: number; pnl: number; trades: number }>
  winRateBySession: Record<string, { wins: number; losses: number; winRate: number; trades: number }>
  winRateBySetup: Record<string, { wins: number; losses: number; winRate: number; pnl: number; trades: number }>
  bestPair: string; worstPair: string; bestSession: string
  maxConsecWins: number; maxConsecLosses: number
  currentStreak: number; currentStreakType: 'win' | 'loss' | 'none'
}

function computeRealMetrics(trades: JournalTrade[]): PerformanceMetrics {
  const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const wins = sorted.filter(t => (t.pnl ?? 0) > 0)
  const losses = sorted.filter(t => (t.pnl ?? 0) <= 0)
  const totalPnL = sorted.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const grossWins = wins.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const grossLosses = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0))
  const totalPips = sorted.reduce((s, t) => s + (t.pips ?? 0), 0)
  const avgRR = wins.length > 0 ? wins.reduce((s, t) => s + (t.rr ?? 1), 0) / wins.length : 0
  const avgWin = wins.length > 0 ? grossWins / wins.length : 0
  const avgLoss = losses.length > 0 ? grossLosses / losses.length : 0
  const allPnls = sorted.map(t => t.pnl ?? 0)
  const bestTrade = allPnls.length ? Math.max(...allPnls) : 0
  const worstTrade = allPnls.length ? Math.min(...allPnls) : 0

  let running = 1000
  const equityCurve = sorted.map(t => {
    running += (t.pnl ?? 0)
    return { date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), balance: parseFloat(running.toFixed(2)) }
  })

  const winRateByPair: PerformanceMetrics['winRateByPair'] = {}
  sorted.forEach(t => {
    if (!winRateByPair[t.pair]) winRateByPair[t.pair] = { wins: 0, losses: 0, winRate: 0, pnl: 0, trades: 0 }
    winRateByPair[t.pair].trades++; winRateByPair[t.pair].pnl += (t.pnl ?? 0)
    if ((t.pnl ?? 0) > 0) winRateByPair[t.pair].wins++; else winRateByPair[t.pair].losses++
  })
  Object.values(winRateByPair).forEach(v => { v.winRate = v.trades > 0 ? (v.wins / v.trades) * 100 : 0 })

  const winRateBySession: PerformanceMetrics['winRateBySession'] = {}
  sorted.forEach(t => {
    const s = t.session || 'Unknown'
    if (!winRateBySession[s]) winRateBySession[s] = { wins: 0, losses: 0, winRate: 0, trades: 0 }
    winRateBySession[s].trades++
    if ((t.pnl ?? 0) > 0) winRateBySession[s].wins++; else winRateBySession[s].losses++
  })
  Object.values(winRateBySession).forEach(v => { v.winRate = v.trades > 0 ? (v.wins / v.trades) * 100 : 0 })

  const winRateBySetup: PerformanceMetrics['winRateBySetup'] = {}
  sorted.forEach(t => {
    const s = t.strategy || 'Unknown'
    if (!winRateBySetup[s]) winRateBySetup[s] = { wins: 0, losses: 0, winRate: 0, pnl: 0, trades: 0 }
    winRateBySetup[s].trades++; winRateBySetup[s].pnl += (t.pnl ?? 0)
    if ((t.pnl ?? 0) > 0) winRateBySetup[s].wins++; else winRateBySetup[s].losses++
  })
  Object.values(winRateBySetup).forEach(v => { v.winRate = v.trades > 0 ? (v.wins / v.trades) * 100 : 0 })

  const bestPair = Object.entries(winRateByPair).sort(([, a], [, b]) => b.winRate - a.winRate)[0]?.[0] ?? 'None'
  const worstPair = Object.entries(winRateByPair).sort(([, a], [, b]) => a.winRate - b.winRate)[0]?.[0] ?? 'None'
  const bestSession = Object.entries(winRateBySession).sort(([, a], [, b]) => b.winRate - a.winRate)[0]?.[0] ?? 'None'

  let maxConsecWins = 0; let maxConsecLosses = 0; let curW = 0; let curL = 0
  let currentStreak = 0; let currentStreakType: PerformanceMetrics['currentStreakType'] = 'none'
  sorted.forEach(t => {
    if ((t.pnl ?? 0) > 0) { curW++; curL = 0; if (curW > maxConsecWins) maxConsecWins = curW }
    else { curL++; curW = 0; if (curL > maxConsecLosses) maxConsecLosses = curL }
  })
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1]
    if ((last.pnl ?? 0) > 0) { currentStreak = curW; currentStreakType = 'win' }
    else if ((last.pnl ?? 0) < 0) { currentStreak = curL; currentStreakType = 'loss' }
  }

  return {
    totalTrades: sorted.length, wins: wins.length, losses: losses.length,
    winRate: sorted.length > 0 ? (wins.length / sorted.length) * 100 : 0,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : (wins.length > 0 ? 999 : 0),
    totalPnL, grossWins, grossLosses, totalPips, avgRR, avgWin, avgLoss,
    bestTrade, worstTrade, equityCurve, winRateByPair, winRateBySession, winRateBySetup,
    bestPair, worstPair, bestSession, maxConsecWins, maxConsecLosses, currentStreak, currentStreakType,
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyPerformanceState() {
  const [, navigate] = useLocation()
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center p-10">
      <div className="relative mb-6">
        <motion.div className="absolute inset-0 rounded-full blur-xl" style={{ background: GOLD }}
          animate={{ opacity: [0.15, 0.35, 0.15] }} transition={{ repeat: Infinity, duration: 2 }} />
        <div className="relative text-6xl">📊</div>
      </div>
      <h2 className="font-serif font-bold text-2xl mb-3" style={{ color: GOLD }}>Performance Analytics</h2>
      <p className="text-gray-500 text-sm max-w-sm leading-relaxed mb-6">
        Your performance dashboard is ready. Log your first trade in the Journal to start seeing real analytics.
      </p>
      <div className="rounded-xl p-5 mb-6 text-left max-w-xs w-full" style={{ background: G10, border: `1px solid ${G20}` }}>
        <p className="font-bold text-xs uppercase tracking-widest mb-3" style={{ color: GOLD }}>When you have trades, you'll see:</p>
        {['Live equity curve chart', 'Win rate by pair, session & setup', 'Profit factor and average R:R', 'Best and worst pairs', 'AI-powered coaching', 'Monthly P&L breakdown', 'Streak tracking', 'Funded account analysis'].map(item => (
          <div key={item} className="text-gray-500 text-xs py-1 flex items-center gap-2">
            <span style={{ color: GOLD }} className="text-[10px]">✓</span> {item}
          </div>
        ))}
      </div>
      <button onClick={() => navigate('/journal')} className="px-8 py-3 rounded-xl font-black text-sm transition-colors" style={{ background: GOLD, color: '#000' }}>
        📝 Log My First Trade
      </button>
    </motion.div>
  )
}

// ── Cinematic Stat Card ───────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color = GOLD, icon: Icon, glow }: { label: string; value: string; sub?: string; color?: string; icon?: React.ComponentType<any>; glow?: boolean }) => (
  <motion.div whileHover={{ scale: 1.02 }}
    className="p-4 rounded-xl relative overflow-hidden"
    style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${glow ? color + '30' : 'rgba(212,175,55,0.08)'}` }}>
    {glow && <div className="absolute inset-0 opacity-5 rounded-xl" style={{ background: color }} />}
    <div className="relative">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-3 h-3 text-gray-700" />}
        <p className="text-gray-600 text-[9px] uppercase tracking-widest font-bold">{label}</p>
      </div>
      <p className="font-black text-lg font-mono" style={{ color }}>{value}</p>
      {sub && <p className="text-gray-700 text-[9px] mt-0.5 font-mono">{sub}</p>}
    </div>
  </motion.div>
)

// ── Custom Chart Tooltip ──────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 text-xs shadow-xl" style={{ background: '#0a0a0a', border: `1px solid ${G30}` }}>
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-black">{p.name}: {typeof p.value === 'number' ? (p.name.includes('Rate') ? `${p.value}%` : `$${p.value.toFixed(2)}`) : p.value}</p>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PerformanceAnalytics() {
  const [trades, setTrades] = useState<JournalTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [aiInsight, setAiInsight] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [, navigate] = useLocation()

  const fetchTrades = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/journal/entries')
      if (res.ok) {
        const data = await res.json()
        setTrades(Array.isArray(data) ? data : (data.entries ?? []))
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchTrades() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin" style={{ color: GOLD }} />
          <span>Loading performance data…</span>
        </div>
      </div>
    )
  }

  if (!trades || trades.length === 0) return <EmptyPerformanceState />

  const m = computeRealMetrics(trades)

  const getAIInsight = async () => {
    setAiLoading(true)
    const text = await callAlchemistAI(
      `Analyze this trader's REAL performance data from their funded account journal. Provide specific, actionable coaching:

PERFORMANCE STATS (real data):
- Total Trades: ${m.totalTrades} | Win Rate: ${m.winRate.toFixed(1)}%
- Total P&L: ${m.totalPnL >= 0 ? '+' : ''}$${m.totalPnL.toFixed(2)} | Total Pips: ${m.totalPips >= 0 ? '+' : ''}${m.totalPips}
- Profit Factor: ${m.profitFactor.toFixed(2)} | Avg R:R (wins): ${m.avgRR.toFixed(2)}
- Avg Win: $${m.avgWin.toFixed(2)} | Avg Loss: $${m.avgLoss.toFixed(2)}
- Best Trade: +$${m.bestTrade.toFixed(2)} | Worst: -$${Math.abs(m.worstTrade).toFixed(2)}
- Current Streak: ${m.currentStreak} ${m.currentStreakType} | Max Win Streak: ${m.maxConsecWins} | Max Loss Streak: ${m.maxConsecLosses}

BY PAIR: ${Object.entries(m.winRateByPair).map(([p, v]) => `${p}: ${v.winRate.toFixed(0)}% WR (${v.trades}T, ${v.pnl >= 0 ? '+' : ''}$${v.pnl.toFixed(0)})`).join(' | ')}
BY SESSION: ${Object.entries(m.winRateBySession).map(([s, v]) => `${s}: ${v.winRate.toFixed(0)}% WR (${v.trades}T)`).join(' | ')}

Provide:
1. **Biggest Strength** — what is working well
2. **Biggest Weakness** — #1 thing to fix immediately
3. **Pair Focus** — which pair to specialize in, which to avoid
4. **Session Edge** — best session and why
5. **Specific Improvement** — one concrete change to make next week
6. **Performance Grade** — A+/A/B/C/D with rationale
7. **Psychology Note** — based on streak and loss patterns

End with: "— Alchemist AI | Performance Division | JJ NEXUS PRO"`
    )
    setAiInsight(text)
    setAiLoading(false)
  }

  const pairData = Object.entries(m.winRateByPair).map(([pair, v]) => ({ name: pair, winRate: +v.winRate.toFixed(0), pnl: +v.pnl.toFixed(2), trades: v.trades }))
  const sessionData = Object.entries(m.winRateBySession).map(([session, v]) => ({ name: session.split(' ')[0], winRate: +v.winRate.toFixed(0), trades: v.trades }))

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1600px] mx-auto p-4 flex flex-col gap-5">

        {/* ── Cinematic Header ─────────────────────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0800, #0d0a00, #050300)', border: `1px solid ${G30}` }}>
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(212,175,55,0.8) 0px, transparent 1px, transparent 20px, rgba(212,175,55,0.8) 21px)', backgroundSize: '28px 28px' }} />
          <motion.div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent opacity-40 pointer-events-none"
            animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }} />
          <div className="relative flex items-center gap-5 p-6">
            <div className="relative">
              <motion.div className="absolute inset-0 rounded-2xl blur-xl" style={{ background: GOLD }}
                animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2, repeat: Infinity }} />
              <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: G10, border: `1px solid ${G30}` }}>
                <BarChart2 className="w-7 h-7" style={{ color: GOLD }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold tracking-widest text-gray-600 uppercase">JJ Nexus Pro · Analytics Engine</div>
              <h1 className="font-serif font-black text-2xl tracking-wider" style={{ color: GOLD }}>PERFORMANCE ANALYTICS</h1>
              <p className="text-xs text-gray-500 mt-0.5">Real data from your journal · {m.totalTrades} trades analyzed · Live metrics</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={fetchTrades} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors"
                style={{ borderColor: G10, color: '#666' }}>
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
              <button onClick={() => navigate('/journal')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: G10, border: `1px solid ${G20}`, color: GOLD }}>
                <BookOpen className="w-3.5 h-3.5" /> Add Trade
              </button>
            </div>
          </div>
        </div>

        {/* ── Key Stats ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard label="Total Trades" value={String(m.totalTrades)} icon={Target} />
          <StatCard label="Win Rate" value={`${m.winRate.toFixed(1)}%`} color={m.winRate >= 50 ? '#22c55e' : '#ef4444'} icon={TrendingUp} glow />
          <StatCard label="Total P&L" value={`${m.totalPnL >= 0 ? '+' : ''}$${m.totalPnL.toFixed(2)}`} color={m.totalPnL >= 0 ? '#22c55e' : '#ef4444'} glow />
          <StatCard label="Total Pips" value={`${m.totalPips >= 0 ? '+' : ''}${m.totalPips}`} color={m.totalPips >= 0 ? '#22c55e' : '#ef4444'} />
          <StatCard label="Profit Factor" value={m.profitFactor === 999 ? '∞' : m.profitFactor.toFixed(2)} color={m.profitFactor >= 1.5 ? '#22c55e' : m.profitFactor >= 1 ? '#f97316' : '#ef4444'} />
          <StatCard label="Avg R:R" value={`${m.avgRR.toFixed(2)}:1`} color={m.avgRR >= 2 ? '#22c55e' : m.avgRR >= 1 ? '#f97316' : '#ef4444'} />
          <StatCard label="Best Pair" value={m.bestPair} sub={`${(m.winRateByPair[m.bestPair]?.winRate ?? 0).toFixed(0)}% WR`} icon={Trophy} color={GOLD} glow />
          <StatCard label="Streak" value={`${m.currentStreak}${m.currentStreakType === 'win' ? '🔥' : m.currentStreakType === 'loss' ? '❄️' : '—'}`}
            color={m.currentStreakType === 'win' ? '#22c55e' : m.currentStreakType === 'loss' ? '#ef4444' : '#888'} />
        </div>

        {/* ── Charts Row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Equity Curve */}
          <div className="lg:col-span-2 p-4 rounded-2xl" style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${G20}` }}>
            <p className="font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: GOLD }}>
              <TrendingUp className="w-3.5 h-3.5" /> Equity Curve
              <span className="ml-auto font-mono text-xs" style={{ color: m.totalPnL >= 0 ? '#22c55e' : '#ef4444' }}>
                {m.totalPnL >= 0 ? '+' : ''}${m.totalPnL.toFixed(2)}
              </span>
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={m.equityCurve}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={m.totalPnL >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={m.totalPnL >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="date" tick={{ fill: '#333', fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#333', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="balance" name="Balance" stroke={m.totalPnL >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} fill="url(#equityGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Win/Loss + stats */}
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-2xl flex-1" style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${G20}` }}>
              <p className="font-bold text-xs uppercase tracking-widest mb-3" style={{ color: GOLD }}>
                <BarChart2 className="w-3.5 h-3.5 inline mr-1.5" /> Win / Loss Split
              </p>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={[{ name: 'Wins', value: m.wins }, { name: 'Losses', value: m.losses }]} cx="50%" cy="50%" outerRadius={50} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                    <Cell fill="#22c55e" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="text-center p-2 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <p className="text-green-400 font-black text-xl">{m.wins}</p>
                  <p className="text-gray-600 text-[9px]">Wins · +${m.grossWins.toFixed(0)}</p>
                </div>
                <div className="text-center p-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <p className="text-red-400 font-black text-xl">{m.losses}</p>
                  <p className="text-gray-600 text-[9px]">Losses · -${m.grossLosses.toFixed(0)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── By Pair & Session ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <div className="p-4 rounded-2xl" style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${G20}` }}>
            <p className="font-bold text-xs uppercase tracking-widest mb-4" style={{ color: GOLD }}>Win Rate by Pair</p>
            <ResponsiveContainer width="100%" height={Math.max(120, pairData.length * 36)}>
              <BarChart data={pairData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis type="number" tick={{ fill: '#333', fontSize: 9 }} domain={[0, 100]} tickFormatter={v => `${v}%`} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#aaa', fontSize: 10 }} width={60} axisLine={false} />
                <Tooltip content={<ChartTooltip />} formatter={(v: any) => [`${v}%`, 'Win Rate']} />
                <Bar dataKey="winRate" name="Win Rate" fill={GOLD} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="p-4 rounded-2xl space-y-4" style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${G20}` }}>
            <div>
              <p className="font-bold text-xs uppercase tracking-widest mb-3" style={{ color: GOLD }}>P&L by Pair</p>
              <div className="space-y-2">
                {pairData.sort((a, b) => b.pnl - a.pnl).map(p => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="text-white font-bold text-xs w-16 shrink-0">{p.name}</span>
                    <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)' }}>
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (Math.abs(p.pnl) / (Math.max(...pairData.map(x => Math.abs(x.pnl))) || 1)) * 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        style={{ background: p.pnl >= 0 ? '#22c55e' : '#ef4444' }} />
                    </div>
                    <span className="text-xs font-black w-16 text-right shrink-0 font-mono" style={{ color: p.pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                      {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {sessionData.length > 0 && (
              <div>
                <p className="font-bold text-xs uppercase tracking-widest mb-3" style={{ color: GOLD }}>Win Rate by Session</p>
                {sessionData.map(s => (
                  <div key={s.name} className="flex items-center gap-3 mb-2">
                    <span className="text-white text-xs w-16 shrink-0">{s.name}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)' }}>
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }}
                        animate={{ width: `${s.winRate}%` }} transition={{ duration: 0.8 }}
                        style={{ background: s.winRate >= 50 ? '#22c55e' : '#ef4444' }} />
                    </div>
                    <span className="text-xs font-black w-10 text-right shrink-0 font-mono" style={{ color: s.winRate >= 50 ? '#22c55e' : '#ef4444' }}>{s.winRate.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Detailed Stats ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Avg Win" value={`+$${m.avgWin.toFixed(2)}`} color="#22c55e" icon={ArrowUpRight} />
          <StatCard label="Avg Loss" value={`-$${m.avgLoss.toFixed(2)}`} color="#ef4444" icon={ArrowDownRight} />
          <StatCard label="Best Trade" value={`+$${m.bestTrade.toFixed(2)}`} color="#22c55e" icon={Trophy} glow />
          <StatCard label="Worst Trade" value={`-$${Math.abs(m.worstTrade).toFixed(2)}`} color="#ef4444" icon={TrendingDown} />
          <StatCard label="Max Win Streak" value={`${m.maxConsecWins} wins`} color="#22c55e" icon={Flame} />
          <StatCard label="Max Loss Streak" value={`${m.maxConsecLosses} losses`} color="#ef4444" />
          <StatCard label="Best Session" value={m.bestSession} sub={`${(m.winRateBySession[m.bestSession]?.winRate ?? 0).toFixed(0)}% WR`} icon={Zap} />
          <StatCard label="Gross Wins" value={`+$${m.grossWins.toFixed(2)}`} sub={`Gross Loss: -$${m.grossLosses.toFixed(2)}`} color="#22c55e" />
        </div>

        {/* ── AI Performance Coach ──────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
            <div className="flex items-center gap-3">
              <Brain className="w-4 h-4" style={{ color: GOLD }} />
              <span className="font-black text-sm text-white">🤖 AI PERFORMANCE COACH</span>
              {aiLoading && <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GOLD }} />Analyzing…</span>}
            </div>
            <button onClick={getAIInsight} disabled={aiLoading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black transition-all disabled:opacity-40"
              style={{ background: GOLD, color: '#000', boxShadow: aiLoading ? 'none' : '0 0 16px rgba(212,175,55,0.35)' }}>
              {aiLoading ? <><RefreshCw className="w-3 h-3 animate-spin" /> Analyzing…</> : <><Zap className="w-3 h-3" /> Get AI Coaching</>}
            </button>
          </div>
          <div className="p-5">
            {!aiInsight && !aiLoading ? (
              <div className="flex flex-col items-center py-10 gap-3 text-center">
                <Brain className="w-10 h-10 text-gray-800" />
                <p className="text-gray-600 text-sm">Click <strong style={{ color: GOLD }}>Get AI Coaching</strong> for personalized improvement advice</p>
                <p className="text-gray-700 text-xs">AI analyzes your real trade data and gives specific, actionable feedback based on your actual performance</p>
              </div>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed prose-headings:text-yellow-400 prose-strong:text-white">
                <ReactMarkdown>{aiInsight || '▌'}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  )
}
