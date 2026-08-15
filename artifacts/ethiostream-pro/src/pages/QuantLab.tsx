/**
 * QuantLab — COT Backtest Engine
 * Full institutional-grade backtesting powered by the Dreesmann 5-condition methodology.
 * Deeply integrated with Order Flow / COT page data.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Cell, PieChart, Pie,
} from 'recharts'
import {
  FlaskConical, Play, Download, RefreshCw, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Activity, BarChart2, Shield, Zap,
  BookOpen, Target, AlertTriangle, CheckCircle, XCircle,
  Info, Clock, Award, Layers, Filter, Cpu, Star,
} from 'lucide-react'
import {
  runBacktest, mergeBacktestResults,
  type BacktestParams, type BacktestResult, type BacktestSignal,
  type PerformanceMetrics,
} from '@/utils/backtestEngine'
import AskAlchemistButton from '@/components/AskAlchemistButton'

// ── Constants ──────────────────────────────────────────────────────────────────
const GOLD   = '#D4AF37'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const BLUE   = '#3b82f6'
const PURPLE = '#8b5cf6'
const GRAY   = '#4b5563'

const GRADE_COLORS: Record<string, string> = {
  'A+': GOLD, 'A': GREEN, 'B+': BLUE, 'B': PURPLE, 'C': GRAY,
}

const INSTRUMENTS = [
  { value: 'XAUUSD', label: 'Gold (XAUUSD)', emoji: '🥇' },
  { value: 'EURUSD', label: 'Euro (EURUSD)', emoji: '🇪🇺' },
  { value: 'GBPUSD', label: 'Cable (GBPUSD)', emoji: '🇬🇧' },
]

const DEFAULT_PARAMS: BacktestParams = {
  instrument: 'ALL',
  csiLookback: 156,
  nrsiLookback: 156,
  ncLongThreshold: 0.40,
  ncShortThreshold: 0.15,
  oiLookback: 26,
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, digits = 2, suffix = ''): string {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(digits) + suffix
}
function fmtPct(n: number | null | undefined): string { return fmt(n, 1, '%') }
function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString()
}
function trafficLight(value: number, good: number, bad: number): string {
  if (value >= good) return 'text-emerald-400'
  if (value <= bad)  return 'text-red-400'
  return 'text-amber-400'
}
function pFmt(p: number): string {
  if (p < 0.001) return '< 0.001'
  if (p < 0.01)  return p.toFixed(3)
  return p.toFixed(3)
}

// ── Data fetching ──────────────────────────────────────────────────────────────
async function fetchCOTData(instrument: string) {
  const r = await fetch(`/api/backtest/cot-data?instrument=${instrument}`)
  if (!r.ok) throw new Error(`COT data error ${r.status}`)
  const j = await r.json()
  return j.data as any[]
}
async function fetchPriceData(instrument: string) {
  const r = await fetch(`/api/backtest/price-data?instrument=${instrument}`)
  if (!r.ok) throw new Error(`Price data error ${r.status}`)
  const j = await r.json()
  return j.data as { date: string; close: number }[]
}
async function fetchRegimeData() {
  const r = await fetch('/api/backtest/regime-data')
  if (!r.ok) throw new Error(`Regime data error ${r.status}`)
  const j = await r.json()
  return j.data as any[]
}

// ── CSV export ─────────────────────────────────────────────────────────────────
function exportCSV(signals: BacktestSignal[]) {
  const headers = [
    'Date', 'Instrument', 'Direction', 'Grade', 'Conditions Met',
    'C1', 'C2', 'C3', 'C4', 'C5',
    'Entry Price', 'CSI', 'NC%', 'NRSI',
    '1W%', '4W%', '8W%', '12W%', '26W%',
    '4W MFE', '4W MAE',
    'DXY Regime', 'VIX Regime', 'Trend Regime', 'Period',
  ]
  const rows = signals.map(s => [
    s.date, s.instrument, s.direction, s.grade, s.conditionsMet,
    ...s.conditions.map(c => c ? '1' : '0'),
    s.entryPrice, s.csi, s.ncPct, s.nrsi,
    s.ret1W ?? '', s.ret4W ?? '', s.ret8W ?? '', s.ret12W ?? '', s.ret26W ?? '',
    s.mfe4W ?? '', s.mae4W ?? '',
    s.dxyRegime, s.vixRegime, s.trendRegime, s.period,
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'jjnexus_cot_backtest.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, icon: Icon, trend }: {
  label: string; value: string; sub?: string; color?: string
  icon?: any; trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-1"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40 uppercase tracking-wider font-medium">{label}</span>
        {Icon && <Icon size={14} className="text-white/30" />}
      </div>
      <div className={`text-2xl font-bold font-mono ${color ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-white/40">{sub}</div>}
    </motion.div>
  )
}

// ── Metric Row ─────────────────────────────────────────────────────────────────
function MetricTable({ metrics, holdingPeriod }: { metrics: PerformanceMetrics[]; holdingPeriod: string }) {
  const rows = metrics.filter(m => m.holdingPeriod === holdingPeriod)
    .sort((a, b) => {
      const order = ['A+', 'A', 'B+', 'B', 'C', 'ALL']
      return order.indexOf(a.grade) - order.indexOf(b.grade)
    })

  if (rows.length === 0) return <div className="text-white/40 text-sm p-4">No data</div>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-white/40 border-b border-white/[0.06]">
            {['Grade', 'Signals', 'Win %', 'Avg Ret', 'Median', 'Std Dev', 'Sharpe (ann.)', 'Sortino', 'P.Factor', 'Expectancy', 'Max DD', 't-Stat', 'p-Value'].map(h => (
              <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.grade} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3">
                <span className="px-2 py-0.5 rounded text-xs font-bold"
                  style={{ background: `${GRADE_COLORS[m.grade] ?? GRAY}22`, color: GRADE_COLORS[m.grade] ?? 'white' }}>
                  {m.grade}
                </span>
              </td>
              <td className="py-2 px-3 text-white/70">{fmtN(m.signals)}</td>
              <td className={`py-2 px-3 font-bold ${trafficLight(m.winRate, 55, 45)}`}>{fmtPct(m.winRate)}</td>
              <td className={`py-2 px-3 ${m.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(m.avgReturn, 3, '%')}</td>
              <td className={`py-2 px-3 ${m.medianReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(m.medianReturn, 3, '%')}</td>
              <td className="py-2 px-3 text-white/50">{fmt(m.stdDev, 3)}</td>
              <td className={`py-2 px-3 font-bold ${trafficLight(m.sharpe, 1, 0)}`}>{fmt(m.sharpe, 3)}<div className="text-[9px] font-normal text-white/35">raw {fmt(m.rawSharpe, 3)}</div></td>
              <td className={`py-2 px-3 ${trafficLight(m.sortino, 1.2, 0)}`}>{fmt(m.sortino, 3)}</td>
              <td className={`py-2 px-3 ${trafficLight(m.profitFactor, 1.5, 1)}`}>{fmt(m.profitFactor, 2)}</td>
              <td className={`py-2 px-3 ${m.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(m.expectancy, 3)}</td>
              <td className="py-2 px-3 text-red-400">{fmt(m.maxDrawdown, 1, '%')}</td>
              <td className={`py-2 px-3 ${Math.abs(m.tStat) >= 2 ? 'text-emerald-400' : 'text-white/50'}`}>{fmt(m.tStat, 3)}</td>
              <td className={`py-2 px-3 ${m.pValue < 0.05 ? 'text-emerald-400' : 'text-white/50'}`}>{pFmt(m.pValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main QuantLab Component ────────────────────────────────────────────────────
export default function QuantLab() {
  const [params, setParams] = useState<BacktestParams>({ ...DEFAULT_PARAMS })
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'signals' | 'regime' | 'academic' | 'live'>('overview')
  const [configOpen, setConfigOpen] = useState(true)
  const [hpFilter, setHpFilter] = useState<'1W' | '4W' | '8W' | '12W' | '26W'>('4W')
  const [signalPage, setSignalPage] = useState(0)
  const [gradeFilter, setGradeFilter] = useState<string>('ALL')
  const [signalDirFilter, setSignalDirFilter] = useState<string>('ALL')
  const abortRef = useRef(false)

  const runBacktestHandler = useCallback(async () => {
    setRunning(true)
    setError(null)
    setProgress(0)
    setProgressMsg('Fetching historical COT data...')
    abortRef.current = false

    try {
      const instruments = params.instrument === 'ALL'
        ? ['XAUUSD', 'EURUSD', 'GBPUSD']
        : [params.instrument]

      setProgress(5)
      setProgressMsg('Fetching COT data from CFTC...')

      // Fetch all data in parallel
      const [cotResults, priceResults, regimeData] = await Promise.all([
        Promise.all(instruments.map(i => fetchCOTData(i).then(d => ({ instrument: i, data: d })))),
        Promise.all(instruments.map(i => fetchPriceData(i).then(d => ({ instrument: i, data: d })))),
        fetchRegimeData(),
      ])

      setProgress(25)
      setProgressMsg('Running signal engine on 20+ years of data...')

      const results: BacktestResult[] = []
      for (let idx = 0; idx < instruments.length; idx++) {
        const inst = instruments[idx]!
        const cotData = cotResults.find(r => r.instrument === inst)?.data ?? []
        const priceData = priceResults.find(r => r.instrument === inst)?.data ?? []

        if (cotData.length < 200) {
          console.warn(`Insufficient COT data for ${inst}: ${cotData.length} rows`)
          continue
        }

        const instrumentParams = { ...params, instrument: inst }
        const r = runBacktest(
          cotData, priceData, regimeData, instrumentParams,
          (pct) => setProgress(25 + Math.round(pct * 0.7 / instruments.length * (idx + 1)))
        )
        results.push(r)
      }

      if (results.length === 0) {
        throw new Error('No backtest results — check API connectivity')
      }

      setProgress(95)
      setProgressMsg('Computing final statistics...')
      const merged = results.length === 1 ? results[0]! : mergeBacktestResults(results)
      setResult(merged)
      setProgress(100)
      setProgressMsg('Done!')
      setConfigOpen(false)
    } catch (err: any) {
      setError(err.message ?? 'Unknown error')
    } finally {
      setRunning(false)
    }
  }, [params])

  // Summary metrics for top cards
  const summaryMetrics = result?.metrics.find(
    m => m.grade === 'ALL' && m.holdingPeriod === hpFilter
  )
  const apMetrics = result?.metrics.find(
    m => m.grade === 'A+' && m.holdingPeriod === hpFilter
  )
  const inSamplePrimary = result?.inSampleMetrics.find(m => m.grade === 'ALL' && m.holdingPeriod === hpFilter)
  const outOfSamplePrimary = result?.outSampleMetrics.find(m => m.grade === 'ALL' && m.holdingPeriod === hpFilter)

  // Filtered signals for table
  const filteredSignals = result?.signals.filter(s => {
    if (gradeFilter !== 'ALL' && s.grade !== gradeFilter) return false
    if (signalDirFilter !== 'ALL' && s.direction !== signalDirFilter) return false
    return true
  }) ?? []

  const PAGE_SIZE = 50
  const totalPages = Math.ceil(filteredSignals.length / PAGE_SIZE)
  const pageSignals = filteredSignals.slice(signalPage * PAGE_SIZE, (signalPage + 1) * PAGE_SIZE)

  const tabs = [
    { id: 'overview', label: 'Performance', icon: BarChart2 },
    { id: 'signals',  label: 'Signals Table', icon: Layers },
    { id: 'regime',   label: 'Regime Analysis', icon: Filter },
    { id: 'academic', label: 'Academic Verification', icon: BookOpen },
    { id: 'live',     label: 'Live Signals', icon: Activity },
  ] as const

  return (
    <div className="min-h-screen bg-[#080c10] text-white overflow-y-auto">
      {/* ── Header ── */}
      <div className="border-b border-white/[0.06] bg-[#0a0f16]">
        <div className="max-w-[1600px] mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center">
              <FlaskConical size={20} style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Quant Lab
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 font-normal">
                  COT Backtest Engine
                </span>
              </h1>
              <p className="text-xs text-white/40 mt-0.5">
                Dreesmann 5-Condition Methodology · 20+ Years Historical Data · Institutional-Grade Statistics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {result && (
              <AskAlchemistButton
                label="Ask Alchemist to interpret"
                prompt={`Review this backtest using actual regenerated page results. Holding period: ${hpFilter}. Total trades: ${summaryMetrics?.signals ?? 0}. Win rate: ${fmtPct(summaryMetrics?.winRate)}. Annualized Sharpe: ${fmt(summaryMetrics?.sharpe, 3)} (raw ${fmt(summaryMetrics?.rawSharpe, 3)}). Max drawdown: ${fmt(summaryMetrics?.maxDrawdown, 2, '%')}. Profit factor: ${fmt(summaryMetrics?.profitFactor, 2)}. In-sample performance: ${inSamplePrimary ? `trades ${inSamplePrimary.signals}, win rate ${fmtPct(inSamplePrimary.winRate)}, Sharpe ${fmt(inSamplePrimary.sharpe, 3)} (raw ${fmt(inSamplePrimary.rawSharpe, 3)}), max drawdown ${fmt(inSamplePrimary.maxDrawdown, 2, '%')}, profit factor ${fmt(inSamplePrimary.profitFactor, 2)}` : 'unavailable'}. Out-of-sample performance: ${outOfSamplePrimary ? `trades ${outOfSamplePrimary.signals}, win rate ${fmtPct(outOfSamplePrimary.winRate)}, Sharpe ${fmt(outOfSamplePrimary.sharpe, 3)} (raw ${fmt(outOfSamplePrimary.rawSharpe, 3)}), max drawdown ${fmt(outOfSamplePrimary.maxDrawdown, 2, '%')}, profit factor ${fmt(outOfSamplePrimary.profitFactor, 2)}` : 'unavailable'}. Primary XAUUSD LONG academic verification: annual return ${result.academicVerification.dreesmannAnnReturn.toFixed(2)}%, Sharpe ${result.academicVerification.dreesmannSharpe.toFixed(3)}, max drawdown ${result.academicVerification.dreesmannMaxDD.toFixed(2)}%, win rate ${result.academicVerification.dreesmannWinRate.toFixed(1)}%. Separate Dreesmann groups: ${result.academicVerification.dreesmannByGroup.map(group => `${group.label} n=${group.sample}, annual=${group.annualReturn.toFixed(2)}%, Sharpe=${group.sharpe.toFixed(3)}, maxDD=${group.maxDrawdown.toFixed(2)}%, win=${group.winRate.toFixed(1)}%`).join(' | ')}. Zhang & Laws: beta ${result.academicVerification.zhangBeta.toFixed(4)}, correlation ${result.academicVerification.zhangCorrelation.toFixed(4)}, t-stat ${result.academicVerification.zhangTStat.toFixed(3)}, two-tailed p-value ${result.academicVerification.zhangPValue.toFixed(4)}. Explain robustness, limitations, direction-specific behavior, and conservative next steps without giving financial advice. Do not average long and short results or invent metrics.`}
              />
            )}
            {result && (
              <button
                onClick={() => exportCSV(result.signals)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs text-white/60 hover:text-white hover:border-white/20 transition-all"
              >
                <Download size={14} />
                Export CSV
              </button>
            )}
            <button
              onClick={() => setConfigOpen(p => !p)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs text-white/60 hover:text-white/80 transition-all"
            >
              {configOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Parameters
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">

        {/* ── Config Panel ── */}
        <AnimatePresence>
          {configOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}
              className="bg-[#0d1117] border border-white/[0.06] rounded-2xl overflow-hidden"
            >
              <div className="p-6">
                <h3 className="text-sm font-semibold text-white/70 mb-5 flex items-center gap-2">
                  <Cpu size={14} className="text-[#D4AF37]" />
                  Backtest Configuration
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {/* Instrument */}
                  <div className="lg:col-span-2">
                    <label className="block text-xs text-white/40 mb-2 uppercase tracking-wide">Instrument</label>
                    <div className="flex flex-wrap gap-2">
                      {[{ value: 'ALL', label: 'All 3', emoji: '🌐' }, ...INSTRUMENTS].map(inst => (
                        <button key={inst.value}
                          onClick={() => setParams(p => ({ ...p, instrument: inst.value }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                            params.instrument === inst.value
                              ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]'
                              : 'border-white/10 text-white/50 hover:text-white/70'
                          }`}
                        >
                          {inst.emoji} {inst.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CSI Lookback */}
                  <div>
                    <label className="block text-xs text-white/40 mb-2 uppercase tracking-wide">
                      CSI Lookback
                      <span className="ml-1 text-[#D4AF37]">{params.csiLookback}w</span>
                    </label>
                    <input type="range" min={52} max={312} step={4}
                      value={params.csiLookback}
                      onChange={e => setParams(p => ({ ...p, csiLookback: +e.target.value }))}
                      className="w-full accent-[#D4AF37]"
                    />
                    <div className="flex justify-between text-xs text-white/30 mt-1">
                      <span>52w</span><span>312w</span>
                    </div>
                  </div>

                  {/* NC Long Threshold */}
                  <div>
                    <label className="block text-xs text-white/40 mb-2 uppercase tracking-wide">
                      NC Long Thresh
                      <span className="ml-1 text-[#D4AF37]">{(params.ncLongThreshold * 100).toFixed(0)}%</span>
                    </label>
                    <input type="range" min={0.25} max={0.55} step={0.01}
                      value={params.ncLongThreshold}
                      onChange={e => setParams(p => ({ ...p, ncLongThreshold: +e.target.value }))}
                      className="w-full accent-[#D4AF37]"
                    />
                    <div className="flex justify-between text-xs text-white/30 mt-1">
                      <span>25%</span><span>55%</span>
                    </div>
                  </div>

                  {/* NC Short Threshold */}
                  <div>
                    <label className="block text-xs text-white/40 mb-2 uppercase tracking-wide">
                      NC Short Thresh
                      <span className="ml-1 text-[#D4AF37]">{(params.ncShortThreshold * 100).toFixed(0)}%</span>
                    </label>
                    <input type="range" min={0.05} max={0.25} step={0.01}
                      value={params.ncShortThreshold}
                      onChange={e => setParams(p => ({ ...p, ncShortThreshold: +e.target.value }))}
                      className="w-full accent-[#D4AF37]"
                    />
                    <div className="flex justify-between text-xs text-white/30 mt-1">
                      <span>5%</span><span>25%</span>
                    </div>
                  </div>

                  {/* Run Button */}
                  <div className="flex flex-col justify-end">
                    <button
                      onClick={runBacktestHandler}
                      disabled={running}
                      className="w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                      style={{
                        background: running ? '#1a1a1a' : `linear-gradient(135deg, ${GOLD}, #b8942e)`,
                        color: running ? '#666' : '#000',
                        cursor: running ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {running ? (
                        <><RefreshCw size={14} className="animate-spin" /> Running…</>
                      ) : (
                        <><Play size={14} /> Run Backtest</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <AnimatePresence>
                {running && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="border-t border-white/[0.06] px-6 py-4"
                  >
                    <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                      <span className="flex items-center gap-2">
                        <Cpu size={12} className="text-[#D4AF37] animate-pulse" />
                        {progressMsg}
                      </span>
                      <span style={{ color: GOLD }}>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${GOLD}, #b8942e)` }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Backtest Error</p>
              <p className="text-xs text-red-400/70 mt-1">{error}</p>
              <p className="text-xs text-white/40 mt-2">
                Ensure the API server is running and CFTC/Yahoo Finance APIs are reachable.
              </p>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

            {/* Holding period filter */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/40 uppercase tracking-wide">Holding Period:</span>
              {(['1W', '4W', '8W', '12W', '26W'] as const).map(hp => (
                <button key={hp}
                  onClick={() => setHpFilter(hp)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                    hpFilter === hp
                      ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]'
                      : 'border-white/10 text-white/50 hover:text-white/70'
                  }`}
                >
                  {hp}
                </button>
              ))}
              <span className="text-xs text-white/30 ml-2">
                {result.signals.length} total signals · {result.signals.filter(s => s.period === 'IN_SAMPLE').length} in-sample · {result.signals.filter(s => s.period === 'OUT_OF_SAMPLE').length} out-of-sample
              </span>
            </div>

            {/* KPI Row 1 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <KPICard
                label="Total Signals" value={fmtN(summaryMetrics?.signals)}
                icon={Zap} color="text-white"
              />
              <KPICard
                label={`Win Rate (${hpFilter})`}
                value={fmtPct(summaryMetrics?.winRate)}
                sub="All grades"
                color={trafficLight(summaryMetrics?.winRate ?? 0, 55, 45)}
                icon={Target}
              />
              <KPICard
                label={`Avg Return (${hpFilter})`}
                value={fmt(summaryMetrics?.avgReturn, 2, '%')}
                sub="Mean per signal"
                color={(summaryMetrics?.avgReturn ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
                icon={TrendingUp}
              />
              <KPICard
                label={`Sharpe (${hpFilter})`}
                value={fmt(summaryMetrics?.sharpe, 3)}
                sub="Ann. risk-adjusted"
                color={trafficLight(summaryMetrics?.sharpe ?? 0, 1, 0)}
                icon={Activity}
              />
              <KPICard
                label="Max Drawdown"
                value={fmt(summaryMetrics?.maxDrawdown, 1, '%')}
                sub="Equity curve peak-to-trough"
                color="text-red-400"
                icon={Shield}
              />
            </div>

            {/* KPI Row 2 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <KPICard
                label="Profit Factor" value={fmt(summaryMetrics?.profitFactor, 2)}
                color={trafficLight(summaryMetrics?.profitFactor ?? 0, 1.5, 1)}
                icon={Award}
              />
              <KPICard
                label="Expectancy" value={fmt(summaryMetrics?.expectancy, 3, '%')}
                color={(summaryMetrics?.expectancy ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
              />
              <KPICard
                label="t-Statistic"
                value={fmt(summaryMetrics?.tStat, 3)}
                sub="H₀: mean return = 0"
                color={Math.abs(summaryMetrics?.tStat ?? 0) >= 2 ? 'text-emerald-400' : 'text-amber-400'}
                icon={BookOpen}
              />
              <KPICard
                label="p-Value"
                value={summaryMetrics ? pFmt(summaryMetrics.pValue) : '—'}
                sub={summaryMetrics && summaryMetrics.pValue < 0.05 ? '✓ Statistically significant' : '× Not significant'}
                color={summaryMetrics && summaryMetrics.pValue < 0.05 ? 'text-emerald-400' : 'text-amber-400'}
              />
              <KPICard
                label={`A+ Win Rate (${hpFilter})`}
                value={fmtPct(apMetrics?.winRate)}
                sub={`${fmtN(apMetrics?.signals)} A+ signals`}
                color={trafficLight(apMetrics?.winRate ?? 0, 60, 50)}
                icon={Star}
              />
            </div>

            {/* ── Tabs ── */}
            <div className="border-b border-white/[0.06] flex gap-1">
              {tabs.map(tab => (
                <button key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                    activeTab === tab.id
                      ? 'text-[#D4AF37] border-[#D4AF37]'
                      : 'text-white/40 border-transparent hover:text-white/60'
                  }`}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ─────── TAB: OVERVIEW ─────── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Equity Curve */}
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                    <TrendingUp size={14} style={{ color: GOLD }} />
                    Equity Curve — Strategy vs Benchmark (4W Holding)
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={result.equityCurve4W.filter((_, i) => i % 2 === 0)}>
                      <defs>
                        <linearGradient id="stratGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={GOLD}  stopOpacity={0.15} />
                          <stop offset="95%" stopColor={GOLD}  stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="benchGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={GRAY}  stopOpacity={0.1} />
                          <stop offset="95%" stopColor={GRAY}  stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#ffffff40' }}
                        tickFormatter={d => d?.slice(0, 7)} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#ffffff40' }}
                        tickFormatter={v => `${v.toFixed(0)}`} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(4,6,8,0.97)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.9)', padding: '10px 14px' }}
                        labelStyle={{ color: '#D4AF37', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}
                        itemStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}
                        formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="strategyEquity" stroke={GOLD} fill="url(#stratGrad)"
                        strokeWidth={2} name="COT Strategy" dot={false} />
                      <Area type="monotone" dataKey="benchmarkEquity" stroke={GRAY} fill="url(#benchGrad)"
                        strokeWidth={1.5} name="Benchmark" dot={false} strokeDasharray="4 2" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Grade distribution + Time decay */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Grade pie */}
                  <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                      <Award size={14} style={{ color: GOLD }} />
                      Signal Grade Distribution
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={result.gradeDistribution.filter(g => g.count > 0)}
                          dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={80}
                          label={({ grade, count }) => `${grade} (${count})`}
                          labelLine={{ stroke: '#ffffff30' }}
                        >
                          {result.gradeDistribution.map(g => (
                            <Cell key={g.grade} fill={GRADE_COLORS[g.grade] ?? GRAY} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'rgba(4,6,8,0.97)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.9)', padding: '10px 14px' }}
                          labelStyle={{ color: '#D4AF37', fontSize: 11, fontWeight: 'bold' }}
                          itemStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}
                          formatter={(v: any, n: any) => [v, n]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Time decay */}
                  <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                      <Clock size={14} style={{ color: GOLD }} />
                      Time-Decay Analysis — Sharpe vs Holding Period
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={result.timeDemand}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                        <XAxis dataKey="weeks" tick={{ fontSize: 10, fill: '#ffffff40' }}
                          tickFormatter={w => `${w}W`} />
                        <YAxis tick={{ fontSize: 10, fill: '#ffffff40' }} />
                        <Tooltip
                          contentStyle={{ background: 'rgba(4,6,8,0.97)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.9)', padding: '10px 14px' }}
                          labelStyle={{ color: '#D4AF37', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}
                          itemStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}
                          labelFormatter={v => `${v}W Holding`}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="#ffffff20" />
                        <Line type="monotone" dataKey="sharpe" stroke={GOLD} strokeWidth={2.5}
                          name="Sharpe Ratio" dot={{ fill: GOLD, r: 4 }} />
                        <Line type="monotone" dataKey="winRate" stroke={BLUE} strokeWidth={1.5}
                          name="Win Rate %" dot={{ fill: BLUE, r: 3 }} strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Signal heatmap by year */}
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                    <BarChart2 size={14} style={{ color: GOLD }} />
                    Signals by Year & Grade
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={result.signalsByYear}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#ffffff40' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#ffffff40' }} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(4,6,8,0.97)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.9)', padding: '10px 14px' }}
                        labelStyle={{ color: '#D4AF37', fontSize: 11, fontWeight: 'bold' }}
                        itemStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="A+" stackId="a" fill={GOLD} />
                      <Bar dataKey="A"  stackId="a" fill={GREEN} />
                      <Bar dataKey="B+" stackId="a" fill={BLUE} />
                      <Bar dataKey="B"  stackId="a" fill={PURPLE} />
                      <Bar dataKey="C"  stackId="a" fill={GRAY} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Full metrics table */}
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                    <Target size={14} style={{ color: GOLD }} />
                    Performance Metrics — {hpFilter} Holding Period (All Grades)
                  </h3>
                  <MetricTable metrics={result.metrics} holdingPeriod={hpFilter} />
                </div>

                {/* In-sample vs out-of-sample */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white/80 mb-1 flex items-center gap-2">
                      <CheckCircle size={14} className="text-emerald-400" />
                      In-Sample (2000–70% cutoff)
                    </h3>
                    <p className="text-xs text-white/30 mb-4">{result.inSampleMetrics.find(m => m.grade === 'ALL' && m.holdingPeriod === hpFilter)?.signals ?? 0} signals</p>
                    <MetricTable metrics={result.inSampleMetrics} holdingPeriod={hpFilter} />
                  </div>
                  <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white/80 mb-1 flex items-center gap-2">
                      <Shield size={14} className="text-blue-400" />
                      Out-of-Sample (30% holdout)
                    </h3>
                    <p className="text-xs text-white/30 mb-4">{result.outSampleMetrics.find(m => m.grade === 'ALL' && m.holdingPeriod === hpFilter)?.signals ?? 0} signals</p>
                    <MetricTable metrics={result.outSampleMetrics} holdingPeriod={hpFilter} />
                  </div>
                </div>
              </div>
            )}

            {/* ─────── TAB: SIGNALS TABLE ─────── */}
            {activeTab === 'signals' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">Grade:</span>
                    {['ALL', 'A+', 'A', 'B+', 'B', 'C'].map(g => (
                      <button key={g}
                        onClick={() => { setGradeFilter(g); setSignalPage(0) }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                          gradeFilter === g
                            ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]'
                            : 'border-white/10 text-white/50 hover:text-white/70'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">Direction:</span>
                    {['ALL', 'LONG', 'SHORT'].map(d => (
                      <button key={d}
                        onClick={() => { setSignalDirFilter(d); setSignalPage(0) }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                          signalDirFilter === d
                            ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]'
                            : 'border-white/10 text-white/50 hover:text-white/70'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-white/30 ml-auto">{filteredSignals.length} signals shown</span>
                </div>

                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="bg-white/[0.02] text-white/40 border-b border-white/[0.06]">
                          {['Date','Inst','Dir','Grade','C1','C2','C3','C4','C5','Entry','CSI','NC%','NRSI',
                            '1W%','4W%','8W%','12W%','26W%','MFE','MAE','DXY','VIX','Trend','Period'].map(h => (
                            <th key={h} className="py-2.5 px-2 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageSignals.map((s, idx) => (
                          <tr key={`${s.date}-${idx}`}
                            className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="py-2 px-2 text-white/60">{s.date}</td>
                            <td className="py-2 px-2 text-white/80 font-bold">{s.instrument}</td>
                            <td className="py-2 px-2">
                              <span className={`font-bold ${s.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {s.direction === 'LONG' ? '▲' : '▼'} {s.direction}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                                style={{ background: `${GRADE_COLORS[s.grade] ?? GRAY}22`, color: GRADE_COLORS[s.grade] ?? 'white' }}>
                                {s.grade}
                              </span>
                            </td>
                            {s.conditions.map((c, ci) => (
                              <td key={ci} className="py-2 px-2">
                                {c ? <CheckCircle size={12} className="text-emerald-400" /> : <XCircle size={12} className="text-red-400/50" />}
                              </td>
                            ))}
                            <td className="py-2 px-2 text-white/70">{s.entryPrice.toFixed(4)}</td>
                            <td className="py-2 px-2 text-white/60">{s.csi.toFixed(3)}</td>
                            <td className="py-2 px-2 text-white/60">{(s.ncPct * 100).toFixed(1)}%</td>
                            <td className="py-2 px-2 text-white/60">{s.nrsi.toFixed(3)}</td>
                            {([s.ret1W, s.ret4W, s.ret8W, s.ret12W, s.ret26W] as (number|null)[]).map((r, ri) => (
                              <td key={ri} className={`py-2 px-2 font-bold ${r == null ? 'text-white/20' : r >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {r == null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`}
                              </td>
                            ))}
                            <td className="py-2 px-2 text-emerald-400">{s.mfe4W != null ? `+${s.mfe4W.toFixed(2)}%` : '—'}</td>
                            <td className="py-2 px-2 text-red-400">{s.mae4W != null ? `${s.mae4W.toFixed(2)}%` : '—'}</td>
                            <td className="py-2 px-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.dxyRegime==='STRONG_USD'?'bg-red-500/15 text-red-400':s.dxyRegime==='WEAK_USD'?'bg-emerald-500/15 text-emerald-400':s.dxyRegime==='RANGING'?'bg-amber-500/15 text-amber-400':'bg-white/5 text-white/20'}`}>{s.dxyRegime==='UNKNOWN'?'—':s.dxyRegime.replace('_',' ')}</span>
                            </td>
                            <td className="py-2 px-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.vixRegime==='CRISIS'?'bg-red-500/15 text-red-400':s.vixRegime==='ELEVATED'?'bg-amber-500/15 text-amber-400':s.vixRegime==='NORMAL'?'bg-emerald-500/15 text-emerald-400':'bg-white/5 text-white/20'}`}>{s.vixRegime==='UNKNOWN'?'—':s.vixRegime}</span>
                            </td>
                            <td className="py-2 px-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.trendRegime==='BULL'?'bg-emerald-500/15 text-emerald-400':s.trendRegime==='BEAR'?'bg-red-500/15 text-red-400':s.trendRegime==='RANGING'?'bg-blue-500/15 text-blue-400':'bg-white/5 text-white/20'}`}>{s.trendRegime==='UNKNOWN'?'—':s.trendRegime}</span>
                            </td>
                            <td className="py-2 px-2">
                              <span className={`text-xs ${s.period === 'IN_SAMPLE' ? 'text-blue-400' : 'text-amber-400'}`}>
                                {s.period === 'IN_SAMPLE' ? 'IS' : 'OOS'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                    <span className="text-xs text-white/40">
                      Page {signalPage + 1} / {totalPages} · {filteredSignals.length} signals
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setSignalPage(p => Math.max(0, p - 1))}
                        disabled={signalPage === 0}
                        className="px-3 py-1 rounded-lg border border-white/10 text-xs text-white/50 hover:text-white/80 disabled:opacity-30 transition-all">
                        ← Prev
                      </button>
                      <button onClick={() => setSignalPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={signalPage >= totalPages - 1}
                        className="px-3 py-1 rounded-lg border border-white/10 text-xs text-white/50 hover:text-white/80 disabled:opacity-30 transition-all">
                        Next →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─────── TAB: REGIME ANALYSIS ─────── */}
            {activeTab === 'regime' && (() => {
              // ── Pre-compute distribution donuts ────────────────────────────────
              const allSignals = result.signals ?? []
              const dxyDist = (['STRONG_USD','WEAK_USD','RANGING','UNKNOWN'] as const).map(state => ({
                name: state === 'UNKNOWN' ? 'Unknown' : state.replace('_',' '),
                value: allSignals.filter(s => s.dxyRegime === state && s.grade !== 'C').length,
                color: state==='STRONG_USD'?RED:state==='WEAK_USD'?GREEN:state==='RANGING'?GOLD:GRAY,
              })).filter(d => d.value > 0)
              const vixDist = (['NORMAL','ELEVATED','CRISIS','UNKNOWN'] as const).map(state => ({
                name: state,
                value: allSignals.filter(s => s.vixRegime === state && s.grade !== 'C').length,
                color: state==='NORMAL'?GREEN:state==='ELEVATED'?GOLD:state==='CRISIS'?RED:GRAY,
              })).filter(d => d.value > 0)
              const trendDist = (['BULL','BEAR','RANGING','UNKNOWN'] as const).map(state => ({
                name: state,
                value: allSignals.filter(s => s.trendRegime === state && s.grade !== 'C').length,
                color: state==='BULL'?GREEN:state==='BEAR'?RED:state==='RANGING'?BLUE:GRAY,
              })).filter(d => d.value > 0)

              const DXY_LABELS: Record<string,{label:string;desc:string;col:string}> = {
                STRONG_USD: { label:'Strong USD', desc:'DXY > 50w SMA +2% — headwind for Gold, tailwind for $-pairs', col:'text-red-400' },
                WEAK_USD:   { label:'Weak USD',   desc:'DXY < 50w SMA -2% — tailwind for Gold, headwind for $-pairs', col:'text-emerald-400' },
                RANGING:    { label:'Ranging DXY', desc:'DXY within ±2% of 50w SMA — low dollar trend conviction', col:'text-amber-400' },
              }
              const VIX_LABELS: Record<string,{label:string;desc:string;col:string}> = {
                NORMAL:   { label:'Normal (<20)',   desc:'Risk-on environment — momentum signals tend to perform best', col:'text-emerald-400' },
                ELEVATED: { label:'Elevated (20–30)', desc:'Caution zone — higher volatility, wider ranges expected', col:'text-amber-400' },
                CRISIS:   { label:'Crisis (>30)',   desc:'Fear spike — COT reversals can be very powerful but fast', col:'text-red-400' },
              }

              return (
              <div className="space-y-5">

                {/* ── Distribution donuts ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { title: 'DXY Regime Distribution', dist: dxyDist, note: 'A+/A/B+ signals only' },
                    { title: 'VIX Regime Distribution', dist: vixDist, note: 'A+/A/B+ signals only' },
                    { title: 'Trend Regime Distribution', dist: trendDist, note: 'A+/A/B+ signals only' },
                  ].map(({ title, dist, note }) => {
                    const total = dist.reduce((s,d) => s+d.value, 0)
                    return (
                      <div key={title} className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-4">
                        <p className="text-xs font-semibold text-white/70 mb-0.5">{title}</p>
                        <p className="text-[10px] text-white/30 mb-3">{note}</p>
                        <div className="flex items-center gap-3">
                          <ResponsiveContainer width={90} height={90}>
                            <PieChart>
                              <Pie data={dist} cx={40} cy={40} innerRadius={26} outerRadius={42} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                                {dist.map((d,i) => <Cell key={i} fill={d.color} />)}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="flex-1 space-y-1.5">
                            {dist.map(d => (
                              <div key={d.name} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                  <span className="text-[10px] text-white/60">{d.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono text-white/80 font-bold">{d.value}</span>
                                  <span className="text-[9px] text-white/30">{total>0?`${Math.round(d.value/total*100)}%`:''}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ── DXY context legend ── */}
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                    <Filter size={14} style={{ color: GOLD }} />
                    DXY Regime Context
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                    {Object.entries(DXY_LABELS).map(([state, info]) => {
                      const m = result.regimeMetrics.find(r => r.regimeDimension==='DXY Regime' && r.regimeState===state)
                      return (
                        <div key={state} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                          <span className={`text-xs font-bold ${info.col}`}>{info.label}</span>
                          <p className="text-[10px] text-white/35 mt-1 mb-2 leading-relaxed">{info.desc}</p>
                          {m && m.signals > 0 ? (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                              <span className="text-white/40">Signals: <span className="text-white/70 font-mono">{m.signals}</span></span>
                              <span className="text-white/40">Win%: <span className={`font-mono font-bold ${trafficLight(m.winRate,55,45)}`}>{fmtPct(m.winRate)}</span></span>
                              <span className="text-white/40">Avg Ret: <span className={`font-mono font-bold ${m.avgReturn>=0?'text-emerald-400':'text-red-400'}`}>{fmt(m.avgReturn,2,'%')}</span></span>
                              <span className="text-white/40">Sharpe: <span className={`font-mono font-bold ${trafficLight(m.sharpe,1,0)}`}>{fmt(m.sharpe,2)}</span></span>
                            </div>
                          ) : <p className="text-[10px] text-white/20 italic">No signals in this regime</p>}
                        </div>
                      )
                    })}
                  </div>

                  {/* ── VIX context ── */}
                  <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                    <Activity size={14} style={{ color: GOLD }} />
                    VIX Volatility Regime Context
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(VIX_LABELS).map(([state, info]) => {
                      const m = result.regimeMetrics.find(r => r.regimeDimension==='VIX Regime' && r.regimeState===state)
                      return (
                        <div key={state} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                          <span className={`text-xs font-bold ${info.col}`}>{info.label}</span>
                          <p className="text-[10px] text-white/35 mt-1 mb-2 leading-relaxed">{info.desc}</p>
                          {m && m.signals > 0 ? (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                              <span className="text-white/40">Signals: <span className="text-white/70 font-mono">{m.signals}</span></span>
                              <span className="text-white/40">Win%: <span className={`font-mono font-bold ${trafficLight(m.winRate,55,45)}`}>{fmtPct(m.winRate)}</span></span>
                              <span className="text-white/40">Avg Ret: <span className={`font-mono font-bold ${m.avgReturn>=0?'text-emerald-400':'text-red-400'}`}>{fmt(m.avgReturn,2,'%')}</span></span>
                              <span className="text-white/40">Sharpe: <span className={`font-mono font-bold ${trafficLight(m.sharpe,1,0)}`}>{fmt(m.sharpe,2)}</span></span>
                            </div>
                          ) : <p className="text-[10px] text-white/20 italic">No signals in this regime</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ── Regime-conditional performance (all 3 dims) ── */}
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                    <BarChart2 size={14} style={{ color: GOLD }} />
                    Sharpe Ratio by Regime — Best Operating Conditions
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={result.regimeMetrics.filter(r=>r.signals>0)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#ffffff40' }} tickFormatter={v=>v.toFixed(1)} />
                      <YAxis type="category" dataKey="regimeState" tick={{ fontSize: 10, fill: '#ffffff60' }} width={95}
                        tickFormatter={v => v.replace('STRONG_USD','Strong USD').replace('WEAK_USD','Weak USD').replace('_',' ')} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(4,6,8,0.97)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.9)', padding: '10px 14px' }}
                        labelStyle={{ color: '#D4AF37', fontSize: 11, fontWeight: 'bold' }}
                        itemStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}
                        formatter={(v: any, _: any, p: any) => [`Sharpe: ${Number(v).toFixed(3)} · ${p.payload.signals} signals · WR: ${p.payload.winRate?.toFixed(1)}%`, p.payload.regimeDimension]}
                      />
                      <ReferenceLine x={0} stroke="#ffffff20" />
                      <Bar dataKey="sharpe" radius={[0, 4, 4, 0]}>
                        {result.regimeMetrics.filter(r=>r.signals>0).map((r, i) => (
                          <Cell key={i} fill={r.sharpe > 1 ? GREEN : r.sharpe > 0 ? GOLD : RED} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-white/30 mt-2 text-center">Green = Sharpe &gt; 1 · Gold = Sharpe 0–1 · Red = negative Sharpe</p>
                </div>
              </div>
              )
            })()}

            {/* ─────── TAB: ACADEMIC VERIFICATION ─────── */}
            {activeTab === 'academic' && (
              <div className="space-y-5">
                {/* Dreesmann Replication */}
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6">
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center shrink-0">
                      <BookOpen size={18} style={{ color: GOLD }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Dreesmann et al. (2023) Replication</h3>
                      <p className="text-xs text-white/40 mt-1">
                        "The Commitment of Traders report as a trading signal?" — Int. J. Financial Markets and Derivatives, Vol. 9
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                      { label: 'Cumulative Return', yours: `${fmt(result.academicVerification.dreesmannCumReturn, 1)}%`, paper: '~127%', good: result.academicVerification.dreesmannCumReturn > 50 },
                      { label: 'Annualised Return', yours: `${fmt(result.academicVerification.dreesmannAnnReturn, 2)}%`, paper: '~3.5%', good: result.academicVerification.dreesmannAnnReturn > 2 },
                      { label: 'Sharpe Ratio', yours: fmt(result.academicVerification.dreesmannSharpe, 3), paper: '1.24–2.09', good: result.academicVerification.dreesmannSharpe > 1.0 },
                      { label: 'Max Drawdown', yours: `${fmt(result.academicVerification.dreesmannMaxDD, 1)}%`, paper: '~18%', good: result.academicVerification.dreesmannMaxDD < 25 },
                      { label: 'Win Rate', yours: `${fmt(result.academicVerification.dreesmannWinRate, 1)}%`, paper: '~62%', good: result.academicVerification.dreesmannWinRate > 55 },
                    ].map(item => (
                      <div key={item.label} className={`p-4 rounded-xl border ${item.good ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                        <p className="text-xs text-white/40 mb-2">{item.label}</p>
                        <p className={`text-xl font-bold font-mono ${item.good ? 'text-emerald-400' : 'text-amber-400'}`}>{item.yours}</p>
                        <p className="text-xs text-white/30 mt-1">Paper: {item.paper}</p>
                        <div className={`flex items-center gap-1 mt-2 text-xs ${item.good ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {item.good ? <CheckCircle size={11} /> : <Info size={11} />}
                          {item.good ? 'Confirmed' : 'Check parameters'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Zhang & Laws Correlation */}
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6">
                  <div className="flex items-start gap-4 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/10 flex items-center justify-center shrink-0">
                      <Activity size={18} style={{ color: BLUE }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Zhang & Laws (2013) Correlation Verification</h3>
                      <p className="text-xs text-white/40 mt-1">
                        "Investor Sentiment and Forecasting Ability: Evidence from COT Reports in Precious Metal Futures Markets"
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      {
                        label: 'Pearson Correlation (CSI vs Returns)',
                        yours: fmt(result.academicVerification.zhangCorrelation, 4),
                        paper: '—', note: 'Negative = predictive value',
                        good: Math.abs(result.academicVerification.zhangCorrelation) > 0.05,
                      },
                      {
                        label: 'Regression Beta',
                        yours: fmt(result.academicVerification.zhangBeta, 4),
                        paper: '-0.016',
                        good: result.academicVerification.zhangBeta < 0,
                      },
                      {
                        label: 't-Statistic',
                        yours: fmt(result.academicVerification.zhangTStat, 3),
                        paper: '-5.696',
                        good: Math.abs(result.academicVerification.zhangTStat) >= 2,
                      },
                      {
                        label: 'p-Value',
                        yours: pFmt(result.academicVerification.zhangPValue),
                        paper: '< 0.01',
                        good: result.academicVerification.zhangPValue < 0.05,
                      },
                    ].map(item => (
                      <div key={item.label} className={`p-4 rounded-xl border ${item.good ? 'border-blue-500/20 bg-blue-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                        <p className="text-xs text-white/40 mb-2">{item.label}</p>
                        <p className={`text-xl font-bold font-mono ${item.good ? 'text-blue-400' : 'text-amber-400'}`}>{item.yours}</p>
                        <p className="text-xs text-white/30 mt-1">Paper: {item.paper}</p>
                        {item.note && <p className="text-xs text-white/20 mt-0.5">{item.note}</p>}
                        <div className={`flex items-center gap-1 mt-2 text-xs ${item.good ? 'text-blue-400' : 'text-amber-400'}`}>
                          {item.good ? <CheckCircle size={11} /> : <Info size={11} />}
                          {item.good ? 'Verified' : 'Inconclusive'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                    <p className="text-xs text-white/40 leading-relaxed">
                      <strong className="text-white/60">Interpretation:</strong>{' '}
                      Zhang & Laws found that Commercial traders (beta = -0.016, t = -5.696, p &lt; 0.01) have significant
                      forecasting ability in Gold futures. A negative beta means high commercial long positioning (high CSI)
                      correlates with negative future price returns — confirming the contrarian commercial signal logic.
                      Your dataset {Math.abs(result.academicVerification.zhangTStat) >= 2 ? '✓ confirms' : '× does not yet confirm'} this finding.
                    </p>
                  </div>
                </div>

                {/* Out-of-sample robustness */}
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                    <Shield size={16} className="text-blue-400" />
                    Out-of-Sample Robustness Test
                  </h3>
                  <p className="text-xs text-white/40 mb-4">
                    Academic standard: Out-of-sample Sharpe must be ≥50% of in-sample Sharpe to validate the model.
                  </p>
                  {(() => {
                    const isM = result.inSampleMetrics.find(m => m.grade === 'ALL' && m.holdingPeriod === '4W')
                    const oosM = result.outSampleMetrics.find(m => m.grade === 'ALL' && m.holdingPeriod === '4W')
                    if (!isM || !oosM) return <p className="text-xs text-white/30">Insufficient data</p>
                    const ratio = isM.sharpe > 0 ? oosM.sharpe / isM.sharpe : 0
                    const robust = ratio >= 0.5
                    return (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-white/[0.02] rounded-xl text-center">
                          <p className="text-xs text-white/40 mb-1">In-Sample Sharpe</p>
                          <p className="text-2xl font-bold font-mono text-blue-400">{fmt(isM.sharpe, 3)}</p>
                          <p className="text-xs text-white/30 mt-1">{isM.signals} signals</p>
                        </div>
                        <div className="p-4 bg-white/[0.02] rounded-xl text-center">
                          <p className="text-xs text-white/40 mb-1">OOS Sharpe</p>
                          <p className={`text-2xl font-bold font-mono ${robust ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(oosM.sharpe, 3)}</p>
                          <p className="text-xs text-white/30 mt-1">{oosM.signals} signals</p>
                        </div>
                        <div className={`p-4 rounded-xl text-center border ${robust ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                          <p className="text-xs text-white/40 mb-1">OOS/IS Ratio</p>
                          <p className={`text-2xl font-bold font-mono ${robust ? 'text-emerald-400' : 'text-amber-400'}`}>{fmtPct(ratio * 100)}</p>
                          <p className={`text-xs mt-1 font-medium ${robust ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {robust ? '✓ Robust — edge is real' : '⚠ Below threshold'}
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* ─────── TAB: LIVE SIGNALS ─────── */}
            {activeTab === 'live' && (
              <div className="space-y-5">
                <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Activity size={16} className="text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Live Signal Forward Database</h3>
                      <p className="text-xs text-white/40 mt-1">
                        Recent signals with open tracking. Navigate to Order Flow / COT to see current live signal.
                      </p>
                    </div>
                  </div>

                  {/* Most recent signals */}
                  {result.signals.length > 0 && (
                    <div>
                      <h4 className="text-xs text-white/40 uppercase tracking-wide mb-3">Most Recent Signals (Latest 20)</h4>
                      <div className="space-y-2">
                        {[...result.signals]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 20)
                          .map((s, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/[0.04] hover:border-white/[0.08] transition-all">
                              <span className="text-xs text-white/40 font-mono w-24 shrink-0">{s.date}</span>
                              <span className="text-xs font-bold text-white/70 w-16 shrink-0">{s.instrument}</span>
                              <span className={`text-xs font-bold w-12 shrink-0 ${s.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {s.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'}
                              </span>
                              <span className="px-2 py-0.5 rounded text-xs font-bold shrink-0"
                                style={{ background: `${GRADE_COLORS[s.grade] ?? GRAY}22`, color: GRADE_COLORS[s.grade] ?? 'white' }}>
                                {s.grade}
                              </span>
                              <div className="flex gap-2 ml-auto text-xs font-mono">
                                {([['1W', s.ret1W], ['4W', s.ret4W], ['8W', s.ret8W], ['12W', s.ret12W]] as [string, number|null][]).map(([label, ret]) => (
                                  <div key={label} className="text-center w-16">
                                    <div className="text-white/30 text-[10px]">{label}</div>
                                    <div className={ret == null ? 'text-white/20' : ret >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                      {ret == null ? '—' : `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-[#0d1117] border border-amber-500/20 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <Info size={16} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-white/50 leading-relaxed">
                      After 30+ live signals are tracked, the system will produce a side-by-side comparison of backtest vs live metrics.
                      Navigate to <strong className="text-[#D4AF37]">Order Flow / COT</strong> to see the current live signal and its conditions.
                      Each signal fired there is automatically logged here with entry price and forward return tracking.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        )}

        {/* ── Empty state ── */}
        {!result && !running && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center mb-6">
              <FlaskConical size={36} style={{ color: GOLD }} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">COT Backtest Engine</h2>
            <p className="text-white/40 max-w-lg leading-relaxed mb-8">
              Run the Dreesmann 5-Condition signal engine on 20+ years of CFTC historical data.
              Get institutional-grade performance statistics, regime analysis, and academic verification
              — all deeply integrated with the Order Flow / COT dashboard.
            </p>
            <div className="grid grid-cols-3 gap-4 text-left max-w-2xl mb-8">
              {[
                { icon: Target,   title: '5-Condition Engine',   desc: 'Dreesmann methodology on every week 2000–present' },
                { icon: Shield,   title: 'Academic Verification', desc: 'Compare vs published Dreesmann & Zhang/Laws findings' },
                { icon: Activity, title: 'Regime Analysis',       desc: 'DXY, VIX, Trend regime-conditional performance' },
              ].map(f => (
                <div key={f.title} className="p-4 bg-[#0d1117] border border-white/[0.06] rounded-xl">
                  <f.icon size={16} style={{ color: GOLD }} className="mb-2" />
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs text-white/40 mt-1">{f.desc}</p>
                </div>
              ))}
            </div>
            <button
              onClick={runBacktestHandler}
              className="px-8 py-3 rounded-xl font-bold text-base flex items-center gap-3"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #b8942e)`, color: '#000' }}
            >
              <Play size={18} />
              Launch Backtest
            </button>
          </motion.div>
        )}

      </div>
    </div>
  )
}
