import { useState, useEffect, useRef } from 'react'
import { Radio, Zap, TrendingUp } from 'lucide-react'
import { AlertService, JJNotification } from '@/services/AlertService'

// ── Session map (UTC) ──────────────────────────────────────────────────────────
const SESSIONS = [
  { name: 'ASIA', start: 22, end: 8, color: '#06b6d4' },
  { name: 'LONDON', start: 7, end: 16, color: '#8b5cf6' },
  { name: 'NEW YORK', start: 13, end: 22, color: '#22c55e' },
]

const KILL_ZONES = [
  { name: 'LONDON KZ', start: 7, end: 9, color: '#ef4444' },
  { name: 'NY KZ', start: 12, end: 14, color: '#f97316' },
]

function getSession(utcH: number) {
  const kz = KILL_ZONES.find(k => utcH >= k.start && utcH < k.end)
  if (kz) return { label: `🔥 ${kz.name} ACTIVE`, color: kz.color, pulse: true }
  const s = SESSIONS.find(s => s.start > s.end
    ? (utcH >= s.start || utcH < s.end)
    : (utcH >= s.start && utcH < s.end))
  if (s) return { label: s.name, color: s.color, pulse: false }
  return { label: 'PRE-MARKET', color: '#4b5563', pulse: false }
}

// ── Static market intelligence headlines ──────────────────────────────────────
const STATIC_HEADLINES = [
  '📡 XAUUSD · ICT Smart Money Concepts + Volume Profile POC tracking live — Alchemist X Strategy',
  '⚡ London Kill Zone: 07:00–09:00 UTC · Peak institutional order flow · Watch XAUUSD & GBPUSD',
  '🎯 NY Kill Zone: 12:00–14:00 UTC · DXY correlation in play · High-probability reversal zone',
  '💡 A+ Setup Criteria: IFVG + VP POC confluence · Min 4/6 confluence score · London or NY session only',
  '📊 Strategy Benchmark: 19 months verified · 67.2% win rate · +9,560 net pips · Sharpe 1.74',
  '🏆 Mission Control: Track funded account daily drawdown in real-time · $30 daily DD limit',
  '🤖 Alchemist AI: Uses live web search for current prices and news — always real-time data',
  '📅 Economic Calendar: Check high-impact USD events — 30 min no-trade zone before/after release',
  '🎯 Risk Management: Max $15/trade · Max 3 trades/day · Stop after 2 consecutive losses',
  '🌍 Pairs in play: XAUUSD (primary) · EURUSD · GBPUSD · US30 · London + NY sessions ONLY',
  '📈 Volume Profile: VAH/VAL entries give best R:R — POC acts as magnet in ranging market',
  '⚠️ News Alert: No trading 30 minutes before or after high-impact economic releases',
]

const TYPE_ICONS: Record<string, string> = {
  signal: '🎯', alert: '🚨', calendar: '📅', info: '💬',
}

export default function LiveNewsTicker() {
  const [notifications, setNotifications] = useState<JJNotification[]>([])
  const [utcH, setUtcH] = useState(() => new Date().getUTCHours())
  const [utcMin, setUtcMin] = useState(() => new Date().getUTCMinutes())
  const [pauseTicker, setPauseTicker] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<Animation | null>(null)

  useEffect(() => {
    const unsub = AlertService.onNotification(n => {
      setNotifications(prev => [n, ...prev].slice(0, 10))
    })
    const clock = setInterval(() => {
      const now = new Date()
      setUtcH(now.getUTCHours())
      setUtcMin(now.getUTCMinutes())
    }, 30_000)
    return () => { unsub(); clearInterval(clock) }
  }, [])

  const session = getSession(utcH)

  // Build ticker content
  const liveItems = notifications.map(n =>
    `${TYPE_ICONS[n.type ?? 'info'] ?? '●'} ${n.title}${n.body ? ` — ${n.body}` : ''}`
  )
  const allItems = [...liveItems, ...STATIC_HEADLINES]
  const tickerText = allItems.join('     ·     ')

  // Pause animation on hover
  const handleMouseEnter = () => {
    if (tickerRef.current) tickerRef.current.style.animationPlayState = 'paused'
  }
  const handleMouseLeave = () => {
    if (tickerRef.current) tickerRef.current.style.animationPlayState = 'running'
  }

  const utcTimeStr = `${String(utcH).padStart(2,'0')}:${String(utcMin).padStart(2,'0')} UTC`

  return (
    <div className="flex items-center h-7 shrink-0 border-b border-[rgba(212,175,55,0.1)] overflow-hidden select-none"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>

      {/* Session badge */}
      <div className="flex items-center gap-1.5 px-3 h-full shrink-0 border-r border-[rgba(212,175,55,0.1)]"
        style={{ background: `${session.color}10`, minWidth: 130 }}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${session.pulse ? 'animate-pulse' : ''}`}
          style={{ background: session.color }} />
        <span className="text-[9px] font-black tracking-[0.1em] truncate" style={{ color: session.color }}>
          {session.label}
        </span>
      </div>

      {/* LIVE badge */}
      <div className="flex items-center gap-1 px-2.5 h-full shrink-0 border-r border-[rgba(212,175,55,0.1)]"
        style={{ background: 'rgba(212,175,55,0.06)' }}>
        <Radio className="w-2.5 h-2.5 text-[#D4AF37]" />
        <span className="text-[8px] font-black tracking-[0.15em] text-[#D4AF37]">LIVE</span>
      </div>

      {/* Breaking news badge (only when real notifications exist) */}
      {notifications.length > 0 && (
        <div className="flex items-center gap-1 px-2.5 h-full shrink-0 border-r border-[rgba(239,68,68,0.2)]"
          style={{ background: 'rgba(239,68,68,0.08)' }}>
          <Zap className="w-2.5 h-2.5 text-red-400" />
          <span className="text-[8px] font-black tracking-[0.12em] text-red-400">BREAKING</span>
        </div>
      )}

      {/* Scrolling ticker */}
      <div className="flex-1 overflow-hidden h-full flex items-center relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}>
        {/* Fade masks */}
        <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.85), transparent)' }} />
        <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, rgba(0,0,0,0.85), transparent)' }} />

        <div
          ref={tickerRef}
          className="whitespace-nowrap text-[9px] font-medium text-gray-500 tracking-wide pl-4"
          style={{ animation: 'jjTicker 80s linear infinite' }}>
          {tickerText}
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          {tickerText}
        </div>
      </div>

      {/* UTC clock */}
      <div className="flex items-center gap-1.5 px-3 h-full shrink-0 border-l border-[rgba(212,175,55,0.08)]">
        <TrendingUp className="w-2.5 h-2.5 text-gray-700" />
        <span className="text-[9px] font-mono font-bold text-gray-700 tracking-widest">
          {utcTimeStr}
        </span>
      </div>

      <style>{`
        @keyframes jjTicker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
