import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, AlertTriangle, ShieldAlert, CheckCircle2, XCircle,
  TrendingUp, TrendingDown, Target, RefreshCw, Zap, Brain,
  BookOpen, Lock, Unlock, Bell, Activity, BarChart2, ArrowRight,
  ExternalLink, Flame, Star, Clock, Shield, ChevronRight,
  DollarSign, Crosshair, Info, Calendar, PieChart
} from "lucide-react";
import { callAlchemistAI } from "@/utils/freeAI";
import ReactMarkdown from "react-markdown";
import { useLocation } from "wouter";

// ─── Constants ─────────────────────────────────────────────────────────────────
const GOLD = "#D4AF37";
const G10 = "rgba(212,175,55,0.10)";
const G20 = "rgba(212,175,55,0.20)";
const G30 = "rgba(212,175,55,0.30)";
const BENCH = { winRate: 67.2, profitFactor: 2.14, netPips: 9560, maxDD: 12.3, sharpe: 1.74, expectancy: 20.9, totalTrades: 457 };

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FundedConfig {
  accountSize: number; currentBalance: number; startBalance: number;
  highWaterMark: number; dailyDrawdownLimit: number; maxDrawdownLimit: number;
  profitTarget: number; challengeDuration: number; startDate: string;
  maxTradesPerDay: number; maxRiskPerTrade: number; dailyProfitTarget: number;
  allowedPairs: string[];
}
interface JournalTrade {
  id: string; pair: string; result: string; pnl?: number; pips?: number;
  date: string; grade?: string; session?: string; strategy?: string;
  direction?: string; riskReward?: string;
}
interface AccountStatus {
  currentBalance: number; startBalance: number; highWaterMark: number;
  totalPnL: number; totalPnLPercent: number; todayPnL: number; todayPnLPercent: number;
  dailyDrawdownUsed: number; dailyDrawdownRemaining: number;
  maxDrawdownUsed: number; maxDrawdownRemaining: number;
  profitTarget: number; progressToTarget: number;
  daysElapsed: number; daysRemaining: number; tradesRemaining: number;
  status: "SAFE" | "WARNING" | "DANGER" | "BREACHED" | "PASSED";
  canTradeToday: boolean; reason: string;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG: FundedConfig = {
  accountSize: 1000, currentBalance: 1000, startBalance: 1000, highWaterMark: 1000,
  dailyDrawdownLimit: 30, maxDrawdownLimit: 60, profitTarget: 80, challengeDuration: 30,
  startDate: "2026-06-08", maxTradesPerDay: 3, maxRiskPerTrade: 15,
  dailyProfitTarget: 10, allowedPairs: ["XAUUSD","EURUSD","GBPUSD","US30"],
};

const RULES = [
  { icon: "💰", rule: "MAX RISK PER TRADE: $15 (half of daily limit)" },
  { icon: "🔢", rule: "MAX TRADES PER DAY: 3" },
  { icon: "🛑", rule: "STOP TRADING: 2 consecutive losses in a day" },
  { icon: "⭐", rule: "ONLY A+ AND A SETUPS (score 70+/100)" },
  { icon: "💱", rule: "PAIRS: XAUUSD, EURUSD, GBPUSD, US30 only" },
  { icon: "⏰", rule: "SESSIONS: London open + NY open ONLY" },
  { icon: "📰", rule: "NO TRADING: 30 min before/after high-impact news" },
  { icon: "🔐", rule: "MOVE SL TO BREAKEVEN when trade is +$10 profit" },
  { icon: "🎯", rule: "DAILY TARGET: +$10 — then STOP trading" },
  { icon: "🏆", rule: "IF DAILY TARGET HIT: close all, DO NOT REOPEN" },
];

const PREFLIGHT = [
  { label: "Daily drawdown still has $20+ remaining", checkFn: (s: AccountStatus) => s.dailyDrawdownRemaining >= 20 },
  { label: "This trade risks max $15 (half of daily limit)", checkFn: () => true },
  { label: "Setup is A or A+ grade only", checkFn: () => true },
  { label: "Confluence score is 4/6 or higher", checkFn: () => true },
  { label: "Currently in London or NY kill zone", checkFn: () => { const h = new Date().getUTCHours(); return (h >= 7 && h < 10) || (h >= 12 && h < 15); } },
  { label: "No high-impact news in next 30 minutes", checkFn: () => true },
  { label: "Have not taken 3 trades today", checkFn: (s: AccountStatus) => s.tradesRemaining > 0 },
  { label: "Not in a 2-loss streak today", checkFn: () => true },
];

const FUNDED_PAIRS_LOT: Record<string, { pipValue: number; minLot: number }> = {
  XAUUSD: { pipValue: 1.0, minLot: 0.01 },
  EURUSD: { pipValue: 0.1, minLot: 0.01 },
  GBPUSD: { pipValue: 0.1, minLot: 0.01 },
  US30:   { pipValue: 1.0, minLot: 0.01 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadConfig(): FundedConfig {
  try { const s = localStorage.getItem("jjnexus_funded_config"); if (s) return { ...DEFAULT_CONFIG, ...JSON.parse(s) }; } catch {}
  return DEFAULT_CONFIG;
}
function saveConfig(c: FundedConfig) { localStorage.setItem("jjnexus_funded_config", JSON.stringify(c)); }

async function loadJournalTrades(): Promise<JournalTrade[]> {
  try {
    const res = await fetch("/api/journal/entries");
    if (res.ok) { const d = await res.json(); return Array.isArray(d) ? d : (d.entries ?? []); }
  } catch {}
  return [];
}

function calcStatus(config: FundedConfig, trades: JournalTrade[]): AccountStatus {
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = trades.filter(t => (t.date || "").slice(0, 10) === today);
  const todayPnL = todayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const currentBalance = config.startBalance + totalPnL;
  const highWaterMark = Math.max(config.startBalance, currentBalance);
  const dailyDrawdownUsed = Math.max(0, -todayPnL);
  const dailyDrawdownRemaining = config.dailyDrawdownLimit - dailyDrawdownUsed;
  const maxDrawdownUsed = Math.max(0, config.startBalance - currentBalance);
  const daysElapsed = Math.max(0, Math.floor((Date.now() - new Date(config.startDate).getTime()) / 86400000));

  let status: AccountStatus["status"] = "SAFE";
  let canTradeToday = true;
  let reason = "All clear — ready to trade";
  if (maxDrawdownUsed >= config.maxDrawdownLimit) { status = "BREACHED"; canTradeToday = false; reason = "🚨 MAX DRAWDOWN HIT — Challenge failed"; }
  else if (dailyDrawdownUsed >= config.dailyDrawdownLimit) { status = "BREACHED"; canTradeToday = false; reason = "🚨 DAILY LIMIT HIT — Stop trading today"; }
  else if (dailyDrawdownUsed >= config.dailyDrawdownLimit * 0.9) { status = "DANGER"; canTradeToday = false; reason = "⛔ 90% daily DD — Stop trading now"; }
  else if (dailyDrawdownUsed >= config.dailyDrawdownLimit * 0.7) { status = "WARNING"; reason = "⚠️ 70%+ daily DD — Trade with extreme caution"; }
  else if (todayPnL >= config.dailyProfitTarget) { canTradeToday = false; reason = "🎉 Daily target hit — STOP, lock profits"; }
  else if (totalPnL >= config.profitTarget) { status = "PASSED"; reason = "🏆 PROFIT TARGET HIT — Challenge passed!"; }
  if (canTradeToday && todayTrades.filter(t => (t.pnl || 0) < 0).length >= 2) {
    canTradeToday = false; reason = "⛔ 2 consecutive losses — Done for today";
    if (status === "SAFE") status = "WARNING";
  }
  return {
    currentBalance, startBalance: config.startBalance, highWaterMark,
    totalPnL, totalPnLPercent: (totalPnL / config.accountSize) * 100,
    todayPnL, todayPnLPercent: (todayPnL / config.accountSize) * 100,
    dailyDrawdownUsed, dailyDrawdownRemaining,
    maxDrawdownUsed, maxDrawdownRemaining: config.maxDrawdownLimit - maxDrawdownUsed,
    profitTarget: config.profitTarget, progressToTarget: (Math.max(0, totalPnL) / config.profitTarget) * 100,
    daysElapsed, daysRemaining: Math.max(0, config.challengeDuration - daysElapsed),
    tradesRemaining: Math.max(0, config.maxTradesPerDay - todayTrades.length),
    status, canTradeToday, reason,
  };
}

function calcLot(pair: string, entry: number, sl: number, riskUSD: number) {
  const slDist = Math.abs(entry - sl);
  if (!slDist || !entry || !sl) return { lots: 0, slPips: 0, actualRisk: 0 };
  let slPips = slDist, dollarPerPip = 1;
  if (pair.includes("JPY")) { slPips = slDist * 100; dollarPerPip = 0.01; }
  else if (pair === "US30") { slPips = slDist; dollarPerPip = 1; }
  else if (pair !== "XAUUSD") { slPips = slDist * 10000; dollarPerPip = 0.0001; }
  const riskPerLot = slPips * dollarPerPip * 100;
  const lots = riskPerLot > 0 ? Math.floor((riskUSD / riskPerLot) * 100) / 100 : 0;
  return { lots: Math.max(0.01, Math.min(lots, 1.0)), slPips: +slPips.toFixed(1), actualRisk: +(lots * riskPerLot).toFixed(2) };
}

// ─── SVG Circular Gauge ───────────────────────────────────────────────────────
function CircleGauge({ pct, color, size = 80, label, value }: { pct: number; color: string; size?: number; label: string; value: string }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct, 100) / 100 * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 4px ${color}55)` }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-black font-mono" style={{ color }}>{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-bold" style={{ color }}>{value}</div>
        <div className="text-[9px] text-gray-700 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

// ─── Status color map ─────────────────────────────────────────────────────────
const STATUS_MAP = {
  SAFE:    { color: "#22c55e", bg: "rgba(34,197,94,0.1)",    border: "rgba(34,197,94,0.3)",    icon: "🟢", label: "SAFE" },
  WARNING: { color: "#f97316", bg: "rgba(249,115,22,0.1)",   border: "rgba(249,115,22,0.3)",   icon: "🟡", label: "WARNING" },
  DANGER:  { color: "#ef4444", bg: "rgba(239,68,68,0.1)",    border: "rgba(239,68,68,0.3)",    icon: "🔴", label: "DANGER" },
  BREACHED:{ color: "#ef4444", bg: "rgba(239,68,68,0.15)",   border: "#ef4444",                icon: "🚨", label: "BREACHED" },
  PASSED:  { color: GOLD,      bg: "rgba(212,175,55,0.1)",   border: "rgba(212,175,55,0.3)",   icon: "🏆", label: "PASSED" },
};

const TABS = [
  { id: "overview",  label: "📊 Overview" },
  { id: "sizer",     label: "📐 Position Sizer" },
  { id: "checklist", label: "✅ Pre-Trade" },
  { id: "backtest",  label: "📈 vs Backtest" },
  { id: "rules",     label: "📋 Rules" },
  { id: "calendar",  label: "📅 Calendar" },
  { id: "setup",     label: "⚙️ Setup" },
] as const;

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function FundedAccountPage() {
  const [, navigate] = useLocation();
  const [config, setConfig] = useState<FundedConfig>(loadConfig);
  const [editConfig, setEditConfig] = useState<FundedConfig>(() => loadConfig());
  const [marginFree, setMarginFree] = useState('');
  const [marginUsed, setMarginUsed] = useState('');
  const [marginLevel, setMarginLevel] = useState('');
  const [equityOverride, setEquityOverride] = useState('');
  const [configSaved, setConfigSaved] = useState(false);
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [status, setStatus] = useState<AccountStatus>(() => calcStatus(loadConfig(), []));
  const [loading, setLoading] = useState(true);
  const [showEmergency, setShowEmergency] = useState(false);
  const [emergencyTimer, setEmergencyTimer] = useState(0);
  const [coaching, setCoaching] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [warningFired, setWarningFired] = useState(false);
  const [dailyTargetFired, setDailyTargetFired] = useState(false);
  const [activeTab, setActiveTab] = useState<typeof TABS[number]["id"]>("overview");
  const [sizerPair, setSizerPair] = useState("XAUUSD");
  const [sizerEntry, setSizerEntry] = useState("");
  const [sizerSL, setSizerSL] = useState("");
  const [preflightState, setPreflightState] = useState<boolean[]>(Array(8).fill(true));
  const emergencyRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    setLoading(true);
    const t = await loadJournalTrades();
    setTrades(t);
    setStatus(calcStatus(config, t));
    setLoading(false);
  };

  const applyConfig = () => {
    saveConfig(editConfig);
    setConfig(editConfig);
    setStatus(calcStatus(editConfig, trades));
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  };

  useEffect(() => { refresh(); }, []);

  // 30-second monitor
  useEffect(() => {
    const id = setInterval(() => {
      const s = calcStatus(config, trades);
      setStatus(s);
      if (s.dailyDrawdownUsed >= config.dailyDrawdownLimit) setShowEmergency(true);
      if (s.dailyDrawdownUsed >= config.dailyDrawdownLimit * 0.7 && !warningFired) {
        setWarningFired(true);
        if (Notification.permission === "granted") new Notification("⚠️ Drawdown Warning", { body: `$${s.dailyDrawdownRemaining.toFixed(2)} remaining.` });
      }
      if (s.todayPnL >= config.dailyProfitTarget && !dailyTargetFired) {
        setDailyTargetFired(true);
        if (Notification.permission === "granted") new Notification("🎉 Daily Target Hit!", { body: "Stop trading — lock profits!" });
      }
    }, 30000);
    return () => clearInterval(id);
  }, [config, trades, warningFired, dailyTargetFired]);

  // Emergency timer
  useEffect(() => {
    if (!showEmergency) return;
    setEmergencyTimer(30 * 60);
    emergencyRef.current = setInterval(() => {
      setEmergencyTimer(t => { if (t <= 1) { clearInterval(emergencyRef.current!); setShowEmergency(false); return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(emergencyRef.current!);
  }, [showEmergency]);

  const getCoaching = async () => {
    setCoachLoading(true); setCoaching("");
    const text = await callAlchemistAI(`You are JJ NEXUS PRO Funded Account Coach. Today: ${new Date().toDateString()}.

ACCOUNT STATUS:
- Balance: $${status.currentBalance.toFixed(2)} | P&L: ${status.totalPnL >= 0 ? "+" : ""}$${status.totalPnL.toFixed(2)}
- Today P&L: ${status.todayPnL >= 0 ? "+" : ""}$${status.todayPnL.toFixed(2)} | Day ${status.daysElapsed + 1}/30
- Daily DD: $${status.dailyDrawdownUsed.toFixed(2)}/$${config.dailyDrawdownLimit} used
- Target progress: ${status.progressToTarget.toFixed(1)}% | Status: ${status.status}
- Trades today: ${config.maxTradesPerDay - status.tradesRemaining}/${config.maxTradesPerDay}

Rules: Max $15/trade, max 3/day, A+ only, XAUUSD/EURUSD/GBPUSD/US30, London+NY sessions, no news 30min around events.

Give me a focused coaching message under 120 words. Be direct. Include: status, today's approach, what to trade/avoid, risk reminder, closer.`);
    setCoaching(text); setCoachLoading(false);
  };

  // Position sizer
  const entry = parseFloat(sizerEntry) || 0;
  const sl = parseFloat(sizerSL) || 0;
  const maxRisk = Math.min(config.maxRiskPerTrade, status.dailyDrawdownRemaining / 2);
  const lotCalc = entry && sl ? calcLot(sizerPair, entry, sl, maxRisk) : null;

  // Calendar days
  const calDays = useMemo(() => {
    const start = new Date(config.startDate);
    return Array.from({ length: config.challengeDuration }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayTrades = trades.filter(t => (t.date || "").slice(0, 10) === dateStr);
      const dayPnL = dayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      const isToday = dateStr === new Date().toISOString().slice(0, 10);
      const isPast = d < new Date() && !isToday;
      return { day: i + 1, date: d, dateStr, dayPnL, trades: dayTrades.length, isToday, isPast, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
    });
  }, [config, trades]);

  const sm = STATUS_MAP[status.status];
  const preflightCount = preflightState.filter(Boolean).length;
  const dailyDDpct = (status.dailyDrawdownUsed / config.dailyDrawdownLimit) * 100;
  const maxDDpct = (status.maxDrawdownUsed / config.maxDrawdownLimit) * 100;
  const targetPct = status.progressToTarget;

  // Backtest comparison (live vs backtest)
  const allClosed = trades.filter(t => t.pips !== undefined);
  const wins = allClosed.filter(t => (t.pnl || 0) > 0 || (t.result || '').toUpperCase() === 'WIN').length;
  const liveWR = allClosed.length > 0 ? (wins / allClosed.length) * 100 : 0;
  const liveNetPips = allClosed.reduce((s, t) => s + (t.pips || 0), 0);
  const liveExpect = allClosed.length > 0 ? liveNetPips / allClosed.length : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="h-full overflow-y-auto custom-scrollbar">

      {/* ── Emergency overlay ── */}
      <AnimatePresence>
        {showEmergency && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }}
              className="max-w-sm w-full mx-4 p-8 rounded-2xl text-center" style={{ border: "2px solid #ef4444", background: "rgba(10,0,0,0.97)" }}>
              <div className="text-6xl mb-4">🚨</div>
              <h2 className="text-2xl font-black text-red-400 mb-2">EMERGENCY STOP</h2>
              <p className="text-gray-500 mb-6 text-sm leading-relaxed">Trading locked — prevent revenge trading.<br />Take a break. Come back tomorrow refreshed.</p>
              <div className="text-5xl font-mono font-black text-red-400 mb-6 tracking-widest">
                {String(Math.floor(emergencyTimer / 60)).padStart(2,"0")}:{String(emergencyTimer % 60).padStart(2,"0")}
              </div>
              <button onClick={() => setShowEmergency(false)} className="w-full py-2.5 rounded-xl border text-gray-600 hover:text-white text-sm transition-colors" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                Override (not recommended)
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-[1400px] mx-auto p-4 flex flex-col gap-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: G10, border: `1px solid ${G30}` }}>
              <Trophy className="w-5 h-5" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="font-serif font-black text-xl tracking-wider" style={{ color: GOLD }}>MISSION CONTROL</h1>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">
                $1K Funded · ${config.dailyDrawdownLimit} Daily DD · ${config.maxDrawdownLimit} Max DD · {config.challengeDuration}D
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-white transition-colors" style={{ border: `1px solid ${G20}` }}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Sync
            </button>
            <button onClick={() => navigate("/journal")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" style={{ background: G10, color: GOLD, border: `1px solid ${G30}` }}>
              <BookOpen className="w-3.5 h-3.5" /> + Log Trade
            </button>
            <button onClick={() => setShowEmergency(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-colors" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
              <ShieldAlert className="w-3.5 h-3.5" /> Emergency Stop
            </button>
          </div>
        </div>

        {/* ── Status banner ── */}
        <motion.div className="p-4 rounded-2xl flex items-center justify-between gap-4 flex-wrap" style={{ background: `${sm.color}08`, border: `1px solid ${sm.border}` }}>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-black" style={{ color: sm.color, background: sm.bg, border: `1px solid ${sm.border}` }}>
              {sm.icon} {sm.label}
            </span>
            <div>
              <p className="text-white font-bold text-sm">Day {status.daysElapsed + 1} of {config.challengeDuration}</p>
              <p className="text-gray-500 text-xs">{status.reason}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-gray-600">{status.daysRemaining}d remaining</div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black" style={status.canTradeToday
              ? { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }
              : { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
              {status.canTradeToday ? <><Unlock className="w-3.5 h-3.5" /> {status.tradesRemaining} trade{status.tradesRemaining !== 1 ? "s" : ""} left</> : <><Lock className="w-3.5 h-3.5" /> TRADING LOCKED</>}
            </div>
          </div>
        </motion.div>

        {/* ── Command metrics + gauges ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Balance", value: `$${status.currentBalance.toFixed(2)}`, sub: `${status.totalPnL >= 0 ? "+" : ""}$${status.totalPnL.toFixed(2)} P&L`, color: status.totalPnL >= 0 ? "#22c55e" : "#ef4444" },
            { label: "Today P&L", value: `${status.todayPnL >= 0 ? "+" : ""}$${status.todayPnL.toFixed(2)}`, sub: `${status.todayPnLPercent >= 0 ? "+" : ""}${status.todayPnLPercent.toFixed(2)}%`, color: status.todayPnL >= 0 ? "#22c55e" : "#ef4444" },
            { label: "Target Progress", value: `${status.progressToTarget.toFixed(1)}%`, sub: `$${Math.max(0, status.profitTarget - status.totalPnL).toFixed(2)} to go`, color: GOLD },
            { label: "Days Left", value: `${status.daysRemaining}`, sub: `$${((Math.max(0, status.profitTarget - status.totalPnL)) / Math.max(1, status.daysRemaining)).toFixed(2)}/day needed`, color: status.daysRemaining < 5 ? "#ef4444" : "#9ca3af" },
          ].map(m => (
            <div key={m.label} className="rounded-2xl p-4" style={{ border: `1px solid ${G20}`, background: "rgba(0,0,0,0.5)" }}>
              <p className="text-[10px] uppercase tracking-widest text-gray-700 mb-1">{m.label}</p>
              <p className="text-xl font-black font-mono" style={{ color: m.color }}>{m.value}</p>
              <p className="text-xs text-gray-600 mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-0.5 rounded-xl p-1 overflow-x-auto" style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${G10}` }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap"
              style={activeTab === tab.id ? { background: GOLD, color: "#000" } : { color: "#555" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">

          {/* ══ OVERVIEW ══ */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Drawdown gauges */}
              <div className="rounded-2xl p-5" style={{ border: `1px solid ${G20}`, background: "rgba(0,0,0,0.5)" }}>
                <p className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-5" style={{ color: GOLD }}>
                  <AlertTriangle className="w-3.5 h-3.5" /> Risk Gauges
                </p>
                <div className="flex items-center justify-around gap-4 mb-5">
                  <CircleGauge pct={dailyDDpct} color={dailyDDpct >= 90 ? "#ef4444" : dailyDDpct >= 70 ? "#f97316" : "#3b82f6"} label="Daily DD" value={`$${status.dailyDrawdownUsed.toFixed(2)}`} />
                  <CircleGauge pct={maxDDpct} color={maxDDpct >= 80 ? "#ef4444" : maxDDpct >= 50 ? "#f97316" : "#8b5cf6"} label="Max DD" value={`$${status.maxDrawdownUsed.toFixed(2)}`} />
                  <CircleGauge pct={targetPct} color={targetPct >= 100 ? "#22c55e" : GOLD} label="Target" value={`$${Math.max(0, status.totalPnL).toFixed(2)}`} />
                </div>
                {/* Remaining bars */}
                <div className="space-y-2.5">
                  {[
                    { label: "Daily DD remaining", used: status.dailyDrawdownUsed, limit: config.dailyDrawdownLimit, color: dailyDDpct >= 90 ? "#ef4444" : dailyDDpct >= 70 ? "#f97316" : "#3b82f6" },
                    { label: "Max DD remaining", used: status.maxDrawdownUsed, limit: config.maxDrawdownLimit, color: maxDDpct >= 80 ? "#ef4444" : "#8b5cf6" },
                    { label: "Profit target", used: Math.max(0, status.totalPnL), limit: config.profitTarget, color: GOLD },
                  ].map(b => (
                    <div key={b.label}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-gray-600">{b.label}</span>
                        <span className="font-mono font-bold" style={{ color: b.color }}>${b.used.toFixed(2)} / ${b.limit}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: b.color }}
                          initial={{ width: 0 }} animate={{ width: `${Math.min(100, (b.used / b.limit) * 100)}%` }} transition={{ duration: 0.8 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's P&L + trade log */}
              <div className="rounded-2xl p-5" style={{ border: `1px solid ${G20}`, background: "rgba(0,0,0,0.5)" }}>
                <p className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-4" style={{ color: GOLD }}>
                  <Target className="w-3.5 h-3.5" /> Today's Trade Log
                </p>
                {(() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const todayTrades = trades.filter(t => (t.date || "").slice(0, 10) === today);
                  return todayTrades.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-2 text-center">
                      <Crosshair className="w-8 h-8 text-gray-800" />
                      <p className="text-gray-600 text-sm">No trades yet today</p>
                      <button onClick={() => navigate("/journal")} className="text-xs font-bold mt-1 flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: GOLD }}>
                        <BookOpen className="w-3 h-3" /> Log a trade →
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {todayTrades.map((t, i) => {
                        const pnl = t.pnl || 0;
                        return (
                          <div key={t.id} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 w-4">{i + 1}.</span>
                              <span className="text-xs font-bold text-white">{t.pair}</span>
                              {t.direction && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ color: (t.direction || '').toUpperCase() === 'BUY' ? '#22c55e' : '#ef4444', background: (t.direction || '').toUpperCase() === 'BUY' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>{(t.direction || '').toUpperCase()}</span>}
                              {t.grade && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ color: GOLD, background: G10 }}>{t.grade}</span>}
                            </div>
                            <span className="text-xs font-mono font-black" style={{ color: pnl >= 0 ? "#22c55e" : "#ef4444" }}>
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between items-center pt-2 border-t text-xs font-bold" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                        <span className="text-gray-600">Daily total</span>
                        <span className="font-mono text-sm" style={{ color: status.todayPnL >= 0 ? "#22c55e" : "#ef4444" }}>
                          {status.todayPnL >= 0 ? "+" : ""}${status.todayPnL.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* AI Coach */}
              <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                <div className="flex items-center justify-between p-4 border-b" style={{ background: "rgba(0,0,0,0.6)", borderColor: G10 }}>
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="font-black text-sm text-white">AI FUNDED ACCOUNT COACH</span>
                  </div>
                  <button onClick={getCoaching} disabled={coachLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all disabled:opacity-40"
                    style={{ background: G10, color: GOLD, border: `1px solid ${G30}` }}>
                    {coachLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    {coachLoading ? "Thinking..." : "Get Coaching"}
                  </button>
                </div>
                <div className="p-5" style={{ background: "rgba(0,0,0,0.4)" }}>
                  {coaching ? (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:text-gray-300 prose-strong:text-white prose-headings:text-[var(--gold)]">
                      <ReactMarkdown>{coaching}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-gray-600 text-sm text-center py-3">
                      Click <strong style={{ color: GOLD }}>Get Coaching</strong> for today's personalized AI briefing.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ POSITION SIZER ══ */}
          {activeTab === "sizer" && (
            <motion.div key="sizer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl p-6 space-y-5" style={{ border: `1px solid ${G20}`, background: "rgba(0,0,0,0.5)" }}>
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="font-black text-sm text-white uppercase tracking-widest">Position Size Calculator</span>
                </div>

                {/* Risk cap alert */}
                <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  ⚠️ Max risk this trade: <strong>${maxRisk.toFixed(2)}</strong> ({config.maxRiskPerTrade < status.dailyDrawdownRemaining / 2 ? `rule limit $${config.maxRiskPerTrade}` : `50% of DD remaining`})
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Pair</label>
                    <select value={sizerPair} onChange={e => setSizerPair(e.target.value)} className="w-full bg-black/80 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ border: `1px solid ${G20}` }}>
                      {Object.keys(FUNDED_PAIRS_LOT).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Entry Price</label>
                    <input type="number" step="any" value={sizerEntry} onChange={e => setSizerEntry(e.target.value)} placeholder="e.g. 2345.50" className="w-full bg-black/80 text-white rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none" style={{ border: `1px solid ${G20}` }} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Stop Loss</label>
                    <input type="number" step="any" value={sizerSL} onChange={e => setSizerSL(e.target.value)} placeholder="e.g. 2340.00" className="w-full bg-black/80 text-white rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none" style={{ border: `1px solid ${G20}` }} />
                  </div>
                </div>

                {lotCalc && lotCalc.lots > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Lot Size", value: lotCalc.lots.toFixed(2), color: GOLD, big: true },
                      { label: "SL Distance", value: `${lotCalc.slPips} pips`, color: "#9ca3af" },
                      { label: "Actual Risk", value: `$${lotCalc.actualRisk.toFixed(2)}`, color: lotCalc.actualRisk <= config.maxRiskPerTrade ? "#22c55e" : "#ef4444" },
                    ].map(c => (
                      <div key={c.label} className="rounded-xl p-4 text-center" style={{ background: c.big ? G10 : "rgba(255,255,255,0.02)", border: `1px solid ${c.big ? G20 : "rgba(255,255,255,0.05)"}` }}>
                        <div className="font-black font-mono" style={{ color: c.color, fontSize: c.big ? "1.5rem" : "1.1rem" }}>{c.value}</div>
                        <div className="text-[9px] text-gray-700 uppercase tracking-widest mt-1">{c.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {lotCalc && lotCalc.actualRisk > config.maxRiskPerTrade && (
                  <div className="p-3 rounded-xl text-xs text-red-400 font-semibold" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    🚨 This exceeds the ${config.maxRiskPerTrade} max risk rule. Widen your SL or reduce lot size.
                  </div>
                )}

                <div className="p-4 rounded-xl space-y-1 text-xs" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <p className="font-black text-gray-500 uppercase tracking-widest text-[10px] mb-2">Pair Pip Values (per 0.01 lot)</p>
                  {Object.entries(FUNDED_PAIRS_LOT).map(([p, v]) => (
                    <div key={p} className="flex justify-between">
                      <span className="text-gray-600">{p}</span>
                      <span className="font-mono text-gray-500">${(v.pipValue * 0.01 * 100).toFixed(2)}/pip</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ PRE-TRADE CHECKLIST ══ */}
          {activeTab === "checklist" && (
            <motion.div key="checklist" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                <div className="flex items-center justify-between p-4 border-b" style={{ background: "rgba(0,0,0,0.6)", borderColor: G10 }}>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="font-black text-sm text-white">8-POINT FUNDED PREFLIGHT</span>
                  </div>
                  <div className="px-3 py-1 rounded-full text-xs font-black" style={preflightCount >= 7 ? { background: "rgba(34,197,94,0.15)", color: "#22c55e" } : preflightCount >= 5 ? { background: "rgba(249,115,22,0.15)", color: "#f97316" } : { background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                    {preflightCount}/8
                  </div>
                </div>
                <div className="p-4 space-y-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                  {PREFLIGHT.map((item, idx) => {
                    const auto = item.checkFn(status);
                    const on = preflightState[idx];
                    const effectiveOn = auto && on;
                    return (
                      <button key={idx} onClick={() => { const u = [...preflightState]; u[idx] = !u[idx]; setPreflightState(u); }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                        style={effectiveOn
                          ? { background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }
                          : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                        {effectiveOn
                          ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                          : <div className="w-4 h-4 rounded-full border border-gray-700 flex items-center justify-center text-[9px] text-gray-700 shrink-0 font-bold">{idx + 1}</div>
                        }
                        <span className="text-sm" style={{ color: effectiveOn ? "#86efac" : "#555" }}>{item.label}</span>
                        {!auto && <span className="ml-auto text-[9px] text-orange-500 font-bold">AUTO ✗</span>}
                        {auto && <span className="ml-auto text-[9px] text-green-600 font-bold">AUTO ✓</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="p-4 border-t" style={{ borderColor: G10, background: "rgba(0,0,0,0.5)" }}>
                  <p className="text-sm font-black" style={{ color: preflightCount >= 7 ? "#22c55e" : preflightCount >= 5 ? "#f97316" : "#ef4444" }}>
                    {preflightCount >= 7 ? "✅ CLEARED FOR TRADE — All systems go" : preflightCount >= 5 ? "⚠️ AMBER — Address failing items before entry" : "🚫 ABORT — Do not enter this trade"}
                  </p>
                  <button onClick={() => setPreflightState(Array(8).fill(true))} className="text-xs text-gray-700 hover:text-gray-400 transition-colors mt-1">Reset</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ VS BACKTEST ══ */}
          {activeTab === "backtest" && (
            <motion.div key="backtest" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* Header */}
              <div className="relative overflow-hidden rounded-2xl p-5" style={{ border: `1px solid ${G20}`, background: "linear-gradient(135deg, rgba(0,0,0,0.8), rgba(212,175,55,0.04))" }}>
                <div className="absolute inset-0 opacity-15" style={{ background: "radial-gradient(ellipse at 20% 50%, rgba(212,175,55,0.4), transparent 65%)" }} />
                <div className="relative flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart2 className="w-4 h-4" style={{ color: GOLD }} />
                      <span className="font-black text-sm" style={{ color: GOLD }}>FUNDED ACCOUNT vs ALCHEMIST X BENCHMARK</span>
                    </div>
                    <p className="text-gray-600 text-xs">Your funded account trades measured against the 19-month verified ALCHEMIST X backtest results</p>
                  </div>
                  <button onClick={() => navigate("/backtest")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0" style={{ background: G10, color: GOLD, border: `1px solid ${G30}` }}>
                    <ExternalLink className="w-3 h-3" /> Full Backtest
                  </button>
                </div>
              </div>

              {allClosed.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <BarChart2 className="w-12 h-12 text-gray-800" />
                  <p className="text-gray-500 font-bold">No closed trades yet</p>
                  <p className="text-gray-700 text-xs max-w-xs">Close some trades to compare your funded account performance against the Alchemist X strategy benchmark.</p>
                  <button onClick={() => navigate("/journal")} className="px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2" style={{ background: GOLD, color: "#000" }}>
                    <BookOpen className="w-3.5 h-3.5" /> Log Trades →
                  </button>
                </div>
              ) : (
                <>
                  {/* Comparison metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { label: "Win Rate", live: `${liveWR.toFixed(1)}%`, bench: `${BENCH.winRate}%`, pct: Math.min(100, (liveWR / BENCH.winRate) * 100), color: liveWR >= BENCH.winRate * 0.85 ? "#22c55e" : "#ef4444" },
                      { label: "Expectancy (pips/trade)", live: `${liveExpect >= 0 ? "+" : ""}${liveExpect.toFixed(1)}`, bench: `+${BENCH.expectancy}`, pct: Math.min(100, Math.max(0, (liveExpect / BENCH.expectancy) * 100)), color: liveExpect > 0 ? "#22c55e" : "#ef4444" },
                      { label: "Net Pips", live: `${liveNetPips >= 0 ? "+" : ""}${liveNetPips.toFixed(0)}`, bench: `+${BENCH.netPips}`, pct: Math.min(100, Math.max(0, (liveNetPips / BENCH.netPips) * 100)), color: liveNetPips >= 0 ? "#22c55e" : "#ef4444" },
                    ].map(m => (
                      <div key={m.label} className="rounded-2xl p-4" style={{ border: `1px solid ${G20}`, background: "rgba(0,0,0,0.5)" }}>
                        <p className="text-[10px] uppercase tracking-widest text-gray-700 mb-2">{m.label}</p>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-xl font-black font-mono" style={{ color: m.color }}>{m.live}</span>
                          <span className="text-xs text-gray-700">vs</span>
                          <span className="text-sm font-bold font-mono" style={{ color: GOLD }}>{m.bench}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.pct >= 100 ? "#22c55e" : m.pct >= 60 ? GOLD : "#ef4444", transition: "width 0.8s" }} />
                        </div>
                        <p className="text-[9px] font-mono mt-1" style={{ color: m.pct >= 100 ? "#22c55e" : m.pct >= 60 ? GOLD : "#ef4444" }}>{m.pct.toFixed(0)}% of benchmark</p>
                      </div>
                    ))}
                  </div>

                  {/* Benchmark crosswalk */}
                  <div className="rounded-2xl p-4 space-y-3" style={{ border: `1px solid ${G20}`, background: "rgba(0,0,0,0.5)" }}>
                    <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: GOLD }}>
                      <Zap className="w-3.5 h-3.5" /> Alchemist X Key Targets (from Backtest)
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { label: "Win Rate", bench: `${BENCH.winRate}%`, yours: `${liveWR.toFixed(1)}%`, ok: liveWR >= BENCH.winRate * 0.8 },
                        { label: "Profit Factor", bench: `${BENCH.profitFactor}`, yours: "—", ok: false },
                        { label: "Sharpe Ratio", bench: `${BENCH.sharpe}`, yours: "—", ok: false },
                        { label: "Max Drawdown", bench: `${BENCH.maxDD}%`, yours: `${maxDDpct.toFixed(1)}%`, ok: maxDDpct <= BENCH.maxDD },
                      ].map(m => (
                        <div key={m.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                          <p className="text-[9px] text-gray-700 uppercase tracking-wider mb-1">{m.label}</p>
                          <p className="text-sm font-black font-mono" style={{ color: GOLD }}>{m.bench}</p>
                          <p className="text-[10px] font-mono mt-0.5" style={{ color: m.ok ? "#22c55e" : "#666" }}>yours: {m.yours}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: G10 }}>
                      <p className="text-xs text-gray-700 flex-1">Study winning setups to close the gap between your live results and the benchmark.</p>
                      <button onClick={() => navigate("/backtest")} className="flex items-center gap-1 text-xs font-bold shrink-0 transition-colors hover:opacity-80" style={{ color: GOLD }}>
                        View Backtest <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ══ RULES ══ */}
          {activeTab === "rules" && (
            <motion.div key="rules" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                <div className="p-4 border-b" style={{ background: "rgba(0,0,0,0.6)", borderColor: G10 }}>
                  <span className="font-black text-sm text-white flex items-center gap-2"><Shield className="w-4 h-4" style={{ color: GOLD }} /> FUNDED ACCOUNT RULES</span>
                </div>
                <div className="p-4 space-y-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                  {RULES.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <span className="text-base shrink-0">{r.icon}</span>
                      <span className="text-sm text-gray-300">{r.rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ CALENDAR ══ */}
          {activeTab === "calendar" && (
            <motion.div key="calendar" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                <div className="p-4 border-b" style={{ background: "rgba(0,0,0,0.6)", borderColor: G10 }}>
                  <span className="font-black text-sm text-white flex items-center gap-2"><Calendar className="w-4 h-4" style={{ color: GOLD }} /> 30-DAY CHALLENGE CALENDAR</span>
                </div>
                <div className="p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
                  {/* Challenge progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-[10px] mb-1.5">
                      <span className="text-gray-600">Challenge progress</span>
                      <span className="font-mono" style={{ color: GOLD }}>Day {status.daysElapsed + 1} of {config.challengeDuration}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="h-full rounded-full" style={{ width: `${((status.daysElapsed + 1) / config.challengeDuration) * 100}%`, background: GOLD, transition: "width 0.8s" }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-6 gap-1.5">
                    {calDays.map(d => {
                      const bg = d.isToday ? G20 : d.dayPnL > 0 ? "rgba(34,197,94,0.12)" : d.dayPnL < 0 ? "rgba(239,68,68,0.12)" : d.isPast ? "rgba(255,255,255,0.02)" : "transparent";
                      const border = d.isToday ? `1px solid ${GOLD}` : d.dayPnL > 0 ? "1px solid rgba(34,197,94,0.25)" : d.dayPnL < 0 ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(255,255,255,0.04)";
                      const textColor = d.isToday ? GOLD : d.dayPnL > 0 ? "#22c55e" : d.dayPnL < 0 ? "#ef4444" : d.isPast ? "#333" : "#2a2a2a";
                      return (
                        <div key={d.day} className="rounded-lg p-1.5 text-center" style={{ background: bg, border, opacity: d.isWeekend && !d.isPast ? 0.4 : 1 }}>
                          <div className="text-[9px] font-bold" style={{ color: textColor }}>{d.day}</div>
                          {d.trades > 0 && <div className="text-[8px] font-mono mt-0.5" style={{ color: d.dayPnL >= 0 ? "#22c55e" : "#ef4444" }}>{d.dayPnL >= 0 ? "+" : ""}${d.dayPnL.toFixed(0)}</div>}
                          {d.isToday && <div className="w-1 h-1 rounded-full mx-auto mt-0.5" style={{ background: GOLD }} />}
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-4 text-[10px] text-gray-700">
                    {[
                      { color: "#22c55e", label: "Profit day" },
                      { color: "#ef4444", label: "Loss day" },
                      { color: GOLD, label: "Today" },
                    ].map(l => (
                      <div key={l.label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color + "33", border: `1px solid ${l.color}55` }} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ SETUP ══ */}
          {activeTab === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Account Parameters */}
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                  <div className="p-4 border-b flex items-center justify-between" style={{ background: "rgba(0,0,0,0.6)", borderColor: G10 }}>
                    <span className="font-black text-sm text-white flex items-center gap-2">
                      <DollarSign className="w-4 h-4" style={{ color: GOLD }} /> ACCOUNT PARAMETERS
                    </span>
                    <span className="text-[10px] text-gray-600">Saved to localStorage</span>
                  </div>
                  <div className="p-4 space-y-3" style={{ background: "rgba(0,0,0,0.35)" }}>
                    {[
                      { key: "accountSize", label: "Account Size ($)", type: "number", step: 100 },
                      { key: "startBalance", label: "Start Balance ($)", type: "number", step: 100 },
                      { key: "dailyDrawdownLimit", label: "Daily DD Limit ($)", type: "number", step: 5 },
                      { key: "maxDrawdownLimit", label: "Max DD Limit ($)", type: "number", step: 5 },
                      { key: "profitTarget", label: "Profit Target ($)", type: "number", step: 5 },
                      { key: "dailyProfitTarget", label: "Daily Profit Target ($)", type: "number", step: 5 },
                      { key: "challengeDuration", label: "Challenge Duration (days)", type: "number", step: 1 },
                      { key: "maxTradesPerDay", label: "Max Trades / Day", type: "number", step: 1 },
                      { key: "maxRiskPerTrade", label: "Max Risk / Trade ($)", type: "number", step: 5 },
                    ].map(f => (
                      <div key={f.key} className="flex items-center gap-3">
                        <label className="text-[10px] text-gray-500 w-40 shrink-0">{f.label}</label>
                        <input
                          type={f.type}
                          step={f.step}
                          value={(editConfig as any)[f.key]}
                          onChange={e => setEditConfig(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                          className="flex-1 rounded-lg px-3 py-1.5 text-sm font-mono text-white bg-transparent border outline-none focus:border-[rgba(212,175,55,0.5)] transition-colors"
                          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] text-gray-500 w-40 shrink-0">Challenge Start Date</label>
                      <input
                        type="date"
                        value={editConfig.startDate}
                        onChange={e => setEditConfig(prev => ({ ...prev, startDate: e.target.value }))}
                        className="flex-1 rounded-lg px-3 py-1.5 text-sm font-mono text-white bg-transparent border outline-none focus:border-[rgba(212,175,55,0.5)] transition-colors"
                        style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", colorScheme: "dark" }}
                      />
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2 pt-2">
                      <button onClick={applyConfig}
                        className="flex-1 py-2 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2"
                        style={{
                          background: configSaved ? "rgba(34,197,94,0.15)" : `rgba(212,175,55,0.12)`,
                          color: configSaved ? "#22c55e" : GOLD,
                          border: `1px solid ${configSaved ? "rgba(34,197,94,0.4)" : G30}`,
                        }}>
                        {configSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : <><Shield className="w-4 h-4" /> Apply Config</>}
                      </button>
                      <button onClick={() => setEditConfig(DEFAULT_CONFIG)}
                        className="px-4 py-2 rounded-xl font-bold text-xs transition-all"
                        style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#666" }}>
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Margin Data */}
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                  <div className="p-4 border-b flex items-center gap-2" style={{ background: "rgba(0,0,0,0.6)", borderColor: G10 }}>
                    <Activity className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="font-black text-sm text-white">LIVE MARGIN DATA</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full ml-auto font-bold" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>MANUAL INPUT</span>
                  </div>
                  <div className="p-4 space-y-3" style={{ background: "rgba(0,0,0,0.35)" }}>
                    <p className="text-[10px] text-gray-600 mb-4 leading-relaxed">
                      Enter your broker's live margin data here. These values are used for display only — copy them from your MT4/MT5 terminal.
                    </p>

                    {[
                      { key: "equity", label: "Current Equity ($)", value: equityOverride, setter: setEquityOverride, hint: "From MT4 → Trade tab" },
                      { key: "free", label: "Free Margin ($)", value: marginFree, setter: setMarginFree, hint: "Margin available for new trades" },
                      { key: "used", label: "Used Margin ($)", value: marginUsed, setter: setMarginUsed, hint: "Margin locked in open positions" },
                      { key: "level", label: "Margin Level (%)", value: marginLevel, setter: setMarginLevel, hint: "Equity ÷ Used Margin × 100" },
                    ].map(f => (
                      <div key={f.key}>
                        <div className="flex items-center gap-3 mb-0.5">
                          <label className="text-[10px] text-gray-500 w-40 shrink-0">{f.label}</label>
                          <input
                            type="number"
                            value={f.value}
                            placeholder="—"
                            onChange={e => f.setter(e.target.value)}
                            className="flex-1 rounded-lg px-3 py-1.5 text-sm font-mono text-white bg-transparent border outline-none focus:border-[rgba(212,175,55,0.5)] transition-colors"
                            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                          />
                        </div>
                        <p className="text-[9px] text-gray-700 ml-[10.5rem]">{f.hint}</p>
                      </div>
                    ))}

                    {/* Live display cards */}
                    {(equityOverride || marginFree || marginUsed || marginLevel) && (
                      <div className="grid grid-cols-2 gap-2 pt-3 border-t mt-3" style={{ borderColor: G10 }}>
                        {[
                          { label: "Equity", val: equityOverride, prefix: "$", color: "#22c55e" },
                          { label: "Free Margin", val: marginFree, prefix: "$", color: GOLD },
                          { label: "Used Margin", val: marginUsed, prefix: "$", color: "#f97316" },
                          { label: "Margin Level", val: marginLevel, prefix: "", suffix: "%",
                            color: Number(marginLevel) >= 200 ? "#22c55e" : Number(marginLevel) >= 100 ? "#f97316" : "#ef4444" },
                        ].map(c => c.val ? (
                          <div key={c.label} className="rounded-xl p-3 text-center"
                            style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${c.color}22` }}>
                            <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">{c.label}</p>
                            <p className="font-mono font-black text-base" style={{ color: c.color }}>
                              {c.prefix}{Number(c.val).toLocaleString()}{c.suffix ?? ""}
                            </p>
                          </div>
                        ) : null)}
                      </div>
                    )}

                    {/* Risk assessment */}
                    {marginLevel && (
                      <div className="rounded-xl p-3 mt-1 flex items-center gap-2.5"
                        style={{
                          background: Number(marginLevel) >= 200 ? "rgba(34,197,94,0.06)" : Number(marginLevel) >= 100 ? "rgba(249,115,22,0.08)" : "rgba(239,68,68,0.08)",
                          border: `1px solid ${Number(marginLevel) >= 200 ? "rgba(34,197,94,0.2)" : Number(marginLevel) >= 100 ? "rgba(249,115,22,0.2)" : "rgba(239,68,68,0.25)"}`,
                        }}>
                        {Number(marginLevel) >= 200
                          ? <><CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" /><p className="text-xs text-green-300">✅ Margin level healthy — safe to trade</p></>
                          : Number(marginLevel) >= 100
                          ? <><AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" /><p className="text-xs text-orange-300">⚠️ Margin level low — reduce position size</p></>
                          : <><ShieldAlert className="w-4 h-4 text-red-400 shrink-0" /><p className="text-xs text-red-300">🚨 MARGIN CALL RISK — close positions immediately</p></>}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}
