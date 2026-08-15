import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { streamAlertService, StreamAlert, AlertConfig } from '@/services/StreamAlertService'

export default function StreamAlertOverlay() {
  const [activeAlert, setActiveAlert] = useState<{ alert: StreamAlert; config: AlertConfig } | null>(null)

  useEffect(() => {
    streamAlertService.setOverlayCallback((alert, config) => {
      setActiveAlert({ alert, config })
      setTimeout(() => setActiveAlert(null), config.overlayDuration * 1000)
    })
    streamAlertService.preloadSounds()
  }, [])

  return (
    <AnimatePresence>
      {activeAlert && (
        <motion.div
          key={activeAlert.alert.id}
          initial={{ opacity: 0, y: -60, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.9 }}
          transition={{ type: 'spring', damping: 18, stiffness: 280 }}
          style={{
            position: 'fixed',
            top: '12%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(5,5,5,0.92)',
              border: `3px solid ${activeAlert.config.overlayColor}`,
              borderRadius: 20,
              padding: '22px 48px',
              textAlign: 'center',
              boxShadow: `0 0 60px ${activeAlert.config.overlayColor}88, 0 20px 40px rgba(0,0,0,0.6)`,
              minWidth: 340,
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                color: activeAlert.config.overlayColor,
                fontFamily: 'var(--font-sans)',
                textShadow: `0 0 24px ${activeAlert.config.overlayColor}`,
                marginBottom: 6,
                letterSpacing: '-0.5px',
              }}
            >
              {streamAlertService.processTemplate(activeAlert.config.overlayText, activeAlert.alert)}
            </div>
            {activeAlert.alert.message && (
              <div style={{ fontSize: 15, color: '#fff', opacity: 0.85, fontStyle: 'italic' }}>
                "{activeAlert.alert.message}"
              </div>
            )}
            {activeAlert.alert.amount && !activeAlert.alert.message && (
              <div style={{ fontSize: 22, fontWeight: 700, color: '#D4AF37', marginTop: 6 }}>
                {activeAlert.alert.currency}{activeAlert.alert.amount}
              </div>
            )}
            <motion.div
              style={{
                height: 3,
                background: activeAlert.config.overlayColor,
                borderRadius: 2,
                marginTop: 14,
                transformOrigin: 'left',
              }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: activeAlert.config.overlayDuration, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
