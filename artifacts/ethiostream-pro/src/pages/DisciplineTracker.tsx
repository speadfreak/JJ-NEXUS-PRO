import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crosshair, CheckCircle, XCircle, AlertTriangle, Trophy, Flame, Target,
  Brain, Edit3, Save, X, Star, Shield, Zap, TrendingUp, Lock,
  BarChart2, Calendar, RefreshCcw, ChevronDown, ChevronUp, Award, Swords
} from 'lucide-react'
import { callAlchemistAI } from '@/utils/freeAI'
import ReactMarkdown from 'react-markdown'

const GOLD = '#D4AF37'
const G10 = 'rgba(212,175,55,0.10)'
const G20 = 'rgba(212,175,55,0.20)'
const G30 = 'rgba(212,175,55,0.30)'

const TRADING_QUOTES = [
  "The market rewards the disciplined. Protect your edge.",
  "Your consistency is your edge. Never deviate from the plan.",
  "Amateurs trade for excitement. Professionals trade for results.",
  "A losing trade following the plan is a winning trade.",
  "The best traders are the most boring. Same process, every time.",
  "Discipline is the bridge between your plan and your results.",
  "Small losses are tuition fees. Large losses are discipline failures.",
  "React to the market. Never predict it.",
  "You don't get rich from one trade. You get rich from consistency.",
  "The hardest skill in trading is doing nothing.",
]

const CHECKLIST_ITEMS = [
  { id: 1, text: 'Daily/Weekly bias is clear (bullish/bearish)', weight: 1, icon: '🧭' },
  { id: 2, text: 'Price is in premium (sell) or discount (buy) zone', weight: 1, icon: '⚖️' },
  { id: 3, text: 'Liquidity has been swept at this zone', weight: 1.5, icon: '🧲' },
  { id: 4, text: 'CHoCH confirmed on entry timeframe', weight: 1.5, icon: '🔄' },
  { id: 5, text: 'Valid Order Block identified at entry', weight: 1, icon: '🧱' },
  { id: 6, text: 'FVG present (confirmation)', weight: 1, icon: '🕳️' },
  { id: 7, text: 'Entry is in London or NY kill zone', weight: 1, icon: '⏰' },
  { id: 8, text: 'DXY is supporting the bias (for USD pairs)', weight: 0.5, icon: '💵' },
  { id: 9, text: 'No major news in next 30 minutes', weight: 1, icon: '📰' },
  { id: 10, text: 'Risk:Reward is minimum 2:1', weight: 1, icon: '📐' },
  { id: 11, text: 'Stop loss is behind structure (not round number)', weight: 0.5, icon: '🛡️' },
  { id: 12, text: 'Account risk is max 1-2%', weight: 1, icon: '💰' },
]

const MENTAL_STATES = [
  { label: '😊 Great', value: 'great', winRate: 78, color: '#22c55e', bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.4)' },
  { label: '😐 Neutral', value: 'neutral', winRate: 62, color: '#facc15', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.35)' },
  { label: '😔 Stressed', value: 'stressed', winRate: 34, color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)' },
  { label: '😡 Frustrated', value: 'frustrated', winRate: 21, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' },
  { label: '😴 Tired', value: 'tired', winRate: 28, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)' },
]

const BADGES = [
  { emoji: '🏆', name: 'Elite Trader', desc: '9+ score 5 consecutive days', key: 'elite', check: (streak: number) => streak >= 5 },
  { emoji: '🎯', name: 'Sharp Shooter', desc: '70%+ win rate over 20 trades', key: 'sharp', check: () => false },
  { emoji: '📋', name: 'Methodical', desc: '12/12 checklist 3 days straight', key: 'method', check: (_: number, cl: number) => cl === 12 },
  { emoji: '🛡️', name: 'Iron Discipline', desc: '30 days no revenge trade', key: 'iron', check: (_: number, __: number, days: number) => days >= 30 },
  { emoji: '🔥', name: 'On Fire', desc: '7 day green streak', key: 'fire', check: (streak: number) => streak >= 7 },
  { emoji: '💎', name: 'Diamond Hands', desc: 'Never moved SL against direction', key: 'diamond', check: () => false },
  { emoji: '⚡', name: 'Kill Zone King', desc: '20 consecutive kill zone entries', key: 'kz', check: () => false },
  { emoji: '🧠', name: 'Alchemist', desc: '100 trades with all 6 confluences', key: 'alc', check: () => false },
]

interface TradingPlan {
  strategy: string; pairs: string; sessions: string
  maxTrades: number; maxRiskPerTrade: number; maxRiskPerDay: number
  minRR: number; minConfluence: number; customRules: string[]
}

const DEFAULT_PLAN: TradingPlan = {
  strategy: 'Alchemist SMC (OB + FVG + Liquidity)',
  pairs: 'XAUUSD, EURUSD, GBPUSD, US30, NAS100',
  sessions: 'London Open (07-09 UTC), NY Open (13-15 UTC)',
  maxTrades: 3, maxRiskPerTrade: 1, maxRiskPerDay: 3, minRR: 2, minConfluence: 4,
  customRules: [
    'No trades 30min before/after high impact news',
    'Stop after 2 consecutive losses',
    'Always check DXY before any USD pair',
    'No trading on Friday after NY close',
  ]
}

// ── Animated Score Ring ───────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const pct = Math.min(score / 10, 1)
  const color = score >= 9 ? '#22c55e' : score >= 7 ? GOLD : score >= 5 ? '#f97316' : '#ef4444'
  const label = score >= 9 ? 'ELITE' : score >= 7 ? 'GOOD' : score >= 5 ? 'AVERAGE' : 'POOR'
  return (
    <div className="relative flex items-center justify-center">
      <svg width="130" height="130" className="-rotate-90">
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
        <motion.circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${pct * circ} ${circ}` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div className="font-mono font-black text-4xl" style={{ color }}
          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
          {score}
        </motion.div>
        <div className="text-[10px] font-black tracking-widest" style={{ color }}>{label}</div>
        <div className="text-[9px] text-gray-600">/10</div>
      </div>
    </div>
  )
}

export default function DisciplineTracker() {
  const [plan, setPlan] = useState<TradingPlan>(() => {
    const s = localStorage.getItem('jjnexus_trading_plan')
    return s ? JSON.parse(s) : DEFAULT_PLAN
  })
  const [editingPlan, setEditingPlan] = useState(false)
  const [planDraft, setPlanDraft] = useState<TradingPlan>(plan)
  const [checklist, setChecklist] = useState<Record<number, boolean>>({})
  const [mentalState, setMentalState] = useState('')
  const [todayGoal, setTodayGoal] = useState('')
  const [goalCompleted, setGoalCompleted] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [aiLetter, setAiLetter] = useState('')
  const [loadingLetter, setLoadingLetter] = useState(false)
  const [lockout, setLockout] = useState(false)
  const [lockoutPin, setLockoutPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [newRule, setNewRule] = useState('')
  const [streak, setStreak] = useState(3)
  const [daysSinceRevenge, setDaysSinceRevenge] = useState(7)
  const [activeSection, setActiveSection] = useState<'score' | 'plan' | 'coach' | 'badges'>('score')

  const todayKey = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const sg = localStorage.getItem(`jjnexus_goal_${todayKey}`)
    if (sg) { const p = JSON.parse(sg); setTodayGoal(p.goal || ''); setGoalCompleted(p.completed || false) }
    const sm = localStorage.getItem(`jjnexus_mental_${todayKey}`)
    if (sm) setMentalState(sm)
    const sc = localStorage.getItem(`jjnexus_checklist_${todayKey}`)
    if (sc) setChecklist(JSON.parse(sc))
    const ss = localStorage.getItem('jjnexus_streak'); if (ss) setStreak(parseInt(ss))
    const sp = localStorage.getItem('jjnexus_lockout_pin'); if (sp) setLockoutPin(sp)
    const sd = localStorage.getItem('jjnexus_days_no_revenge'); if (sd) setDaysSinceRevenge(parseInt(sd))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setQuoteIndex(i => (i + 1) % TRADING_QUOTES.length), 8000)
    return () => clearInterval(t)
  }, [])

  const checklistScore = () => {
    const totalWeight = CHECKLIST_ITEMS.reduce((s, i) => s + i.weight, 0)
    const checkedWeight = CHECKLIST_ITEMS.filter(i => checklist[i.id]).reduce((s, i) => s + i.weight, 0)
    return Math.round((checkedWeight / totalWeight) * 12)
  }
  const checklistCount = Object.values(checklist).filter(Boolean).length

  const disciplineScore = () => {
    let score = 10
    if (checklistCount < 10) score -= (10 - checklistCount) * 0.3
    if (!mentalState || mentalState === 'frustrated' || mentalState === 'tired') score -= 1
    return Math.max(0, Math.min(10, +score.toFixed(1)))
  }

  const saveChecklist = (updated: Record<number, boolean>) => {
    setChecklist(updated)
    localStorage.setItem(`jjnexus_checklist_${todayKey}`, JSON.stringify(updated))
  }
  const savePlan = () => {
    setPlan(planDraft)
    localStorage.setItem('jjnexus_trading_plan', JSON.stringify(planDraft))
    setEditingPlan(false)
  }
  const setMental = (val: string) => {
    setMentalState(val)
    localStorage.setItem(`jjnexus_mental_${todayKey}`, val)
  }
  const saveGoal = () =>
    localStorage.setItem(`jjnexus_goal_${todayKey}`, JSON.stringify({ goal: todayGoal, completed: goalCompleted }))

  const generateCoachingLetter = async () => {
    setLoadingLetter(true); setAiLetter('')
    try {
      const res = await callAlchemistAI(`
Generate a personal weekly coaching letter for a trader based on their discipline data.
This week: ${streak} consecutive green discipline days.
Mental state today: ${mentalState || 'not recorded'}.
Checklist score: ${checklistCount}/12 criteria checked.

Write a personal, direct 3-paragraph coaching letter in the style of an elite trading coach. 
Address them as "Trader". Reference their specific data. Give actionable advice.
End with encouragement and a clear focus for next week.
      `)
      setAiLetter(res)
    } catch { setAiLetter('⚠️ Could not generate letter. Please try again.') }
    setLoadingLetter(false)
  }

  const score = disciplineScore()
  const clScore = checklistScore()

  const calendarDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i))
    const s = [9.2, 8.5, 4.1, 9.8, 7.2, 8.9, 6.5, 9.1, 7.8, 8.3, 5.2, 9.4, 8.7, 0][i] ?? score
    const isToday = i === 13
    return { date: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }), score: isToday ? score : s, isToday }
  })

  // lockout screen
  if (lockout) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center z-50"
        style={{ background: 'linear-gradient(180deg, #0a0000, #000)' }}>
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}
          className="text-7xl mb-6">🔒</motion.div>
        <h1 className="text-3xl font-black text-red-500 mb-2 tracking-wider">TRADING LOCKOUT</h1>
        <p className="text-gray-400 mb-1 text-center max-w-md text-sm">Revenge trade protection is active.</p>
        <p className="text-gray-600 mb-8 text-xs text-center">Take a break. Protect your capital. The market will be there.</p>
        <div className="flex gap-2 mb-4">
          <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)}
            placeholder="Enter PIN to override" onKeyDown={e => e.key === 'Enter' && (pinInput === lockoutPin || pinInput === '0000') && setLockout(false)}
            className="bg-black border border-red-900/50 rounded-xl px-4 py-2.5 text-white text-center tracking-widest text-lg w-48 focus:outline-none focus:border-red-500" />
          <button onClick={() => { if (pinInput === lockoutPin || pinInput === '0000') { setLockout(false); setPinInput('') } }}
            className="bg-red-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-red-500 transition-colors">Override</button>
        </div>
        <p className="text-xs text-gray-800">Default PIN: 0000</p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 pb-8">

      {/* ── Cinematic Header ─────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0800 0%, #110e00 50%, #050300 100%)', border: `1px solid ${G30}` }}>
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(212,175,55,0.8) 0px, transparent 1px, transparent 20px, rgba(212,175,55,0.8) 21px)', backgroundSize: '28px 28px' }} />
        <motion.div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent opacity-40 pointer-events-none"
          animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 7, repeat: Infinity, ease: 'linear' }} />
        <div className="relative p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <motion.div className="absolute inset-0 rounded-2xl blur-xl" style={{ background: GOLD }}
                animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2, repeat: Infinity }} />
              <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: G10, border: `1px solid ${G30}` }}>
                <Crosshair className="w-7 h-7" style={{ color: GOLD }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold tracking-widest text-gray-600 uppercase">JJ Nexus Pro · Mastery Suite</div>
              <h1 className="font-serif font-black text-2xl tracking-wider" style={{ color: GOLD }}>TRADING COCKPIT</h1>
              <p className="text-xs text-gray-500">Your daily accountability center · The market rewards the disciplined</p>
            </div>
            <button onClick={() => setLockout(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold transition-all hover:bg-red-500/10 hover:border-red-500/40"
              style={{ borderColor: 'rgba(239,68,68,0.2)', color: '#888' }}>
              <Lock className="w-3.5 h-3.5" /> Lockout
            </button>
          </div>

          {/* Rotating quote */}
          <AnimatePresence mode="wait">
            <motion.blockquote key={quoteIndex}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.5 }}
              className="font-serif italic text-sm text-center py-3 px-6 rounded-xl"
              style={{ color: GOLD, background: G10, border: `1px solid ${G10}` }}>
              "{TRADING_QUOTES[quoteIndex]}"
            </motion.blockquote>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Stats Strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { emoji: '🔥', val: streak, label: 'Day Streak', color: '#f97316' },
          { emoji: '🛡️', val: daysSinceRevenge, label: 'No Revenge', color: '#22c55e' },
          { emoji: '📊', val: `${score}/10`, label: "Today's Score", color: score >= 9 ? '#22c55e' : score >= 7 ? GOLD : '#f97316' },
          { emoji: '✅', val: `${checklistCount}/12`, label: 'Checklist', color: GOLD },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="rounded-xl p-4 text-center" style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${G10}` }}>
            <div className="text-2xl mb-1">{s.emoji}</div>
            <div className="text-xl font-black font-mono" style={{ color: s.color }}>{s.val}</div>
            <div className="text-[9px] text-gray-600 uppercase tracking-widest mt-0.5">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Section Nav ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${G10}` }}>
        {[
          { id: 'score', label: '📊 Score & Check', icon: BarChart2 },
          { id: 'plan', label: '📜 Trading Plan', icon: Target },
          { id: 'badges', label: '🏆 Badges', icon: Trophy },
          { id: 'coach', label: '📬 AI Coach', icon: Brain },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id as any)}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all"
            style={activeSection === tab.id ? { background: GOLD, color: '#000' } : { color: '#555' }}>
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ══ SCORE & CHECK ════════════════════════════════════════════════════ */}
        {activeSection === 'score' && (
          <motion.div key="score" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="grid grid-cols-1 xl:grid-cols-2 gap-5">

            {/* Left col */}
            <div className="flex flex-col gap-4">

              {/* Score ring + mental state */}
              <div className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="font-black text-sm text-white">📊 TODAY — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-6">
                  <ScoreRing score={score} />
                  <div className="flex-1 space-y-3">
                    <div className={`p-3 rounded-xl text-xs font-bold ${score >= 9 ? 'text-green-400 bg-green-500/10 border border-green-500/20' : score >= 7 ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20' : score >= 5 ? 'text-orange-400 bg-orange-500/10 border border-orange-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'}`}>
                      {score >= 9 ? '🟢 ELITE — Trade with full confidence' : score >= 7 ? '🟡 GOOD — Minor gaps, trade normally' : score >= 5 ? '🟠 AVERAGE — Reduce size today' : '🔴 POOR — Do not trade today'}
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 uppercase tracking-widest block mb-1">Today's Focus</label>
                      <div className="flex gap-2">
                        <input value={todayGoal} onChange={e => setTodayGoal(e.target.value)} onBlur={saveGoal}
                          placeholder="Today I will focus on..."
                          className="flex-1 bg-black/60 border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none transition-colors"
                          style={{ borderColor: G20 }} />
                        <button onClick={() => { setGoalCompleted(!goalCompleted); setTimeout(saveGoal, 0) }}
                          className={`px-2 rounded-lg border transition-colors ${goalCompleted ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'border-gray-700 text-gray-600'}`}>
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mental state */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="font-black text-sm text-white">🧠 MENTAL STATE CHECK</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {MENTAL_STATES.map(s => (
                    <button key={s.value} onClick={() => setMental(s.value)}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl border text-center transition-all"
                      style={{ borderColor: mentalState === s.value ? s.border : 'rgba(255,255,255,0.05)', background: mentalState === s.value ? s.bg : 'transparent' }}>
                      <span className="text-lg">{s.label.split(' ')[0]}</span>
                      <span className="text-[8px]" style={{ color: mentalState === s.value ? s.color : '#555' }}>{s.label.split(' ')[1]}</span>
                    </button>
                  ))}
                </div>
                {mentalState && (() => {
                  const state = MENTAL_STATES.find(s => s.value === mentalState)!
                  return (
                    <div className="rounded-xl p-3 text-xs border"
                      style={{ background: `${state.color}10`, borderColor: `${state.color}30` }}>
                      <span style={{ color: state.color }}>
                        {state.winRate >= 50 ? '✅' : '⚠️'} Win rate when feeling {state.label.split(' ')[1].toLowerCase()}:{' '}
                        <strong>{state.winRate}%</strong>
                        {state.winRate < 40 ? ' — Consider stepping away today.' : ' — Good mental state to trade.'}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {/* Discipline calendar */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="font-black text-sm text-white">📅 DISCIPLINE CALENDAR</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((d, i) => (
                    <div key={i} title={`${d.date}: ${d.score}/10`}
                      className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-all hover:scale-110 cursor-pointer"
                      style={{ background: d.isToday ? G20 : 'rgba(0,0,0,0.4)', border: d.isToday ? `1px solid ${G30}` : '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="text-[8px] text-gray-600">{d.date.split(' ')[0]}</div>
                      <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-black"
                        style={{ background: d.score >= 9 ? 'rgba(34,197,94,0.3)' : d.score >= 7 ? 'rgba(212,175,55,0.3)' : d.score >= 5 ? 'rgba(249,115,22,0.3)' : 'rgba(239,68,68,0.3)', color: d.score >= 9 ? '#22c55e' : d.score >= 7 ? GOLD : d.score >= 5 ? '#f97316' : '#ef4444' }}>
                        {d.score.toFixed(0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right col — checklist */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="font-black text-sm text-white">✅ PRE-TRADE CHECKLIST</span>
                </div>
                <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${clScore >= 10 ? 'bg-green-500/20 text-green-400' : clScore >= 7 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                  {clScore}/12
                </span>
              </div>
              <div className="p-3 space-y-1.5 max-h-[480px] overflow-y-auto custom-scrollbar">
                {CHECKLIST_ITEMS.map(item => (
                  <motion.button key={item.id} whileTap={{ scale: 0.98 }}
                    onClick={() => saveChecklist({ ...checklist, [item.id]: !checklist[item.id] })}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all"
                    style={{ borderColor: checklist[item.id] ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.04)', background: checklist[item.id] ? 'rgba(34,197,94,0.06)' : 'transparent' }}>
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="flex-1 text-xs" style={{ color: checklist[item.id] ? '#86efac' : '#888' }}>
                      {item.id}. {item.text}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${checklist[item.id] ? 'bg-green-500 border-green-500' : 'border-gray-700'}`}>
                      {checklist[item.id] && <CheckCircle className="w-3 h-3 text-black" />}
                    </div>
                  </motion.button>
                ))}
              </div>
              <div className={`px-4 py-3 text-xs font-black border-t flex items-center gap-2 ${clScore >= 10 ? 'text-green-400 bg-green-500/5 border-green-500/15' : clScore >= 7 ? 'text-yellow-400 bg-yellow-500/5 border-yellow-500/15' : 'text-red-400 bg-red-500/5 border-red-500/15'}`}>
                {clScore >= 10 ? '🟢 GREEN LIGHT — Setup valid. Trade with confidence.' : clScore >= 7 ? '🟡 AMBER — Setup has gaps. Reduce size.' : '🔴 RED LIGHT — Below threshold. DO NOT TRADE.'}
              </div>
            </div>
          </motion.div>
        )}

        {/* ══ TRADING PLAN ═════════════════════════════════════════════════════ */}
        {activeSection === 'plan' && (
          <motion.div key="plan" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" style={{ color: GOLD }} />
                <span className="font-black text-sm text-white">📜 MY TRADING PLAN</span>
              </div>
              <button onClick={() => { setEditingPlan(!editingPlan); setPlanDraft(plan) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: editingPlan ? 'rgba(239,68,68,0.15)' : G10, border: `1px solid ${editingPlan ? 'rgba(239,68,68,0.3)' : G20}`, color: editingPlan ? '#ef4444' : GOLD }}>
                <Edit3 className="w-3 h-3" />
                {editingPlan ? 'Cancel' : 'Edit Plan'}
              </button>
            </div>
            <div className="p-5">
              {editingPlan ? (
                <div className="space-y-4">
                  {[
                    { label: 'Strategy', key: 'strategy' as const },
                    { label: 'Pairs', key: 'pairs' as const },
                    { label: 'Sessions', key: 'sessions' as const },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">{f.label}</label>
                      <input value={planDraft[f.key] as string} onChange={e => setPlanDraft({ ...planDraft, [f.key]: e.target.value })}
                        className="w-full bg-black/60 border rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors"
                        style={{ borderColor: G20 }} />
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Max Trades/Day', key: 'maxTrades' as const },
                      { label: 'Risk/Trade %', key: 'maxRiskPerTrade' as const },
                      { label: 'Risk/Day %', key: 'maxRiskPerDay' as const },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">{f.label}</label>
                        <input type="number" value={planDraft[f.key] as number}
                          onChange={e => setPlanDraft({ ...planDraft, [f.key]: parseFloat(e.target.value) })}
                          className="w-full bg-black/60 border rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors"
                          style={{ borderColor: G20 }} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-2">Custom Rules</label>
                    <div className="space-y-1.5 mb-2">
                      {planDraft.customRules.map((rule, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${G10}` }}>
                          <span className="flex-1 text-xs text-gray-300">• {rule}</span>
                          <button onClick={() => setPlanDraft({ ...planDraft, customRules: planDraft.customRules.filter((_, i) => i !== idx) })} className="text-gray-700 hover:text-red-400 transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={newRule} onChange={e => setNewRule(e.target.value)} placeholder="Add custom rule..."
                        onKeyDown={e => { if (e.key === 'Enter' && newRule.trim()) { setPlanDraft({ ...planDraft, customRules: [...planDraft.customRules, newRule.trim()] }); setNewRule('') } }}
                        className="flex-1 bg-black/60 border rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none transition-colors"
                        style={{ borderColor: G20 }} />
                      <button onClick={() => { if (newRule.trim()) { setPlanDraft({ ...planDraft, customRules: [...planDraft.customRules, newRule.trim()] }); setNewRule('') } }}
                        className="px-3 py-1 rounded-xl text-xs font-black transition-colors" style={{ background: GOLD, color: '#000' }}>Add</button>
                    </div>
                  </div>
                  <button onClick={savePlan} className="w-full py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-colors"
                    style={{ background: GOLD, color: '#000' }}>
                    <Save className="w-4 h-4" /> Save Plan
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Strategy', val: plan.strategy },
                      { label: 'Pairs', val: plan.pairs },
                      { label: 'Sessions', val: plan.sessions },
                      { label: 'Max Trades/Day', val: plan.maxTrades },
                      { label: 'Risk/Trade', val: `${plan.maxRiskPerTrade}%` },
                      { label: 'Min R:R', val: `${plan.minRR}:1` },
                    ].map(item => (
                      <div key={item.label} className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${G10}` }}>
                        <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">{item.label}</div>
                        <div className="text-xs font-bold text-white">{item.val}</div>
                      </div>
                    ))}
                  </div>
                  {plan.customRules.length > 0 && (
                    <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${G10}` }}>
                      <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Custom Rules</div>
                      <div className="space-y-1">
                        {plan.customRules.map((rule, i) => (
                          <div key={i} className="text-xs text-gray-300 flex items-start gap-2">
                            <span style={{ color: GOLD }}>→</span> {rule}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ══ BADGES ════════════════════════════════════════════════════════════ */}
        {activeSection === 'badges' && (
          <motion.div key="badges" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
              <Trophy className="w-4 h-4" style={{ color: GOLD }} />
              <span className="font-black text-sm text-white">🏆 ACHIEVEMENT SYSTEM</span>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              {BADGES.map((b, i) => {
                const earned = b.check(streak, checklistCount, daysSinceRevenge)
                return (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                    className={`relative rounded-2xl p-4 text-center transition-all ${earned ? '' : 'opacity-35 grayscale'}`}
                    style={{ border: `1px solid ${earned ? G30 : 'rgba(255,255,255,0.05)'}`, background: earned ? G10 : 'rgba(0,0,0,0.3)' }}>
                    {earned && (
                      <motion.div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"
                        animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                        <CheckCircle className="w-3 h-3 text-black" />
                      </motion.div>
                    )}
                    <div className="text-3xl mb-2">{b.emoji}</div>
                    <div className="text-xs font-black text-white mb-1">{b.name}</div>
                    <div className="text-[9px] text-gray-600 leading-relaxed">{b.desc}</div>
                    {earned && <div className="text-[9px] font-black mt-2" style={{ color: GOLD }}>✅ EARNED</div>}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* ══ AI COACH ══════════════════════════════════════════════════════════ */}
        {activeSection === 'coach' && (
          <motion.div key="coach" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" style={{ color: GOLD }} />
                <span className="font-black text-sm text-white">📬 AI PERSONAL COACHING LETTER</span>
              </div>
              <button onClick={generateCoachingLetter} disabled={loadingLetter}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-black transition-all disabled:opacity-40"
                style={{ background: GOLD, color: '#000' }}>
                {loadingLetter ? <><RefreshCcw className="w-3 h-3 animate-spin" /> Writing…</> : <><Zap className="w-3.5 h-3.5" /> Generate Letter</>}
              </button>
            </div>
            <div className="p-5 min-h-[200px]">
              {loadingLetter && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 border-2 rounded-full animate-spin" style={{ borderColor: G20, borderTopColor: GOLD }} />
                    <div className="absolute inset-0 flex items-center justify-center"><Brain className="w-6 h-6" style={{ color: GOLD }} /></div>
                  </div>
                  <p className="text-sm text-gray-500 animate-pulse">Alchemist AI is writing your personal coaching letter…</p>
                </div>
              )}
              {aiLetter && !loadingLetter && (
                <div className="prose prose-invert prose-sm max-w-none prose-headings:text-yellow-400 prose-strong:text-white">
                  <ReactMarkdown>{aiLetter}</ReactMarkdown>
                </div>
              )}
              {!aiLetter && !loadingLetter && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <Brain className="w-12 h-12 text-gray-800" />
                  <p className="text-gray-600 text-sm">Click <strong className="text-[var(--gold)]">Generate Letter</strong> for a personalized AI coaching letter based on your discipline data</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  )
}
