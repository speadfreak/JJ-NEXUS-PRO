import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookMarked, BarChart2, Waves, FlaskConical, ChevronRight, CheckCircle,
  Brain, RefreshCcw, Target, Zap, Activity, TrendingUp, TrendingDown,
  Eye, Shield, Layers, GitFork, Clock, ArrowUpRight, ArrowDownRight,
  Minus, AlertTriangle, Crosshair, Globe
} from 'lucide-react'
import { callAlchemistAI } from '@/utils/freeAI'
import { useLivePrices } from '@/utils/priceEngine'
import TradingViewAdvancedChart from '@/components/common/TradingViewAdvancedChart'
import ReactMarkdown from 'react-markdown'

const GOLD = '#D4AF37'
const G10 = 'rgba(212,175,55,0.10)'
const G20 = 'rgba(212,175,55,0.20)'
const G30 = 'rgba(212,175,55,0.30)'

const TABS = [
  { id: 'amt',       label: 'AMT Theory',      icon: BookMarked,  emoji: '📚' },
  { id: 'liquidity', label: 'Liquidity Dynamics', icon: Layers,   emoji: '🧲' },
  { id: 'ict',       label: 'ICT Concepts',    icon: Crosshair,   emoji: '🎯' },
  { id: 'volume',    label: 'Volume Profile',  icon: BarChart2,   emoji: '📊' },
  { id: 'orderflow', label: 'Order Flow',      icon: Waves,       emoji: '🌊' },
  { id: 'practice',  label: 'Practice Zone',   icon: FlaskConical, emoji: '🧪' },
]

const AMT_LESSONS = [
  { id: 1,  title: 'Auction Market Theory', subtitle: 'Markets as continuous auctions', tier: 'Foundation', completed: true },
  { id: 2,  title: 'Value Area & POC',      subtitle: 'VAH, VAL, Point of Control',   tier: 'Foundation', completed: true },
  { id: 3,  title: 'Market States',         subtitle: 'Trending vs Balancing cycles', tier: 'Foundation', completed: false },
  { id: 4,  title: 'Initial Balance',       subtitle: 'IB range & daily framework',   tier: 'Intermediate', completed: false },
  { id: 5,  title: 'TPO & Market Profile',  subtitle: 'Time Price Opportunity charts', tier: 'Intermediate', completed: false },
  { id: 6,  title: 'Excess & Failure',      subtitle: 'Extremes and rejection prints', tier: 'Intermediate', completed: false },
  { id: 7,  title: 'Auction Rotation',      subtitle: 'How price rotates in balance',  tier: 'Advanced', completed: false },
  { id: 8,  title: 'Responsive vs Initiative', subtitle: 'Buyer/seller activity types', tier: 'Advanced', completed: false },
  { id: 9,  title: 'Price Discovery',       subtitle: 'How markets find fair value',   tier: 'Advanced', completed: false },
  { id: 10, title: 'Profile Skew',          subtitle: 'P, b, and D shape analysis',   tier: 'Advanced', completed: false },
  { id: 11, title: 'Naked POC Migration',   subtitle: 'Unvisited POCs as magnets',    tier: 'Elite', completed: false },
  { id: 12, title: 'AMT + Alchemist SMC',   subtitle: 'Synthesis for funded traders', tier: 'Elite', completed: false },
]

const LIQUIDITY_CONCEPTS = [
  { id: 'bsl',      title: 'Buy-Side Liquidity (BSL)', desc: 'Equal highs, swing highs, stop clusters above price', icon: '🔺', color: '#22c55e' },
  { id: 'ssl',      title: 'Sell-Side Liquidity (SSL)', desc: 'Equal lows, swing lows, stop clusters below price', icon: '🔻', color: '#ef4444' },
  { id: 'eqh',      title: 'Equal Highs / Equal Lows', desc: 'Double tops/bottoms masking institutional resting orders', icon: '⚖️', color: GOLD },
  { id: 'hunt',     title: 'Stop Hunt Mechanics',      desc: 'How smart money raids retail stops before reversing', icon: '🎣', color: '#f97316' },
  { id: 'fvg',      title: 'Fair Value Gaps (FVG)',    desc: 'Inefficiency zones price is drawn to revisit', icon: '🕳️', color: '#a78bfa' },
  { id: 'ob',       title: 'Order Blocks (OB)',        desc: 'Institutional footprints — last opposing candle before a move', icon: '🧱', color: '#60a5fa' },
  { id: 'breaker',  title: 'Breaker Blocks',           desc: 'Failed OBs that flip from support to resistance', icon: '💥', color: '#fb923c' },
  { id: 'mitigation', title: 'Mitigation Blocks',     desc: 'Where institutions hedge losing positions', icon: '🛡️', color: '#34d399' },
]

const ICT_CONCEPTS = [
  { id: 'kz',   title: 'Kill Zones',           desc: 'London Open (2-5am EST) · NY Open (8-11am EST) · London Close (10am-12pm EST)', icon: Clock, color: '#facc15' },
  { id: 'pd',   title: 'PD Arrays',             desc: 'Premium/Discount price delivery arrays — OB, FVG, Breakers, Mitigation', icon: Layers, color: '#a78bfa' },
  { id: 'judas', title: 'Judas Swing',          desc: 'False move at session open to sweep liquidity before true direction', icon: GitFork, color: '#f97316' },
  { id: 'smt',  title: 'SMT Divergence',        desc: 'Correlated pairs diverge — reveals institutional intent', icon: Activity, color: '#34d399' },
  { id: 'tt',   title: 'Time & Price Theory',   desc: 'ICT macro windows — 2:33am, 8:50am, 10am, 2pm EST killzone precision', icon: Clock, color: '#60a5fa' },
  { id: 'htf',  title: 'HTF Draw on Liquidity', desc: 'Where price is GOING before where it enters — monthly → weekly → daily', icon: TrendingUp, color: GOLD },
  { id: 'cbdr', title: 'CBDR & Flout',          desc: 'Central Bank Dealer Range — Asian consolidation predicts NY move', icon: Globe, color: '#fb923c' },
  { id: 'ote',  title: 'OTE Entry Model',       desc: '61.8%–79% fib retracement into OB + FVG confluence = optimal entry', icon: Target, color: '#22c55e' },
]

const ORDER_FLOW_TOPICS = [
  { title: 'What is Order Flow?',    desc: 'The real-time battle between buyers and sellers at every price level' },
  { title: 'Delta & CVD',            desc: 'Cumulative Volume Delta — net aggressor buying vs selling pressure' },
  { title: 'Bid/Ask Imbalances',     desc: 'Where one side dominated — future price magnet zones' },
  { title: 'Absorption Patterns',    desc: 'Large passive orders absorbing aggressive market flow' },
  { title: 'Footprint Charts',       desc: 'Reading buy/sell volume at each price tick inside a candle' },
  { title: 'Stacked Imbalances',     desc: 'Multiple consecutive imbalances = institutional iceberg orders' },
  { title: 'Order Flow + OB Entry',  desc: 'Confirming Alchemist OB entries with aggressive delta shifts' },
  { title: 'Stopping Volume',        desc: 'High volume + small range candle = smart money accumulation/distribution' },
]

const PRACTICE_SCENARIOS = [
  { id: 1, title: 'Identify the Order Block',     desc: 'Locate the key institutional OB given a price structure description', difficulty: 'Easy' },
  { id: 2, title: 'Spot the FVG',                 desc: 'Identify Fair Value Gaps in a 3-candle sequence', difficulty: 'Easy' },
  { id: 3, title: 'Map the Liquidity',             desc: 'Chart all BSL and SSL zones on a given market context', difficulty: 'Medium' },
  { id: 4, title: 'CHoCH or BOS?',                desc: 'Determine if a structure event signals reversal or continuation', difficulty: 'Medium' },
  { id: 5, title: 'Grade the Setup A–C',           desc: 'Apply the 6-confluence model to grade a full setup', difficulty: 'Medium' },
  { id: 6, title: 'Detect the Judas Swing',        desc: 'Identify a false session open that sweeps liquidity first', difficulty: 'Hard' },
  { id: 7, title: 'Read the Auction Phase',        desc: 'Classify market state: trending, balancing, or breaking out', difficulty: 'Hard' },
  { id: 8, title: 'Full Alchemist Trade Plan',     desc: 'Build a complete trade plan: HTF bias → LTF entry → TP → SL → grade', difficulty: 'Elite' },
]

const TIER_COLORS: Record<string, string> = {
  Foundation:   '#22c55e',
  Intermediate: GOLD,
  Advanced:     '#f97316',
  Elite:        '#a78bfa',
}

// ── Auction Phase Visualizer ──────────────────────────────────────────────────
function AuctionPhaseViz({ phase }: { phase: 'trending' | 'balancing' | 'breakout' }) {
  const bars = phase === 'trending'
    ? [30, 45, 38, 60, 55, 75, 70, 88, 82, 95]
    : phase === 'balancing'
    ? [60, 55, 65, 58, 62, 57, 63, 59, 61, 60]
    : [58, 60, 62, 59, 61, 60, 72, 80, 88, 95]
  const color = phase === 'trending' ? '#22c55e' : phase === 'balancing' ? GOLD : '#f97316'
  return (
    <div className="flex items-end gap-0.5 h-12">
      {bars.map((h, i) => (
        <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }}
          transition={{ delay: i * 0.05, duration: 0.4, ease: 'easeOut' }}
          style={{ width: 8, background: color, opacity: 0.7 + (i / bars.length) * 0.3, borderRadius: 2 }} />
      ))}
    </div>
  )
}

// ── Liquidity Map Visual ──────────────────────────────────────────────────────
function LiquidityMap() {
  return (
    <div className="relative h-48 rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
      <div className="absolute inset-0 flex flex-col justify-between p-3">
        {/* BSL zones */}
        <div className="space-y-1">
          <div className="text-[9px] text-green-400 font-bold uppercase tracking-widest">Buy-Side Liquidity</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-0.5 border-t-2 border-dashed border-green-500/60" />
            <span className="text-[9px] text-green-400 font-mono">EQH · Stops Above</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-0.5 border-t border-dashed border-green-500/30" />
            <span className="text-[9px] text-green-400/60 font-mono">Swing High</span>
          </div>
        </div>
        {/* Current price */}
        <div className="flex items-center gap-2">
          <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
            className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(212,175,55,0.8)] shrink-0" />
          <div className="flex-1 h-px bg-yellow-400/60" />
          <span className="text-[9px] font-bold font-mono" style={{ color: GOLD }}>CURRENT PRICE</span>
        </div>
        {/* SSL zones */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-0.5 border-t border-dashed border-red-500/30" />
            <span className="text-[9px] text-red-400/60 font-mono">Swing Low</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-0.5 border-t-2 border-dashed border-red-500/60" />
            <span className="text-[9px] text-red-400 font-mono">EQL · Stops Below</span>
          </div>
          <div className="text-[9px] text-red-400 font-bold uppercase tracking-widest text-right">Sell-Side Liquidity</div>
        </div>
      </div>
    </div>
  )
}

// ── Kill Zone Clock ───────────────────────────────────────────────────────────
function KillZoneClock() {
  const [utcHour, setUtcHour] = useState(new Date().getUTCHours())
  useEffect(() => {
    const t = setInterval(() => setUtcHour(new Date().getUTCHours()), 60000)
    return () => clearInterval(t)
  }, [])
  const zones = [
    { label: 'Asian',          start: 0,  end: 6,  color: '#60a5fa', est: '7pm–1am' },
    { label: 'London Open',    start: 7,  end: 10, color: '#22c55e', est: '2am–5am' },
    { label: 'London Session', start: 7,  end: 16, color: '#34d399', est: '2am–11am' },
    { label: 'NY Open KZ',     start: 13, end: 16, color: '#f97316', est: '8am–11am' },
    { label: 'London Close',   start: 15, end: 17, color: GOLD,      est: '10am–12pm' },
  ]
  return (
    <div className="space-y-2">
      {zones.map(z => {
        const isNow = z.start <= utcHour && utcHour < z.end
        const pct = Math.min(100, Math.max(0, ((utcHour - z.start) / (z.end - z.start)) * 100))
        return (
          <div key={z.label} className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="font-bold" style={{ color: isNow ? z.color : '#555' }}>{z.label}</span>
              <span className="text-gray-600">{z.est} EST {isNow ? '← NOW' : ''}</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/60 overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ background: z.color, opacity: isNow ? 1 : 0.25 }}
                initial={{ width: 0 }} animate={{ width: isNow ? `${pct}%` : '100%' }}
                transition={{ duration: 1 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Prose renderer ────────────────────────────────────────────────────────────
function AIProse({ content, loading, empty }: { content: string; loading: boolean; empty: string }) {
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-40 gap-3">
      <div className="relative">
        <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: G20, borderTopColor: GOLD }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Brain className="w-4 h-4" style={{ color: GOLD }} />
        </div>
      </div>
      <span className="text-xs text-gray-600 animate-pulse">Alchemist AI is teaching…</span>
    </div>
  )
  if (!content) return (
    <div className="flex flex-col items-center justify-center h-40 text-gray-700 gap-2 text-center">
      <Brain className="w-10 h-10 opacity-20" />
      <p className="text-xs">{empty}</p>
    </div>
  )
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-yellow-400 prose-strong:text-white prose-code:text-yellow-300 prose-li:text-gray-300">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketMechanics() {
  const [activeTab, setActiveTab] = useState('amt')
  const [selectedLesson, setSelectedLesson] = useState<number | null>(null)
  const [lessonContent, setLessonContent] = useState('')
  const [loadingLesson, setLoadingLesson] = useState(false)
  const [completedLessons, setCompletedLessons] = useState<number[]>([1, 2])
  const [selectedLiquidityConcept, setSelectedLiquidityConcept] = useState<string | null>(null)
  const [liquidityContent, setLiquidityContent] = useState('')
  const [loadingLiquidity, setLoadingLiquidity] = useState(false)
  const [selectedICT, setSelectedICT] = useState<string | null>(null)
  const [ictContent, setIctContent] = useState('')
  const [loadingICT, setLoadingICT] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [topicContent, setTopicContent] = useState('')
  const [loadingTopic, setLoadingTopic] = useState(false)
  const [selectedPair, setSelectedPair] = useState('XAUUSD')
  const [volumeAnalysis, setVolumeAnalysis] = useState('')
  const [loadingVolume, setLoadingVolume] = useState(false)
  const [practiceQuestion, setPracticeQuestion] = useState('')
  const [practiceAnswer, setPracticeAnswer] = useState('')
  const [practiceResponse, setPracticeResponse] = useState('')
  const [loadingPractice, setLoadingPractice] = useState(false)
  const [auctionPhase, setAuctionPhase] = useState<'trending' | 'balancing' | 'breakout'>('trending')

  const { prices, formatPrice } = useLivePrices()
  const livePrice = prices[selectedPair] || 0

  const ai = (prompt: string) => callAlchemistAI(prompt, livePrice, selectedPair)

  const loadLesson = async (lesson: typeof AMT_LESSONS[0]) => {
    setSelectedLesson(lesson.id); setLessonContent(''); setLoadingLesson(true)
    try {
      const content = await ai(`
Teach me "${lesson.title}" — ${lesson.subtitle} in the context of Auction Market Theory and Alchemist SMC trading.

Use this EXACT structure with rich detail:

## 📚 ${lesson.title}
*${lesson.tier} Level — AMT Core Curriculum*

### 🧠 Core Concept
[Deep, precise definition. 3-4 sentences. No fluff — trader-level language.]

### 📈 Why Markets Do This
[The auction theory mechanism behind it. Why does price behave this way? What forces cause it?]

### 🔑 Key Principles
- [Principle 1 with practical implication]
- [Principle 2 with practical implication]
- [Principle 3 with practical implication]
- [Principle 4 — advanced nuance]

### ⚡ Alchemist Application
[Exact, actionable instructions: how does THIS concept enhance OB + FVG + Liquidity setups?]

### 📌 Real Example — ${selectedPair}
[Concrete scenario with approximate price levels based on ${livePrice > 0 ? livePrice : 'current price'}. Walk through the logic step by step.]

### ⚠️ Common Mistakes
[2-3 specific errors traders make with this concept]

### 🎯 Quiz
[One elite-level question that tests deep understanding. Answer at end after a separator.]

---
*Answer: [Answer here]*
      `)
      setLessonContent(content)
      if (!completedLessons.includes(lesson.id)) setCompletedLessons(p => [...p, lesson.id])
    } catch { setLessonContent('⚠️ Failed to load. Please try again.') }
    setLoadingLesson(false)
  }

  const loadLiquidityConcept = async (c: typeof LIQUIDITY_CONCEPTS[0]) => {
    setSelectedLiquidityConcept(c.id); setLiquidityContent(''); setLoadingLiquidity(true)
    try {
      const content = await ai(`
Teach me about "${c.title}" in SMC/Alchemist trading: ${c.desc}

## ${c.icon} ${c.title}

### What It Is
[Precise definition — how institutions create and target this liquidity]

### How to Identify It
[Step-by-step visual identification on a chart — what does it look like?]

### Institutional Logic
[WHY do institutions specifically target/create this? What are they doing?]

### Setup Rules — Alchemist Entry
[Exact rules for trading this concept: confluence requirements, timing, entry trigger, SL placement, TP target]

### Example on ${selectedPair} at ~${livePrice > 0 ? livePrice : 'current price'}
[Specific scenario with price levels]

### Danger Zones
[What invalidates this setup? When NOT to trade it]
      `)
      setLiquidityContent(content)
    } catch { setLiquidityContent('⚠️ Failed to load.') }
    setLoadingLiquidity(false)
  }

  const loadICT = async (c: typeof ICT_CONCEPTS[0]) => {
    setSelectedICT(c.id); setIctContent(''); setLoadingICT(true)
    try {
      const content = await ai(`
Explain the ICT concept "${c.title}" for a funded Alchemist trader: ${c.desc}

## 🎯 ${c.title}

### ICT Definition
[Exact definition from ICT/Inner Circle Trader methodology]

### Mechanical Rules
[The rules — when does this concept apply, what are the precise conditions?]

### Visual Identification
[How to see this on a chart in real-time — what candle patterns, what structure]

### Integration with Alchemist SMC
[How does ${c.title} + Order Blocks + FVGs + Liquidity create high-probability setups?]

### ${selectedPair} Application at ~${livePrice > 0 ? livePrice : 'current market'}
[Real scenario applying this concept right now]

### Mastery Checklist
- [ ] [Condition 1 you must see]
- [ ] [Condition 2]
- [ ] [Condition 3]
- [ ] [Condition 4 — timing precision]
      `)
      setIctContent(content)
    } catch { setIctContent('⚠️ Failed to load.') }
    setLoadingICT(false)
  }

  const loadTopic = async (topic: typeof ORDER_FLOW_TOPICS[0]) => {
    setSelectedTopic(topic.title); setTopicContent(''); setLoadingTopic(true)
    try {
      const content = await ai(`
Teach me "${topic.title}" in professional Order Flow analysis: ${topic.desc}

## 🌊 ${topic.title}

### Core Mechanics
[What it is and the physics behind it in the market microstructure]

### How to Read It Live
[Step-by-step: what you see on screen, what it tells you, how you act]

### Alchemist + Order Flow Fusion
[How to layer this onto OB + FVG setups for higher conviction entries]

### Warning Signals
[Signs that order flow contradicts your setup — when to stand aside]

### ${selectedPair} Scenario
[Concrete example using current price context]
      `)
      setTopicContent(content)
    } catch { setTopicContent('⚠️ Failed.') }
    setLoadingTopic(false)
  }

  const analyzeVolumeProfile = async () => {
    setLoadingVolume(true); setVolumeAnalysis('')
    try {
      const content = await ai(`
Deep Volume Profile analysis for ${selectedPair}${livePrice > 0 ? ` at ${livePrice}` : ''}.

## 📊 Volume Profile — ${selectedPair}

### Estimated Key Levels
| Level | Price | Significance |
|-------|-------|--------------|
| **POC** | ~[price] | Highest volume node — magnetic |
| **VAH** | ~[price] | Top of 70% value area |
| **VAL** | ~[price] | Bottom of 70% value area |
| **HVN 1** | ~[price] | High Volume Node — acceptance |
| **LVN 1** | ~[price] | Low Volume Node — fast travel |

### Current Price Auction Context
Is ${livePrice > 0 ? livePrice : 'price'} inside or outside value? Acceptance or rejection?

### Auction State Diagnosis
[Is price trending, balancing, or breaking out? What does volume distribution tell us?]

### High-Probability Trade Zones
[Where to look for Alchemist OB entries based on volume structure]

### How to Add Volume Profile to TradingView
1. Click Indicators → search "Volume Profile Fixed Range"
2. Click and drag over your analysis range
3. POC = red horizontal line (most volume)
4. VAH/VAL = yellow dashed lines (70% range)
5. Look for OBs at VAH/VAL + LVN clusters

### Key Insight for Next Session
[What the volume profile suggests for ${selectedPair} direction]
      `)
      setVolumeAnalysis(content)
    } catch { setVolumeAnalysis('⚠️ Analysis failed.') }
    setLoadingVolume(false)
  }

  const startPractice = async (scenario: typeof PRACTICE_SCENARIOS[0]) => {
    setPracticeQuestion(''); setPracticeAnswer(''); setPracticeResponse(''); setLoadingPractice(true)
    try {
      const q = await ai(`
Create an elite practice exercise for "${scenario.title}": ${scenario.desc}

Difficulty: ${scenario.difficulty}

## 🧪 PRACTICE: ${scenario.title}
*Difficulty: ${scenario.difficulty}*

### 📍 Scenario
[Rich, detailed description of a ${selectedPair} price action scenario at ~${livePrice > 0 ? livePrice : 'current market'}. Give specific price levels, candle descriptions, volume context, session timing. Make it feel real.]

### 🎯 Your Task
[Precise instructions on what the trader must identify, decide, or plan]

### 📐 Required Components in Your Answer
- [Component 1]
- [Component 2]  
- [Component 3]
- [Component 4]

### 💡 Hints (don't read until you try)
1. [Hint 1 — nudge without giving away]
2. [Hint 2]
3. [Hint 3]

*Good luck, Alchemist.*
      `)
      setPracticeQuestion(q)
    } catch { setPracticeQuestion('⚠️ Failed to generate.') }
    setLoadingPractice(false)
  }

  const checkAnswer = async () => {
    if (!practiceAnswer.trim() || !practiceQuestion) return
    setLoadingPractice(true); setPracticeResponse('')
    try {
      const fb = await ai(`
Evaluate this practice answer:

SCENARIO:
${practiceQuestion.slice(0, 600)}

TRADER'S ANSWER:
${practiceAnswer}

## ✅ EVALUATION

### Overall Grade: [A+ / A / B / C / Needs Work]

### 💚 What You Nailed
[Specific, genuine praise for correct analysis using Alchemist terminology]

### 🔴 What You Missed
[Honest, direct correction of errors or gaps — no sugarcoating]

### 📖 The Elite Answer
[Full correct answer with all required components — be thorough]

### 🧠 Key Learning
[The single most important takeaway from this exercise]

### 🚀 Level Up Challenge
[A harder follow-up question to push deeper understanding]
      `)
      setPracticeResponse(fb)
    } catch { setPracticeResponse('⚠️ Could not evaluate.') }
    setLoadingPractice(false)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 pb-8">

      {/* ── Cinematic Header ─────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0800 0%, #110e00 50%, #050300 100%)', border: `1px solid ${G30}` }}>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(212,175,55,0.5) 0px, transparent 1px, transparent 20px, rgba(212,175,55,0.5) 21px)', backgroundSize: '28px 28px' }} />
        <div className="relative flex items-center gap-5 p-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-xl opacity-40" style={{ background: GOLD }} />
            <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${G20}, ${G10})`, border: `1px solid ${G30}` }}>
              <BookMarked className="w-7 h-7" style={{ color: GOLD }} />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-widest uppercase text-gray-600">JJ Nexus Pro · Education Engine</span>
            </div>
            <h1 className="font-serif font-black text-2xl tracking-wider" style={{ color: GOLD }}>MARKET MECHANICS</h1>
            <p className="text-xs text-gray-500 mt-0.5">AMT Theory · Liquidity Dynamics · ICT Concepts · Volume Profile · Order Flow · Practice Zone</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={selectedPair} onChange={e => setSelectedPair(e.target.value)}
              className="bg-black/60 border rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors" style={{ borderColor: G20 }}>
              {['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','AUDUSD','NAS100','US30'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {livePrice > 0 && (
              <div className="text-right">
                <div className="font-mono font-black text-lg" style={{ color: GOLD }}>{formatPrice(selectedPair, livePrice)}</div>
                <div className="text-[9px] text-gray-600 uppercase tracking-widest">Live Price</div>
              </div>
            )}
          </div>
        </div>

        {/* Lesson progress bar */}
        <div className="px-5 pb-4 flex items-center gap-3">
          <div className="text-[10px] text-gray-600 whitespace-nowrap">{completedLessons.length}/12 LESSONS</div>
          <div className="flex-1 h-1 rounded-full bg-black/60 overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${GOLD}, #f59e0b)` }}
              initial={{ width: 0 }} animate={{ width: `${(completedLessons.length / 12) * 100}%` }} transition={{ duration: 1 }} />
          </div>
          <div className="text-[10px] font-bold" style={{ color: GOLD }}>{Math.round((completedLessons.length / 12) * 100)}%</div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl p-1 overflow-x-auto" style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${G10}` }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap flex-1 justify-center"
            style={activeTab === tab.id ? { background: GOLD, color: '#000' } : { color: '#555' }}>
            <span>{tab.emoji}</span> <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ══ AMT THEORY ══════════════════════════════════════════════════════ */}
        {activeTab === 'amt' && (
          <motion.div key="amt" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Lesson list */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                <span className="font-black text-sm text-white">📚 AMT CURRICULUM</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: G10, color: GOLD }}>{completedLessons.length}/12</span>
              </div>
              <div className="p-2 space-y-1">
                {AMT_LESSONS.map(lesson => {
                  const done = completedLessons.includes(lesson.id)
                  const active = selectedLesson === lesson.id
                  return (
                    <button key={lesson.id} onClick={() => loadLesson(lesson)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all group"
                      style={{ borderColor: active ? GOLD : done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)', background: active ? G10 : done ? 'rgba(34,197,94,0.04)' : 'transparent' }}>
                      <div className="shrink-0">
                        {done ? <CheckCircle className="w-4 h-4 text-green-400" /> : (
                          <div className="w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold" style={{ borderColor: '#333', color: '#555' }}>{lesson.id}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold truncate" style={{ color: active ? GOLD : 'white' }}>{lesson.title}</div>
                        <div className="text-[9px] text-gray-600 truncate">{lesson.subtitle}</div>
                      </div>
                      <div className="shrink-0">
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${TIER_COLORS[lesson.tier]}15`, color: TIER_COLORS[lesson.tier] }}>{lesson.tier}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {/* Auction phase mini-viz */}
              <div className="p-3 pt-1" style={{ borderTop: `1px solid ${G10}` }}>
                <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Auction Phase Sim</div>
                <div className="flex gap-1 mb-2">
                  {(['trending','balancing','breakout'] as const).map(p => (
                    <button key={p} onClick={() => setAuctionPhase(p)}
                      className="flex-1 py-1 rounded text-[9px] font-bold capitalize transition-colors"
                      style={{ background: auctionPhase === p ? G20 : 'rgba(0,0,0,0.4)', color: auctionPhase === p ? GOLD : '#555', border: `1px solid ${auctionPhase === p ? G30 : 'rgba(255,255,255,0.04)'}` }}>
                      {p}
                    </button>
                  ))}
                </div>
                <AuctionPhaseViz phase={auctionPhase} />
              </div>
            </div>

            {/* Lesson content */}
            <div className="lg:col-span-2 rounded-xl overflow-hidden flex flex-col" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
              <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                <Brain className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
                <div className="flex-1">
                  <div className="text-sm font-black text-white">
                    {selectedLesson ? AMT_LESSONS.find(l => l.id === selectedLesson)?.title : 'Select a Lesson'}
                  </div>
                  {selectedLesson && (
                    <div className="text-[9px]" style={{ color: TIER_COLORS[AMT_LESSONS.find(l => l.id === selectedLesson)?.tier || 'Foundation'] }}>
                      {AMT_LESSONS.find(l => l.id === selectedLesson)?.tier} Level
                    </div>
                  )}
                </div>
                {loadingLesson && <RefreshCcw className="w-3.5 h-3.5 animate-spin text-gray-600" />}
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[420px]">
                <AIProse content={lessonContent} loading={loadingLesson} empty="Select a lesson from the curriculum to begin. Alchemist AI will teach each concept with deep market examples." />
              </div>
            </div>
          </motion.div>
        )}

        {/* ══ LIQUIDITY DYNAMICS ══════════════════════════════════════════════ */}
        {activeTab === 'liquidity' && (
          <motion.div key="liquidity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            <div className="space-y-3">
              <LiquidityMap />
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                <div className="px-4 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                  <span className="font-black text-sm text-white">🧲 LIQUIDITY CONCEPTS</span>
                </div>
                <div className="p-2 space-y-1">
                  {LIQUIDITY_CONCEPTS.map(c => (
                    <button key={c.id} onClick={() => loadLiquidityConcept(c)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all"
                      style={{ borderColor: selectedLiquidityConcept === c.id ? c.color : 'rgba(255,255,255,0.04)', background: selectedLiquidityConcept === c.id ? `${c.color}10` : 'transparent' }}>
                      <span className="text-base shrink-0">{c.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">{c.title}</div>
                        <div className="text-[9px] text-gray-600 truncate">{c.desc}</div>
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-700 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 rounded-xl overflow-hidden flex flex-col" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                <Layers className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
                <span className="font-black text-sm text-white">
                  {selectedLiquidityConcept ? LIQUIDITY_CONCEPTS.find(c => c.id === selectedLiquidityConcept)?.title : 'Select a Concept'}
                </span>
                {loadingLiquidity && <RefreshCcw className="w-3.5 h-3.5 animate-spin text-gray-600 ml-auto" />}
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[500px]">
                <AIProse content={liquidityContent} loading={loadingLiquidity} empty="Select a liquidity concept to learn how smart money creates and targets liquidity zones." />
              </div>
            </div>
          </motion.div>
        )}

        {/* ══ ICT CONCEPTS ════════════════════════════════════════════════════ */}
        {activeTab === 'ict' && (
          <motion.div key="ict" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            <div className="space-y-3">
              {/* Kill Zone Live Clock */}
              <div className="rounded-xl p-4" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="font-black text-sm text-white">KILL ZONE CLOCK</span>
                  <motion.div animate={{ opacity: [1,0.3,1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-1.5 h-1.5 rounded-full bg-green-400 ml-auto" />
                </div>
                <KillZoneClock />
              </div>

              {/* ICT concepts list */}
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                <div className="px-4 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                  <span className="font-black text-sm text-white">🎯 ICT FRAMEWORK</span>
                </div>
                <div className="p-2 space-y-1">
                  {ICT_CONCEPTS.map(c => {
                    const Icon = c.icon
                    return (
                      <button key={c.id} onClick={() => loadICT(c)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all"
                        style={{ borderColor: selectedICT === c.id ? c.color : 'rgba(255,255,255,0.04)', background: selectedICT === c.id ? `${c.color}10` : 'transparent' }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${c.color}15`, border: `1px solid ${c.color}30` }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: c.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-white truncate">{c.title}</div>
                          <div className="text-[9px] text-gray-600 line-clamp-1">{c.desc.split('·')[0]}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 rounded-xl overflow-hidden flex flex-col" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                <Crosshair className="w-4 h-4" style={{ color: GOLD }} />
                <span className="font-black text-sm text-white">
                  {selectedICT ? ICT_CONCEPTS.find(c => c.id === selectedICT)?.title : 'Select an ICT Concept'}
                </span>
                {loadingICT && <RefreshCcw className="w-3.5 h-3.5 animate-spin text-gray-600 ml-auto" />}
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[520px]">
                <AIProse content={ictContent} loading={loadingICT} empty="Select an ICT concept to master the Inner Circle Trader methodology integrated with Alchemist SMC." />
              </div>
            </div>
          </motion.div>
        )}

        {/* ══ VOLUME PROFILE ══════════════════════════════════════════════════ */}
        {activeTab === 'volume' && (
          <motion.div key="volume" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl overflow-hidden" style={{ minHeight: 440, border: `1px solid ${G20}` }}>
              <TradingViewAdvancedChart symbol={selectedPair} showSideToolbar style={{ width: '100%', height: '100%' }} />
            </div>
            <div className="flex flex-col gap-3">
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                  <span className="font-black text-sm text-white">📊 AI VOLUME PROFILE ANALYSIS</span>
                  <button onClick={analyzeVolumeProfile} disabled={loadingVolume}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all disabled:opacity-40"
                    style={{ background: GOLD, color: '#000' }}>
                    <RefreshCcw className={`w-3 h-3 ${loadingVolume ? 'animate-spin' : ''}`} />
                    {loadingVolume ? 'Analyzing...' : 'Run Analysis'}
                  </button>
                </div>
                <div className="p-4 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar">
                  <AIProse content={volumeAnalysis} loading={loadingVolume} empty={`Click "Run Analysis" for deep AI volume profile analysis of ${selectedPair}`} />
                </div>
              </div>
              {/* POC/VAH/VAL legend */}
              <div className="rounded-xl p-4" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                <div className="text-[10px] font-black text-white uppercase tracking-widest mb-3">Volume Profile Levels</div>
                <div className="space-y-2">
                  {[
                    { label: 'POC — Point of Control', desc: 'Highest volume price. Acts as magnet. Expect reactions.', color: '#ef4444' },
                    { label: 'VAH — Value Area High',  desc: 'Top of 70% volume zone. Resistance in downtrend.', color: GOLD },
                    { label: 'VAL — Value Area Low',   desc: 'Bottom of 70% volume zone. Support in uptrend.', color: '#22c55e' },
                    { label: 'HVN — High Volume Node', desc: 'Price acceptance zone. Slows movement.', color: '#60a5fa' },
                    { label: 'LVN — Low Volume Node',  desc: 'Rejection zone. Price travels fast through here.', color: '#f97316' },
                  ].map(l => (
                    <div key={l.label} className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: l.color }} />
                      <div>
                        <div className="text-[10px] font-bold" style={{ color: l.color }}>{l.label}</div>
                        <div className="text-[9px] text-gray-600">{l.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ══ ORDER FLOW ══════════════════════════════════════════════════════ */}
        {activeTab === 'orderflow' && (
          <motion.div key="orderflow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            <div className="space-y-3">
              {/* Delta simulation visual */}
              <div className="rounded-xl p-4" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="font-black text-sm text-white">DELTA SIMULATION</span>
                </div>
                <div className="flex items-end gap-1 h-16">
                  {[12, -8, 22, -5, 35, 18, -3, 28, 42, 15, -12, 38].map((v, i) => (
                    <motion.div key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                      style={{ flex: 1, height: `${Math.abs(v) * 1.5}px`, background: v > 0 ? '#22c55e' : '#ef4444', borderRadius: 2, opacity: 0.8, transformOrigin: 'bottom' }} />
                  ))}
                </div>
                <div className="flex justify-between text-[9px] mt-1">
                  <span className="text-green-500 font-bold">▲ Buy Delta</span>
                  <span className="text-gray-600">Cumulative Volume Delta</span>
                  <span className="text-red-500 font-bold">▼ Sell Delta</span>
                </div>
              </div>

              {/* Topics */}
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                <div className="px-4 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                  <span className="font-black text-sm text-white">🌊 ORDER FLOW TOPICS</span>
                </div>
                <div className="p-2 space-y-1">
                  {ORDER_FLOW_TOPICS.map((topic, i) => (
                    <button key={i} onClick={() => loadTopic(topic)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all"
                      style={{ borderColor: selectedTopic === topic.title ? GOLD : 'rgba(255,255,255,0.04)', background: selectedTopic === topic.title ? G10 : 'transparent' }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0" style={{ background: G10, color: GOLD }}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">{topic.title}</div>
                        <div className="text-[9px] text-gray-600 truncate">{topic.desc}</div>
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-700" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden flex flex-col" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                <Waves className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
                <span className="font-black text-sm text-white">{selectedTopic || 'Select a Topic'}</span>
                {loadingTopic && <RefreshCcw className="w-3.5 h-3.5 animate-spin text-gray-600 ml-auto" />}
              </div>
              <div className="flex-1 overflow-y-auto p-4 min-h-[520px] custom-scrollbar">
                <AIProse content={topicContent} loading={loadingTopic} empty="Select an order flow topic to understand how institutional order flow confirms your Alchemist setups." />
              </div>
            </div>
          </motion.div>
        )}

        {/* ══ PRACTICE ZONE ═══════════════════════════════════════════════════ */}
        {activeTab === 'practice' && (
          <motion.div key="practice" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                <span className="font-black text-sm text-white">🧪 SCENARIOS</span>
              </div>
              <div className="p-2 space-y-1">
                {PRACTICE_SCENARIOS.map(s => {
                  const dc = s.difficulty === 'Easy' ? '#22c55e' : s.difficulty === 'Medium' ? GOLD : s.difficulty === 'Hard' ? '#f97316' : '#a78bfa'
                  return (
                    <button key={s.id} onClick={() => startPractice(s)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all"
                      style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'transparent' }}>
                      <div className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap" style={{ background: `${dc}15`, color: dc, border: `1px solid ${dc}30` }}>{s.difficulty}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">{s.title}</div>
                        <div className="text-[9px] text-gray-600 truncate">{s.desc}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="rounded-xl overflow-hidden flex flex-col" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                <div className="px-4 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                  <span className="font-black text-sm text-white">📋 SCENARIO</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 min-h-[220px] max-h-[320px] custom-scrollbar">
                  <AIProse content={practiceQuestion} loading={loadingPractice && !practiceResponse} empty="Select a practice scenario to begin. Alchemist AI generates realistic, market-accurate challenges." />
                </div>
              </div>

              {practiceQuestion && (
                <div className="rounded-xl p-4" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.7)' }}>
                  <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-2 block">Your Analysis & Answer</label>
                  <textarea value={practiceAnswer} onChange={e => setPracticeAnswer(e.target.value)}
                    placeholder="Write your full analysis using Alchemist terminology — HTF bias, liquidity targets, OB location, entry trigger, SL, TP…"
                    rows={4} className="w-full rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none transition-colors"
                    style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${G20}` }} />
                  <button onClick={checkAnswer} disabled={loadingPractice || !practiceAnswer.trim()}
                    className="mt-3 px-6 py-2 rounded-xl font-black text-sm transition-all disabled:opacity-40"
                    style={{ background: GOLD, color: '#000' }}>
                    {loadingPractice ? 'Evaluating...' : 'Submit for AI Evaluation'}
                  </button>
                </div>
              )}

              {practiceResponse && (
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${G30}`, background: 'rgba(0,0,0,0.7)' }}>
                  <div className="px-4 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
                    <span className="font-black text-sm" style={{ color: GOLD }}>✅ AI EVALUATION</span>
                  </div>
                  <div className="p-4 overflow-y-auto max-h-[400px] custom-scrollbar">
                    <AIProse content={practiceResponse} loading={false} empty="" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  )
}
