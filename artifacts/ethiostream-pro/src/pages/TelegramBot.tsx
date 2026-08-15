import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot, Send, Plus, X, CheckCircle, RefreshCcw, AlertCircle, Copy,
  Settings, Zap, Bold, Italic, Code, Link2, Underline, List,
  Eye, Trash2, Clock, Activity, Users, Wifi, WifiOff,
  BarChart2, MessageSquare, Layers, Radio, ChevronDown, ChevronRight,
  Terminal, Globe, Sparkles, FileText, Image, Hash, PlayCircle,
  PauseCircle, Pin, Volume2, VolumeX, Shield, LayoutDashboard,
  Cpu, Database, Star, CalendarDays, AlignLeft, Type, Strikethrough,
  BookOpen, GraduationCap, Flame, Target, Crosshair, Waves, Brain,
  ChevronLeft, FlaskConical, BookMarked, Wand2, ScrollText, Trophy,
  Lightbulb, HelpCircle, Swords
} from 'lucide-react'
import { callAlchemistAI } from '@/utils/freeAI'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelegramTarget {
  id: string
  chatId: string
  type: 'channel' | 'group' | 'user'
  name: string
  verified: boolean
  memberCount?: number
  description?: string
}

interface BroadcastEntry {
  id: string
  text: string
  targets: string[]
  sentAt: string
  success: boolean
  mode: string
}

interface ScheduledMsg {
  id: string
  text: string
  targetIds: string[]
  fireAt: string
  label: string
  repeat: 'none' | 'daily' | 'weekly'
  fired: boolean
}

interface BotDiag {
  latency: number | null
  pendingUpdates: number
  lastPing: string
  webhookUrl?: string
  description?: string
}

type Tab = 'bridge' | 'studio' | 'academy' | 'media' | 'automation' | 'diagnostics'

// ─── Academy Content Library ──────────────────────────────────────────────────

const ACADEMY_CATEGORIES = [
  {
    id: 'amt', label: 'AMT Theory', emoji: '📚', icon: BookMarked, color: '#D4AF37',
    topics: [
      'Auction Market Theory', 'Value Area & POC', 'Market States', 'Initial Balance',
      'TPO & Market Profile', 'Excess & Failure', 'Auction Rotation', 'Responsive vs Initiative',
      'Price Discovery', 'Profile Skew', 'Naked POC Migration', 'AMT + Alchemist SMC',
    ]
  },
  {
    id: 'liquidity', label: 'Liquidity', emoji: '🧲', icon: Layers, color: '#60a5fa',
    topics: [
      'Buy-Side Liquidity (BSL)', 'Sell-Side Liquidity (SSL)', 'Equal Highs / Equal Lows',
      'Stop Hunt Mechanics', 'Fair Value Gaps (FVG)', 'Order Blocks (OB)',
      'Breaker Blocks', 'Mitigation Blocks',
    ]
  },
  {
    id: 'ict', label: 'ICT Concepts', emoji: '🎯', icon: Crosshair, color: '#f97316',
    topics: [
      'Kill Zones', 'PD Arrays', 'Judas Swing', 'SMT Divergence',
      'Time & Price Theory', 'HTF Draw on Liquidity', 'CBDR & Flout', 'OTE Entry Model',
    ]
  },
  {
    id: 'volume', label: 'Volume Profile', emoji: '📊', icon: BarChart2, color: '#22c55e',
    topics: [
      'What is Volume Profile?', 'POC — Point of Control', 'Value Area (VAH/VAL)',
      'High Volume Nodes (HVN)', 'Low Volume Nodes (LVN)', 'Volume Profile + OB',
      'Naked POC Hunts', 'Profile Shape Analysis',
    ]
  },
  {
    id: 'orderflow', label: 'Order Flow', emoji: '🌊', icon: Waves, color: '#a78bfa',
    topics: [
      'What is Order Flow?', 'Delta & CVD', 'Bid/Ask Imbalances', 'Absorption Patterns',
      'Footprint Charts', 'Stacked Imbalances', 'Order Flow + OB Entry', 'Stopping Volume',
    ]
  },
  {
    id: 'mindset', label: 'Trader Mindset', emoji: '🧠', icon: Brain, color: '#ec4899',
    topics: [
      'The Psychology of Losses', 'Revenge Trading — How to Stop It', 'Building Discipline',
      'Trading Journal Mastery', 'Risk Management Mindset', 'Consistency Over Profits',
      'The 5% Mindset', 'Managing Drawdowns Mentally',
    ]
  },
]

type AcademyFormat = 'lesson' | 'hype' | 'quiz' | 'tip' | 'challenge' | 'story'
const ACADEMY_FORMATS: { id: AcademyFormat; label: string; emoji: string; desc: string }[] = [
  { id: 'lesson',    label: 'Deep Lesson',   emoji: '📚', desc: 'Full structured curriculum post' },
  { id: 'hype',      label: 'Hype Drop',     emoji: '🔥', desc: 'Short, punchy, energy-packed post' },
  { id: 'quiz',      label: 'Quiz Challenge', emoji: '🧠', desc: 'Interactive multiple-choice poll' },
  { id: 'tip',       label: 'Quick Tip',     emoji: '💡', desc: 'One powerful tip with context' },
  { id: 'challenge', label: 'Daily Challenge', emoji: '🏆', desc: 'Action-based community challenge' },
  { id: 'story',     label: 'Story Format',  emoji: '📖', desc: 'Narrative-driven, relatable lesson' },
]

// ─── Template Library ─────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'market-update',
    label: '📊 Market Update',
    icon: '📊',
    text: `📊 <b>DAILY MARKET STRUCTURE UPDATE</b>

🕐 <i>Session: London / New York Overlap</i>

━━━━━━━━━━━━━━━━━━━
🏗️ <b>CURRENT STRUCTURE</b>
Market is currently in a <b>[BULLISH/BEARISH]</b> phase on the higher timeframe. Price is respecting the <b>[key level]</b> zone.

📐 <b>KEY ZONES TO WATCH</b>
• 🔴 Premium Supply: <b>[XXXX.XX]</b>
• 🟢 Discount Demand: <b>[XXXX.XX]</b>
• ⚪ Equilibrium: <b>[XXXX.XX]</b>

💡 <b>BIAS TODAY</b>
Looking for <b>[BUY/SELL]</b> opportunities near the identified POIs. Wait for confirmation — no chasing.

⚠️ <i>Trade what you SEE, not what you THINK.</i>

<i>— JJ NEXUS PRO | Elite Forex Command Center</i>`
  },
  {
    id: 'session-preview',
    label: '🌍 Session Preview',
    icon: '🌍',
    text: `🌍 <b>FOREX SESSION PREVIEW</b>

🇬🇧 <b>London Open</b> → 08:00–09:30 GMT
<i>Focus: EUR, GBP pairs | High liquidity sweep phase</i>

🇺🇸 <b>New York Open</b> → 13:00–15:00 GMT
<i>Focus: Gold, DXY, major pairs | Trend continuation</i>

🔑 <b>WHAT TO LOOK FOR:</b>
✅ London high/low raids before continuation
✅ False breaks of Asian range = sniper entries
✅ DXY inverse correlation with Gold (XAU/USD)
✅ News catalysts at session opens

⏰ <b>EAT SESSION TIMES:</b>
• Asian: 02:00–10:00 EAT
• London: 10:00–18:30 EAT
• New York: 15:00–23:00 EAT
• Overlap: 15:00–18:30 EAT 🔥

<i>— JJ NEXUS PRO</i>`
  },
  {
    id: 'risk-lesson',
    label: '📚 Risk Management',
    icon: '📚',
    text: `📚 <b>RISK MANAGEMENT MASTERCLASS</b>

The #1 reason traders blow accounts is NOT bad analysis — it's <u>poor risk management</u>.

📏 <b>THE GOLDEN RULES:</b>

1️⃣ <b>Never risk more than 1–2% per trade</b>
   → On a $10,000 account: max $200 at risk

2️⃣ <b>Position size formula:</b>
   <code>Lot Size = Risk$ ÷ (SL pips × Pip Value)</code>

3️⃣ <b>Risk:Reward minimum</b>
   → Only take trades with 1:2 R:R or better
   → Win 40% of trades and still be profitable

4️⃣ <b>Max daily loss: 5–6%</b>
   → Hit it? Stop. The market will be there tomorrow.

5️⃣ <b>Correlation risk</b>
   → EURUSD + GBPUSD = same exposure ⚠️

💬 <i>"Amateurs focus on entries. Professionals focus on exits and position sizing."</i>

<i>— JJ NEXUS PRO | Mastery Series</i>`
  },
  {
    id: 'announcement',
    label: '📣 Announcement',
    icon: '📣',
    text: `📣 <b>IMPORTANT ANNOUNCEMENT</b>

━━━━━━━━━━━━━━━━━━━
[Your announcement here]

📌 <b>KEY DETAILS:</b>
• [Detail 1]
• [Detail 2]
• [Detail 3]

❓ <b>QUESTIONS?</b>
Drop them in the comments or DM @[username]

<i>— JJ NEXUS PRO Team</i>`
  },
  {
    id: 'deep-dive',
    label: '🔬 Pair Deep Dive',
    icon: '🔬',
    text: `🔬 <b>PAIR DEEP DIVE — XAUUSD</b>

Gold is one of the most traded instruments in our toolkit. Here's what you NEED to know:

🏛️ <b>FUNDAMENTALS DRIVING GOLD:</b>
• 💵 US Dollar Index (DXY) — inverse correlation
• 📈 US Real Yields — inverse pressure
• 🏦 Fed Policy — rate hike = bearish gold
• 🌐 Risk sentiment — safe haven demand

📊 <b>TECHNICAL CHARACTERISTICS:</b>
• Pip value: $1 per pip (standard lot)
• Average daily range: 1,500–2,500 pips
• Best sessions: London + New York
• Responds well to: Fair Value Gaps, OBs, liquidity sweeps

⚡ <b>SMC PLAYBOOK FOR GOLD:</b>
1. Identify HTF bias (weekly/daily)
2. Mark premium/discount zones
3. Wait for liquidity sweep + CHoCH
4. Enter on 1H/15M OB or FVG
5. Target next liquidity pool

<i>— JJ NEXUS PRO | Pair Analysis Series</i>`
  },
  {
    id: 'mindset',
    label: '💡 Mindset Post',
    icon: '💡',
    text: '',
  },
]

// ─── Poll templates ───────────────────────────────────────────────────────────

const POLL_TEMPLATES = [
  { label: 'Market Sentiment', question: 'What is your bias on XAUUSD today?', options: ['📈 Bullish', '📉 Bearish', '⚪ Neutral / Waiting'] },
  { label: 'Pair Vote', question: 'Which pair are you trading this week?', options: ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'Other'] },
  { label: 'Session Poll', question: 'Which session do you trade most?', options: ['🌏 Asian', '🇬🇧 London', '🇺🇸 New York', '⚡ London/NY Overlap'] },
  { label: 'Experience Check', question: 'How long have you been trading forex?', options: ['< 1 year', '1–2 years', '3–5 years', '5+ years'] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loadLS = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || '') } catch { return fallback }
}

function wrapSelection(textarea: HTMLTextAreaElement, open: string, close: string, setter: (v: string) => void) {
  const { selectionStart: s, selectionEnd: e, value } = textarea
  const selected = value.slice(s, e) || 'text'
  const next = value.slice(0, s) + open + selected + close + value.slice(e)
  setter(next)
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(s + open.length, s + open.length + selected.length)
  }, 10)
}

const LS_TOKEN = 'jjnexus_telegram_token'
const LS_TARGETS = 'jjnexus_telegram_targets_v3'
const LS_HISTORY = 'jjnexus_broadcast_history_v3'
const LS_SCHEDULED = 'jjnexus_scheduled_v2'
const LS_MINDSET = 'jjnexus_daily_mindset_v1'

const MINDSET_MESSAGES = [
  { quote: 'Discipline is choosing what you want most over what you want now.', author: 'Abraham Lincoln' },
  { quote: 'Your edge is not your entry. Your edge is the discipline to wait for it.', author: 'JJ Nexus Pro' },
  { quote: 'A losing trade is tuition. A repeated mistake is a choice.', author: 'JJ Nexus Pro' },
  { quote: 'The market rewards patience more reliably than prediction.', author: 'JJ Nexus Pro' },
  { quote: 'Protect your capital like it is your last account. Trade like tomorrow matters.', author: 'JJ Nexus Pro' },
  { quote: 'You do not need more trades. You need fewer, cleaner decisions.', author: 'JJ Nexus Pro' },
  { quote: 'Confidence comes from keeping promises to your process.', author: 'JJ Nexus Pro' },
  { quote: 'The professional trader is not fearless. They are rule-bound.', author: 'JJ Nexus Pro' },
  { quote: 'When emotions rise, position size must fall.', author: 'JJ Nexus Pro' },
  { quote: 'Consistency is built on boring days when nobody is watching.', author: 'JJ Nexus Pro' },
  { quote: 'Wait for confirmation. Let the impatient trader donate the liquidity.', author: 'JJ Nexus Pro' },
  { quote: 'One excellent setup is worth more than ten forced opportunities.', author: 'JJ Nexus Pro' },
  { quote: 'Your journal tells the truth your memory tries to edit.', author: 'JJ Nexus Pro' },
  { quote: 'The goal is not to be right. The goal is to execute well.', author: 'JJ Nexus Pro' },
  { quote: 'A calm trader sees the chart. A desperate trader sees a rescue.', author: 'JJ Nexus Pro' },
  { quote: 'Master the loss limit and you give your winners room to exist.', author: 'JJ Nexus Pro' },
  { quote: 'Do not chase the candle. Let price return to your level.', author: 'JJ Nexus Pro' },
  { quote: 'Small risk, clear rules, relentless review — that is how accounts compound.', author: 'JJ Nexus Pro' },
  { quote: 'The best trade today may be the one you had the courage to skip.', author: 'JJ Nexus Pro' },
  { quote: 'Trade your plan, not your P&L. The P&L follows the process.', author: 'JJ Nexus Pro' },
  { quote: 'Every setup is optional. Your rules are not.', author: 'JJ Nexus Pro' },
  { quote: 'Boredom is often the price of professionalism.', author: 'JJ Nexus Pro' },
  { quote: 'You cannot control the next trade. You can control the next decision.', author: 'JJ Nexus Pro' },
  { quote: 'Make risk so small that clarity becomes possible.', author: 'JJ Nexus Pro' },
  { quote: 'The market does not owe you a trade. Earn your entry with patience.', author: 'JJ Nexus Pro' },
  { quote: 'A plan written before the trade is strategy. A reason invented after is storytelling.', author: 'JJ Nexus Pro' },
  { quote: 'Your job is not to predict every move — it is to be ready for your move.', author: 'JJ Nexus Pro' },
  { quote: 'Scale your discipline before you scale your lot size.', author: 'JJ Nexus Pro' },
  { quote: 'The trader who survives long enough gets paid for what they learned.', author: 'JJ Nexus Pro' },
  { quote: 'Revenge trading is paying the market to teach the same lesson twice.', author: 'JJ Nexus Pro' },
  { quote: 'Be aggressive with preparation and conservative with risk.', author: 'JJ Nexus Pro' },
]

const dateKey = () => new Date().toISOString().slice(0, 10)
const mindsetPost = (message: typeof MINDSET_MESSAGES[number]) => `💡 <b>TRADER MINDSET OF THE DAY</b>

━━━━━━━━━━━━━━━━━━━

<b>"${message.quote}"</b>
<i>— ${message.author}</i>

━━━━━━━━━━━━━━━━━━━

🔥 <b>TODAY'S STANDARD:</b>
Show up prepared. Wait for your setup. Risk with respect. Execute without negotiation.

✅ Journal the decision, not just the result.
✅ Protect capital before chasing opportunity.
✅ Leave the chart with your discipline intact.

💪 <i>Power comes from doing the right thing when the market tries to rush you.</i>

<i>— JJ NEXUS PRO | Daily Mindset Series</i>`

const getDailyMindset = (): string => {
  const saved = loadLS<{ date: string; text: string } | null>(LS_MINDSET, null)
  if (saved?.date === dateKey() && saved.text) return saved.text
  const start = new Date('2026-01-01T00:00:00Z').getTime()
  const today = new Date(`${dateKey()}T00:00:00Z`).getTime()
  const index = Math.floor((today - start) / 86_400_000) % MINDSET_MESSAGES.length
  const text = mindsetPost(MINDSET_MESSAGES[(index + MINDSET_MESSAGES.length) % MINDSET_MESSAGES.length])
  localStorage.setItem(LS_MINDSET, JSON.stringify({ date: dateKey(), text }))
  return text
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TelegramBot() {
  // Bot
  const [botToken, setBotToken] = useState(() => loadLS(LS_TOKEN, ''))
  const [botInfo, setBotInfo] = useState<{ username: string; name: string; id: number } | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [tokenVisible, setTokenVisible] = useState(false)

  // Targets
  const [targets, setTargets] = useState<TelegramTarget[]>(() => loadLS(LS_TARGETS, []))
  const [addChatId, setAddChatId] = useState('')
  const [addName, setAddName] = useState('')
  const [addType, setAddType] = useState<'channel' | 'group' | 'user'>('channel')
  const [isAddingTarget, setIsAddingTarget] = useState(false)
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([])

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>('bridge')

  // Broadcast Studio
  const [msgText, setMsgText] = useState('')
  const [dailyMindset, setDailyMindset] = useState(() => getDailyMindset())
  const [sendMode, setSendMode] = useState<'HTML' | 'Markdown'>('HTML')
  const [pinOnSend, setPinOnSend] = useState(false)
  const [silentSend, setSilentSend] = useState(false)
  const [protectContent, setProtectContent] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendResult, setSendResult] = useState('')
  const [previewMode, setPreviewMode] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Broadcast history
  const [history, setHistory] = useState<BroadcastEntry[]>(() => loadLS(LS_HISTORY, []))

  // Media Forge — Poll
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [isQuiz, setIsQuiz] = useState(false)
  const [quizCorrect, setQuizCorrect] = useState(0)
  const [isSendingPoll, setIsSendingPoll] = useState(false)
  const [pollResult, setPollResult] = useState('')

  // Media Forge — Photo
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoCaption, setPhotoCaption] = useState('')
  const [isSendingPhoto, setIsSendingPhoto] = useState(false)
  const [photoResult, setPhotoResult] = useState('')

  // Automation
  const [scheduled, setScheduled] = useState<ScheduledMsg[]>(() => loadLS(LS_SCHEDULED, []))
  const [schedText, setSchedText] = useState('')
  const [schedTime, setSchedTime] = useState('08:00')
  const [schedDate, setSchedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [schedRepeat, setSchedRepeat] = useState<'none' | 'daily' | 'weekly'>('none')
  const [schedLabel, setSchedLabel] = useState('')

  // Diagnostics
  const [diag, setDiag] = useState<BotDiag>({ latency: null, pendingUpdates: 0, lastPing: '—' })
  const [isPinging, setIsPinging] = useState(false)
  const [channelStats, setChannelStats] = useState<Record<string, { memberCount: number; title: string }>>({})
  const [isFetchingStats, setIsFetchingStats] = useState(false)

  // Misc
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)

  const loadDailyMindset = () => {
    setMsgText(dailyMindset)
    setActiveTab('studio')
  }

  const saveDailyMindset = (text: string) => {
    setDailyMindset(text)
    localStorage.setItem(LS_MINDSET, JSON.stringify({ date: dateKey(), text }))
  }

  // Academy
  const [academyCat, setAcademyCat] = useState(ACADEMY_CATEGORIES[0])
  const [academyTopic, setAcademyTopic] = useState<string | null>(null)
  const [academyFormat, setAcademyFormat] = useState<AcademyFormat>('lesson')
  const [academyPost, setAcademyPost] = useState('')
  const [academyLoading, setAcademyLoading] = useState(false)
  const [academySendResult, setAcademySendResult] = useState('')
  const [academyDayNum, setAcademyDayNum] = useState(() => {
    const saved = localStorage.getItem('jjnexus_academy_day')
    return saved ? parseInt(saved) : 1
  })

  const apiBase = botToken ? `https://api.telegram.org/bot${botToken}` : ''
  const activeTargets = targets.filter(t => selectedTargetIds.includes(t.id))

  // ── Generate Academy Post ──────────────────────────────────────────────────

  const generateAcademyPost = async () => {
    if (!academyTopic) return
    setAcademyLoading(true); setAcademyPost(''); setAcademySendResult('')
    const day = academyDayNum
    const prompts: Record<AcademyFormat, string> = {
      lesson: `Generate an ELITE structured Telegram educational post for JJ Trades community. 
Topic: "${academyTopic}" (Category: ${academyCat.label})
Day: ${day}

Format it EXACTLY like this — use Telegram HTML formatting (<b>, <i>, <u>, <code>):

🎓 <b>MARKET MECHANICS ACADEMY</b>
━━━━━━━━━━━━━━━━━━━━━━
📅 <i>Day ${day} · ${academyCat.label}</i>

<b>${academyCat.emoji} TODAY'S TOPIC: ${academyTopic.toUpperCase()}</b>

🧠 <b>WHAT IS IT?</b>
[3-4 sentence precise definition in trader language. No fluff.]

📈 <b>WHY THE MARKET DOES THIS</b>
[2-3 sentences on the institutional mechanism behind it]

🔑 <b>THE KEY RULES:</b>
• [Rule 1 — actionable and specific]
• [Rule 2 — with a precise condition]
• [Rule 3 — common mistake to avoid]
• [Rule 4 — elite-level nuance]

⚡ <b>HOW TO APPLY IT:</b>
1️⃣ [Step 1 — what to look for on chart]
2️⃣ [Step 2 — confirmation needed]
3️⃣ [Step 3 — entry trigger]
4️⃣ [Step 4 — where SL goes]

❓ <b>THINK ABOUT THIS:</b>
<i>[One powerful reflection question to make them think deeper]</i>

Drop your answer below 👇 Let's see who's been paying attention!

━━━━━━━━━━━━━━━━━━━━━━
🔥 <b>JJ TRADES | Market Mechanics Academy</b>
📲 <i>Daily lessons · Share with a fellow trader!</i>`,

      hype: `Generate a SHORT, PUNCHY, HIGH-ENERGY Telegram post about "${academyTopic}" for JJ Trades.
Use Telegram HTML. Make it HYPE — like a coach firing up the team before a game.
Max 15 lines. Use big emojis. Make them feel EXCITED to learn.
End with a call to action that gets engagement.
Day ${day}.`,

      quiz: `Create a QUIZ POST about "${academyTopic}" for the JJ Trades Telegram community.
Use Telegram HTML. Structure:
- Attention-grabbing header
- Brief context (2-3 sentences) 
- The quiz question clearly stated
- 4 answer options labeled A, B, C, D (only one correct)
- Tell them to reply with their answer
- Promise to reveal answer tomorrow
- Signature: 🔥 JJ TRADES | Daily Quiz
Day ${day}. Topic: ${academyCat.label}`,

      tip: `Generate ONE powerful trading tip about "${academyTopic}" for JJ Trades Telegram.
Use Telegram HTML. 
Format:
- 💡 bold header
- The tip in 2-3 sentences (concrete, actionable)
- WHY it matters (1-2 sentences)
- Real example or scenario
- Short motivational close
Max 12 lines. Day ${day}.`,

      challenge: `Create a DAILY CHALLENGE POST about "${academyTopic}" for JJ Trades community.
Use Telegram HTML. Format:
- 🏆 dramatic header
- What the challenge IS (specific action to take today)
- Why this builds a skill
- How to share their result in comments
- Reward/recognition for completion
- End with energy and accountability
Day ${day}. Category: ${academyCat.label}`,

      story: `Create a STORY-FORMAT lesson about "${academyTopic}" for JJ Trades Telegram.
Use Telegram HTML. Tell it as a relatable trading story:
- Open with a scenario EVERY trader has faced
- Show the mistake most traders make
- Reveal the insight (the concept being taught)
- How to apply it going forward
- Close with a powerful line
Max 20 lines. Feels personal, not textbook. Day ${day}.`,
    }
    try {
      const content = await callAlchemistAI(prompts[academyFormat], 0, 'XAUUSD')
      setAcademyPost(content)
      const newDay = day + 1
      setAcademyDayNum(newDay)
      localStorage.setItem('jjnexus_academy_day', newDay.toString())
    } catch { setAcademyPost('⚠️ Failed to generate. Please try again.') }
    setAcademyLoading(false)
  }

  const sendAcademyPost = async () => {
    if (!botToken || activeTargets.length === 0 || !academyPost) return
    setAcademySendResult('')
    let ok = 0
    const textToSend = academyPost
    for (const t of activeTargets) {
      try {
        const r = await fetch(`${apiBase}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: t.chatId, text: textToSend, parse_mode: 'HTML' })
        })
        const d = await r.json()
        if (d.ok) ok++
      } catch {}
    }
    const res = ok > 0
      ? `✅ Academy post delivered to ${ok}/${activeTargets.length} target${ok > 1 ? 's' : ''}`
      : '❌ Send failed — ensure bot is admin with post permissions'
    setAcademySendResult(res)
    if (ok > 0) {
      const entry: BroadcastEntry = {
        id: Date.now().toString(), text: `[ACADEMY] ${academyTopic || ''} — ${academyFormat}`.slice(0, 120),
        targets: activeTargets.map(t => t.name), sentAt: new Date().toLocaleTimeString(),
        success: true, mode: 'HTML'
      }
      const updated = [entry, ...history.slice(0, 49)]
      setHistory(updated); localStorage.setItem(LS_HISTORY, JSON.stringify(updated))
    }
  }

  const loadAcademyIntoComposer = () => {
    if (!academyPost) return
    setMsgText(academyPost)
    setSendMode('HTML')
    setActiveTab('studio')
  }

  // ── Bot connect ────────────────────────────────────────────────────────────

  const connectBot = async () => {
    if (!botToken.trim()) return
    setIsConnecting(true); setBotInfo(null); setSendResult('')
    try {
      const r = await fetch(`${apiBase}/getMe`)
      const d = await r.json()
      if (d.ok) {
        setBotInfo({ username: d.result.username, name: d.result.first_name, id: d.result.id })
        localStorage.setItem(LS_TOKEN, botToken)
      } else setSendResult(`❌ ${d.description || 'Invalid token'}`)
    } catch (e: any) { setSendResult(`❌ ${e.message}`) }
    setIsConnecting(false)
  }

  // ── Target management ─────────────────────────────────────────────────────

  const addTarget = async () => {
    if (!addChatId.trim() || !addName.trim()) return
    setIsAddingTarget(true)
    const chatId = addChatId.startsWith('@') || addChatId.startsWith('-') ? addChatId : `-100${addChatId}`
    let verified = false; let memberCount: number | undefined
    if (botToken) {
      try {
        const r = await fetch(`${apiBase}/getChat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId })
        })
        const d = await r.json()
        if (d.ok) {
          verified = true
          const cr = await fetch(`${apiBase}/getChatMemberCount`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId })
          })
          const cd = await cr.json()
          if (cd.ok) memberCount = cd.result
        }
      } catch { }
    }
    const t: TelegramTarget = { id: Date.now().toString(), chatId, type: addType, name: addName, verified, memberCount }
    const updated = [...targets, t]
    setTargets(updated); localStorage.setItem(LS_TARGETS, JSON.stringify(updated))
    setSelectedTargetIds(p => [...p, t.id])
    setAddChatId(''); setAddName('')
    setIsAddingTarget(false)
  }

  const removeTarget = (id: string) => {
    const updated = targets.filter(t => t.id !== id)
    setTargets(updated); localStorage.setItem(LS_TARGETS, JSON.stringify(updated))
    setSelectedTargetIds(p => p.filter(i => i !== id))
  }

  const toggleTarget = (id: string) =>
    setSelectedTargetIds(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id])

  useEffect(() => { setSelectedTargetIds(targets.map(t => t.id)) }, [targets.length])

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!botToken || activeTargets.length === 0 || !msgText.trim()) return
    setIsSending(true); setSendResult('')
    let ok = 0
    for (const t of activeTargets) {
      try {
        const body: any = { chat_id: t.chatId, text: msgText, parse_mode: sendMode }
        if (silentSend) body.disable_notification = true
        if (protectContent) body.protect_content = true
        const r = await fetch(`${apiBase}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const d = await r.json()
        if (d.ok) {
          ok++
          if (pinOnSend && d.result?.message_id) {
            await fetch(`${apiBase}/pinChatMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: t.chatId, message_id: d.result.message_id })
            })
          }
        }
      } catch { }
    }
    const res = ok > 0
      ? `✅ Delivered to ${ok}/${activeTargets.length} target${ok > 1 ? 's' : ''}`
      : '❌ All sends failed — ensure bot is admin with post permissions'
    setSendResult(res)
    if (ok > 0) {
      const entry: BroadcastEntry = {
        id: Date.now().toString(), text: msgText.slice(0, 120) + (msgText.length > 120 ? '…' : ''),
        targets: activeTargets.map(t => t.name), sentAt: new Date().toLocaleTimeString(),
        success: true, mode: sendMode
      }
      const updated = [entry, ...history.slice(0, 49)]
      setHistory(updated); localStorage.setItem(LS_HISTORY, JSON.stringify(updated))
    }
    setIsSending(false)
  }

  // ── Send poll ─────────────────────────────────────────────────────────────

  const sendPoll = async () => {
    const validOpts = pollOptions.filter(o => o.trim())
    if (!botToken || activeTargets.length === 0 || !pollQuestion.trim() || validOpts.length < 2) return
    setIsSendingPoll(true); setPollResult('')
    let ok = 0
    for (const t of activeTargets) {
      try {
        const body: any = {
          chat_id: t.chatId, question: pollQuestion, options: validOpts,
          is_anonymous: isAnonymous, type: isQuiz ? 'quiz' : 'regular'
        }
        if (isQuiz) body.correct_option_id = quizCorrect
        const r = await fetch(`${apiBase}/sendPoll`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const d = await r.json()
        if (d.ok) ok++
      } catch { }
    }
    setPollResult(ok > 0 ? `✅ Poll sent to ${ok} target${ok > 1 ? 's' : ''}` : '❌ Failed to send poll')
    setIsSendingPoll(false)
  }

  // ── Send photo ────────────────────────────────────────────────────────────

  const sendPhoto = async () => {
    if (!botToken || activeTargets.length === 0 || !photoUrl.trim()) return
    setIsSendingPhoto(true); setPhotoResult('')
    let ok = 0
    for (const t of activeTargets) {
      try {
        const body: any = { chat_id: t.chatId, photo: photoUrl }
        if (photoCaption.trim()) { body.caption = photoCaption; body.parse_mode = 'HTML' }
        const r = await fetch(`${apiBase}/sendPhoto`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const d = await r.json()
        if (d.ok) ok++
      } catch { }
    }
    setPhotoResult(ok > 0 ? `✅ Photo sent to ${ok} target${ok > 1 ? 's' : ''}` : '❌ Failed. Ensure URL is a direct image link.')
    setIsSendingPhoto(false)
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  const pingBot = async () => {
    if (!botToken) return
    setIsPinging(true)
    const t0 = Date.now()
    try {
      const r = await fetch(`${apiBase}/getMe`)
      const latency = Date.now() - t0
      const d = await r.json()
      if (d.ok) {
        // Try getUpdates for pending count
        const ur = await fetch(`${apiBase}/getUpdates?limit=1&offset=-1`)
        const ud = await ur.json()
        setDiag({
          latency, pendingUpdates: Array.isArray(ud.result) ? ud.result.length : 0,
          lastPing: new Date().toLocaleTimeString(), description: d.result.first_name
        })
        // Also fetch webhook info
        const wr = await fetch(`${apiBase}/getWebhookInfo`)
        const wd = await wr.json()
        if (wd.ok) setDiag(prev => ({ ...prev, webhookUrl: wd.result.url || '(polling mode)' }))
      } else setDiag(prev => ({ ...prev, latency: null, lastPing: 'Failed' }))
    } catch { setDiag(prev => ({ ...prev, latency: null, lastPing: 'Error' })) }
    setIsPinging(false)
  }

  const fetchChannelStats = async () => {
    if (!botToken || targets.length === 0) return
    setIsFetchingStats(true)
    const stats: typeof channelStats = {}
    for (const t of targets) {
      try {
        const cr = await fetch(`${apiBase}/getChatMemberCount`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: t.chatId })
        })
        const cd = await cr.json()
        const tr = await fetch(`${apiBase}/getChat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: t.chatId })
        })
        const td = await tr.json()
        if (cd.ok) stats[t.id] = { memberCount: cd.result, title: td.ok ? (td.result.title || t.name) : t.name }
      } catch { }
    }
    setChannelStats(stats)
    setIsFetchingStats(false)
  }

  // ── Automation ────────────────────────────────────────────────────────────

  const addScheduled = () => {
    if (!schedText.trim() || !schedTime || !schedDate) return
    const entry: ScheduledMsg = {
      id: Date.now().toString(), text: schedText,
      targetIds: selectedTargetIds.length > 0 ? selectedTargetIds : targets.map(t => t.id),
      fireAt: `${schedDate}T${schedTime}`, label: schedLabel || `Broadcast ${scheduled.length + 1}`,
      repeat: schedRepeat, fired: false
    }
    const updated = [...scheduled, entry]
    setScheduled(updated); localStorage.setItem(LS_SCHEDULED, JSON.stringify(updated))
    setSchedText(''); setSchedLabel('')
  }

  const removeScheduled = (id: string) => {
    const updated = scheduled.filter(s => s.id !== id)
    setScheduled(updated); localStorage.setItem(LS_SCHEDULED, JSON.stringify(updated))
  }

  // Fire scheduled messages
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!botToken) return
      const now = new Date()
      const updated = await Promise.all(scheduled.map(async (s) => {
        if (s.fired) return s
        const fireTime = new Date(s.fireAt)
        if (now >= fireTime) {
          const tgts = targets.filter(t => s.targetIds.includes(t.id))
          for (const t of tgts) {
            try {
              await fetch(`${apiBase}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: t.chatId, text: s.text, parse_mode: 'HTML' })
              })
            } catch { }
          }
          return { ...s, fired: true }
        }
        return s
      }))
      if (updated.some((u, i) => u.fired !== scheduled[i].fired)) {
        setScheduled(updated); localStorage.setItem(LS_SCHEDULED, JSON.stringify(updated))
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [scheduled, botToken, targets])

  // ── Formatting toolbar ────────────────────────────────────────────────────

  const fmt = (open: string, close: string) => {
    if (!textareaRef.current) return
    wrapSelection(textareaRef.current, open, close, setMsgText)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; icon: React.ComponentType<any>; desc: string }[] = [
    { id: 'bridge', label: 'Command Bridge', icon: LayoutDashboard, desc: 'Bot & targets' },
    { id: 'studio', label: 'Broadcast Studio', icon: Radio, desc: 'Rich composer' },
    { id: 'academy', label: 'MM Academy', icon: GraduationCap, desc: 'Teach the market' },
    { id: 'media', label: 'Media Forge', icon: Sparkles, desc: 'Polls & media' },
    { id: 'automation', label: 'Automation', icon: CalendarDays, desc: 'Scheduler' },
    { id: 'diagnostics', label: 'Diagnostics', icon: Activity, desc: 'Health & logs' },
  ]

  const totalMembers = Object.values(channelStats).reduce((s, v) => s + v.memberCount, 0)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-5 pb-8">

      {/* ═══ CINEMATIC HEADER ══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.35)] bg-gradient-to-br from-[#0d0a00] via-[#0a0800] to-black">
        {/* Scan line */}
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent opacity-50 pointer-events-none"
          animate={{ top: ['0%', '100%', '0%'] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(212,175,55,1) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative p-6 flex flex-wrap items-center gap-6">
          {/* Icon + title */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="relative shrink-0">
              <motion.div
                className="w-16 h-16 rounded-2xl border border-[rgba(212,175,55,0.4)] flex items-center justify-center"
                style={{ background: 'radial-gradient(circle at center, rgba(212,175,55,0.15), transparent)' }}
                animate={{ boxShadow: ['0 0 15px rgba(212,175,55,0.2)', '0 0 35px rgba(212,175,55,0.5)', '0 0 15px rgba(212,175,55,0.2)'] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                <Bot className="w-8 h-8 text-[var(--gold)]" />
              </motion.div>
              <motion.div
                className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0a0800] ${botInfo ? 'bg-green-400' : 'bg-gray-600'}`}
                animate={botInfo ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-serif font-bold text-2xl tracking-widest text-[var(--gold)]">TELEGRAM COMMAND CENTER</h1>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] tracking-widest">PRO SUITE</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                {botInfo ? (
                  <span className="text-green-400">● ONLINE · @{botInfo.username} · {botInfo.name}</span>
                ) : (
                  <span className="text-gray-600">● OFFLINE · Connect your bot below</span>
                )}
              </p>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex gap-4 shrink-0">
            {[
              { label: 'TARGETS', val: targets.length.toString(), icon: Globe },
              { label: 'REACH', val: totalMembers > 0 ? `${totalMembers.toLocaleString()}` : targets.length > 0 ? '—' : '0', icon: Users },
              { label: 'BROADCASTS', val: history.length.toString(), icon: Radio },
              { label: 'SCHEDULED', val: scheduled.filter(s => !s.fired).length.toString(), icon: Clock },
            ].map(stat => (
              <div key={stat.label} className="text-center min-w-[56px]">
                <stat.icon className="w-3.5 h-3.5 text-[var(--gold)] mx-auto mb-1 opacity-60" />
                <div className="font-mono text-lg font-bold text-white leading-none">{stat.val}</div>
                <div className="text-[9px] text-gray-600 tracking-widest mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ TABS ═══════════════════════════════════════════════════════════════ */}
      <div className="flex gap-1 p-1.5 bg-black/50 border border-[rgba(212,175,55,0.15)] rounded-2xl backdrop-blur">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-center transition-all duration-300 ${activeTab === tab.id ? 'text-black' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {activeTab === tab.id && (
              <motion.div layoutId="tab-pill"
                className="absolute inset-0 rounded-xl bg-[var(--gold)]"
                style={{ boxShadow: '0 0 20px rgba(212,175,55,0.4)' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              />
            )}
            <tab.icon className="relative w-3.5 h-3.5" />
            <span className="relative text-[10px] font-bold tracking-wide whitespace-nowrap">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══ TAB CONTENT ════════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >

          {/* ────────────── COMMAND BRIDGE ────────────── */}
          {activeTab === 'bridge' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Bot Connection */}
              <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[var(--gold)]" />
                  <span className="font-bold text-sm text-white tracking-wider">BOT AUTHENTICATION</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={tokenVisible ? 'text' : 'password'}
                        value={botToken}
                        onChange={e => setBotToken(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && connectBot()}
                        placeholder="Bot token from @BotFather"
                        className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[var(--gold)] font-mono pr-10 transition-colors"
                      />
                      <button onClick={() => setTokenVisible(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button onClick={connectBot} disabled={isConnecting || !botToken.trim()}
                      className="px-5 py-2.5 rounded-xl bg-[var(--gold)] text-black font-bold text-sm hover:bg-yellow-400 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] flex items-center gap-2">
                      <RefreshCcw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                      {isConnecting ? '…' : 'Connect'}
                    </button>
                  </div>

                  {botInfo && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-4 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                      <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-green-400" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-green-400 text-sm">{botInfo.name}</div>
                        <div className="text-xs text-gray-500 font-mono">@{botInfo.username} · ID: {botInfo.id}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <motion.div className="w-2 h-2 rounded-full bg-green-400"
                          animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                        <span className="text-xs text-green-400 font-bold">ONLINE</span>
                      </div>
                    </motion.div>
                  )}

                  <div className="text-xs text-gray-700 bg-black/30 rounded-xl p-3 space-y-1 font-mono">
                    <p className="text-gray-500 font-bold mb-1">SETUP GUIDE</p>
                    <p>① Search @BotFather → /newbot</p>
                    <p>② Copy the API token and paste above</p>
                    <p>③ Add bot as <b className="text-gray-400">Admin</b> in your channel/group</p>
                    <p>④ Enable "Post Messages" permission</p>
                  </div>
                </div>
              </div>

              {/* Targets */}
              <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[var(--gold)]" />
                    <span className="font-bold text-sm text-white tracking-wider">TARGET CHANNELS & GROUPS</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(212,175,55,0.1)] text-[var(--gold)] font-bold">{targets.length} added</span>
                </div>
                <div className="p-5 space-y-4">
                  {/* Add target */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-[auto_1fr] gap-2">
                      <select value={addType} onChange={e => setAddType(e.target.value as any)}
                        className="bg-black border border-gray-800 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-[var(--gold)]">
                        <option value="channel">📢 Channel</option>
                        <option value="group">👥 Group</option>
                        <option value="user">👤 User</option>
                      </select>
                      <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Display name"
                        className="bg-black border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--gold)] transition-colors" />
                    </div>
                    <div className="flex gap-2">
                      <input value={addChatId} onChange={e => setAddChatId(e.target.value)} placeholder="@username or -100xxxx chat ID"
                        className="flex-1 bg-black border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--gold)] font-mono transition-colors"
                        onKeyDown={e => e.key === 'Enter' && addTarget()} />
                      <button onClick={addTarget} disabled={isAddingTarget || !addChatId.trim() || !addName.trim()}
                        className="px-4 py-2 rounded-xl bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] text-xs font-bold hover:bg-[rgba(212,175,55,0.25)] disabled:opacity-40 transition-all flex items-center gap-1">
                        {isAddingTarget ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Target list */}
                  <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar">
                    {targets.length === 0 && (
                      <div className="text-center py-8 text-gray-700">
                        <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No targets added yet</p>
                      </div>
                    )}
                    {targets.map((t, i) => (
                      <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedTargetIds.includes(t.id) ? 'border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.08)]' : 'border-gray-800 bg-black/20 hover:border-gray-700'}`}
                        onClick={() => toggleTarget(t.id)}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedTargetIds.includes(t.id) ? 'bg-[var(--gold)] border-[var(--gold)]' : 'border-gray-600'}`}>
                          {selectedTargetIds.includes(t.id) && <CheckCircle className="w-3 h-3 text-black" />}
                        </div>
                        <span className="text-sm">{t.type === 'channel' ? '📢' : t.type === 'group' ? '👥' : '👤'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">{t.name}</div>
                          <div className="text-[10px] text-gray-600 font-mono truncate">{t.chatId}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {channelStats[t.id] && (
                            <span className="text-[10px] text-gray-500 font-mono">{channelStats[t.id].memberCount.toLocaleString()} members</span>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${t.verified ? 'bg-green-500/15 text-green-400' : 'bg-gray-800 text-gray-600'}`}>
                            {t.verified ? '✓ verified' : 'unverified'}
                          </span>
                          <button onClick={e => { e.stopPropagation(); removeTarget(t.id) }} className="text-gray-700 hover:text-red-400 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {targets.length > 0 && (
                    <div className="flex items-center justify-between text-[10px] text-gray-600 border-t border-[rgba(212,175,55,0.08)] pt-3">
                      <span>{selectedTargetIds.length}/{targets.length} selected</span>
                      <div className="flex gap-3">
                        <button onClick={() => setSelectedTargetIds(targets.map(t => t.id))} className="hover:text-[var(--gold)] transition-colors">Select all</button>
                        <button onClick={() => setSelectedTargetIds([])} className="hover:text-red-400 transition-colors">Deselect all</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ────────────── BROADCAST STUDIO ────────────── */}
          {activeTab === 'studio' && (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
              {/* Left — composer */}
              <div className="xl:col-span-3 flex flex-col gap-4">
                {/* Formatting toolbar */}
                <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[var(--gold)]" />
                      <span className="font-bold text-sm text-white tracking-wider">RICH MESSAGE COMPOSER</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={sendMode} onChange={e => setSendMode(e.target.value as any)}
                        className="bg-black border border-gray-800 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-[var(--gold)]">
                        <option value="HTML">HTML</option>
                        <option value="Markdown">Markdown</option>
                      </select>
                    </div>
                  </div>

                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-b border-[rgba(212,175,55,0.08)] bg-black/20">
                    {[
                      { icon: Bold, open: '<b>', close: '</b>', label: 'Bold' },
                      { icon: Italic, open: '<i>', close: '</i>', label: 'Italic' },
                      { icon: Underline, open: '<u>', close: '</u>', label: 'Underline' },
                      { icon: Strikethrough, open: '<s>', close: '</s>', label: 'Strike' },
                      { icon: Code, open: '<code>', close: '</code>', label: 'Code' },
                      { icon: AlignLeft, open: '<pre>', close: '</pre>', label: 'Code Block' },
                    ].map(btn => (
                      <button key={btn.label} onClick={() => fmt(btn.open, btn.close)} title={btn.label}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-[rgba(212,175,55,0.1)] transition-all">
                        <btn.icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                    <div className="w-px h-5 bg-gray-800 mx-1" />
                    <button onClick={() => { const url = prompt('Enter URL:'); if (url) fmt(`<a href="${url}">`, '</a>') }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-[rgba(212,175,55,0.1)] transition-all" title="Link">
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setMsgText(p => p + '\n━━━━━━━━━━━━━━━━━━━\n')} title="Divider"
                      className="px-2 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-[rgba(212,175,55,0.1)] transition-all text-[10px]">
                      ━━
                    </button>
                    <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-700">
                      <span className={msgText.length > 3800 ? 'text-red-400' : msgText.length > 3000 ? 'text-yellow-500' : ''}>{msgText.length}/4096</span>
                    </div>
                  </div>

                  <div className="p-4">
                    <textarea ref={textareaRef} value={msgText} onChange={e => setMsgText(e.target.value)}
                      placeholder="Compose your broadcast message here…&#10;&#10;Use the toolbar above to format text, or paste a template from the Template Vault on the right."
                      rows={12}
                      className="w-full bg-black/40 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-[rgba(212,175,55,0.4)] resize-none font-mono leading-relaxed transition-colors custom-scrollbar"
                    />
                  </div>

                  {/* Send options */}
                  <div className="px-4 pb-4 flex flex-wrap items-center gap-3">
                    {[
                      [pinOnSend, setPinOnSend, <Pin className="w-3 h-3" />, 'Pin'],
                      [silentSend, setSilentSend, <VolumeX className="w-3 h-3" />, 'Silent'],
                      [protectContent, setProtectContent, <Shield className="w-3 h-3" />, 'Protect'],
                    ].map(([val, setter, icon, label]: any) => (
                      <button key={label} onClick={() => setter((p: boolean) => !p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border transition-all ${val ? 'border-[rgba(212,175,55,0.4)] text-[var(--gold)] bg-[rgba(212,175,55,0.1)]' : 'border-gray-800 text-gray-600 hover:text-gray-400'}`}>
                        {icon} {label}
                      </button>
                    ))}
                    <div className="flex gap-2 ml-auto">
                      <button onClick={() => navigator.clipboard?.writeText(msgText)} title="Copy"
                        className="px-3 py-1.5 rounded-xl border border-gray-800 text-gray-600 hover:text-white transition-colors text-xs flex items-center gap-1.5">
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </button>
                      <button onClick={() => setMsgText('')}
                        className="px-3 py-1.5 rounded-xl border border-gray-800 text-gray-600 hover:text-red-400 transition-colors text-xs flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" /> Clear
                      </button>
                      <button onClick={sendMessage} disabled={isSending || !msgText.trim() || selectedTargetIds.length === 0 || !botToken}
                        className="px-5 py-1.5 rounded-xl bg-[var(--gold)] text-black text-xs font-bold hover:bg-yellow-400 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] flex items-center gap-2">
                        {isSending ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {isSending ? 'Sending…' : `🚀 SEND TO ${selectedTargetIds.length} TARGET${selectedTargetIds.length !== 1 ? 'S' : ''}`}
                      </button>
                    </div>
                  </div>

                  {sendResult && (
                    <div className={`mx-4 mb-4 p-3 rounded-xl border text-xs flex items-center gap-2 font-medium ${sendResult.includes('✅') ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                      {sendResult.includes('✅') ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                      {sendResult}
                    </div>
                  )}

                  {/* Status bar */}
                  <div className="px-4 pb-4 grid grid-cols-3 gap-2">
                    {[
                      [!!botInfo, botInfo ? `✅ @${botInfo.username}` : '⚠️ Bot offline'],
                      [selectedTargetIds.length > 0, selectedTargetIds.length > 0 ? `✅ ${selectedTargetIds.length} target${selectedTargetIds.length > 1 ? 's' : ''}` : '⚠️ No targets'],
                      [msgText.trim().length > 0, msgText.trim() ? '✅ Message ready' : '⚠️ Empty'],
                    ].map(([ok, label], i) => (
                      <div key={i} className={`text-center text-[10px] p-2 rounded-lg border ${ok ? 'border-green-500/20 bg-green-500/5 text-green-400' : 'border-gray-800 bg-black/20 text-gray-600'}`}>
                        {label as string}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Telegram Phone Preview */}
                {msgText && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-[var(--gold)]" />
                        <span className="font-bold text-sm text-white tracking-wider">LIVE PREVIEW</span>
                      </div>
                      <span className="text-[10px] text-gray-600">Telegram HTML render</span>
                    </div>
                    <div className="p-4 flex justify-center">
                      {/* Phone frame */}
                      <div className="w-full max-w-sm bg-[#0e0e0e] rounded-2xl border border-gray-800 overflow-hidden">
                        {/* Status bar */}
                        <div className="bg-[#1c1c1d] px-4 py-2 flex items-center gap-2 border-b border-[rgba(255,255,255,0.05)]">
                          <div className="w-6 h-6 rounded-full bg-[var(--gold)] flex items-center justify-center text-black text-[8px] font-bold">JJ</div>
                          <div>
                            <div className="text-white text-[10px] font-bold">JJ Trades</div>
                            <div className="text-gray-600 text-[8px]">{targets.find(t => selectedTargetIds[0] === t.id)?.name || 'Preview Channel'}</div>
                          </div>
                        </div>
                        {/* Message bubble */}
                        <div className="p-4 space-y-1">
                          <div className="bg-[#1e1e1f] rounded-xl rounded-tl-sm p-3 text-[11px] leading-relaxed max-h-64 overflow-y-auto custom-scrollbar"
                            dangerouslySetInnerHTML={{
                              __html: msgText
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
                                .replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>')
                                .replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>')
                                .replace(/&lt;s&gt;/g, '<s>').replace(/&lt;\/s&gt;/g, '</s>')
                                .replace(/&lt;code&gt;/g, '<code class="bg-black/40 px-1 rounded font-mono text-[10px] text-green-300">').replace(/&lt;\/code&gt;/g, '</code>')
                                .replace(/&lt;pre&gt;/g, '<pre class="bg-black/60 p-2 rounded font-mono text-[10px] text-gray-300 overflow-x-auto">').replace(/&lt;\/pre&gt;/g, '</pre>')
                                .replace(/&lt;a href="([^"]+)"&gt;/g, '<a href="$1" class="text-[#64aaff] underline" target="_blank">').replace(/&lt;\/a&gt;/g, '</a>')
                                .replace(/\n/g, '<br>')
                            }}
                          />
                          <div className="text-[9px] text-gray-700 text-right">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Right — Template Vault */}
              <div className="xl:col-span-2">
                <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden sticky top-0">
                  <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                    <Star className="w-4 h-4 text-[var(--gold)]" />
                    <span className="font-bold text-sm text-white tracking-wider">TEMPLATE VAULT</span>
                  </div>
                  <div className="p-3 space-y-2 max-h-[680px] overflow-y-auto custom-scrollbar">
                    {TEMPLATES.map(tpl => {
                      const templateText = tpl.id === 'mindset' ? dailyMindset : tpl.text
                      return (
                      <div key={tpl.id} className="rounded-xl border border-gray-800 overflow-hidden hover:border-[rgba(212,175,55,0.3)] transition-colors">
                        <button
                          onClick={() => setExpandedTemplate(expandedTemplate === tpl.id ? null : tpl.id)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 bg-black/30 hover:bg-black/50 transition-colors text-left"
                        >
                          <span className="text-base">{tpl.icon}</span>
                          <span className="text-xs font-bold text-white flex-1">{tpl.label}</span>
                          <ChevronRight className={`w-3.5 h-3.5 text-gray-600 transition-transform ${expandedTemplate === tpl.id ? 'rotate-90' : ''}`} />
                        </button>
                        <AnimatePresence>
                          {expandedTemplate === tpl.id && (
                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                              <pre className="text-[9px] text-gray-500 px-3 py-2 bg-black/20 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto custom-scrollbar font-mono">
                                {templateText}
                              </pre>
                              {tpl.id === 'mindset' && (
                                <div className="px-3 pt-2 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-pink-300">Today's editable mindset</span>
                                    <button
                                      onClick={() => {
                                        const currentIndex = MINDSET_MESSAGES.findIndex(message => dailyMindset.includes(`"${message.quote}"`))
                                        const next = MINDSET_MESSAGES[(currentIndex + 1 + MINDSET_MESSAGES.length) % MINDSET_MESSAGES.length]
                                        const text = mindsetPost(next)
                                        saveDailyMindset(text)
                                      }}
                                      className="text-[9px] text-gray-500 hover:text-[var(--gold)] transition-colors"
                                    >
                                      ✨ New quote
                                    </button>
                                  </div>
                                  <textarea
                                    value={dailyMindset}
                                    onChange={event => saveDailyMindset(event.target.value)}
                                    className="w-full min-h-32 rounded-lg border border-pink-500/20 bg-black/40 px-2.5 py-2 text-[10px] leading-relaxed text-gray-300 outline-none focus:border-pink-400/60 resize-y"
                                    aria-label="Edit today's mindset post"
                                  />
                                </div>
                              )}
                              <div className="px-3 pb-2">
                                <button onClick={() => { setMsgText(templateText); setExpandedTemplate(null); setActiveTab('studio') }}
                                  className="w-full py-1.5 rounded-lg bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] text-[10px] font-bold hover:bg-[rgba(212,175,55,0.25)] transition-all">
                                  ⚡ Load into Composer
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ────────────── MARKET MECHANICS ACADEMY ────────────── */}
          {activeTab === 'academy' && (
            <div className="flex flex-col gap-5">

              {/* Academy Header */}
              <div className="relative rounded-2xl overflow-hidden border border-[rgba(212,175,55,0.4)]"
                style={{ background: 'linear-gradient(135deg, #0a0800 0%, #110e00 40%, #050300 100%)' }}>
                <div className="absolute inset-0 opacity-[0.04]"
                  style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(212,175,55,1) 0px, transparent 1px, transparent 20px, rgba(212,175,55,1) 21px)', backgroundSize: '28px 28px' }} />
                <motion.div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent opacity-60 pointer-events-none"
                  animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} />
                <div className="relative flex items-center gap-5 p-6">
                  <div className="relative">
                    <motion.div className="absolute inset-0 rounded-2xl blur-xl opacity-50" style={{ background: 'var(--gold)' }}
                      animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
                    <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center border border-[rgba(212,175,55,0.4)]"
                      style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.2), transparent)' }}>
                      <GraduationCap className="w-8 h-8 text-[var(--gold)]" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-bold tracking-widest text-gray-600 uppercase mb-1">JJ Nexus Pro · Education Engine</div>
                    <h2 className="font-serif font-black text-2xl tracking-wider text-[var(--gold)]">MARKET MECHANICS ACADEMY</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Generate elite structured lessons · Post directly to your community · Build daily curriculum</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-black font-mono text-[var(--gold)]">Day {academyDayNum}</div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest">Current Post</div>
                    <div className="text-[10px] text-green-400 mt-1 font-bold">{activeTargets.length} target{activeTargets.length !== 1 ? 's' : ''} ready</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

                {/* Left — Topic Picker */}
                <div className="xl:col-span-2 flex flex-col gap-4">

                  {/* Category tabs */}
                  <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-[var(--gold)]" />
                      <span className="font-bold text-sm text-white tracking-wider">CURRICULUM</span>
                    </div>
                    <div className="p-3 space-y-1">
                      {ACADEMY_CATEGORIES.map(cat => (
                        <button key={cat.id} onClick={() => { setAcademyCat(cat); setAcademyTopic(null) }}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all"
                          style={{ borderColor: academyCat.id === cat.id ? cat.color : 'rgba(255,255,255,0.04)', background: academyCat.id === cat.id ? `${cat.color}10` : 'transparent' }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                            style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}30` }}>
                            {cat.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate" style={{ color: academyCat.id === cat.id ? cat.color : '#ccc' }}>{cat.label}</div>
                            <div className="text-[9px] text-gray-600">{cat.topics.length} topics</div>
                          </div>
                          <ChevronRight className="w-3 h-3 text-gray-700 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Topics list */}
                  <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                      <ScrollText className="w-4 h-4" style={{ color: academyCat.color }} />
                      <span className="font-bold text-sm text-white tracking-wider">{academyCat.emoji} {academyCat.label.toUpperCase()}</span>
                    </div>
                    <div className="p-2 space-y-1 max-h-[260px] overflow-y-auto custom-scrollbar">
                      {academyCat.topics.map((topic, i) => (
                        <button key={topic} onClick={() => setAcademyTopic(topic)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all"
                          style={{ borderColor: academyTopic === topic ? academyCat.color : 'rgba(255,255,255,0.04)', background: academyTopic === topic ? `${academyCat.color}12` : 'transparent' }}>
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                            style={{ background: `${academyCat.color}15`, color: academyCat.color }}>{i + 1}</div>
                          <span className="text-xs font-bold flex-1" style={{ color: academyTopic === topic ? academyCat.color : '#bbb' }}>{topic}</span>
                          {academyTopic === topic && <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: academyCat.color }} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right — Generator */}
                <div className="xl:col-span-3 flex flex-col gap-4">

                  {/* Post Format Selector */}
                  <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-[var(--gold)]" />
                      <span className="font-bold text-sm text-white tracking-wider">POST FORMAT</span>
                    </div>
                    <div className="p-3 grid grid-cols-3 gap-2">
                      {ACADEMY_FORMATS.map(fmt => (
                        <button key={fmt.id} onClick={() => setAcademyFormat(fmt.id)}
                          className="flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all"
                          style={{ borderColor: academyFormat === fmt.id ? 'var(--gold)' : 'rgba(255,255,255,0.06)', background: academyFormat === fmt.id ? 'rgba(212,175,55,0.1)' : 'transparent' }}>
                          <span className="text-lg">{fmt.emoji}</span>
                          <span className="text-[10px] font-bold" style={{ color: academyFormat === fmt.id ? 'var(--gold)' : '#777' }}>{fmt.label}</span>
                          <span className="text-[8px] text-gray-700 leading-tight">{fmt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate button + status */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 px-4 py-2.5 rounded-xl border border-[rgba(212,175,55,0.15)] bg-black/30 min-h-[44px] flex items-center">
                      {academyTopic
                        ? <span className="text-sm text-white font-bold">{academyCat.emoji} {academyTopic}</span>
                        : <span className="text-xs text-gray-600 italic">← Select a topic first</span>
                      }
                    </div>
                    <button onClick={generateAcademyPost} disabled={!academyTopic || academyLoading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm transition-all disabled:opacity-40"
                      style={{ background: 'var(--gold)', color: '#000', boxShadow: '0 0 20px rgba(212,175,55,0.4)' }}>
                      {academyLoading
                        ? <><RefreshCcw className="w-4 h-4 animate-spin" /> Generating…</>
                        : <><Sparkles className="w-4 h-4" /> Generate Post</>
                      }
                    </button>
                  </div>

                  {/* Generated content area */}
                  <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden flex-1">
                    <div className="px-4 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-[var(--gold)]" />
                        <span className="font-bold text-sm text-white tracking-wider">GENERATED POST</span>
                      </div>
                      {academyPost && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => navigator.clipboard?.writeText(academyPost)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-800 text-gray-500 hover:text-white text-[10px] transition-colors">
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                          <button onClick={loadAcademyIntoComposer}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[rgba(212,175,55,0.3)] text-[var(--gold)] hover:bg-[rgba(212,175,55,0.1)] text-[10px] font-bold transition-colors">
                            <Send className="w-3 h-3" /> Edit in Studio
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="p-4 min-h-[300px] max-h-[420px] overflow-y-auto custom-scrollbar">
                      {academyLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-4">
                          <div className="relative">
                            <div className="w-14 h-14 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(212,175,55,0.2)', borderTopColor: 'var(--gold)' }} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <GraduationCap className="w-6 h-6 text-[var(--gold)]" />
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-[var(--gold)] font-bold">Alchemist AI is crafting your lesson…</p>
                            <p className="text-xs text-gray-600 mt-1">Building elite curriculum for your community</p>
                          </div>
                        </div>
                      ) : academyPost ? (
                        <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed font-mono">{academyPost}</pre>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                          <GraduationCap className="w-12 h-12 text-gray-800" />
                          <div>
                            <p className="text-gray-600 text-sm font-bold">Select a topic & format</p>
                            <p className="text-gray-700 text-xs mt-1">AI will generate a beautifully structured lesson<br/>formatted for Telegram with full HTML markup</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Send to community */}
                    {academyPost && (
                      <div className="p-4 border-t border-[rgba(212,175,55,0.1)] bg-black/20 flex items-center gap-3">
                        <div className="flex-1">
                          {academySendResult ? (
                            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border ${academySendResult.includes('✅') ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                              {academySendResult.includes('✅') ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                              {academySendResult}
                            </div>
                          ) : (
                            <p className="text-[10px] text-gray-600">Sending to {selectedTargetIds.length} selected target{selectedTargetIds.length !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                        <button onClick={sendAcademyPost} disabled={!botToken || activeTargets.length === 0 || !academyPost}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all disabled:opacity-40"
                          style={{ background: 'var(--gold)', color: '#000', boxShadow: '0 0 20px rgba(212,175,55,0.35)' }}>
                          <Send className="w-4 h-4" />
                          🚀 POST TO COMMUNITY
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tips section */}
                  <div className="rounded-2xl border border-[rgba(212,175,55,0.1)] bg-black/30 p-4">
                    <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">📌 ACADEMY SYSTEM TIPS</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { icon: '📅', tip: 'Post 1 lesson daily for consistent community growth' },
                        { icon: '🔄', tip: 'Alternate formats: lesson → quiz → hype → challenge' },
                        { icon: '🏆', tip: 'Weekly quizzes drive 3x more engagement than posts' },
                        { icon: '💬', tip: 'Ask a question at the end — it drives replies' },
                      ].map((t, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-black/20">
                          <span className="text-sm shrink-0">{t.icon}</span>
                          <span className="text-[10px] text-gray-500 leading-relaxed">{t.tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ────────────── MEDIA FORGE ────────────── */}
          {activeTab === 'media' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Poll Creator */}
              <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[var(--gold)]" />
                  <span className="font-bold text-sm text-white tracking-wider">INTERACTIVE POLL CREATOR</span>
                </div>
                <div className="p-5 space-y-4">
                  {/* Poll templates */}
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Quick Templates</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {POLL_TEMPLATES.map(pt => (
                        <button key={pt.label} onClick={() => { setPollQuestion(pt.question); setPollOptions([...pt.options, '', ''].slice(0, 10).filter((_, i) => i < pt.options.length + 1)) }}
                          className="px-2 py-1.5 rounded-lg border border-gray-800 text-[10px] text-gray-400 hover:text-[var(--gold)] hover:border-[rgba(212,175,55,0.3)] transition-all text-left">
                          {pt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Poll Question</label>
                    <textarea value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="What do you want to ask your audience?"
                      rows={2} className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[var(--gold)] resize-none transition-colors" />
                    <span className="text-[9px] text-gray-700 mt-0.5 block">{pollQuestion.length}/300</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Answer Options (min 2, max 10)</label>
                    <div className="space-y-1.5">
                      {pollOptions.map((opt, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <span className="text-[10px] text-gray-700 w-4 text-right shrink-0">{i + 1}.</span>
                          <input value={opt} onChange={e => {
                            const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next)
                          }} placeholder={`Option ${i + 1}`}
                            className="flex-1 bg-black border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-[rgba(212,175,55,0.4)] transition-colors" />
                          {pollOptions.length > 2 && (
                            <button onClick={() => setPollOptions(p => p.filter((_, j) => j !== i))} className="text-gray-700 hover:text-red-400 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {pollOptions.length < 10 && (
                      <button onClick={() => setPollOptions(p => [...p, ''])}
                        className="mt-2 flex items-center gap-1 text-[10px] text-gray-600 hover:text-[var(--gold)] transition-colors">
                        <Plus className="w-3 h-3" /> Add option
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {[
                      [isAnonymous, setIsAnonymous, 'Anonymous voting'],
                      [isQuiz, setIsQuiz, 'Quiz mode'],
                    ].map(([val, setter, label]: any) => (
                      <label key={label} className="flex items-center gap-2 cursor-pointer">
                        <div onClick={() => setter((p: boolean) => !p)}
                          className={`w-8 h-4 rounded-full relative transition-colors ${val ? 'bg-[var(--gold)]' : 'bg-gray-800'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                        <span className="text-xs text-gray-400">{label}</span>
                      </label>
                    ))}
                  </div>

                  {isQuiz && (
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Correct Answer</label>
                      <select value={quizCorrect} onChange={e => setQuizCorrect(Number(e.target.value))}
                        className="bg-black border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--gold)] w-full">
                        {pollOptions.filter(o => o.trim()).map((opt, i) => (
                          <option key={i} value={i}>{i + 1}. {opt}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button onClick={sendPoll} disabled={isSendingPoll || !pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2 || selectedTargetIds.length === 0}
                    className="w-full py-3 rounded-xl bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] font-bold text-sm hover:bg-[rgba(212,175,55,0.25)] disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                    <BarChart2 className={`w-4 h-4 ${isSendingPoll ? 'animate-pulse' : ''}`} />
                    {isSendingPoll ? 'Launching Poll…' : '🗳️ Launch Poll'}
                  </button>

                  {pollResult && (
                    <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${pollResult.includes('✅') ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                      {pollResult.includes('✅') ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                      {pollResult}
                    </div>
                  )}
                </div>
              </div>

              {/* Photo / Media Sender */}
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                    <Image className="w-4 h-4 text-[var(--gold)]" />
                    <span className="font-bold text-sm text-white tracking-wider">MEDIA LAUNCHER</span>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Image URL</label>
                      <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://example.com/chart.png"
                        className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[var(--gold)] font-mono transition-colors" />
                      <p className="text-[9px] text-gray-700 mt-1">Must be a direct image URL (.jpg, .png, .gif, .webp)</p>
                    </div>
                    {photoUrl && (
                      <div className="rounded-xl border border-gray-800 overflow-hidden bg-black/40">
                        <img src={photoUrl} alt="Preview" className="w-full max-h-48 object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Caption (optional, HTML)</label>
                      <textarea value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} placeholder="Add a caption to your image…" rows={3}
                        className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[var(--gold)] resize-none transition-colors" />
                    </div>
                    <button onClick={sendPhoto} disabled={isSendingPhoto || !photoUrl.trim() || selectedTargetIds.length === 0}
                      className="w-full py-3 rounded-xl bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] font-bold text-sm hover:bg-[rgba(212,175,55,0.25)] disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                      <Image className={`w-4 h-4 ${isSendingPhoto ? 'animate-pulse' : ''}`} />
                      {isSendingPhoto ? 'Sending…' : '🖼️ Send Image'}
                    </button>
                    {photoResult && (
                      <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${photoResult.includes('✅') ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                        {photoResult.includes('✅') ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                        {photoResult}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bot Commands Manager */}
                <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[var(--gold)]" />
                    <span className="font-bold text-sm text-white tracking-wider">BOT COMMAND REFERENCE</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {[
                      { cmd: '/getMe', desc: 'Verify bot identity and status' },
                      { cmd: '/sendMessage', desc: 'Send text message to target' },
                      { cmd: '/sendPoll', desc: 'Create and send interactive poll' },
                      { cmd: '/sendPhoto', desc: 'Send image with optional caption' },
                      { cmd: '/pinChatMessage', desc: 'Pin a message in channel/group' },
                      { cmd: '/getChatMemberCount', desc: 'Fetch audience size' },
                      { cmd: '/forwardMessage', desc: 'Forward message between chats' },
                    ].map(row => (
                      <div key={row.cmd} className="flex items-center gap-3 p-2 rounded-lg bg-black/30 hover:bg-black/50 transition-colors">
                        <code className="text-[10px] text-green-400 font-mono bg-green-500/10 px-2 py-0.5 rounded shrink-0">{row.cmd}</code>
                        <span className="text-[10px] text-gray-500">{row.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ────────────── AUTOMATION ────────────── */}
          {activeTab === 'automation' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Schedule creator */}
              <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[var(--gold)]" />
                  <span className="font-bold text-sm text-white tracking-wider">SCHEDULE A BROADCAST</span>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Label / Name</label>
                    <input value={schedLabel} onChange={e => setSchedLabel(e.target.value)} placeholder="e.g. Daily Market Update"
                      className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[var(--gold)] transition-colors" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Date</label>
                      <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                        className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--gold)] transition-colors" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Time (Local)</label>
                      <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                        className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--gold)] transition-colors" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Repeat</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['none', 'daily', 'weekly'] as const).map(r => (
                        <button key={r} onClick={() => setSchedRepeat(r)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${schedRepeat === r ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.15)] text-[var(--gold)]' : 'border-gray-800 text-gray-600 hover:text-gray-400'}`}>
                          {r === 'none' ? '🔴 Once' : r === 'daily' ? '🔁 Daily' : '📅 Weekly'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Message Content</label>
                    <textarea value={schedText} onChange={e => setSchedText(e.target.value)} placeholder="Your scheduled broadcast message…" rows={6}
                      className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[var(--gold)] resize-none transition-colors font-mono" />
                    <div className="flex justify-end mt-1">
                      <button onClick={() => { if (msgText) { setSchedText(msgText) } }}
                        className="text-[10px] text-gray-600 hover:text-[var(--gold)] transition-colors">
                        ← Import from composer
                      </button>
                    </div>
                  </div>

                  <button onClick={addScheduled} disabled={!schedText.trim() || !schedDate || !schedTime}
                    className="w-full py-3 rounded-xl bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] font-bold text-sm hover:bg-[rgba(212,175,55,0.25)] disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                    <PlayCircle className="w-4 h-4" />
                    ⏰ Schedule Broadcast
                  </button>

                  <div className="text-[10px] text-gray-700 bg-black/30 rounded-xl p-3 space-y-1 font-mono">
                    <p className="text-gray-500 font-bold mb-1">HOW IT WORKS</p>
                    <p>• App checks for due messages every 30 seconds</p>
                    <p>• App must be open in browser to fire</p>
                    <p>• For server-side scheduling, use a webhook server</p>
                  </div>
                </div>
              </div>

              {/* Queue */}
              <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[var(--gold)]" />
                    <span className="font-bold text-sm text-white tracking-wider">BROADCAST QUEUE</span>
                  </div>
                  <span className="text-[10px] text-gray-600">{scheduled.filter(s => !s.fired).length} pending</span>
                </div>
                <div className="p-5">
                  {scheduled.length === 0 ? (
                    <div className="text-center py-16 text-gray-700">
                      <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-bold text-gray-600">No scheduled broadcasts</p>
                      <p className="text-xs mt-1">Create one using the scheduler on the left</p>
                    </div>
                  ) : (
                    <div className="relative space-y-0">
                      {/* Timeline line */}
                      <div className="absolute left-4 top-3 bottom-3 w-px bg-gradient-to-b from-[var(--gold)] via-[rgba(212,175,55,0.3)] to-transparent" />
                      {scheduled.map((s, i) => (
                        <motion.div key={s.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className="flex gap-4 pb-4">
                          {/* Timeline dot */}
                          <div className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${s.fired ? 'border-green-500 bg-green-500/20' : 'border-[var(--gold)] bg-[rgba(212,175,55,0.15)]'}`}>
                            {s.fired ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Clock className="w-3.5 h-3.5 text-[var(--gold)]" />}
                          </div>
                          <div className={`flex-1 rounded-xl border p-3 ${s.fired ? 'border-green-500/20 bg-green-500/5' : 'border-[rgba(212,175,55,0.15)] bg-black/20'}`}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div>
                                <span className="font-bold text-xs text-white">{s.label}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-gray-600 font-mono">{new Date(s.fireAt).toLocaleString()}</span>
                                  {s.repeat !== 'none' && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-bold">{s.repeat}</span>
                                  )}
                                  {s.fired && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-bold">SENT</span>}
                                </div>
                              </div>
                              <button onClick={() => removeScheduled(s.id)} className="text-gray-700 hover:text-red-400 transition-colors shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-600 line-clamp-2 font-mono">
                              {s.text.slice(0, 100)}{s.text.length > 100 ? '…' : ''}
                            </p>
                            <div className="text-[9px] text-gray-700 mt-1">{s.targetIds.length} target{s.targetIds.length !== 1 ? 's' : ''}</div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ────────────── DIAGNOSTICS ────────────── */}
          {activeTab === 'diagnostics' && (
            <div className="flex flex-col gap-5">
              {/* Stat grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'BOT LATENCY', icon: Wifi,
                    val: diag.latency !== null ? `${diag.latency}ms` : '—',
                    color: diag.latency !== null ? (diag.latency < 300 ? 'text-green-400' : diag.latency < 800 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-600',
                    sub: diag.latency !== null ? (diag.latency < 300 ? 'Excellent' : diag.latency < 800 ? 'Good' : 'Poor') : 'Not pinged',
                  },
                  {
                    label: 'PENDING UPDATES', icon: Layers,
                    val: diag.pendingUpdates.toString(),
                    color: diag.pendingUpdates === 0 ? 'text-green-400' : 'text-yellow-400',
                    sub: diag.pendingUpdates === 0 ? 'All clear' : `${diag.pendingUpdates} queued`,
                  },
                  {
                    label: 'TOTAL BROADCASTS', icon: Radio,
                    val: history.length.toString(),
                    color: 'text-[var(--gold)]',
                    sub: history.length > 0 ? `Last: ${history[0]?.sentAt}` : 'None yet',
                  },
                  {
                    label: 'AUDIENCE REACH', icon: Users,
                    val: totalMembers > 0 ? totalMembers.toLocaleString() : targets.length > 0 ? 'Fetch below' : '—',
                    color: 'text-blue-400',
                    sub: `across ${targets.length} target${targets.length !== 1 ? 's' : ''}`,
                  },
                ].map(card => (
                  <motion.div key={card.label}
                    className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[hsl(var(--card))] p-5"
                    whileHover={{ borderColor: 'rgba(212,175,55,0.4)' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{card.label}</span>
                      <card.icon className="w-4 h-4 text-gray-700" />
                    </div>
                    <div className={`font-mono text-3xl font-bold ${card.color} mb-1`}>{card.val}</div>
                    <div className="text-[10px] text-gray-600">{card.sub}</div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {/* Bot health */}
                <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[var(--gold)]" />
                      <span className="font-bold text-sm text-white tracking-wider">BOT HEALTH MONITOR</span>
                    </div>
                    <button onClick={pingBot} disabled={isPinging || !botToken}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] text-[10px] font-bold hover:bg-[rgba(212,175,55,0.25)] disabled:opacity-40 transition-all">
                      <Zap className={`w-3 h-3 ${isPinging ? 'animate-pulse' : ''}`} />
                      {isPinging ? 'Pinging…' : 'Ping Bot'}
                    </button>
                  </div>
                  <div className="p-5 space-y-3">
                    {[
                      { label: 'Bot Status', val: botInfo ? '● ONLINE' : '● OFFLINE', color: botInfo ? 'text-green-400' : 'text-gray-600' },
                      { label: 'Bot Username', val: botInfo ? `@${botInfo.username}` : '—', color: 'text-white' },
                      { label: 'API Latency', val: diag.latency !== null ? `${diag.latency}ms` : '—', color: diag.latency !== null ? (diag.latency < 500 ? 'text-green-400' : 'text-yellow-400') : 'text-gray-600' },
                      { label: 'Webhook Mode', val: diag.webhookUrl || '—', color: 'text-gray-400' },
                      { label: 'Pending Updates', val: `${diag.pendingUpdates} messages`, color: 'text-gray-400' },
                      { label: 'Last Health Check', val: diag.lastPing, color: 'text-gray-400' },
                      { label: 'Active Targets', val: `${targets.length} configured`, color: 'text-gray-400' },
                      { label: 'Selected Targets', val: `${selectedTargetIds.length} active`, color: 'text-[var(--gold)]' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.03)] last:border-0">
                        <span className="text-[10px] text-gray-600 font-mono uppercase tracking-wider">{row.label}</span>
                        <span className={`text-xs font-mono font-bold ${row.color}`}>{row.val}</span>
                      </div>
                    ))}

                    {targets.length > 0 && (
                      <button onClick={fetchChannelStats} disabled={isFetchingStats || !botToken}
                        className="w-full py-2.5 mt-2 rounded-xl bg-black/30 border border-gray-800 text-xs text-gray-400 hover:text-white hover:border-gray-700 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                        <Users className={`w-3.5 h-3.5 ${isFetchingStats ? 'animate-pulse' : ''}`} />
                        {isFetchingStats ? 'Fetching member counts…' : '📊 Refresh Audience Stats'}
                      </button>
                    )}

                    {Object.keys(channelStats).length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest block mb-2">Audience Breakdown</span>
                        {targets.map(t => channelStats[t.id] ? (
                          <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg bg-black/30">
                            <span className="text-sm">{t.type === 'channel' ? '📢' : '👥'}</span>
                            <span className="text-xs text-white flex-1">{channelStats[t.id].title}</span>
                            <span className="font-mono font-bold text-[var(--gold)] text-xs">{channelStats[t.id].memberCount.toLocaleString()}</span>
                            <span className="text-[10px] text-gray-600">members</span>
                          </div>
                        ) : null)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Broadcast Log */}
                <div className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[hsl(var(--card))] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[var(--gold)]" />
                      <span className="font-bold text-sm text-white tracking-wider">BROADCAST LOG</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-600">{history.length} total</span>
                      {history.length > 0 && (
                        <button onClick={() => { setHistory([]); localStorage.removeItem(LS_HISTORY) }}
                          className="text-[10px] text-gray-600 hover:text-red-400 transition-colors flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-[rgba(255,255,255,0.03)] max-h-[480px] overflow-y-auto custom-scrollbar">
                    {history.length === 0 ? (
                      <div className="text-center py-16 text-gray-700">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-bold text-gray-600">No broadcasts yet</p>
                        <p className="text-xs mt-1">Your message history will appear here</p>
                      </div>
                    ) : history.map((h, i) => (
                      <motion.div key={h.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className="p-4 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <CheckCircle className="w-3 h-3 text-green-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-green-400">DELIVERED</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 font-mono">{h.mode}</span>
                              <span className="text-[9px] text-gray-700 font-mono">{h.sentAt}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 font-mono line-clamp-2">{h.text}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {h.targets.map((name, ti) => (
                                <span key={ti} className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(212,175,55,0.08)] text-[var(--gold)] border border-[rgba(212,175,55,0.15)]">{name}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
