import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sun, RefreshCw, Download, Copy, Clock, TrendingUp, TrendingDown,
         Radio, Zap, BarChart2, Globe, AlertTriangle } from 'lucide-react'
import { useLivePrices, formatPriceForSymbol } from '@/utils/priceEngine'
import { callAlchemistAI } from '@/utils/freeAI'
import { exportAnalysisPDF } from '@/utils/pdfExport'
import ReactMarkdown from 'react-markdown'

// ── Session definitions (UTC) ──────────────────────────────────────────────────
const SESSIONS = [
  { name: 'Asian',    start: 22, end:  8, color: '#06b6d4', emoji: '🌏', pairs: ['USDJPY','AUDUSD','NZDUSD'] },
  { name: 'London',   start:  7, end: 16, color: '#8b5cf6', emoji: '🇬🇧', pairs: ['GBPUSD','EURUSD','XAUUSD'] },
  { name: 'New York', start: 13, end: 22, color: '#22c55e', emoji: '🗽', pairs: ['XAUUSD','US30','NAS100'] },
]

const KILL_ZONES = [
  { name: 'London Kill Zone', start: 7, end: 9, color: '#ef4444' },
  { name: 'NY Kill Zone',     start: 12, end: 14, color: '#f97316' },
]

function getSessionInfo(utcH: number) {
  const kz = KILL_ZONES.find(k => utcH >= k.start && utcH < k.end)
  if (kz) return { name: kz.name, color: kz.color, isKillZone: true, icon: '🔥' }
  const s = SESSIONS.find(s =>
    s.start > s.end
      ? utcH >= s.start || utcH < s.end
      : utcH >= s.start && utcH < s.end
  )
  if (s) return { name: `${s.emoji} ${s.name} Session`, color: s.color, isKillZone: false, icon: s.emoji, activePairs: s.pairs }
  return { name: '🌙 Off Hours / Pre-Market', color: '#4b5563', isKillZone: false, icon: '🌙' }
}

function getNextSessionInfo(utcH: number): { name: string; utcStart: number } {
  if (utcH < 7)  return { name: 'London Open', utcStart: 7 }
  if (utcH < 12) return { name: 'NY Kill Zone', utcStart: 12 }
  if (utcH < 13) return { name: 'New York Open', utcStart: 13 }
  if (utcH < 22) return { name: 'Asian Open', utcStart: 22 }
  return { name: 'London Open', utcStart: 7 }
}

// ── Live countdown ─────────────────────────────────────────────────────────────
function Countdown({ targetUtcH }: { targetUtcH: number }) {
  const [display, setDisplay] = useState('')
  useEffect(() => {
    const update = () => {
      const now = new Date()
      const curH = now.getUTCHours()
      const curM = now.getUTCMinutes()
      let diff = (targetUtcH - curH) * 60 - curM
      if (diff < 0) diff += 24 * 60
      const h = Math.floor(diff / 60)
      const m = diff % 60
      setDisplay(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [targetUtcH])
  return <span className="font-mono font-black tabular-nums">{display}</span>
}

// ── Price config (simulated 24h % change for display) ─────────────────────────
const PRICE_META: Record<string, { change: number; trend: 'up' | 'down' | 'flat' }> = {
  XAUUSD:  { change:  0.38, trend: 'up' },
  EURUSD:  { change: -0.14, trend: 'down' },
  GBPUSD:  { change:  0.22, trend: 'up' },
  USDJPY:  { change:  0.29, trend: 'up' },
  GBPJPY:  { change:  0.51, trend: 'up' },
  US30:    { change: -0.09, trend: 'down' },
  NAS100:  { change:  0.72, trend: 'up' },
  BTCUSD:  { change:  1.18, trend: 'up' },
}

const PAIRS = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','US30','NAS100','BTCUSD'] as const

// ── Main component ─────────────────────────────────────────────────────────────
export default function MorningBriefing() {
  const { prices } = useLivePrices()
  const [briefing, setBriefing] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [copied, setCopied] = useState(false)
  const [utcH, setUtcH] = useState(new Date().getUTCHours())

  useEffect(() => {
    const id = setInterval(() => setUtcH(new Date().getUTCHours()), 60_000)
    return () => clearInterval(id)
  }, [])

  const sessionInfo = getSessionInfo(utcH)
  const nextSession = getNextSessionInfo(utcH)

  const generateBriefing = async () => {
    setIsGenerating(true)
    setBriefing('')

    const priceLines = PAIRS
      .map(p => `${p}: ${prices[p] ? formatPriceForSymbol(p, prices[p]) : 'loading'}`)
      .join('\n')

    try {
      const res = await callAlchemistAI(`
Generate a PROFESSIONAL, CINEMATIC morning trading briefing for JJ Nexus Pro — an elite Forex/Gold trader using ICT Smart Money Concepts, Volume Profile (IFVG, VP POC, VAH/VAL), and Alchemist X strategy.

DATE/TIME: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
UTC TIME: ${new Date().toUTCString()}
CURRENT SESSION: ${sessionInfo.name}

LIVE PRICES (use these exact figures):
${priceLines}

⚠️ GOLD (XAUUSD) TRADES AT $4,700+ in August 2026 — never reference old $2,000–$3,000 prices.

Produce a tight, professional briefing a trader can absorb in 60 seconds. Use this EXACT structure:

## 🌅 Good Morning, JJ

## 🎯 Today's Headline
[One punchy sentence — the single most critical market fact right now with SPECIFIC price]

## 📊 Overnight Recap
[3-4 precise bullets with actual prices and percentage moves]
- **XAUUSD**: Current ${prices.XAUUSD ? formatPriceForSymbol('XAUUSD', prices.XAUUSD) : '~$4,720'} — [what happened overnight]
- **DXY / Risk Sentiment**: [current dollar strength context]
- **Key Mover**: [the pair that moved most and why]
- **Macro Context**: [1 line — rate expectations, geopolitical, etc.]

## 🔥 Top 2 Setups Today
**Setup #1 — [PAIR] [LONG/SHORT]**: [ICT/SMC entry reason + specific level + session context. Min 2 sentences.]
**Setup #2 — [PAIR] [LONG/SHORT]**: [Same depth of analysis]

## ⚠️ Key Levels Right Now
| Pair | Level | Type | Significance |
|------|-------|------|--------------|
[6-8 rows: OBs, FVGs, liquidity pools, previous highs/lows, round numbers]

## 📅 High-Impact Events Today
[Events with exact UTC times. Format: HH:MM UTC — Event Name (pairs affected) — Expected impact]

## 🗺️ Session Playbook
[For ${sessionInfo.name}: exact times, what to do, which pairs to prioritize, when to stay out. Kill zones: London 07:00–09:00 UTC, NY 12:00–14:00 UTC]

## 💡 Alchemist's Edge
[1 ultra-specific SMC + Volume Profile confluence insight based on current prices. Give exact zone numbers.]

Every line must be specific and tradeable. No fluff.
`, prices.XAUUSD, 'XAUUSD')

      setBriefing(res)
      setGeneratedAt(new Date())
      const today = new Date().toDateString()
      localStorage.setItem('jjnexus_briefing_date', today)
      localStorage.setItem('jjnexus_briefing_content', res)
    } catch {
      setBriefing('⚠️ Failed to generate briefing. Check your AI connection in Settings.')
    }
    setIsGenerating(false)
  }

  useEffect(() => {
    const savedDate = localStorage.getItem('jjnexus_briefing_date')
    const savedContent = localStorage.getItem('jjnexus_briefing_content')
    const today = new Date().toDateString()
    const isStaleError = savedContent && (
      savedContent.includes('AI Not Configured') ||
      savedContent.includes('⚠️ Failed') ||
      savedContent.length < 100
    )
    if (savedDate === today && savedContent && !isStaleError) {
      setBriefing(savedContent)
      setGeneratedAt(new Date())
    } else {
      if (isStaleError) {
        localStorage.removeItem('jjnexus_briefing_date')
        localStorage.removeItem('jjnexus_briefing_content')
      }
      const localH = new Date().getHours()
      if (localH >= 5 && localH < 11) generateBriefing()
    }
  }, [])

  const handleCopy = () => {
    if (!briefing) return
    navigator.clipboard?.writeText(briefing)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="flex flex-col gap-4 pb-8">

      {/* ── CINEMATIC HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ border: '1px solid rgba(212,175,55,0.3)', background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(212,175,55,0.04) 100%)' }}>
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 8% 50%, rgba(212,175,55,0.15) 0%, transparent 60%)' }} />
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)' }} />

        <div className="relative p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-13 h-13 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.35)' }}>
                <Sun className="w-7 h-7 text-[var(--gold)]" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 border-2 border-black animate-pulse" />
            </div>
            <div>
              <h1 className="font-serif font-black text-2xl tracking-widest" style={{ color: 'var(--gold)' }}>
                MORNING BRIEFING
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                {generatedAt && (
                  <span className="text-gray-700">
                    · Refreshed {generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {briefing && (
              <>
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{
                    border: '1px solid rgba(212,175,55,0.2)',
                    color: copied ? '#22c55e' : 'rgba(212,175,55,0.65)',
                    background: copied ? 'rgba(34,197,94,0.08)' : 'transparent',
                  }}>
                  <Copy className="w-3.5 h-3.5" /> {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button onClick={() => exportAnalysisPDF('Morning Briefing', briefing, prices.XAUUSD || 0)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{ border: '1px solid rgba(212,175,55,0.2)', color: 'rgba(212,175,55,0.65)' }}>
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              </>
            )}
            <button onClick={generateBriefing} disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-1.5 rounded-lg font-black text-sm transition-all disabled:opacity-60"
              style={{
                background: isGenerating ? 'rgba(212,175,55,0.08)' : 'var(--gold)',
                color: isGenerating ? 'var(--gold)' : '#000',
                border: isGenerating ? '1px solid rgba(212,175,55,0.3)' : 'none',
              }}>
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Generating...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* ── SESSION INFO ROW ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* Active session card */}
        <div className="rounded-xl p-4 flex items-center gap-3 relative overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${sessionInfo.color}30` }}>
          <div className="absolute inset-0 pointer-events-none opacity-5"
            style={{ background: `radial-gradient(ellipse at 20% 50%, ${sessionInfo.color}, transparent 70%)` }} />
          <div className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ background: sessionInfo.color }} />
          <div className="flex-1 min-w-0 relative">
            <p className="text-[9px] font-black uppercase tracking-[0.12em]"
              style={{ color: sessionInfo.color }}>
              {sessionInfo.isKillZone ? '⚡ KILL ZONE ACTIVE' : '● LIVE SESSION'}
            </p>
            <p className="text-white font-bold text-sm mt-0.5 truncate">{sessionInfo.name}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{new Date().toUTCString().replace(' GMT','').replace(/\d{4} /,'')}</p>
          </div>
        </div>

        {/* Next session countdown */}
        <div className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Clock className="w-4.5 h-4.5 text-gray-600" />
          </div>
          <div>
            <p className="text-[9px] text-gray-600 uppercase tracking-widest">NEXT: {nextSession.name.toUpperCase()}</p>
            <p className="text-white font-bold text-base mt-0.5">
              <Countdown targetUtcH={nextSession.utcStart} />
            </p>
            <p className="text-[10px] text-gray-700 mt-0.5">{nextSession.utcStart}:00 UTC</p>
          </div>
        </div>

        {/* 24h Session Timeline */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[9px] text-gray-700 uppercase tracking-[0.1em] mb-2">24H SESSION MAP</p>
          <div className="relative h-4 rounded-full overflow-hidden border border-[rgba(255,255,255,0.04)]"
            style={{ background: '#0a0a0a' }}>
            {/* Session fills */}
            <div className="absolute inset-y-0" style={{ left: `${(22/24)*100}%`, width: `${(2/24)*100}%`, background: '#06b6d415' }} />
            <div className="absolute inset-y-0" style={{ left: '0%', width: `${(8/24)*100}%`, background: '#06b6d415' }} />
            <div className="absolute inset-y-0" style={{ left: `${(7/24)*100}%`, width: `${(9/24)*100}%`, background: '#8b5cf615' }} />
            <div className="absolute inset-y-0" style={{ left: `${(13/24)*100}%`, width: `${(9/24)*100}%`, background: '#22c55e15' }} />
            {/* Kill zones */}
            <div className="absolute inset-y-0" style={{ left: `${(7/24)*100}%`, width: `${(2/24)*100}%`, background: '#ef444435' }} />
            <div className="absolute inset-y-0" style={{ left: `${(12/24)*100}%`, width: `${(2/24)*100}%`, background: '#f9731635' }} />
            {/* Current time cursor */}
            <div className="absolute top-0 bottom-0 w-0.5 z-10"
              style={{ left: `${(utcH/24)*100}%`, background: 'white', boxShadow: '0 0 5px white' }} />
          </div>
          <div className="flex justify-between text-[8px] text-gray-800 mt-1 px-0.5">
            {['0','6','12','18','24'].map(h => <span key={h}>{h}</span>)}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            {[{c:'#06b6d4',l:'Asia'},{c:'#8b5cf6',l:'London'},{c:'#22c55e',l:'NY'},{c:'#ef4444',l:'KZ'}].map(s=>(
              <span key={s.l} className="flex items-center gap-1 text-[8px] text-gray-700">
                <span className="w-1.5 h-1.5 rounded-full" style={{background:s.c}}/>
                {s.l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── LIVE PRICE STRIP ── */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        {PAIRS.map(pair => {
          const meta = PRICE_META[pair]
          const isUp = meta.trend === 'up'
          return (
            <div key={pair}
              className="rounded-xl p-2.5 text-center relative overflow-hidden transition-all duration-200 hover:scale-[1.03] cursor-default"
              style={{
                background: 'rgba(0,0,0,0.7)',
                border: `1px solid ${isUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
              }}>
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{ background: isUp ? '#22c55e' : '#ef4444' }} />
              <div className="relative">
                <div className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1">{pair}</div>
                <div className="text-[11px] font-mono font-black text-white leading-none">
                  {prices[pair] ? formatPriceForSymbol(pair, prices[pair]) : '—'}
                </div>
                <div className="flex items-center justify-center gap-0.5 mt-1"
                  style={{ color: isUp ? '#22c55e' : '#ef4444' }}>
                  {isUp
                    ? <TrendingUp className="w-2.5 h-2.5" />
                    : <TrendingDown className="w-2.5 h-2.5" />}
                  <span className="text-[8px] font-bold">{isUp ? '+' : ''}{meta.change}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── MAIN BRIEFING CARD ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(212,175,55,0.2)', background: 'hsl(var(--card))' }}>

        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(212,175,55,0.12)]"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--gold)]" />
            <span className="font-black text-sm text-[var(--gold)] tracking-wider">☀️ ALCHEMIST MARKET INTELLIGENCE</span>
            {briefing && (
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                LIVE DATA
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-gray-700">
            <Radio className="w-3 h-3" />
            AI-powered · Uses live prices
          </div>
        </div>

        {/* Card body */}
        <div className="p-5 md:p-6 min-h-[360px]">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-24 gap-6">
              {/* Animated rings */}
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-[rgba(212,175,55,0.1)] border-t-[var(--gold)] animate-spin" />
                <div className="absolute inset-2 rounded-full border border-[rgba(212,175,55,0.1)] border-b-[rgba(212,175,55,0.4)] animate-spin"
                  style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                <Sun className="absolute inset-0 m-auto w-5 h-5 text-[var(--gold)]" />
              </div>
              <div className="text-center">
                <p className="text-[var(--gold)] font-black text-base tracking-wider">
                  Alchemist is Reading the Markets...
                </p>
                <p className="text-gray-600 text-xs mt-2">
                  Scanning live prices · Analyzing sessions · Identifying A+ setups
                </p>
              </div>
              <div className="flex gap-1.5">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="w-1 rounded-full bg-[var(--gold)]"
                    style={{ height: 16 + Math.sin(i) * 8, opacity: 0.4 + i * 0.12,
                      animation: `pulse 0.8s ${i * 0.12}s ease-in-out infinite alternate` }} />
                ))}
              </div>
            </div>
          ) : briefing ? (
            <div className="prose prose-invert prose-sm max-w-none
              prose-headings:text-[var(--gold)] prose-headings:font-black prose-headings:tracking-wide prose-headings:mt-5 prose-headings:mb-2
              prose-h2:text-base prose-h2:border-b prose-h2:border-[rgba(212,175,55,0.12)] prose-h2:pb-1.5
              prose-strong:text-white prose-strong:font-bold
              prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-1.5
              prose-li:text-gray-300 prose-li:my-0.5
              prose-ul:my-2 prose-ol:my-2
              prose-table:text-xs prose-thead:border-b prose-thead:border-[rgba(212,175,55,0.2)]
              prose-th:text-[var(--gold)] prose-th:font-bold prose-th:py-1.5 prose-th:text-xs
              prose-td:text-gray-300 prose-td:py-1.5 prose-td:border-b prose-td:border-[rgba(255,255,255,0.04)]
              prose-blockquote:border-l-[var(--gold)] prose-blockquote:text-gray-400
              prose-code:text-[var(--gold)] prose-code:bg-[rgba(212,175,55,0.08)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
              prose-hr:border-[rgba(212,175,55,0.1)]">
              <ReactMarkdown>{briefing}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.1)' }}>
                  <Sun className="w-8 h-8 text-gray-800" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-gray-500 font-bold text-base">Ready for Today's Intelligence?</p>
                <p className="text-gray-700 text-xs mt-1.5">
                  Auto-generates 05:00–11:00 local time
                  <br />Uses live prices + AI analysis + session context
                </p>
              </div>
              <button onClick={generateBriefing}
                className="px-6 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 hover:scale-105"
                style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)' }}>
                <Sun className="w-4 h-4" /> Generate Briefing
              </button>
            </div>
          )}
        </div>

        {/* Footer info strip */}
        {briefing && (
          <div className="px-5 py-2.5 border-t border-[rgba(212,175,55,0.08)] flex items-center justify-between"
            style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="flex items-center gap-4 text-[10px] text-gray-700">
              <span className="flex items-center gap-1.5">
                <BarChart2 className="w-3 h-3" />
                XAUUSD: {prices.XAUUSD ? formatPriceForSymbol('XAUUSD', prices.XAUUSD) : '—'}
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="w-3 h-3" />
                {sessionInfo.name}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              {sessionInfo.isKillZone && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px]"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle className="w-2.5 h-2.5" /> KILL ZONE
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
