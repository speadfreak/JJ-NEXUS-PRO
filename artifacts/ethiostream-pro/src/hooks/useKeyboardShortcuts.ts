import { useEffect, useState } from 'react'

interface ShortcutOptions {
  navigateTo: (path: string) => void
  toggleMusic?: () => void
  toggleFocusMode?: () => void
}

export function useKeyboardShortcuts({ navigateTo, toggleMusic, toggleFocusMode }: ShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key.toLowerCase()) {
        case 'g':
          e.preventDefault()
          navigateTo('/alchemist')
          break
        case 'e':
          e.preventDefault()
          navigateTo('/alchemist')
          break
        case 'b':
          e.preventDefault()
          navigateTo('/alchemist')
          break
        case 's':
          e.preventDefault()
          navigateTo('/scanner')
          break
        case 't':
          e.preventDefault()
          navigateTo('/telegram-bot')
          break
        case 'm':
          e.preventDefault()
          toggleMusic?.()
          break
        case 'f':
          e.preventDefault()
          toggleFocusMode?.()
          break
        case 'j':
          e.preventDefault()
          navigateTo('/journal')
          break
        case 'w':
          e.preventDefault()
          navigateTo('/watchlist')
          break
        case 'k':
          e.preventDefault()
          navigateTo('/calendar')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigateTo, toggleMusic, toggleFocusMode])
}

export function useHelpPanel() {
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?') setShowHelp(prev => !prev)
      if (e.key === 'Escape') setShowHelp(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { showHelp, setShowHelp }
}

export const KEYBOARD_SHORTCUTS = [
  { keys: ['Ctrl', 'G'], description: 'Go to Alchemist AI (Gold analysis)' },
  { keys: ['Ctrl', 'S'], description: 'Open Trade Setup Scanner' },
  { keys: ['Ctrl', 'T'], description: 'Open Telegram Bot' },
  { keys: ['Ctrl', 'J'], description: 'Open Trade Journal' },
  { keys: ['Ctrl', 'W'], description: 'Open Watchlist' },
  { keys: ['Ctrl', 'K'], description: 'Open Economic Calendar' },
  { keys: ['Ctrl', 'F'], description: 'Toggle Focus Mode' },
  { keys: ['Ctrl', 'M'], description: 'Toggle Background Music' },
  { keys: ['Alt', 'F'], description: 'Fire Follow Alert (in Studio)' },
  { keys: ['Alt', 'S'], description: 'Fire Subscribe Alert (in Studio)' },
  { keys: ['Alt', 'D'], description: 'Fire Donate Alert (in Studio)' },
  { keys: ['Alt', 'G'], description: 'Fire Gift Alert (in Studio)' },
  { keys: ['Alt', 'R'], description: 'Fire Raid Alert (in Studio)' },
  { keys: ['?'], description: 'Show/hide this shortcuts panel' },
  { keys: ['Esc'], description: 'Close overlays / exit focus mode' },
]
