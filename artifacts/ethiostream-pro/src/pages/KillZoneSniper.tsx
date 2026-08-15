import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Zap, Clock, Bell, Target, ChevronDown, ChevronUp } from 'lucide-react'
import { callAlchemistAI } from '@/utils/freeAI'

interface KillZone {
  name: string
  startHour: number
  endHour: number
  description: string
  bestPairs: string[]
  typicalMove: string
  alchemistStrategy: string
  color: string
  priority: 'HIGHEST' | 'HIGH' | 'MODERATE' | 'AVOID'
}

const KILL_ZONES: KillZone[] = [
  { name: 'Asian Session', startHour: 0, endHour: 6, description: 'Liquidity building phase. Price establishes the range that London and NY will later trade against. Low volume, choppy, avoid trading.', bestPairs: ['USDJPY', 'AUDUSD', 'NZDUSD'], typicalMove: '15-40 pips (ranging)', alchemistStrategy: 'DO NOT TRADE European and US pairs during Asian session. Instead: identify the Asian range high and low — these become your key liquidity targets for London open. Mark them on your chart.', color: '#EF4444', priority: 'AVOID' },
  { name: 'Pre-London Window', startHour: 6, endHour: 7, description: 'The hour before London opens. Smart money begins positioning. Watch for unusual moves or liquidity grabs that preview the London open direction.', bestPairs: ['GBPUSD', 'EURUSD', 'XAUUSD'], typicalMove: '10-30 pips', alchemistStrategy: 'Mark the overnight Asian range. If price makes a sudden move against Asian trend in this window, it is likely inducement before the London manipulation. Do not enter — just watch and prepare.', color: '#8B5CF6', priority: 'MODERATE' },
  { name: 'London Open Kill Zone', startHour: 7, endHour: 9, description: 'The most powerful kill zone. London session opening manipulates the Asian range by sweeping its highs or lows before reversing. This is where the real move of the day begins.', bestPairs: ['GBPUSD', 'EURUSD', 'XAUUSD', 'GBPJPY', 'EURGBP'], typicalMove: '50-150 pips on majors, $10-$30 on Gold', alchemistStrategy: 'Watch Asian range. London will sweep the Asian high OR low first (Judas Swing). After sweep + CHoCH on M15 = enter in the opposite direction. This is the cleanest Alchemist setup of the day.', color: '#10B981', priority: 'HIGHEST' },
  { name: 'London Active', startHour: 9, endHour: 13, description: 'London in full swing. Good for continuation entries off the kill zone move. Avoid counter-trend.', bestPairs: ['GBPUSD', 'EURUSD', 'XAUUSD'], typicalMove: '30-80 pips continuation', alchemistStrategy: 'Trade continuations off the London open direction. Look for H1 OB pullbacks in the direction of the London open bias.', color: '#F59E0B', priority: 'HIGH' },
  { name: 'NY Open Kill Zone', startHour: 13, endHour: 15, description: 'New York session open. Often reverses the London move by sweeping London highs/lows. Second highest probability window of the day.', bestPairs: ['EURUSD', 'XAUUSD', 'GBPUSD', 'NAS100', 'USDCAD'], typicalMove: '40-100 pips on majors, $8-$20 on Gold', alchemistStrategy: 'If London moved bullish, NY will often sweep London highs (BSL) then reverse bearish. Look for: London high sweep + M15 bearish CHoCH + OB entry. Alternatively NY can continue the London move with a retracement entry.', color: '#F59E0B', priority: 'HIGH' },
  { name: 'London Close / NY Overlap', startHour: 15, endHour: 17, description: 'London banks close their positions. Creates volatility as positions are squared. Less predictable but can offer continuation plays.', bestPairs: ['EURUSD', 'GBPUSD'], typicalMove: '20-60 pips', alchemistStrategy: 'Look for pullbacks to H1 OBs formed during NY open. Enter continuation plays only. Avoid reversals at this time as direction can be choppy.', color: '#6366F1', priority: 'MODERATE' },
  { name: 'NY Active / Wind Down', startHour: 17, endHour: 22, description: 'NY session continues but with decreasing volume. Lower probability setups. Pairs like USDCAD remain active.', bestPairs: ['USDCAD', 'NAS100', 'US30'], typicalMove: '20-50 pips', alchemistStrategy: 'Only trade if a very clean A+ setup appears. Avoid forcing entries in low-liquidity conditions.', color: '#6B7280', priority: 'MODERATE' },
  { name: 'NY Close / Dead Zone', startHour: 22, endHour: 24, description: 'Market is closing. Spreads widen. Very low volume. Institutional activity minimal.', bestPairs: [], typicalMove: '5-15 pips (random)', alchemistStrategy: 'DO NOT TRADE. Close any intraday positions if you have them. Prepare your chart analysis for tomorrow.', color: '#EF4444', priority: 'AVOID' },
]

function formatSeconds(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`
}

function getCurrentState() {
  const now = new Date()
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60
  const active = KILL_ZONES.find(kz => utcHour >= kz.startHour && utcHour < kz.endHour) || null
  const upcoming = KILL_ZONES.filter(kz => kz.priority !== 'AVOID').map(kz => {
    const hoursUntil = kz.startHour > utcHour ? kz.startHour - utcHour : 24 - utcHour + kz.startHour
    return { kz, hoursUntil }
  }).sort((a, b) => a.hoursUntil - b.hoursUntil)
  const next = upcoming[0].kz
  const nextStart = new Date()
  nextStart.setUTCHours(next.startHour, 0, 0, 0)
  if (nextStart.getTime() < now.getTime()) nextStart.setUTCDate(nextStart.getUTCDate() + 1)
  const timeToNext = Math.max(0, Math.floor((nextStart.getTime() - now.getTime()) / 1000))
  let timeRemaining: number | null = null
  if (active) {
    const end = new Date()
    end.setUTCHours(active.endHour, 0, 0, 0)
    if (end.getTime() < now.getTime()) end.setUTCDate(end.getUTCDate() + 1)
    timeRemaining = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000))
  }
  return { active, next, timeToNext, timeRemaining }
}

const priorityBg: Record<string, string> = {
  HIGHEST: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  HIGH: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  MODERATE: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  AVOID: 'bg-red-500/10 border-red-500/30 text-red-400',
}

export default function KillZoneSniper() {
  const [state, setState] = useState(getCurrentState())
  const [tick, setTick] = useState(0)
  const [selectedKZ, setSelectedKZ] = useState<KillZone | null>(null)
  const [aiCoaching, setAiCoaching] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(() => { setState(getCurrentState()); setTick(t => t + 1) }, 1000)
    return () => clearInterval(interval)
  }, [])

  const getCoaching = async () => {
    setAiLoading(true)
    const now = new Date()
    const coaching = await callAlchemistAI(
      `Kill Zone session coaching.
Current UTC time: ${now.toUTCString()}
Active session: ${state.active?.name || 'None (between sessions)'}
Next kill zone: ${state.next.name} in ${formatSeconds(state.timeToNext)}

Provide real-time Alchemist coaching:
1. What should I be doing RIGHT NOW based on the current session?
2. What specific setups should I be watching for?
3. Which pairs have the highest probability in this window?
4. Any specific price action to watch for the London or NY open manipulation?
5. What are the key levels to monitor?

Be specific and actionable. Talk like a pro trader coaching a student live.`
    )
    setAiCoaching(coaching)
    setAiLoading(false)
  }

  const { active, next, timeToNext, timeRemaining } = state
  const now = new Date()
  const utcStr = now.toUTCString().slice(17, 25)

  const totalDuration = active ? (active.endHour - active.startHour) * 3600 : 0
  const elapsed = active && timeRemaining !== null ? totalDuration - timeRemaining : 0
  const progressPct = active ? (elapsed / totalDuration) * 100 : 0

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Kill Zone Sniper</h1>
            <p className="text-xs text-gray-500">Session-based trading intelligence — real-time</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-mono font-bold">UTC {utcStr}</div>
          <div className="text-xs text-gray-500">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} local</div>
        </div>
      </div>

      {/* Current Status */}
      <div className={`rounded-xl border p-4 space-y-3 ${active ? `bg-[#111] border-[${active.color}]/30` : 'bg-[#111] border-white/10'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full animate-pulse`} style={{ background: active?.color || '#6B7280' }} />
          <span className="font-bold text-white text-lg">{active ? active.name.toUpperCase() : 'BETWEEN SESSIONS'}</span>
          {active && <span className={`text-xs px-2 py-0.5 rounded border ml-auto ${priorityBg[active.priority]}`}>{active.priority}</span>}
        </div>

        {active && timeRemaining !== null && (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Session progress</span>
                <span className="text-white font-medium">{formatSeconds(timeRemaining)} remaining</span>
              </div>
              <div className="h-2.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                <motion.div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: active.color }} />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-300 font-medium mb-1">What to do RIGHT NOW:</p>
              <p className="text-sm text-gray-400 leading-relaxed">{active.alchemistStrategy}</p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {active.bestPairs.map(p => <span key={p} className="text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">{p}</span>)}
              </div>
            </div>
          </>
        )}

        <div className="border-t border-white/5 pt-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Next kill zone</div>
            <div className="text-white font-bold">{next.name}</div>
            <div className="text-sm text-[#D4AF37] font-mono">{formatSeconds(timeToNext)}</div>
          </div>
          <button onClick={getCoaching} disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#D4AF37] text-black font-semibold text-sm hover:bg-[#B8960C] transition-all">
            <Zap className="w-3.5 h-3.5" />
            {aiLoading ? 'Loading...' : 'AI Coaching'}
          </button>
        </div>
      </div>

      {/* AI Coaching */}
      {aiCoaching && (
        <div className="bg-[#111] border border-[#D4AF37]/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#D4AF37] mb-3">Live Alchemist Coaching</h3>
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">{aiCoaching}</div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-[#111] border border-white/5 rounded-xl p-4">
        <h2 className="font-bold text-white mb-3">Today's Kill Zone Timeline</h2>
        <div className="space-y-1.5">
          {KILL_ZONES.map((kz) => {
            const utcNow = now.getUTCHours() + now.getUTCMinutes() / 60
            const isPast = kz.endHour < utcNow
            const isActive = utcNow >= kz.startHour && utcNow < kz.endHour
            const isNext = kz === next
            const isExpanded2 = expanded === kz.name
            return (
              <div key={kz.name}>
                <div onClick={() => setExpanded(isExpanded2 ? null : kz.name)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-[#1a1a1a] border border-white/10' : 'hover:bg-white/3'} ${isPast ? 'opacity-40' : ''}`}>
                  <div className="text-xs text-gray-500 w-20 flex-shrink-0 font-mono">{kz.startHour.toString().padStart(2, '0')}:00</div>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: kz.color }} />
                  <div className="flex-1 text-sm">
                    <span className={isActive ? 'text-white font-semibold' : 'text-gray-400'}>{kz.name}</span>
                    {isNext && <span className="ml-2 text-xs text-[#D4AF37]">← NEXT</span>}
                    {isActive && <span className="ml-2 text-xs animate-pulse" style={{ color: kz.color }}>● ACTIVE</span>}
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${priorityBg[kz.priority]}`}>{kz.priority}</span>
                  {isExpanded2 ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                </div>
                {isExpanded2 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="ml-8 p-3 bg-[#0d0d0d] rounded-lg border border-white/5 mt-1 mb-1 space-y-2">
                    <p className="text-xs text-gray-400">{kz.description}</p>
                    <div className="text-xs text-gray-500">Best pairs: <span className="text-gray-300">{kz.bestPairs.join(', ') || 'None'}</span></div>
                    <div className="text-xs text-gray-500">Typical move: <span className="text-gray-300">{kz.typicalMove}</span></div>
                    <p className="text-xs text-[#D4AF37] border-t border-white/5 pt-2">{kz.alchemistStrategy}</p>
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
