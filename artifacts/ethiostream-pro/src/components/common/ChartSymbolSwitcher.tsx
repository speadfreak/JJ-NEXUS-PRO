import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { SYMBOL_GROUPS, SYMBOL_DISPLAY_NAMES } from '@/data/symbolGroups'

interface Props {
  currentSymbol: string
  onSymbolChange: (symbol: string) => void
  className?: string
}

export default function ChartSymbolSwitcher({ currentSymbol, onSymbolChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? SYMBOL_GROUPS.map(g => ({
        ...g,
        symbols: g.symbols.filter(s =>
          s.toLowerCase().includes(search.toLowerCase()) ||
          (SYMBOL_DISPLAY_NAMES[s] ?? '').toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(g => g.symbols.length > 0)
    : SYMBOL_GROUPS

  const displayName = SYMBOL_DISPLAY_NAMES[currentSymbol]

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-black/60 border border-[rgba(212,175,55,0.3)] hover:border-[var(--gold)] text-white px-3 py-2 rounded-lg text-sm font-bold transition-all"
      >
        <span className="text-[var(--gold)]">{currentSymbol}</span>
        {displayName && <span className="text-gray-400 text-xs hidden sm:inline">· {displayName}</span>}
        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#0a0a0a] border border-[rgba(212,175,55,0.3)] rounded-lg shadow-2xl w-64 max-h-80 overflow-auto">
          <div className="p-2 border-b border-[rgba(212,175,55,0.1)] sticky top-0 bg-[#0a0a0a]">
            <div className="flex items-center gap-2 bg-black/60 rounded px-2 py-1">
              <Search className="w-3 h-3 text-gray-500" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search symbol..."
                className="bg-transparent text-xs text-white outline-none flex-1 placeholder-gray-600"
              />
            </div>
          </div>
          {filtered.map(group => (
            <div key={group.label}>
              <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-widest font-bold border-b border-[rgba(255,255,255,0.04)]">
                {group.label}
              </div>
              {group.symbols.map(sym => (
                <button
                  key={sym}
                  onClick={() => { onSymbolChange(sym); setOpen(false); setSearch('') }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[rgba(212,175,55,0.08)] transition-colors ${
                    sym === currentSymbol ? 'text-[var(--gold)] bg-[rgba(212,175,55,0.06)]' : 'text-gray-300'
                  }`}
                >
                  <span className="font-bold font-mono">{sym}</span>
                  {SYMBOL_DISPLAY_NAMES[sym] && (
                    <span className="text-xs text-gray-500">{SYMBOL_DISPLAY_NAMES[sym]}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  )
}
