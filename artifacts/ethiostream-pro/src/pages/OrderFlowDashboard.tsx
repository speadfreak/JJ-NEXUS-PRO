/**
 * Order Flow / COT Dashboard
 * Research-based rebuild using:
 *   • Dreesmann, Herberger & Charifzadeh (2023) — 26-week COT index + 5-condition signal
 *   • Zhang & Laws (2013) — Wang 156-week sentiment index + extreme position detection
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, ReferenceArea,
} from 'recharts'
import {
  Waves, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle,
  Brain, Activity, ChevronDown, BookOpen, Target, ArrowUpCircle,
  ArrowDownCircle, CheckCircle, XCircle, Clock, Zap,
} from 'lucide-react'
import { buildCOTDataset, clearCOTCache, CFTC_MARKET_MAP, type COTWeeklyData } from '@/utils/cotDataEngine'
import {
  generateCOTSignal, generateExitSignal, detectExtremePosition,
  type SignalGrade, type SignalDirection,
} from '@/utils/cotSignalEngine'
import { useLivePrices } from '@/utils/priceEngine'
import ReactMarkdown from 'react-markdown'
import AskAlchemistButton from '@/components/AskAlchemistButton'

// ── Pairs available in the COT engine ────────────────────────────────────────
const PAIRS = Object.keys(CFTC_MARKET_MAP)

// ── Colour helpers ────────────────────────────────────────────────────────────
const gradeColor = (g: SignalGrade) => {
  if (g === 'A+') return '#D4AF37'
  if (g === 'A') return '#22c55e'
  if (g === 'B') return '#eab308'
  return '#6b7280'
}
const gradeGlow = (g: SignalGrade) => {
  if (g === 'A+') return '0 0 24px rgba(212,175,55,0.6)'
  if (g === 'A') return '0 0 18px rgba(34,197,94,0.5)'
  if (g === 'B') return '0 0 12px rgba(234,179,8,0.4)'
  return 'none'
}
const dirColor = (d: SignalDirection) =>
  d === 'LONG' ? '#22c55e' : d === 'SHORT' ? '#dc2626' : '#6b7280'
const gradeLabel = (g: SignalGrade, d: SignalDirection) => {
  if (g === 'A+') return d === 'LONG' ? '⚡ STRONG BUY' : d === 'SHORT' ? '⚡ STRONG SELL' : 'EXTREME'
  if (g === 'A') return d === 'LONG' ? '✅ CONFIRMED BUY' : '✅ CONFIRMED SELL'
  if (g === 'B') return '⚠ WEAK SIGNAL — CAUTION'
  return '— WAIT FOR SETUP'
}

// ── Semi-circular Wang gauge ──────────────────────────────────────────────────
function WangGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const clamp = Math.max(0, Math.min(1, value))
  // 0 → -180deg, 1 → 0deg (needle sweeps left-to-right across 180°)
  const angle = clamp * 180 - 180
  const zoneColor =
    clamp >= 0.80 ? '#dc2626' :
    clamp >= 0.70 ? '#f97316' :
    clamp <= 0.20 ? '#22c55e' :
    clamp <= 0.30 ? '#86efac' :
    '#6b7280'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-12 overflow-hidden">
        {/* Arc background */}
        <svg viewBox="0 0 100 50" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id={`gauge-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.6" />
              <stop offset="20%" stopColor="#86efac" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#6b7280" stopOpacity="0.3" />
              <stop offset="80%" stopColor="#f97316" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <path d="M5,50 A45,45 0 0,1 95,50" fill="none" stroke={`url(#gauge-${label})`} strokeWidth="8" strokeLinecap="round" />
          <path d="M5,50 A45,45 0 0,1 95,50" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
          {/* Reference lines */}
          {[0.20, 0.30, 0.70, 0.80].map(v => {
            const a = (v * 180 - 180) * Math.PI / 180
            const r = 45; const cx = 50; const cy = 50
            const x1 = cx + (r - 6) * Math.cos(a); const y1 = cy + (r - 6) * Math.sin(a)
            const x2 = cx + (r + 0) * Math.cos(a); const y2 = cy + (r + 0) * Math.sin(a)
            return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          })}
          {/* Needle */}
          <g transform={`rotate(${angle}, 50, 50)`}>
            <line x1="50" y1="50" x2="50" y2="8" stroke={zoneColor} strokeWidth="2" strokeLinecap="round" />
          </g>
          <circle cx="50" cy="50" r="3" fill={zoneColor} />
        </svg>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold font-mono" style={{ color: zoneColor }}>{clamp.toFixed(3)}</div>
        <div className="text-[9px] text-gray-500 mt-0.5">{label}</div>
        {color && (
          <div className="text-[8px] font-bold mt-0.5" style={{ color: zoneColor }}>
            {clamp >= 0.80 ? 'EXTREME HIGH' : clamp <= 0.20 ? 'EXTREME LOW' : clamp >= 0.70 ? 'HIGH' : clamp <= 0.30 ? 'LOW' : 'NEUTRAL'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Condition row ─────────────────────────────────────────────────────────────
function ConditionRow({
  met, label, value, required, source,
}: { met: boolean; label: string; value: string; required: string; source?: string }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
      met ? 'bg-green-500/8 border-green-500/25' : 'bg-red-500/8 border-red-500/20'
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        met ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      }`}>
        {met ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white truncate">{label}</div>
        {source && <div className="text-[9px] text-gray-600 italic">{source}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs font-mono font-bold text-white">{value}</div>
        <div className="text-[9px] text-gray-500">req: {required}</div>
      </div>
    </div>
  )
}

// ── callWithSystemPrompt — import from specializedAI or polyfill ──────────────
// We expose a thin wrapper here so the dashboard doesn't care about internals.
async function callAlchemistAI(prompt: string): Promise<string> {
  // Retrieve API headers via dynamic import to keep the bundle clean
  const { getAIHeaders } = await import('@/utils/specializedAI')
  const res = await fetch('/api/analysis/analyze', {
    method: 'POST',
    headers: { ...getAIHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt: `You are COT RESEARCH ANALYST embedded in JJ NEXUS PRO. You analyse Commitment of Traders data using exact methodology from two peer-reviewed academic papers: Dreesmann, Herberger & Charifzadeh (2023) "The COT report as a trading signal?" and Zhang & Laws (2013) "Investor Sentiment and Forecasting Ability in Precious Metal Futures". Format in clean markdown with research citations. Be specific about numbers.`,
      prompt,
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = await res.json()
  if (data.text && data.text.length > 20) return data.text
  throw new Error('Empty response')
}

// ─────────────────────────────────────────────────────────────────────────────
export default function OrderFlowDashboard() {
  const { prices } = useLivePrices()
  const [selectedPair, setSelectedPair] = useState('XAUUSD')
  const [viewMode, setViewMode] = useState<'RAW' | 'WANG'>('WANG')
  const [cotData, setCotData] = useState<COTWeeklyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Current week (index 0 = most recent)
  const current = cotData[0] ?? null

  // Dreesmann 5-condition signal
  const signal = current
    ? generateCOTSignal(
        selectedPair,
        current.commercialIndex26,
        current.commercialLongOIPercent,
        current.commercialShortOIPercent,
        current.nonReportableIndex26,
        current.smaRising,
        current.nonCommercialIndex26,
      )
    : null

  // Exit signal monitor
  const exitSignal = current && signal
    ? generateExitSignal(signal.direction, current.nonCommercialIndex26, current.smaRising)
    : null

  // Zhang extreme position detector
  const extremes = current
    ? detectExtremePosition(current.commercialSI156, current.nonCommercialSI156, current.nonReportableSI156, selectedPair)
    : null

  const liveAlchemistContext = current && signal
    ? `Instrument: ${selectedPair}. Report date: ${current.reportDate}. Current price: ${prices[selectedPair] ?? 'unavailable'}. Direction: ${signal.direction}. Grade: ${signal.grade}. Conditions met: ${signal.conditionsMet}/5. CSI: ${current.commercialIndex26.toFixed(3)}. NC%: ${(current.nonCommercialOIPercent * 100).toFixed(2)}%. NRSI: ${current.nonReportableIndex26.toFixed(3)}. OI trend: ${current.smaRising ? 'rising' : 'falling'}. WoW changes: commercial net ${current.weeklyChange.commercialNet.toLocaleString()}, non-commercial net ${current.weeklyChange.nonCommercialNet.toLocaleString()}, open interest ${current.weeklyChange.openInterest.toLocaleString()}.`
    : ''

  const loadCOTData = useCallback(async (pair: string, force = false) => {
    setLoading(true)
    setError(null)
    setAiAnalysis('')
    setShowAI(false)
    try {
      if (force) clearCOTCache(pair)
      const currentPrice = prices[pair] ?? 0
      const historicalPrices: number[] = JSON.parse(
        localStorage.getItem(`jjnexus_price_history_${pair}`) ?? '[]',
      )
      const data = await buildCOTDataset(pair, currentPrice, historicalPrices)
      if (data.length === 0) {
        setError('CFTC data unavailable. Reports are released each Friday. Please check your connection or try again later.')
      } else {
        setCotData(data)
        setLastRefresh(new Date())
      }
    } catch (e: any) {
      setError(`Failed to load COT data: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [prices])

  useEffect(() => { loadCOTData(selectedPair) }, [selectedPair])

  const handlePairChange = (pair: string) => {
    if (pair === selectedPair) return
    setSelectedPair(pair)
    setCotData([])
  }

  const generateResearchAnalysis = async () => {
    if (!current || !signal) return
    setAiLoading(true)
    setShowAI(true)
    try {
      const prompt = `
You are analyzing COT (Commitment of Traders) data using methodology from two peer-reviewed academic papers.

RESEARCH BASIS:
1. Dreesmann, Herberger, Charifzadeh (2023) — "The COT report as a trading signal?" — backtested 71 futures markets 1986–2020
2. Zhang and Laws (2013) — "Investor Sentiment and Forecasting Ability: Evidence from COT Reports in Precious Metal Futures Markets"

CURRENT COT DATA FOR ${selectedPair}:
Report Date: ${current.reportDate}
Current Price: ${prices[selectedPair] ?? 'N/A'}

RAW NET POSITIONS:
Commercial Net: ${current.commercialNet.toLocaleString()} contracts
Non-Commercial Net: ${current.nonCommercialNet.toLocaleString()} contracts
Non-Reportable Net: ${current.nonReportableNet.toLocaleString()} contracts
Total Open Interest: ${current.totalOpenInterest.toLocaleString()}
Weekly Change Commercial: ${current.weeklyChange.commercialNet > 0 ? '+' : ''}${current.weeklyChange.commercialNet.toLocaleString()}

DREESMANN 26-WEEK INDICES (0=extreme low, 1=extreme high):
Commercial Index: ${current.commercialIndex26.toFixed(3)}
Non-Commercial Index: ${current.nonCommercialIndex26.toFixed(3)}
Non-Reportable Index: ${current.nonReportableIndex26.toFixed(3)}

WANG 3-YEAR SENTIMENT INDICES (156-week lookback):
Commercial SI: ${current.commercialSI156.toFixed(3)}
Non-Commercial SI: ${current.nonCommercialSI156.toFixed(3)}
Non-Reportable SI: ${current.nonReportableSI156.toFixed(3)}

OPEN INTEREST VALIDATION:
Commercial Long OI%: ${(current.commercialLongOIPercent * 100).toFixed(1)}%
Commercial Short OI%: ${(current.commercialShortOIPercent * 100).toFixed(1)}%
(Dreesmann rule: must exceed 30% to validate signal)

10-WEEK SMA: ${current.smaRising ? 'RISING ✅' : 'DECLINING ❌'}

DREESMANN SIGNAL: ${signal.grade} ${signal.direction}
Conditions Met: ${signal.conditionsMet}/5
Historical Accuracy: ${signal.historicalAccuracy}%
Information Ratio: ${signal.informationRatio}

ZHANG EXTREME POSITIONS:
Commercial: ${extremes?.commercialExtreme ?? 'NEUTRAL'}
Non-Commercial: ${extremes?.nonCommercialExtreme ?? 'NEUTRAL'}
${extremes?.zhangFinding ? `Research Finding: ${extremes.zhangFinding}` : ''}

Provide a complete research-based analysis:
1. What the COT data is telling us about institutional positioning
2. Whether the Dreesmann signal conditions are valid and why
3. What Zhang and Laws would say about the extreme positions if any
4. The Alchemist SMC confluence — does fundamental COT bias align with technical structure?
5. Specific entry criteria if signal is A or A+
6. Exit conditions based on Dreesmann research
7. Research confidence level and any warnings

Be specific. Reference the research findings. Cite specific numbers from the data.
`
      const text = await callAlchemistAI(prompt)
      setAiAnalysis(text)
    } catch (e: any) {
      setAiAnalysis(`⚠️ AI analysis unavailable: ${e.message}`)
    } finally {
      setAiLoading(false)
    }
  }

  // ── Chart data — 52 most recent weeks ──────────────────────────────────────
  const chart52 = cotData.slice(0, 52).reverse()

  const rawChartData = chart52.map(d => ({
    date: d.reportDate.slice(5),
    commercial:    Math.round(d.commercialNet / 1000),
    nonCommercial: Math.round(d.nonCommercialNet / 1000),
    nonReportable: Math.round(d.nonReportableNet / 1000),
  }))

  const wangChartData = chart52.map(d => ({
    date: d.reportDate.slice(5),
    commercial:    parseFloat(d.commercialSI156.toFixed(3)),
    nonCommercial: parseFloat(d.nonCommercialSI156.toFixed(3)),
    nonReportable: parseFloat(d.nonReportableSI156.toFixed(3)),
  }))

  const oiChartData = chart52.map(d => ({
    date: d.reportDate.slice(5),
    totalOI:  Math.round(d.totalOpenInterest / 1000),
    commPct:  parseFloat((d.commercialLongOIPercent * 100).toFixed(1)),
  }))

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-[#080808] p-4 space-y-5 custom-scrollbar">

      {/* ── SECTION 1: HEADER ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
            <Waves className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Order Flow / COT</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-500">Research-based analysis using CFTC Commitment of Traders data</span>
              {lastRefresh && (
                <span className="text-[9px] text-gray-600 flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[9px] text-gray-700 font-mono">Dreesmann et al. (2023) · Zhang & Laws (2013)</span>
              {current && (
                <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded px-1.5 py-0.5">
                  Report: {current.reportDate}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {current && (
            <AskAlchemistButton
              label="Ask Alchemist about this signal"
              prompt={`Analyze this live COT signal using the exact current dashboard snapshot. ${liveAlchemistContext} Commercial 156-week sentiment: ${current.commercialSI156.toFixed(3)}. Explain the institutional logic, signal grade, confluence, invalidation, and conservative risk framing using these actual values; do not invent missing data.`}
            />
          )}
          <button
            onClick={() => loadCOTData(selectedPair, true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-white/10 text-xs text-gray-300 hover:border-[#D4AF37]/40 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Pair selector ───────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap">
        {PAIRS.map(p => {
          const info = CFTC_MARKET_MAP[p]
          return (
            <button
              key={p}
              onClick={() => handlePairChange(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                p === selectedPair
                  ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.35)]'
                  : 'bg-[#111] border-white/8 text-gray-400 hover:border-[#D4AF37]/35 hover:text-white'
              }`}
            >
              {p}
              <span className={`ml-1 text-[8px] opacity-60 ${p === selectedPair ? 'text-black' : 'text-gray-600'}`}>
                {info.category.slice(0, 3).toUpperCase()}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── SECTION 2: RAW/WANG DUAL VIEW TOGGLE ───────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">Display Mode:</span>
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          <button
            onClick={() => setViewMode('RAW')}
            className={`px-4 py-1.5 text-xs font-bold transition-all ${
              viewMode === 'RAW'
                ? 'bg-blue-600 text-white'
                : 'bg-[#111] text-gray-400 hover:text-white'
            }`}
          >
            Raw Net Positions
          </button>
          <button
            onClick={() => setViewMode('WANG')}
            className={`px-4 py-1.5 text-xs font-bold transition-all ${
              viewMode === 'WANG'
                ? 'bg-purple-700 text-white'
                : 'bg-[#111] text-gray-400 hover:text-white'
            }`}
          >
            Wang Sentiment (0–1)
          </button>
        </div>
        <span className="text-[9px] text-gray-600 italic">
          {viewMode === 'RAW' ? 'Absolute contract numbers' : '3-year normalized · Zhang & Laws (2013)'}
        </span>
      </div>

      {/* ── Loading / Error states ──────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/10" />
            <div className="absolute inset-0 rounded-full border-2 border-t-[#D4AF37] animate-spin" />
            <Waves className="absolute inset-0 m-auto w-6 h-6 text-[#D4AF37]" />
          </div>
          <p className="text-sm text-gray-500">Fetching CFTC COT data for {selectedPair}…</p>
          <p className="text-[10px] text-gray-700">Calculating Dreesmann 26-week indices + Wang 156-week sentiment</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300 font-semibold">Data Unavailable</p>
            <p className="text-xs text-red-400/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && current && signal && (
        <>
          {/* ── SECTION 3: TRADER POSITIONING DASHBOARD ──────────────────── */}
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#D4AF37]" />
              Trader Positioning — {selectedPair}
              <span className="text-[9px] normal-case font-normal text-gray-600">
                {viewMode === 'RAW' ? '(raw net contracts)' : '(Wang 0–1 normalized)'}
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

              {/* Commercial card */}
              <TraderCard
                title="Commercials"
                subtitle="Banks & Hedgers — Smart Money"
                dotColor="#2563eb"
                borderColor="border-blue-500/20"
                bgColor="bg-blue-500/4"
                long={current.commercialLong}
                short={current.commercialShort}
                net={current.commercialNet}
                weeklyChange={current.weeklyChange.commercialNet}
                oiPct={current.commercialLongOIPercent}
                index26={current.commercialIndex26}
                si156={current.commercialSI156}
                viewMode={viewMode}
                note="Commercials hedge — net position often OPPOSITE to price. Extreme = reversal signal."
              />

              {/* Non-commercial card */}
              <TraderCard
                title="Non-Commercials"
                subtitle="Hedge Funds & CTAs — Speculators"
                dotColor="#7c3aed"
                borderColor="border-purple-500/20"
                bgColor="bg-purple-500/4"
                long={current.nonCommercialLong}
                short={current.nonCommercialShort}
                net={current.nonCommercialNet}
                weeklyChange={current.weeklyChange.nonCommercialNet}
                oiPct={current.nonCommercialOIPercent}
                index26={current.nonCommercialIndex26}
                si156={current.nonCommercialSI156}
                viewMode={viewMode}
                note="Speculators follow trends. Extreme positioning = potential crowded trade."
              />

              {/* Non-reportable card */}
              <TraderCard
                title="Non-Reportable"
                subtitle="Small Retail Traders"
                dotColor="#f97316"
                borderColor="border-orange-500/20"
                bgColor="bg-orange-500/4"
                long={current.nonReportableLong}
                short={current.nonReportableShort}
                net={current.nonReportableNet}
                weeklyChange={current.weeklyChange.nonReportableNet}
                oiPct={current.nonReportableOIPercent}
                index26={current.nonReportableIndex26}
                si156={current.nonReportableSI156}
                viewMode={viewMode}
                note="Retail at extreme = contrarian signal. Dreesmann: opposite trade has edge."
              />
            </div>
          </div>

          {/* ── SECTION 4: DREESMANN 5-CONDITION SIGNAL ENGINE ───────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Signal grade display */}
            <div className={`rounded-2xl border p-5 space-y-4 ${
              signal.grade === 'A+' ? 'border-[#D4AF37]/40 bg-[#D4AF37]/5' :
              signal.grade === 'A' ? 'border-green-500/35 bg-green-500/5' :
              signal.grade === 'B' ? 'border-yellow-500/30 bg-yellow-500/4' :
              'border-white/8 bg-[#111]'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Dreesmann Signal</div>
                  <div className="text-[9px] text-gray-700 italic mt-0.5">Dreesmann et al. (2023) · 5-condition system</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-gray-500">Conditions</div>
                  <div className="text-lg font-black text-white">{signal.conditionsMet}/{signal.totalConditions}</div>
                </div>
              </div>

              <div className="text-center py-3">
                <motion.div
                  key={signal.grade + signal.direction}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-4xl font-black tracking-tight"
                  style={{ color: gradeColor(signal.grade), textShadow: gradeGlow(signal.grade) }}
                >
                  {signal.grade === 'NO_SIGNAL' ? 'NO SIGNAL' : signal.grade}
                </motion.div>
                <div className="text-lg font-bold mt-1" style={{ color: dirColor(signal.direction) }}>
                  {gradeLabel(signal.grade, signal.direction)}
                </div>
                <div className="flex items-center justify-center gap-6 mt-3">
                  {signal.historicalAccuracy > 0 && (
                    <div className="text-center">
                      <div className="text-xs font-mono font-bold text-white">{signal.historicalAccuracy}%</div>
                      <div className="text-[9px] text-gray-500">Hist. Accuracy</div>
                    </div>
                  )}
                  {signal.informationRatio > 0 && (
                    <div className="text-center">
                      <div className="text-xs font-mono font-bold text-white">{signal.informationRatio}</div>
                      <div className="text-[9px] text-gray-500">Info Ratio</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-xs font-mono font-bold text-white">{signal.signalStrength}%</div>
                    <div className="text-[9px] text-gray-500">Strength</div>
                  </div>
                </div>
              </div>

              {/* Signal strength bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-gray-600">
                  <span>Signal Strength</span>
                  <span>{signal.signalStrength}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${signal.signalStrength}%` }}
                    transition={{ duration: 0.8 }}
                    className="h-full rounded-full"
                    style={{ background: gradeColor(signal.grade) }}
                  />
                </div>
              </div>
            </div>

            {/* 5 conditions checklist */}
            <div className="bg-[#0d0d0d] border border-white/8 rounded-2xl p-4 space-y-2">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                <Target className="w-3 h-3 text-[#D4AF37]" />
                5-Condition Checklist · {signal.direction !== 'NEUTRAL' ? signal.direction : 'NEUTRAL'}
              </div>

              <ConditionRow
                met={signal.conditions.condition1_commercialIndex.met}
                label="Condition 1 — Commercial Index (26wk)"
                value={signal.conditions.condition1_commercialIndex.value.toString()}
                required={signal.conditions.condition1_commercialIndex.required}
                source="Dreesmann (2023): hedger buying/selling climax"
              />
              <ConditionRow
                met={signal.conditions.condition2_openInterest.met}
                label="Condition 2 — Commercial OI %"
                value={(signal.conditions.condition2_openInterest.value * 100).toFixed(1) + '%'}
                required={signal.conditions.condition2_openInterest.required}
                source="Dreesmann Rule 8/9: OI validation"
              />
              <ConditionRow
                met={signal.conditions.condition3_nonReportable.met}
                label="Condition 3 — Non-Reportable (26wk)"
                value={signal.conditions.condition3_nonReportable.value.toString()}
                required={signal.conditions.condition3_nonReportable.required}
                source="Dreesmann: retail contrarian confirmation"
              />
              <ConditionRow
                met={signal.conditions.condition4_movingAverage.met}
                label="Condition 4 — 10-Week SMA Direction"
                value={signal.conditions.condition4_movingAverage.rising ? 'RISING' : 'FALLING'}
                required={signal.conditions.condition4_movingAverage.required}
                source="Dreesmann: price momentum confirmation"
              />
              <ConditionRow
                met={signal.conditions.condition5_nonCommercial.met}
                label="Condition 5 — Non-Commercial (26wk)"
                value={signal.conditions.condition5_nonCommercial.value.toString()}
                required={signal.conditions.condition5_nonCommercial.required}
                source="Dreesmann: speculative crowding filter"
              />
            </div>
          </div>

          {/* ── SECTION 5: ZHANG EXTREME POSITION DETECTOR ───────────────── */}
          {extremes && (
            <div className={`rounded-2xl border p-4 space-y-4 ${
              extremes.contrarySignal !== 'NONE'
                ? 'border-amber-500/40 bg-amber-500/4'
                : 'border-white/8 bg-[#0d0d0d]'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-bold text-white">Zhang & Laws Extreme Position Detector</span>
                    {extremes.contrarySignal !== 'NONE' && (
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                        extremes.contrarySignal === 'BULLISH'
                          ? 'bg-green-500/20 text-green-300 border-green-500/30'
                          : 'bg-red-500/20 text-red-300 border-red-500/30'
                      }`}>
                        CONTRARIAN {extremes.contrarySignal}
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-600 italic mt-0.5">
                    Zhang, Y. & Laws, J. (2013) — 3-year Wang sentiment index · Top/bottom 20th percentile = extreme
                  </p>
                </div>
              </div>

              {/* Gauges */}
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-[9px] text-blue-400 font-bold uppercase tracking-wide">Commercial</div>
                  <WangGauge value={current.commercialSI156} label="Wang SI 156wk" color="#2563eb" />
                  <div className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                    extremes.commercialExtreme === 'EXTREME_BULLISH' ? 'bg-red-500/20 text-red-300' :
                    extremes.commercialExtreme === 'EXTREME_BEARISH' ? 'bg-green-500/20 text-green-300' :
                    'bg-gray-500/10 text-gray-500'
                  }`}>
                    {extremes.commercialExtreme.replace('_', ' ')}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="text-[9px] text-purple-400 font-bold uppercase tracking-wide">Non-Commercial</div>
                  <WangGauge value={current.nonCommercialSI156} label="Wang SI 156wk" color="#7c3aed" />
                  <div className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                    extremes.nonCommercialExtreme === 'EXTREME_BULLISH' ? 'bg-red-500/20 text-red-300' :
                    extremes.nonCommercialExtreme === 'EXTREME_BEARISH' ? 'bg-green-500/20 text-green-300' :
                    'bg-gray-500/10 text-gray-500'
                  }`}>
                    {extremes.nonCommercialExtreme.replace('_', ' ')}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="text-[9px] text-orange-400 font-bold uppercase tracking-wide">Non-Reportable</div>
                  <WangGauge value={current.nonReportableSI156} label="Wang SI 156wk" color="#f97316" />
                  <div className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                    extremes.nonReportableExtreme === 'EXTREME_BULLISH' ? 'bg-red-500/20 text-red-300' :
                    extremes.nonReportableExtreme === 'EXTREME_BEARISH' ? 'bg-green-500/20 text-green-300' :
                    'bg-gray-500/10 text-gray-500'
                  }`}>
                    {extremes.nonReportableExtreme.replace('_', ' ')}
                  </div>
                </div>
              </div>

              {extremes.priceImplication && (
                <div className="bg-black/40 rounded-xl border border-amber-500/20 p-3 space-y-1">
                  <p className="text-xs text-amber-300 font-semibold">{extremes.priceImplication}</p>
                  <p className="text-[9px] text-gray-500 italic leading-relaxed">{extremes.zhangFinding}</p>
                </div>
              )}

              {/* Reference lines explanation */}
              <div className="grid grid-cols-5 gap-1 text-center">
                {[
                  { range: '0.00–0.20', label: 'Extreme Low', color: 'text-green-400 bg-green-500/10' },
                  { range: '0.20–0.30', label: 'Low', color: 'text-emerald-400 bg-emerald-500/8' },
                  { range: '0.30–0.70', label: 'Neutral', color: 'text-gray-400 bg-gray-500/8' },
                  { range: '0.70–0.80', label: 'High', color: 'text-orange-400 bg-orange-500/8' },
                  { range: '0.80–1.00', label: 'Extreme High', color: 'text-red-400 bg-red-500/10' },
                ].map(z => (
                  <div key={z.range} className={`rounded px-1 py-1.5 text-[8px] font-bold ${z.color}`}>
                    <div>{z.range}</div>
                    <div className="font-normal opacity-70">{z.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION 6: EXIT SIGNAL MONITOR ───────────────────────────── */}
          {signal && signal.direction !== 'NEUTRAL' && exitSignal && (
            <div className={`rounded-xl border p-4 flex items-start gap-4 ${
              exitSignal.shouldExit
                ? 'border-red-500/40 bg-red-500/5'
                : 'border-green-500/25 bg-green-500/4'
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                exitSignal.shouldExit ? 'bg-red-500/20' : 'bg-green-500/15'
              }`}>
                {exitSignal.shouldExit
                  ? <AlertTriangle className="w-5 h-5 text-red-400" />
                  : <CheckCircle className="w-5 h-5 text-green-400" />
                }
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">Exit Monitor</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                    exitSignal.shouldExit
                      ? 'bg-red-500/20 text-red-300 border-red-500/30'
                      : 'bg-green-500/15 text-green-300 border-green-500/25'
                  }`}>
                    {exitSignal.shouldExit ? '⚠ EXIT SIGNAL ACTIVE' : '✓ HOLD — NO EXIT'}
                  </span>
                  <span className="text-[9px] text-gray-600 italic">Dreesmann (2023) exit rules</span>
                </div>
                <p className="text-xs text-gray-300 mt-1">{exitSignal.reason}</p>
                <p className="text-[9px] text-gray-600 mt-1">
                  {signal.direction === 'LONG'
                    ? 'Exit LONG: Non-commercial ≥ 0.70 (crowd too bullish) AND/OR SMA declining'
                    : 'Exit SHORT: Non-commercial ≤ 0.30 (crowd too bearish) AND/OR SMA rising'
                  }
                </p>
              </div>
            </div>
          )}

          {/* ── SECTION 7: DUAL CHART PANEL ──────────────────────────────── */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#D4AF37]" />
              52-Week History Charts
            </h2>

            {/* Chart A: Raw Net Positions */}
            <div className="bg-[#0a0a14] border border-white/6 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-bold text-white">Raw Net Positions</h3>
                  <p className="text-[9px] text-gray-600">Thousands of contracts · Dreesmann (2023)</p>
                </div>
                <div className="flex gap-3">
                  {[['#2563eb', 'Commercial'], ['#7c3aed', 'Non-Comm'], ['#f97316', 'Non-Rep']].map(([c, l]) => (
                    <span key={l} className="flex items-center gap-1 text-[9px] text-gray-500">
                      <span className="w-3 h-0.5 rounded" style={{ background: c }} />
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={rawChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 8 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#4b5563', fontSize: 8 }} tickFormatter={v => `${v}k`} />
                  <Tooltip
                    contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [`${v}k contracts`]}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="commercial" stroke="#2563eb" strokeWidth={1.5} dot={false} name="Commercial" />
                  <Line type="monotone" dataKey="nonCommercial" stroke="#7c3aed" strokeWidth={1.5} dot={false} name="Non-Commercial" />
                  <Line type="monotone" dataKey="nonReportable" stroke="#f97316" strokeWidth={1.5} dot={false} name="Non-Reportable" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart B: Wang Sentiment Index */}
            <div className="bg-[#0a0a14] border border-white/6 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-bold text-white">Wang Sentiment Index (3-Year)</h3>
                  <p className="text-[9px] text-gray-600">156-week rolling · 0=extreme bearish, 1=extreme bullish · Zhang & Laws (2013)</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={wangChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 8 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 1]} tick={{ fill: '#4b5563', fontSize: 8 }} ticks={[0, 0.2, 0.3, 0.5, 0.7, 0.8, 1]} />
                  <Tooltip
                    contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8, fontSize: 11 }}
                  />
                  {/* Extreme zones */}
                  <ReferenceArea y1={0.80} y2={1.00} fill="rgba(220,38,38,0.08)" />
                  <ReferenceArea y1={0.00} y2={0.20} fill="rgba(34,197,94,0.08)" />
                  <ReferenceLine y={0.80} stroke="rgba(220,38,38,0.4)" strokeDasharray="4 2" label={{ value: '0.80', fill: '#dc2626', fontSize: 8, position: 'right' }} />
                  <ReferenceLine y={0.70} stroke="rgba(249,115,22,0.25)" strokeDasharray="3 3" />
                  <ReferenceLine y={0.30} stroke="rgba(134,239,172,0.25)" strokeDasharray="3 3" />
                  <ReferenceLine y={0.20} stroke="rgba(34,197,94,0.4)" strokeDasharray="4 2" label={{ value: '0.20', fill: '#22c55e', fontSize: 8, position: 'right' }} />
                  <Line type="monotone" dataKey="commercial" stroke="#2563eb" strokeWidth={1.5} dot={false} name="Commercial SI" />
                  <Line type="monotone" dataKey="nonCommercial" stroke="#7c3aed" strokeWidth={1.5} dot={false} name="Non-Comm SI" />
                  <Line type="monotone" dataKey="nonReportable" stroke="#f97316" strokeWidth={1.5} dot={false} name="Non-Rep SI" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart C: Open Interest */}
            <div className="bg-[#0a0a14] border border-white/6 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-bold text-white">Total Open Interest</h3>
                  <p className="text-[9px] text-gray-600">Thousands of contracts · Rising OI = new money entering market</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={oiChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fill: '#4b5563', fontSize: 8 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#4b5563', fontSize: 8 }} tickFormatter={v => `${v}k`} />
                  <Tooltip
                    contentStyle={{ background: '#0d0d0d', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any, name: string) => [name === 'commPct' ? `${v}%` : `${v}k`, name === 'commPct' ? 'Comm Long %' : 'Total OI']}
                  />
                  <Bar dataKey="totalOI" fill="#1d4ed8" radius={[2, 2, 0, 0]} name="Total OI" opacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── SECTION 8: RESEARCH INTELLIGENCE PANEL ───────────────────── */}
          <div className="bg-[#0d0d0d] border border-[#D4AF37]/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-[#D4AF37]" />
                  <h2 className="text-sm font-bold text-white">Alchemist AI Research Analysis</h2>
                </div>
                <p className="text-[9px] text-gray-600 mt-0.5 italic">
                  COT interpretation using Dreesmann (2023) + Zhang & Laws (2013) methodology
                </p>
              </div>
              <div className="flex items-center gap-2">
                {current && (
                  <AskAlchemistButton
                    label="Ask Alchemist to explain"
                    prompt={`Explain the current COT research context using these live values. ${liveAlchemistContext} Commercial SI: ${current.commercialSI156.toFixed(3)}. Explain the grade, institutional logic, and what would invalidate the signal.`}
                  />
                )}
                <button
                  onClick={generateResearchAnalysis}
                  disabled={aiLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37] text-black font-bold text-xs hover:bg-[#c4a030] transition-all shadow-[0_0_14px_rgba(212,175,55,0.35)] disabled:opacity-50"
                >
                  <Brain className="w-3.5 h-3.5" />
                  {aiLoading ? 'Analyzing...' : '🔬 Generate Research Analysis'}
                </button>
              </div>
            </div>

            {/* Research citations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg p-3">
                <p className="text-[9px] text-blue-400 font-bold mb-1">Research Paper 1</p>
                <p className="text-[9px] text-gray-400 leading-relaxed">
                  Dreesmann, S., Herberger, T.A. and Charifzadeh, M. (2023)<br />
                  'The Commitment of Traders report as a trading signal?'<br />
                  Int. J. Financial Markets and Derivatives, Vol. 9, Nos. 1/2, pp.76–113
                </p>
              </div>
              <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg p-3">
                <p className="text-[9px] text-purple-400 font-bold mb-1">Research Paper 2</p>
                <p className="text-[9px] text-gray-400 leading-relaxed">
                  Zhang, Y. and Laws, J. (2013)<br />
                  'Investor Sentiment and Forecasting Ability: Evidence from COT Reports<br />
                  in Precious Metal Futures Markets'<br />
                  University of Liverpool, MSc Finance Research
                </p>
              </div>
            </div>

            {/* Current signal summary */}
            {signal && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'Grade', value: signal.grade === 'NO_SIGNAL' ? 'NO SIG' : signal.grade, color: gradeColor(signal.grade) },
                  { label: 'Direction', value: signal.direction, color: dirColor(signal.direction) },
                  { label: 'Hist. Accuracy', value: signal.historicalAccuracy > 0 ? `${signal.historicalAccuracy}%` : 'N/A', color: '#fff' },
                  { label: 'Info Ratio', value: signal.informationRatio > 0 ? signal.informationRatio.toString() : 'N/A', color: '#fff' },
                ].map(stat => (
                  <div key={stat.label} className="bg-black/40 rounded-lg p-2.5 text-center border border-white/5">
                    <div className="text-[9px] text-gray-500 mb-1">{stat.label}</div>
                    <div className="text-sm font-black" style={{ color: stat.color }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* AI output */}
            <AnimatePresence>
              {showAI && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-white/8 pt-4"
                >
                  {aiLoading ? (
                    <div className="flex items-center gap-3 text-gray-400 text-sm py-4">
                      <div className="w-4 h-4 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
                      Running research-based COT analysis…
                    </div>
                  ) : aiAnalysis ? (
                    <div className="prose prose-invert prose-sm max-w-none text-gray-300 text-xs leading-relaxed">
                      <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer research disclaimer */}
          <div className="text-center text-[9px] text-gray-700 pb-2">
            JJ NEXUS PRO · COT analysis based on Dreesmann et al. (2023) and Zhang & Laws (2013) ·
            CFTC data released weekly (Fridays) · Not financial advice
          </div>
        </>
      )}
    </div>
  )
}

// ── Trader card sub-component ─────────────────────────────────────────────────
interface TraderCardProps {
  title: string; subtitle: string; dotColor: string; borderColor: string; bgColor: string
  long: number; short: number; net: number; weeklyChange: number
  oiPct: number; index26: number; si156: number
  viewMode: 'RAW' | 'WANG'
  note: string
}

function TraderCard({ title, subtitle, dotColor, borderColor, bgColor, long, short, net,
  weeklyChange, oiPct, index26, si156, viewMode, note }: TraderCardProps) {
  const netPositive = net > 0
  const changePositive = weeklyChange > 0

  // Range bar for 26-week index
  const idx26Pct = Math.round(index26 * 100)
  const idx26Color =
    index26 >= 0.80 ? '#dc2626' :
    index26 >= 0.70 ? '#f97316' :
    index26 <= 0.20 ? '#22c55e' :
    index26 <= 0.30 ? '#86efac' :
    '#6b7280'

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        <div>
          <div className="text-xs font-black text-white">{title}</div>
          <div className="text-[9px] text-gray-500">{subtitle}</div>
        </div>
      </div>

      {viewMode === 'RAW' ? (
        <>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="bg-black/30 rounded-lg p-2 border border-white/5">
              <div className="text-[8px] text-gray-500">LONG</div>
              <div className="text-xs font-bold text-white">{(long / 1000).toFixed(0)}k</div>
            </div>
            <div className="bg-black/30 rounded-lg p-2 border border-white/5">
              <div className="text-[8px] text-gray-500">SHORT</div>
              <div className="text-xs font-bold text-white">{(short / 1000).toFixed(0)}k</div>
            </div>
            <div className={`rounded-lg p-2 border ${netPositive ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <div className="text-[8px] text-gray-500">NET</div>
              <div className={`text-xs font-bold ${netPositive ? 'text-green-400' : 'text-red-400'}`}>
                {netPositive ? '+' : ''}{(net / 1000).toFixed(0)}k
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-gray-500">Weekly change:</span>
            <span className={`font-bold ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
              {changePositive ? '▲ +' : '▼ '}{(Math.abs(weeklyChange) / 1000).toFixed(1)}k
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/30 rounded-lg p-2.5 border border-white/5 text-center">
              <div className="text-[8px] text-gray-500 mb-1">Dreesmann 26wk</div>
              <div className="text-lg font-black font-mono" style={{ color: idx26Color }}>
                {index26.toFixed(3)}
              </div>
              <div className="text-[8px] text-gray-600 mt-0.5">signal index</div>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5 border border-white/5 text-center">
              <div className="text-[8px] text-purple-400 mb-1">Wang SI 156wk</div>
              <div className="text-lg font-black font-mono text-purple-300">
                {si156.toFixed(3)}
              </div>
              <div className="text-[8px] text-gray-600 mt-0.5">3-year context</div>
            </div>
          </div>
        </>
      )}

      {/* 26-week index bar — always shown */}
      <div className="space-y-1">
        <div className="flex justify-between text-[8px] text-gray-600">
          <span>26wk Index</span>
          <span style={{ color: idx26Color }}>{idx26Pct}%</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${idx26Pct}%`, background: idx26Color }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[8px]">
        <span className="text-gray-600">OI %:</span>
        <span className={`font-bold ${oiPct >= 0.30 ? 'text-green-400' : 'text-gray-500'}`}>
          {(oiPct * 100).toFixed(1)}% {oiPct >= 0.30 ? '✓' : ''}
        </span>
      </div>

      <p className="text-[8px] text-gray-700 italic leading-relaxed border-t border-white/4 pt-2">{note}</p>
    </div>
  )
}
