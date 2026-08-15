import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Plus, Trash2, CheckCircle, AlertTriangle, Clock, Volume2 } from 'lucide-react'

const PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NAS100', 'US30']

type AlertTrigger = 'price_above' | 'price_below' | 'price_touch' | 'ob_touch' | 'session_open'
type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

interface Alert {
  id: string
  pair: string
  trigger: AlertTrigger
  triggerValue: string
  label: string
  notes: string
  priority: Priority
  sound: boolean
  tts: boolean
  notification: boolean
  active: boolean
  triggered: boolean
  triggeredAt?: string
  triggeredPrice?: number
  createdAt: string
}

function getPairPrice(pair: string): number {
  try { const s = localStorage.getItem('jjnexus_prices'); if (s) { const p = JSON.parse(s); if (p[pair]) return p[pair] } } catch {}
  const d: Record<string, number> = { XAUUSD: 4725, EURUSD: 1.0845, GBPUSD: 1.2634, USDJPY: 149.5, AUDUSD: 0.6421, USDCAD: 1.3612, NAS100: 19850, US30: 39420 }
  return d[pair] || 1.0
}

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880; osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.start(); osc.stop(ctx.currentTime + 0.8)
  } catch {}
}

function speakText(text: string) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.1; u.pitch = 1
    window.speechSynthesis.speak(u)
  }
}

const priorityColors: Record<Priority, string> = {
  Critical: 'text-red-400 border-red-500/40 bg-red-500/10',
  High: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  Medium: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  Low: 'text-gray-400 border-gray-500/40 bg-gray-500/10',
}
const priorityDot: Record<Priority, string> = {
  Critical: 'bg-red-500', High: 'bg-orange-500', Medium: 'bg-yellow-500', Low: 'bg-gray-500',
}
const triggerLabels: Record<AlertTrigger, string> = {
  price_above: 'Price Above', price_below: 'Price Below',
  price_touch: 'Price Touch', ob_touch: 'OB Zone Touch', session_open: 'Session Open',
}

const QUICK_ALERTS = [
  { label: 'XAUUSD SSL Sweep', pair: 'XAUUSD', trigger: 'price_below' as AlertTrigger, notes: 'SSL sweep — watch for bullish CHoCH to enter long' },
  { label: 'London Kill Zone', pair: 'EURUSD', trigger: 'session_open' as AlertTrigger, notes: 'London open — watch for Asian range sweep (Judas Swing)' },
  { label: 'NY Kill Zone', pair: 'EURUSD', trigger: 'session_open' as AlertTrigger, notes: 'NY open — watch for London high/low sweep then reversal' },
]

export default function AlertCommandCenter() {
  const [alerts, setAlerts] = useState<Alert[]>(() => {
    try { return JSON.parse(localStorage.getItem('jjnexus_alerts') || '[]') } catch { return [] }
  })
  const [form, setForm] = useState({ pair: 'XAUUSD', trigger: 'price_below' as AlertTrigger, value: '', label: '', notes: '', priority: 'High' as Priority, sound: true, tts: true, notification: true })
  const [tab, setTab] = useState<'active' | 'triggered'>('active')
  const monitorRef = useRef<NodeJS.Timeout | null>(null)

  const save = (a: Alert[]) => { setAlerts(a); localStorage.setItem('jjnexus_alerts', JSON.stringify(a)) }

  const addAlert = () => {
    if (!form.value && form.trigger !== 'session_open') return
    const price = getPairPrice(form.pair)
    const defaultValue = form.trigger === 'session_open' ? '7' : price.toFixed(price > 100 ? 2 : 5)
    const newAlert: Alert = {
      id: Date.now().toString(), pair: form.pair, trigger: form.trigger,
      triggerValue: form.value || defaultValue,
      label: form.label || `${form.pair} ${triggerLabels[form.trigger]}`,
      notes: form.notes, priority: form.priority,
      sound: form.sound, tts: form.tts, notification: form.notification,
      active: true, triggered: false, createdAt: new Date().toISOString()
    }
    save([newAlert, ...alerts])
    setForm(f => ({ ...f, value: '', label: '', notes: '' }))
  }

  const deleteAlert = (id: string) => save(alerts.filter(a => a.id !== id))
  const toggleAlert = (id: string) => save(alerts.map(a => a.id === id ? { ...a, active: !a.active } : a))

  const triggerAlert = (alert: Alert, price: number) => {
    if (alert.sound) playBeep()
    if (alert.tts) speakText(`Alert: ${alert.pair} ${alert.label}. Price: ${price.toFixed(2)}`)
    if (alert.notification && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`🚨 ${alert.pair} Alert: ${alert.label}`, { body: `Price: ${price.toFixed(2)} | ${alert.notes}` })
    }
    save(alerts.map(a => a.id === alert.id ? { ...a, triggered: true, active: false, triggeredAt: new Date().toISOString(), triggeredPrice: price } : a))
  }

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    monitorRef.current = setInterval(() => {
      setAlerts(current => {
        let updated = false
        const newAlerts = current.map(alert => {
          if (!alert.active || alert.triggered) return alert
          const price = getPairPrice(alert.pair)
          if (!price) return alert
          let should = false
          const val = parseFloat(alert.triggerValue)
          if (alert.trigger === 'price_above') should = price >= val
          else if (alert.trigger === 'price_below') should = price <= val
          else if (alert.trigger === 'price_touch') should = Math.abs(price - val) <= price * 0.0003
          else if (alert.trigger === 'ob_touch') {
            const [lo, hi] = alert.triggerValue.split('-').map(Number)
            should = price >= lo && price <= hi
          } else if (alert.trigger === 'session_open') {
            const utcH = new Date().getUTCHours()
            should = utcH === val && new Date().getUTCMinutes() < 5
          }
          if (should) {
            updated = true
            if (alert.sound) playBeep()
            if (alert.tts) speakText(`Alert: ${alert.pair} ${alert.label}`)
            if (alert.notification && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(`🚨 ${alert.pair}: ${alert.label}`, { body: `Price: ${price.toFixed(2)}` })
            }
            return { ...alert, triggered: true, active: false, triggeredAt: new Date().toISOString(), triggeredPrice: price }
          }
          return alert
        })
        if (updated) {
          localStorage.setItem('jjnexus_alerts', JSON.stringify(newAlerts))
          return newAlerts
        }
        return current
      })
    }, 5000)
    return () => { if (monitorRef.current) clearInterval(monitorRef.current) }
  }, [])

  const activeAlerts = alerts.filter(a => a.active && !a.triggered)
  const triggeredAlerts = alerts.filter(a => a.triggered)
  const inputCls = "w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#D4AF37]/50 placeholder:text-gray-600"

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <Bell className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Alert Command Center</h1>
            <p className="text-xs text-gray-500">Smart price alerts with sound, TTS, and browser notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-emerald-400 font-bold">{activeAlerts.length} active</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-400">{triggeredAlerts.length} triggered</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Create Alert */}
        <div className="bg-[#111] border border-white/5 rounded-xl p-4 space-y-3">
          <h2 className="font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4" /> Create New Alert</h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Pair</label>
              <select value={form.pair} onChange={e => setForm(f => ({ ...f, pair: e.target.value }))} className={inputCls}>
                {PAIRS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Alert Type</label>
              <select value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value as AlertTrigger }))} className={inputCls}>
                {Object.entries(triggerLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {form.trigger === 'ob_touch' ? 'Zone (low-high)' : form.trigger === 'session_open' ? 'UTC Hour' : 'Price'}
              </label>
              <input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                className={inputCls} placeholder={form.trigger === 'session_open' ? '7 (London open)' : form.trigger === 'ob_touch' ? '4700-4715' : getPairPrice(form.pair).toFixed(form.pair.includes('JPY') || form.pair === 'NAS100' ? 2 : 4)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))} className={inputCls}>
                {['Critical', 'High', 'Medium', 'Low'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Label</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className={inputCls} placeholder="e.g. SSL level sweep" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} placeholder="e.g. Watch for bullish CHoCH after sweep" />
          </div>
          <div className="flex gap-4">
            {[
              { key: 'sound', icon: <Volume2 className="w-3.5 h-3.5" />, label: 'Sound' },
              { key: 'tts', icon: <Bell className="w-3.5 h-3.5" />, label: 'Voice' },
              { key: 'notification', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Notif' },
            ].map(({ key, icon, label }) => (
              <button key={key} onClick={() => setForm(f => ({ ...f, [key]: !(f as any)[key] }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${(form as any)[key] ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-[#1a1a1a] border-white/10 text-gray-500'}`}>
                {icon} {label}
              </button>
            ))}
          </div>
          <button onClick={addAlert} className="w-full py-2.5 rounded-lg bg-[#D4AF37] text-black font-bold text-sm hover:bg-[#B8960C] transition-all">
            + Create Alert
          </button>

          {/* Quick Alerts */}
          <div className="border-t border-white/5 pt-3 space-y-2">
            <div className="text-xs text-gray-500 font-medium">Quick Alerts</div>
            {QUICK_ALERTS.map((qa, i) => (
              <button key={i} onClick={() => {
                const price = getPairPrice(qa.pair)
                const val = qa.trigger === 'session_open' ? '7' : (price * 0.995).toFixed(2)
                const a: Alert = { id: Date.now().toString(), pair: qa.pair, trigger: qa.trigger, triggerValue: val, label: qa.label, notes: qa.notes, priority: 'High', sound: true, tts: true, notification: true, active: true, triggered: false, createdAt: new Date().toISOString() }
                save([a, ...alerts])
              }} className="w-full text-left px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/5 hover:border-[#D4AF37]/30 text-xs text-gray-300 transition-all">
                <span className="text-[#D4AF37]">+</span> {qa.label}
              </button>
            ))}
          </div>
        </div>

        {/* Alert List */}
        <div className="bg-[#111] border border-white/5 rounded-xl p-4 space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setTab('active')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'active' ? 'bg-[#D4AF37] text-black' : 'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              Active ({activeAlerts.length})
            </button>
            <button onClick={() => setTab('triggered')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'triggered' ? 'bg-[#D4AF37] text-black' : 'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              Triggered ({triggeredAlerts.length})
            </button>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {(tab === 'active' ? activeAlerts : triggeredAlerts).length === 0 && (
              <div className="text-center py-12 text-gray-600">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No {tab} alerts</p>
              </div>
            )}
            <AnimatePresence>
              {(tab === 'active' ? activeAlerts : triggeredAlerts).map(alert => (
                <motion.div key={alert.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}
                  className={`border rounded-xl p-3 space-y-2 ${priorityColors[alert.priority]}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[alert.priority]} ${alert.active ? 'animate-pulse' : ''}`} />
                      <div>
                        <div className="text-white font-semibold text-sm">{alert.pair} — {triggerLabels[alert.trigger]}</div>
                        <div className="text-xs opacity-70">{alert.label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {tab === 'active' && <button onClick={() => toggleAlert(alert.id)} className="text-xs px-2 py-0.5 rounded border border-current opacity-60 hover:opacity-100">Pause</button>}
                      <button onClick={() => deleteAlert(alert.id)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span>Value: <span className="text-white font-mono">{alert.triggerValue}</span></span>
                    <span>{alert.sound && '🔊'}{alert.tts && '🗣️'}{alert.notification && '🔔'}</span>
                    {alert.triggered && alert.triggeredPrice && (
                      <span className="flex items-center gap-1 text-emerald-400"><CheckCircle className="w-3 h-3" /> Hit @ {alert.triggeredPrice.toFixed(2)}</span>
                    )}
                  </div>
                  {alert.notes && <p className="text-xs opacity-60 truncate">{alert.notes}</p>}
                  {alert.triggered && alert.triggeredAt && (
                    <div className="flex items-center gap-1 text-xs opacity-60"><Clock className="w-3 h-3" />{new Date(alert.triggeredAt).toLocaleTimeString()}</div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
