import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Crosshair, Trash2, Bell, Volume2, Monitor, Zap, Plus, Shield, Radio, TrendingUp, TrendingDown } from 'lucide-react'
import { AlertService } from '@/services/AlertService'
import { useLivePrices } from '@/utils/priceEngine'

const PAIRS = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','XAGUSD','BTCUSD','EURJPY']

const MOCK_BASE: Record<string, number> = {
  XAUUSD: 3312.40, EURUSD: 1.0842, GBPUSD: 1.2674, USDJPY: 155.32,
  GBPJPY: 196.88, AUDUSD: 0.6412, USDCAD: 1.3654, USDCHF: 0.8921,
  NZDUSD: 0.5934, XAGUSD: 32.14, BTCUSD: 62400, EURJPY: 168.44,
}

type Condition = 'above' | 'below' | 'crosses_above' | 'crosses_below'

interface Alert {
  id: string; pair: string; price: number; condition: Condition
  sessionFilter: string; soundAlert: boolean; voiceAlert: boolean
  notificationAlert: boolean; screenFlash: boolean
  status: 'watching' | 'triggered'; createdAt: string
}

interface TriggeredLog { id: string; pair: string; price: number; time: string; message: string }

const CONDITION_LABELS: Record<Condition, string> = {
  above: 'Price >', below: 'Price <', crosses_above: 'Crosses ▲', crosses_below: 'Crosses ▼',
}
const CONDITION_ICONS: Record<Condition, React.ElementType> = {
  above: TrendingUp, below: TrendingDown, crosses_above: TrendingUp, crosses_below: TrendingDown,
}

function playAlertSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08)
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.16)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.24)
    gain.gain.setValueAtTime(0.5, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.7)
  } catch {}
}

function flashScreen() {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;border:8px solid #ff2222;'
  const style = document.createElement('style')
  style.textContent = '@keyframes sniper-flash{0%{opacity:1;border-color:#ff2222}50%{opacity:0.7;border-color:#ff8800}100%{opacity:0}}'
  document.head.appendChild(style)
  overlay.style.animation = 'sniper-flash 2s ease-out forwards'
  document.body.appendChild(overlay)
  setTimeout(() => { overlay.remove(); style.remove() }, 2000)
}

function priceDiff(target: number, current: number, pair: string): string {
  if (!current || !target) return ''
  const diff = target - current
  const isGold = pair === 'XAUUSD' || pair === 'BTCUSD' || pair === 'XAGUSD'
  const pips = isGold ? Math.abs(diff).toFixed(2) : (Math.abs(diff) * (pair.includes('JPY') ? 100 : 10000)).toFixed(1)
  return `${diff > 0 ? '▲' : '▼'} ${pips} ${isGold ? 'pts' : 'pips'} away`
}

export default function SniperAlerts() {
  const { prices: realPrices } = useLivePrices()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [triggered, setTriggered] = useState<TriggeredLog[]>([])
  const [eliminatedIds, setEliminatedIds] = useState<string[]>([])
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({ ...MOCK_BASE })
  const prevPrices = useRef<Record<string, number>>({ ...MOCK_BASE })

  // Form state
  const [pair, setPair] = useState('XAUUSD')
  const [condition, setCondition] = useState<Condition>('above')
  const [price, setPrice] = useState('')
  const [sessionFilter, setSessionFilter] = useState('any')
  const [soundAlert, setSoundAlert] = useState(true)
  const [voiceAlert, setVoiceAlert] = useState(true)
  const [notificationAlert, setNotificationAlert] = useState(true)
  const [screenFlash, setScreenFlash] = useState(true)
  const [flashPairs, setFlashPairs] = useState<Record<string, 'up'|'down'|null>>({})

  // Merge real prices
  useEffect(() => {
    if (Object.keys(realPrices).length > 0) {
      setCurrentPrices(prev => {
        const merged = { ...prev }
        PAIRS.forEach(p => { if (realPrices[p]) merged[p] = realPrices[p] })
        return merged
      })
    }
  }, [realPrices])

  // Check scanner import
  useEffect(() => {
    const raw = sessionStorage.getItem('sniper_setup')
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s.pair) setPair(s.pair)
        if (s.price) setPrice(String(s.price))
        if (s.condition) setCondition(s.condition)
        sessionStorage.removeItem('sniper_setup')
      } catch {}
    }
  }, [])

  // Simulate price movement
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentPrices(prev => {
        const next = { ...prev }
        const flashes: Record<string, 'up'|'down'|null> = {}
        Object.keys(next).forEach(p => {
          const change = (Math.random() - 0.5) * 0.002 * next[p]
          const prev_val = next[p]
          next[p] = parseFloat((next[p] + change).toFixed(p === 'XAUUSD' || p === 'BTCUSD' ? 2 : 4))
          if (change > 0) flashes[p] = 'up'
          else if (change < 0) flashes[p] = 'down'
        })
        setFlashPairs(flashes)
        setTimeout(() => setFlashPairs({}), 400)
        return next
      })
    }, 2000)
    return () => clearInterval(t)
  }, [])

  // Check alert conditions
  useEffect(() => {
    setAlerts(prev => prev.map(a => {
      if (a.status === 'triggered') return a
      const cur = currentPrices[a.pair]; const prv = prevPrices.current[a.pair]
      if (!cur) return a
      let hit = false
      if (a.condition === 'above' && cur > a.price) hit = true
      if (a.condition === 'below' && cur < a.price) hit = true
      if (a.condition === 'crosses_above' && prv && prv <= a.price && cur > a.price) hit = true
      if (a.condition === 'crosses_below' && prv && prv >= a.price && cur < a.price) hit = true
      if (hit) {
        const msg = `🎯 ${a.pair} ${CONDITION_LABELS[a.condition]} ${a.price} — Current: ${cur}`
        if (a.soundAlert) playAlertSound()
        if (a.voiceAlert) { const utt = new SpeechSynthesisUtterance(`Sniper alert! ${a.pair} target hit at ${cur}.`); window.speechSynthesis.speak(utt) }
        if (a.notificationAlert) AlertService.notify('🎯 Sniper Alert!', msg)
        if (a.screenFlash) flashScreen()
        setEliminatedIds(prev => [...prev, a.id])
        setTimeout(() => setEliminatedIds(prev => prev.filter(id => id !== a.id)), 3000)
        setTriggered(prev => [{ id: Date.now().toString(), pair: a.pair, price: cur, time: new Date().toLocaleTimeString(), message: msg }, ...prev].slice(0, 50))
        return { ...a, status: 'triggered' as const }
      }
      return a
    }))
    prevPrices.current = { ...currentPrices }
  }, [currentPrices])

  const createAlert = () => {
    if (!price || isNaN(Number(price))) return
    const a: Alert = { id: Date.now().toString(), pair, condition, price: Number(price), sessionFilter, soundAlert, voiceAlert, notificationAlert, screenFlash, status: 'watching', createdAt: new Date().toLocaleTimeString() }
    setAlerts(prev => [a, ...prev])
    setPrice('')
    AlertService.notify('✅ Target Locked', `${pair} ${CONDITION_LABELS[condition]} ${price}`)
  }

  const deleteAlert = (id: string) => setAlerts(prev => prev.filter(a => a.id !== id))
  const currentPrice = currentPrices[pair]
  const activeCount = alerts.filter(a => a.status === 'watching').length

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col gap-4">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden px-6 py-4" style={{ background: 'linear-gradient(135deg, #05050f, #0f0505)', border: '1px solid rgba(239,68,68,0.25)' }}>
        {/* Crosshair rings background */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
          <motion.svg width="100" height="100" animate={{ rotate: -360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}>
            <circle cx="50" cy="50" r="46" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 6" />
          </motion.svg>
          <motion.svg width="100" height="100" className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}>
            <circle cx="50" cy="50" r="30" fill="none" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="3 5" />
          </motion.svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-red-500/30" />
          </div>
        </div>
        {['top-0 left-0 border-t border-l','top-0 right-0 border-t border-r','bottom-0 left-0 border-b border-l','bottom-0 right-0 border-b border-r'].map((c,i) => (
          <div key={i} className={`absolute w-4 h-4 ${c} border-[rgba(239,68,68,0.4)]`} />
        ))}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)' }}>
              <Crosshair className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-[0.15em] uppercase text-red-400">SNIPER OPS CENTER</h1>
              <p className="text-[9px] text-gray-600 tracking-widest uppercase font-mono">Precision Entry Engine · Multi-Condition Alerts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${activeCount > 0 ? 'border-red-500/40 bg-red-500/10' : 'border-gray-700'}`}>
              <span className={`w-2 h-2 rounded-full ${activeCount > 0 ? 'bg-red-500 animate-pulse shadow-[0_0_6px_#ef4444]' : 'bg-gray-700'}`} />
              <span className={`text-xs font-black tracking-widest ${activeCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {activeCount} TARGET{activeCount !== 1 ? 'S' : ''} ARMED
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* ── LEFT: TARGET ACQUISITION ─────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-red-400" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Target Acquisition</span>
              <button onClick={() => {
                const raw = sessionStorage.getItem('sniper_setup')
                if (raw) try { const s = JSON.parse(raw); if (s.pair) setPair(s.pair); if (s.price) setPrice(String(s.price)); sessionStorage.removeItem('sniper_setup') } catch {}
              }} className="ml-auto text-[9px] text-[#D4AF37] hover:text-yellow-300 flex items-center gap-1 font-mono font-bold border border-[rgba(212,175,55,0.2)] px-2 py-0.5 rounded">
                <Target className="w-2.5 h-2.5" />IMPORT FROM SCANNER
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-1.5 block">Pair</label>
                <select value={pair} onChange={e => setPair(e.target.value)}
                  className="w-full bg-black/60 border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-2 text-white font-black font-mono appearance-none focus:outline-none focus:border-red-400">
                  {PAIRS.map(p => (
                    <option key={p} value={p}>{p} {currentPrices[p] ? `— ${currentPrices[p].toFixed(p === 'XAUUSD' || p === 'BTCUSD' ? 2 : 4)}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-1.5 block">Condition</label>
                <select value={condition} onChange={e => setCondition(e.target.value as Condition)}
                  className="w-full bg-black/60 border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-2 text-white appearance-none focus:outline-none focus:border-red-400">
                  {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-1.5 block">
                Price Level
                {currentPrice && price && !isNaN(Number(price)) && (
                  <span className="ml-2 text-[#D4AF37]">· {priceDiff(Number(price), currentPrice, pair)}</span>
                )}
              </label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                placeholder={`Current: ${currentPrice?.toFixed(pair === 'XAUUSD' || pair === 'BTCUSD' ? 2 : 4) || '—'}`}
                className="w-full bg-black/60 border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-2.5 text-white font-mono focus:outline-none focus:border-red-400" />
            </div>

            <div>
              <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-1.5 block">Session Filter</label>
              <div className="grid grid-cols-5 gap-1">
                {[{v:'any',l:'ANY'},{v:'london',l:'🇬🇧 LDN'},{v:'newyork',l:'🇺🇸 NY'},{v:'tokyo',l:'🇯🇵 TOK'},{v:'overlap',l:'⚡ OVL'}].map(s => (
                  <button key={s.v} onClick={() => setSessionFilter(s.v)}
                    className={`py-1.5 rounded-lg text-[9px] font-black border transition-colors ${sessionFilter === s.v ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'border-gray-800 text-gray-600 hover:border-gray-600'}`}>
                    {s.l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-1.5 block">Alert Channels</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '🔊 Sound', icon: Volume2, val: soundAlert, set: setSoundAlert },
                  { label: '🗣 Voice', icon: Bell, val: voiceAlert, set: setVoiceAlert },
                  { label: '🔔 Browser', icon: Monitor, val: notificationAlert, set: setNotificationAlert },
                  { label: '🚨 Flash', icon: Zap, val: screenFlash, set: setScreenFlash },
                ].map(({ label, icon: Icon, val, set }) => (
                  <button key={label} onClick={() => set(v => !v)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-bold text-xs transition-all ${val ? 'border-red-500/40 bg-red-500/10 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.15)]' : 'border-gray-800 text-gray-600 bg-gray-900/30'}`}>
                    <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${val ? 'border-red-400 bg-red-400' : 'border-gray-700'}`}>
                      {val && <span className="text-black text-[7px] font-black">✓</span>}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={createAlert}
              className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'linear-gradient(90deg, #dc2626, #ef4444)', boxShadow: '0 0 20px rgba(239,68,68,0.3)', color: 'white' }}>
              <Crosshair className="w-4 h-4" />⚡ LOCK TARGET
            </button>
          </div>

          {/* Live Prices HUD */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(239,68,68,0.1)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Live Price Matrix</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PAIRS.slice(0, 8).map(p => {
                const flash = flashPairs[p]
                return (
                  <motion.div key={p}
                    animate={flash ? { backgroundColor: flash === 'up' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' } : { backgroundColor: 'rgba(0,0,0,0.4)' }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-[rgba(255,255,255,0.03)] cursor-pointer hover:border-[rgba(212,175,55,0.2)]"
                    onClick={() => setPair(p)}>
                    <span className="text-[10px] font-black text-white font-mono">{p}</span>
                    <div className="flex items-center gap-1">
                      {flash === 'up' ? <TrendingUp className="w-2.5 h-2.5 text-green-400" /> : flash === 'down' ? <TrendingDown className="w-2.5 h-2.5 text-red-400" /> : null}
                      <span className={`text-[10px] font-mono ${flash === 'up' ? 'text-green-400' : flash === 'down' ? 'text-red-400' : 'text-[#D4AF37]'}`}>
                        {(currentPrices[p] || 0).toFixed(p === 'XAUUSD' || p === 'BTCUSD' ? 2 : 4)}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT: ACTIVE TARGETS + LOG ──────────────────────────── */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="rounded-xl p-4 flex flex-col" style={{ maxHeight: 320, background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Bell className="w-4 h-4 text-red-400" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Active Targets ({activeCount})</span>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {activeCount === 0 && (
                <div className="flex items-center justify-center py-6 text-gray-700">
                  <div className="text-center">
                    <Target className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs font-mono">No targets armed. Create one.</p>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {alerts.filter(a => a.status === 'watching').map(a => (
                  <motion.div key={a.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="relative p-3 rounded-xl border border-[rgba(239,68,68,0.25)] overflow-hidden"
                    style={{ background: 'rgba(239,68,68,0.04)' }}>
                    {/* Target eliminated overlay */}
                    <AnimatePresence>
                      {eliminatedIds.includes(a.id) && (
                        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                          className="absolute inset-0 flex items-center justify-center z-10 rounded-xl"
                          style={{ background: 'rgba(34,197,94,0.9)' }}>
                          <div className="text-center">
                            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.4 }}
                              className="text-4xl mb-1">✅</motion.div>
                            <p className="font-black text-white text-sm tracking-widest">TARGET ELIMINATED</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(255,0,0,0.7)] animate-pulse mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-sm font-mono">{a.pair}</span>
                          <span className="text-[9px] font-black text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded border border-red-500/25">ARMED</span>
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">
                          {CONDITION_LABELS[a.condition]} <span className="text-[#D4AF37]">{a.price}</span>
                          {currentPrices[a.pair] && (
                            <span className="ml-2 text-gray-700">{priceDiff(a.price, currentPrices[a.pair], a.pair)}</span>
                          )}
                        </div>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {a.soundAlert && <span className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-gray-600">🔊</span>}
                          {a.voiceAlert && <span className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-gray-600">🗣</span>}
                          {a.notificationAlert && <span className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-gray-600">🔔</span>}
                          {a.screenFlash && <span className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-gray-600">🚨</span>}
                          <span className="text-[8px] text-gray-700 font-mono">{a.createdAt}</span>
                        </div>
                      </div>
                      <button onClick={() => deleteAlert(a.id)} className="text-gray-700 hover:text-red-500 transition-colors shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-1 rounded-xl p-4 flex flex-col min-h-0" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(34,197,94,0.12)' }}>
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Monitor className="w-4 h-4 text-green-500" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Kill Confirmed Log</span>
              {triggered.length > 0 && <span className="ml-auto text-[9px] font-mono text-green-600">{triggered.length} KILLS</span>}
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {triggered.length === 0 && (
                <p className="text-xs text-gray-700 text-center py-4 font-mono">Awaiting first kill confirmation.</p>
              )}
              <AnimatePresence>
                {triggered.map(t => (
                  <motion.div key={t.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="p-3 rounded-xl border border-green-500/25 bg-green-500/5 flex items-start gap-2">
                    <span className="text-green-500 text-sm shrink-0">✅</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-white text-sm font-mono">{t.pair} @ {t.price}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{t.message}</div>
                      <div className="text-[9px] text-gray-700 mt-0.5 font-mono">{t.time}</div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
