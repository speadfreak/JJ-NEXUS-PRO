import { useState, useEffect, useRef, useCallback } from 'react'
import { Smartphone, Copy, RefreshCw, CheckCircle, Wifi, WifiOff, Zap, Volume2 } from 'lucide-react'
import { useCamera } from '@/context/CameraContext'

const LAST_SESSION_KEY = 'jj_last_phone_session'
const MAX_AUTO_RETRIES = 3

export default function PhoneCameraConnect() {
  const {
    phoneState, phoneSessionId, phoneInfo,
    createPhoneSession, connectPhoneCamera, disconnectPhone
  } = useCamera()

  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [phoneUrl, setPhoneUrl] = useState('')
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [lastSession, setLastSession] = useState<{ id: string; url: string; at: number } | null>(null)
  const initiated = useRef(false)
  const autoRetryCount = useRef(0)
  const autoRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load last session from localStorage ───────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_SESSION_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Date.now() - parsed.at < 24 * 60 * 60 * 1000) setLastSession(parsed)
        else localStorage.removeItem(LAST_SESSION_KEY)
      }
    } catch {}
  }, [])

  // ── On mount: restore existing session or start new one ───────────────────
  // CRITICAL: If user navigated away and came back, the CameraContext still
  // holds the live connection. Don't destroy it — just restore the QR display.
  useEffect(() => {
    if (initiated.current) return
    initiated.current = true

    if (phoneState === 'connected' || phoneState === 'waiting') {
      // Session is alive in context — restore the display without new session
      if (phoneSessionId) {
        const url = `${window.location.origin}/phone-camera.html?session=${phoneSessionId}`
        setPhoneUrl(url)
        generateQR(url, phoneSessionId)
      }
      return
    }

    // No active session — start fresh
    startSession()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-reconnect when connection drops (same session, no QR rescan) ────
  useEffect(() => {
    if (phoneState !== 'error') {
      autoRetryCount.current = 0
      if (autoRetryTimer.current) {
        clearTimeout(autoRetryTimer.current)
        autoRetryTimer.current = null
      }
      return
    }
    if (autoRetryCount.current >= MAX_AUTO_RETRIES) return
    if (!phoneSessionId) return

    autoRetryTimer.current = setTimeout(() => {
      autoRetryCount.current++
      console.log(`[PhoneCameraConnect] Auto-reconnect attempt ${autoRetryCount.current}/${MAX_AUTO_RETRIES} for session ${phoneSessionId}`)
      connectPhoneCamera(phoneSessionId)
    }, 2500)

    return () => {
      if (autoRetryTimer.current) clearTimeout(autoRetryTimer.current)
    }
  }, [phoneState, phoneSessionId, connectPhoneCamera])

  const generateQR = useCallback(async (url: string, _sessionId: string) => {
    try {
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(url, {
        width: 220,
        margin: 1,
        color: { dark: '#D4AF37', light: '#050505' }
      })
      setQrDataUrl(dataUrl)
    } catch {
      setQrDataUrl('')
    }
  }, [])

  const startSession = async () => {
    try {
      const sessionId = await createPhoneSession()
      const url = `${window.location.origin}/phone-camera.html?session=${sessionId}`
      setPhoneUrl(url)
      generateQR(url, sessionId)
      connectPhoneCamera(sessionId)
      const record = { id: sessionId, url, at: Date.now() }
      localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(record))
      setLastSession(record)
    } catch (e) {
      console.error('[PhoneCameraConnect] Failed to create session', e)
    }
  }

  const newSession = () => {
    initiated.current = false
    autoRetryCount.current = 0
    disconnectPhone()
    setTimeout(() => { initiated.current = false; startSession() }, 300)
  }

  // One-tap reconnect to last session (phone page stays open, just re-handshake)
  const quickReconnect = useCallback(() => {
    if (!lastSession) return
    autoRetryCount.current = 0
    connectPhoneCamera(lastSession.id)
    setPhoneUrl(lastSession.url)
    generateQR(lastSession.url, lastSession.id)
  }, [lastSession, connectPhoneCamera, generateQR])

  const copyUrl = async () => {
    await navigator.clipboard.writeText(phoneUrl).catch(() => {})
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2500)
  }

  const minutesAgo = lastSession ? Math.round((Date.now() - lastSession.at) / 60000) : 0

  const statusConfig = {
    idle: {
      color: '#555', bg: 'rgba(255,255,255,0.04)',
      icon: <WifiOff size={12} />, text: 'Setting up connection...'
    },
    waiting: {
      color: '#eab308', bg: 'rgba(234,179,8,0.08)',
      icon: <Wifi size={12} className="animate-pulse" />, text: 'Waiting for phone to open the link...'
    },
    connected: {
      color: '#22c55e', bg: 'rgba(22,163,74,0.08)',
      icon: <CheckCircle size={12} />,
      text: `Phone HD cam LIVE${phoneInfo ? ` · ${phoneInfo.width}×${phoneInfo.height} @ ${phoneInfo.fps}fps` : ''}`
    },
    error: {
      color: '#ef4444', bg: 'rgba(220,38,38,0.08)',
      icon: <WifiOff size={12} />,
      text: autoRetryCount.current < MAX_AUTO_RETRIES
        ? `Connection lost — auto-reconnecting (${autoRetryCount.current}/${MAX_AUTO_RETRIES})...`
        : 'Connection lost — tap Quick Reconnect or scan QR again'
    },
  }
  const status = statusConfig[phoneState]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 10,
        background: status.bg, border: `1px solid ${status.color}33`,
        color: status.color, fontSize: 12, fontWeight: 600
      }}>
        {status.icon}
        <span style={{ flex: 1 }}>{status.text}</span>
        {phoneState !== 'connected' && (
          <button onClick={newSession} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6, fontSize: 11,
            background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)',
            color: '#D4AF37', cursor: 'pointer', fontWeight: 700
          }}>
            <RefreshCw size={10} /> New QR
          </button>
        )}
      </div>

      {/* ── CONNECTED STATE ─────────────────────────────────────────────────── */}
      {phoneState === 'connected' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Live panel */}
          <div style={{
            background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)',
            borderRadius: 12, padding: '14px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Smartphone size={16} color="#22c55e" />
              <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 14 }}>📱 Phone Camera LIVE</span>
            </div>
            {phoneInfo && (
              <p style={{ color: '#666', fontSize: 12, fontFamily: 'monospace', marginBottom: 6 }}>
                {phoneInfo.width} × {phoneInfo.height} @ {phoneInfo.fps}fps HD
              </p>
            )}

            {/* AirPods + mic tip */}
            <div style={{
              background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)',
              borderRadius: 8, padding: '10px 12px', marginTop: 4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Volume2 size={12} color="#D4AF37" />
                <span style={{ color: '#D4AF37', fontWeight: 700, fontSize: 11 }}>🎧 AirPods Mic — Use Phone!</span>
              </div>
              <p style={{ color: '#777', fontSize: 11, lineHeight: 1.7 }}>
                Your phone is also capturing audio (including AirPods if connected to it).
                On the phone page, tap the <strong style={{ color: '#D4AF37' }}>🎤 Mic</strong> button to select AirPods as the audio source.
                The stream engine routes your phone's clean AirPods audio directly into RTMP.
              </p>
            </div>
          </div>

          <p style={{ color: '#555', fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>
            Keep the phone page open. If connection drops, it auto-reconnects.<br />
            Or tap <strong style={{ color: '#D4AF37' }}>Quick Reconnect</strong> below.
          </p>

          {/* Quick reconnect even when connected — for manual refresh */}
          {lastSession && (
            <button onClick={quickReconnect} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.2)',
              color: '#888', cursor: 'pointer', fontSize: 11, width: '100%', textAlign: 'left'
            }}>
              <Zap size={12} color="#555" />
              <span>Tap to re-handshake same session (no QR rescan)</span>
            </button>
          )}

          <button onClick={disconnectPhone} style={{
            padding: '10px', background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10,
            color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 700
          }}>
            Disconnect Phone Camera
          </button>
        </div>
      )}

      {/* ── WAITING / ERROR / IDLE STATE ────────────────────────────────────── */}
      {phoneState !== 'connected' && (
        <>
          {/* ⚡ Quick Reconnect — most prominent, one tap if phone page is still open */}
          {lastSession && (
            <button onClick={quickReconnect} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(212,175,55,0.14), rgba(212,175,55,0.07))',
              border: '1.5px solid rgba(212,175,55,0.5)',
              color: '#D4AF37', cursor: 'pointer', width: '100%', textAlign: 'left',
              boxShadow: '0 0 16px rgba(212,175,55,0.12)'
            }}>
              <Zap size={18} color="#D4AF37" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>⚡ Quick Reconnect — One Tap</div>
                <div style={{ color: '#888', fontSize: 10, fontWeight: 500 }}>
                  Session {lastSession.id} · {minutesAgo < 1 ? 'just now' : `${minutesAgo}m ago`} · phone page stays open — no QR rescan
                </div>
              </div>
              <RefreshCw size={14} />
            </button>
          )}

          {/* QR Code */}
          <div style={{
            background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.18)',
            borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12
          }}>
            <p style={{ color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', alignSelf: 'flex-start' }}>
              📱 Scan QR Code on Your Phone
            </p>

            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" style={{ width: 180, height: 180, borderRadius: 10, imageRendering: 'pixelated' }} />
            ) : (
              <div style={{ width: 180, height: 180, background: '#0a0a0a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 12 }}>
                Generating...
              </div>
            )}

            {/* Session ID — big and easy to type */}
            {phoneSessionId && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#444', fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>OR TYPE THIS CODE ON YOUR PHONE:</p>
                <span style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: 8 }}>
                  {phoneSessionId}
                </span>
              </div>
            )}

            {/* Copy URL */}
            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
              <input readOnly value={phoneUrl}
                style={{ flex: 1, background: '#080808', border: '1px solid #1a1a1a', borderRadius: 8, padding: '8px 10px', color: '#666', fontSize: 10, fontFamily: 'monospace', outline: 'none' }} />
              <button onClick={copyUrl} style={{
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: copiedUrl ? 'rgba(22,163,74,0.2)' : 'rgba(212,175,55,0.12)',
                border: `1px solid ${copiedUrl ? '#22c55e' : 'rgba(212,175,55,0.35)'}`,
                color: copiedUrl ? '#22c55e' : '#D4AF37',
                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
              }}>
                <Copy size={10} /> {copiedUrl ? '✓ Copied' : 'Copy Link'}
              </button>
            </div>
          </div>

          {/* AirPods mic guide */}
          <div style={{
            background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)',
            borderRadius: 10, padding: '12px 14px'
          }}>
            <p style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>🎧 AirPods Mic via Phone — Best Quality!</p>
            {[
              '1. Connect AirPods to your iPhone/Android (Bluetooth settings)',
              '2. Open the QR link on your phone — tap Rear HD Cam',
              '3. On the phone page, tap 🎤 Mic and select your AirPods',
              '4. AirPods mic audio streams cleanly to your Chromebook',
              '5. No Chromebook Bluetooth needed — phone handles it perfectly!'
            ].map((s, i) => (
              <p key={i} style={{ color: '#666', fontSize: 11, lineHeight: 1.8 }}>{s}</p>
            ))}
          </div>

          {/* How it works */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ color: '#444', fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>HOW RECONNECT WORKS</p>
            <p style={{ color: '#444', fontSize: 11, lineHeight: 1.8 }}>
              If connection drops: your phone auto-reconnects on the same session ID. Or tap <strong style={{ color: '#D4AF37' }}>⚡ Quick Reconnect</strong> above — no QR rescan, instant re-handshake.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
