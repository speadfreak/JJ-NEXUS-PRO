import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown } from 'lucide-react'
import TradingViewAdvancedChart from '@/components/common/TradingViewAdvancedChart'
import { useLivePrices, formatPriceForSymbol } from '@/utils/priceEngine'

const PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'BTCUSD', 'US30', 'NAS100']

interface FocusModeProps {
  isOpen: boolean
  onClose: () => void
}

export default function FocusMode({ isOpen, onClose }: FocusModeProps) {
  const [symbol, setSymbol] = useState('XAUUSD')
  const { prices } = useLivePrices()
  const livePrice = prices[symbol]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: '#050505',
            display: 'flex', flexDirection: 'column'
          }}
        >
          {/* Minimal top bar */}
          <div style={{
            height: 46, display: 'flex', alignItems: 'center',
            padding: '0 16px', gap: 16, flexShrink: 0,
            borderBottom: '1px solid rgba(212,175,55,0.2)',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)'
          }}>
            <span style={{ color: '#D4AF37', fontWeight: 800, fontSize: 13, letterSpacing: '0.05em', fontFamily: 'serif' }}>
              JJ NEXUS PRO
            </span>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                style={{
                  background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)',
                  borderRadius: 8, color: '#fff', padding: '4px 28px 4px 10px',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', appearance: 'none', outline: 'none'
                }}
              >
                {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown style={{ position: 'absolute', right: 6, color: '#D4AF37', pointerEvents: 'none', width: 14, height: 14 }} />
            </div>

            {livePrice && (
              <span style={{ color: '#D4AF37', fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>
                {formatPriceForSymbol(symbol, livePrice)}
              </span>
            )}

            <div style={{ flex: 1 }} />

            <button
              onClick={onClose}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 14px', background: 'transparent',
                border: '1px solid rgba(212,175,55,0.35)',
                borderRadius: 8, color: '#D4AF37', cursor: 'pointer', fontSize: 12, fontWeight: 600
              }}
            >
              <X style={{ width: 13, height: 13 }} />
              Exit Focus Mode
            </button>
          </div>

          {/* Full Chart */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TradingViewAdvancedChart symbol={symbol} showSideToolbar={true} style={{ width: '100%', height: '100%' }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
