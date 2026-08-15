import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, TrendingUp, TrendingDown, Clock, Zap, RefreshCcw, AlertTriangle, Target, ChevronRight } from 'lucide-react'
import { sessionOracleReport } from '@/utils/freeAI'
import { useLivePrices, formatPriceForSymbol } from '@/utils/priceEngine'
import ReactMarkdown from 'react-markdown'
import { useLocation } from 'wouter'

interface SessionInfo {
  name: string; emoji: string; utcOpen: number; utcClose: number
  pairs: string[]; color: string; crossesDay?: boolean
}

const SESSIONS: SessionInfo[] = [
  { name: 'Sydney',   emoji: '🇦🇺', utcOpen: 21, utcClose: 6,  pairs: ['AUDUSD','NZDUSD','AUDNZD','AUDJPY'], color: '#3B82F6', crossesDay: true },
  { name: 'Tokyo',    emoji: '🇯🇵', utcOpen: 0,  utcClose: 9,  pairs: ['USDJPY','EURJPY','GBPJPY','AUDJPY','CADJPY'], color: '#EF4444' },
  { name: 'London',   emoji: '🇬🇧', utcOpen: 7,  utcClose: 16, pairs: ['GBPUSD','EURUSD','EURGBP','GBPJPY','XAUUSD'], color: '#10B981' },
  { name: 'New York', emoji: '🇺🇸', utcOpen: 13, utcClose: 22, pairs: ['EURUSD','GBPUSD','USDCAD','XAUUSD','US30','NAS100'], color: '#F59E0B' },
]

const KILL_ZONES = [
  { name: 'London Open Kill Zone', start: 7,  end: 9,  priority: 'HIGHEST',  pairs: ['GBPUSD','EURUSD','XAUUSD'], desc: 'Most institutional activity. Manipulates Asian range.' },
  { name: 'NY Open Kill Zone',     start: 13, end: 15, priority: 'HIGH',     pairs: ['EURUSD','XAUUSD','US30'],   desc: 'Second highest probability. Often reverses London.' },
  { name: 'London Close',          start: 15, end: 17, priority: 'MODERATE', pairs: ['GBPUSD','EURUSD'],          desc: 'Institutional position closing creates volatility.' },
  { name: 'Asian Range',           start: 0,  end: 7,  priority: 'AVOID',   pairs: [],                            desc: 'Low liquidity. Range building only. Avoid entries.' },
]

const SESSION_STATS: Record<string, { winRate: number; trades: number }> = {
  'London Open Kill Zone': { winRate: 68, trades: 47 },
  'NY Open Kill Zone':     { winRate: 54, trades: 31 },
  'London Close':          { winRate: 48, trades: 18 },
  'Asian Range':           { winRate: 31, trades: 16 },
}

const TOP_PAIRS_BY_SESSION: Record<string, { pair: string; score: number; reason: string }[]> = {
  Sydney:     [{ pair:'AUDUSD',score:8.2,reason:'AUD pairs peak'},{pair:'NZDUSD',score:7.8,reason:'Correlated with AUD'},{pair:'USDJPY',score:7.1,reason:'Asian overlap'}],
  Tokyo:      [{ pair:'USDJPY',score:9.1,reason:'Primary JPY session'},{pair:'EURJPY',score:8.4,reason:'EU/Asia cross'},{pair:'GBPJPY',score:7.9,reason:'High volatility'}],
  London:     [{ pair:'XAUUSD',score:9.3,reason:'Gold most active'},{pair:'GBPUSD',score:8.9,reason:'GBP primary session'},{pair:'EURUSD',score:8.7,reason:'Highest volume'}],
  'New York': [{ pair:'XAUUSD',score:9.2,reason:'NY Gold rush'},{pair:'US30',score:8.8,reason:'US equity open'},{pair:'NAS100',score:8.5,reason:'Tech index strength'}],
}

function isSessionActive(s: SessionInfo, h: number) {
  return s.crossesDay ? h >= s.utcOpen || h < s.utcClose : h >= s.utcOpen && h < s.utcClose
}
function getKillZone(h: number, m: number) {
  const t = h + m / 60
  return KILL_ZONES.find(kz => kz.start !== 0 && t >= kz.start && t < kz.end)
      || KILL_ZONES.find(kz => kz.start === 0 && t >= 0 && t < kz.end)
}
function hoursUntil(target: number, h: number, m: number): string {
  let d = target - (h + m / 60); if (d < 0) d += 24
  return `${Math.floor(d)}h ${Math.floor((d % 1) * 60)}m`
}
function secsUntil(target: number, h: number, m: number, s: number): number {
  let d = target - (h + m / 60 + s / 3600); if (d < 0) d += 24
  return Math.floor(d * 3600)
}
function sessionProgress(s: SessionInfo, h: number, m: number): number {
  if (!isSessionActive(s, h)) return 0
  const cur = h + m / 60; let dur = s.utcClose - s.utcOpen; if (dur < 0) dur += 24
  let el = cur - s.utcOpen; if (el < 0) el += 24
  return Math.min(100, (el / dur) * 100)
}
function fmtSecs(s: number): string {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function SessionRing({ progress, color, size = 72 }: { progress: number; color: string; size?: number }) {
  const r = (size - 8) / 2; const circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - (circ * progress) / 100 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 3px ${color}88)` }}
      />
    </svg>
  )
}

export default function SessionOracle() {
  const [now, setNow] = useState(new Date())
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(false)
  const { prices } = useLivePrices()
  const [, navigate] = useLocation()

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])

  const h = now.getUTCHours(); const m = now.getUTCMinutes(); const s = now.getUTCSeconds()
  const activeSessions = SESSIONS.filter(sess => isSessionActive(sess, h))
  const currentKZ = getKillZone(h, m)
  const currentTopPairs = activeSessions.length > 0
    ? TOP_PAIRS_BY_SESSION[activeSessions[activeSessions.length - 1].name] || TOP_PAIRS_BY_SESSION['London']
    : TOP_PAIRS_BY_SESSION['London']

  const getOverlap = () => {
    if (h >= 13 && h < 16) return { name: 'London — New York Overlap', desc: 'HIGHEST PROBABILITY. Most institutional activity of the day.', action: 'TRADE', color: 'text-green-400', border: 'border-green-500/40' }
    if (h >= 7 && h < 9)   return { name: 'London Open Kill Zone',      desc: 'ELITE entry window. Smart money manipulates Asian range.', action: 'TRADE', color: 'text-[#D4AF37]', border: 'border-[rgba(212,175,55,0.4)]' }
    if (h >= 13 && h < 15) return { name: 'NY Open Kill Zone',           desc: 'HIGH PROBABILITY. Often reverses London direction.', action: 'TRADE', color: 'text-[#D4AF37]', border: 'border-[rgba(212,175,55,0.4)]' }
    if (activeSessions.length >= 2) return { name: `${activeSessions.map(x=>x.name).join(' + ')} Overlap`, desc: 'Multiple sessions active. Elevated liquidity.', action: 'CAUTION', color: 'text-blue-400', border: 'border-blue-500/35' }
    if (activeSessions.length === 1) return { name: `${activeSessions[0].name} Session`, desc: `${activeSessions[0].pairs.slice(0,3).join(', ')} are primary pairs.`, action: 'CAUTION', color: 'text-gray-300', border: 'border-gray-700' }
    return { name: 'Market Transition', desc: 'No major session open. Low liquidity. Stand by.', action: 'WAIT', color: 'text-gray-500', border: 'border-gray-800' }
  }
  const overlap = getOverlap()

  const nextKZ = (() => {
    for (const kz of KILL_ZONES) {
      if (kz.start === 0) continue
      if ((h + m/60) < kz.start) return { ...kz, timeAway: hoursUntil(kz.start, h, m), secsAway: secsUntil(kz.start, h, m, s) }
    }
    return { ...KILL_ZONES[0], timeAway: hoursUntil(KILL_ZONES[0].start, h, m), secsAway: secsUntil(KILL_ZONES[0].start, h, m, s) }
  })()

  const kzTimeUsed = currentKZ ? ((h + m/60) - currentKZ.start) / (currentKZ.end - currentKZ.start) * 100 : 0
  const kzSecsRemaining = currentKZ ? secsUntil(currentKZ.end, h, m, s) : 0

  const handleAnalyze = async () => {
    setLoading(true); setAnalysis('')
    try { setAnalysis(await sessionOracleReport()) }
    catch (e: any) { setAnalysis(`⚠️ ${e.message}`) }
    finally { setLoading(false) }
  }

  const scanTheseNow = () => {
    sessionStorage.setItem('scanner_pairs', JSON.stringify(currentTopPairs.map(p => p.pair)))
    navigate('/scanner')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 pb-6">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden px-6 py-5" style={{ background: 'linear-gradient(135deg, #05050f, #050a14)', border: '1px solid rgba(59,130,246,0.25)' }}>
        {/* Animated clock ring */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-15 pointer-events-none">
          <svg width="100" height="100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 4" />
            <motion.line x1="50" y1="50" x2="50" y2="8" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"
              animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '50px 50px' }}
            />
            <motion.line x1="50" y1="50" x2="50" y2="14" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"
              animate={{ rotate: 360 }} transition={{ duration: 3600, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '50px 50px' }}
            />
          </svg>
        </div>
        {['top-0 left-0 border-t border-l','top-0 right-0 border-t border-r','bottom-0 left-0 border-b border-l','bottom-0 right-0 border-b border-r'].map((c,i) => (
          <div key={i} className={`absolute w-4 h-4 ${c} border-[rgba(59,130,246,0.4)]`} />
        ))}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.35)' }}>
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-[0.15em] uppercase text-blue-400">Temporal Command</h1>
              <p className="text-[9px] text-gray-600 tracking-widest uppercase font-mono">Session Oracle · Kill Zone Intelligence</p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-black text-white tracking-widest">
              {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
            </div>
            <div className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">UTC · {now.toLocaleTimeString()} Local</div>
          </div>
        </div>
      </div>

      {/* ── KILL ZONE ALERT BANNER ───────────────────────────────────── */}
      <AnimatePresence>
        {currentKZ && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className={`rounded-2xl p-5 ${
              currentKZ.priority === 'HIGHEST' ? 'border-[rgba(212,175,55,0.5)] bg-[rgba(212,175,55,0.06)]' :
              currentKZ.priority === 'HIGH'    ? 'border-green-500/40 bg-green-500/05' :
              currentKZ.priority === 'AVOID'   ? 'border-red-500/30 bg-red-500/05' : 'border-blue-500/35 bg-blue-500/05'
            } border`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${currentKZ.priority === 'HIGHEST' ? 'bg-[rgba(212,175,55,0.15)]' : 'bg-green-500/10'}`}>
                  <Zap className={`w-5 h-5 ${currentKZ.priority === 'HIGHEST' ? 'text-[#D4AF37]' : currentKZ.priority === 'HIGH' ? 'text-green-400' : currentKZ.priority === 'AVOID' ? 'text-red-400' : 'text-blue-400'}`} />
                </div>
                <div>
                  <div className={`font-black text-base ${currentKZ.priority === 'HIGHEST' ? 'text-[#D4AF37]' : currentKZ.priority === 'HIGH' ? 'text-green-400' : currentKZ.priority === 'AVOID' ? 'text-red-400' : 'text-white'}`}>
                    ⚡ {currentKZ.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{currentKZ.desc}</div>
                  {currentKZ.pairs.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {currentKZ.pairs.map(p => <span key={p} className="text-[9px] px-2 py-0.5 rounded-full border border-[rgba(212,175,55,0.3)] text-[#D4AF37] font-mono font-black">{p}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-xs font-black px-2.5 py-1 rounded-full border ${
                  currentKZ.priority === 'HIGHEST' ? 'bg-[rgba(212,175,55,0.15)] text-[#D4AF37] border-[rgba(212,175,55,0.3)]' :
                  currentKZ.priority === 'HIGH'    ? 'bg-green-500/15 text-green-400 border-green-500/30' :
                  currentKZ.priority === 'AVOID'   ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                } uppercase tracking-widest`}>{currentKZ.priority}</div>
                <div className="font-mono text-white text-xl font-black mt-1">{fmtSecs(kzSecsRemaining)}</div>
                <div className="text-[9px] text-gray-600 font-mono">remaining</div>
              </div>
            </div>
            {currentKZ.priority !== 'AVOID' && (
              <div className="mt-3 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <motion.div className={`h-full rounded-full ${currentKZ.priority === 'HIGHEST' ? 'bg-[#D4AF37]' : 'bg-green-500'}`}
                  initial={{ width: 0 }} animate={{ width: `${kzTimeUsed}%` }} transition={{ duration: 0.5 }}
                  style={{ boxShadow: currentKZ.priority === 'HIGHEST' ? '0 0 8px rgba(212,175,55,0.6)' : '0 0 6px rgba(34,197,94,0.5)' }} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SESSION CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SESSIONS.map(sess => {
          const active = isSessionActive(sess, h)
          const prog = sessionProgress(sess, h, m)
          return (
            <motion.div key={sess.name}
              animate={active ? { boxShadow: [`0 0 0px ${sess.color}00`, `0 0 20px ${sess.color}33`, `0 0 0px ${sess.color}00`] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className={`rounded-2xl p-4 border transition-all ${active ? 'border-[rgba(212,175,55,0.4)]' : 'border-[rgba(212,175,55,0.1)]'}`}
              style={{ background: active ? 'rgba(212,175,55,0.04)' : 'rgba(5,5,15,0.9)' }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-2xl mb-1">{sess.emoji}</div>
                  <div className={`font-black text-sm ${active ? 'text-white' : 'text-gray-500'}`}>{sess.name}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className={`flex items-center gap-1 text-[9px] font-black ${active ? 'text-green-400' : 'text-gray-700'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500 animate-pulse shadow-[0_0_4px_#22c55e]' : 'bg-gray-800'}`} />
                    {active ? 'OPEN' : 'CLOSED'}
                  </div>
                  <SessionRing progress={prog} color={active ? sess.color : '#374151'} size={52} />
                </div>
              </div>
              <div className="text-[9px] text-gray-600 font-mono mb-2">
                {String(sess.utcOpen).padStart(2,'0')}:00 — {String(sess.utcClose).padStart(2,'0')}:00 UTC
              </div>
              {!active ? (
                <div className="text-[9px] text-gray-700 font-mono">Opens in {hoursUntil(sess.utcOpen, h, m)}</div>
              ) : (
                <div className="text-[9px] text-green-500 font-mono font-bold">Closes in {hoursUntil(sess.utcClose, h, m)}</div>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {sess.pairs.slice(0,3).map(p => {
                  const px = prices[p]
                  return <span key={p} title={px ? formatPriceForSymbol(p, px) : ''} className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${active ? 'bg-[rgba(212,175,55,0.1)] text-[#D4AF37]' : 'bg-gray-900 text-gray-700'}`}>{p}</span>
                })}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ── 3-COLUMN INTEL GRID ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Current Status */}
        <div className="flex flex-col gap-3">
          <div className={`rounded-2xl p-4 border ${overlap.border}`} style={{ background: 'rgba(5,5,15,0.95)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Current Status</span>
            </div>
            <div className={`font-black text-base ${overlap.color}`}>{overlap.name}</div>
            <div className="text-xs text-gray-500 mt-1 leading-relaxed">{overlap.desc}</div>
            <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
              overlap.action === 'TRADE'   ? 'bg-green-500/15 text-green-400 border-green-500/30' :
              overlap.action === 'CAUTION' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' :
                                             'bg-gray-800/50 text-gray-600 border-gray-700'
            }`}>
              {overlap.action === 'TRADE' ? '🟢' : overlap.action === 'CAUTION' ? '🟡' : '🔴'} {overlap.action}
            </div>
          </div>

          {/* Top Pairs */}
          <div className="flex-1 rounded-2xl p-4" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.15)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Top Targets Now</span>
              </div>
              <button onClick={scanTheseNow} className="text-[9px] text-[#D4AF37] hover:text-yellow-300 flex items-center gap-1 font-mono font-black border border-[rgba(212,175,55,0.2)] px-2 py-0.5 rounded transition-colors">
                <Target className="w-2.5 h-2.5" />SCAN
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {currentTopPairs.map((p, i) => {
                const px = prices[p.pair]
                return (
                  <div key={p.pair} className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.08)' }}>
                    <span className="text-[#D4AF37] text-xs font-mono font-black w-4">#{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm font-mono">{p.pair}</span>
                        {px && <span className="text-[#D4AF37] font-mono text-xs">{formatPriceForSymbol(p.pair, px)}</span>}
                      </div>
                      <div className="text-[9px] text-gray-600">{p.reason}</div>
                    </div>
                    <span className="text-xs font-black text-[#D4AF37] shrink-0">{p.score}/10</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Win Rates + Next KZ */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.15)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">📊 Session Win Rates</span>
            </div>
            <div className="space-y-2.5">
              {KILL_ZONES.map(kz => {
                const stats = SESSION_STATS[kz.name]; if (!stats) return null
                const isActive = getKillZone(h, m)?.name === kz.name
                return (
                  <div key={kz.name} className={`p-2.5 rounded-lg ${isActive ? 'bg-[rgba(212,175,55,0.06)] border border-[rgba(212,175,55,0.2)]' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[9px] font-mono truncate ${isActive ? 'text-[#D4AF37]' : 'text-gray-500'}`}>{kz.name}</span>
                      <div className="text-right shrink-0 ml-2">
                        <span className={`text-xs font-black ${stats.winRate >= 60 ? 'text-green-400' : stats.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>{stats.winRate}%</span>
                        <span className="text-[9px] text-gray-700 ml-1 font-mono">{stats.trades}T</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <motion.div className={`h-full rounded-full ${stats.winRate >= 60 ? 'bg-green-500' : stats.winRate >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        initial={{ width: 0 }} animate={{ width: `${stats.winRate}%` }} transition={{ duration: 0.8 }}
                        style={{ boxShadow: isActive ? '0 0 6px rgba(212,175,55,0.5)' : 'none' }} />
                    </div>
                    {isActive && <div className="text-[8px] text-[#D4AF37] font-mono mt-0.5">● ACTIVE NOW</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Next Kill Zone */}
          {nextKZ && (
            <div className="rounded-2xl p-4 border border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.04)]">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Next Kill Zone</span>
              </div>
              <div className="font-black text-[#D4AF37] text-sm">{nextKZ.name}</div>
              <div className="font-mono text-white text-3xl font-black mt-1">{fmtSecs(nextKZ.secsAway)}</div>
              <div className="text-[9px] text-gray-600 font-mono mt-1">Opens at {nextKZ.start}:00 UTC</div>
              <div className={`mt-2 inline-flex text-[9px] font-black px-2 py-0.5 rounded border ${
                nextKZ.priority === 'HIGHEST' ? 'text-[#D4AF37] border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.1)]' : 'text-green-400 border-green-500/25 bg-green-500/10'
              }`}>{nextKZ.priority}</div>
              <div className="text-[9px] text-gray-700 mt-2 italic">Prepare your setup now</div>
            </div>
          )}
        </div>

        {/* AI Report */}
        <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.15)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'rgba(212,175,55,0.1)', background: 'rgba(0,0,0,0.4)' }}>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#D4AF37]" />
              <span className="font-black text-sm text-white">AI SESSION REPORT</span>
            </div>
            <button onClick={handleAnalyze} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border border-[rgba(212,175,55,0.3)] text-[#D4AF37] hover:bg-[rgba(212,175,55,0.1)] transition-colors disabled:opacity-50">
              <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'ANALYZING...' : 'RUN ORACLE'}
            </button>
          </div>

          {/* Kill zone timeline */}
          <div className="px-4 py-2.5 border-b grid grid-cols-4 gap-1.5" style={{ borderColor: 'rgba(212,175,55,0.06)', background: 'rgba(0,0,0,0.2)' }}>
            {KILL_ZONES.map(kz => {
              const active = getKillZone(h, m)?.name === kz.name
              return (
                <div key={kz.name} className={`p-1.5 rounded-lg text-center border transition-all ${active ? (kz.priority==='AVOID'?'border-red-500/40 bg-red-500/08':'border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.08)]') : 'border-[rgba(255,255,255,0.04)]'}`}>
                  <div className="text-[8px] text-gray-700 font-mono">{kz.start}–{kz.end}h</div>
                  <div className={`text-[8px] font-black mt-0.5 ${kz.priority==='HIGHEST'?'text-[#D4AF37]':kz.priority==='HIGH'?'text-green-400':kz.priority==='MODERATE'?'text-blue-400':'text-red-400'}`}>{kz.priority.slice(0,3)}</div>
                  {active && <div className="text-[7px] text-[#D4AF37] font-mono">●</div>}
                </div>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {!analysis && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-3 py-8">
                <Globe className="w-12 h-12 opacity-15" />
                <p className="text-xs text-center font-mono">Click RUN ORACLE for live Alchemist AI session intelligence</p>
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
                <div className="w-8 h-8 border-2 border-[rgba(212,175,55,0.3)] border-t-[#D4AF37] rounded-full animate-spin" />
                <p className="text-xs text-gray-600 font-mono">Analyzing current session...</p>
              </div>
            )}
            {analysis && !loading && (
              <div className="prose prose-invert prose-sm max-w-none prose-headings:text-[#D4AF37] prose-strong:text-white prose-code:text-[#D4AF37]">
                <ReactMarkdown>{analysis}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
