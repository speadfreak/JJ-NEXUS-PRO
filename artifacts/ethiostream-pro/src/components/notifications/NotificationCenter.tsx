import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, Volume2, CheckCheck, Trash2, Zap, Radio, TrendingUp } from 'lucide-react'
import { AlertService, JJNotification } from '@/services/AlertService'

const TYPE_COLORS: Record<string, string> = {
  signal:   'border-l-[var(--gold)] bg-[rgba(212,175,55,0.04)]',
  alert:    'border-l-red-500 bg-red-500/[0.04]',
  calendar: 'border-l-blue-500 bg-blue-500/[0.04]',
  info:     'border-l-gray-700 bg-white/[0.015]',
}

const TYPE_DOT: Record<string, string> = {
  signal:   'bg-[var(--gold)]',
  alert:    'bg-red-400',
  calendar: 'bg-blue-400',
  info:     'bg-gray-500',
}

const TYPE_ICONS: Record<string, string> = {
  signal: '🎯', alert: '🚨', calendar: '📅', info: '💬',
}

const TYPE_LABELS: Record<string, string> = {
  signal: 'SIGNAL', alert: 'ALERT', calendar: 'EVENT', info: 'INFO',
}

function formatTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString()
}

// ── Toast notifications (bottom-right corner) ──────────────────────────────
export function NotificationToasts() {
  const [toasts, setToasts] = useState<(JJNotification & { dying?: boolean })[]>([])

  useEffect(() => {
    const unsub = AlertService.onNotification((n) => {
      setToasts(prev => [...prev.slice(-3), { ...n }])
      setTimeout(() => {
        setToasts(prev => prev.map(t => t.id === n.id ? { ...t, dying: true } : t))
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== n.id)), 350)
      }, 4500)
    })
    return unsub
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 320 }}>
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 60, scale: 0.92 }}
            animate={{ opacity: toast.dying ? 0 : 1, x: toast.dying ? 60 : 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.92 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`pointer-events-auto border-l-2 rounded-xl p-3.5 shadow-2xl backdrop-blur-xl ${TYPE_COLORS[toast.type ?? 'info'] ?? TYPE_COLORS.info}`}
            style={{
              background: 'rgba(6,6,6,0.95)',
              border: '1px solid rgba(212,175,55,0.18)',
              borderLeftWidth: 3,
              boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            }}>
            <div className="flex items-start gap-2.5">
              <span className="text-base mt-0.5 shrink-0">{TYPE_ICONS[toast.type ?? 'info'] ?? '💬'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded"
                    style={{
                      background: toast.type === 'signal' ? 'rgba(212,175,55,0.12)' : toast.type === 'alert' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                      color: toast.type === 'signal' ? '#D4AF37' : toast.type === 'alert' ? '#f87171' : '#666',
                    }}>
                    {TYPE_LABELS[toast.type ?? 'info'] ?? 'INFO'}
                  </span>
                </div>
                <p className="text-sm font-bold text-white leading-tight">{toast.title}</p>
                {toast.body && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{toast.body}</p>}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}

// ── Main Notification Center (bell icon + dropdown) ─────────────────────────
export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<JJNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [filter, setFilter] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  const add = useCallback((n: JJNotification) => {
    setNotifications(prev => [n, ...prev].slice(0, 50))
    setUnread(u => u + 1)
  }, [])

  useEffect(() => {
    const unsub = AlertService.onNotification(add)
    return unsub
  }, [add])

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setOpen(o => {
      if (!o) setUnread(0)
      return !o
    })
  }

  const clearAll = () => { setNotifications([]); setUnread(0) }
  const markAllRead = () => setUnread(0)
  const dismiss = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id))

  const filtered = filter ? notifications.filter(n => n.type === filter) : notifications

  if (typeof document === 'undefined') return null

  return (
    <>
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="relative p-2 rounded-lg transition-all"
        title="Intelligence Center"
        style={{
          background: open ? 'rgba(212,175,55,0.08)' : 'transparent',
          border: open ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
          color: open ? '#D4AF37' : '#6b7280',
        }}>
        <Bell className="w-5 h-5" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] text-white text-[9px] font-black rounded-full flex items-center justify-center px-1"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }}>
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dropRef}
              key="notif-dropdown"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="fixed z-[9996] overflow-hidden"
              style={{
                top: pos.top, right: pos.right, width: 360,
                background: 'rgba(4,4,4,0.97)',
                border: '1px solid rgba(212,175,55,0.25)',
                borderRadius: 16,
                boxShadow: '0 16px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,175,55,0.05)',
                backdropFilter: 'blur(24px)',
              }}>

              {/* Glow accent at top */}
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)' }} />

              {/* Header */}
              <div className="px-4 py-3.5 border-b" style={{ background: 'rgba(0,0,0,0.6)', borderColor: 'rgba(212,175,55,0.1)' }}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}>
                      <Zap className="w-3.5 h-3.5 text-[#D4AF37]" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-white tracking-wider">INTELLIGENCE CENTER</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Radio className="w-2 h-2 text-green-400" />
                        <span className="text-[8px] text-green-500 font-bold tracking-widest">LIVE</span>
                        {notifications.length > 0 && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold ml-1"
                            style={{ background: 'rgba(212,175,55,0.12)', color: '#D4AF37' }}>
                            {notifications.length} events
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {notifications.length > 0 && (
                      <>
                        <button onClick={markAllRead} title="Mark all read"
                          className="p-1.5 text-gray-700 hover:text-green-400 transition-colors rounded-lg hover:bg-white/5">
                          <CheckCheck className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={clearAll} title="Clear all"
                          className="p-1.5 text-gray-700 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button onClick={() => setOpen(false)}
                      className="p-1.5 text-gray-700 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1">
                  {[null, 'signal', 'alert', 'calendar', 'info'].map(f => (
                    <button key={f ?? 'all'} onClick={() => setFilter(f)}
                      className="px-2 py-0.5 rounded-md text-[9px] font-bold transition-all"
                      style={filter === f
                        ? { background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.25)' }
                        : { color: '#444', border: '1px solid transparent' }}>
                      {f === null ? 'ALL' : TYPE_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notification list */}
              <div className="max-h-[360px] overflow-y-auto">
                <AnimatePresence mode="popLayout">
                  {filtered.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center py-14 text-gray-700">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                        style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.08)' }}>
                        <Bell className="w-7 h-7 opacity-20" style={{ color: '#D4AF37' }} />
                      </div>
                      <p className="text-sm font-bold text-gray-600">All clear, trader</p>
                      <p className="text-xs text-gray-800 mt-1.5 text-center leading-relaxed max-w-[200px]">
                        Signals, alerts and events will appear here in real-time
                      </p>
                      <div className="flex items-center gap-1.5 mt-4 text-[9px] text-gray-800">
                        <TrendingUp className="w-3 h-3" />
                        Monitoring markets 24/5
                      </div>
                    </motion.div>
                  ) : (
                    filtered.map(n => (
                      <motion.div
                        key={n.id}
                        layout
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 24, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`group flex gap-3 px-4 py-3 border-b border-l-2 transition-all hover:bg-white/[0.025] ${TYPE_COLORS[n.type ?? 'info'] ?? TYPE_COLORS.info}`}
                        style={{ borderBottomColor: 'rgba(255,255,255,0.03)' }}>
                        <span className="text-base mt-0.5 shrink-0">{TYPE_ICONS[n.type ?? 'info'] ?? '💬'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded"
                              style={{
                                background: n.type === 'signal' ? 'rgba(212,175,55,0.1)' : n.type === 'alert' ? 'rgba(239,68,68,0.1)' : n.type === 'calendar' ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.04)',
                                color: n.type === 'signal' ? '#D4AF37' : n.type === 'alert' ? '#f87171' : n.type === 'calendar' ? '#60a5fa' : '#555',
                              }}>
                              {TYPE_LABELS[n.type ?? 'info'] ?? 'INFO'}
                            </span>
                            <span className="text-[9px] text-gray-700 ml-auto">{formatTime(n.timestamp)}</span>
                          </div>
                          <p className="text-sm font-bold text-white leading-snug">{n.title}</p>
                          {n.body && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>}
                        </div>
                        <button onClick={() => dismiss(n.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-700 hover:text-red-400 transition-all shrink-0 mt-1 rounded">
                          <X className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t flex items-center justify-between"
                style={{ borderColor: 'rgba(212,175,55,0.08)', background: 'rgba(0,0,0,0.4)' }}>
                <button onClick={() => AlertService.requestPermission()}
                  className="text-xs text-gray-700 hover:text-[#D4AF37] transition-colors flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3" /> Enable desktop alerts
                </button>
                <div className="flex items-center gap-1.5 text-[9px] text-gray-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-pulse" />
                  Real-time · Auto-clears
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
