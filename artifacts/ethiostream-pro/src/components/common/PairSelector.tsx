import { SYMBOL_GROUPS, SYMBOL_DISPLAY_NAMES } from '@/data/symbolGroups'

interface Props {
  value: string
  onChange: (symbol: string) => void
  className?: string
}

export default function PairSelector({ value, onChange, className }: Props) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`bg-black border border-gray-700 rounded px-3 py-2 text-white text-sm font-bold focus:border-[var(--gold)] outline-none font-mono ${className ?? ''}`}
    >
      {SYMBOL_GROUPS.map(group => (
        <optgroup key={group.label} label={`── ${group.label} ──`}>
          {group.symbols.map(sym => (
            <option key={sym} value={sym}>
              {sym}{SYMBOL_DISPLAY_NAMES[sym] ? ` · ${SYMBOL_DISPLAY_NAMES[sym]}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
