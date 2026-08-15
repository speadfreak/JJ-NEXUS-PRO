import { motion, AnimatePresence } from 'framer-motion'
import { X, Keyboard } from 'lucide-react'
import { KEYBOARD_SHORTCUTS } from '@/hooks/useKeyboardShortcuts'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function KeyboardShortcutsPanel({ isOpen, onClose }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[8000]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[8001] w-[500px] max-h-[80vh] overflow-y-auto"
          >
            <div className="border border-[rgba(212,175,55,0.3)] rounded-2xl bg-[#0a0a0a] shadow-[0_0_60px_rgba(212,175,55,0.15)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(212,175,55,0.15)] bg-black/60">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-[var(--gold)]" />
                  <span className="font-bold text-white">KEYBOARD SHORTCUTS</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-600">Press ? to toggle</span>
                  <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-5 space-y-2">
                {KEYBOARD_SHORTCUTS.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.04)] last:border-0">
                    <span className="text-sm text-gray-300">{s.description}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <span key={j} className="inline-flex items-center px-2 py-0.5 rounded border border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.08)] text-[var(--gold)] text-[10px] font-bold font-mono">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
