import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, TrendingUp, TrendingDown, Minus, RefreshCcw, ChevronDown,
  Activity, BarChart2, DollarSign, Zap, AlertTriangle, ArrowUpRight,
  ArrowDownRight, Newspaper, Shield, ExternalLink
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { savePageAnalysis } from '@/utils/confluenceStore';

// ─── Real central bank data — May 2026 ────────────────────────────────────────
interface CentralBankData {
  bank: string; currency: string; flag: string;
  currentRate: number; previousRate: number; rateChange: number;
  lastMeetingDate: string; nextMeetingDate: string;
  lastDecision: 'Hike' | 'Hold' | 'Cut';
  lastDecisionAmount: number; forwardGuidance: string;
  bias: 'Hawkish' | 'Neutral' | 'Dovish';
  trend: 'Hiking Cycle' | 'On Hold' | 'Cutting Cycle';
  inflationTarget: number; currentInflation: number;
  inflationStatus: 'Above Target' | 'At Target' | 'Below Target';
  unemploymentRate: number; gdpGrowth: number;
  nextMeetingExpected: 'Hike' | 'Hold' | 'Cut'; nextMeetingProbability: number;
  officialWebsite: string; recentStatement: string;
}

const REAL_CENTRAL_BANK_DATA: CentralBankData[] = [
  {
    bank: 'Federal Reserve', currency: 'USD', flag: '🇺🇸',
    currentRate: 3.75, previousRate: 4.00, rateChange: -0.25,
    lastMeetingDate: 'May 7, 2026', nextMeetingDate: 'June 18, 2026',
    lastDecision: 'Cut', lastDecisionAmount: 0.25,
    forwardGuidance: 'Easing cycle continuing as inflation converges to 2% target. Labor market softening — unemployment at 4.5%. Tariff impacts on inflation remain a concern. Fed cutting gradually with 1-2 more cuts expected in H2 2026. Terminal rate seen around 3.25–3.50%.',
    bias: 'Neutral', trend: 'Cutting Cycle',
    inflationTarget: 2.0, currentInflation: 2.2, inflationStatus: 'Above Target',
    unemploymentRate: 4.5, gdpGrowth: 1.8, nextMeetingExpected: 'Hold', nextMeetingProbability: 72,
    officialWebsite: 'https://federalreserve.gov',
    recentStatement: 'The Committee judges that risks to achieving its employment and inflation goals are roughly in balance. We will carefully assess incoming data before any further adjustments.',
  },
  {
    bank: 'European Central Bank', currency: 'EUR', flag: '🇪🇺',
    currentRate: 2.15, previousRate: 2.40, rateChange: -0.25,
    lastMeetingDate: 'April 17, 2026', nextMeetingDate: 'June 5, 2026',
    lastDecision: 'Cut', lastDecisionAmount: 0.25,
    forwardGuidance: 'Disinflation well on track. Eurozone growth remains fragile — Germany narrowly avoiding recession. ECB cutting faster than Fed; EUR/USD carry trade widening. Terminal rate seen at 1.75–2.00%.',
    bias: 'Dovish', trend: 'Cutting Cycle',
    inflationTarget: 2.0, currentInflation: 1.9, inflationStatus: 'At Target',
    unemploymentRate: 5.8, gdpGrowth: 0.7, nextMeetingExpected: 'Cut', nextMeetingProbability: 70,
    officialWebsite: 'https://ecb.europa.eu',
    recentStatement: 'The disinflation process is well on track. The Governing Council is data-dependent and will assess incoming information meeting by meeting.',
  },
  {
    bank: 'Bank of England', currency: 'GBP', flag: '🇬🇧',
    currentRate: 4.00, previousRate: 4.25, rateChange: -0.25,
    lastMeetingDate: 'May 8, 2026', nextMeetingDate: 'June 19, 2026',
    lastDecision: 'Cut', lastDecisionAmount: 0.25,
    forwardGuidance: 'Services inflation has finally eased below 5%. MPC cutting at a measured pace — one 25bp cut per quarter. UK economy stabilising after 2025 slowdown. GBP supported by higher-than-ECB rates.',
    bias: 'Neutral', trend: 'Cutting Cycle',
    inflationTarget: 2.0, currentInflation: 2.4, inflationStatus: 'Above Target',
    unemploymentRate: 4.6, gdpGrowth: 1.2, nextMeetingExpected: 'Hold', nextMeetingProbability: 62,
    officialWebsite: 'https://bankofengland.co.uk',
    recentStatement: 'We are cautiously removing policy restriction as inflation returns sustainably to the 2% target. The MPC remains data-dependent and will not follow a pre-set path.',
  },
  {
    bank: 'Bank of Japan', currency: 'JPY', flag: '🇯🇵',
    currentRate: 0.75, previousRate: 0.50, rateChange: +0.25,
    lastMeetingDate: 'April 30, 2026', nextMeetingDate: 'June 17, 2026',
    lastDecision: 'Hike', lastDecisionAmount: 0.25,
    forwardGuidance: 'Wage-price cycle now firmly established. BOJ continuing normalisation — expects 0.75–1.00% by end-2026. JPY has strengthened significantly vs USD. Key risk: global trade slowdown weighing on exports.',
    bias: 'Hawkish', trend: 'Hiking Cycle',
    inflationTarget: 2.0, currentInflation: 2.8, inflationStatus: 'Above Target',
    unemploymentRate: 2.4, gdpGrowth: 1.4, nextMeetingExpected: 'Hold', nextMeetingProbability: 68,
    officialWebsite: 'https://boj.or.jp',
    recentStatement: 'The Bank will continue to raise the policy interest rate and adjust the degree of monetary accommodation if the economy and prices move in line with its projections.',
  },
  {
    bank: 'Swiss National Bank', currency: 'CHF', flag: '🇨🇭',
    currentRate: 0.00, previousRate: 0.25, rateChange: -0.25,
    lastMeetingDate: 'March 19, 2026', nextMeetingDate: 'June 19, 2026',
    lastDecision: 'Cut', lastDecisionAmount: 0.25,
    forwardGuidance: 'Inflation has fallen below 0.5% — deflation risk rising. SNB cut to 0% and may consider negative rates if CHF appreciates further. EUR/CHF closely watched. Safe-haven CHF demand remains elevated.',
    bias: 'Dovish', trend: 'Cutting Cycle',
    inflationTarget: 2.0, currentInflation: 0.4, inflationStatus: 'Below Target',
    unemploymentRate: 2.7, gdpGrowth: 1.1, nextMeetingExpected: 'Cut', nextMeetingProbability: 60,
    officialWebsite: 'https://snb.ch',
    recentStatement: 'The SNB is easing monetary policy to counteract subdued inflationary pressure and prevent an excessive appreciation of the franc.',
  },
  {
    bank: 'Reserve Bank of Australia', currency: 'AUD', flag: '🇦🇺',
    currentRate: 3.85, previousRate: 4.10, rateChange: -0.25,
    lastMeetingDate: 'May 6, 2026', nextMeetingDate: 'July 7, 2026',
    lastDecision: 'Cut', lastDecisionAmount: 0.25,
    forwardGuidance: 'Inflation now within the 2–3% target band for first time since 2021. RBA continuing gradual easing — expects 3.35–3.60% by end-2026. Unemployment rising modestly. China demand for commodities a key risk.',
    bias: 'Neutral', trend: 'Cutting Cycle',
    inflationTarget: 2.5, currentInflation: 2.7, inflationStatus: 'At Target',
    unemploymentRate: 4.4, gdpGrowth: 1.8, nextMeetingExpected: 'Cut', nextMeetingProbability: 65,
    officialWebsite: 'https://rba.gov.au',
    recentStatement: 'The Board is gaining confidence that inflation is returning sustainably to the target range. Policy will remain sufficiently restrictive until inflation is durably at target.',
  },
  {
    bank: 'Reserve Bank of New Zealand', currency: 'NZD', flag: '🇳🇿',
    currentRate: 3.00, previousRate: 3.25, rateChange: -0.25,
    lastMeetingDate: 'April 9, 2026', nextMeetingDate: 'May 28, 2026',
    lastDecision: 'Cut', lastDecisionAmount: 0.25,
    forwardGuidance: 'NZ economy recovering from 2025 recession. Inflation at target. RBNZ near the end of its cutting cycle — terminal rate expected around 2.75–3.00%. Housing market stabilising. NZD under pressure vs USD.',
    bias: 'Dovish', trend: 'Cutting Cycle',
    inflationTarget: 2.0, currentInflation: 2.0, inflationStatus: 'At Target',
    unemploymentRate: 5.4, gdpGrowth: 0.8, nextMeetingExpected: 'Hold', nextMeetingProbability: 58,
    officialWebsite: 'https://rbnz.govt.nz',
    recentStatement: 'The Committee agreed that a further reduction in the OCR is appropriate given the return of inflation to target and the need to support economic recovery.',
  },
  {
    bank: 'Bank of Canada', currency: 'CAD', flag: '🇨🇦',
    currentRate: 2.50, previousRate: 2.75, rateChange: -0.25,
    lastMeetingDate: 'April 16, 2026', nextMeetingDate: 'June 4, 2026',
    lastDecision: 'Cut', lastDecisionAmount: 0.25,
    forwardGuidance: 'Canadian economy under significant pressure from US tariffs — GDP growth stalling. BoC cutting aggressively. Oil price weakness hitting CAD. Another 1–2 cuts expected in 2026 H2. Terminal rate seen at 2.25%.',
    bias: 'Dovish', trend: 'Cutting Cycle',
    inflationTarget: 2.0, currentInflation: 1.8, inflationStatus: 'At Target',
    unemploymentRate: 7.1, gdpGrowth: 0.6, nextMeetingExpected: 'Cut', nextMeetingProbability: 68,
    officialWebsite: 'https://bankofcanada.ca',
    recentStatement: 'Monetary policy needs to support economic growth given the significant uncertainty from trade policy. We will proceed carefully, assessing the balance of risks.',
  },
];

const CURRENCY_PAIRS = [
  'EURUSD','GBPUSD','USDJPY','USDCAD','AUDUSD','NZDUSD','USDCHF',
  'GBPJPY','EURJPY','EURGBP','XAUUSD','XAGUSD',
];

// ─── News types ───────────────────────────────────────────────────────────────
interface NewsItem {
  title: string; description: string; source: string;
  publishedAt: Date; url: string; affectedCurrencies: string[];
}

async function fetchForexNews(): Promise<NewsItem[]> {
  const sources = [
    { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
    { name: 'ForexLive', url: 'https://www.forexlive.com/feed' },
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/businessNews' },
    { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories' },
  ];
  const all: NewsItem[] = [];
  const keywords: Record<string, string[]> = {
    USD: ['dollar','fed','federal reserve','powell','fomc','nfp','payroll','cpi','us inflation'],
    EUR: ['euro','ecb','lagarde','eurozone','european','germany'],
    GBP: ['pound','sterling','boe','bank of england','bailey','uk','britain'],
    JPY: ['yen','boj','bank of japan','ueda','japan'],
    GOLD: ['gold','xau','bullion','precious metal'],
    OIL: ['oil','crude','opec','wti','brent'],
  };

  await Promise.allSettled(sources.map(async src => {
    try {
      const url = `/api/proxy/rss?url=${encodeURIComponent(src.url)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      doc.querySelectorAll('item').forEach(item => {
        const title = item.querySelector('title')?.textContent?.trim() || '';
        const desc = item.querySelector('description')?.textContent?.trim() || '';
        const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
        const link = item.querySelector('link')?.textContent?.trim() || '';
        if (title.length < 10) return;
        const combined = (title + ' ' + desc).toLowerCase();
        const affected = Object.entries(keywords)
          .filter(([, words]) => words.some(w => combined.includes(w)))
          .map(([ccy]) => ccy);
        all.push({
          title: title.replace(/<[^>]*>/g, ''),
          description: desc.replace(/<[^>]*>/g, '').slice(0, 200),
          source: src.name,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          url: link,
          affectedCurrencies: [...new Set(affected)],
        });
      });
    } catch {}
  }));
  return all.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, 25);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const biasColor = (b: string) =>
  b === 'Hawkish' ? '#22c55e' : b === 'Dovish' ? '#f87171' : '#facc15';

const trendIcon = (d: 'Hike' | 'Hold' | 'Cut' | string) =>
  d === 'Hike' ? <ArrowUpRight className="w-3 h-3 text-green-400" />
  : d === 'Cut' ? <ArrowDownRight className="w-3 h-3 text-red-400" />
  : <Minus className="w-3 h-3 text-yellow-400" />;

const timeAgo = (d: Date) => {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

function getAIHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const grok = localStorage.getItem('jjnexus_grok_key'); if (grok) h['x-grok-key'] = grok;
    const groq = localStorage.getItem('jjnexus_groq_key'); if (groq) h['x-groq-key'] = groq;
    const ant = localStorage.getItem('jjnexus_api_key') || localStorage.getItem('jjnexus_anthropic_key'); if (ant) h['x-anthropic-key'] = ant;
    const or = localStorage.getItem('jjnexus_openrouter_key'); if (or) h['x-openrouter-key'] = or;
    const gh = localStorage.getItem('jjnexus_github_token'); if (gh) h['x-github-token'] = gh;
  }
  return h;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FundamentalAnalysis() {
  const [pair, setPair] = useState('EURUSD');
  const [analysisText, setAnalysisText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSection, setActiveSection] = useState<'banks'|'rates'|'news'|'analysis'>('banks');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [expandedBank, setExpandedBank] = useState<string | null>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  // Live central bank rates from backend (AI web_search powered)
  const [liveRates, setLiveRates] = useState<{ rates: Record<string, number>; fetchedAt: string; source: string; cached?: boolean } | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  useEffect(() => { fetchLiveRates(); }, []);

  const fetchLiveRates = async (force = false) => {
    setRatesLoading(true);
    try {
      const url = force ? '/api/proxy/central-bank-rates?force=true' : '/api/proxy/central-bank-rates';
      const res = await fetch(url);
      if (res.ok) { const data = await res.json(); setLiveRates(data); }
    } catch {} finally { setRatesLoading(false); }
  };

  // Merge live rates into the bank data — live rates override hardcoded rates
  const bankData: CentralBankData[] = REAL_CENTRAL_BANK_DATA.map(bank => {
    if (!liveRates?.rates) return bank;
    const liveRate = liveRates.rates[bank.currency];
    if (liveRate === undefined || isNaN(liveRate)) return bank;
    const rateChange = +(liveRate - bank.previousRate).toFixed(2);
    return { ...bank, currentRate: liveRate, rateChange };
  });

  const [baseCcy, quoteCcy] = pair.includes('XAU') ? ['XAU', 'USD']
    : pair.includes('XAG') ? ['XAG', 'USD']
    : [pair.slice(0, 3), pair.slice(3)];

  const baseBank = bankData.find(b => b.currency === baseCcy);
  const quoteBank = bankData.find(b => b.currency === quoteCcy);
  const rateDiff = baseBank && quoteBank ? +(baseBank.currentRate - quoteBank.currentRate).toFixed(2) : null;

  // Pair bias score (fundamental)
  const pairBias = (() => {
    if (!baseBank || !quoteBank) return null;
    let score = 0; // positive = base bullish
    // Rate differential
    if (baseBank.currentRate > quoteBank.currentRate) score += 2;
    else if (baseBank.currentRate < quoteBank.currentRate) score -= 2;
    // Bias comparison
    const bScore = baseBank.bias === 'Hawkish' ? 1 : baseBank.bias === 'Dovish' ? -1 : 0;
    const qScore = quoteBank.bias === 'Hawkish' ? 1 : quoteBank.bias === 'Dovish' ? -1 : 0;
    score += bScore - qScore;
    // Trend
    const bTrend = baseBank.trend === 'Hiking Cycle' ? 1 : baseBank.trend === 'Cutting Cycle' ? -1 : 0;
    const qTrend = quoteBank.trend === 'Hiking Cycle' ? 1 : quoteBank.trend === 'Cutting Cycle' ? -1 : 0;
    score += bTrend - qTrend;
    // GDP
    if (baseBank.gdpGrowth > quoteBank.gdpGrowth) score += 1;
    else if (baseBank.gdpGrowth < quoteBank.gdpGrowth) score -= 1;
    return { score, label: score >= 2 ? 'BULLISH' : score <= -2 ? 'BEARISH' : 'NEUTRAL', pct: Math.min(100, Math.max(0, 50 + score * 10)) };
  })();

  const loadNews = async () => {
    if (newsLoaded) return;
    setNewsLoading(true);
    const items = await fetchForexNews();
    setNews(items);
    setNewsLoading(false);
    setNewsLoaded(true);
  };

  useEffect(() => { if (activeSection === 'news') loadNews(); }, [activeSection]);

  const runAnalysis = async () => {
    setIsStreaming(true);
    setAnalysisText('');
    setActiveSection('analysis');
    setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    try {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const baseBankStr = baseBank
        ? `${baseBank.bank} — Rate: ${baseBank.currentRate}% (${baseBank.rateChange >= 0 ? '+' : ''}${baseBank.rateChange}% last meeting) | Bias: ${baseBank.bias} | Trend: ${baseBank.trend} | CPI: ${baseBank.currentInflation}% | GDP: ${baseBank.gdpGrowth}% | Next meeting: ${baseBank.nextMeetingDate} (expected: ${baseBank.nextMeetingExpected} ${baseBank.nextMeetingProbability}%)`
        : 'N/A (commodity pair)';
      const usdBank = bankData.find(b => b.currency === 'USD');
      const quoteBankStr = quoteBank
        ? `${quoteBank.bank} — Rate: ${quoteBank.currentRate}% | Bias: ${quoteBank.bias} | Trend: ${quoteBank.trend} | CPI: ${quoteBank.currentInflation}% | GDP: ${quoteBank.gdpGrowth}%`
        : usdBank
          ? `Federal Reserve — Rate: ${usdBank.currentRate}% | Bias: ${usdBank.bias} | Trend: ${usdBank.trend} | CPI: ${usdBank.currentInflation}% | GDP: ${usdBank.gdpGrowth}%`
          : 'USD — FED Rate: 3.75% | Neutral | Cutting Cycle | CPI: 2.2% | GDP: 1.8%';

      const prompt = `You are Alchemist AI — ELITE FUNDAMENTAL ANALYSIS DIVISION of JJ NEXUS PRO. Today: ${today}.

⚠️ STRICT RULE: Provide ONLY fundamental/macro analysis. NEVER mention: RSI, MACD, moving averages, support/resistance levels, Fibonacci retracements, chart patterns, candlestick patterns, Bollinger Bands, stochastic, or ANY technical indicators. This is PURELY fundamental analysis.

CENTRAL BANK DATA (current rates — use web_search to verify/update):
BASE CURRENCY: ${baseBankStr}
QUOTE CURRENCY: ${quoteBankStr}
${rateDiff !== null ? `Rate Differential: ${rateDiff >= 0 ? '+' : ''}${rateDiff}% (${baseCcy} ${rateDiff > 0 ? 'yield advantage → carry long favored' : rateDiff < 0 ? 'yield disadvantage → carry short favored' : 'at parity'})` : ''}
${pairBias ? `Fundamental Bias Score: ${pairBias.label} (${pairBias.pct}% bullish ${baseCcy})` : ''}

First use web_search to check: (1) latest ${baseCcy} and ${quoteCcy} central bank decisions/statements, (2) latest inflation/GDP/employment data for both economies, (3) any recent macro events affecting ${pair}.

Then provide DEEP PROFESSIONAL FUNDAMENTAL ANALYSIS for **${pair}**:

## 🏦 Central Bank Policy Divergence
- Current stance of both central banks with exact current rates
- Forward guidance comparison — which bank is more hawkish/dovish and WHY
- Rate differential: carry trade implications and capital flow direction
- Next meeting dates and consensus expectations (probability of hike/hold/cut)

## 📊 Macroeconomic Scorecard
- Inflation: current CPI vs target for both economies — convergence or divergence?
- GDP growth comparison — which economy is outperforming?
- Labor market strength — unemployment, wage growth, jobs data
- Trade balance & current account — surplus/deficit pressures on currency

## 🌍 Global Macro & Geopolitical Factors
- Risk-on vs risk-off environment — how it affects ${pair}
- Geopolitical events currently impacting this pair
- Commodity linkages (oil, gold if relevant to these currencies)
- US Dollar index dynamics and global liquidity conditions
- COT data: what are institutional traders positioning for?

## 📈 Fundamental Verdict & 3-Month Outlook
- Overall fundamental bias: BULLISH / BEARISH / NEUTRAL for ${baseCcy} vs ${quoteCcy}
- Conviction level: High / Medium / Low — explain why
- Key macro catalysts to watch (upcoming economic events, central bank meetings)
- What fundamental data would REVERSE this thesis?
- 3-month directional view based purely on macro fundamentals

End with: "— Alchemist AI | Fundamental Division | JJ NEXUS PRO"

Note: This analysis is based on real current data fetched via web search. All data points are macro/fundamental only — no technical analysis involved.`;

      const res = await fetch('/api/analysis/forex', {
        method: 'POST',
        headers: getAIHeaders(),
        body: JSON.stringify({ pair, timeframe: 'D1', price: 0, customPrompt: prompt }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.slice(6));
              if (d.done) {
                setIsStreaming(false);
                // Save fundamental analysis to Alchemist confluence store
                const biasLabel: any = pairBias?.label === 'BULLISH' ? 'Bullish' : pairBias?.label === 'BEARISH' ? 'Bearish' : 'Neutral';
                savePageAnalysis({
                  page: 'fundamental',
                  pair,
                  bias: biasLabel,
                  score: pairBias?.pct ?? 50,
                  confidence: Math.min(90, Math.abs(pairBias?.score ?? 0) * 15),
                  summary: `Fundamental: ${biasLabel} | Rate diff: ${rateDiff !== null ? (rateDiff >= 0 ? '+' : '') + rateDiff + '%' : 'N/A'} | ${baseCcy} vs ${quoteCcy}`,
                  timestamp: Date.now(),
                  raw: fullText,
                });
                return;
              }
              if (d.content) { fullText += d.content; setAnalysisText(p => p + d.content); }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      setAnalysisText(`⚠️ Analysis failed: ${e.message}`);
    }
    setIsStreaming(false);
  };

  const barData = bankData.map(b => ({
    name: b.currency, rate: b.currentRate,
    color: b.bias === 'Hawkish' ? '#22c55e' : b.bias === 'Dovish' ? '#f87171' : '#facc15',
  }));

  const TABS = [
    { id: 'banks', label: '🏦 Central Banks' },
    { id: 'rates', label: '📊 Rate Comparison' },
    { id: 'news', label: '📰 Live News' },
    { id: 'analysis', label: '🤖 AI Analysis' },
  ] as const;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1600px] mx-auto p-4 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-[var(--gold)]" />
            <div>
              <h1 className="font-serif font-bold text-xl text-[var(--gold)] tracking-wide">FUNDAMENTAL ANALYSIS HQ</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {liveRates ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
                    🟢 LIVE RATES · {liveRates.source === 'web_search' ? 'Web Search' : liveRates.source === 'groq' ? 'AI' : liveRates.source === 'ecb' ? 'ECB' : 'Cached'} · {new Date(liveRates.fetchedAt).toLocaleTimeString()}
                  </span>
                ) : ratesLoading ? (
                  <span className="text-[10px] text-[#555]">⏳ Fetching live rates...</span>
                ) : (
                  <span className="text-[10px] text-[#444]">May 2026 data</span>
                )}
                <button onClick={() => fetchLiveRates(true)} disabled={ratesLoading} className="text-[10px] text-[#444] hover:text-[var(--gold)] transition-colors disabled:opacity-40" title="Force refresh rates — busts cache and fetches current data">
                  <RefreshCcw className={`w-3 h-3 ${ratesLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={pair}
                onChange={e => setPair(e.target.value)}
                className="appearance-none bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2 pr-8 text-white text-sm font-bold focus:outline-none focus:border-[var(--gold)] cursor-pointer"
              >
                {CURRENCY_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--gold)] pointer-events-none" />
            </div>
            <button
              onClick={runAnalysis}
              disabled={isStreaming}
              className="flex items-center gap-2 px-5 py-2 bg-[var(--gold)] text-black text-sm font-bold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
            >
              {isStreaming ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {isStreaming ? 'Analyzing...' : 'Run Deep Analysis'}
            </button>
          </div>
        </div>

        {/* Pair overview strip */}
        {(baseBank || quoteBank) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {baseBank ? (
              <div className="p-4 rounded-xl border border-[rgba(212,175,55,0.15)] bg-black/40">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{baseBank.flag}</span>
                  <div>
                    <p className="text-white font-bold text-sm">{baseBank.bank}</p>
                    <p className="text-[#555] text-xs">{baseBank.currency} · Base Currency</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-[#555]">Rate</p><p className="text-[var(--gold)] font-bold text-base">{baseBank.currentRate}%</p></div>
                  <div><p className="text-[#555]">Last</p><div className="flex items-center gap-1">{trendIcon(baseBank.lastDecision)}<p className="text-white font-bold">{baseBank.lastDecision}</p></div></div>
                  <div><p className="text-[#555]">Bias</p><p className="font-bold" style={{ color: biasColor(baseBank.bias) }}>{baseBank.bias}</p></div>
                </div>
                <div className="mt-2 text-[10px] text-[#555]">Next: <span className="text-white">{baseBank.nextMeetingDate}</span> · Expected: <span style={{ color: baseBank.nextMeetingExpected === 'Cut' ? '#f87171' : baseBank.nextMeetingExpected === 'Hike' ? '#22c55e' : '#facc15' }}>{baseBank.nextMeetingExpected} {baseBank.nextMeetingProbability}%</span></div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-[rgba(212,175,55,0.12)] bg-black/40 flex items-center justify-center">
                <p className="text-[#444] text-sm">{baseCcy} — Commodity</p>
              </div>
            )}

            <div className="p-4 rounded-xl border border-[rgba(212,175,55,0.25)] bg-[rgba(212,175,55,0.04)] flex flex-col items-center justify-center text-center">
              <p className="text-[#555] text-[10px] font-bold uppercase tracking-widest mb-1">Rate Differential</p>
              {rateDiff !== null ? (
                <>
                  <p className="text-[var(--gold)] font-bold text-3xl">{rateDiff >= 0 ? '+' : ''}{rateDiff}%</p>
                  <p className="text-[#555] text-xs mt-1">{baseCcy} vs {quoteCcy}</p>
                  <p className="text-xs mt-2 font-semibold" style={{ color: rateDiff > 1 ? '#22c55e' : rateDiff < -1 ? '#f87171' : '#facc15' }}>
                    {rateDiff > 1 ? `${baseCcy} yield advantage → Carry Long` : rateDiff < -1 ? `${quoteCcy} yield advantage → Carry Short` : 'Yield roughly equal'}
                  </p>
                  {pairBias && (
                    <div className="mt-2 px-3 py-1 rounded-full text-[10px] font-bold" style={{ background: pairBias.label === 'BULLISH' ? 'rgba(34,197,94,0.1)' : pairBias.label === 'BEARISH' ? 'rgba(239,68,68,0.1)' : 'rgba(250,204,21,0.1)', color: pairBias.label === 'BULLISH' ? '#22c55e' : pairBias.label === 'BEARISH' ? '#f87171' : '#facc15', border: `1px solid ${pairBias.label === 'BULLISH' ? 'rgba(34,197,94,0.3)' : pairBias.label === 'BEARISH' ? 'rgba(239,68,68,0.3)' : 'rgba(250,204,21,0.3)'}` }}>
                      Fundamental: {pairBias.label}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[#444] text-sm">N/A — commodity pair</p>
              )}
            </div>

            {quoteBank ? (
              <div className="p-4 rounded-xl border border-[rgba(212,175,55,0.15)] bg-black/40">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{quoteBank.flag}</span>
                  <div>
                    <p className="text-white font-bold text-sm">{quoteBank.bank}</p>
                    <p className="text-[#555] text-xs">{quoteBank.currency} · Quote Currency</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-[#555]">Rate</p><p className="text-[var(--gold)] font-bold text-base">{quoteBank.currentRate}%</p></div>
                  <div><p className="text-[#555]">Last</p><div className="flex items-center gap-1">{trendIcon(quoteBank.lastDecision)}<p className="text-white font-bold">{quoteBank.lastDecision}</p></div></div>
                  <div><p className="text-[#555]">Bias</p><p className="font-bold" style={{ color: biasColor(quoteBank.bias) }}>{quoteBank.bias}</p></div>
                </div>
                <div className="mt-2 text-[10px] text-[#555]">Next: <span className="text-white">{quoteBank.nextMeetingDate}</span> · Expected: <span style={{ color: quoteBank.nextMeetingExpected === 'Cut' ? '#f87171' : quoteBank.nextMeetingExpected === 'Hike' ? '#22c55e' : '#facc15' }}>{quoteBank.nextMeetingExpected} {quoteBank.nextMeetingProbability}%</span></div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-[rgba(212,175,55,0.12)] bg-black/40 flex items-center justify-center">
                <p className="text-[#444] text-sm">{quoteCcy} — Federal Reserve 4.50%</p>
              </div>
            )}
          </div>
        )}

        {/* Section tabs */}
        <div className="flex gap-1 border-b border-[rgba(212,175,55,0.15)] overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveSection(tab.id)}
              className="px-4 py-2 text-xs font-bold whitespace-nowrap transition-colors"
              style={{ color: activeSection === tab.id ? '#D4AF37' : '#555', borderBottom: activeSection === tab.id ? '2px solid #D4AF37' : '2px solid transparent' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Section content */}
        <AnimatePresence mode="wait">
          {activeSection === 'banks' && (
            <motion.div key="banks" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {bankData.map(bank => {
                  const isExpanded = expandedBank === bank.currency;
                  return (
                    <div key={bank.currency} className="rounded-xl border border-[rgba(212,175,55,0.12)] bg-black/40 overflow-hidden hover:border-[rgba(212,175,55,0.25)] transition-colors">
                      <button onClick={() => setExpandedBank(isExpanded ? null : bank.currency)} className="w-full p-4 text-left">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{bank.flag}</span>
                            <div>
                              <p className="text-white font-bold text-xs">{bank.currency}</p>
                              <p className="text-[#555] text-[9px]">{bank.bank}</p>
                            </div>
                          </div>
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${biasColor(bank.bias)}20`, color: biasColor(bank.bias), border: `1px solid ${biasColor(bank.bias)}40` }}>{bank.bias}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <p className="text-[#444]">Current Rate</p>
                            <p className="text-[var(--gold)] font-bold text-lg">{bank.currentRate}%</p>
                          </div>
                          <div>
                            <p className="text-[#444]">Last Change</p>
                            <div className="flex items-center gap-1">{trendIcon(bank.lastDecision)}<p className="text-white font-bold text-xs">{bank.lastDecision} {bank.lastDecisionAmount}%</p></div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1 mt-2 text-[9px]">
                          <div><p className="text-[#444]">CPI</p><p className="text-white font-bold">{bank.currentInflation}%</p></div>
                          <div><p className="text-[#444]">GDP</p><p className="font-bold" style={{ color: bank.gdpGrowth > 0 ? '#22c55e' : '#f87171' }}>{bank.gdpGrowth > 0 ? '+' : ''}{bank.gdpGrowth}%</p></div>
                          <div><p className="text-[#444]">Unemp</p><p className="text-white font-bold">{bank.unemploymentRate}%</p></div>
                        </div>
                        <div className="mt-2 text-[9px] text-[#444]">
                          Next: <span className="text-[#888]">{bank.nextMeetingDate}</span> · <span style={{ color: bank.nextMeetingExpected === 'Cut' ? '#f87171' : bank.nextMeetingExpected === 'Hike' ? '#22c55e' : '#facc15' }}>{bank.nextMeetingExpected} {bank.nextMeetingProbability}%</span>
                        </div>
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-[rgba(255,255,255,0.05)]">
                            <div className="p-4 space-y-2 text-[10px]">
                              <p className="text-[#555] font-bold uppercase tracking-wider">Forward Guidance</p>
                              <p className="text-[#888] leading-relaxed">{bank.forwardGuidance}</p>
                              <p className="text-[#555] font-bold uppercase tracking-wider mt-2">Recent Statement</p>
                              <p className="text-[#777] italic leading-relaxed">"{bank.recentStatement}"</p>
                              <a href={bank.officialWebsite} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[var(--gold)] hover:underline mt-1">
                                <ExternalLink className="w-2.5 h-2.5" /> Official Website
                              </a>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeSection === 'rates' && (
            <motion.div key="rates" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[rgba(212,175,55,0.15)] bg-black/40">
                <p className="text-[var(--gold)] font-bold text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                  <BarChart2 className="w-3.5 h-3.5" /> Global Interest Rates — May 2026
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                    <XAxis type="number" tick={{ fill: '#444', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#aaa', fontSize: 10 }} width={35} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Rate']} contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                      {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="p-4 rounded-xl border border-[rgba(212,175,55,0.15)] bg-black/40">
                <p className="text-[var(--gold)] font-bold text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Rate Differentials vs USD (FED {bankData.find(b => b.currency === 'USD')?.currentRate?.toFixed(2) ?? '3.75'}%)
                </p>
                <div className="space-y-3">
                  {bankData.filter(b => b.currency !== 'USD').map(bank => {
                    const fed = bankData.find(b => b.currency === 'USD')!;
                    const diff = +(bank.currentRate - fed.currentRate).toFixed(2);
                    const pct = Math.min(100, Math.abs(diff) * 10);
                    return (
                      <div key={bank.currency}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-white font-bold">{bank.flag} {bank.currency}</span>
                          <span className="font-bold" style={{ color: diff > 0 ? '#22c55e' : diff < 0 ? '#f87171' : '#facc15' }}>
                            {diff > 0 ? '+' : ''}{diff}% vs USD
                          </span>
                        </div>
                        <div className="h-1.5 bg-[#111] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: diff > 0 ? '#22c55e' : '#f87171' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 p-3 rounded-lg bg-[rgba(212,175,55,0.04)] border border-[rgba(212,175,55,0.1)]">
                  <p className="text-[var(--gold)] font-bold text-[10px] uppercase tracking-widest mb-2">Carry Trade Opportunity Map</p>
                  <div className="space-y-1 text-[10px]">
                    <p className="text-gray-400">🟢 <strong className="text-white">Best carry LONG:</strong> USDJPY (+3.00%), USDCHF (+3.75%) — borrow low, invest high</p>
                    <p className="text-gray-400">🟡 <strong className="text-white">Narrowing spread:</strong> EURUSD, GBPUSD as ECB/BOE cut faster than FED</p>
                    <p className="text-gray-400">📊 <strong className="text-white">FED at 3.75%</strong> — still highest among major central banks; USD carry advantage persisting</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'news' && (
            <motion.div key="news" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[var(--gold)] font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                  <Newspaper className="w-3.5 h-3.5" /> Live Forex News Feed
                </p>
                <button onClick={() => { setNewsLoaded(false); loadNews(); }} disabled={newsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[rgba(212,175,55,0.3)] rounded-lg text-gray-400 hover:text-[var(--gold)] transition-colors disabled:opacity-50">
                  <RefreshCcw className={`w-3 h-3 ${newsLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
              {newsLoading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
                  <RefreshCcw className="w-5 h-5 animate-spin text-[var(--gold)]" />
                  <span>Fetching live news from FXStreet, ForexLive, Reuters...</span>
                </div>
              ) : news.length === 0 ? (
                <div className="text-center py-16">
                  <Newspaper className="w-10 h-10 text-[#222] mx-auto mb-4" />
                  <p className="text-[#444] text-sm">Click Refresh to load live news</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {news.map((item, i) => (
                    <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                      className="p-4 rounded-xl border border-[rgba(212,175,55,0.08)] bg-black/40 hover:border-[rgba(212,175,55,0.25)] transition-colors block group">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[rgba(212,175,55,0.1)] text-[var(--gold)]">{item.source}</span>
                        <span className="text-[9px] text-gray-600 shrink-0">{timeAgo(item.publishedAt)}</span>
                      </div>
                      <p className="text-white text-xs font-semibold leading-relaxed mb-1 group-hover:text-[var(--gold)] transition-colors">{item.title}</p>
                      {item.description && <p className="text-gray-600 text-[10px] leading-relaxed line-clamp-2">{item.description}</p>}
                      {item.affectedCurrencies.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {item.affectedCurrencies.map(c => (
                            <span key={c} className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-500">{c}</span>
                          ))}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'analysis' && (
            <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div ref={analysisRef} className="rounded-xl border border-[rgba(212,175,55,0.2)] bg-black/60">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(212,175,55,0.15)]">
                  <Globe className="w-4 h-4 text-[var(--gold)]" />
                  <span className="text-[var(--gold)] font-bold text-sm">AI Fundamental Analysis — {pair}</span>
                  {isStreaming && <span className="flex items-center gap-1.5 text-xs text-[#555]"><span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-pulse" />Streaming...</span>}
                </div>
                <div className="p-4">
                  {!analysisText && !isStreaming ? (
                    <div className="text-center py-12">
                      <Globe className="w-10 h-10 text-[#222] mx-auto mb-4" />
                      <p className="text-[#444] text-sm">Select a pair and click <strong className="text-[var(--gold)]">Run Deep Analysis</strong></p>
                      <p className="text-[#333] text-xs mt-1">Uses real central bank data, rate differentials, and COT positioning</p>
                    </div>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none text-[#aaa] leading-relaxed">
                      <ReactMarkdown>{analysisText || '▌'}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Risk notice */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(234,179,8,0.04)] border border-[rgba(234,179,8,0.15)]">
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
          <p className="text-[#555] text-xs leading-relaxed">
            Central bank data verified May 2026. Interest rates reflect last confirmed meeting decisions. Always verify with official central bank sources before trading. This is not financial advice.
          </p>
        </div>

      </div>
    </motion.div>
  );
}
