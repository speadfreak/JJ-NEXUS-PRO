import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import {
  BarChart2, TrendingUp, TrendingDown, Clock, Target, RefreshCcw,
  Award, Activity, Minus, Globe, Sun, Moon, DollarSign
} from 'lucide-react';

interface SessionStats {
  wins: number; losses: number; be: number; total: number; winRate: number; pips: number;
}
interface StrategyStats {
  count: number; wins: number; losses: number; be: number; avgRR: number; winRate: number; pips: number;
}
interface EquityPoint {
  index: number; date: string; pips: number; cumulative: number;
  pair: string; result: string; strategy: string;
}
interface StatsData {
  sessionWinRates: Record<string, SessionStats>;
  strategyBreakdown: Record<string, StrategyStats>;
  equityCurve: EquityPoint[];
  totalTrades: number;
}

const SESSION_CONFIG = [
  { key: 'London', label: 'London', icon: Sun, time: '07:00–13:00 UTC', color: '#4ade80', gradient: 'from-green-500/20 to-green-500/5' },
  { key: 'New York', label: 'New York', icon: Globe, time: '13:00–21:00 UTC', color: '#60a5fa', gradient: 'from-blue-500/20 to-blue-500/5' },
  { key: 'Asia', label: 'Asia', icon: Moon, time: '21:00–07:00 UTC', color: '#a78bfa', gradient: 'from-violet-500/20 to-violet-500/5' },
];

const GOLD = '#d4af37';

function WinRateRing({ rate, color }: { rate: number; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ;
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="shrink-0">
      <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle
        cx={36} cy={36} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        strokeDashoffset={circ * 0.25}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x={36} y={40} textAnchor="middle" fill={color} fontSize={14} fontWeight="bold" fontFamily="monospace">
        {rate}%
      </text>
    </svg>
  );
}

const CustomTooltipEquity = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as EquityPoint;
  const isPos = d.cumulative >= 0;
  return (
    <div className="bg-[#0a0a0a] border border-[rgba(212,175,55,0.25)] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">Trade #{d.index} · {d.date}</div>
      <div className="font-bold text-white">{d.pair} · {d.strategy}</div>
      <div className={`font-mono font-bold mt-1 ${d.pips > 0 ? 'text-green-400' : d.pips < 0 ? 'text-red-400' : 'text-gray-400'}`}>
        {d.pips > 0 ? '+' : ''}{d.pips} pips
      </div>
      <div className={`font-mono text-xs mt-0.5 ${isPos ? 'text-green-300' : 'text-red-300'}`}>
        Running: {isPos ? '+' : ''}{d.cumulative} pips
      </div>
    </div>
  );
};

const CustomTooltipBar = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a0a0a] border border-[rgba(212,175,55,0.25)] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: {p.value}{p.name === 'Win Rate' ? '%' : p.name === 'Avg R:R' ? ':1' : ''}
        </div>
      ))}
    </div>
  );
};

export default function TradeStatistics() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/journal/session-stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const isEmpty = !data || data.totalTrades === 0;

  const strategyChartData = data
    ? Object.entries(data.strategyBreakdown).map(([name, s]) => ({
        name: name.length > 12 ? name.slice(0, 12) + '…' : name,
        fullName: name,
        'Win Rate': s.winRate,
        'Avg R:R': s.avgRR,
        trades: s.count,
        pips: Math.round(s.pips),
      }))
    : [];

  const totalPips = data?.equityCurve.length
    ? data.equityCurve[data.equityCurve.length - 1].cumulative
    : 0;

  const peakPips = data?.equityCurve.length
    ? Math.max(...data.equityCurve.map(e => e.cumulative))
    : 0;

  const drawdown = data?.equityCurve.length
    ? Math.min(...data.equityCurve.map(e => e.cumulative))
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 max-w-[1400px] mx-auto w-full"
    >
      {/* Header */}
      <div className="bg-[hsl(var(--card))] p-5 rounded-lg border border-[rgba(212,175,55,0.2)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif text-2xl text-[var(--gold)] font-bold tracking-wider flex items-center gap-3">
              <BarChart2 className="w-7 h-7 opacity-80" />
              TRADE STATISTICS
            </h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Win rate by session · Strategy R:R · P&amp;L equity curve — all from your journal
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-gray-500">{data.totalTrades} closed trades</span>
                <span className={`font-bold ${totalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPips >= 0 ? '+' : ''}{totalPips} pips total
                </span>
              </div>
            )}
            <button
              onClick={fetchStats}
              disabled={loading}
              className="bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.3)] text-[var(--gold)] px-3 py-1.5 rounded text-sm hover:bg-[rgba(212,175,55,0.25)] transition-colors disabled:opacity-50"
            >
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <RefreshCcw className="w-8 h-8 animate-spin text-[var(--gold)]" />
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>
      )}

      {!loading && isEmpty && (
        <div className="flex flex-col items-center justify-center h-64 gap-4 bg-[hsl(var(--card))] rounded-lg border border-[rgba(212,175,55,0.15)]">
          <BarChart2 className="w-12 h-12 text-[var(--gold)] opacity-30" />
          <div className="text-center">
            <p className="text-white font-semibold">No closed trades yet</p>
            <p className="text-gray-500 text-sm mt-1">Log trades in your Journal and close them to see statistics here</p>
          </div>
        </div>
      )}

      {!loading && !isEmpty && data && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Closed', value: data.totalTrades, suffix: 'trades', color: GOLD, icon: Activity },
              { label: 'Net P&L', value: (totalPips >= 0 ? '+' : '') + totalPips, suffix: 'pips', color: totalPips >= 0 ? '#4ade80' : '#f87171', icon: DollarSign },
              { label: 'Peak Equity', value: '+' + peakPips, suffix: 'pips', color: '#4ade80', icon: TrendingUp },
              { label: 'Max Drawdown', value: drawdown, suffix: 'pips', color: drawdown < 0 ? '#f87171' : '#4ade80', icon: TrendingDown },
            ].map(({ label, value, suffix, color, icon: Icon }) => (
              <div key={label} className="bg-[hsl(var(--card))] border border-[rgba(212,175,55,0.15)] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                  <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
                </div>
                <div className="font-mono text-xl font-bold" style={{ color }}>{value}</div>
                <div className="text-xs text-gray-600 mt-0.5">{suffix}</div>
              </div>
            ))}
          </div>

          {/* Session Win Rates */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--gold)] mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> WIN RATE BY SESSION
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {SESSION_CONFIG.map(({ key, label, icon: Icon, time, color, gradient }) => {
                const s = data.sessionWinRates[key] || { wins: 0, losses: 0, be: 0, total: 0, winRate: 0, pips: 0 };
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-gradient-to-br ${gradient} border rounded-xl p-5`}
                    style={{ borderColor: color + '30' }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-4 h-4" style={{ color }} />
                          <span className="font-bold text-white text-sm">{label} Session</span>
                        </div>
                        <div className="text-xs font-mono text-gray-500">{time}</div>
                      </div>
                      <WinRateRing rate={s.winRate} color={color} />
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center bg-black/30 rounded-lg py-2">
                        <div className="text-green-400 font-mono text-lg font-bold">{s.wins}</div>
                        <div className="text-xs text-gray-500">Wins</div>
                      </div>
                      <div className="text-center bg-black/30 rounded-lg py-2">
                        <div className="text-red-400 font-mono text-lg font-bold">{s.losses}</div>
                        <div className="text-xs text-gray-500">Losses</div>
                      </div>
                      <div className="text-center bg-black/30 rounded-lg py-2">
                        <div className="text-gray-400 font-mono text-lg font-bold">{s.be}</div>
                        <div className="text-xs text-gray-500">B/E</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono border-t border-white/5 pt-3">
                      <span className="text-gray-500">{s.total} trades</span>
                      <span className={s.pips >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {s.pips >= 0 ? '+' : ''}{Math.round(s.pips)} pips
                      </span>
                    </div>

                    {s.total > 0 && (
                      <div className="mt-3">
                        <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{ width: `${s.winRate}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Strategy Breakdown */}
          {strategyChartData.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--gold)] mb-3 flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> STRATEGY BREAKDOWN — WIN RATE &amp; AVG R:R
              </h2>
              <div className="bg-[hsl(var(--card))] border border-[rgba(212,175,55,0.15)] rounded-xl p-5">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Chart */}
                  <div className="flex-1" style={{ minHeight: 200 }}>
                    <ResponsiveContainer width="100%" height={Math.max(200, strategyChartData.length * 48)}>
                      <BarChart data={strategyChartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} width={80} />
                        <Tooltip content={<CustomTooltipBar />} />
                        <Bar dataKey="Win Rate" radius={[0, 4, 4, 0]}>
                          {strategyChartData.map((entry, i) => (
                            <Cell key={i} fill={entry['Win Rate'] >= 60 ? '#4ade80' : entry['Win Rate'] >= 40 ? GOLD : '#f87171'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Table */}
                  <div className="lg:w-80 shrink-0">
                    <div className="space-y-2">
                      <div className="grid grid-cols-4 text-xs text-gray-600 uppercase tracking-wider pb-1 border-b border-white/5 font-mono">
                        <span>Strategy</span>
                        <span className="text-center">W%</span>
                        <span className="text-center">R:R</span>
                        <span className="text-right">Pips</span>
                      </div>
                      {Object.entries(data.strategyBreakdown).map(([strat, s]) => (
                        <div key={strat} className="grid grid-cols-4 items-center py-2 border-b border-white/5 text-xs">
                          <div>
                            <div className="font-medium text-white truncate max-w-[90px]" title={strat}>{strat}</div>
                            <div className="text-gray-600 font-mono">{s.count} trades</div>
                          </div>
                          <div className="text-center">
                            <span className={`font-mono font-bold ${s.winRate >= 60 ? 'text-green-400' : s.winRate >= 40 ? 'text-[var(--gold)]' : 'text-red-400'}`}>
                              {s.winRate}%
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="font-mono text-gray-300">
                              {s.avgRR > 0 ? `1:${s.avgRR}` : '—'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-bold ${s.pips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {s.pips >= 0 ? '+' : ''}{Math.round(s.pips)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* P&L Equity Curve */}
          {data.equityCurve.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--gold)] mb-3 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> P&amp;L EQUITY CURVE
                <span className="text-gray-600 normal-case tracking-normal font-normal ml-1">— cumulative pips over {data.equityCurve.length} trades</span>
              </h2>
              <div className="bg-[hsl(var(--card))] border border-[rgba(212,175,55,0.15)] rounded-xl p-5">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.equityCurve} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={totalPips >= 0 ? '#4ade80' : '#f87171'} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={totalPips >= 0 ? '#4ade80' : '#f87171'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="index"
                      tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickFormatter={(v) => `#${v}`}
                      label={{ value: 'Trade #', position: 'insideBottomRight', offset: -8, fill: '#6b7280', fontSize: 10 }}
                    />
                    <YAxis
                      tick={{ fill: '#6b7280', fontSize: 10 }}
                      tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
                      width={52}
                    />
                    <Tooltip content={<CustomTooltipEquity />} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="cumulative"
                      stroke={totalPips >= 0 ? '#4ade80' : '#f87171'}
                      strokeWidth={2.5}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const color = payload.pips > 0 ? '#4ade80' : payload.pips < 0 ? '#f87171' : '#6b7280';
                        return <circle key={payload.index} cx={cx} cy={cy} r={3.5} fill={color} stroke="#0a0a0a" strokeWidth={1.5} />;
                      }}
                      activeDot={{ r: 6, fill: GOLD, stroke: '#0a0a0a', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>

                {/* Trade dots legend */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Win</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Loss</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500 inline-block" /> Break Even</span>
                  <span className="ml-auto font-mono">
                    Peak: <span className="text-green-400">+{peakPips}</span> ·
                    Max DD: <span className="text-red-400">{drawdown}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Best/Worst trade stats */}
          {data.equityCurve.length > 0 && (() => {
            const sorted = [...data.equityCurve].sort((a, b) => b.pips - a.pips);
            const best = sorted[0];
            const worst = sorted[sorted.length - 1];
            const winCount = data.equityCurve.filter(e => e.pips > 0).length;
            const totalTrades = data.equityCurve.length;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Best Trade', value: `+${best.pips}`, sub: `${best.pair} · ${best.date}`, color: '#4ade80', icon: Award },
                  { label: 'Worst Trade', value: `${worst.pips}`, sub: `${worst.pair} · ${worst.date}`, color: '#f87171', icon: TrendingDown },
                  { label: 'Win Streak (current)', value: (() => {
                      let s = 0;
                      for (let i = data.equityCurve.length - 1; i >= 0; i--) {
                        if (data.equityCurve[i].pips > 0) s++; else break;
                      }
                      return s;
                    })(), sub: 'consecutive wins', color: '#4ade80', icon: TrendingUp },
                  { label: 'Overall Win Rate', value: `${Math.round((winCount / totalTrades) * 100)}%`, sub: `${winCount} of ${totalTrades} closed`, color: GOLD, icon: Target },
                ].map(({ label, value, sub, color, icon: Icon }) => (
                  <div key={label} className="bg-[hsl(var(--card))] border border-[rgba(212,175,55,0.1)] rounded-lg p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
                    </div>
                    <div className="font-mono text-xl font-bold" style={{ color }}>{value}</div>
                    <div className="text-xs text-gray-600 mt-0.5 truncate">{sub}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </motion.div>
  );
}
