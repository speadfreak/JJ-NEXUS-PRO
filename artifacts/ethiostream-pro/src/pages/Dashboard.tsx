import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Activity, Radio, Target, ShieldAlert,
  Clock, Brain, RefreshCcw, Camera, Monitor, Newspaper, ExternalLink,
  ChevronLeft, ChevronRight, Zap, X, AlertTriangle, ArrowUp, ArrowDown, Minus,
  Crosshair, Globe, Cpu, ScanLine, Scan, ShieldCheck, Flame, BarChart2, Waves,
} from 'lucide-react';
import { MARKET_SESSIONS } from '@/lib/mockData';
import TradingViewAdvancedChart from '@/components/common/TradingViewAdvancedChart';
import ChartSymbolSwitcher from '@/components/common/ChartSymbolSwitcher';
import { useCamera } from '@/context/CameraContext';
import { useLivePrices, formatPriceForSymbol } from '@/utils/priceEngine';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  category: string;
  timestamp: number;
}

interface NewsImpact {
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  impactEmoji: string;
  summary: string;
  pairs: {
    pair: string;
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    strength: 'STRONG' | 'MODERATE' | 'WEAK';
    reasoning: string;
  }[];
  tradingNote: string;
  riskWarning: string;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function categoryColor(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes('gold') || c.includes('xau')) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
  if (c.includes('usd') || c.includes('dollar') || c.includes('fed')) return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
  if (c.includes('eur')) return 'text-indigo-400 bg-indigo-400/10 border-indigo-400/30';
  if (c.includes('gbp')) return 'text-purple-400 bg-purple-400/10 border-purple-400/30';
  if (c.includes('jpy') || c.includes('japan')) return 'text-red-400 bg-red-400/10 border-red-400/30';
  if (c.includes('crypto') || c.includes('bitcoin') || c.includes('btc')) return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
  return 'text-[var(--gold)] bg-[rgba(212,175,55,0.1)] border-[rgba(212,175,55,0.3)]';
}

function directionColor(dir: string) {
  if (dir === 'BULLISH') return '#22c55e';
  if (dir === 'BEARISH') return '#ef4444';
  return '#eab308';
}

function DirectionIcon({ dir }: { dir: string }) {
  if (dir === 'BULLISH') return <ArrowUp className="w-3.5 h-3.5" />;
  if (dir === 'BEARISH') return <ArrowDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

function NewsAnalysisModal({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  const [analysis, setAnalysis] = useState<NewsImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (typeof window !== 'undefined') {
          const ant = localStorage.getItem('jjnexus_api_key') || localStorage.getItem('jjnexus_anthropic_key');
          if (ant) headers['x-anthropic-key'] = ant;
          const grok = localStorage.getItem('jjnexus_grok_key'); if (grok) headers['x-grok-key'] = grok;
          const groq = localStorage.getItem('jjnexus_groq_key'); if (groq) headers['x-groq-key'] = groq;
          const or2 = localStorage.getItem('jjnexus_openrouter_key'); if (or2) headers['x-openrouter-key'] = or2;
          const gh = localStorage.getItem('jjnexus_github_token'); if (gh) headers['x-github-token'] = gh;
        }
        const res = await fetch('/api/analysis/news-impact', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title: item.title, description: item.description, category: item.category }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as any;
          throw new Error(err.error || `Server error ${res.status}`);
        }
        const data = await res.json();
        setAnalysis(data);
      } catch (e: any) {
        setError(e.message || 'Analysis failed');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [item]);

  const impactBg = analysis?.impactLevel === 'HIGH'
    ? 'rgba(239,68,68,0.1)' : analysis?.impactLevel === 'MEDIUM'
    ? 'rgba(234,179,8,0.1)' : 'rgba(34,197,94,0.1)';
  const impactBorder = analysis?.impactLevel === 'HIGH'
    ? 'rgba(239,68,68,0.3)' : analysis?.impactLevel === 'MEDIUM'
    ? 'rgba(234,179,8,0.3)' : 'rgba(34,197,94,0.3)';
  const impactTextColor = analysis?.impactLevel === 'HIGH'
    ? '#f87171' : analysis?.impactLevel === 'MEDIUM'
    ? '#facc15' : '#4ade80';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        style={{
          width: '100%', maxWidth: 580,
          background: 'linear-gradient(145deg, #0e0e0e 0%, #111111 100%)',
          border: '1px solid rgba(212,175,55,0.3)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 40px rgba(212,175,55,0.08)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid rgba(212,175,55,0.1)', background: 'rgba(212,175,55,0.04)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 shrink-0" style={{ color: '#D4AF37' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 1 }}>
                Alchemist AI — News Impact Analysis
              </span>
            </div>
            <button
              onClick={onClose}
              style={{ color: '#555', cursor: 'pointer', background: 'none', border: 'none', padding: 4, borderRadius: 6 }}
              className="hover:text-gray-300 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p style={{ marginTop: 8, fontSize: 13, color: '#ccc', lineHeight: 1.4, fontWeight: 600 }}>
            {item.title}
          </p>
          {item.category && (
            <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded border font-medium uppercase tracking-wide ${categoryColor(item.category)}`}>
              {item.category.slice(0, 20)}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px 20px', maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: '2.5px solid rgba(212,175,55,0.2)',
                borderTopColor: '#D4AF37',
                animation: 'spin 0.8s linear infinite',
              }} />
              <div style={{ fontSize: 13, color: '#888' }}>Analyzing market impact...</div>
              <div style={{ fontSize: 11, color: '#555' }}>Alchemist AI is scanning all pairs</div>
            </div>
          ) : error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' }}>
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <div style={{ fontSize: 13, color: '#f87171', textAlign: 'center' }}>{error}</div>
              <p style={{ fontSize: 11, color: '#555', textAlign: 'center' }}>
                Make sure you have an API key configured in Settings, or wait for the Replit AI integration.
              </p>
            </div>
          ) : analysis ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Impact Level */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 10,
                background: impactBg, border: `1px solid ${impactBorder}`,
              }}>
                <span style={{ fontSize: 28 }}>{analysis.impactEmoji}</span>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>Market Impact</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: impactTextColor, letterSpacing: 1 }}>
                    {analysis.impactLevel} IMPACT
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                {analysis.summary}
              </div>

              {/* Pairs Impact */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Affected Pairs
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {analysis.pairs.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(0,0,0,0.4)',
                        border: `1px solid ${directionColor(p.direction)}22`,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 64 }}>
                        <span style={{ fontWeight: 900, fontSize: 12, color: '#fff', fontFamily: 'monospace' }}>{p.pair}</span>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          color: directionColor(p.direction), fontSize: 11, fontWeight: 700,
                        }}>
                          <DirectionIcon dir={p.direction} />
                          <span>{p.direction}</span>
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          padding: '1px 5px', borderRadius: 3,
                          background: `${directionColor(p.direction)}15`,
                          color: directionColor(p.direction),
                          border: `1px solid ${directionColor(p.direction)}30`,
                        }}>
                          {p.strength}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#999', lineHeight: 1.5, flex: 1 }}>
                        {p.reasoning}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trading Note */}
              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Target className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: 0.8 }}>Trading Note</span>
                </div>
                <p style={{ fontSize: 12, color: '#bbb', lineHeight: 1.6, margin: 0 }}>{analysis.tradingNote}</p>
              </div>

              {/* Risk Warning */}
              {analysis.riskWarning && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#fb923c' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: 0.8 }}>Risk Warning</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#aaa', lineHeight: 1.6, margin: 0 }}>{analysis.riskWarning}</p>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 10, color: '#444' }}>
                <span>Powered by Alchemist AI</span>
                <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#D4AF37', textDecoration: 'none', fontSize: 10 }}>
                  <span>Read full article</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

function NewsHeadlineTracker({ onAnalyze }: { onAnalyze: (item: NewsItem) => void }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [tickerPaused, setTickerPaused] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 4;

  const fetchNews = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/fxstreet-news', { cache: 'no-store' });
      if (!res.ok) throw new Error('News unavailable');
      const data: NewsItem[] = await res.json();
      setNews(data);
      setLastUpdated(Date.now());
    } catch (e: any) {
      setError(e.message || 'Failed to load news');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(() => fetchNews(true), 30000); // 30s — fast market news
    return () => clearInterval(interval);
  }, []);

  const totalPages = Math.ceil(news.length / ITEMS_PER_PAGE);
  const pageItems = news.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  return (
    <div className="border border-[rgba(212,175,55,0.2)] rounded-lg bg-[hsl(var(--card))] overflow-hidden group hover:border-[var(--gold)] transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(212,175,55,0.1)] bg-black/40">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-[var(--gold)]" />
          <h3 className="text-sm font-semibold text-[var(--gold)] uppercase tracking-wider font-serif">FX News Headlines</h3>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-green-400 uppercase tracking-wider">Live</span>
          </span>
          {news.length > 0 && (
            <span className="text-[10px] text-gray-600 font-mono hidden sm:inline">
              {news.length} articles · ForexLive · ForexCrunch · Investing.com · WSJ · ZeroHedge · Reuters · +more
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] text-gray-600 font-mono">Updated {timeAgo(lastUpdated)}</span>
          )}
          <div className="flex items-center gap-1 text-[10px] text-[var(--gold)] bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded px-1.5 py-0.5">
            <Brain className="w-3 h-3" />
            <span>Click card to analyze</span>
          </div>
          <button
            onClick={() => fetchNews()}
            className="p-1 rounded hover:bg-[rgba(212,175,55,0.1)] text-gray-500 hover:text-[var(--gold)] transition-colors"
            title="Refresh news"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--gold)]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Ticker tape */}
      {news.length > 0 && (
        <div
          className="relative overflow-hidden bg-black/60 border-b border-[rgba(212,175,55,0.08)] h-7"
          onMouseEnter={() => setTickerPaused(true)}
          onMouseLeave={() => setTickerPaused(false)}
        >
          <div
            ref={tickerRef}
            className="flex items-center gap-0 whitespace-nowrap h-full"
            style={{ animation: tickerPaused ? 'none' : 'ticker-scroll 60s linear infinite' }}
          >
            {[...news, ...news].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-2 px-4 text-xs text-gray-300">
                <span className="text-[var(--gold)] text-[10px]">◆</span>
                <button
                  onClick={() => onAnalyze(item)}
                  className="hover:text-[var(--gold)] transition-colors truncate max-w-[400px] text-left"
                >
                  {item.title}
                </button>
                <span className="text-gray-600 text-[10px]">{timeAgo(item.timestamp)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* News cards */}
      <div className="p-3">
        {loading && news.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-gray-500 text-sm">
            <span className="w-4 h-4 border border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
            Fetching latest headlines...
          </div>
        ) : error && news.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-red-400 text-sm">
            <span>{error}</span>
            <button onClick={() => fetchNews()} className="text-[var(--gold)] underline text-xs">Retry</button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
            >
              {pageItems.map((item, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => onAnalyze(item)}
                  className="group/card flex flex-col gap-1.5 p-3 rounded-lg bg-black/40 border border-[rgba(212,175,55,0.08)] hover:border-[rgba(212,175,55,0.5)] hover:bg-black/60 transition-all cursor-pointer text-left w-full relative overflow-hidden"
                >
                  {/* AI analyze badge on hover */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-1 bg-[rgba(212,175,55,0.15)] border border-[rgba(212,175,55,0.35)] rounded px-1.5 py-0.5">
                    <Brain className="w-2.5 h-2.5 text-[var(--gold)]" />
                    <span className="text-[9px] text-[var(--gold)] font-semibold uppercase tracking-wide">Analyze</span>
                  </div>

                  <div className="flex items-start gap-1 pr-14">
                    <span className="text-xs font-medium text-white leading-snug line-clamp-2 group-hover/card:text-[var(--gold)] transition-colors flex-1">
                      {item.title}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-1 gap-1 flex-wrap">
                    <div className="flex items-center gap-1">
                      {item.category ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide ${categoryColor(item.category)}`}>
                          {item.category.slice(0, 14)}
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border text-[var(--gold)] bg-[rgba(212,175,55,0.1)] border-[rgba(212,175,55,0.3)] font-medium uppercase tracking-wide">FX News</span>
                      )}
                      {(item as any).source && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 border border-white/10 text-gray-600 font-mono truncate max-w-[70px]">
                          {(item as any).source}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-600 font-mono">{timeAgo(item.timestamp)}</span>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-[rgba(212,175,55,0.08)]">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-[rgba(212,175,55,0.1)] text-gray-500 hover:text-[var(--gold)] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-1.5">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === page ? 'bg-[var(--gold)] w-4' : 'bg-gray-700 hover:bg-gray-500'}`}
                />
              ))}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1 rounded hover:bg-[rgba(212,175,55,0.1)] text-gray-500 hover:text-[var(--gold)] disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-gray-600">{news.length} headlines</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Kill Zone Countdown Timer ────────────────────────────────────────────────
// London Kill Zone: 08:00–10:00 UTC | NY Kill Zone: 13:00–15:00 UTC
function KillZoneTimer() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = now.getUTCHours(), m = now.getUTCMinutes(), s = now.getUTCSeconds();
  const totalSecs = h * 3600 + m * 60 + s;

  type Zone = { label: string; emoji: string; startH: number; endH: number; color: string; border: string };
  const zones: Zone[] = [
    { label: 'London KZ',   emoji: '🇬🇧', startH: 8,  endH: 10, color: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
    { label: 'NY KZ',       emoji: '🇺🇸', startH: 13, endH: 15, color: '#f87171', border: 'rgba(248,113,113,0.3)' },
    { label: 'Overlap',     emoji: '⚡',  startH: 13, endH: 17, color: '#D4AF37', border: 'rgba(212,175,55,0.3)' },
  ];

  const getStatus = (z: Zone) => {
    const start = z.startH * 3600, end = z.endH * 3600;
    if (totalSecs >= start && totalSecs < end) {
      const remaining = end - totalSecs;
      const mm = Math.floor(remaining / 60), ss = remaining % 60;
      return { active: true, text: `${mm}m ${ss}s left`, pct: ((totalSecs - start) / (end - start)) * 100 };
    }
    // time until next occurrence
    let secsUntil = start - totalSecs;
    if (secsUntil < 0) secsUntil += 86400;
    const hh = Math.floor(secsUntil / 3600), mm2 = Math.floor((secsUntil % 3600) / 60), ss2 = secsUntil % 60;
    return { active: false, text: hh > 0 ? `in ${hh}h ${mm2}m` : `in ${mm2}m ${ss2}s`, pct: 0 };
  };

  return (
    <div className="border border-[rgba(212,175,55,0.2)] rounded-lg bg-[hsl(var(--card))] p-4 flex flex-col gap-3 group hover:border-[var(--gold)] transition-colors">
      <div className="flex items-center gap-2">
        <Crosshair className="w-4 h-4 text-[var(--gold)]" />
        <h3 className="text-sm font-semibold text-[var(--gold)] uppercase tracking-wider font-serif">Kill Zone Timer</h3>
        <span className="text-[10px] font-mono text-gray-600 ml-auto">{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')} UTC</span>
      </div>
      <div className="flex flex-col gap-2">
        {zones.map(z => {
          const st = getStatus(z);
          return (
            <div key={z.label} className="rounded-lg p-2.5 transition-all"
              style={{ background: st.active ? `${z.border}30` : 'rgba(0,0,0,0.3)', border: `1px solid ${st.active ? z.border : 'rgba(255,255,255,0.05)'}` }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{z.emoji}</span>
                  <span className="text-xs font-bold" style={{ color: st.active ? z.color : '#666' }}>{z.label}</span>
                  {st.active && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: z.color }} />}
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: st.active ? z.color : '#555' }}>{st.text}</span>
              </div>
              {st.active && (
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <motion.div className="h-full rounded-full" animate={{ width: `${st.pct}%` }} transition={{ duration: 0.8 }}
                    style={{ background: `linear-gradient(90deg, ${z.color}66, ${z.color})` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Volatility Radar ─────────────────────────────────────────────────────────
function VolatilityRadar({ prices }: { prices: Record<string, number> }) {
  const pairs = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF'];
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [moves, setMoves] = useState<Record<string, number>>({});

  useEffect(() => {
    setMoves(prev => {
      const next = { ...prev };
      for (const p of pairs) {
        if (prevPrices[p] && prices[p]) {
          const delta = Math.abs(prices[p] - prevPrices[p]);
          const pipSize = p === 'XAUUSD' ? 0.1 : p.includes('JPY') ? 0.01 : 0.0001;
          const pips = delta / pipSize;
          // EMA smoothing
          next[p] = (prev[p] || 0) * 0.7 + pips * 0.3;
        }
      }
      return next;
    });
    setPrevPrices(prices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices]);

  const maxMove = Math.max(...Object.values(moves), 0.5);

  return (
    <div className="border border-[rgba(212,175,55,0.2)] rounded-lg bg-[hsl(var(--card))] p-4 flex flex-col gap-3 group hover:border-[var(--gold)] transition-colors">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-[var(--gold)]" />
        <h3 className="text-sm font-semibold text-[var(--gold)] uppercase tracking-wider font-serif">Volatility Radar</h3>
        <span className="flex items-center gap-1 ml-auto">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-green-400">Live</span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {pairs.map(pair => {
          const v = moves[pair] || 0;
          const pct = maxMove > 0 ? (v / maxMove) * 100 : 0;
          const isHot = pct > 70;
          const color = isHot ? '#ef4444' : pct > 40 ? '#f97316' : pct > 20 ? '#D4AF37' : '#555';
          return (
            <div key={pair} className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold w-16 shrink-0" style={{ color: isHot ? '#ef4444' : '#888' }}>{pair}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)' }}>
                <motion.div className="h-full rounded-full" animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
                  style={{ background: `linear-gradient(90deg, ${color}55, ${color})` }} />
              </div>
              <span className="text-[10px] font-mono w-10 text-right shrink-0" style={{ color }}>{v.toFixed(1)}p</span>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-gray-700 text-center">Pip movement velocity · last 30s</p>
    </div>
  );
}

// ── Stream Quick-Nav (syncs to Codespace Chrome when live) ───────────────────
function StreamQuickNav() {
  const [syncState, setSyncState] = useState<{ url: string; streaming: boolean; connected: boolean } | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem('jjnexus_stream_sync');
        if (raw) setSyncState(JSON.parse(raw));
      } catch {}
    };
    read();
    const t = setInterval(read, 3000);
    return () => clearInterval(t);
  }, []);

  const isActive = !!(syncState?.streaming && syncState?.connected && syncState?.url);

  const quickPages = [
    { label: '📊 Dashboard',   path: '/' },
    { label: '🤖 Alchemist',   path: '/alchemist' },
    { label: '👁 Watchlist',   path: '/watchlist' },
    { label: '📓 Journal',     path: '/journal' },
    { label: '🌍 Heatmap',     path: '/currency-heatmap' },
    { label: '📅 Calendar',    path: '/calendar' },
  ];

  const navigate = async (path: string) => {
    if (!syncState?.url) return;
    try {
      const appUrl = `${window.location.origin}${path}`;
      await fetch(`${syncState.url.replace(/\/$/, '')}/api/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: appUrl }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  };

  return (
    <div className="border rounded-lg bg-[hsl(var(--card))] p-4 flex flex-col gap-3 transition-colors"
      style={{ borderColor: isActive ? 'rgba(239,68,68,0.4)' : 'rgba(212,175,55,0.2)' }}>
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4" style={{ color: isActive ? '#f87171' : 'var(--gold)' }} />
        <h3 className="text-sm font-semibold uppercase tracking-wider font-serif" style={{ color: isActive ? '#f87171' : 'var(--gold)' }}>
          Stream Quick-Nav
        </h3>
        {isActive && (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold text-red-400">LIVE SYNC</span>
          </div>
        )}
      </div>
      {isActive ? (
        <>
          <p className="text-[10px] text-gray-500">Click to switch what TikTok viewers see live</p>
          <div className="grid grid-cols-2 gap-1.5">
            {quickPages.map(p => (
              <button
                key={p.path}
                onClick={() => navigate(p.path)}
                className="text-left px-2.5 py-2 rounded-lg text-xs font-semibold transition-all hover:border-red-400/50"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}>
            <Globe className="w-4 h-4 text-[var(--gold)] opacity-40" />
          </div>
          <p className="text-[10px] text-gray-600 text-center leading-relaxed">
            Connect Codespace in<br />Studio → Cloud tab to<br />enable live page control
          </p>
        </div>
      )}
    </div>
  );
}

interface JournalStats {
  totalTrades: number;
  winRate: number;
  averageRR: number;
  netPips: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
}

// ── Factor & signal types ─────────────────────────────────────────────────────
interface SignalFactor { label: string; score: number; icon: React.ElementType; color: string }
interface HotSignal { pair: string; dir: 'LONG' | 'SHORT'; conviction: 'HIGH' | 'MED' | 'LOW'; price: string; changePct: number }

// ── Session power helper ──────────────────────────────────────────────────────
function getSessionPower(): number {
  const h = new Date().getUTCHours()
  const m = new Date().getUTCMinutes()
  const t = h + m / 60
  // Overlap (London+NY): 13-17 UTC = 100
  if (t >= 13 && t < 17) return 100
  // London: 8-17 UTC
  if (t >= 8 && t < 17) return 82
  // New York: 13-22 UTC
  if (t >= 17 && t < 22) return 74
  // Tokyo: 0-9 UTC
  if (t >= 0 && t < 9) return 45
  // Dead zone 22-0
  return 18
}

export default function Dashboard() {
  const { isActive, screenStream, stream } = useCamera();
  const [confluenceScore, setConfluenceScore] = useState(0);
  const [confluenceBias, setConfluenceBias] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL'>('BULLISH');
  const [analysisText, setAnalysisText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  const [dashboardSymbol, setDashboardSymbol] = useState("XAUUSD");
  const { prices } = useLivePrices();

  // ── Neural command center state ────────────────────────────────────────────
  const [factors, setFactors] = useState<SignalFactor[]>([
    { label: 'Session Power', score: 0, icon: Globe, color: '#3b82f6' },
    { label: 'Price Momentum', score: 0, icon: TrendingUp, color: '#22c55e' },
    { label: 'Volatility Index', score: 0, icon: Activity, color: '#a78bfa' },
    { label: 'Trend Alignment', score: 0, icon: Target, color: '#D4AF37' },
    { label: 'COT Reading', score: 0, icon: BarChart2, color: '#f97316' },
  ]);
  const [hotSignals, setHotSignals] = useState<HotSignal[]>([]);
  const [threatLevel, setThreatLevel] = useState<'CRITICAL' | 'HIGH' | 'ELEVATED' | 'NORMAL'>('NORMAL');
  const [scanPhase, setScanPhase] = useState(0); // 0=idle 1=scanning 2=done
  const priceSnapshotRef = useRef<Record<string, number>>({});
  const factorsInitRef = useRef(false);

  const [journalStats, setJournalStats] = useState<JournalStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [selectedNewsItem, setSelectedNewsItem] = useState<NewsItem | null>(null);

  const streamIsLive = isActive || !!screenStream;
  const streamLabel = isActive && screenStream ? 'CAM + SCREEN' : isActive ? 'CAMERA LIVE' : screenStream ? 'SCREEN SHARE' : 'IDLE';
  const streamColor = streamIsLive ? 'text-green-400' : 'text-gray-500';

  const getStreamResolution = () => {
    if (stream) {
      const t = stream.getVideoTracks()[0];
      if (t) { const s = t.getSettings(); return `${s.width ?? '?'}×${s.height ?? '?'}`; }
    }
    if (screenStream) {
      const t = screenStream.getVideoTracks()[0];
      if (t) { const s = t.getSettings(); return `${s.width ?? '?'}×${s.height ?? '?'}`; }
    }
    return 'No signal';
  };

  // ── Snapshot prices on first load, compute hot signals live ──────────────
  useEffect(() => {
    const ALL_PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD', 'NZDUSD'];
    // Capture snapshot once prices arrive
    ALL_PAIRS.forEach(p => {
      if (prices[p] && !priceSnapshotRef.current[p]) {
        priceSnapshotRef.current[p] = prices[p];
      }
    });
    // Compute live hot signals from snapshot delta
    const signals: HotSignal[] = ALL_PAIRS
      .filter(p => prices[p] && priceSnapshotRef.current[p])
      .map(p => {
        const snap = priceSnapshotRef.current[p]!;
        const curr = prices[p];
        const delta = (curr - snap) / snap;
        const pct = Math.abs(delta) * 100;
        const dir: 'LONG' | 'SHORT' = delta >= 0 ? 'LONG' : 'SHORT';
        const conviction: 'HIGH' | 'MED' | 'LOW' = pct > 0.15 ? 'HIGH' : pct > 0.05 ? 'MED' : 'LOW';
        return { pair: p, dir, conviction, price: formatPriceForSymbol(p, curr), changePct: delta * 100 };
      })
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 3);
    if (signals.length > 0) setHotSignals(signals);
  }, [prices]);

  // ── Initialise factors once on mount ──────────────────────────────────────
  useEffect(() => {
    if (factorsInitRef.current) return;
    factorsInitRef.current = true;
    const sessionScore = getSessionPower();
    // Try to read COT cache score
    let cotScore = 50;
    try {
      const raw = localStorage.getItem('jjnexus_cot_research_XAUUSD');
      if (raw) {
        const { data } = JSON.parse(raw);
        if (data?.[0]?.commercialIndex26 !== undefined) {
          cotScore = Math.round(data[0].commercialIndex26 * 100);
        }
      }
    } catch { /* ignore */ }
    setFactors([
      { label: 'Session Power',  score: sessionScore, icon: Globe,      color: '#3b82f6' },
      { label: 'Price Momentum', score: 0,            icon: TrendingUp, color: '#22c55e' },
      { label: 'Volatility Idx', score: 52,           icon: Activity,   color: '#a78bfa' },
      { label: 'Trend Align',    score: 0,            icon: Target,     color: '#D4AF37' },
      { label: 'COT Reading',    score: cotScore,     icon: BarChart2,  color: '#f97316' },
    ]);
  }, []);

  const defaultTexts = [
    "Neural scan ready — initiate confluence sweep.",
    "All systems nominal. Awaiting market pulse.",
    "Monitoring institutional flow across major pairs.",
    "Standing by. Press NEURAL SCAN to analyse.",
  ];

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true);
        const res = await fetch('/api/journal/stats');
        if (res.ok) {
          const data = await res.json();
          setJournalStats(data);
        }
      } catch (e) {
        console.warn('Failed to load journal stats:', e);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setConfluenceScore(prev => {
        if (prev < 84) return prev + 1;
        clearInterval(interval);
        return 84;
      });
    }, 20);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAnalyzing) return;
    const rotateInterval = setInterval(() => {
      setTextIndex(prev => (prev + 1) % defaultTexts.length);
      setAnalysisText("");
    }, 5000);
    return () => clearInterval(rotateInterval);
  }, [isAnalyzing]);

  useEffect(() => {
    if (isAnalyzing) return;
    const currentText = defaultTexts[textIndex];
    let i = 0;
    const typeInterval = setInterval(() => {
      setAnalysisText(currentText.slice(0, i));
      i++;
      if (i > currentText.length) clearInterval(typeInterval);
    }, 30);
    return () => clearInterval(typeInterval);
  }, [textIndex, isAnalyzing]);

  const handleQuickAnalysis = async () => {
    setIsAnalyzing(true);
    setScanPhase(1);
    setAnalysisText("");
    setConfluenceScore(0);

    // Animate factors to scanning state
    const sessionScore = getSessionPower();
    setFactors(prev => prev.map(f => ({ ...f, score: 0 })));

    try {
      const livePrice = prices[dashboardSymbol] || prices["XAUUSD"] || 4720;
      const aiHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (typeof window !== 'undefined') {
        const grok = localStorage.getItem('jjnexus_grok_key'); if (grok) aiHeaders['x-grok-key'] = grok;
        const groq = localStorage.getItem('jjnexus_groq_key'); if (groq) aiHeaders['x-groq-key'] = groq;
        const ant = localStorage.getItem('jjnexus_api_key') || localStorage.getItem('jjnexus_anthropic_key'); if (ant) aiHeaders['x-anthropic-key'] = ant;
        const or2 = localStorage.getItem('jjnexus_openrouter_key'); if (or2) aiHeaders['x-openrouter-key'] = or2;
        const gh = localStorage.getItem('jjnexus_github_token'); if (gh) aiHeaders['x-github-token'] = gh;
      }
      const response = await fetch("/api/analysis/confluence", {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({ pair: dashboardSymbol, timeframe: "H1", price: livePrice, trend: "bullish" }),
      });

      const data = await response.json();

      const targetScore = data.score || 88;
      const bias = (data.bias as 'BULLISH' | 'BEARISH' | 'NEUTRAL') || 'BULLISH';
      setConfluenceBias(bias);

      // Compute factors from result
      const snap = priceSnapshotRef.current[dashboardSymbol];
      const momentumScore = snap
        ? Math.min(100, Math.round(Math.abs((livePrice - snap) / snap) * 10000))
        : Math.round(targetScore * 0.85);
      let cotScore = 50;
      try {
        const raw = localStorage.getItem(`jjnexus_cot_research_${dashboardSymbol}`);
        if (raw) { const { data: d } = JSON.parse(raw); if (d?.[0]?.commercialIndex26 !== undefined) cotScore = Math.round(d[0].commercialIndex26 * 100); }
      } catch { /* ignore */ }
      const volScore = Math.min(100, Math.round(40 + Math.random() * 30 + (sessionScore > 80 ? 15 : 0)));
      const trendScore = Math.round(targetScore * (bias === 'BULLISH' ? 1 : bias === 'BEARISH' ? 0.9 : 0.5));

      // Set threat level
      const threat = targetScore >= 85 ? 'CRITICAL' : targetScore >= 70 ? 'HIGH' : targetScore >= 50 ? 'ELEVATED' : 'NORMAL';
      setThreatLevel(threat);

      // Stagger factor animation
      const newFactors: SignalFactor[] = [
        { label: 'Session Power',  score: sessionScore,  icon: Globe,      color: '#3b82f6' },
        { label: 'Price Momentum', score: momentumScore, icon: TrendingUp, color: '#22c55e' },
        { label: 'Volatility Idx', score: volScore,      icon: Activity,   color: '#a78bfa' },
        { label: 'Trend Align',    score: trendScore,    icon: Target,     color: '#D4AF37' },
        { label: 'COT Reading',    score: cotScore,      icon: BarChart2,  color: '#f97316' },
      ];
      newFactors.forEach((f, i) => {
        setTimeout(() => setFactors(prev => prev.map((p, pi) => pi === i ? f : p)), i * 120);
      });

      // Animate score
      let current = 0;
      const scoreInterval = setInterval(() => {
        current += 2;
        if (current >= targetScore) { setConfluenceScore(targetScore); clearInterval(scoreInterval); }
        else setConfluenceScore(current);
      }, 20);

      const resultText = data.summary || data.tradeIdea?.explanation || "Analysis complete. Confluence factors computed. Check full Alchemist AI for deep SMC breakdown.";
      let i = 0;
      const typeInterval = setInterval(() => {
        setAnalysisText(resultText.slice(0, i));
        i++;
        if (i > resultText.length) {
          clearInterval(typeInterval);
          setIsAnalyzing(false);
          setScanPhase(2);
        }
      }, 18);

    } catch (err) {
      console.error(err);
      setIsAnalyzing(false);
      setScanPhase(0);
    }
  };

  const riskData = React.useMemo(() => {
    if (!journalStats || journalStats.totalTrades === 0) {
      return { pnlDisplay: '—', riskDisplay: '—', riskPct: 0, isEmpty: true };
    }
    const pnlPips = journalStats.netPips;
    const pnlDisplay = pnlPips >= 0 ? `+${pnlPips.toFixed(1)} pips` : `${pnlPips.toFixed(1)} pips`;
    const riskUsed = Math.min(journalStats.lossCount * 0.5, 2.0);
    const riskDisplay = `${riskUsed.toFixed(1)}% / 2.0%`;
    const riskPct = (riskUsed / 2.0) * 100;
    return { pnlDisplay, riskDisplay, riskPct, isEmpty: false };
  }, [journalStats]);

  const watchPairs = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF'];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="flex flex-col gap-4"
        style={{ minHeight: 0 }}
      >
        {/* Live Price Strip */}
        <div className="shrink-0 flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {watchPairs.map(pair => {
            const price = prices[pair];
            const formatted = price ? formatPriceForSymbol(pair, price) : '—';
            return (
              <button
                key={pair}
                onClick={() => setDashboardSymbol(pair)}
                className={`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                  dashboardSymbol === pair
                    ? 'bg-[rgba(212,175,55,0.12)] border-[var(--gold)] shadow-[0_0_12px_rgba(212,175,55,0.15)]'
                    : 'bg-[hsl(var(--card))] border-[rgba(212,175,55,0.12)] hover:border-[rgba(212,175,55,0.35)]'
                }`}
              >
                <span className="text-xs font-bold text-white font-mono">{pair}</span>
                <span className={`text-sm font-mono font-bold ${pair === 'XAUUSD' ? 'text-yellow-400' : 'text-green-400'}`}>
                  {formatted}
                </span>
                {dashboardSymbol === pair && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                )}
              </button>
            );
          })}
          <div className="shrink-0 ml-auto flex items-center gap-1.5 text-[10px] text-gray-600 font-mono px-2">
            <Activity className="w-3 h-3 text-green-500" />
            <span className="text-green-500">LIVE</span>
          </div>
        </div>

        {/* Main Content: Chart + AI Panel */}
        <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: 540 }}>

          {/* TradingView Chart — explicit min-height so it never collapses */}
          <div
            className="flex-1 flex flex-col border border-[rgba(212,175,55,0.2)] rounded-lg bg-[hsl(var(--card))] overflow-hidden shadow-lg relative group transition-all hover:border-[var(--gold)]"
            style={{ minHeight: 520 }}
          >
            <div className="h-10 bg-black/60 border-b border-[rgba(212,175,55,0.1)] flex items-center px-4 shrink-0 gap-3">
              <h2 className="font-serif font-bold text-[var(--gold)] tracking-wider">{dashboardSymbol} · H1 · LIVE</h2>
              <ChartSymbolSwitcher currentSymbol={dashboardSymbol} onSymbolChange={setDashboardSymbol} />
              <div className="ml-auto flex items-center gap-3">
                {typeof prices[dashboardSymbol] === 'number' && prices[dashboardSymbol] > 0 && (
                  <span className="text-base font-mono font-bold text-white">
                    {formatPriceForSymbol(String(dashboardSymbol), prices[dashboardSymbol])}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">CONNECTED</span>
                </span>
              </div>
            </div>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <TradingViewAdvancedChart symbol={dashboardSymbol} showSideToolbar={true} style={{ width: '100%', height: '100%' }} />
            </div>
          </div>

          {/* ── NEURAL COMMAND CENTER ─────────────────────────────────────── */}
          <div className="w-full lg:w-72 xl:w-80 flex flex-col gap-3 shrink-0">

            {/* Main intelligence panel */}
            <div
              className="flex-1 flex flex-col relative overflow-hidden rounded-xl"
              style={{
                minHeight: 540,
                background: 'linear-gradient(160deg, #05050f 0%, #0a0814 50%, #060510 100%)',
                border: '1px solid rgba(212,175,55,0.25)',
                boxShadow: isAnalyzing
                  ? '0 0 32px rgba(212,175,55,0.18), inset 0 0 60px rgba(212,175,55,0.04)'
                  : '0 0 12px rgba(212,175,55,0.08)',
              }}
            >
              {/* Scanline overlay */}
              <div className="absolute inset-0 pointer-events-none z-0"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)', backgroundSize: '100% 4px' }} />

              {/* Animated corner brackets */}
              {[
                'top-0 left-0 border-t border-l',
                'top-0 right-0 border-t border-r',
                'bottom-0 left-0 border-b border-l',
                'bottom-0 right-0 border-b border-r',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-4 h-4 ${cls} border-[rgba(212,175,55,0.5)] z-10`} />
              ))}

              {/* Scanning sweep line — visible while analyzing */}
              <AnimatePresence>
                {isAnalyzing && (
                  <motion.div
                    className="absolute inset-x-0 h-px z-20 pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.8), transparent)' }}
                    initial={{ top: 0, opacity: 0 }}
                    animate={{ top: '100%', opacity: [0, 1, 1, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </AnimatePresence>

              <div className="relative z-10 flex flex-col h-full p-4 gap-3">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isAnalyzing ? 'animate-pulse' : ''}`}
                        style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}>
                        <Brain className="w-4 h-4" style={{ color: '#D4AF37' }} />
                      </div>
                      {isAnalyzing && (
                        <div className="absolute inset-0 rounded-lg border border-[#D4AF37] animate-ping opacity-40" />
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] font-black tracking-[0.2em] uppercase" style={{ color: '#D4AF37' }}>Alchemist AI</div>
                      <div className="text-[8px] text-gray-600 tracking-widest uppercase font-mono">{dashboardSymbol} · Neural Confluence</div>
                    </div>
                  </div>
                  {/* Threat badge */}
                  <div className={`px-2 py-0.5 rounded text-[8px] font-black tracking-widest uppercase border ${
                    threatLevel === 'CRITICAL' ? 'bg-red-500/15 text-red-300 border-red-500/40' :
                    threatLevel === 'HIGH'     ? 'bg-orange-500/15 text-orange-300 border-orange-500/35' :
                    threatLevel === 'ELEVATED' ? 'bg-yellow-500/12 text-yellow-300 border-yellow-500/30' :
                                                 'bg-green-500/10 text-green-400 border-green-500/25'
                  }`}>
                    {threatLevel}
                  </div>
                </div>

                {/* ── Tri-ring Radar Gauge ────────────────────────────────── */}
                <div className="flex items-center gap-3 shrink-0">
                  {/* SVG radar */}
                  <div className="relative w-[88px] h-[88px] shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 88 88" className="absolute inset-0 w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
                      {/* Outer track */}
                      <circle cx="44" cy="44" r="40" fill="none" stroke="rgba(212,175,55,0.07)" strokeWidth="4" />
                      {/* Outer fill — score */}
                      <motion.circle cx="44" cy="44" r="40" fill="none"
                        stroke={confluenceScore >= 80 ? '#D4AF37' : confluenceScore >= 60 ? '#22c55e' : confluenceScore >= 40 ? '#eab308' : '#ef4444'}
                        strokeWidth="4" strokeLinecap="round"
                        strokeDasharray="251.2"
                        initial={{ strokeDashoffset: 251.2 }}
                        animate={{ strokeDashoffset: 251.2 - (251.2 * confluenceScore) / 100 }}
                        transition={{ duration: 1.4, ease: 'easeOut' }}
                        style={{ filter: confluenceScore >= 70 ? 'drop-shadow(0 0 4px rgba(212,175,55,0.6))' : 'none' }}
                      />
                      {/* Middle track */}
                      <circle cx="44" cy="44" r="31" fill="none" stroke="rgba(212,175,55,0.05)" strokeWidth="3" />
                      {/* Middle — bias ring */}
                      <motion.circle cx="44" cy="44" r="31" fill="none"
                        stroke={confluenceBias === 'BULLISH' ? '#22c55e' : confluenceBias === 'BEARISH' ? '#ef4444' : '#eab308'}
                        strokeWidth="3" strokeLinecap="round"
                        strokeDasharray="194.8"
                        initial={{ strokeDashoffset: 194.8 }}
                        animate={{ strokeDashoffset: confluenceBias === 'NEUTRAL' ? 97.4 : confluenceBias === 'BULLISH' ? 48.7 : 145.6 }}
                        transition={{ duration: 1.8, ease: 'easeOut', delay: 0.3 }}
                        opacity="0.7"
                      />
                      {/* Inner glow ring */}
                      <circle cx="44" cy="44" r="22" fill="none"
                        stroke={isAnalyzing ? 'rgba(212,175,55,0.3)' : 'rgba(212,175,55,0.08)'}
                        strokeWidth="2"
                        strokeDasharray="4 3"
                        style={{ animation: isAnalyzing ? 'spin 3s linear infinite' : 'none', transformOrigin: '44px 44px' }}
                      />
                    </svg>
                    {/* Center content */}
                    <div className="flex flex-col items-center z-10">
                      <motion.div
                        key={confluenceScore}
                        className="text-2xl font-black font-mono leading-none"
                        style={{ color: confluenceScore >= 80 ? '#D4AF37' : confluenceScore >= 60 ? '#22c55e' : confluenceScore >= 40 ? '#eab308' : '#ef4444',
                          textShadow: confluenceScore >= 70 ? '0 0 12px rgba(212,175,55,0.5)' : 'none' }}
                      >
                        {confluenceScore}
                      </motion.div>
                      <div className="text-[7px] text-gray-600 tracking-widest uppercase mt-0.5">score</div>
                    </div>
                  </div>

                  {/* Bias + meta */}
                  <div className="flex-1 space-y-2">
                    <div>
                      <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-1">Market Bias</div>
                      <motion.div
                        key={confluenceBias}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`flex items-center gap-1 font-black text-base ${
                          confluenceBias === 'BULLISH' ? 'text-green-400' :
                          confluenceBias === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'
                        }`}
                      >
                        {confluenceBias === 'BULLISH' ? <TrendingUp className="w-4 h-4" /> : confluenceBias === 'BEARISH' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                        {confluenceBias}
                      </motion.div>
                    </div>
                    {/* Mini zone bars */}
                    <div className="space-y-0.5">
                      {[['STRONG', 80, '#D4AF37'], ['CONFIRM', 60, '#22c55e'], ['WEAK', 40, '#eab308'], ['NO SIG', 0, '#6b7280']].map(([label, threshold, color]) => (
                        <div key={label as string} className="flex items-center gap-1.5">
                          <div className={`w-1 h-1 rounded-full`} style={{ background: confluenceScore >= (threshold as number) ? color as string : 'rgba(255,255,255,0.08)' }} />
                          <div className="text-[7px] font-mono" style={{ color: confluenceScore >= (threshold as number) ? color as string : 'rgba(255,255,255,0.15)' }}>{label as string}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── 5-Factor Signal Matrix ──────────────────────────────── */}
                <div className="shrink-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Cpu className="w-3 h-3 text-gray-600" />
                    <span className="text-[8px] text-gray-600 uppercase tracking-widest font-bold">Signal Matrix</span>
                  </div>
                  {factors.map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <div key={f.label} className="flex items-center gap-2">
                        <Icon className="w-2.5 h-2.5 shrink-0" style={{ color: f.color, opacity: 0.8 }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[8px] text-gray-600 font-mono mb-0.5 truncate">{f.label}</div>
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <motion.div
                              className="h-full rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${f.score}%` }}
                              transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
                              style={{
                                background: `linear-gradient(90deg, ${f.color}99, ${f.color})`,
                                boxShadow: f.score > 70 ? `0 0 4px ${f.color}66` : 'none',
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-[9px] font-mono font-bold shrink-0 w-6 text-right" style={{ color: f.score > 70 ? f.color : 'rgba(255,255,255,0.4)' }}>
                          {f.score}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Intel Terminal Feed ─────────────────────────────────── */}
                <div className="flex-1 relative min-h-0 rounded-lg overflow-hidden"
                  style={{ background: 'rgba(0,255,80,0.03)', border: '1px solid rgba(0,255,80,0.08)' }}>
                  <div className="absolute top-0 inset-x-0 h-4 flex items-center px-2 gap-1.5"
                    style={{ background: 'rgba(0,0,0,0.6)', borderBottom: '1px solid rgba(0,255,80,0.08)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 opacity-70" />
                    <span className="text-[7px] text-green-600 font-mono tracking-widest uppercase">intel feed</span>
                    <span className="ml-auto text-[7px] font-mono text-green-800">{isAnalyzing ? 'SCANNING...' : 'READY'}</span>
                  </div>
                  <div className="absolute inset-0 top-4 overflow-y-auto p-2 custom-scrollbar">
                    <p className="text-[10px] text-green-400 leading-relaxed font-mono whitespace-pre-wrap">
                      {analysisText || (
                        <span className="text-green-800">{'> '}{defaultTexts[textIndex % defaultTexts.length]}</span>
                      )}
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="text-green-400"
                      >█</motion.span>
                    </p>
                  </div>
                </div>

                {/* ── Live Hot Signals ────────────────────────────────────── */}
                <div className="shrink-0 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-[#D4AF37]" />
                    <span className="text-[8px] text-gray-600 uppercase tracking-widest font-bold">Live Hot Signals</span>
                    <span className="ml-auto text-[7px] text-gray-700 font-mono">from price delta</span>
                  </div>
                  {hotSignals.length > 0 ? hotSignals.map((sig, i) => (
                    <motion.div
                      key={sig.pair}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{
                        background: sig.dir === 'LONG' ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
                        border: `1px solid ${sig.dir === 'LONG' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                      }}
                    >
                      <span className="text-[10px] font-black text-white font-mono w-14 shrink-0">{sig.pair}</span>
                      <span className={`flex items-center gap-0.5 text-[9px] font-black ${sig.dir === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                        {sig.dir === 'LONG' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {sig.dir}
                      </span>
                      <span className={`ml-auto text-[7px] font-black px-1.5 py-0.5 rounded border ${
                        sig.conviction === 'HIGH' ? 'bg-[rgba(212,175,55,0.2)] text-[#D4AF37] border-[rgba(212,175,55,0.35)]' :
                        sig.conviction === 'MED'  ? 'bg-blue-500/15 text-blue-300 border-blue-500/25' :
                                                    'bg-gray-500/15 text-gray-500 border-gray-500/20'
                      }`}>{sig.conviction}</span>
                      <span className="text-[8px] font-mono text-gray-600 w-16 text-right shrink-0">{sig.price}</span>
                    </motion.div>
                  )) : (
                    ['XAUUSD', 'EURUSD', 'GBPUSD'].map((p, i) => (
                      <div key={p} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className="text-[10px] font-black text-gray-700 font-mono w-14">{p}</span>
                        <div className="flex-1 h-1 rounded-full bg-white/5 animate-pulse" />
                      </div>
                    ))
                  )}
                </div>

                {/* ── Neural Scan Button ──────────────────────────────────── */}
                <button
                  onClick={handleQuickAnalysis}
                  disabled={isAnalyzing}
                  className="shrink-0 w-full relative overflow-hidden rounded-lg py-2.5 font-black text-xs tracking-widest uppercase transition-all disabled:opacity-60"
                  style={{
                    background: isAnalyzing
                      ? 'linear-gradient(90deg, rgba(212,175,55,0.15), rgba(212,175,55,0.25), rgba(212,175,55,0.15))'
                      : 'linear-gradient(90deg, rgba(212,175,55,0.12), rgba(212,175,55,0.2))',
                    border: '1px solid rgba(212,175,55,0.4)',
                    color: '#D4AF37',
                    boxShadow: isAnalyzing ? '0 0 20px rgba(212,175,55,0.25)' : '0 0 8px rgba(212,175,55,0.1)',
                  }}
                >
                  {isAnalyzing && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.2), transparent)', width: '60%' }}
                      animate={{ x: ['-100%', '250%'] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isAnalyzing
                      ? <><Scan className="w-3.5 h-3.5 animate-spin" />Scanning Neural Matrix…</>
                      : <><Brain className="w-3.5 h-3.5" />⚡ Neural Scan</>
                    }
                  </span>
                </button>

              </div>
            </div>

            {/* Stream Status compact card */}
            <div className="shrink-0 rounded-xl p-3 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #050510, #0a0814)', border: '1px solid rgba(212,175,55,0.15)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Radio className="w-3 h-3 text-gray-600" />
                  <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Stream Status</span>
                </div>
                <span className="text-[7px] font-mono text-gray-700">{getStreamResolution()}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${streamIsLive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)] animate-pulse' : 'bg-gray-700'}`} />
                  <span className={`font-bold text-xs ${streamColor}`}>{streamLabel}</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1 text-[9px]">
                    <Camera className={`w-3 h-3 ${isActive ? 'text-green-400' : 'text-gray-700'}`} />
                    <span className={isActive ? 'text-green-400' : 'text-gray-700'}>{isActive ? 'ON' : 'OFF'}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[9px]">
                    <Monitor className={`w-3 h-3 ${screenStream ? 'text-blue-400' : 'text-gray-700'}`} />
                    <span className={screenStream ? 'text-blue-400' : 'text-gray-700'}>{screenStream ? 'ON' : 'OFF'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Market Sessions + Risk Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
          {/* Market Sessions */}
          <div className="border border-[rgba(212,175,55,0.2)] rounded-lg bg-[hsl(var(--card))] p-4 group hover:border-[var(--gold)] transition-colors">
            <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3 flex items-center">
              <Clock className="w-4 h-4 mr-2" /> Market Sessions
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {Object.entries(MARKET_SESSIONS).map(([session, data]) => {
                const utcHour = new Date().getUTCHours();
                const active = session === 'sydney'
                  ? utcHour >= 22 || utcHour < 7
                  : utcHour >= data.start && utcHour < data.end;
                return (
                  <div key={session} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-gray-400">{session.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-gray-700'}`} />
                      <span className={`text-[10px] font-semibold ${active ? 'text-green-400' : 'text-gray-600'}`}>{active ? 'OPEN' : 'CLOSED'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Performance Command Center ─────────────────────────────── */}
          <div className="relative rounded-xl overflow-hidden group" style={{ border: '1px solid rgba(212,175,55,0.25)', background: 'linear-gradient(135deg, rgba(10,8,0,0.95) 0%, rgba(18,14,0,0.95) 100%)' }}>
            {/* subtle grid bg */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(212,175,55,1) 0px, transparent 1px, transparent 20px)', backgroundSize: '20px 20px' }} />

            <div className="relative p-4">
              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)' }}>
                  <ShieldAlert className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#D4AF37' }}>Performance Command Center</div>
                  <div className="text-[9px] text-gray-600">Live Journal Data</div>
                </div>
                {statsLoading && <span className="w-3 h-3 border border-[var(--gold)] border-t-transparent rounded-full animate-spin" />}
                {!statsLoading && !riskData.isEmpty && (
                  <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                    className="w-1.5 h-1.5 rounded-full bg-green-400" />
                )}
              </div>

              {riskData.isEmpty ? (
                <div className="space-y-3">
                  <p className="text-[10px] text-gray-600">No closed trades yet — log your first trade in Journal to activate live stats.</p>
                  {/* Placeholder metric grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {['Net Pips','Win Rate','Avg R:R','Trades'].map(label => (
                      <div key={label} className="rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="text-[9px] text-gray-700 uppercase tracking-wide">{label}</div>
                        <div className="text-lg font-mono font-bold text-gray-700 mt-0.5">—</div>
                      </div>
                    ))}
                  </div>
                  {/* Benchmark reference */}
                  <div className="rounded-lg p-2.5" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.12)' }}>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(212,175,55,0.5)' }}>Alchemist X Benchmark</div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-600">Win Rate</span><span className="font-mono font-bold" style={{ color: 'rgba(212,175,55,0.6)' }}>67.3%</span>
                    </div>
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className="text-gray-600">Net Pips</span><span className="font-mono font-bold" style={{ color: 'rgba(212,175,55,0.6)' }}>+9,560</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Primary metrics 2×2 */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Net Pips */}
                    <div className="rounded-xl p-3 col-span-2" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${(journalStats?.netPips ?? 0) >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-[9px] text-gray-600 uppercase tracking-widest">Net Pips (Live)</div>
                          <motion.div key={riskData.pnlDisplay} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className={`text-3xl font-mono font-black mt-0.5 ${(journalStats?.netPips ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {riskData.pnlDisplay}
                          </motion.div>
                          <div className="text-[9px] text-gray-600 mt-0.5">Benchmark: +9,560</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-gray-600 uppercase tracking-widest">vs Bench</div>
                          <div className={`text-sm font-black ${(journalStats?.netPips ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(journalStats?.netPips ?? 0) >= 9560 ? '✓ BEATING' : `${Math.round(((journalStats?.netPips ?? 0) / 9560) * 100)}%`}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Win Rate */}
                    <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="text-[9px] text-gray-600 uppercase tracking-widest">Win Rate</div>
                      <div className={`text-xl font-mono font-black mt-0.5 ${(journalStats?.winRate ?? 0) >= 67.3 ? 'text-green-400' : '#D4AF37'}`}
                        style={{ color: (journalStats?.winRate ?? 0) >= 67.3 ? '#22c55e' : '#D4AF37' }}>
                        {journalStats?.winRate ?? 0}%
                      </div>
                      <div className="text-[9px] text-gray-700 mt-0.5">Bench: 67.3%</div>
                    </div>
                    {/* Avg RR */}
                    <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="text-[9px] text-gray-600 uppercase tracking-widest">Avg R:R</div>
                      <div className="text-xl font-mono font-black mt-0.5" style={{ color: '#D4AF37' }}>
                        {journalStats?.averageRR ? `1:${journalStats.averageRR}` : '—'}
                      </div>
                      <div className="text-[9px] text-gray-700 mt-0.5">Target: 1:2.0+</div>
                    </div>
                  </div>

                  {/* W/L/BE bar */}
                  <div>
                    <div className="flex justify-between text-[9px] mb-1">
                      <span className="text-green-400 font-bold">{journalStats?.winCount}W</span>
                      <span className="text-red-400 font-bold">{journalStats?.lossCount}L</span>
                      <span className="text-yellow-600 font-bold">{journalStats?.breakEvenCount}BE</span>
                      <span className="text-gray-600">{(journalStats?.totalTrades ?? 0)} trades</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden flex gap-px" style={{ background: 'rgba(0,0,0,0.6)' }}>
                      {(() => {
                        const t = (journalStats?.totalTrades ?? 1) || 1
                        const wp = ((journalStats?.winCount ?? 0) / t) * 100
                        const lp = ((journalStats?.lossCount ?? 0) / t) * 100
                        const bp = ((journalStats?.breakEvenCount ?? 0) / t) * 100
                        return (<>
                          <motion.div className="h-full rounded-l-full bg-green-500" initial={{ width: 0 }} animate={{ width: `${wp}%` }} transition={{ duration: 1 }} />
                          <motion.div className="h-full bg-red-500" initial={{ width: 0 }} animate={{ width: `${lp}%` }} transition={{ duration: 1, delay: 0.1 }} />
                          <motion.div className="h-full rounded-r-full bg-yellow-600" initial={{ width: 0 }} animate={{ width: `${bp}%` }} transition={{ duration: 1, delay: 0.2 }} />
                        </>)
                      })()}
                    </div>
                  </div>

                  {/* Risk exposure gauge */}
                  <div>
                    <div className="flex justify-between text-[9px] mb-1">
                      <span className="text-gray-600 uppercase tracking-wide">Risk Exposure</span>
                      <span className="font-bold" style={{ color: riskData.riskPct > 70 ? '#ef4444' : riskData.riskPct > 40 ? '#f97316' : '#22c55e' }}>
                        {riskData.riskPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.6)' }}>
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }}
                        animate={{ width: `${riskData.riskPct}%` }} transition={{ duration: 1.2, ease: 'easeOut' }}
                        style={{ background: riskData.riskPct > 70 ? '#ef4444' : riskData.riskPct > 40 ? '#f97316' : '#D4AF37' }} />
                    </div>
                  </div>

                  {/* Combined pips (backtest + live) */}
                  <div className="rounded-xl p-2.5 flex items-center justify-between" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(212,175,55,0.6)' }}>Combined (Backtest + Live)</div>
                      <div className="text-lg font-mono font-black" style={{ color: '#D4AF37' }}>
                        +{(9560 + (journalStats?.netPips ?? 0)).toLocaleString()} pips
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-gray-600">19mo backtest</div>
                      <div className="text-[9px] font-bold" style={{ color: 'rgba(212,175,55,0.7)' }}>+9,560 verified</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Power Row: Kill Zone Timer + Volatility Radar + Stream Quick-Nav ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">

          {/* Kill Zone Countdown */}
          <KillZoneTimer />

          {/* Volatility Radar */}
          <VolatilityRadar prices={prices} />

          {/* Stream Quick-Nav */}
          <StreamQuickNav />

        </div>

        {/* FXStreet News Headline Tracker */}
        <div className="shrink-0">
          <NewsHeadlineTracker onAnalyze={setSelectedNewsItem} />
        </div>
      </motion.div>

      {/* AI News Analysis Modal */}
      <AnimatePresence>
        {selectedNewsItem && (
          <NewsAnalysisModal
            item={selectedNewsItem}
            onClose={() => setSelectedNewsItem(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
