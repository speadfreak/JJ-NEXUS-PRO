import { useState, useEffect } from 'react'
import { Bell, Play, Volume2, ToggleLeft, ToggleRight } from 'lucide-react'
import { streamAlertService, AlertConfig, DEFAULT_ALERT_CONFIGS } from '@/services/StreamAlertService'

const ALERT_LABELS: Record<string, string> = {
  follow: '❤️ Follow',
  subscribe: '🌟 Subscribe',
  donate: '💰 Donate',
  gift: '🎁 Gift',
  raid: '⚔️ Raid',
  setup_found: '🎯 A+ Setup Found',
  price_alert: '🚨 Price Alert',
  custom: '🔔 Custom',
}

const MANUAL_TRIGGERS = [
  { type: 'follow' as const, key: 'f', label: 'Follow', username: 'New Follower' },
  { type: 'subscribe' as const, key: 's', label: 'Subscribe', username: 'New Subscriber' },
  { type: 'donate' as const, key: 'd', label: 'Donate', username: 'Donor', amount: 10, currency: '$' },
  { type: 'gift' as const, key: 'g', label: 'Gift', username: 'Gift Sender' },
  { type: 'raid' as const, key: 'r', label: 'Raid', username: 'Raider', amount: 50 },
]

export default function StreamAlertsSettings() {
  const [configs, setConfigs] = useState<AlertConfig[]>(() => streamAlertService.loadConfigs())
  const [manualUsername, setManualUsername] = useState('')
  const [manualType, setManualType] = useState<string>('follow')
  const [manualAmount, setManualAmount] = useState('')
  const [manualMsg, setManualMsg] = useState('')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const t = MANUAL_TRIGGERS.find(t => t.key === e.key.toLowerCase())
      if (t) {
        streamAlertService.triggerAlert(t.type, {
          username: manualUsername || t.username,
          amount: t.amount,
          currency: t.currency
        })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [manualUsername])

  const updateConfig = (type: string, updates: Partial<AlertConfig>) => {
    const updated = configs.map(c => c.type === type ? { ...c, ...updates } : c)
    setConfigs(updated)
    streamAlertService.saveConfigs(updated)
  }

  const testAlert = (type: string) => {
    const t = MANUAL_TRIGGERS.find(t => t.type === type)
    streamAlertService.triggerAlert(type as any, {
      username: t?.username || 'TestUser',
      amount: t?.amount,
      currency: t?.currency
    })
  }

  const testAll = () => {
    MANUAL_TRIGGERS.forEach((t, i) => {
      setTimeout(() => {
        streamAlertService.triggerAlert(t.type, { username: t.username, amount: t.amount, currency: t.currency })
      }, i * 3000)
    })
  }

  const fireManual = () => {
    streamAlertService.triggerAlert(manualType as any, {
      username: manualUsername || 'Anonymous',
      amount: manualAmount ? parseFloat(manualAmount) : undefined,
      currency: manualAmount ? '$' : undefined,
      message: manualMsg || undefined
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[var(--gold)]" />
          <span className="font-bold text-sm text-white">STREAM ALERT SOUNDS</span>
        </div>
        <button onClick={testAll}
          className="text-xs px-2.5 py-1 rounded border border-[rgba(212,175,55,0.3)] text-[var(--gold)] hover:bg-[rgba(212,175,55,0.1)] transition-colors">
          Test All Alerts
        </button>
      </div>

      <div className="space-y-2">
        {configs.filter(c => ALERT_LABELS[c.type]).map(config => (
          <div key={config.type} className="border border-[rgba(212,175,55,0.15)] rounded-lg bg-black/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <button onClick={() => updateConfig(config.type, { enabled: !config.enabled })}
                  className="text-[var(--gold)] hover:opacity-80 transition-opacity">
                  {config.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5 text-gray-600" />}
                </button>
                <span className={`text-xs font-bold ${config.enabled ? 'text-white' : 'text-gray-600'}`}>
                  {ALERT_LABELS[config.type]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600">{config.overlayDuration}s</span>
                <button onClick={() => testAlert(config.type)}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white transition-colors">
                  <Play className="w-2.5 h-2.5" /> Test
                </button>
              </div>
            </div>

            {config.enabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3 h-3 text-gray-500" />
                  <input type="range" min="0" max="1" step="0.1" value={config.volume}
                    onChange={e => updateConfig(config.type, { volume: parseFloat(e.target.value) })}
                    className="flex-1 h-1 accent-[var(--gold)]" />
                  <span className="text-[10px] text-gray-500 w-8">{Math.round(config.volume * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-12 shrink-0">Overlay:</span>
                  <input value={config.overlayText} onChange={e => updateConfig(config.type, { overlayText: e.target.value })}
                    className="flex-1 bg-black border border-gray-700 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-[var(--gold)]" />
                  <div className="w-4 h-4 rounded-full border border-gray-600 cursor-pointer shrink-0"
                    style={{ backgroundColor: config.overlayColor }}
                    onClick={() => {
                      const colors = ['#E91E8C', '#9B59B6', '#D4AF37', '#E74C3C', '#E67E22', '#16a34a', '#3b82f6']
                      const idx = colors.indexOf(config.overlayColor)
                      updateConfig(config.type, { overlayColor: colors[(idx + 1) % colors.length] })
                    }} />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateConfig(config.type, { ttsEnabled: !config.ttsEnabled })}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${config.ttsEnabled ? 'border-[rgba(212,175,55,0.3)] text-[var(--gold)] bg-[rgba(212,175,55,0.1)]' : 'border-gray-700 text-gray-600'}`}>
                    TTS {config.ttsEnabled ? 'ON' : 'OFF'}
                  </button>
                  {config.ttsEnabled && (
                    <input value={config.ttsText} onChange={e => updateConfig(config.type, { ttsText: e.target.value })}
                      placeholder="TTS text ({username}, {amount} supported)"
                      className="flex-1 bg-black border border-gray-700 rounded px-2 py-1 text-[10px] text-white focus:outline-none" />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Manual Trigger */}
      <div className="border border-[rgba(212,175,55,0.2)] rounded-lg bg-black/20 p-3">
        <span className="text-xs font-bold text-white block mb-3">🔔 MANUAL TRIGGER</span>
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {MANUAL_TRIGGERS.map(t => (
            <button key={t.type} onClick={() => streamAlertService.triggerAlert(t.type, { username: 'Test', amount: t.amount, currency: t.currency })}
              className="text-[10px] py-1.5 rounded border border-gray-700 text-gray-400 hover:border-[rgba(212,175,55,0.4)] hover:text-[var(--gold)] transition-colors flex flex-col items-center gap-0.5">
              <span>{ALERT_LABELS[t.type].split(' ')[0]}</span>
              <span>Alt+{t.key.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
          <input value={manualUsername} onChange={e => setManualUsername(e.target.value)}
            placeholder="Username"
            className="bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none" />
          <select value={manualType} onChange={e => setManualType(e.target.value)}
            className="bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none">
            {MANUAL_TRIGGERS.map(t => <option key={t.type} value={t.type}>{ALERT_LABELS[t.type]}</option>)}
          </select>
          <input value={manualAmount} onChange={e => setManualAmount(e.target.value)}
            placeholder="Amount"
            className="bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none w-20" />
          <button onClick={fireManual}
            className="bg-[var(--gold)] text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-yellow-400 transition-colors flex items-center gap-1">
            <Bell className="w-3 h-3" /> Fire
          </button>
        </div>
      </div>
    </div>
  )
}
