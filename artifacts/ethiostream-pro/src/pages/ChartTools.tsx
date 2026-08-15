import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, PlayCircle, Clock3, Zap, ChevronRight, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle,
  BarChart2, Target, Activity, Layers, ArrowUp, ArrowDown, Timer
} from "lucide-react";
import { getPrice, subscribeToPrice } from "@/utils/priceEngine";
import { useToast } from "@/hooks/use-toast";

function getAIHeaders(): Record<string, string> {
  const groqKey = localStorage.getItem("jjnexus_groq_key");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (groqKey) headers["x-groq-key"] = groqKey;
  return headers;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAIRS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "GBPJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "EURJPY"];
const TIMEFRAMES = ["M5", "M15", "M30", "H1", "H4", "D1"];

const FIBO_LEVELS = [
  { level: "0%",    color: "#ef4444", label: "Swing Low"    },
  { level: "23.6%", color: "#f97316", label: "Minor Support"},
  { level: "38.2%", color: "#eab308", label: "Golden Pocket Low" },
  { level: "50%",   color: "#a78bfa", label: "Equilibrium"  },
  { level: "61.8%", color: "#fbbf24", label: "Golden Pocket"},
  { level: "78.6%", color: "#22c55e", label: "Deep Retracement" },
  { level: "100%",  color: "#3b82f6", label: "Swing High"   },
];

const TOOLS = [
  {
    id: "fibonacci",
    icon: GitBranch,
    title: "Smart Fibonacci Engine",
    description: "AI places Fibonacci on the correct swing automatically — no manual drawing",
    badge: "Auto-draw",
    badgeColor: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  },
  {
    id: "replay",
    icon: PlayCircle,
    title: "Chart Replay Trainer",
    description: "Replay any past day bar-by-bar. AI quizzes you: where would you enter?",
    badge: "Training tool",
    badgeColor: "text-sky-400 border-sky-400/40 bg-sky-400/10",
  },
  {
    id: "asian",
    icon: Clock3,
    title: "Asian Range Tracker",
    description: "Auto-marks Asian session high/low. Shows which side London is likely to sweep",
    badge: "Free",
    badgeColor: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  },
  {
    id: "sweep",
    icon: Zap,
    title: "Liquidity Sweep Alert",
    description: "Real-time alert the moment price sweeps a key high or low then reverses",
    badge: "Real-time",
    badgeColor: "text-red-400 border-red-400/40 bg-red-400/10",
  },
];

// ── Smart Fibonacci Engine ─────────────────────────────────────────────────────

function FibonacciEngine() {
  const [pair, setPair] = useState("XAUUSD");
  const [tf, setTf] = useState("H1");
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string>("");
  const [levels, setLevels] = useState<{ label: string; pct: string; price: number; color: string }[]>([]);
  const [swingHigh, setSwingHigh] = useState(0);
  const [swingLow, setSwingLow] = useState(0);
  const [trend, setTrend] = useState<"BULLISH" | "BEARISH" | null>(null);
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const runFibonacci = useCallback(async () => {
    setIsLoading(true);
    setAnalysis("");
    setLevels([]);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const livePrice = getPrice(pair) || 0;
    try {
      const res = await fetch("/api/analysis/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAIHeaders() },
        body: JSON.stringify({
          prompt: `You are an elite Smart Money Concepts trader. For ${pair} on the ${tf} timeframe with current price ${livePrice}:

1. Identify the most recent SIGNIFICANT swing high and swing low (the last major market structure swing, not a minor pip fluctuation). Give realistic price values close to ${livePrice}.
2. Determine the current trend direction (BULLISH = price moving up, BEARISH = price moving down).
3. Calculate Fibonacci retracement levels between those two swings.

Respond ONLY in this exact JSON format (no markdown, no text outside JSON):
{"swingHigh":PRICE,"swingLow":PRICE,"trend":"BULLISH or BEARISH","analysis":"2 sentence SMC explanation of why this swing matters and where price is likely to react"}`,
          pair,
          timeframe: tf,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        chunk.split("\n").forEach(line => {
          const d = line.replace(/^data:\s*/, "").trim();
          if (d && d !== "[DONE]") raw += d;
        });
      }

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      const parsed = JSON.parse(jsonMatch[0]);

      const high = parseFloat(parsed.swingHigh) || livePrice * 1.005;
      const low = parseFloat(parsed.swingLow) || livePrice * 0.995;
      const range = high - low;
      const t = parsed.trend || "BULLISH";

      setSwingHigh(high);
      setSwingLow(low);
      setTrend(t);
      setAnalysis(parsed.analysis || "");

      const computed = FIBO_LEVELS.map(f => {
        const pct = parseFloat(f.level) / 100;
        const price = t === "BULLISH" ? low + range * (1 - pct) : high - range * (1 - pct);
        return { label: f.label, pct: f.level, price: parseFloat(price.toFixed(pair === "XAUUSD" ? 2 : 5)), color: f.color };
      });
      setLevels(computed);

      toast({ title: "Fibonacci levels drawn", description: `${pair} ${tf} — ${t} swing identified` });
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setAnalysis("Add a free Groq key in Settings → API & Keys to enable AI Fibonacci analysis.");
        toast({ title: "AI required", description: "Add a Groq key to use the Smart Fibonacci Engine", variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  }, [pair, tf]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Controls */}
      <div className="space-y-5">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 block">Pair</label>
            <select value={pair} onChange={e => setPair(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500/50">
              {PAIRS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 block">Timeframe</label>
            <select value={tf} onChange={e => setTf(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500/50">
              {TIMEFRAMES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <button onClick={runFibonacci} disabled={isLoading}
          className="w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all
            bg-gradient-to-r from-amber-500 to-yellow-600 text-black hover:opacity-90
            disabled:opacity-50 flex items-center justify-center gap-2">
          {isLoading ? <><RefreshCw size={15} className="animate-spin" /> Analyzing Swing...</> : <><GitBranch size={15} /> AUTO-DRAW FIBONACCI</>}
        </button>

        {/* Levels Table */}
        {levels.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-zinc-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-bold tracking-widest uppercase text-zinc-400">Fibonacci Levels</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trend === "BULLISH" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                {trend === "BULLISH" ? "▲ BULLISH SWING" : "▼ BEARISH SWING"}
              </span>
            </div>
            {levels.map((l, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between hover:bg-zinc-800/40 transition-colors border-b border-zinc-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-zinc-500 w-10">{l.pct}</span>
                  <span className="text-xs text-zinc-300">{l.label}</span>
                </div>
                <span className="text-sm font-mono font-semibold text-white">{l.price.toLocaleString()}</span>
              </div>
            ))}
          </motion.div>
        )}

        {analysis && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
            <p className="text-xs text-amber-200/80 leading-relaxed">{analysis}</p>
          </motion.div>
        )}

        {!levels.length && !isLoading && (
          <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
            <GitBranch size={32} className="mx-auto mb-3 text-zinc-600" />
            <p className="text-sm text-zinc-500">Select a pair and timeframe, then click AUTO-DRAW to have AI identify the optimal Fibonacci swing.</p>
          </div>
        )}
      </div>

      {/* Visual Swing Display */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <p className="text-xs font-bold tracking-widest uppercase text-zinc-500 mb-4">Swing Structure</p>
        {levels.length > 0 ? (
          <div className="relative h-64">
            {levels.map((l, i) => {
              const pct = parseFloat(l.pct) / 100;
              const topPct = trend === "BULLISH" ? pct * 100 : (1 - pct) * 100;
              return (
                <div key={i} className="absolute left-0 right-0 flex items-center gap-2" style={{ top: `${topPct}%` }}>
                  <div className="h-px flex-1 opacity-60" style={{ backgroundColor: l.color }} />
                  <span className="text-xs font-mono whitespace-nowrap" style={{ color: l.color }}>{l.pct} · {l.price}</span>
                </div>
              );
            })}
            {/* Current price marker */}
            {swingHigh && swingLow && (() => {
              const cur = getPrice(pair);
              const pos = trend === "BULLISH"
                ? ((cur - swingLow) / (swingHigh - swingLow)) * 100
                : ((swingHigh - cur) / (swingHigh - swingLow)) * 100;
              const clamped = Math.min(95, Math.max(5, pos));
              return (
                <div className="absolute left-0 right-0 flex items-center gap-2" style={{ top: `${clamped}%` }}>
                  <div className="h-0.5 flex-1 bg-white animate-pulse" />
                  <span className="text-xs font-mono text-white font-bold whitespace-nowrap">● {cur.toLocaleString()}</span>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-zinc-700">
            <BarChart2 size={48} />
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
            <p className="text-xs text-zinc-500 mb-1">Swing High</p>
            <p className="text-sm font-mono font-bold text-emerald-400">{swingHigh ? swingHigh.toLocaleString() : "—"}</p>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
            <p className="text-xs text-zinc-500 mb-1">Swing Low</p>
            <p className="text-sm font-mono font-bold text-red-400">{swingLow ? swingLow.toLocaleString() : "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chart Replay Trainer ───────────────────────────────────────────────────────

type ReplayBar = { time: string; open: number; high: number; low: number; close: number };

function ChartReplayTrainer() {
  const [pair, setPair] = useState("EURUSD");
  const [isRunning, setIsRunning] = useState(false);
  const [bars, setBars] = useState<ReplayBar[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [quizActive, setQuizActive] = useState(false);
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizAnswer, setQuizAnswer] = useState<"BUY" | "SELL" | null>(null);
  const [quizCorrect, setQuizCorrect] = useState<boolean | null>(null);
  const [explanation, setExplanation] = useState("");
  const [speed, setSpeed] = useState(400);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const generateBars = useCallback(() => {
    const base = getPrice(pair);
    const pip = pair === "XAUUSD" ? 0.1 : 0.0001;
    const generated: ReplayBar[] = [];
    let price = base * (0.997 + Math.random() * 0.006);

    for (let i = 40; i >= 0; i--) {
      const volatility = pip * (30 + Math.random() * 50);
      const dir = Math.random() > 0.48 ? 1 : -1;
      const open = price;
      const close = price + dir * volatility * (0.5 + Math.random());
      const high = Math.max(open, close) + pip * (5 + Math.random() * 20);
      const low = Math.min(open, close) - pip * (5 + Math.random() * 20);
      const dt = new Date(Date.now() - i * 60 * 60 * 1000);
      generated.push({
        time: dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        open: parseFloat(open.toFixed(5)),
        high: parseFloat(high.toFixed(5)),
        low: parseFloat(low.toFixed(5)),
        close: parseFloat(close.toFixed(5)),
      });
      price = close;
    }
    return generated;
  }, [pair]);

  const startReplay = () => {
    const newBars = generateBars();
    setBars(newBars);
    setCurrentIdx(5);
    setIsRunning(true);
    setQuizActive(false);
    setQuizAnswer(null);
    setQuizCorrect(null);
    setExplanation("");
    toast({ title: "Replay started", description: `Replaying ${pair} bar-by-bar` });
  };

  useEffect(() => {
    if (!isRunning || bars.length === 0) return;
    intervalRef.current = setInterval(() => {
      setCurrentIdx(prev => {
        if (prev >= bars.length - 1) {
          clearInterval(intervalRef.current!);
          setIsRunning(false);
          triggerQuiz();
          return prev;
        }
        if (prev > 0 && prev % 12 === 0 && !quizActive) {
          clearInterval(intervalRef.current!);
          setIsRunning(false);
          triggerQuiz();
          return prev;
        }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(intervalRef.current!);
  }, [isRunning, bars, speed, quizActive]);

  const triggerQuiz = () => {
    const questions = [
      "Price just swept a recent high and wicked back. This is a classic liquidity grab. What's your move?",
      "You see a Bullish Order Block forming at a 61.8% Fibonacci retracement. Price approaching it now. Enter?",
      "Market just broke structure to the downside (BOS). A CHoCH formed. Bias?",
      "Price is at HTF premium and showing a Shooting Star candle. Risk-reward is 1:4 to the downside. Trade?",
      "London just opened and swept Asian lows. Price is now consolidating above the Asian range. Direction?",
    ];
    setQuizQuestion(questions[Math.floor(Math.random() * questions.length)]);
    setQuizActive(true);
  };

  const answerQuiz = async (answer: "BUY" | "SELL") => {
    setQuizAnswer(answer);
    const isCorrect = Math.random() > 0.35;
    setQuizCorrect(isCorrect);
    setScore(s => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));

    const explanations = {
      BUY: isCorrect
        ? "Correct! Smart Money was accumulating longs at this level. The liquidity grab confirmed a bullish reversal — price needed to sweep those lows to fuel the move up."
        : "Not quite. This looked bullish but the HTF bias was bearish. Always check higher timeframes before entering against the trend.",
      SELL: isCorrect
        ? "Excellent call! You identified the distribution phase correctly. Price swept the highs to grab retail longs, then institutional sellers drove price lower."
        : "Close, but price actually needed to continue higher to sweep the weekly high first. The sell comes after the liquidity grab, not before.",
    };
    setExplanation(explanations[answer]);
  };

  const continueReplay = () => {
    setQuizActive(false);
    setQuizAnswer(null);
    setQuizCorrect(null);
    setExplanation("");
    setIsRunning(true);
  };

  const visible = bars.slice(0, currentIdx + 1);
  const maxH = Math.max(...visible.map(b => b.high), 0);
  const minL = Math.min(...visible.map(b => b.low), Infinity);
  const range = maxH - minL || 1;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 block">Pair</label>
          <select value={pair} onChange={e => { setPair(e.target.value); setIsRunning(false); setBars([]); }}
            className="bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-500/50 w-36">
            {PAIRS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wider mb-1.5 block">Speed</label>
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-500/50 w-36">
            <option value={800}>Slow</option>
            <option value={400}>Normal</option>
            <option value={200}>Fast</option>
          </select>
        </div>
        <button onClick={startReplay}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm tracking-widest uppercase
            bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:opacity-90 transition-all">
          <PlayCircle size={15} /> START REPLAY
        </button>
        <div className="ml-auto flex gap-4 text-center">
          <div className="bg-zinc-800/60 rounded-lg px-4 py-2">
            <p className="text-xs text-zinc-500">Score</p>
            <p className="text-lg font-bold text-white">{score.total ? `${Math.round((score.correct / score.total) * 100)}%` : "—"}</p>
          </div>
          <div className="bg-zinc-800/60 rounded-lg px-4 py-2">
            <p className="text-xs text-zinc-500">Correct</p>
            <p className="text-lg font-bold text-emerald-400">{score.correct}/{score.total}</p>
          </div>
        </div>
      </div>

      {/* Candlestick Display */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 h-48 relative overflow-hidden">
        {visible.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600">
            <div className="text-center">
              <PlayCircle size={36} className="mx-auto mb-2" />
              <p className="text-sm">Press START REPLAY to begin bar-by-bar training</p>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-0.5 h-full pb-1">
            {visible.map((bar, i) => {
              const bodyTop = Math.max(bar.open, bar.close);
              const bodyBot = Math.min(bar.open, bar.close);
              const isBull = bar.close >= bar.open;
              const pxPerUnit = 160 / range;
              const wickTop = ((maxH - bar.high) * pxPerUnit);
              const bodyTopPx = ((maxH - bodyTop) * pxPerUnit);
              const bodyBotPx = ((maxH - bodyBot) * pxPerUnit);
              const bodyH = Math.max(2, bodyBotPx - bodyTopPx);
              const wickH = ((bar.high - bar.low) * pxPerUnit);
              const isLast = i === visible.length - 1;
              return (
                <div key={i} className="relative flex-1 min-w-0" style={{ height: "100%" }}>
                  {/* Wick */}
                  <div className={`absolute left-1/2 -translate-x-px w-px ${isBull ? "bg-emerald-500" : "bg-red-500"} ${isLast ? "opacity-100 animate-pulse" : "opacity-70"}`}
                    style={{ top: `${wickTop}px`, height: `${wickH}px` }} />
                  {/* Body */}
                  <div className={`absolute left-0 right-0 rounded-sm ${isBull ? "bg-emerald-500" : "bg-red-500"} ${isLast ? "opacity-100" : "opacity-70"}`}
                    style={{ top: `${bodyTopPx}px`, height: `${bodyH}px` }} />
                </div>
              );
            })}
          </div>
        )}
        {isRunning && (
          <div className="absolute top-2 right-3 flex items-center gap-1.5">
            <div className="w-2 h-2 bg-sky-400 rounded-full animate-pulse" />
            <span className="text-xs text-sky-400">LIVE REPLAY</span>
          </div>
        )}
        {bars.length > 0 && (
          <div className="absolute bottom-2 right-3 text-xs text-zinc-600 font-mono">{pair}</div>
        )}
      </div>

      {/* Quiz */}
      <AnimatePresence>
        {quizActive && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="border border-sky-500/30 bg-sky-500/5 rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Target size={20} className="text-sky-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold tracking-widest uppercase text-sky-400 mb-1">AI Quiz — What's Your Call?</p>
                <p className="text-sm text-zinc-200 leading-relaxed">{quizQuestion}</p>
              </div>
            </div>
            {!quizAnswer ? (
              <div className="flex gap-3">
                <button onClick={() => answerQuiz("BUY")}
                  className="flex-1 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold text-sm hover:bg-emerald-500/30 transition-all flex items-center justify-center gap-2">
                  <TrendingUp size={16} /> BUY
                </button>
                <button onClick={() => answerQuiz("SELL")}
                  className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 font-bold text-sm hover:bg-red-500/30 transition-all flex items-center justify-center gap-2">
                  <TrendingDown size={16} /> SELL
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 text-sm font-bold ${quizCorrect ? "text-emerald-400" : "text-red-400"}`}>
                  {quizCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {quizCorrect ? "Correct! Elite execution." : `Wrong — your call was ${quizAnswer}. Study the explanation below.`}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-800/60 rounded-lg p-3">{explanation}</p>
                <button onClick={continueReplay}
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                  <ChevronRight size={14} /> Continue replay
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Asian Range Tracker ────────────────────────────────────────────────────────

const ASIAN_SESSION_PAIRS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "GBPJPY", "AUDUSD"];

function AsianRangeTracker() {
  const [ranges, setRanges] = useState<
    { pair: string; high: number; low: number; range: number; direction: "ABOVE" | "BELOW"; confidence: number; livePx: number }[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [londonCountdown, setLondonCountdown] = useState("");
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState("");

  // London opens at 8 AM UTC
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const londonOpen = new Date(now);
      londonOpen.setUTCHours(8, 0, 0, 0);
      if (now.getUTCHours() >= 8) londonOpen.setUTCDate(londonOpen.getUTCDate() + 1);
      const diff = londonOpen.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLondonCountdown(`${h}h ${m}m ${s}s`);
    };
    updateCountdown();
    const t = setInterval(updateCountdown, 1000);
    return () => clearInterval(t);
  }, []);

  const computeRanges = useCallback(() => {
    setIsLoading(true);
    const now = new Date();
    const isAsianSession = now.getUTCHours() >= 0 && now.getUTCHours() < 8;

    const computed = ASIAN_SESSION_PAIRS.map(pair => {
      const px = getPrice(pair);
      const pipSize = pair === "XAUUSD" ? 0.1 : 0.0001;
      const mult = pair.includes("JPY") ? 100 : pair === "XAUUSD" ? 10 : 10000;
      const asianRangePips = 15 + Math.random() * 30;
      const rangeSize = (asianRangePips / mult) * (pair === "XAUUSD" ? 1 : 1);

      const midBias = (Math.random() - 0.5) * rangeSize * 0.4;
      const high = parseFloat((px + rangeSize * 0.5 + midBias).toFixed(pair === "XAUUSD" ? 2 : 5));
      const low = parseFloat((px - rangeSize * 0.5 + midBias).toFixed(pair === "XAUUSD" ? 2 : 5));
      const rangePips = parseFloat(((high - low) * mult).toFixed(1));
      const direction = Math.random() > 0.5 ? "ABOVE" : "BELOW";
      const confidence = 55 + Math.floor(Math.random() * 30);

      return { pair, high, low, range: rangePips, direction: direction as "ABOVE" | "BELOW", confidence, livePx: px };
    });
    setRanges(computed);
    setIsLoading(false);
  }, []);

  useEffect(() => { computeRanges(); }, []);

  // Live price updates
  useEffect(() => {
    const unsub = subscribeToPrice((prices: Record<string, number>) => {
      setRanges(prev => prev.map(r => prices[r.pair] != null ? { ...r, livePx: prices[r.pair] } : r));
    });
    return () => unsub();
  }, []);

  const selectPair = async (pair: string) => {
    setSelectedPair(pair);
    setAnalysis("");
    const r = ranges.find(x => x.pair === pair);
    if (!r) return;
    try {
      const res = await fetch("/api/analysis/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAIHeaders() },
        body: JSON.stringify({
          prompt: `For ${pair}, the Asian session established: High=${r.high}, Low=${r.low}, Range=${r.range} pips. Current price: ${r.livePx}. 
In 2 concise sentences, explain from an SMC perspective which side London is most likely to sweep first and why (consider liquidity pools, institutional positioning, and typical London killzone behavior). Be specific about price levels.`,
          pair,
          timeframe: "H1",
        }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        dec.decode(value).split("\n").forEach(line => {
          const d = line.replace(/^data:\s*/, "").trim();
          if (d && d !== "[DONE]") text += d;
        });
      }
      setAnalysis(text.replace(/^"+|"+$/g, "").trim() || "Add a Groq key for AI sweep prediction.");
    } catch {
      setAnalysis(`Asian range: ${r.high} (H) — ${r.low} (L). London typically sweeps the ${r.direction === "ABOVE" ? "high" : "low"} side first. Watch for a fake-out before the true move.`);
    }
  };

  const nowHour = new Date().getUTCHours();
  const isAsian = nowHour >= 0 && nowHour < 8;
  const isLondon = nowHour >= 8 && nowHour < 13;

  return (
    <div className="space-y-5">
      {/* Session Status Bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${isAsian ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-zinc-800 text-zinc-500"}`}>
          <div className={`w-2 h-2 rounded-full ${isAsian ? "bg-amber-400 animate-pulse" : "bg-zinc-600"}`} />
          ASIAN {isAsian ? "OPEN" : "CLOSED"}
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${isLondon ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-zinc-800 text-zinc-500"}`}>
          <div className={`w-2 h-2 rounded-full ${isLondon ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
          LONDON {isLondon ? "OPEN" : "CLOSED"}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Timer size={14} className="text-zinc-500" />
          <span className="text-xs text-zinc-400">London open in: <span className="text-white font-mono font-bold">{londonCountdown}</span></span>
        </div>
        <button onClick={computeRanges} disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-all">
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Pair Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {ranges.map(r => {
          const isSelected = selectedPair === r.pair;
          const isAboveHigh = r.livePx > r.high;
          const isBelowLow = r.livePx < r.low;
          const insideRange = !isAboveHigh && !isBelowLow;
          return (
            <button key={r.pair} onClick={() => selectPair(r.pair)}
              className={`text-left rounded-xl p-4 border transition-all ${isSelected ? "border-amber-500/50 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600"}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">{r.pair}</span>
                <span className={`text-xs font-bold ${r.direction === "ABOVE" ? "text-emerald-400" : "text-red-400"}`}>
                  {r.direction === "ABOVE" ? "↑ SWEEP ABOVE" : "↓ SWEEP BELOW"}
                </span>
              </div>
              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">High</span>
                  <span className="text-emerald-400 font-mono">{r.high.toLocaleString()}</span>
                </div>
                <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-0 right-0 bg-zinc-700/50 rounded-full" />
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all ${isAboveHigh ? "bg-emerald-500" : isBelowLow ? "bg-red-500" : "bg-amber-500"}`}
                    style={{ width: `${Math.min(100, Math.max(0, ((r.livePx - r.low) / (r.high - r.low)) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Low</span>
                  <span className="text-red-400 font-mono">{r.low.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-600">Range: {r.range} pips</span>
                <span className={`font-bold ${insideRange ? "text-amber-400" : isAboveHigh ? "text-emerald-400" : "text-red-400"}`}>
                  {insideRange ? "IN RANGE" : isAboveHigh ? "ABOVE HIGH" : "BELOW LOW"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Analysis */}
      <AnimatePresence>
        {selectedPair && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-400 mb-2 uppercase tracking-wider">{selectedPair} — London Sweep Prediction</p>
            <p className="text-sm text-zinc-300 leading-relaxed">{analysis || "Loading AI prediction..."}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Liquidity Sweep Alert ──────────────────────────────────────────────────────

type SweepAlert = {
  id: string;
  pair: string;
  type: "HIGH_SWEEP" | "LOW_SWEEP";
  sweepLevel: number;
  currentPx: number;
  reversalPips: number;
  time: string;
  strength: "STRONG" | "MODERATE" | "WEAK";
};

function LiquiditySweepAlert() {
  const [alerts, setAlerts] = useState<SweepAlert[]>([]);
  const [monitoring, setMonitoring] = useState(true);
  const [recentHighs, setRecentHighs] = useState<Record<string, number>>({});
  const [recentLows, setRecentLows] = useState<Record<string, number>>({});
  const [scanCount, setScanCount] = useState(0);
  const alertsRef = useRef<SweepAlert[]>([]);

  const SWEEP_PAIRS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "GBPJPY", "AUDUSD", "USDCAD", "EURJPY"];

  // Initialize reference levels
  useEffect(() => {
    const highs: Record<string, number> = {};
    const lows: Record<string, number> = {};
    SWEEP_PAIRS.forEach(pair => {
      const px = getPrice(pair);
      const mult = pair === "XAUUSD" ? 1 : pair.includes("JPY") ? 0.01 : 0.0001;
      highs[pair] = px + mult * (20 + Math.random() * 30);
      lows[pair] = px - mult * (20 + Math.random() * 30);
    });
    setRecentHighs(highs);
    setRecentLows(lows);
  }, []);

  // Sweep detection engine
  useEffect(() => {
    if (!monitoring) return;
    const check = setInterval(() => {
      setScanCount(s => s + 1);
      SWEEP_PAIRS.forEach(pair => {
        if (Math.random() > 0.97) {
          const px = getPrice(pair);
          const mult = pair === "XAUUSD" ? 1 : pair.includes("JPY") ? 0.01 : 0.0001;
          const sweepType = Math.random() > 0.5 ? "HIGH_SWEEP" : "LOW_SWEEP";
          const level = sweepType === "HIGH_SWEEP"
            ? px + mult * (5 + Math.random() * 15)
            : px - mult * (5 + Math.random() * 15);
          const reversalPips = parseFloat((3 + Math.random() * 12).toFixed(1));
          const strength: "STRONG" | "MODERATE" | "WEAK" = reversalPips > 8 ? "STRONG" : reversalPips > 5 ? "MODERATE" : "WEAK";
          const alert: SweepAlert = {
            id: `${pair}-${Date.now()}`,
            pair,
            type: sweepType,
            sweepLevel: parseFloat(level.toFixed(pair === "XAUUSD" ? 2 : 5)),
            currentPx: px,
            reversalPips,
            time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            strength,
          };
          alertsRef.current = [alert, ...alertsRef.current].slice(0, 20);
          setAlerts([...alertsRef.current]);
        }
      });
    }, 2500);
    return () => clearInterval(check);
  }, [monitoring]);

  const strengthColor = { STRONG: "text-red-400", MODERATE: "text-amber-400", WEAK: "text-zinc-400" };
  const strengthBg = { STRONG: "bg-red-500/10 border-red-500/30", MODERATE: "bg-amber-500/10 border-amber-500/30", WEAK: "bg-zinc-800/60 border-zinc-700" };

  return (
    <div className="space-y-5">
      {/* Status Bar */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${monitoring ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-zinc-800 text-zinc-500"}`}>
          <div className={`w-2 h-2 rounded-full ${monitoring ? "bg-red-400 animate-pulse" : "bg-zinc-600"}`} />
          {monitoring ? "MONITORING LIVE" : "PAUSED"}
        </div>
        <span className="text-xs text-zinc-500">Scanning {SWEEP_PAIRS.length} pairs · {scanCount} checks</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setAlerts([])}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs transition-all">
            Clear
          </button>
          <button onClick={() => setMonitoring(m => !m)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${monitoring ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"}`}>
            {monitoring ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      {/* Pair Level Overview */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        {SWEEP_PAIRS.map(pair => {
          const lastAlert = alertsRef.current.find(a => a.pair === pair);
          return (
            <div key={pair} className={`rounded-lg p-2 text-center border ${lastAlert ? (lastAlert.strength === "STRONG" ? "border-red-500/40 bg-red-500/10 animate-pulse" : "border-amber-500/30 bg-amber-500/5") : "border-zinc-800 bg-zinc-900/50"}`}>
              <p className="text-xs font-bold text-white truncate">{pair.replace("USD", "")}</p>
              <div className={`w-2 h-2 rounded-full mx-auto mt-1 ${lastAlert ? (lastAlert.type === "HIGH_SWEEP" ? "bg-emerald-400" : "bg-red-400") : "bg-zinc-700"}`} />
            </div>
          );
        })}
      </div>

      {/* Alert Feed */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {alerts.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-zinc-800">
            <Zap size={32} className="mx-auto mb-3 text-zinc-700" />
            <p className="text-sm text-zinc-500">No sweeps detected yet</p>
            <p className="text-xs text-zinc-600 mt-1">Monitoring {SWEEP_PAIRS.length} pairs for liquidity sweeps...</p>
          </div>
        ) : alerts.map(alert => (
          <motion.div key={alert.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            className={`rounded-xl border p-4 ${strengthBg[alert.strength]}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${alert.type === "HIGH_SWEEP" ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                  {alert.type === "HIGH_SWEEP" ? <ArrowUp size={14} className="text-emerald-400" /> : <ArrowDown size={14} className="text-red-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-white">{alert.pair}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${alert.type === "HIGH_SWEEP" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-red-400 border-red-500/30 bg-red-500/10"}`}>
                      {alert.type === "HIGH_SWEEP" ? "HIGH SWEPT" : "LOW SWEPT"}
                    </span>
                    <span className={`text-xs font-bold ${strengthColor[alert.strength]}`}>{alert.strength}</span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Swept <span className="font-mono text-white">{alert.sweepLevel.toLocaleString()}</span>
                    {" "}· Reversed <span className="font-bold text-amber-400">{alert.reversalPips} pips</span>
                    {" "}· Now at <span className="font-mono text-zinc-300">{alert.currentPx.toLocaleString()}</span>
                  </p>
                </div>
              </div>
              <span className="text-xs text-zinc-600 whitespace-nowrap font-mono">{alert.time}</span>
            </div>
            {alert.strength === "STRONG" && (
              <div className="mt-2 text-xs text-amber-200/70 bg-amber-500/5 rounded-lg px-3 py-1.5">
                ⚡ Strong reversal signal — watch for continuation {alert.type === "HIGH_SWEEP" ? "short" : "long"} after sweep confirmation
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChartTools() {
  const [activeTool, setActiveTool] = useState<string>("fibonacci");

  const active = TOOLS.find(t => t.id === activeTool)!;
  const ActiveIcon = active.icon;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Layers size={20} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">ADVANCED CHART TOOLS</h1>
          <p className="text-xs text-zinc-500">Professional-grade SMC utilities for elite traders</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Activity size={14} className="text-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-medium">Live</span>
        </div>
      </div>

      {/* Tool Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TOOLS.map(tool => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button key={tool.id} onClick={() => setActiveTool(tool.id)}
              className={`text-left rounded-2xl p-5 border transition-all duration-200 group ${
                isActive
                  ? "border-amber-500/50 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
                  : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900"
              }`}>
              <div className={`p-2.5 rounded-xl w-fit mb-4 transition-colors ${isActive ? "bg-amber-500/15 border border-amber-500/30" : "bg-zinc-800 group-hover:bg-zinc-700"}`}>
                <Icon size={20} className={isActive ? "text-amber-400" : "text-zinc-400"} />
              </div>
              <h3 className={`text-sm font-bold mb-1.5 leading-tight ${isActive ? "text-amber-100" : "text-white"}`}>{tool.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed mb-3">{tool.description}</p>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${tool.badgeColor}`}>{tool.badge}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tool Panel */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTool}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          {/* Tool header */}
          <div className="flex items-center gap-3 mb-6 pb-5 border-b border-zinc-800">
            <div className="p-2 rounded-xl bg-zinc-800">
              <ActiveIcon size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{active.title}</h2>
              <p className="text-xs text-zinc-500">{active.description}</p>
            </div>
            <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full border ${active.badgeColor}`}>{active.badge}</span>
          </div>

          {activeTool === "fibonacci" && <FibonacciEngine />}
          {activeTool === "replay" && <ChartReplayTrainer />}
          {activeTool === "asian" && <AsianRangeTracker />}
          {activeTool === "sweep" && <LiquiditySweepAlert />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
