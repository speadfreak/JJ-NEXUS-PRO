import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Users, MessageSquare, TrendingUp, TrendingDown, Copy, RefreshCcw,
  Send, Plus, X, Zap, Target, Activity, Globe, AlertTriangle, Clock,
  BarChart2, Brain, Radio, Crosshair, Link, Eye, ChevronRight, Flame
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { warRoomAI } from '@/utils/specializedAI'
import { useLivePrices, formatPriceForSymbol } from '@/utils/priceEngine'
import { getMasterConfluence } from '@/utils/confluenceStore'

interface Participant {
  name: string; color: string; isHost: boolean; role: string; joinedAt: number
}
interface ChatMessage {
  id: string; sender: string; color: string; text: string; timestamp: number; type: 'chat' | 'signal' | 'system'
}
interface Vote { bull: string[]; bear: string[]; neutral: string[] }
interface BattleSignal {
  id: string; pair: string; direction: 'BUY' | 'SELL'; entry: string; sl: string; tp: string
  confidence: number; author: string; timestamp: number; votes: number
}
interface RoomState {
  roomId: string; participants: Participant[]; chat: ChatMessage[]
  votes: Vote; symbol: string; aiAnalysis: string; lastUpdate: number
  signals: BattleSignal[]
}

const COLORS = ['#D4AF37','#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#f87171']
const BATTLE_PAIRS = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','EURJPY','AUDUSD','USDCAD','NAS100','US30']
const ROLES = ['Analyst','Scalper','Swing Trader','News Trader','Risk Manager','Observer']

function generateRoomId() { return Math.random().toString(36).slice(2, 8).toUpperCase() }
function getMyName() {
  let n = localStorage.getItem('warroom_name')
  if (!n) { n = `Trader${Math.floor(Math.random() * 9000 + 1000)}`; localStorage.setItem('warroom_name', n) }
  return n
}
function getMyRole() { return localStorage.getItem('warroom_role') || ROLES[0] }

function SessionClock() {
  const [utc, setUtc] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setUtc(new Date()), 1000); return () => clearInterval(t) }, [])
  const h = utc.getUTCHours(), m = utc.getUTCMinutes()
  let session = 'Asian Session'
  let sessionColor = 'text-blue-400'
  if (h >= 7 && h < 9) { session = '🔥 London Kill Zone'; sessionColor = 'text-orange-400' }
  else if (h >= 9 && h < 13) { session = 'London Session'; sessionColor = 'text-blue-300' }
  else if (h >= 13 && h < 15) { session = '⚡ NY Kill Zone'; sessionColor = 'text-yellow-400' }
  else if (h >= 15 && h < 22) { session = 'New York Session'; sessionColor = 'text-purple-400' }
  const kzStart = (h < 7) ? 7 : (h < 9) ? 9 : (h < 13) ? 13 : (h < 15) ? 15 : 31
  const kzEnd = (h < 7) ? 9 : (h < 9) ? 9 : (h < 13) ? 15 : (h < 15) ? 15 : 31
  const nowMins = h * 60 + m
  const endMins = kzEnd * 60
  const minsLeft = endMins - nowMins
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <Clock className="w-3 h-3 text-gray-500" />
        <span className="font-mono text-gray-300">{utc.toUTCString().slice(17,22)} UTC</span>
      </div>
      <span className={`font-bold ${sessionColor}`}>{session}</span>
      {minsLeft > 0 && minsLeft < 200 && (
        <span className="text-[10px] text-gray-600">{minsLeft}m left</span>
      )}
    </div>
  )
}

function LivePriceTicker({ pairs }: { pairs: string[] }) {
  const { prices } = useLivePrices()
  const [prevPrices, setPrevPrices] = useState<Record<string,number>>({})
  useEffect(() => {
    const timer = setTimeout(() => setPrevPrices({ ...prices }), 500)
    return () => clearTimeout(timer)
  }, [prices])
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {pairs.slice(0, 8).map(pair => {
        const price = prices[pair] || 0
        const prev = prevPrices[pair] || price
        const up = price >= prev
        const pct = prev > 0 ? ((price - prev) / prev * 100) : 0
        return (
          <div key={pair} className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 hover:border-[rgba(212,175,55,0.2)] transition-colors">
            <span className="text-[11px] font-bold text-gray-300">{pair}</span>
            <span className={`text-[11px] font-mono font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {price > 0 ? formatPriceForSymbol(pair, price) : '—'}
            </span>
            {pct !== 0 && (
              <span className={`text-[9px] ${up ? 'text-emerald-500' : 'text-red-500'}`}>
                {up ? '▲' : '▼'}{Math.abs(pct).toFixed(3)}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PairStrengthMeter({ pairs, votes }: { pairs: string[]; votes: Vote }) {
  const { prices } = useLivePrices()
  const confluence = getMasterConfluence(pairs[0] || 'XAUUSD')
  const totalVotes = votes.bull.length + votes.bear.length + votes.neutral.length
  const bullPct = totalVotes ? Math.round(votes.bull.length / totalVotes * 100) : 0
  const bearPct = totalVotes ? Math.round(votes.bear.length / totalVotes * 100) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-gray-500 font-medium uppercase tracking-wider">Trader Consensus</span>
        <span className="text-gray-600">{totalVotes} votes</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="flex-1 h-3 bg-black/60 rounded-full overflow-hidden">
            <motion.div className="h-full bg-emerald-500 rounded-full" animate={{ width: `${bullPct}%` }} transition={{ duration: 0.5 }} />
          </div>
          <span className="text-xs text-emerald-400 font-bold w-10 text-right">BULL {bullPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <div className="flex-1 h-3 bg-black/60 rounded-full overflow-hidden">
            <motion.div className="h-full bg-red-500 rounded-full" animate={{ width: `${bearPct}%` }} transition={{ duration: 0.5 }} />
          </div>
          <span className="text-xs text-red-400 font-bold w-10 text-right">BEAR {bearPct}%</span>
        </div>
      </div>
      {confluence.sources.length > 0 && (
        <div className="mt-3 p-2 rounded-lg bg-[rgba(212,175,55,0.06)] border border-[rgba(212,175,55,0.15)]">
          <div className="text-[10px] text-gray-500 mb-1">Platform Confluence</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-black/60 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${confluence.score}%` }} />
            </div>
            <span className="text-[10px] text-[var(--gold)] font-bold">{confluence.score}%</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">{confluence.overallBias}</div>
        </div>
      )}
    </div>
  )
}

function BattleSignalCard({ signal, onVote }: { signal: BattleSignal; onVote: () => void }) {
  const isBuy = signal.direction === 'BUY'
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      className={`border rounded-xl p-3 ${isBuy ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-black px-2 py-0.5 rounded ${isBuy ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
            {isBuy ? '📈 BUY' : '📉 SELL'} {signal.pair}
          </span>
          <span className="text-[10px] text-gray-500">{signal.author}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${signal.confidence >= 70 ? 'bg-emerald-400' : signal.confidence >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`} />
          <span className="text-[10px] text-gray-400">{signal.confidence}%</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
        <div><span className="text-gray-600">Entry</span><div className="font-mono text-white">{signal.entry}</div></div>
        <div><span className="text-gray-600">SL</span><div className="font-mono text-red-400">{signal.sl}</div></div>
        <div><span className="text-gray-600">TP</span><div className="font-mono text-emerald-400">{signal.tp}</div></div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-gray-600">{new Date(signal.timestamp).toLocaleTimeString()}</span>
        <button onClick={onVote} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[var(--gold)] transition-colors">
          👍 {signal.votes}
        </button>
      </div>
    </motion.div>
  )
}

export default function WarRoom() {
  const [roomId, setRoomId] = useState<string | null>(null)
  const [joinInput, setJoinInput] = useState('')
  const [myName] = useState(getMyName)
  const [myColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)])
  const [myRole, setMyRole] = useState(getMyRole)
  const [state, setState] = useState<RoomState | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'signals' | 'intel'>('chat')
  const [showSignalForm, setShowSignalForm] = useState(false)
  const [newSignal, setNewSignal] = useState({ pair: 'XAUUSD', dir: 'BUY' as 'BUY'|'SELL', entry: '', sl: '', tp: '', confidence: 70 })
  const chatEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { prices } = useLivePrices()

  const getStorageKey = (rid: string) => `warroom_v2_${rid}`
  const readState = useCallback((rid: string): RoomState | null => {
    try { const raw = localStorage.getItem(getStorageKey(rid)); return raw ? JSON.parse(raw) : null } catch { return null }
  }, [])
  const writeState = useCallback((rid: string, s: RoomState) => {
    localStorage.setItem(getStorageKey(rid), JSON.stringify({ ...s, lastUpdate: Date.now() }))
  }, [])

  const createRoom = () => {
    const rid = generateRoomId()
    const initial: RoomState = {
      roomId: rid,
      participants: [{ name: myName, color: myColor, isHost: true, role: myRole, joinedAt: Date.now() }],
      chat: [{ id: 'sys_0', sender: 'WAR COMMANDER', color: '#D4AF37', text: `🚀 War Room ${rid} is ACTIVE. Battle stations ready. Share the room code to invite traders.`, timestamp: Date.now(), type: 'system' }],
      votes: { bull: [], bear: [], neutral: [] },
      symbol: 'XAUUSD', aiAnalysis: '', lastUpdate: Date.now(), signals: [],
    }
    writeState(rid, initial)
    setRoomId(rid)
    setState(initial)
  }

  const joinRoom = (rid: string) => {
    const s = readState(rid)
    if (!s) { alert('Room not found. Check the room code and try again.'); return }
    if (!s.participants.find(p => p.name === myName)) {
      const sysMsg: ChatMessage = { id: Date.now().toString(), sender: 'WAR COMMANDER', color: '#D4AF37', text: `⚡ ${myName} (${myRole}) has joined the battle.`, timestamp: Date.now(), type: 'system' }
      s.participants.push({ name: myName, color: myColor, isHost: false, role: myRole, joinedAt: Date.now() })
      s.chat = [...s.chat.slice(-99), sysMsg]
      writeState(rid, s)
    }
    setRoomId(rid)
    setState(s)
  }

  useEffect(() => {
    if (!roomId) return
    pollRef.current = setInterval(() => { const s = readState(roomId); if (s) setState(s) }, 1500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [roomId, readState])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [state?.chat])

  const sendMessage = (type: 'chat' | 'system' = 'chat') => {
    if (!chatInput.trim() || !roomId || !state) return
    const msg: ChatMessage = { id: Date.now().toString(), sender: myName, color: myColor, text: chatInput.trim(), timestamp: Date.now(), type }
    const next = { ...state, chat: [...state.chat.slice(-99), msg] }
    writeState(roomId, next); setState(next); setChatInput('')
  }

  const castVote = (direction: 'bull' | 'bear' | 'neutral') => {
    if (!roomId || !state) return
    const votes = { bull: state.votes.bull.filter(n => n !== myName), bear: state.votes.bear.filter(n => n !== myName), neutral: state.votes.neutral.filter(n => n !== myName) }
    votes[direction] = [...votes[direction], myName]
    const sysMsg: ChatMessage = { id: Date.now().toString(), sender: 'WAR COMMANDER', color: '#D4AF37', text: `📊 ${myName} voted ${direction.toUpperCase()} on ${state.symbol}`, timestamp: Date.now(), type: 'system' }
    const next = { ...state, votes, chat: [...state.chat.slice(-99), sysMsg] }
    writeState(roomId, next); setState(next)
  }

  const postSignal = () => {
    if (!roomId || !state || !newSignal.entry) return
    const signal: BattleSignal = {
      id: Date.now().toString(), pair: newSignal.pair, direction: newSignal.dir,
      entry: newSignal.entry, sl: newSignal.sl, tp: newSignal.tp,
      confidence: newSignal.confidence, author: myName, timestamp: Date.now(), votes: 0,
    }
    const sysMsg: ChatMessage = {
      id: Date.now().toString() + '_s', sender: 'SIGNAL BOT', color: '#4ade80',
      text: `🎯 SIGNAL: ${newSignal.dir} ${newSignal.pair} | Entry: ${newSignal.entry} | SL: ${newSignal.sl} | TP: ${newSignal.tp} | Confidence: ${newSignal.confidence}% — by ${myName}`,
      timestamp: Date.now(), type: 'signal'
    }
    const next = { ...state, signals: [signal, ...state.signals.slice(0, 19)], chat: [...state.chat.slice(-99), sysMsg] }
    writeState(roomId, next); setState(next)
    setShowSignalForm(false); setNewSignal({ pair: 'XAUUSD', dir: 'BUY', entry: '', sl: '', tp: '', confidence: 70 })
  }

  const voteSignal = (signalId: string) => {
    if (!roomId || !state) return
    const signals = state.signals.map(s => s.id === signalId ? { ...s, votes: s.votes + 1 } : s)
    const next = { ...state, signals }
    writeState(roomId, next); setState(next)
  }

  const getBattleIntel = async () => {
    if (!state) return
    setLoadingAI(true)
    try {
      const totalVotes = state.votes.bull.length + state.votes.bear.length + state.votes.neutral.length
      const activePrices = BATTLE_PAIRS.slice(0, 5).map(p => `${p}: ${prices[p] ? formatPriceForSymbol(p, prices[p]) : 'N/A'}`).join(', ')
      const context = `Trader consensus: ${state.votes.bull.length} bullish, ${state.votes.bear.length} bearish, ${state.votes.neutral.length} neutral (${totalVotes} total). Focused symbol: ${state.symbol}. Live prices: ${activePrices}. Active traders: ${state.participants.length}. Recent signals posted: ${state.signals.length}.`
      const res = await warRoomAI(BATTLE_PAIRS, context)
      setAiAnalysis(res)
      const next = { ...state, aiAnalysis: res }
      writeState(roomId!, next); setState(next)
    } catch (e: any) { setAiAnalysis(`⚠️ Battle intel unavailable: ${e.message}`) }
    setLoadingAI(false)
  }

  const changeSymbol = (sym: string) => {
    if (!roomId || !state) return
    const sysMsg: ChatMessage = { id: Date.now().toString(), sender: 'WAR COMMANDER', color: '#D4AF37', text: `🔄 Battle symbol changed to ${sym}`, timestamp: Date.now(), type: 'system' }
    const next = { ...state, symbol: sym, votes: { bull: [], bear: [], neutral: [] }, chat: [...state.chat.slice(-99), sysMsg] }
    writeState(roomId, next); setState(next)
  }

  // ── LOBBY ───────────────────────────────────────────────────────────────────
  if (!roomId || !state) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col items-center justify-center gap-8 p-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-14 h-14 rounded-2xl bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.3)] flex items-center justify-center">
              <Shield className="w-7 h-7 text-[var(--gold)]" />
            </div>
          </div>
          <h1 className="font-serif font-black text-4xl text-[var(--gold)] tracking-tight">WAR ROOM</h1>
          <p className="text-sm text-gray-500 mt-1">Collaborative Trading Intelligence Command Center</p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
          {[
            { icon: Radio, label: 'Live Signals', desc: 'Post & vote on trade ideas' },
            { icon: Brain, label: 'AI Battle Intel', desc: 'War Commander analysis' },
            { icon: BarChart2, label: 'Consensus Meter', desc: 'Real-time bull/bear votes' },
            { icon: Globe, label: 'Live Prices', desc: 'Real-time market data' },
          ].map(f => (
            <div key={f.label} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[rgba(212,175,55,0.04)] border border-[rgba(212,175,55,0.1)] text-center">
              <f.icon className="w-5 h-5 text-[var(--gold)]" />
              <div className="text-xs font-bold text-white">{f.label}</div>
              <div className="text-[10px] text-gray-600">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Role selector */}
        <div className="w-full max-w-md">
          <label className="text-xs text-gray-500 block mb-2">Your Battle Role</label>
          <select value={myRole} onChange={e => { setMyRole(e.target.value); localStorage.setItem('warroom_role', e.target.value) }}
            className="w-full bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2 text-white text-sm appearance-none focus:outline-none focus:border-[var(--gold)]">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Create / Join */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-md">
          <button onClick={createRoom}
            className="flex flex-col items-center gap-3 p-6 border-2 border-[var(--gold)] rounded-2xl bg-[rgba(212,175,55,0.06)] hover:bg-[rgba(212,175,55,0.12)] transition-all group">
            <Plus className="w-7 h-7 text-[var(--gold)] group-hover:scale-110 transition-transform" />
            <div className="font-bold text-[var(--gold)] text-base">Create Room</div>
            <p className="text-[11px] text-gray-500 text-center">Start a new battle room</p>
          </button>
          <div className="flex flex-col items-center gap-3 p-6 border border-[rgba(212,175,55,0.2)] rounded-2xl bg-[hsl(var(--card))]">
            <Link className="w-7 h-7 text-[var(--gold)]" />
            <div className="font-bold text-white text-base">Join Room</div>
            <input value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())}
              placeholder="ROOM CODE" maxLength={6}
              className="w-full bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2 text-white text-center font-mono uppercase tracking-widest focus:outline-none focus:border-[var(--gold)]"
              onKeyDown={e => e.key === 'Enter' && joinRoom(joinInput)} />
            <button onClick={() => joinRoom(joinInput)} disabled={joinInput.length < 4}
              className="w-full py-2 bg-[var(--gold)] text-black font-bold rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-40">
              Join Battle
            </button>
          </div>
        </div>

        <p className="text-[10px] text-gray-700 text-center max-w-sm">
          War Rooms sync via shared browser storage — share the room code with traders on the same device or open in multiple tabs to simulate multi-user collaboration.
        </p>
      </motion.div>
    )
  }

  const totalVotes = state.votes.bull.length + state.votes.bear.length + state.votes.neutral.length

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col gap-0 overflow-hidden">
      {/* ── TOP BAR ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2.5 border-b border-[rgba(212,175,55,0.15)] bg-[rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <Shield className="w-5 h-5 text-[var(--gold)]" />
              <span className="font-black text-[var(--gold)] tracking-wider">WAR ROOM</span>
              <span className="text-[10px] font-mono text-gray-600 bg-black/40 px-2 py-0.5 rounded border border-white/5">{roomId}</span>
            </div>
            <SessionClock />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-400">{state.participants.length}</span>
            </div>
            <button onClick={() => navigator.clipboard.writeText(roomId)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-xs hover:bg-white/10 transition-colors">
              <Copy className="w-3 h-3" /> Copy Code
            </button>
            <button onClick={() => { setRoomId(null); setState(null) }}
              className="px-2.5 py-1.5 bg-red-900/20 border border-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-900/40 transition-colors">
              Leave
            </button>
          </div>
        </div>
        {/* Live price strip */}
        <div className="mt-2">
          <LivePriceTicker pairs={BATTLE_PAIRS} />
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 min-h-0 overflow-hidden">
        {/* ── LEFT: Chat + Tabs ─── */}
        <div className="flex flex-col min-h-0 border-r border-[rgba(212,175,55,0.1)]">
          {/* Tab bar */}
          <div className="shrink-0 flex items-center gap-0 border-b border-[rgba(212,175,55,0.1)]">
            {[
              { key: 'chat', icon: MessageSquare, label: 'Battle Chat' },
              { key: 'signals', icon: Target, label: `Signals (${state.signals.length})` },
              { key: 'intel', icon: Brain, label: 'AI Intel' },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key as any)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-colors border-b-2 ${
                  activeTab === t.key ? 'border-[var(--gold)] text-[var(--gold)] bg-[rgba(212,175,55,0.05)]' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
            {/* Symbol selector */}
            <div className="ml-auto pr-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-gray-500" />
              <select value={state.symbol} onChange={e => changeSymbol(e.target.value)}
                className="bg-black/60 border border-[rgba(212,175,55,0.3)] rounded px-2 py-1 text-white text-xs appearance-none focus:outline-none">
                {BATTLE_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {/* CHAT TAB */}
            {activeTab === 'chat' && (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {state.chat.map(msg => (
                    <div key={msg.id} className={`flex gap-2 ${msg.sender === myName ? 'flex-row-reverse' : ''}`}>
                      {msg.type === 'system' ? (
                        <div className="w-full flex items-center gap-2 py-1">
                          <div className="flex-1 h-px bg-[rgba(212,175,55,0.1)]" />
                          <span className="text-[10px] text-[var(--gold)] opacity-70">{msg.text}</span>
                          <div className="flex-1 h-px bg-[rgba(212,175,55,0.1)]" />
                        </div>
                      ) : msg.type === 'signal' ? (
                        <div className="w-full p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Target className="w-3 h-3 text-emerald-400" />
                            <span className="text-[10px] text-emerald-400 font-bold">SIGNAL</span>
                            <span className="text-[9px] text-gray-500">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-xs text-gray-300">{msg.text}</p>
                        </div>
                      ) : (
                        <>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-black text-[10px] font-black shrink-0" style={{ background: msg.color }}>
                            {msg.sender.slice(0, 2)}
                          </div>
                          <div className={`max-w-[75%] flex flex-col ${msg.sender === myName ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] text-gray-600">{msg.sender}</span>
                            </div>
                            <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${msg.sender === myName ? 'bg-[rgba(212,175,55,0.15)] text-white' : 'bg-white/5 text-gray-200'}`}>
                              {msg.text}
                            </div>
                            <span className="text-[9px] text-gray-700 mt-0.5">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {state.chat.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-600">
                      <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
                      <p className="text-sm">No messages yet. Start the battle!</p>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t border-[rgba(212,175,55,0.1)] flex gap-2 shrink-0">
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    placeholder={`${myName} (${myRole}): Say something...`}
                    className="flex-1 bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--gold)] placeholder-gray-700" />
                  <button onClick={() => sendMessage()} disabled={!chatInput.trim()}
                    className="px-3 py-2 bg-[var(--gold)] text-black rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-40">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* SIGNALS TAB */}
            {activeTab === 'signals' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Battle Signals</span>
                  <button onClick={() => setShowSignalForm(p => !p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] text-xs font-bold hover:bg-[rgba(212,175,55,0.25)] transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Post Signal
                  </button>
                </div>
                <AnimatePresence>
                  {showSignalForm && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="border border-[rgba(212,175,55,0.2)] rounded-xl p-4 bg-[rgba(212,175,55,0.04)] space-y-3 overflow-hidden">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500 block mb-1">Pair</label>
                          <select value={newSignal.pair} onChange={e => setNewSignal(p => ({ ...p, pair: e.target.value }))}
                            className="w-full bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--gold)]">
                            {BATTLE_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 block mb-1">Direction</label>
                          <div className="grid grid-cols-2 gap-1">
                            {(['BUY', 'SELL'] as const).map(d => (
                              <button key={d} onClick={() => setNewSignal(p => ({ ...p, dir: d }))}
                                className={`py-1.5 rounded text-xs font-bold transition-colors ${newSignal.dir === d ? (d === 'BUY' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white') : 'bg-black/40 border border-gray-700 text-gray-400'}`}>
                                {d === 'BUY' ? '📈' : '📉'} {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[['entry', 'Entry'], ['sl', 'Stop Loss'], ['tp', 'Take Profit']].map(([k, l]) => (
                          <div key={k}>
                            <label className="text-[10px] text-gray-500 block mb-1">{l}</label>
                            <input value={(newSignal as any)[k]} onChange={e => setNewSignal(p => ({ ...p, [k]: e.target.value }))}
                              placeholder="Price"
                              className="w-full bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[var(--gold)]" />
                          </div>
                        ))}
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Confidence: {newSignal.confidence}%</label>
                        <input type="range" min={10} max={100} value={newSignal.confidence} onChange={e => setNewSignal(p => ({ ...p, confidence: Number(e.target.value) }))}
                          className="w-full accent-[var(--gold)]" />
                      </div>
                      <button onClick={postSignal}
                        className="w-full py-2 bg-[var(--gold)] text-black font-bold rounded-lg hover:bg-yellow-300 transition-colors text-sm">
                        🚀 Post Battle Signal
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                {state.signals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                    <Target className="w-8 h-8 opacity-20 mb-2" />
                    <p className="text-sm">No signals posted yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {state.signals.map(sig => (
                      <BattleSignalCard key={sig.id} signal={sig} onVote={() => voteSignal(sig.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI INTEL TAB */}
            {activeTab === 'intel' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-[var(--gold)]" />
                    <span className="font-bold text-sm text-white">WAR COMMANDER INTEL</span>
                  </div>
                  <button onClick={getBattleIntel} disabled={loadingAI}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--gold)] text-black rounded-lg text-xs font-bold hover:bg-yellow-300 transition-colors disabled:opacity-50">
                    <Zap className={`w-3.5 h-3.5 ${loadingAI ? 'animate-pulse' : ''}`} />
                    {loadingAI ? 'Analyzing...' : 'Get Battle Intel'}
                  </button>
                </div>
                {!aiAnalysis && !loadingAI && (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-gray-600">
                    <Crosshair className="w-10 h-10 opacity-20 mb-3" />
                    <p className="text-sm font-medium text-gray-500 mb-1">War Commander Standing By</p>
                    <p className="text-xs">Cast votes first, then request AI battle intelligence for the best analysis</p>
                  </div>
                )}
                {loadingAI && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-8 h-8 border-2 border-[rgba(212,175,55,0.3)] border-t-[var(--gold)] rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">War Commander analyzing...</p>
                  </div>
                )}
                {aiAnalysis && !loadingAI && (
                  <div className="prose prose-invert prose-sm max-w-none prose-headings:text-[var(--gold)] prose-headings:font-bold prose-strong:text-white leading-relaxed">
                    <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Participants + Votes + Actions ─── */}
        <div className="flex flex-col gap-0 min-h-0 overflow-y-auto divide-y divide-[rgba(212,175,55,0.08)]">
          {/* Participants */}
          <div className="p-4 shrink-0">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Online ({state.participants.length})
            </h3>
            <div className="space-y-2">
              {state.participants.map(p => (
                <div key={p.name} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-black text-[10px] font-black shrink-0 relative" style={{ background: p.color }}>
                    {p.name.slice(0, 2)}
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white truncate">{p.name} {p.name === myName && <span className="text-[var(--gold)]">(You)</span>}</div>
                    <div className="text-[9px] text-gray-600">{p.role}</div>
                  </div>
                  {p.isHost && <span className="text-[8px] text-[var(--gold)] px-1.5 py-0.5 rounded bg-[rgba(212,175,55,0.1)]">HOST</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Consensus Meter */}
          <div className="p-4 shrink-0">
            <PairStrengthMeter pairs={[state.symbol]} votes={state.votes} />
          </div>

          {/* Vote buttons */}
          <div className="p-4 shrink-0">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">CAST YOUR VOTE — {state.symbol}</h3>
            <div className="flex gap-2">
              {[
                { dir: 'bull' as const, label: '📈 Bull', active: state.votes.bull.includes(myName), cls: 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20', activeCls: 'bg-emerald-600 border-emerald-600 text-white' },
                { dir: 'bear' as const, label: '📉 Bear', active: state.votes.bear.includes(myName), cls: 'border-red-500/30 text-red-400 hover:bg-red-500/20', activeCls: 'bg-red-600 border-red-600 text-white' },
                { dir: 'neutral' as const, label: '⚪', active: state.votes.neutral.includes(myName), cls: 'border-gray-700 text-gray-400 hover:bg-white/10', activeCls: 'bg-gray-600 border-gray-600 text-white' },
              ].map(v => (
                <button key={v.dir} onClick={() => castVote(v.dir)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs border transition-all ${v.active ? v.activeCls : 'bg-black/30 ' + v.cls}`}>
                  {v.label}
                </button>
              ))}
            </div>
            <div className="mt-2 text-center text-[10px] text-gray-600">{totalVotes} trader{totalVotes !== 1 ? 's' : ''} voted</div>
          </div>

          {/* Quick pair heat map */}
          <div className="p-4 flex-1">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> Pair Heat Map
            </h3>
            <div className="space-y-1.5">
              {BATTLE_PAIRS.slice(0, 8).map(pair => {
                const price = prices[pair] || 0
                const conf = getMasterConfluence(pair)
                const hasBias = conf.sources.length > 0
                return (
                  <button key={pair} onClick={() => changeSymbol(pair)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all border ${
                      state.symbol === pair ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.1)]' : 'border-transparent hover:bg-white/5'
                    }`}>
                    <span className="font-bold text-white w-16 text-left">{pair}</span>
                    <span className="font-mono text-gray-400 flex-1 text-left">{price > 0 ? formatPriceForSymbol(pair, price) : '—'}</span>
                    {hasBias ? (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        conf.overallBias.includes('Bull') ? 'bg-emerald-500/20 text-emerald-400' :
                        conf.overallBias.includes('Bear') ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400'
                      }`}>{conf.overallBias.replace('Strongly ', 'S.')}</span>
                    ) : (
                      <span className="text-[9px] text-gray-700">no data</span>
                    )}
                    {state.symbol === pair && <ChevronRight className="w-3 h-3 text-[var(--gold)]" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
    </motion.div>
  )
}
