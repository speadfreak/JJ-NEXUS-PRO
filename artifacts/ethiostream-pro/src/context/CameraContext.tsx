import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'

interface CameraFilters {
  brightness: number
  contrast: number
  saturation: number
  zoom: number
  flipped: boolean
}

export type PhoneConnectState = 'idle' | 'waiting' | 'connected' | 'error'

interface CameraContextType {
  stream: MediaStream | null
  phoneStream: MediaStream | null
  screenStream: MediaStream | null
  activeStream: MediaStream | null      // phoneStream ?? stream
  devices: MediaDeviceInfo[]
  selectedDevice: string
  error: string
  filters: CameraFilters
  isActive: boolean
  phoneState: PhoneConnectState
  phoneSessionId: string | null
  phoneInfo: { width: number; height: number; fps: number } | null
  startCamera: (deviceId?: string) => Promise<void>
  stopCamera: () => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => void
  setSelectedDevice: (id: string) => void
  setFilters: (f: Partial<CameraFilters>) => void
  createPhoneSession: () => Promise<string>
  connectPhoneCamera: (sessionId: string) => Promise<void>
  disconnectPhone: () => void
}

const CameraContext = createContext<CameraContextType | null>(null)

const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function CameraProvider({ children }: { children: ReactNode }) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [phoneStream, setPhoneStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [isActive, setIsActive] = useState(false)
  const [filters, setFiltersState] = useState<CameraFilters>({
    brightness: 100, contrast: 100, saturation: 100, zoom: 1, flipped: false
  })
  const [phoneState, setPhoneState] = useState<PhoneConnectState>('idle')
  const [phoneSessionId, setPhoneSessionId] = useState<string | null>(null)
  const [phoneInfo, setPhoneInfo] = useState<{ width: number; height: number; fps: number } | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const pollAnswerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollIceRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const calleeIceIdxRef = useRef(0)

  const activeStream = phoneStream ?? stream

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then(all => setDevices(all.filter(d => d.kind === 'videoinput')))
      .catch(() => {})
  }, [])

  const startCamera = async (deviceId?: string) => {
    try {
      if (stream) stream.getTracks().forEach(t => t.stop())
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: 1280, height: 720 }
          : { width: 1280, height: 720 },
        audio: true
      }
      const s = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(s)
      setIsActive(true)
      setError('')
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter(d => d.kind === 'videoinput'))
    } catch (e: any) {
      setIsActive(false)
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings and refresh.')
      } else if (e.name === 'NotFoundError') {
        setError('No camera detected. Please connect a camera and try again.')
      } else {
        setError(`Camera error: ${e.message}`)
      }
    }
  }

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
    setIsActive(false)
  }

  const startScreenShare = async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as any,
        audio: true
      })
      s.getVideoTracks()[0].onended = () => setScreenStream(null)
      setScreenStream(s)
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') {
        setError(`Screen share error: ${e.message}`)
      }
    }
  }

  const stopScreenShare = () => {
    screenStream?.getTracks().forEach(t => t.stop())
    setScreenStream(null)
  }

  const setFilters = (f: Partial<CameraFilters>) => {
    setFiltersState(prev => ({ ...prev, ...f }))
  }

  // ── WebRTC Phone Camera (callee side) ────────────────────────────────────

  const cleanupPhone = () => {
    if (pollAnswerRef.current) { clearInterval(pollAnswerRef.current); pollAnswerRef.current = null }
    if (pollIceRef.current) { clearInterval(pollIceRef.current); pollIceRef.current = null }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
    calleeIceIdxRef.current = 0
  }

  const createPhoneSession = async (): Promise<string> => {
    const res = await fetch('/api/webrtc/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    const data = await res.json()
    setPhoneSessionId(data.sessionId)
    return data.sessionId
  }

  const connectPhoneCamera = async (sessionId: string) => {
    cleanupPhone()
    setPhoneState('waiting')
    setPhoneSessionId(sessionId)

    // Reset stale offer/answer/ICE on server and bump reconnectSignal so phone re-initiates
    try {
      await fetch(`/api/webrtc/session/${sessionId}/reset`, { method: 'POST' })
    } catch {}

    const pc = new RTCPeerConnection({ iceServers: STUN })
    pcRef.current = pc

    pc.ontrack = (e) => {
      const incoming = e.streams[0] ?? new MediaStream([e.track])
      setPhoneStream(incoming)

      const vt = e.track
      if (vt.kind === 'video') {
        // Read resolution after a short delay so it's negotiated
        setTimeout(() => {
          const settings = (vt as any).getSettings?.() ?? {}
          setPhoneInfo({
            width: settings.width ?? 1280,
            height: settings.height ?? 720,
            fps: Math.round(settings.frameRate ?? 30)
          })
          setPhoneState('connected')
        }, 800)
      }
    }

    pc.onicecandidate = async (e) => {
      if (e.candidate) {
        await fetch(`/api/webrtc/session/${sessionId}/ice/callee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidates: [JSON.stringify(e.candidate)] })
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setPhoneState('error')
        setPhoneStream(null)
      }
    }

    // Poll for offer
    const tryConnect = async () => {
      try {
        const r = await fetch(`/api/webrtc/session/${sessionId}/offer`)
        const d = await r.json()
        if (!d.offer) return

        clearInterval(pollAnswerRef.current!)
        await pc.setRemoteDescription({ type: 'offer', sdp: d.offer })
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await fetch(`/api/webrtc/session/${sessionId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: answer.sdp })
        })

        // Poll caller ICE
        pollIceRef.current = setInterval(async () => {
          try {
            const ir = await fetch(`/api/webrtc/session/${sessionId}/ice/caller?from=${calleeIceIdxRef.current}`)
            const id = await ir.json()
            for (const c of id.candidates) {
              await pc.addIceCandidate(JSON.parse(c))
            }
            calleeIceIdxRef.current = id.nextIndex
          } catch {}
        }, 1500)
      } catch {}
    }

    pollAnswerRef.current = setInterval(tryConnect, 2000)
    // Also try immediately
    tryConnect()
  }

  const disconnectPhone = () => {
    cleanupPhone()
    phoneStream?.getTracks().forEach(t => t.stop())
    setPhoneStream(null)
    setPhoneState('idle')
    setPhoneSessionId(null)
    setPhoneInfo(null)
  }

  return (
    <CameraContext.Provider value={{
      stream, phoneStream, screenStream, activeStream,
      devices, selectedDevice, error, filters,
      isActive, phoneState, phoneSessionId, phoneInfo,
      startCamera, stopCamera, startScreenShare, stopScreenShare,
      setSelectedDevice, setFilters,
      createPhoneSession, connectPhoneCamera, disconnectPhone
    }}>
      {children}
    </CameraContext.Provider>
  )
}

export const useCamera = () => {
  const ctx = useContext(CameraContext)
  if (!ctx) throw new Error('useCamera must be used within CameraProvider')
  return ctx
}
