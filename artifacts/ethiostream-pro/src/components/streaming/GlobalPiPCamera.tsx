import { useRef, useEffect, useState } from 'react'
import { useCamera } from '@/context/CameraContext'
import { motion, AnimatePresence } from 'framer-motion'

export default function GlobalPiPCamera() {
  const { activeStream, filters, phoneState, isActive } = useCamera()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [pos, setPos] = useState({ x: window.innerWidth - 280, y: 80 })
  const [minimized, setMinimized] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const W = 260
  const H = 195

  const stream = activeStream
  const isConnected = isActive || phoneState === 'connected'

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [stream])

  const filterString = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`
  const transformString = `scale(${filters.zoom}) ${filters.flipped ? 'scaleX(-1)' : ''}`

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return
      let nx = e.clientX - dragOffset.current.x
      let ny = e.clientY - dragOffset.current.y
      nx = Math.max(0, Math.min(nx, window.innerWidth - W))
      ny = Math.max(0, Math.min(ny, window.innerHeight - H))
      setPos({ x: nx, y: ny })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  // Reset hidden when new stream starts
  useEffect(() => {
    if (isConnected && stream) setHidden(false)
  }, [isConnected, stream])

  if (!stream || !isConnected || hidden) return null

  return (
    <AnimatePresence>
      <motion.div
        key="global-pip"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 9000,
          width: minimized ? 52 : W,
          height: minimized ? 52 : H,
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onMouseDown={onMouseDown}
        transition={{ duration: 0.15 }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: minimized ? '50%' : 14,
            overflow: 'hidden',
            border: '2px solid #D4AF37',
            boxShadow: '0 0 20px rgba(212,175,55,0.4), 0 8px 32px rgba(0,0,0,0.6)',
            background: '#000',
            transition: 'border-radius 0.2s',
            position: 'relative',
          }}
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
              display: 'block',
            }}
          />

          {!minimized && (
            <>
              {/* Live badge */}
              <div style={{
                position: 'absolute',
                top: 8,
                left: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(0,0,0,0.75)',
                borderRadius: 6,
                padding: '3px 8px',
                backdropFilter: 'blur(4px)',
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#ef4444',
                  animation: 'livePulse 1.5s ease-in-out infinite',
                  display: 'inline-block',
                }} />
                <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>LIVE</span>
              </div>

              {/* Label */}
              <div style={{
                position: 'absolute',
                bottom: 6,
                left: 8,
                color: '#D4AF37',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                textShadow: '0 1px 4px rgba(0,0,0,0.9)',
              }}>
                JJ NEXUS PRO
              </div>

              {/* Controls */}
              <div style={{
                position: 'absolute',
                top: 6,
                right: 6,
                display: 'flex',
                gap: 4,
              }}>
                <button
                  title="Minimize"
                  onClick={(e) => { e.stopPropagation(); setMinimized(true); }}
                  style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)',
                    border: '1px solid rgba(212,175,55,0.4)',
                    color: '#D4AF37',
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  —
                </button>
                <button
                  title="Hide"
                  onClick={(e) => { e.stopPropagation(); setHidden(true); }}
                  style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)',
                    border: '1px solid rgba(220,38,38,0.4)',
                    color: '#ef4444',
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            </>
          )}

          {minimized && (
            <button
              title="Expand"
              onClick={(e) => { e.stopPropagation(); setMinimized(false); }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#D4AF37',
                fontSize: 18,
              }}
            >
              ▶
            </button>
          )}
        </div>

        {/* Tooltip when dragging */}
        {dragging && !minimized && (
          <div style={{
            position: 'absolute',
            bottom: -24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.8)',
            color: '#D4AF37',
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            Drag to reposition
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
