import { useRef, useEffect, useState } from 'react'
import { useCamera } from '../../context/CameraContext'

export default function PiPCameraWindow() {
  const { activeStream, filters } = useCamera()
  const stream = activeStream
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pos, setPos] = useState({ x: window.innerWidth - 260, y: window.innerHeight - 220 })
  const [size] = useState({ w: 240, h: 180 })
  const [minimized, setMinimized] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [stream])

  const filterString = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`
  const transformString = `scale(${filters.zoom}) ${filters.flipped ? 'scaleX(-1)' : ''}`

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return
      let nx = e.clientX - dragOffset.current.x
      let ny = e.clientY - dragOffset.current.y
      if (nx < 0) nx = 0
      if (ny < 0) ny = 0
      if (nx > window.innerWidth - size.w) nx = window.innerWidth - size.w
      if (ny > window.innerHeight - size.h) ny = window.innerHeight - size.h
      setPos({ x: nx, y: ny })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, size])

  if (!stream) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        width: minimized ? 56 : size.w,
        height: minimized ? 56 : size.h,
        border: '2px solid #D4AF37',
        borderRadius: minimized ? '50%' : 12,
        overflow: 'hidden',
        cursor: dragging ? 'grabbing' : 'grab',
        animation: 'pipGlow 2s ease-in-out infinite alternate',
        transition: 'width 0.2s, height 0.2s, border-radius 0.2s'
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={() => setMinimized(!minimized)}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: filterString,
          transform: transformString,
          display: 'block'
        }}
      />
      {!minimized && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 4,
            padding: '2px 8px',
            color: '#D4AF37',
            fontSize: 11,
            cursor: 'pointer',
            fontWeight: 600
          }}
          onClick={(e) => { e.stopPropagation(); setMinimized(true) }}
        >
          —
        </div>
      )}
      {!minimized && (
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 4,
            padding: '2px 8px',
            color: '#D4AF37',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1
          }}
        >
          JJ NEXUS PRO
        </div>
      )}
    </div>
  )
}
