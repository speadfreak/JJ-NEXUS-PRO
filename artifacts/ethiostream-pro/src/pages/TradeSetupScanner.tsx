import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Zap, Pause, Play, Send, BarChart2, Clock, CheckCircle, XCircle, Bell, Crosshair, Shield, Radio, Brain, ChevronRight, AlertTriangle } from 'lucide-react'
import { useLivePrices } from '@/utils/priceEngine'
import { scanAllPairs, SetupScore, SCAN_PAIRS, getGradeBadgeClass } from '@/utils/setupScanner'
import { streamAlertService } from '@/services/StreamAlertService'
import { useLocation } from 'wouter'

const SCAN_INTERVALS = [3, 5, 10, 15, 30]

function ThreatBadge({ grade, score }: { grade: string; score: number }) {
  if (grade === 'A+' && score > 85) return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-red-500/60 bg-red-500/10 animate-pulse">
      <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
      <span className="text-xs font-black text-red-300 tracking-widest">OMEGA</span>
    </div>
  )
  if (grade === 'A' || (grade === 'A+' && score > 70)) return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[#D4AF37]/60 bg-[#D4AF37]/10">
      <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
      <span className="text-xs font-black text-[#D4AF37] tracking-widest">ALPHA</span>
    </div>
  )
  if (grade === 'B') return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/40 bg-blue-500/10">
      <span className="w-2 h-2 rounded-full bg-blue-400" />
      <span className="text-xs font-black text-blue-300 tracking-widest">BRAVO</span>
    </div>
  )
  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-gray-700/50 bg-gray-800/30">
      <span className="w-2 h-2 rounded-full bg-gray-600" />
      <span className="text-xs font-black text-gray-500 tracking-widest">STANDBY</span>
    </div>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition-all duration-300 ${on ? 'bg-[#D4AF37]' : 'bg-gray-800 border border-gray-600'}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ${on ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  )
}

export default function TradeSetupScanner() {
  const { prices } = useLivePrices()
  const [, navigate] = useLocation()
  const [scores, setScores] = useState<SetupScore[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [autoPaused, setAutoPaused] = useState(false)
  const [scanInterval, setScanInterval] = useState(5)
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [progress, setProgress] = useState({ completed: 0, total: 15, currentPair: '' })
  const [autoSendEnabled, setAutoSendEnabled] = useState(false)
  const [soundAlertEnabled, setSoundAlertEnabled] = useState(true)
  const [browserNotifEnabled, setBrowserNotifEnabled] = useState(false)
  const [recentlySent, setRecentlySent] = useState<string[]>([])
  const [expandedPair, setExpandedPair] = useState<string | null>(null)
  const [minAutoGrade, setMinAutoGrade] = useState<'A+' | 'A'>('A+')
  const [scanDuration, setScanDuration] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scanStartRef = useRef<number>(0)
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const botToken = localStorage.getItem('jjnexus_telegram_token') || ''
  const telegramTargets = JSON.parse(localStorage.getItem('jjnexus_telegram_targets') || '[]')
  const telegramConfigured = !!botToken && telegramTargets.length > 0

  const topSetup = scores[0]
  const topGrade = topSetup?.grade || ''
  const topScore = topSetup?.score || 0
  const aplusCount = scores.filter(s => s.grade === 'A+').length

  const runScan = async () => {
    if (isScanning) return
    setIsScanning(true)
    setProgress({ completed: 0, total: SCAN_PAIRS.length, currentPair: '' })
    scanStartRef.current = Date.now()
    durationRef.current = setInterval(() => setScanDuration(Math.floor((Date.now() - scanStartRef.current) / 1000)), 500)

    const results = await scanAllPairs(prices, (completed, total, currentPair) => {
      setProgress({ completed, total, currentPair })
    })

    setScores(results)
    setLastScanTime(new Date())
    setIsScanning(false)
    if (durationRef.current) clearInterval(durationRef.current)

    const aplusSetups = results.filter(r =>
      minAutoGrade === 'A+' ? r.grade === 'A+' : (r.grade === 'A+' || r.grade === 'A')
    )

    if (aplusSetups.length > 0) {
      if (soundAlertEnabled) streamAlertService.triggerAlert('setup_found', { username: `${aplusSetups[0].pair} — ${aplusSetups[0].bias}` })
      if (browserNotifEnabled && Notification.permission === 'granted') {
        new Notification('🎯 A+ Setup Found!', { body: `${aplusSetups[0].pair} — ${aplusSetups[0].bias} — Score: ${aplusSetups[0].score}/100`, icon: '/jj-trades-logo.jpg' })
      }
      if (autoSendEnabled && telegramConfigured) {
        for (const setup of aplusSetups) {
          if (!recentlySent.includes(setup.pair)) {
            await autoSendSetup(setup)
            setRecentlySent(prev => [...prev, setup.pair])
            setTimeout(() => setRecentlySent(prev => prev.filter(p => p !== setup.pair)), 4 * 60 * 60 * 1000)
          }
        }
      }
    }
  }

  const autoSendSetup = async (setup: SetupScore) => {
    const dir = setup.bias === 'Bullish' ? '📈' : setup.bias === 'Bearish' ? '📉' : '⚖️'
    const msg = `🎯 <b>A+ SETUP ALERT — ${setup.pair} | JJ NEXUS PRO</b>\n\n${dir} <b>Direction:</b> ${setup.bias}\n💰 <b>Price:</b> $${setup.priceAtScan.toFixed(setup.priceAtScan > 500 ? 2 : 5)}\n📊 <b>Score:</b> ${setup.score}/100 — Grade: ${setup.grade}\n🎯 <b>Probability:</b> ${setup.probability}%\n\n📐 <b>LEVELS:</b>\nEntry: ${setup.entry}\nSL: ${setup.stopLoss}\nTP1: ${setup.tp1}${setup.tp2 ? '\nTP2: ' + setup.tp2 : ''}${setup.tp3 ? '\nTP3: ' + setup.tp3 : ''}\nR:R: 1:${setup.riskReward}\n\n✅ Confluences: ${setup.confluenceCount}/6 aligned\n💡 ${setup.reason}\n\n<i>— Alchemist AI Scanner | JJ NEXUS PRO</i>`
    for (const target of telegramTargets) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: target.id, text: msg, parse_mode: 'HTML' })
        })
      } catch {}
    }
  }

  const requestNotifPermission = async () => {
    if (Notification.permission === 'default') await Notification.requestPermission()
    setBrowserNotifEnabled(Notification.permission === 'granted')
  }

  const deployToGhost = (setup: SetupScore) => {
    sessionStorage.setItem('ghost_setup_pair', setup.pair)
    navigate('/ghost-copilot')
  }

  const armSniper = (setup: SetupScore) => {
    sessionStorage.setItem('sniper_setup', JSON.stringify({ pair: setup.pair, price: setup.entry, condition: 'crosses_above' }))
    navigate('/sniper-alerts')
  }

  useEffect(() => {
    if (autoPaused) return
    intervalRef.current = setInterval(() => { if (!isScanning) runScan() }, scanInterval * 60 * 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [scanInterval, autoPaused, isScanning, prices, autoSendEnabled])

  const top3 = scores.slice(0, 3)
  const medals = ['🥇', '🥈', '🥉']
  const gradeColors: Record<string, string> = { 'A+': '#D4AF37', 'A': '#16a34a', 'B': '#3b82f6', 'C': '#f97316', 'No Trade': '#6b7280' }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 pb-6">

      {/* ── CINEMATIC HEADER ─────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #05050f 0%, #0a0814 60%, #060510 100%)', border: '1px solid rgba(212,175,55,0.25)' }}>
        {/* Rotating radar SVG */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
          <motion.svg width="120" height="120" animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}>
            <circle cx="60" cy="60" r="55" fill="none" stroke="#D4AF37" strokeWidth="1" strokeDasharray="6 4" />
            <circle cx="60" cy="60" r="38" fill="none" stroke="#D4AF37" strokeWidth="0.5" />
            <line x1="60" y1="60" x2="60" y2="5" stroke="#D4AF37" strokeWidth="1.5" />
          </motion.svg>
        </div>
        {/* Corner brackets */}
        {['top-0 left-0 border-t border-l','top-0 right-0 border-t border-r','bottom-0 left-0 border-b border-l','bottom-0 right-0 border-b border-r'].map((c,i) => (
          <div key={i} className={`absolute w-5 h-5 ${c} border-[rgba(212,175,55,0.5)]`} />
        ))}
        <div className="relative z-10 flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)' }}>
                <Crosshair className="w-5 h-5 text-[#D4AF37]" />
              </div>
              {isScanning && <div className="absolute inset-0 rounded-xl border border-[#D4AF37] animate-ping opacity-40" />}
            </div>
            <div>
              <h1 className="font-black text-xl tracking-[0.15em] uppercase" style={{ color: '#D4AF37' }}>WEAPON FORGE</h1>
              <p className="text-[10px] text-gray-600 tracking-widest uppercase font-mono">Setup Scanner · Alchemist SMC Engine · {SCAN_PAIRS.length} Pairs</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {scores.length > 0 && <ThreatBadge grade={topGrade} score={topScore} />}
            {lastScanTime && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600 font-mono">
                <Clock className="w-3 h-3" />{lastScanTime.toLocaleTimeString()}
              </div>
            )}
            <select value={scanInterval} onChange={e => setScanInterval(Number(e.target.value))}
              className="bg-black/60 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#D4AF37]">
              {SCAN_INTERVALS.map(i => <option key={i} value={i}>AUTO {i}m</option>)}
            </select>
            <button onClick={() => setAutoPaused(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${autoPaused ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/35' : 'bg-green-500/15 text-green-400 border-green-500/35'}`}>
              {autoPaused ? <><Play className="w-3.5 h-3.5" />RESUME</> : <><Pause className="w-3.5 h-3.5" />AUTO ON</>}
            </button>
            <button onClick={runScan} disabled={isScanning}
              className="flex items-center gap-2 px-5 py-1.5 rounded-lg font-black text-sm text-black disabled:opacity-50 transition-all"
              style={{ background: isScanning ? 'rgba(212,175,55,0.5)' : '#D4AF37', boxShadow: isScanning ? 'none' : '0 0 16px rgba(212,175,55,0.4)' }}>
              <Zap className={`w-4 h-4 ${isScanning ? 'animate-pulse' : ''}`} />
              {isScanning ? 'SCANNING...' : '⚡ SCAN NOW'}
            </button>
          </div>
        </div>
      </div>

      {/* ── BRIEFING STAT BAR ────────────────────────────────────────── */}
      {(scores.length > 0 || isScanning) && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'PAIRS SCANNED', value: isScanning ? `${progress.completed}/${progress.total}` : `${scores.length}/${SCAN_PAIRS.length}`, icon: Radio, color: '#3b82f6' },
            { label: 'A+ SETUPS', value: String(aplusCount), icon: Target, color: '#D4AF37' },
            { label: 'TOP SCORE', value: topScore ? `${topScore}/100` : '—', icon: Shield, color: '#22c55e' },
            { label: 'SCAN TIME', value: isScanning ? `${scanDuration}s` : lastScanTime ? `${scanDuration}s` : '—', icon: Clock, color: '#a78bfa' },
          ].map(s => {
            const Icon = s.icon
            return (
              <div key={s.label} className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${s.color}22` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <div>
                  <div className="text-[8px] text-gray-600 uppercase tracking-widest font-mono">{s.label}</div>
                  <div className="text-sm font-black text-white font-mono">{s.value}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── SCAN MATRIX PROGRESS ─────────────────────────────────────── */}
      <AnimatePresence>
        {isScanning && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl p-5 overflow-hidden" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.2)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <Crosshair className="w-4 h-4 text-[#D4AF37]" />
                </motion.div>
                <span className="text-sm font-black text-white tracking-wider">SCANNING {progress.currentPair || '...'}</span>
              </div>
              <span className="text-xs font-mono text-gray-500">{progress.completed}/{progress.total}</span>
            </div>
            <div className="w-full bg-gray-900 rounded-full h-1 mb-4">
              <motion.div className="h-1 rounded-full bg-[#D4AF37]"
                animate={{ width: `${(progress.completed / progress.total) * 100}%` }}
                style={{ boxShadow: '0 0 8px rgba(212,175,55,0.6)' }} transition={{ duration: 0.3 }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SCAN_PAIRS.map((p, i) => (
                <motion.span key={p} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className={`text-[9px] px-2 py-1 rounded-md font-mono font-bold border transition-all ${
                    i < progress.completed ? 'bg-green-500/15 text-green-400 border-green-500/30' :
                    p === progress.currentPair ? 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/50 animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.3)]' :
                    'bg-gray-900/50 text-gray-700 border-gray-800'
                  }`}>
                  {i < progress.completed ? '✓' : p === progress.currentPair ? '◉' : '○'} {p}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOP 3 MISSION CARDS ───────────────────────────────────────── */}
      {top3.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.3)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'rgba(212,175,55,0.12)', background: 'rgba(212,175,55,0.05)' }}>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#D4AF37]" />
              <span className="font-black text-[#D4AF37] tracking-wider text-sm">PRIORITY MISSIONS — TOP {top3.length}</span>
            </div>
            <span className="text-[9px] font-mono text-gray-600 uppercase tracking-widest">Execute Immediately</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(212,175,55,0.08)' }}>
            {top3.map((setup, idx) => (
              <motion.div key={setup.pair} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                className="relative p-5" style={{ background: idx === 0 ? 'rgba(212,175,55,0.03)' : 'transparent' }}>
                {/* Corner brackets for top setup */}
                {idx === 0 && ['top-2 left-2 border-t border-l','top-2 right-2 border-t border-r','bottom-2 left-2 border-b border-l','bottom-2 right-2 border-b border-r'].map((c,i) => (
                  <div key={i} className={`absolute w-3 h-3 ${c} border-[rgba(212,175,55,0.4)]`} />
                ))}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{medals[idx]}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-xl font-mono">{setup.pair}</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded ${getGradeBadgeClass(setup.grade)}`}>{setup.grade}</span>
                        <span className="text-xs font-mono" style={{ color: gradeColors[setup.grade] }}>{setup.score}/100</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className={`text-sm font-bold ${setup.bias === 'Bullish' ? 'text-green-400' : setup.bias === 'Bearish' ? 'text-red-400' : 'text-gray-400'}`}>
                          {setup.bias === 'Bullish' ? '📈' : setup.bias === 'Bearish' ? '📉' : '⚖️'} {setup.bias}
                        </span>
                        <span className="text-xs text-gray-600 font-mono">Prob: {setup.probability}%</span>
                        <span className="text-xs text-gray-600 font-mono">R:R 1:{setup.riskReward}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => deployToGhost(setup)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors font-bold">
                      <Brain className="w-3 h-3" />GHOST
                    </button>
                    <button onClick={() => armSniper(setup)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors font-bold">
                      <Crosshair className="w-3 h-3" />SNIPER
                    </button>
                    <button onClick={() => navigate('/alchemist')}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[rgba(212,175,55,0.3)] text-[#D4AF37] hover:bg-[rgba(212,175,55,0.1)] transition-colors font-bold">
                      <BarChart2 className="w-3 h-3" />CHART
                    </button>
                    {telegramConfigured && (
                      <button onClick={() => autoSendSetup(setup)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors font-bold">
                        <Send className="w-3 h-3" />TG
                      </button>
                    )}
                  </div>
                </div>
                {/* Score bar */}
                <div className="w-full bg-gray-900 rounded-full h-1 mb-3">
                  <motion.div className="h-1 rounded-full" initial={{ width: 0 }} animate={{ width: `${setup.score}%` }}
                    style={{ background: `linear-gradient(90deg, ${gradeColors[setup.grade]}88, ${gradeColors[setup.grade]})`, boxShadow: `0 0 6px ${gradeColors[setup.grade]}66` }}
                    transition={{ duration: 0.8, delay: 0.2 }} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3 font-mono">
                  <span>Entry: <span className="text-white">{setup.entry}</span></span>
                  <span>SL: <span className="text-red-400">{setup.stopLoss}</span></span>
                  <span>TP1: <span className="text-green-400">{setup.tp1}</span></span>
                  {setup.tp2 && <span>TP2: <span className="text-green-400">{setup.tp2}</span></span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(setup.criteria).map(([key, val]) => (
                    <span key={key} className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border ${val ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-gray-700 bg-gray-900/50 border-gray-800'}`}>
                      {val ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  ))}
                </div>
                <div className="text-[10px] text-gray-600 italic mt-2">💡 "{setup.reason}"</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── ALL PAIRS TABLE ───────────────────────────────────────────── */}
      {scores.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.15)' }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(212,175,55,0.1)', background: 'rgba(0,0,0,0.4)' }}>
            <span className="font-black text-white tracking-wider text-sm">ALL PAIRS RANKED</span>
            <span className="text-xs font-mono text-gray-600">{scores.length} PAIRS · SORTED BY QUALITY</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-gray-600 uppercase tracking-widest text-[9px]" style={{ borderColor: 'rgba(212,175,55,0.08)' }}>
                  <th className="text-left px-4 py-2.5 font-bold">PAIR</th>
                  <th className="text-left px-3 py-2.5 font-bold">SCORE</th>
                  <th className="text-left px-3 py-2.5 font-bold">GRADE</th>
                  <th className="text-left px-3 py-2.5 font-bold">BIAS</th>
                  <th className="text-left px-3 py-2.5 font-bold">PROB</th>
                  <th className="text-left px-3 py-2.5 font-bold">R:R</th>
                  <th className="text-left px-3 py-2.5 font-bold">CONF</th>
                  <th className="text-left px-3 py-2.5 font-bold">ENTRY</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {scores.map((setup) => (
                  <>
                    <tr key={setup.pair} onClick={() => setExpandedPair(expandedPair === setup.pair ? null : setup.pair)}
                      className="border-b cursor-pointer transition-colors hover:bg-white/3" style={{ borderColor: 'rgba(212,175,55,0.04)' }}>
                      <td className="px-4 py-3 font-black text-white font-mono">{setup.pair}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 bg-gray-900 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${setup.score}%`, background: gradeColors[setup.grade], boxShadow: setup.grade === 'A+' ? `0 0 4px ${gradeColors[setup.grade]}` : 'none' }} />
                          </div>
                          <span className="text-gray-400 font-mono">{setup.score}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${getGradeBadgeClass(setup.grade)}`}>{setup.grade}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={setup.bias === 'Bullish' ? 'text-green-400 font-bold' : setup.bias === 'Bearish' ? 'text-red-400 font-bold' : 'text-gray-500'}>
                          {setup.bias === 'Bullish' ? '▲' : setup.bias === 'Bearish' ? '▼' : '—'} {setup.bias}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-400 font-mono">{setup.probability}%</td>
                      <td className="px-3 py-3 text-gray-400 font-mono">1:{setup.riskReward}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-0.5">
                          {Object.values(setup.criteria).map((v, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full ${v ? 'bg-green-500' : 'bg-gray-800'}`} style={{ boxShadow: v ? '0 0 3px #22c55e' : 'none' }} />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-gray-400 text-[10px]">{setup.entry}</td>
                      <td className="px-3 py-3">
                        <button onClick={e => { e.stopPropagation(); navigate('/alchemist') }} className="text-[#D4AF37] hover:text-yellow-400 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedPair === setup.pair && (
                      <tr key={`${setup.pair}-expanded`}>
                        <td colSpan={9} className="px-5 py-3 border-b" style={{ background: 'rgba(212,175,55,0.03)', borderColor: 'rgba(212,175,55,0.05)' }}>
                          <div className="text-[10px] text-gray-500 italic mb-2">💡 {setup.reason}</div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(setup.criteria).map(([key, val]) => (
                              <span key={key} className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded ${val ? 'text-green-400 bg-green-500/10' : 'text-gray-700 bg-gray-900'}`}>
                                {val ? '✅' : '❌'} {key.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scores.length === 0 && !isScanning && (
        <div className="rounded-2xl p-16 flex flex-col items-center justify-center" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.12)' }}>
          <div className="relative mb-6">
            <Crosshair className="w-16 h-16 text-gray-800" />
            <motion.div className="absolute inset-0 rounded-full border border-[rgba(212,175,55,0.2)]"
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
          </div>
          <p className="text-gray-500 text-sm font-bold uppercase tracking-wider">Weapon Forge Standing By</p>
          <p className="text-gray-700 text-xs mt-2 font-mono">Click ⚡ SCAN NOW to analyse all {SCAN_PAIRS.length} pairs with Alchemist AI</p>
        </div>
      )}

      {/* ── COMMS ARRAY ──────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.15)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Radio className="w-4 h-4 text-[#D4AF37]" />
          <span className="font-black text-sm text-white tracking-wider uppercase">Comms Array</span>
          <span className="ml-auto text-[9px] font-mono text-gray-700 uppercase tracking-widest">Auto-dispatch settings</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Auto-Send to Telegram', sublabel: telegramConfigured ? 'Bot configured' : '⚠ Configure bot in Settings', val: autoSendEnabled, set: setAutoSendEnabled },
            { label: 'Sound Alert on A+ Found', sublabel: 'Plays alert chime', val: soundAlertEnabled, set: setSoundAlertEnabled },
            { label: 'Browser Notification', sublabel: browserNotifEnabled ? 'Enabled' : 'Click to enable', val: browserNotifEnabled, set: requestNotifPermission },
          ].map(({ label, sublabel, val, set }) => (
            <div key={label} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Toggle on={val} onToggle={() => set((p: any) => !p)} />
              <div>
                <div className="text-xs text-white font-bold">{label}</div>
                <div className="text-[9px] text-gray-600 font-mono">{sublabel}</div>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <AlertTriangle className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-white font-bold mb-1">Min Grade to Auto-Send</div>
              <select value={minAutoGrade} onChange={e => setMinAutoGrade(e.target.value as 'A+' | 'A')}
                className="bg-black/60 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none w-full">
                <option value="A+">A+ only (strictest)</option>
                <option value="A">A and above</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
