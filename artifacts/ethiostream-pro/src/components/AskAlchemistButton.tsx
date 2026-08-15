import { Sparkles } from 'lucide-react'
import { useLocation } from 'wouter'

export default function AskAlchemistButton({ prompt, label = 'Ask Alchemist about this' }: { prompt: string; label?: string }) {
  const [, navigate] = useLocation()
  const openAlchemist = () => {
    localStorage.setItem('jjnexus_alchemist_prefill', prompt)
    navigate('/alchemist')
  }
  return (
    <button onClick={openAlchemist} className="flex items-center gap-1.5 rounded-lg border border-[rgba(212,175,55,0.28)] bg-[rgba(212,175,55,0.07)] px-3 py-1.5 text-[10px] font-bold text-[var(--gold)] transition hover:bg-[rgba(212,175,55,0.14)]">
      <Sparkles className="h-3 w-3" /> {label}
    </button>
  )
}