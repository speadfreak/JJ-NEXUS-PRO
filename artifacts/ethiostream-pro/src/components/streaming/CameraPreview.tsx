import { useRef, useEffect } from 'react'
import { useCamera } from '../../context/CameraContext'
import { Smartphone } from 'lucide-react'

export default function CameraPreview({ style }: { style?: React.CSSProperties }) {
  const { activeStream, phoneStream, filters, error } = useCamera()
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && activeStream) {
      videoRef.current.srcObject = activeStream
      videoRef.current.play().catch(() => {})
    }
  }, [activeStream])

  const filterString = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`
  const transformString = `scale(${filters.zoom}) ${filters.flipped ? 'scaleX(-1)' : ''}`

  if (error && !activeStream) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a', color: '#D4AF37', flexDirection: 'column', gap: 12, padding: 24 }}>
        <span style={{ fontSize: 40 }}>📷</span>
        <p style={{ textAlign: 'center', fontSize: 14 }}>{error}</p>
        <p style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
          Go to browser Settings → Privacy → Camera → Allow for this site
        </p>
      </div>
    )
  }

  if (!activeStream) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a', color: '#666', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 40 }}>🎥</span>
        <p style={{ fontSize: 14 }}>No camera active</p>
        <p style={{ fontSize: 12, color: '#444', textAlign: 'center', maxWidth: 200 }}>
          Enable your Chromebook camera or connect your Phone HD camera in the Camera tab
        </p>
      </div>
    )
  }

  return (
    <div style={{ ...style, position: 'relative', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover',
          filter: filterString,
          transform: transformString,
          display: 'block'
        }}
      />
      {phoneStream && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(0,0,0,0.7)', borderRadius: 6,
          padding: '4px 8px', fontSize: 11, color: '#22c55e', fontWeight: 700
        }}>
          <Smartphone size={11} />
          Phone HD Cam
        </div>
      )}
    </div>
  )
}
