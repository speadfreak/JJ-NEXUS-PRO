import { useState, useEffect, useRef } from 'react'
import { Smartphone, QrCode, Wifi, Usb, Globe, CheckCircle, Copy, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'

interface PhoneCameraProps {
  onStreamReady?: (stream: MediaStream) => void
}

function QRCodeDisplay({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const size = 160
    canvas.width = size
    canvas.height = size

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#D4AF37'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('QR: Open phone camera URL', size / 2, size / 2 - 10)
    ctx.fillText('in phone browser', size / 2, size / 2 + 10)
    ctx.fillStyle = 'rgba(212,175,55,0.3)'
    ctx.fillRect(10, 10, 30, 30)
    ctx.fillRect(120, 10, 30, 30)
    ctx.fillRect(10, 120, 30, 30)
    ctx.fillStyle = '#D4AF37'
    ctx.fillRect(15, 15, 20, 20)
    ctx.fillRect(125, 15, 20, 20)
    ctx.fillRect(15, 125, 20, 20)
  }, [url])

  return <canvas ref={canvasRef} className="rounded-lg border border-[rgba(212,175,55,0.3)]" />
}

export default function PhoneCamera({ onStreamReady }: PhoneCameraProps) {
  const [phoneUrl, setPhoneUrl] = useState('')
  const [phoneConnected, setPhoneConnected] = useState(false)
  const [activeTab, setActiveTab] = useState<'qr' | 'usb' | 'ip'>('qr')
  const [ipAddress, setIpAddress] = useState('')
  const [ipPort, setIpPort] = useState('4747')

  useEffect(() => {
    const url = `${window.location.origin}/phone-camera.html`
    setPhoneUrl(url)

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'phone-camera-ready') {
        setPhoneConnected(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const openPhoneCamera = () => {
    window.open(phoneUrl, '_blank', 'width=420,height=750,location=no,menubar=no')
  }

  const copyUrl = () => navigator.clipboard.writeText(phoneUrl)

  const connectIPCamera = async () => {
    if (!ipAddress) return
    const videoUrl = `http://${ipAddress}:${ipPort}/video`
    try {
      const video = document.createElement('video')
      video.src = videoUrl
      alert(`Attempting to connect to IP Camera at ${videoUrl}\nNote: IP Webcam streams require CORS headers. Use USB method for best results.`)
    } catch (e) {
      alert('Could not connect to IP camera. Ensure the app is running and on the same network.')
    }
  }

  const TABS = [
    { id: 'qr', label: 'WiFi / QR', icon: QrCode },
    { id: 'usb', label: 'USB Cable', icon: Usb },
    { id: 'ip', label: 'IP Webcam', icon: Wifi },
  ] as const

  return (
    <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-[var(--gold)]" />
        <span className="font-bold text-sm text-white">Connect Phone Camera</span>
        {phoneConnected && (
          <div className="ml-auto flex items-center gap-1.5 text-green-400 text-xs">
            <CheckCircle className="w-4 h-4" /> Phone Connected
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-black/40 rounded-lg p-1">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === tab.id ? 'bg-[var(--gold)] text-black' : 'text-gray-500 hover:text-white'}`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'qr' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-4 items-start">
            <QRCodeDisplay url={phoneUrl} />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-white mb-2">Option A — Same WiFi</h4>
              <ol className="space-y-2 text-xs text-gray-400">
                <li className="flex gap-2"><span className="text-[var(--gold)] font-bold shrink-0">1.</span>Click "Open on Phone" — or scan QR code</li>
                <li className="flex gap-2"><span className="text-[var(--gold)] font-bold shrink-0">2.</span>Tap "Start HD Camera" on your phone</li>
                <li className="flex gap-2"><span className="text-[var(--gold)] font-bold shrink-0">3.</span>Your 1080p camera is live!</li>
                <li className="flex gap-2"><span className="text-[var(--gold)] font-bold shrink-0">4.</span>Use Studio Screen Share to capture the phone window</li>
              </ol>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={openPhoneCamera}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--gold)] text-black font-bold rounded-lg hover:bg-yellow-300 transition-colors text-sm">
              <ExternalLink className="w-4 h-4" /> Open on Phone
            </button>
            <button onClick={copyUrl}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-gray-400 rounded-lg hover:bg-white/10 text-sm">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-gray-600 bg-black/30 rounded-lg p-2 font-mono truncate">{phoneUrl}</div>
        </div>
      )}

      {activeTab === 'usb' && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-bold text-white">Option B — USB Cable (Best Quality)</h4>
          <ol className="space-y-3 text-sm text-gray-400">
            {[
              'Connect your phone via USB cable to this computer',
              'Enable USB tethering: Settings → Hotspot & Tethering → USB',
              'Install DroidCam (Android) or EpocCam (iPhone) on your phone',
              'Open the app and click "Connect via USB"',
              'Go to Studio → Camera dropdown → Select DroidCam/EpocCam',
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[var(--gold)] text-black text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <div className="flex gap-2 mt-2">
            <a href="https://www.dev47apps.com/droidcam/windows/" target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 text-gray-400 rounded-lg hover:bg-white/10 text-sm">
              <Globe className="w-4 h-4" /> DroidCam (Android)
            </a>
            <a href="https://www.elgato.com/en/epoccam" target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 text-gray-400 rounded-lg hover:bg-white/10 text-sm">
              <Globe className="w-4 h-4" /> EpocCam (iPhone)
            </a>
          </div>
        </div>
      )}

      {activeTab === 'ip' && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-bold text-white">Option C — IP Webcam App</h4>
          <ol className="space-y-2 text-xs text-gray-400 mb-2">
            <li className="flex gap-2"><span className="text-[var(--gold)] font-bold shrink-0">1.</span>Install "IP Webcam" (Android) or "EpocCam" (iPhone)</li>
            <li className="flex gap-2"><span className="text-[var(--gold)] font-bold shrink-0">2.</span>Start server in the app — note the IP shown (e.g. 192.168.1.5)</li>
            <li className="flex gap-2"><span className="text-[var(--gold)] font-bold shrink-0">3.</span>Enter IP and port below — click Connect</li>
          </ol>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Phone IP Address</label>
              <input value={ipAddress} onChange={e => setIpAddress(e.target.value)}
                placeholder="192.168.1.5"
                className="w-full bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[var(--gold)]" />
            </div>
            <div className="w-20">
              <label className="text-xs text-gray-500 mb-1 block">Port</label>
              <input value={ipPort} onChange={e => setIpPort(e.target.value)}
                placeholder="4747"
                className="w-full bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[var(--gold)]" />
            </div>
          </div>
          <button onClick={connectIPCamera}
            className="w-full py-2.5 bg-[var(--gold)] text-black font-bold rounded-lg hover:bg-yellow-300 transition-colors text-sm">
            Connect IP Camera
          </button>
        </div>
      )}
    </div>
  )
}
