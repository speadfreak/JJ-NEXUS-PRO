import { useState, useEffect, useRef, useCallback } from 'react'
import { useCamera } from '@/context/CameraContext'

export type StreamStatus = 'idle' | 'live' | 'recording' | 'error'

export function useStreamStatus() {
  const { stream } = useCamera()
  const [fps, setFps] = useState(0)
  const [resolution, setResolution] = useState('No signal')
  const [bitrate, setBitrate] = useState('0 Mbps')
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [duration, setDuration] = useState(0)
  const [fileSize, setFileSize] = useState(0)
  const [cameraLabel, setCameraLabel] = useState('No camera')

  const frameCount = useRef(0)
  const lastTime = useRef(performance.now())
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!stream) {
      setFps(0)
      setResolution('No signal')
      setCameraLabel('No camera')
      return
    }

    const videoTracks = stream.getVideoTracks()
    if (videoTracks.length === 0) {
      setResolution('No video track')
      return
    }

    const track = videoTracks[0]
    const settings = track.getSettings()
    setResolution(`${settings.width ?? '?'}×${settings.height ?? '?'}`)
    setCameraLabel(track.label || 'Camera')

    track.onended = () => {
      setResolution('No signal')
      setStatus('idle')
    }

    let rafId: number
    const measure = () => {
      frameCount.current++
      const now = performance.now()
      if (now - lastTime.current >= 1000) {
        setFps(frameCount.current)
        frameCount.current = 0
        lastTime.current = now
      }
      rafId = requestAnimationFrame(measure)
    }
    rafId = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(rafId)
  }, [stream])

  const startDurationTimer = useCallback(() => {
    setDuration(0)
    if (durationTimer.current) clearInterval(durationTimer.current)
    durationTimer.current = setInterval(() => setDuration(d => d + 1), 1000)
  }, [])

  const stopDurationTimer = useCallback(() => {
    if (durationTimer.current) {
      clearInterval(durationTimer.current)
      durationTimer.current = null
    }
  }, [])

  const updateBitrate = useCallback((bytesPerSecond: number) => {
    const mbps = (bytesPerSecond * 8 / 1_000_000).toFixed(2)
    setBitrate(`${mbps} Mbps`)
  }, [])

  const updateFileSize = useCallback((bytes: number) => {
    setFileSize(bytes)
  }, [])

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return {
    fps,
    resolution,
    bitrate,
    status,
    setStatus,
    duration,
    fileSize,
    cameraLabel,
    formatDuration,
    formatFileSize,
    startDurationTimer,
    stopDurationTimer,
    updateBitrate,
    updateFileSize,
  }
}
