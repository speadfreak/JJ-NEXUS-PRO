import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, BookOpen, Target, BarChart2, Brain, Trash2, CheckCircle2,
  FileDown, RefreshCcw, TrendingUp, ArrowRight, ExternalLink, Award,
  Zap, Flame, Activity, Calendar, Filter, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownRight, Minus, Star, Clock, Shield, Pencil, X
} from 'lucide-react';
import { useLivePrices, formatPriceForSymbol } from '@/utils/priceEngine';
import { callAlchemistAI } from '@/utils/freeAI';
import ReactMarkdown from 'react-markdown';
import { calculateDollarPnl, calculateRiskReward, calculateTradePips, getPipSize, getPipValuePerLot, priceDistanceToPips } from '@/utils/pipCalculation';

// ── Constants ─────────────────────────────────────────────────────────────────
const FALLBACK_BENCH = { winRate: 67.3, profitFactor: 2.18, netPips: 9560, maxDD: 8.4, sharpe: 1.87, expectancy: 26.96, totalTrades: 457, source: '19mo Alchemist X baseline' };
const BENCH = FALLBACK_BENCH;
const PAIRS = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','AUDUSD','NZDUSD','USDCHF','USDCAD','NAS100','US30','SPX500','BTCUSD','ETHUSD'];
const STRATEGIES = ['Alchemist SMC','OB + FVG','OB Only','FVG Only','Liquidity Sweep + OB','CHoCH + OB + FVG','Breakout Retest','Scalp'];
const SESSIONS_LIST = ['London Open','London Session','NY Open','NY Session','London-NY Overlap','Asian Session'];
const EMOTIONS = ['Confident','Neutral','Cautious','Excited','Fearful','Frustrated','Calm'];
const GRADES = ['A+','A','B','C'];
const CONFLUENCE_ITEMS = ['HTF Structure','OB','FVG','Liquidity Swept','CHoCH','Kill Zone'];
const CHECKLIST_ITEMS = [
  'Daily/Weekly bias clear','Price in premium/discount zone','Liquidity swept at zone',
  'CHoCH confirmed on entry TF','Valid Order Block at entry','FVG present (confirmation)',
  'London or NY kill zone','DXY aligned (USD pairs)','No major news in 30min',
  'Risk:Reward ≥ 2:1','SL behind structure','Account risk ≤ 2%',
];
const TABS = ['📝 Entry','📚 History','📊 Analytics','🤖 AI Debrief','✅ Checklist','📈 vs Backtest'];
const GOLD = '#D4AF37';
const G10 = 'rgba(212,175,55,0.10)';
const G20 = 'rgba(212,175,55,0.20)';
const G30 = 'rgba(212,175,55,0.30)';

// ── Mini SVG equity curve ─────────────────────────────────────────────────────
function EquityCurve({ trades, width = 120, height = 32 }: { trades: any[]; width?: number; height?: number }) {
  const closed = trades.filter(t => t.pips !== null && t.pips !== undefined);
  if (closed.length < 2) return <div className="text-xs text-gray-700">— no data —</div>;
  let cum = 0;
  const pts = closed.map(t => { cum += Number(t.pips || 0); return cum; });
  const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
  const range = max - min || 1;
  const toX = (i: number) => (i / (pts.length - 1)) * (width - 4) + 2;
  const toY = (v: number) => height - 2 - ((v - min) / range) * (height - 4);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const color = last >= 0 ? '#22c55e' : '#ef4444';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={toX(pts.length - 1).toFixed(1)} cy={toY(last).toFixed(1)} r="2.5" fill={color} />
    </svg>
  );
}

// ── Session heatmap cell ──────────────────────────────────────────────────────
function HeatCell({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? value / max : 0;
  const alpha = 0.08 + pct * 0.55;
  return (
    <div className="w-4 h-4 rounded-sm" style={{ background: `rgba(212,175,55,${alpha})`, border: '1px solid rgba(212,175,55,0.08)' }} />
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2 rounded-xl border" style={{ borderColor: G30, background: G10 }}>
      <span className="text-xs font-mono font-bold" style={{ color: color || GOLD }}>{value}</span>
      <span className="text-[10px] text-gray-600 mt-0.5 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Journal() {
  const [activeTab, setActiveTab] = useState('📝 Entry');
  const [entries, setEntries] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ winRate: 0, totalTrades: 0, averageRR: 0, netPips: 0, winCount: 0, lossCount: 0 });
  const [sessionStats, setSessionStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [insights, setInsights] = useState('');
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [checklist, setChecklist] = useState<boolean[]>(Array(12).fill(false));
  const [filterPair, setFilterPair] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [benchmark, setBenchmark] = useState(FALLBACK_BENCH);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState('');
  const { prices } = useLivePrices();

  const [form, setForm] = useState({
    pair: 'XAUUSD', direction: 'BUY', entryPrice: '', stopLoss: '', takeProfit: '',
    tp2: '', tp3: '', lotSize: '', session: 'London Open', strategy: 'Alchemist SMC',
    grade: 'A', confluences: [] as string[], emotionBefore: 'Confident', emotionAfter: '',
    notes: '', result: 'WIN', actualExit: '',
  });

  // ── Live R:R & pips preview ───────────────────────────────────────────────
  const liveCalc = useMemo(() => {
    const e = Number(form.entryPrice), sl = Number(form.stopLoss), tp = Number(form.takeProfit);
    if (!e || !sl || !tp) return null;
    const isBuy = form.direction === 'BUY';
    const slDist = Math.abs(e - sl);
    const tpDist = Math.abs(tp - e);
    const rr = slDist > 0 ? tpDist / slDist : 0;
    const slPips = priceDistanceToPips(form.pair, slDist);
    const tpPips = priceDistanceToPips(form.pair, tpDist);
    const valid = (isBuy ? tp > e && e > sl : tp < e && e < sl);
    const lots = Number(form.lotSize) || 0;
    const pipValue = getPipValuePerLot(form.pair, e);
    const actualExit = Number(form.actualExit);
    const realizedPips = form.result === 'BE'
      ? 0
      : calculateTradePips(form.pair, form.result, e, sl, tp, form.direction, actualExit > 0 ? actualExit : undefined);
    return {
      rr: rr.toFixed(2),
      slPips: slPips.toFixed(1),
      tpPips: tpPips.toFixed(1),
      riskMoney: (slPips * lots * pipValue).toFixed(2),
      rewardMoney: (tpPips * lots * pipValue).toFixed(2),
      realizedPips: realizedPips.toFixed(1),
      realizedMoney: calculateDollarPnl(form.pair, realizedPips, lots, e).toFixed(2),
      valid,
    };
  }, [form.entryPrice, form.stopLoss, form.takeProfit, form.direction, form.pair, form.lotSize, form.result, form.actualExit]);

  const checklistScore = checklist.filter(Boolean).length;
  const livePrice = prices[form.pair] || 0;

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [tradesRes, statsRes, sessionRes] = await Promise.all([
        fetch('/api/journal/trades'),
        fetch('/api/journal/stats'),
        fetch('/api/journal/session-stats'),
      ]);
      const [tradesData, statsData, sessionData] = await Promise.all([
        tradesRes.json(), statsRes.json(), sessionRes.json(),
      ]);
      setEntries(Array.isArray(tradesData) ? tradesData : []);
      setStats(statsData || {});
      setSessionStats(sessionData || null);
    } catch (err) {
      console.error('Failed to fetch journal data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    try {
      const saved = localStorage.getItem('jjnexus_backtest_benchmark');
      if (saved) setBenchmark({ ...FALLBACK_BENCH, ...JSON.parse(saved) });
    } catch {}
    const pending = localStorage.getItem('jjnexus_pending_journal_entry');
    if (pending) {
      try { const pre = JSON.parse(pending); setForm(p => ({ ...p, ...pre })); setActiveTab('📝 Entry'); localStorage.removeItem('jjnexus_pending_journal_entry'); } catch {}
    }
  }, []);

  useEffect(() => {
    if (livePrice > 0 && !form.entryPrice) {
      setForm(p => ({ ...p, entryPrice: formatPriceForSymbol(form.pair, livePrice) }));
    }
  }, [form.pair, livePrice]);

  const BLANK_FORM = { pair: 'XAUUSD', direction: 'BUY', entryPrice: '', stopLoss: '', takeProfit: '', tp2: '', tp3: '', lotSize: '', session: 'London Open', strategy: 'Alchemist SMC', grade: 'A', confluences: [] as string[], emotionBefore: 'Confident', emotionAfter: '', notes: '', result: 'WIN', actualExit: '' };

  const handleEdit = (entry: any) => {
    setForm({
      pair: entry.pair || 'XAUUSD',
      direction: (entry.direction || 'BUY').toUpperCase(),
      entryPrice: String(entry.entryPrice || ''),
      stopLoss: String(entry.stopLoss || ''),
       takeProfit: String(entry.takeProfit || ''),
       actualExit: entry.actualExit != null ? String(entry.actualExit) : '',
       tp2: '', tp3: '', lotSize: entry.lotSize != null ? String(entry.lotSize) : '',
      session: entry.session || 'London Open',
      strategy: entry.strategy || 'Alchemist SMC',
      grade: entry.grade || 'A',
      confluences: [],
      emotionBefore: 'Confident', emotionAfter: '',
      notes: entry.notes || '',
      result: (entry.result || 'WIN').toUpperCase(),
    });
    setEditingId(entry.id);
    setExpandedId(null);
    setActiveTab('📝 Entry');
    setSaveError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setSaveError('');
  };

  const handleSave = async () => {
    if (!form.entryPrice) return;
    setIsSaving(true);
    setSaveError('');
    const e = Number(form.entryPrice), sl = Number(form.stopLoss), tp = Number(form.takeProfit);
    const slDist = sl ? Math.abs(e - sl) : 0;
    const tpDist = tp ? Math.abs(tp - e) : 0;
    const rrValue = calculateRiskReward(e, sl, tp);
    const rr = rrValue > 0 ? rrValue.toFixed(1) : '2.0';
     const actualExit = Number(form.actualExit);
     const pips = +calculateTradePips(form.pair, form.result, e, sl, tp, form.direction, actualExit > 0 ? actualExit : undefined).toFixed(2);
    const payload = {
      pair: form.pair, direction: form.direction,
      entryPrice: form.entryPrice || '0',
      stopLoss: form.stopLoss || '0',
      takeProfit: form.takeProfit || '0',
       actualExit: form.actualExit || undefined,
       lotSize: form.lotSize ? Number(form.lotSize) : undefined,
      strategy: form.strategy, notes: form.notes,
      status: 'closed', result: form.result,
      pips, riskReward: `1:${rr}`,
      session: form.session, grade: form.grade,
      confluences: form.confluences,
      emotionBefore: form.emotionBefore,
      checklistScore,
    };
    try {
      const url   = editingId ? `/api/journal/trades/${editingId}` : '/api/journal/trades';
      const method = editingId ? 'PUT' : 'POST';
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const e = await resp.text().catch(() => '');
        throw new Error(`${editingId ? 'Update' : 'Save'} failed (${resp.status}): ${e}`);
      }
      setEditingId(null);
      setForm(BLANK_FORM);
      setChecklist(Array(12).fill(false));
      await fetchData();
      setActiveTab('📚 History');
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this trade entry?')) return;
    await fetch(`/api/journal/trades/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const repairHistoricalPips = async () => {
    if (!entries.length || isRepairing) return;
    setIsRepairing(true);
    setRepairMessage('');
    try {
      const response = await fetch('/api/journal/repair-pips', { method: 'POST' });
      if (!response.ok) throw new Error(`Repair failed (${response.status})`);
      const data = await response.json();
      setRepairMessage(`Recalculated ${data.updated} trade${data.updated === 1 ? '' : 's'} using instrument-aware pip sizes.`);
      await fetchData();
    } catch (error: any) {
      setRepairMessage(error.message || 'Could not repair historical pips.');
    } finally {
      setIsRepairing(false);
    }
  };

  const handleAIDebrief = async () => {
    setIsInsightLoading(true);
    setInsights('');
    try {
      const summary = entries.slice(0, 20).map(e =>
        `${e.pair} ${e.direction} ${e.result || 'OPEN'} | Pips: ${e.pips || 0} | R:R ${e.riskReward || '—'} | ${e.strategy} | ${e.session || '—'}`
      ).join('\n');
      const res = await callAlchemistAI(`You are Alchemist AI — elite trading coach. Analyze this trader's recent journal and give a powerful, specific coaching debrief.

RECENT TRADES (last 20):
${summary || 'No trades yet.'}

LIVE STATS: WR ${stats.winRate || 0}% | Trades ${stats.totalTrades || 0} | Net ${stats.netPips || 0} pips | Avg R:R ${stats.averageRR || 0}
       BENCHMARK: WR ${benchmark.winRate}% | Net ${benchmark.netPips} pips | Expectancy ${benchmark.expectancy} pips/trade

## 🔮 ALCHEMIST TRADE DEBRIEF

### Performance Verdict
### Pattern Recognition
### Session Edge
### Strategy Effectiveness
### Critical Weakness to Fix Now
### 7-Day Action Plan
1.
2.
3.
### Alchemist Grade: [A/B/C/D]`);
      setInsights(res);
    } catch { setInsights('⚠️ Could not generate debrief. Configure AI in Settings → API & Keys.'); }
    setIsInsightLoading(false);
  };

  const exportCSV = () => {
    const headers = ['Date','Pair','Dir','Entry','SL','TP','Lot Size','Result','Pips','R:R','Strategy','Session','Grade','Notes'];
    const rows = entries.map(e => [
      new Date(e.createdAt || e.date || e.created_at).toLocaleDateString(),
       e.pair, e.direction, e.entryPrice || '', e.stopLoss || '', e.takeProfit || '', e.lotSize || '',
      e.result || '', e.pips || '', e.riskReward || '', e.strategy || '', e.session || '', e.grade || '', (e.notes || '').replace(/,/g,''),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `journal_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const filtered = entries.filter(e => {
    if (filterPair && !e.pair?.toUpperCase().includes(filterPair.toUpperCase())) return false;
    if (filterResult && (e.result || '').toUpperCase() !== filterResult) return false;
    return true;
  });

  // Win streak
  const streak = useMemo(() => {
    let s = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const r = (entries[i].result || '').toUpperCase();
      if (r === 'WIN') s++; else break;
    }
    return s;
  }, [entries]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-col h-full gap-3">

      {/* ── Header ── */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: G10, border: `1px solid ${G30}` }}>
              <BookOpen className="w-4 h-4" style={{ color: GOLD }} />
            </div>
            <div>
              <h1 className="font-serif font-black text-xl tracking-wider" style={{ color: GOLD }}>TRADE JOURNAL</h1>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Alchemist X · Performance Log</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {streak >= 3 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-orange-400" style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)' }}>
                <Flame className="w-3 h-3" /> {streak} streak
              </div>
            )}
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-gray-400 hover:text-white" style={{ border: `1px solid ${G20}` }}>
              <FileDown className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
           <StatPill label="Win Rate" value={`${stats.winRate || 0}%`} color={(stats.winRate || 0) >= benchmark.winRate ? '#22c55e' : GOLD} />
          <StatPill label="Net Pips" value={`${(stats.netPips || 0) >= 0 ? '+' : ''}${stats.netPips || 0}`} color={(stats.netPips || 0) >= 0 ? '#22c55e' : '#ef4444'} />
          <StatPill label="Avg R:R" value={`1:${stats.averageRR || 0}`} color={GOLD} />
          <StatPill label="Trades" value={String(stats.totalTrades || 0)} />
          {/* Combined backtest + live pips */}
          <div className="flex flex-col items-center px-3 py-1.5 rounded-xl border shrink-0 relative" style={{ borderColor: 'rgba(212,175,55,0.35)', background: 'rgba(212,175,55,0.06)' }}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">Combined</span>
             <span className="text-xs font-mono font-black" style={{ color: GOLD }}>+{(benchmark.netPips + (stats.netPips || 0)).toLocaleString()}</span>
            <span className="text-[8px] text-gray-700">Backtest+Live pips</span>
          </div>
          {/* Backtest benchmark badge */}
          <div className="flex flex-col items-center px-3 py-1.5 rounded-xl border shrink-0" style={{ borderColor: 'rgba(212,175,55,0.2)', background: 'rgba(0,0,0,0.4)' }}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">Benchmark</span>
             <span className="text-xs font-mono font-black" style={{ color: 'rgba(212,175,55,0.6)' }}>{benchmark.winRate}% · +{benchmark.netPips.toLocaleString()}</span>
             <span className="text-[8px] text-gray-700">{benchmark.source}</span>
          </div>
          {entries.length >= 2 && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-xl shrink-0" style={{ border: `1px solid ${G20}`, background: G10 }}>
              <EquityCurve trades={entries} width={90} height={28} />
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0.5 rounded-xl p-1 shrink-0 overflow-x-auto" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${G10}` }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap"
            style={activeTab === tab ? { background: GOLD, color: '#000' } : { color: '#555' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        <AnimatePresence mode="wait">

          {/* ══ NEW ENTRY ══ */}
          {activeTab === '📝 Entry' && (
            <motion.div key="entry" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 pb-4">

              {/* Pair / Direction row */}
              <div className="rounded-2xl p-4 space-y-4" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.6)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5" style={{ color: GOLD }} /> New Trade Entry
                  </span>
                  {livePrice > 0 && (
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg" style={{ color: GOLD, background: G10, border: `1px solid ${G20}` }}>
                      ⚡ {formatPriceForSymbol(form.pair, livePrice)}
                    </span>
                  )}
                </div>

                {/* Pair + Direction + Session + Grade */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Pair</label>
                    <select value={form.pair} onChange={e => setForm(p => ({ ...p, pair: e.target.value }))}
                      className="w-full bg-black/80 text-white rounded-lg px-2 py-2 text-sm focus:outline-none" style={{ border: `1px solid ${G20}` }}>
                      {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Direction</label>
                    <div className="grid grid-cols-2 gap-1">
                      {['BUY','SELL'].map(d => (
                        <button key={d} onClick={() => setForm(p => ({ ...p, direction: d }))}
                          className="py-2 rounded-lg text-xs font-black transition-all"
                          style={form.direction === d
                            ? { background: d === 'BUY' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)', color: d === 'BUY' ? '#22c55e' : '#ef4444', border: `1px solid ${d === 'BUY' ? '#22c55e' : '#ef4444'}` }
                            : { background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Session</label>
                    <select value={form.session} onChange={e => setForm(p => ({ ...p, session: e.target.value }))}
                      className="w-full bg-black/80 text-white rounded-lg px-2 py-2 text-sm focus:outline-none" style={{ border: `1px solid ${G20}` }}>
                      {SESSIONS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Grade</label>
                    <div className="grid grid-cols-4 gap-1">
                      {GRADES.map(g => (
                        <button key={g} onClick={() => setForm(p => ({ ...p, grade: g }))}
                          className="py-2 rounded-lg text-xs font-black transition-all"
                          style={form.grade === g
                            ? { background: G20, color: GOLD, border: `1px solid ${GOLD}` }
                            : { background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Price inputs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { key: 'entryPrice', label: 'Entry Price', required: true },
                    { key: 'stopLoss', label: 'Stop Loss' },
                     { key: 'takeProfit', label: 'Take Profit' },
                     { key: 'actualExit', label: 'Actual Exit', optional: true },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">
                        {f.label} {f.required && <span style={{ color: GOLD }}>*</span>}
                      </label>
                      <input type="number" step="any" value={(form as any)[f.key]}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full bg-black/80 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none transition-colors"
                        style={{ border: `1px solid ${G20}` }}
                        placeholder={f.key === 'entryPrice' && livePrice > 0 ? formatPriceForSymbol(form.pair, livePrice) : '0.00'}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Lot Size <span style={{ color: GOLD }}>*</span></label>
                    <input type="number" min="0" step="0.0001" value={form.lotSize}
                      onChange={e => setForm(p => ({ ...p, lotSize: e.target.value }))}
                      className="w-full bg-black/80 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none transition-colors"
                       style={{ border: `1px solid ${G20}` }} placeholder="0.10" />
                  </div>
                </div>

                {/* Live R:R preview */}
                {liveCalc && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {[
                      { label: 'R:R Ratio', value: `1:${liveCalc.rr}`, ok: Number(liveCalc.rr) >= 2 },
                      { label: 'SL Distance', value: `${liveCalc.slPips} pips` },
                      { label: 'TP Distance', value: `${liveCalc.tpPips} pips` },
                      { label: 'Risk @ Lots', value: liveCalc.riskMoney === '0.00' ? '—' : `$${liveCalc.riskMoney}` },
                         { label: 'Reward @ Lots', value: liveCalc.rewardMoney === '0.00' ? '—' : `$${liveCalc.rewardMoney}` },
                      { label: 'Realized Pips', value: `${liveCalc.realizedPips} pips` },
                      { label: 'Realized P/L', value: liveCalc.realizedMoney === '0.00' ? '—' : `$${liveCalc.realizedMoney}` },
                    ].map(c => (
                      <div key={c.label} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)` }}>
                        <div className="text-xs font-bold font-mono" style={{ color: 'ok' in c && c.ok !== undefined ? (c.ok ? '#22c55e' : '#f97316') : GOLD }}>{c.value}</div>
                        <div className="text-[9px] text-gray-600 mt-0.5">{c.label}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded-lg px-3 py-2 text-[10px] text-gray-500"
                  style={{ background: 'rgba(212,175,55,0.04)', border: `1px solid ${G10}` }}>
                  <span style={{ color: GOLD }} className="font-bold">PIP CONVENTION:</span>{' '}
                  pips measure price distance; lot size changes the money risk/reward. {form.pair} uses {getPipSize(form.pair)} price units per pip
                  {form.pair === 'XAUUSD' ? ' — a $1.00 Gold move = 100 pips.' : '.'}
                </div>

                {/* Strategy + Result + Emotion */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Strategy</label>
                    <select value={form.strategy} onChange={e => setForm(p => ({ ...p, strategy: e.target.value }))}
                      className="w-full bg-black/80 text-white rounded-lg px-2 py-2 text-sm focus:outline-none" style={{ border: `1px solid ${G20}` }}>
                      {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Result</label>
                    <div className="grid grid-cols-3 gap-1">
                      {[['WIN','#22c55e'],['LOSS','#ef4444'],['BE','#6b7280']].map(([r, c]) => (
                        <button key={r} onClick={() => setForm(p => ({ ...p, result: r }))}
                          className="py-2 rounded-lg text-xs font-black transition-all"
                          style={form.result === r
                            ? { background: `${c}22`, color: c, border: `1px solid ${c}` }
                            : { background: 'rgba(255,255,255,0.03)', color: '#444', border: '1px solid rgba(255,255,255,0.07)' }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Emotion</label>
                    <select value={form.emotionBefore} onChange={e => setForm(p => ({ ...p, emotionBefore: e.target.value }))}
                      className="w-full bg-black/80 text-white rounded-lg px-2 py-2 text-sm focus:outline-none" style={{ border: `1px solid ${G20}` }}>
                      {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>

                {/* Confluences */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-2 block">Confluences ({form.confluences.length}/6)</label>
                  <div className="flex flex-wrap gap-2">
                    {CONFLUENCE_ITEMS.map(c => {
                      const on = form.confluences.includes(c);
                      return (
                        <button key={c} onClick={() => setForm(p => ({ ...p, confluences: on ? p.confluences.filter(x => x !== c) : [...p.confluences, c] }))}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={on ? { background: G20, color: GOLD, border: `1px solid ${G30}` } : { background: 'transparent', color: '#444', border: '1px solid rgba(255,255,255,0.06)' }}>
                          {on ? '✓' : '+'} {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-gray-600 mb-1 block">Trade Notes & Analysis</label>
                  <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    rows={3} placeholder="Why this setup? What confluences fired? Market context?"
                    className="w-full bg-black/80 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none placeholder-gray-700"
                    style={{ border: `1px solid ${G20}` }} />
                </div>

                {/* Checklist score */}
                {checklistScore > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg text-xs font-semibold"
                    style={{ background: checklistScore >= 10 ? 'rgba(34,197,94,0.07)' : checklistScore >= 7 ? 'rgba(249,115,22,0.07)' : 'rgba(239,68,68,0.07)', border: `1px solid ${checklistScore >= 10 ? 'rgba(34,197,94,0.2)' : checklistScore >= 7 ? 'rgba(249,115,22,0.2)' : 'rgba(239,68,68,0.2)'}`, color: checklistScore >= 10 ? '#22c55e' : checklistScore >= 7 ? '#f97316' : '#ef4444' }}>
                    <Shield className="w-4 h-4 shrink-0" />
                    Checklist {checklistScore}/12 — {checklistScore >= 10 ? '✅ GREEN LIGHT' : checklistScore >= 7 ? '⚠️ AMBER — Proceed with caution' : '🚫 RED — Do not trade'}
                  </div>
                )}

                {/* Error */}
                {saveError && (
                  <div className="p-3 rounded-lg text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    ⚠️ {saveError}
                  </div>
                )}

                {/* Edit-mode banner */}
                {editingId && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold"
                    style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: GOLD }}>
                    <span className="flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Editing trade #{editingId}</span>
                    <button onClick={handleCancelEdit} className="flex items-center gap-1 text-gray-500 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                )}

                <button onClick={handleSave} disabled={isSaving || !form.entryPrice}
                  className="w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: GOLD, color: '#000' }}>
                  {isSaving
                    ? <><RefreshCcw className="w-4 h-4 animate-spin" /> {editingId ? 'Updating...' : 'Saving...'}</>
                    : editingId
                      ? <><Pencil className="w-4 h-4" /> Update Trade</>
                      : <><Plus className="w-4 h-4" /> Save Trade Entry</>
                  }
                </button>
              </div>
            </motion.div>
          )}

          {/* ══ HISTORY ══ */}
          {activeTab === '📚 History' && (
            <motion.div key="hist" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-4 space-y-3">
              {/* Filters */}
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.5)' }}>
                  <Filter className="w-3 h-3 text-gray-600" />
                  <input value={filterPair} onChange={e => setFilterPair(e.target.value)} placeholder="Pair..." className="bg-transparent text-white text-xs w-20 focus:outline-none placeholder-gray-700" />
                </div>
                <select value={filterResult} onChange={e => setFilterResult(e.target.value)}
                  className="bg-black/80 text-gray-400 rounded-lg px-2 py-1.5 text-xs focus:outline-none" style={{ border: `1px solid ${G20}` }}>
                  <option value="">All Results</option>
                  <option value="WIN">WIN</option>
                  <option value="LOSS">LOSS</option>
                  <option value="BE">BE</option>
                </select>
                <span className="text-xs text-gray-600 ml-auto">{filtered.length} trades</span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-16"><RefreshCcw className="w-5 h-5 animate-spin" style={{ color: GOLD }} /></div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <BookOpen className="w-10 h-10 text-gray-800" />
                  <p className="text-gray-600 text-sm">No trades yet. Log your first trade!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...filtered].reverse().map((entry: any) => {
                    const res = (entry.result || '').toUpperCase();
                    const isWin = res === 'WIN', isBE = res === 'BE';
                    const borderColor = isWin ? 'rgba(34,197,94,0.3)' : isBE ? 'rgba(107,114,128,0.3)' : 'rgba(239,68,68,0.3)';
                    const bgColor = isWin ? 'rgba(34,197,94,0.04)' : isBE ? 'rgba(107,114,128,0.04)' : 'rgba(239,68,68,0.04)';
                    const isExpanded = expandedId === entry.id;
                    return (
                      <div key={entry.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: bgColor }}>
                        <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-black px-2 py-0.5 rounded-md" style={{ background: isWin ? 'rgba(34,197,94,0.15)' : isBE ? 'rgba(107,114,128,0.15)' : 'rgba(239,68,68,0.15)', color: isWin ? '#22c55e' : isBE ? '#9ca3af' : '#ef4444' }}>
                              {res || 'OPEN'}
                            </span>
                            <span className="font-black text-white text-sm">{entry.pair}</span>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: entry.direction?.toUpperCase() === 'BUY' ? '#22c55e' : '#ef4444', background: entry.direction?.toUpperCase() === 'BUY' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
                              {(entry.direction || '').toUpperCase()}
                            </span>
                            {entry.grade && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ color: GOLD, background: G10, border: `1px solid ${G20}` }}>{entry.grade}</span>}
                            <span className="text-xs text-gray-600 hidden sm:block">{entry.strategy}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-bold" style={{ color: (entry.pips || 0) > 0 ? '#22c55e' : (entry.pips || 0) < 0 ? '#ef4444' : '#6b7280' }}>
                              {(entry.pips || 0) > 0 ? '+' : ''}{Number(entry.pips || 0).toFixed(1)} pips
                            </span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-600" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-600" />}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
                            <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-xs">
                              {[
                                ['Entry', entry.entryPrice], ['SL', entry.stopLoss], ['TP', entry.takeProfit],
                                ['Lots', entry.lotSize], ['R:R', entry.riskReward], ['Session', entry.session], ['Date', new Date(entry.createdAt || entry.date || entry.created_at).toLocaleDateString()],
                              ].map(([l, v]) => (
                                <div key={l}>
                                  <div className="text-[9px] text-gray-700 uppercase mb-0.5">{l}</div>
                                  <div className="text-gray-300 font-mono">{v || '—'}</div>
                                </div>
                              ))}
                            </div>
                            {entry.notes && <p className="text-xs text-gray-500 italic">"{entry.notes}"</p>}
                            <div className="flex justify-end gap-3">
                              <button onClick={() => handleEdit(entry)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-yellow-400 transition-colors">
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button onClick={() => handleDelete(entry.id)} className="flex items-center gap-1 text-xs text-gray-700 hover:text-red-500 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ══ ANALYTICS ══ */}
          {activeTab === '📊 Analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4 pb-4">
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Activity className="w-10 h-10 text-gray-800" />
                  <p className="text-gray-600 text-sm">Log trades to see analytics</p>
                </div>
              ) : (
                <>
                  {/* Equity curve */}
                  <div className="rounded-2xl p-4" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.5)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>Equity Curve</span>
                      <span className="text-xs text-gray-600 font-mono">{entries.length} trades</span>
                    </div>
                    <div className="w-full">
                      {(() => {
                        const closed = entries.filter(t => t.pips !== null && t.pips !== undefined);
                        if (closed.length < 2) return <p className="text-gray-700 text-sm py-4 text-center">Need 2+ closed trades</p>;
                        let cum = 0;
                        const pts = closed.map(t => { cum += Number(t.pips || 0); return cum; });
                        const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
                        const range = max - min || 1;
                        const W = 500, H = 100;
                        const toX = (i: number) => (i / (pts.length - 1)) * (W - 8) + 4;
                        const toY = (v: number) => H - 4 - ((v - min) / range) * (H - 8);
                        const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
                        const zeroY = toY(0);
                        const lastPips = pts[pts.length - 1];
                        const lineColor = lastPips >= 0 ? '#22c55e' : '#ef4444';
                        const fillD = `${d} L${toX(pts.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
                        return (
                          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 80 }}>
                            <line x1="4" y1={zeroY} x2={W - 4} y2={zeroY} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4,4" />
                            <path d={fillD} fill={lastPips >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)'} />
                            <path d={d} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx={toX(pts.length - 1)} cy={toY(lastPips)} r="4" fill={lineColor} />
                          </svg>
                        );
                      })()}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-700 mt-1">
                      <span>Trade 1</span>
                      <span className="font-mono" style={{ color: (stats.netPips || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                        {(stats.netPips || 0) >= 0 ? '+' : ''}{stats.netPips || 0} pips total
                      </span>
                      <span>Latest</span>
                    </div>
                  </div>

                  {/* Session stats */}
                  {sessionStats?.sessionWinRates && (
                    <div className="rounded-2xl p-4" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.5)' }}>
                      <span className="text-xs font-black uppercase tracking-widest block mb-3" style={{ color: GOLD }}>Session Performance</span>
                      <div className="space-y-2">
                        {Object.entries(sessionStats.sessionWinRates).map(([session, d]: [string, any]) => (
                          d.total > 0 && (
                            <div key={session} className="flex items-center gap-3">
                              <span className="text-xs text-gray-400 w-24 shrink-0">{session}</span>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/5">
                                <div className="h-full rounded-full" style={{ width: `${d.winRate}%`, background: d.winRate >= 60 ? '#22c55e' : d.winRate >= 45 ? GOLD : '#ef4444', transition: 'width 0.5s' }} />
                              </div>
                              <span className="text-xs font-mono font-bold w-12 text-right" style={{ color: d.winRate >= 60 ? '#22c55e' : d.winRate >= 45 ? GOLD : '#ef4444' }}>{d.winRate}%</span>
                              <span className="text-[10px] text-gray-700 w-12 text-right">{d.total} trades</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strategy breakdown */}
                  {sessionStats?.strategyBreakdown && Object.keys(sessionStats.strategyBreakdown).length > 0 && (
                    <div className="rounded-2xl p-4" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.5)' }}>
                      <span className="text-xs font-black uppercase tracking-widest block mb-3" style={{ color: GOLD }}>Strategy Breakdown</span>
                      <div className="space-y-2">
                        {Object.entries(sessionStats.strategyBreakdown).slice(0, 6).map(([strat, d]: [string, any]) => (
                          <div key={strat} className="flex items-center justify-between py-1.5 border-b border-white/3">
                            <span className="text-xs text-gray-400 flex-1 truncate">{strat}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-gray-600">{d.count} trades</span>
                              <span className="text-xs font-mono font-bold" style={{ color: d.winRate >= 60 ? '#22c55e' : d.winRate >= 45 ? GOLD : '#ef4444' }}>{d.winRate}% WR</span>
                              <span className="text-xs font-mono" style={{ color: d.pips >= 0 ? '#22c55e' : '#ef4444' }}>{d.pips >= 0 ? '+' : ''}{d.pips} pips</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Win/Loss stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Wins', value: stats.winCount || 0, color: '#22c55e', bg: 'rgba(34,197,94,0.07)', border: 'rgba(34,197,94,0.2)' },
                      { label: 'Losses', value: stats.lossCount || 0, color: '#ef4444', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)' },
                      { label: 'Breakeven', value: stats.breakEvenCount || 0, color: '#6b7280', bg: 'rgba(107,114,128,0.07)', border: 'rgba(107,114,128,0.2)' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                        <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
                        <div className="text-[10px] text-gray-600 uppercase tracking-widest mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ══ AI DEBRIEF ══ */}
          {activeTab === '🤖 AI Debrief' && (
            <motion.div key="debrief" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-4">
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                <div className="flex items-center justify-between p-4 border-b" style={{ background: 'rgba(0,0,0,0.7)', borderColor: G10 }}>
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="font-black text-sm text-white">ALCHEMIST AI TRADE DEBRIEF</span>
                  </div>
                  <button onClick={handleAIDebrief} disabled={isInsightLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-40"
                    style={{ background: GOLD, color: '#000' }}>
                    <Brain className={`w-3.5 h-3.5 ${isInsightLoading ? 'animate-pulse' : ''}`} />
                    {isInsightLoading ? 'Analyzing...' : entries.length === 0 ? 'Sample Debrief' : 'Generate Debrief'}
                  </button>
                </div>
                <div className="p-5 min-h-[320px]" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  {isInsightLoading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: `${G30}`, borderTopColor: GOLD }} />
                      <p className="text-gray-500 text-sm">Alchemist AI analyzing your trading pattern...</p>
                    </div>
                  )}
                  {insights && !isInsightLoading && (
                    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-[var(--gold)] prose-strong:text-white prose-p:text-gray-300 prose-li:text-gray-300">
                      <ReactMarkdown>{insights}</ReactMarkdown>
                    </div>
                  )}
                  {!insights && !isInsightLoading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                      <Brain className="w-12 h-12 text-gray-800" />
                      <p className="text-gray-500 text-sm font-semibold">Click Generate for a personalized AI coaching analysis</p>
                      <p className="text-gray-700 text-xs">Based on your last {Math.min(entries.length, 20)} trade entries</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ CHECKLIST ══ */}
          {activeTab === '✅ Checklist' && (
            <motion.div key="checklist" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-4">
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                <div className="flex items-center justify-between p-4 border-b" style={{ background: 'rgba(0,0,0,0.7)', borderColor: G10 }}>
                  <span className="font-black text-sm text-white flex items-center gap-2">
                    <Shield className="w-4 h-4" style={{ color: GOLD }} /> 12-POINT ALCHEMIST CHECKLIST
                  </span>
                  <div className="px-3 py-1 rounded-full text-xs font-black" style={checklistScore >= 10 ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e' } : checklistScore >= 7 ? { background: 'rgba(249,115,22,0.15)', color: '#f97316' } : { background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                    {checklistScore}/12
                  </div>
                </div>
                <div className="p-4 space-y-1.5" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  {CHECKLIST_ITEMS.map((item, idx) => (
                    <button key={idx} onClick={() => { const u = [...checklist]; u[idx] = !u[idx]; setChecklist(u); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                      style={checklist[idx]
                        ? { background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }
                        : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {checklist[idx]
                        ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                        : <div className="w-4 h-4 rounded-full border border-gray-700 flex items-center justify-center text-[9px] text-gray-700 shrink-0 font-bold">{idx + 1}</div>
                      }
                      <span className="text-sm" style={{ color: checklist[idx] ? '#86efac' : '#555' }}>{item}</span>
                    </button>
                  ))}
                </div>
                <div className="p-4 border-t" style={{ borderColor: G10, background: 'rgba(0,0,0,0.5)' }}>
                  <p className="text-sm font-bold" style={{ color: checklistScore >= 10 ? '#22c55e' : checklistScore >= 7 ? '#f97316' : '#ef4444' }}>
                    {checklistScore >= 10 ? '✅ GREEN LIGHT — Setup is valid. You may enter.' : checklistScore >= 7 ? '⚠️ AMBER — 7-9/12. Trade small. Identify gaps.' : '🚫 RED — Below 7/12. DO NOT TRADE. Wait for better setup.'}
                  </p>
                  <button onClick={() => setChecklist(Array(12).fill(false))} className="text-xs text-gray-700 hover:text-gray-400 transition-colors mt-2">Reset checklist</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ VS BACKTEST ══ */}
          {activeTab === '📈 vs Backtest' && (
            <motion.div key="vsbt" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4 pb-4">

              {/* Header banner */}
              <div className="relative overflow-hidden rounded-2xl p-4" style={{ border: `1px solid ${G20}`, background: 'linear-gradient(135deg, rgba(0,0,0,0.8), rgba(212,175,55,0.04))' }}>
                <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(212,175,55,0.3), transparent 60%)' }} />
                <div className="relative flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4" style={{ color: GOLD }} />
                      <span className="font-black text-sm" style={{ color: GOLD }}>LIVE vs ALCHEMIST X BENCHMARK</span>
                    </div>
                    <p className="text-gray-600 text-xs">Your real trades measured against 19-month verified backtest results</p>
                  </div>
                  <button onClick={() => window.location.href = '/backtest'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors"
                    style={{ background: G10, color: GOLD, border: `1px solid ${G30}` }}>
                    <ExternalLink className="w-3 h-3" /> Full Backtest
                  </button>
                </div>
              </div>

              {(stats.totalTrades || 0) === 0 ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <BarChart2 className="w-12 h-12 text-gray-800" />
                  <p className="text-gray-500 font-bold">No live trades yet</p>
                  <p className="text-gray-700 text-xs max-w-xs">Log your first trade to start tracking performance against the Alchemist X benchmark.</p>
                  <button onClick={() => setActiveTab('📝 Entry')} className="px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2" style={{ background: GOLD, color: '#000' }}>
                    <Plus className="w-4 h-4" /> Log First Trade
                  </button>
                </div>
              ) : (() => {
                const liveWR = stats.winRate || 0;
                const livePips = stats.netPips || 0;
                const liveTrades = stats.totalTrades || 0;
                const liveRR = parseFloat(stats.averageRR || '0');
                const liveWins = stats.winCount || 0;
                const liveLosses = stats.lossCount || 0;
                const livePF = liveLosses > 0 && liveWins > 0 ? +((liveWins * Math.max(liveRR, 1)) / liveLosses).toFixed(2) : 0;
                const liveExpect = liveTrades > 0 ? +(livePips / liveTrades).toFixed(1) : 0;

                let score = 0;
                if (liveWR >= BENCH.winRate * 0.85) score++;
                if (livePF >= BENCH.profitFactor * 0.80) score++;
                if (liveExpect > 0) score++;
                if (liveRR >= 1.5) score++;
                if (liveTrades >= 20) score++;
                const grade = score >= 4 ? 'A' : score === 3 ? 'B' : score === 2 ? 'C' : 'D';
                const gradeColor = grade === 'A' ? '#22c55e' : grade === 'B' ? GOLD : grade === 'C' ? '#f97316' : '#ef4444';

                const metrics = [
                  { label: 'Win Rate', live: `${liveWR}%`, bench: `${BENCH.winRate}%`, pct: Math.min(100, (liveWR / BENCH.winRate) * 100) },
                  { label: 'Profit Factor', live: livePF.toFixed(2), bench: BENCH.profitFactor.toFixed(2), pct: Math.min(100, (livePF / BENCH.profitFactor) * 100) },
                  { label: 'Net Pips', live: `${livePips >= 0 ? '+' : ''}${livePips}`, bench: `+${BENCH.netPips}`, pct: Math.min(100, Math.max(0, (livePips / BENCH.netPips) * 100)) },
                  { label: 'Expectancy', live: `${liveExpect >= 0 ? '+' : ''}${liveExpect}`, bench: `+${BENCH.expectancy}`, pct: Math.min(100, Math.max(0, (liveExpect / BENCH.expectancy) * 100)) },
                  { label: 'Trades', live: `${liveTrades}`, bench: `${BENCH.totalTrades}`, pct: Math.min(100, (liveTrades / BENCH.totalTrades) * 100) },
                ];

                return (
                  <>
                    {/* Grade card */}
                    <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: `${gradeColor}08`, border: `1px solid ${gradeColor}30` }}>
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shrink-0" style={{ background: `${gradeColor}18`, color: gradeColor, fontFamily: 'Cinzel, serif' }}>{grade}</div>
                      <div>
                        <p className="font-black text-white text-base mb-0.5">Live Trading Grade: {grade}</p>
                        <p className="text-xs text-gray-500">{score}/5 benchmark criteria met</p>
                        <div className="flex gap-1 mt-1.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="w-6 h-1.5 rounded-full" style={{ background: i < score ? gradeColor : 'rgba(255,255,255,0.08)' }} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Metric bars */}
                    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${G20}` }}>
                      <div className="grid grid-cols-4 border-b p-3" style={{ background: 'rgba(0,0,0,0.6)', borderColor: G10 }}>
                        {['Metric','🏆 Benchmark','📊 Your Live','Progress'].map(h => (
                          <div key={h} className="text-[9px] font-black text-gray-700 uppercase tracking-wider">{h}</div>
                        ))}
                      </div>
                      {metrics.map(m => (
                        <div key={m.label} className="grid grid-cols-4 p-3 border-b items-center transition-colors hover:bg-white/1" style={{ borderColor: 'rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.3)' }}>
                          <div className="text-xs font-bold text-gray-500">{m.label}</div>
                          <div className="text-xs font-bold font-mono" style={{ color: GOLD }}>{m.bench}</div>
                          <div className="text-xs font-bold font-mono text-blue-400">{m.live}</div>
                          <div>
                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, background: m.pct >= 100 ? '#22c55e' : m.pct >= 60 ? GOLD : '#ef4444' }} />
                            </div>
                            <span className="text-[9px] font-mono mt-0.5 block" style={{ color: m.pct >= 100 ? '#22c55e' : m.pct >= 60 ? GOLD : '#ef4444' }}>{m.pct.toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action items */}
                    <div className="rounded-2xl p-4 space-y-2" style={{ border: `1px solid ${G20}`, background: 'rgba(0,0,0,0.5)' }}>
                      <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mb-3" style={{ color: GOLD }}>
                        <Zap className="w-3.5 h-3.5" /> Next Actions to Close the Gap
                      </p>
                      {liveWR < BENCH.winRate && <p className="text-xs text-gray-600">• <span className="text-white font-bold">Raise win rate</span> — Only take Grade A setups with 4+ confluences checked</p>}
                      {livePF < BENCH.profitFactor && <p className="text-xs text-gray-600">• <span className="text-white font-bold">Improve profit factor</span> — Target minimum 2:1 RR; cut losers faster at structure</p>}
                      {liveExpect < BENCH.expectancy && <p className="text-xs text-gray-600">• <span className="text-white font-bold">Boost expectancy</span> — Focus on London Open + NY Open kill zones only</p>}
                      {liveTrades < 30 && <p className="text-xs text-gray-600">• <span className="text-white font-bold">Build sample size</span> — Log every trade; need 30+ for statistically meaningful results</p>}
                      {grade === 'A' && <p className="text-xs text-gray-600">• <span className="text-green-400 font-bold">Performing at benchmark level</span> — Consider stepping up position size 10–20%</p>}
                      <div className="pt-2 border-t" style={{ borderColor: G10 }}>
                        <button onClick={() => window.location.href = '/backtest'} className="flex items-center gap-2 text-xs font-bold transition-colors hover:opacity-80" style={{ color: GOLD }}>
                          <TrendingUp className="w-3 h-3" /> Study benchmark trades to close the gap →
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}
