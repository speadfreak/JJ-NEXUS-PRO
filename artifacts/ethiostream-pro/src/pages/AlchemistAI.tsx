import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, RefreshCcw, ShieldCheck, Send, TrendingUp, TrendingDown,
  Minus, Zap, BarChart2, Target, Activity, ChevronDown, Download,
  MessageSquare, Plus, Trash2, Clock, Cpu, Layers, CheckCircle, Globe,
  Sparkles, Radar, Eye, AlertTriangle, ChevronRight, Newspaper,
  CalendarDays, Flame, Signal, Lock, Unlock, ScanLine
} from 'lucide-react';
import { exportAnalysisPDF } from '@/utils/pdfExport';
import TradingViewAdvancedChart from '@/components/common/TradingViewAdvancedChart';
import ReactMarkdown from 'react-markdown';
import { useLivePrices, formatPriceForSymbol } from '@/utils/priceEngine';
import { alchemistConfluenceAI } from '@/utils/specializedAI';
import { getMasterConfluence, savePageAnalysis, type PageAnalysis } from '@/utils/confluenceStore';

const PAIRS = [
  'XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','EURJPY','AUDUSD',
  'USDCAD','USDCHF','NZDUSD','XAGUSD','BTCUSD','ETHUSD','US30','NAS100','SPX500',
];
const TIMEFRAMES = ['M1','M5','M15','M30','H1','H4','D1','W1'];

type Tab = 'analysis' | 'chat' | 'intel' | 'risk' | 'master';

interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; }
interface ConversationMeta { id: number; title: string; createdAt: string; }

const CONV_STORAGE_KEY = 'jjnexus_active_conversation_id';

function getAIHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window === 'undefined') return h;
  const grokKey = localStorage.getItem('jjnexus_grok_key') || '';
  const groqKey = localStorage.getItem('jjnexus_groq_key') || '';
  const openrouterKey = localStorage.getItem('jjnexus_openrouter_key') || '';
  const githubToken = localStorage.getItem('jjnexus_github_token') || '';
  const anthropicKey = localStorage.getItem('jjnexus_api_key') || localStorage.getItem('jjnexus_anthropic_key') || '';
  if (grokKey) h['x-grok-key'] = grokKey;
  if (groqKey) h['x-groq-key'] = groqKey;
  if (openrouterKey) h['x-openrouter-key'] = openrouterKey;
  if (githubToken) h['x-github-token'] = githubToken;
  if (anthropicKey) h['x-anthropic-key'] = anthropicKey;
  return h;
}

function getActiveProviderName(): string {
  if (typeof window === 'undefined') return 'Neural Core';
  if (localStorage.getItem('jjnexus_groq_key')) return 'Groq · Llama 3.3 70B';
  if (localStorage.getItem('jjnexus_openrouter_key')) return 'OpenRouter';
  if (localStorage.getItem('jjnexus_github_token')) return 'GitHub Models';
  if (localStorage.getItem('jjnexus_api_key')) return 'Anthropic Claude';
  return 'Neural Core · Replit';
}

// ── Animated background grid ───────────────────────────────────────────────
function NeuralGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: 'linear-gradient(rgba(212,175,55,1) 1px,transparent 1px),linear-gradient(90deg,rgba(212,175,55,1) 1px,transparent 1px)', backgroundSize: '60px 60px' }} />
      {/* Radial glow center */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-[0.04]"
        style={{ background: 'radial-gradient(ellipse at center, rgba(212,175,55,1), transparent 70%)' }} />
      {/* Scan line */}
      <motion.div
        className="absolute left-0 right-0 h-px opacity-20"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.8),transparent)' }}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

// ── Signal strength gauge ──────────────────────────────────────────────────
function SignalGauge({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#d4af37' : score >= 30 ? '#f97316' : '#ef4444';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(212,175,55,0.08)" strokeWidth="5" />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold text-white leading-none" style={{ fontSize: size * 0.22 }}>{score}</span>
        <span className="text-gray-500 leading-none" style={{ fontSize: size * 0.12 }}>SCORE</span>
      </div>
    </div>
  );
}

// ── Market news panel ──────────────────────────────────────────────────────
interface NewsItem { title: string; source: string; time: string; sentiment: 'BULL' | 'BEAR' | 'NEUTRAL'; url?: string; }

const MOCK_NEWS: NewsItem[] = [
  { title: 'Fed Chair signals cautious approach to rate cuts as inflation data remains elevated', source: 'Reuters', time: '2h ago', sentiment: 'BEAR' },
  { title: 'Gold surges on safe-haven demand amid geopolitical uncertainty', source: 'Bloomberg', time: '3h ago', sentiment: 'BULL' },
  { title: 'EUR/USD consolidates near key support as ECB rhetoric softens', source: 'FXStreet', time: '4h ago', sentiment: 'NEUTRAL' },
  { title: 'GBP strengthens after better-than-expected UK PMI data', source: 'ForexFactory', time: '5h ago', sentiment: 'BULL' },
  { title: 'DXY holds above 100 as Treasury yields stabilize', source: 'Reuters', time: '6h ago', sentiment: 'NEUTRAL' },
  { title: 'USD/JPY approaches critical resistance zone at 158.00', source: 'DailyFX', time: '7h ago', sentiment: 'NEUTRAL' },
];

const ECONOMIC_EVENTS = [
  { time: '08:30', currency: 'USD', impact: 3, event: 'Non-Farm Payrolls', forecast: '180K', prev: '206K' },
  { time: '10:00', currency: 'USD', impact: 2, event: 'ISM Manufacturing PMI', forecast: '48.8', prev: '48.5' },
  { time: '12:30', currency: 'EUR', impact: 2, event: 'ECB Monetary Policy Meeting', forecast: '—', prev: '—' },
  { time: '14:30', currency: 'GBP', impact: 1, event: 'BOE Gov Bailey Speech', forecast: '—', prev: '—' },
  { time: '18:00', currency: 'USD', impact: 2, event: 'FOMC Meeting Minutes', forecast: '—', prev: '—' },
];

// ── Multi-pair scanner ─────────────────────────────────────────────────────
const SCANNER_PAIRS = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY'];

export default function AlchemistAI() {
  const [pair, setPair] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState('H1');
  const [activeTab, setActiveTab] = useState<Tab>('analysis');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [confluenceData, setConfluenceData] = useState<any>(null);
  const [isConfluenceLoading, setIsConfluenceLoading] = useState(false);
  const [score, setScore] = useState(0);

  const [analysisText, setAnalysisText] = useState('');
  const [isAnalysisStreaming, setIsAnalysisStreaming] = useState(false);

  // Chat
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [showConvList, setShowConvList] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const [activeProvider, setActiveProvider] = useState('Neural Core · Replit');
  const [selectedModel, setSelectedModel] = useState<'alchemist' | 'claude'>('alchemist');
  const [alchemistStatus, setAlchemistStatus] = useState<'online' | 'offline'>('offline');
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const pendingPrefillRef = useRef<string | null>(null);
  const chatFormRef = useRef<HTMLFormElement>(null);

  // Risk calculator
  const [balance, setBalance] = useState('10000');
  const [riskPercent, setRiskPercent] = useState('1.0');
  const [stopLossPips, setStopLossPips] = useState('25');

  // Master Confluence
  const [masterConf, setMasterConf] = useState<ReturnType<typeof getMasterConfluence> | null>(null);
  const [isMasterRunning, setIsMasterRunning] = useState(false);
  const [masterResult, setMasterResult] = useState('');
  const [masterSaved, setMasterSaved] = useState(false);

  // Scanner
  const [scanResults, setScanResults] = useState<Record<string, { bias: string; score: number; loading: boolean }>>({});

  // Intel
  const [newsItems] = useState<NewsItem[]>(MOCK_NEWS);
  const [selectedDate] = useState(new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const { prices } = useLivePrices();
  const livePrice = prices[pair] || 0;

  const dollarRisk = (Number(balance) || 0) * ((Number(riskPercent) || 0) / 100);
  const pipValue = pair.includes('JPY') ? 0.1 : pair === 'XAUUSD' ? 1 : pair.includes('XAG') ? 5 : 10;
  const lotSize = dollarRisk / ((Number(stopLossPips) || 1) * pipValue);
  const rrRatio = 2;
  const tp = parseFloat(stopLossPips) * rrRatio;

  // ── Conversations ───────────────────────────────────────────────────────────
  const loadConversations = async () => {
    try {
      const res = await fetch('/api/anthropic/conversations');
      const data = await res.json();
      setConversations(data);
      return data as ConversationMeta[];
    } catch { return []; }
  };

  const loadConversationMessages = async (convId: number) => {
    try {
      const res = await fetch(`/api/anthropic/conversations/${convId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  };

  useEffect(() => {
    setActiveProvider(getActiveProviderName());
    const prefill = localStorage.getItem('jjnexus_alchemist_prefill');
    if (prefill) {
      setChatInput(prefill);
      setActiveTab('chat');
      pendingPrefillRef.current = prefill;
      localStorage.removeItem('jjnexus_alchemist_prefill');
    }
    fetch('/api/alchemist/status')
      .then(response => response.json())
      .then((data: { status?: 'online' | 'offline' | 'degraded'; latency_ms?: number }) => {
        setAlchemistStatus(data.status === 'online' ? 'online' : 'offline');
        if (typeof data.latency_ms === 'number') setLastLatency(data.latency_ms);
      })
      .catch(() => setAlchemistStatus('offline'));
    const init = async () => {
      await loadConversations();
      const storedId = localStorage.getItem(CONV_STORAGE_KEY);
      if (storedId) {
        const convId = parseInt(storedId, 10);
        const conv = await loadConversationMessages(convId);
        if (conv?.messages) {
          setConversationId(convId);
          const msgs: ChatMsg[] = conv.messages.map((m: any) => ({ id: m.id.toString(), role: m.role, content: m.content }));
          setMemoryCount(msgs.filter(m => m.role === 'user').length);
          setChatMessages([{
            id: 'welcome', role: 'assistant',
            content: `Neural core online. I have ${msgs.filter(m => m.role === 'user').length} prior exchanges loaded.\n\n*Active: ${pair} · ${timeframe}*`,
          }, ...msgs]);
          return;
        }
      }
      await createNewConversation(pair, timeframe);
    };
    init();
  }, []);

  useEffect(() => {
    if (!conversationId || !pendingPrefillRef.current) return;
    pendingPrefillRef.current = null;
    const submit = () => chatFormRef.current?.requestSubmit();
    const timer = window.setTimeout(submit, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId]);

  const createNewConversation = async (p: string, tf: string) => {
    try {
      const res = await fetch('/api/anthropic/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Alchemist — ${p} — ${new Date().toLocaleDateString()}` }),
      });
      const data = await res.json();
      setConversationId(data.id);
      localStorage.setItem(CONV_STORAGE_KEY, data.id.toString());
      setMemoryCount(0);
      setChatMessages([{ id: 'welcome', role: 'assistant', content: `**Alchemist Neural Core** — online.\n\nReady for deep market analysis on ${p} ${tf}. Ask me about structure, order blocks, FVGs, liquidity pools, or get a complete trade plan.\n\n*Use the ANALYZE button to run full multi-factor confluence.*` }]);
      await loadConversations();
    } catch (e) { console.error('Chat init failed', e); }
  };

  const handleNewChat = async () => { localStorage.removeItem(CONV_STORAGE_KEY); setShowConvList(false); await createNewConversation(pair, timeframe); };

  const handleSwitchConversation = async (convId: number) => {
    const conv = await loadConversationMessages(convId);
    if (!conv) return;
    setConversationId(convId);
    localStorage.setItem(CONV_STORAGE_KEY, convId.toString());
    const msgs: ChatMsg[] = (conv.messages || []).map((m: any) => ({ id: m.id.toString(), role: m.role, content: m.content }));
    setMemoryCount(msgs.filter(m => m.role === 'user').length);
    setChatMessages([{ id: 'welcome', role: 'assistant', content: `Memory loaded: **${conv.title}**` }, ...msgs]);
    setShowConvList(false); setActiveTab('chat');
  };

  const handleDeleteConversation = async (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/anthropic/conversations/${convId}`, { method: 'DELETE' });
    if (convId === conversationId) { localStorage.removeItem(CONV_STORAGE_KEY); await createNewConversation(pair, timeframe); }
    await loadConversations();
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  useEffect(() => { runFullAnalysis(); }, [pair, timeframe]);
  useEffect(() => { setMasterConf(getMasterConfluence(pair)); setMasterResult(''); setMasterSaved(false); }, [pair]);
  useEffect(() => {
    const handler = () => setMasterConf(getMasterConfluence(pair));
    window.addEventListener('confluenceUpdate', handler);
    return () => window.removeEventListener('confluenceUpdate', handler);
  }, [pair]);

  const runFullAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    await Promise.all([runConfluence(), streamForexAnalysis()]);
    setIsAnalyzing(false);
  }, [pair, timeframe, livePrice]);

  // ── Master Confluence ───────────────────────────────────────────────────────
  const runMasterConfluence = async () => {
    setIsMasterRunning(true); setMasterResult(''); setMasterSaved(false);
    const conf = getMasterConfluence(pair); setMasterConf(conf);
    try {
      const text = await alchemistConfluenceAI(pair, livePrice, conf.technicalBias || 'Not analyzed', conf.fundamentalBias || 'Not analyzed', conf.cotBias || 'Not analyzed', conf.sentimentBias || 'Not analyzed', `Sources: ${conf.sources.length}. Score: ${conf.score}/100.`);
      setMasterResult(text);
      const biasMatch = text.match(/(Strongly Bullish|Bullish|Strongly Bearish|Bearish|Neutral)/i);
      const bias = (biasMatch?.[1] || conf.overallBias) as PageAnalysis['bias'];
      savePageAnalysis({ page: 'alchemist', pair, bias, score: conf.score, confidence: Math.min(100, conf.sources.length * 25), summary: `Alchemist: ${bias} (${conf.sources.length} sources, ${conf.score})`, timestamp: Date.now(), raw: text });
      setMasterSaved(true);
    } catch (e: any) { setMasterResult(`⚠️ ${e.message}`); }
    setIsMasterRunning(false);
  };

  // ── Confluence ──────────────────────────────────────────────────────────────
  const runConfluence = async () => {
    setIsConfluenceLoading(true); setScore(0);
    try {
      const res = await fetch('/api/analysis/confluence', { method: 'POST', headers: getAIHeaders(), body: JSON.stringify({ pair, timeframe, price: livePrice }) });
      const data = await res.json();
      setConfluenceData(data);
      // Broadcast every server-measured source into the cross-page store.
      // This keeps Master Confluence factual and removes the old
      // "Not analyzed" placeholders after every fresh scan.
      const pageBias = (value: string): PageAnalysis['bias'] => {
        const normalized = String(value || '').toUpperCase();
        if (normalized === 'BULLISH') return 'Bullish';
        if (normalized === 'BEARISH') return 'Bearish';
        return 'Neutral';
      };
      (data.sourceSignals || []).forEach((source: any) => {
        savePageAnalysis({
          page: source.page,
          pair,
          bias: pageBias(source.bias),
          score: Number(source.score) || 50,
          confidence: Number(source.confidence) || 0,
          summary: `${source.summary || 'Measured source scan completed.'} · ${source.dataSource || 'Live source'}`,
          timestamp: Date.now(),
          raw: JSON.stringify(source),
        });
      });
      setMasterConf(getMasterConfluence(pair));
      let current = 0; const target = data.score || 0;
      const iv = setInterval(() => { current += 3; if (current >= target) { setScore(target); clearInterval(iv); } else setScore(current); }, 16);
    } catch (e) { console.error('Confluence failed', e); }
    setIsConfluenceLoading(false);
  };

  // ── Streaming analysis ──────────────────────────────────────────────────────
  const streamForexAnalysis = async () => {
    setIsAnalysisStreaming(true); setAnalysisText(''); setActiveTab('analysis');
    try {
      const res = await fetch('/api/analysis/forex', { method: 'POST', headers: getAIHeaders(), body: JSON.stringify({ pair, timeframe, price: livePrice }) });
      if (!res.body) throw new Error('No stream body');
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { const d = JSON.parse(line.slice(6)); if (d.done) { setIsAnalysisStreaming(false); return; } if (d.content) setAnalysisText(prev => prev + d.content); } catch {}
          }
        }
      }
    } catch (e) { console.error('Analysis stream failed', e); }
    setIsAnalysisStreaming(false);
  };

  // ── Chat ────────────────────────────────────────────────────────────────────
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatStreaming || !conversationId) return;
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    const input = chatInput; setChatInput(''); setIsChatStreaming(true);
    if (selectedModel === 'alchemist') {
      const started = performance.now();
      try {
        const context = `[${pair} ${timeframe}${livePrice > 0 ? ` · live price ${formatPriceForSymbol(pair, livePrice)}` : ''}]\n\n${input}`;
        const response = await fetch('/api/alchemist/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'alchemist',
            messages: [...chatMessages.filter(message => message.id !== 'welcome').map(message => ({ role: message.role, content: message.content })), { role: 'user', content: context }],
            temperature: 0.35,
            maxTokens: 1200,
          }),
        });
        const data = await response.json() as { response?: string; model?: string; latency?: number; error?: string };
        if (!response.ok) throw new Error(data.error || 'Alchemist request failed');
        setChatMessages(prev => [...prev, { id: `alchemist-${Date.now()}`, role: 'assistant', content: data.response || 'No response returned.' }]);
        setLastLatency(data.latency ?? Math.round(performance.now() - started));
        setActiveProvider(data.model === 'claude' ? 'Claude · Fallback' : 'Alchemist AI · Custom');
        setAlchemistStatus(data.model === 'claude' ? 'offline' : 'online');
        setMemoryCount(prev => prev + 1);
      } catch (error) {
        setChatMessages(prev => [...prev, { id: `alchemist-error-${Date.now()}`, role: 'assistant', content: `⚠️ ${error instanceof Error ? error.message : 'Alchemist request failed'}` }]);
      } finally {
        setIsChatStreaming(false);
      }
      return;
    }
    const streamingId = 'streaming-' + Date.now();
    setChatMessages(prev => [...prev, { id: streamingId, role: 'assistant', content: '' }]);
    try {
      const priceCtx = livePrice > 0 ? ` (Live: ${pair}=${formatPriceForSymbol(pair, livePrice)})` : '';
      const res = await fetch(`/api/anthropic/conversations/${conversationId}/messages`, {
        method: 'POST', headers: getAIHeaders(),
        body: JSON.stringify({ content: `[${pair} ${timeframe}${priceCtx}]\n\n${input}` }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let full = ''; let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.slice(6));
              if (d.done) { setIsChatStreaming(false); if (d.provider) setActiveProvider(d.provider); setMemoryCount(prev => prev + 1); return; }
              if (d.content) { full += d.content; setChatMessages(prev => prev.map(m => m.id === streamingId ? { ...m, content: full } : m)); }
            } catch {}
          }
        }
      }
    } catch (e: any) { setChatMessages(prev => prev.map(m => m.id === streamingId ? { ...m, content: `⚠️ ${e.message}` } : m)); }
    setIsChatStreaming(false);
  };

  // ── Multi-pair scanner ──────────────────────────────────────────────────────
  const runScanner = async () => {
    const init: typeof scanResults = {};
    SCANNER_PAIRS.forEach(p => { init[p] = { bias: '—', score: 0, loading: true }; });
    setScanResults({ ...init });
    for (const p of SCANNER_PAIRS) {
      try {
        const res = await fetch('/api/analysis/confluence', { method: 'POST', headers: getAIHeaders(), body: JSON.stringify({ pair: p, timeframe: 'H4', price: prices[p] || 0 }) });
        const data = await res.json();
        setScanResults(prev => ({ ...prev, [p]: { bias: data.bias || 'NEUTRAL', score: data.score || 50, loading: false } }));
      } catch {
        setScanResults(prev => ({ ...prev, [p]: { bias: 'NEUTRAL', score: 50, loading: false } }));
      }
    }
  };

  const biasColor = confluenceData?.bias === 'BULLISH' ? 'text-green-400' : confluenceData?.bias === 'BEARISH' ? 'text-red-400' : 'text-yellow-400';
  const BiasIcon = confluenceData?.bias === 'BULLISH' ? TrendingUp : confluenceData?.bias === 'BEARISH' ? TrendingDown : Minus;
  const signalContext = `Pair: ${pair}. Timeframe: ${timeframe}. Live price: ${livePrice > 0 ? formatPriceForSymbol(pair, livePrice) : 'unavailable'}. Current bias: ${confluenceData?.bias || 'not measured'}. Confluence score: ${confluenceData?.score ?? 'not measured'}/100. Summary: ${confluenceData?.summary || 'no summary returned'}. Trade idea: ${confluenceData?.tradeIdea ? JSON.stringify(confluenceData.tradeIdea) : 'none returned'}.`;
  const presetPrompts: [string, string][] = [
    ['Analyze COT', `Analyze the current COT signal using the actual dashboard context below. ${signalContext} Explain each positioning condition, grade, direction, institutional logic, and what would invalidate the read. Separate weekly context from entry timing.`],
    ['SMC XAUUSD', `Perform a structured SMC analysis for the current XAUUSD context using the actual live data below. ${signalContext} Identify likely liquidity, OB/FVG structure, entry confirmation, stop, target, risk/reward, and confidence. If the data is insufficient, say so.`],
    ['COT + SMC', `Integrate the current COT context and SMC framework instead of analyzing them separately. ${signalContext} Explain where the methods align, where they conflict, the evidence count, and the conservative no-trade condition.`],
    ['Explain grade', `Explain the current signal grade using only the actual app context below. ${signalContext} Identify which conditions appear confirmed, which are missing, the institutional rationale, and the invalidation rule. Do not give financial advice.`],
  ];

  const TABS: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'analysis', label: 'Analysis', icon: BarChart2 },
    { id: 'chat', label: 'Chat', icon: Brain },
    { id: 'intel', label: 'Intel', icon: Newspaper },
    { id: 'risk', label: 'Risk', icon: ShieldCheck },
    { id: 'master', label: 'Confluence', icon: Layers },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden relative bg-black">
      <NeuralGrid />

      {/* ── CINEMATIC HEADER ─────────────────────────────────────────────── */}
      <div className="relative shrink-0 border-b border-[rgba(212,175,55,0.2)]"
        style={{ background: 'linear-gradient(135deg, rgba(18,14,5,0.95) 0%, rgba(8,6,2,0.98) 100%)' }}>

        {/* Top ticker strip */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[rgba(212,175,55,0.08)] overflow-hidden">
          <div className="flex items-center gap-1.5 shrink-0">
            <motion.div className="w-1.5 h-1.5 rounded-full bg-green-400"
              animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
            <span className="text-[9px] text-green-400 font-bold tracking-widest uppercase">Live</span>
          </div>
          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
            {PAIRS.slice(0, 8).map(p => {
              const px = prices[p] || 0;
              return (
                <button key={p} onClick={() => setPair(p)}
                  className={`flex items-center gap-1.5 shrink-0 transition-colors ${p === pair ? 'text-[var(--gold)]' : 'text-gray-500 hover:text-gray-300'}`}>
                  <span className="text-[10px] font-bold">{p}</span>
                  {px > 0 && <span className="text-[10px] font-mono">{formatPriceForSymbol(p, px)}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main header row */}
        <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative">
              <motion.div
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-[rgba(212,175,55,0.4)]"
                style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.2), transparent)' }}
                animate={{ boxShadow: ['0 0 8px rgba(212,175,55,0.3)', '0 0 20px rgba(212,175,55,0.6)', '0 0 8px rgba(212,175,55,0.3)'] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Brain className="w-4 h-4 text-[var(--gold)]" />
              </motion.div>
            </div>
            <div>
              <h1 className="font-serif font-bold text-sm tracking-[0.2em] text-[var(--gold)] uppercase">Alchemist AI</h1>
              <div className="flex items-center gap-1.5">
                <Cpu className="w-2.5 h-2.5 text-gray-600" />
                <span className="text-[9px] text-gray-600 font-mono">{activeProvider}</span>
              </div>
            </div>
          </div>

          <div className="w-px h-6 bg-[rgba(212,175,55,0.15)] shrink-0" />

          {/* Pair selector */}
          <div className="relative shrink-0">
            <select value={pair} onChange={e => setPair(e.target.value)}
              className="appearance-none bg-black/60 border border-[rgba(212,175,55,0.25)] rounded-lg px-3 py-1.5 pr-7 text-white text-sm font-bold focus:outline-none focus:border-[var(--gold)] cursor-pointer">
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--gold)] pointer-events-none" />
          </div>

          {/* Timeframes */}
          <div className="flex gap-0.5 bg-black/40 rounded-lg p-0.5 border border-[rgba(212,175,55,0.1)]">
            {TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${timeframe === tf ? 'bg-[var(--gold)] text-black shadow-[0_0_8px_rgba(212,175,55,0.4)]' : 'text-gray-500 hover:text-white'}`}>
                {tf}
              </button>
            ))}
          </div>

          {/* Live price badge */}
          {livePrice > 0 && (
            <motion.div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.06)] shrink-0"
              animate={{ borderColor: ['rgba(212,175,55,0.3)', 'rgba(212,175,55,0.6)', 'rgba(212,175,55,0.3)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Signal className="w-3 h-3 text-[var(--gold)]" />
              <span className="text-sm font-mono font-bold text-[var(--gold)]">{formatPriceForSymbol(pair, livePrice)}</span>
            </motion.div>
          )}

          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {analysisText && (
              <button onClick={() => exportAnalysisPDF(pair, analysisText, livePrice)}
                className="flex items-center gap-1.5 border border-[rgba(212,175,55,0.3)] text-[var(--gold)] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[rgba(212,175,55,0.08)] transition-colors">
                <Download className="w-3 h-3" /> PDF
              </button>
            )}
            <motion.button
              onClick={runFullAnalysis}
              disabled={isAnalyzing}
              className="relative flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold disabled:opacity-60 overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isAnalyzing && (
                <motion.div className="absolute inset-0 opacity-30"
                  style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)' }}
                  animate={{ x: ['-100%', '200%'] }} transition={{ duration: 1, repeat: Infinity }} />
              )}
              <RefreshCcw className={`w-3.5 h-3.5 text-black ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span className="text-black">{isAnalyzing ? 'ANALYZING...' : 'ANALYZE'}</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Chart */}
        <div className="flex-1 min-w-0 relative">
          <TradingViewAdvancedChart symbol={pair} interval={timeframe} showSideToolbar={true} className="w-full h-full" />

          {/* Floating key levels overlay */}
          {confluenceData?.keyLevels && (
            <div className="absolute top-3 left-3 flex flex-col gap-1 z-10 pointer-events-none">
              {[
                { label: 'R2', value: confluenceData.keyLevels.resistance2, col: 'text-red-400 bg-red-900/40 border-red-500/30' },
                { label: 'R1', value: confluenceData.keyLevels.resistance1, col: 'text-orange-400 bg-orange-900/40 border-orange-500/30' },
                { label: 'PP', value: confluenceData.keyLevels.pivotPoint, col: 'text-yellow-400 bg-yellow-900/40 border-yellow-500/30' },
                { label: 'S1', value: confluenceData.keyLevels.support1, col: 'text-green-400 bg-green-900/40 border-green-500/30' },
                { label: 'S2', value: confluenceData.keyLevels.support2, col: 'text-emerald-400 bg-emerald-900/40 border-emerald-500/30' },
              ].filter(l => l.value && l.value !== '—').map(l => (
                <div key={l.label} className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-mono font-bold backdrop-blur ${l.col}`}>
                  <span className="opacity-60 text-[9px]">{l.label}</span>
                  <span>{l.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Bias chip overlay */}
          {confluenceData?.bias && (
            <div className="absolute top-3 right-3 z-10">
              <motion.div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold backdrop-blur ${
                  confluenceData.bias === 'BULLISH' ? 'bg-green-900/60 border-green-500/40 text-green-400' :
                  confluenceData.bias === 'BEARISH' ? 'bg-red-900/60 border-red-500/40 text-red-400' :
                  'bg-yellow-900/60 border-yellow-500/40 text-yellow-400'
                }`}
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              >
                <BiasIcon className="w-3 h-3" />
                {confluenceData.bias}
              </motion.div>
            </div>
          )}
        </div>

        {/* RIGHT: AI Panel */}
        <div className="w-[360px] shrink-0 flex flex-col border-l border-[rgba(212,175,55,0.15)] relative"
          style={{ background: 'linear-gradient(180deg, rgba(8,6,2,0.98) 0%, rgba(6,5,2,1) 100%)' }}>

          {/* Confluence strip */}
          <div className="shrink-0 border-b border-[rgba(212,175,55,0.1)] overflow-y-auto max-h-[200px] custom-scrollbar">
            <div className="p-3">
              <div className="flex items-center gap-3 mb-2">
                <SignalGauge score={score} size={56} />
                <div className="flex-1 min-w-0">
                  <div className={`flex items-center gap-1.5 font-bold text-base ${biasColor}`}>
                    <BiasIcon className="w-4 h-4 shrink-0" />
                    {confluenceData?.bias || '—'}
                    {isConfluenceLoading && <RefreshCcw className="w-3 h-3 animate-spin text-gray-600 ml-1" />}
                  </div>
                  {confluenceData?.tradeIdea?.grade && (
                    <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold mr-1 mt-0.5 ${
                      confluenceData.tradeIdea.grade === 'A+' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                      confluenceData.tradeIdea.grade === 'A' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                    }`}>{confluenceData.tradeIdea.grade} SETUP</span>
                  )}
                  <p className="text-[10px] text-gray-600 mt-0.5 truncate">{confluenceData?.summary?.slice(0, 60) || 'Run analysis to load confluence'}</p>
                </div>
                <button onClick={runConfluence} disabled={isConfluenceLoading} className="p-1.5 rounded hover:bg-[rgba(212,175,55,0.1)] transition-colors shrink-0 disabled:opacity-40">
                  <RefreshCcw className={`w-3 h-3 text-[var(--gold)] ${isConfluenceLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Factor bars */}
              {confluenceData?.factors && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {[
                    { key: 'structure', label: 'Structure' },
                    { key: 'orderBlocks', label: 'OB' },
                    { key: 'fvg', label: 'FVG' },
                    { key: 'liquidity', label: 'Liquidity' },
                    { key: 'momentum', label: 'Momentum' },
                    { key: 'fundamentals', label: 'Fundamentals' },
                  ].map(f => {
                    const v = confluenceData.factors[f.key] ?? 0;
                    const bc = v >= 70 ? 'bg-green-500' : v >= 50 ? 'bg-[var(--gold)]' : 'bg-red-500';
                    return (
                      <div key={f.key}>
                        <div className="flex justify-between text-[9px] text-gray-600 mb-0.5">
                          <span>{f.label}</span><span className="font-mono text-white">{v}%</span>
                        </div>
                        <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full ${bc} transition-all duration-700`} style={{ width: `${v}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[rgba(212,175,55,0.1)] shrink-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 flex flex-col items-center py-2 text-[9px] font-bold tracking-wide transition-colors relative ${
                  activeTab === t.id ? 'text-[var(--gold)]' : 'text-gray-600 hover:text-gray-400'
                }`}>
                {activeTab === t.id && (
                  <motion.div layoutId="alc-tab-ind" className="absolute bottom-0 left-0 right-0 h-px bg-[var(--gold)]"
                    style={{ boxShadow: '0 0 6px rgba(212,175,55,0.6)' }} />
                )}
                <t.icon className="w-3.5 h-3.5 mb-0.5" />
                {t.label}
                {t.id === 'chat' && memoryCount > 0 && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[var(--gold)] text-black text-[8px] font-bold flex items-center justify-center">{memoryCount > 9 ? '9+' : memoryCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <AnimatePresence mode="wait">

              {/* ── ANALYSIS TAB ── */}
              {activeTab === 'analysis' && (
                <motion.div key="analysis" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex-1 overflow-y-auto p-3 custom-scrollbar" ref={analysisRef}>

                  {isAnalysisStreaming && !analysisText && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="relative w-16 h-16 mb-4">
                        <div className="absolute inset-0 rounded-full border border-[rgba(212,175,55,0.1)]" />
                        <div className="absolute inset-0 rounded-full border-t-2 border-[var(--gold)] animate-spin" />
                        <div className="absolute inset-2 rounded-full border-r border-[rgba(212,175,55,0.3)] animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
                        <Brain className="absolute inset-0 m-auto w-5 h-5 text-[var(--gold)]" />
                      </div>
                      <p className="text-xs text-[var(--gold)] font-mono animate-pulse tracking-widest">NEURAL ANALYSIS RUNNING</p>
                      <p className="text-[10px] text-gray-700 mt-1">{activeProvider}</p>
                    </div>
                  )}

                  {analysisText && (
                    <>
                      {/* Trade idea quick panel */}
                      {confluenceData?.tradeIdea && confluenceData.tradeIdea.entry !== '—' && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                          className="mb-3 p-3 rounded-xl border border-[rgba(212,175,55,0.2)] bg-[rgba(212,175,55,0.04)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Trade Signal</span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${confluenceData.tradeIdea.direction === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {confluenceData.tradeIdea.direction}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                            {[
                              { label: 'ENTRY', value: confluenceData.tradeIdea.entry, col: 'text-white' },
                              { label: 'STOP', value: confluenceData.tradeIdea.stopLoss, col: 'text-red-400' },
                              { label: 'TP', value: confluenceData.tradeIdea.takeProfit, col: 'text-green-400' },
                              { label: 'R:R', value: confluenceData.tradeIdea.riskReward, col: 'text-[var(--gold)]' },
                            ].map(item => (
                              <div key={item.label} className="bg-black/30 rounded-lg p-1.5">
                                <span className="block text-[8px] text-gray-600 mb-0.5">{item.label}</span>
                                <span className={`font-mono font-bold ${item.col}`}>{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed
                        prose-headings:text-[var(--gold)] prose-headings:font-bold prose-headings:text-xs prose-headings:tracking-wide
                        prose-strong:text-white prose-code:text-[var(--gold)] prose-hr:border-[rgba(212,175,55,0.15)]">
                        <ReactMarkdown>{analysisText}</ReactMarkdown>
                        {isAnalysisStreaming && <span className="animate-pulse text-[var(--gold)] ml-1">▌</span>}
                      </div>
                    </>
                  )}

                  {!analysisText && !isAnalysisStreaming && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                      <motion.div
                        animate={{ rotate: [0, 360] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                        className="w-16 h-16 rounded-full border border-dashed border-[rgba(212,175,55,0.2)] flex items-center justify-center mb-4">
                        <Target className="w-6 h-6 text-[rgba(212,175,55,0.3)]" />
                      </motion.div>
                      <p className="text-xs text-gray-600 font-mono tracking-wider">AWAITING ACTIVATION</p>
                      <p className="text-[10px] text-gray-700 mt-2">Press ANALYZE to run full SMC analysis</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── CHAT TAB ── */}
              {activeTab === 'chat' && (
                <motion.div key="chat" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex-1 flex flex-col overflow-hidden">

                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[rgba(212,175,55,0.08)] shrink-0">
                    <div className="flex items-center gap-1.5">
                      <motion.div title={lastLatency !== null ? `Last health check: ${lastLatency} ms` : 'Alchemist health status'} className={`w-1.5 h-1.5 rounded-full ${alchemistStatus === 'online' ? 'bg-green-400' : 'bg-red-400'}`}
                        animate={alchemistStatus === 'online' ? { opacity: [1, 0.4, 1] } : {}} transition={{ duration: 1.5, repeat: Infinity }} />
                      <span className="text-[9px] text-gray-600">{memoryCount > 0 ? `${memoryCount} turns in memory` : 'New session'}</span>
                      <span className={`text-[9px] font-mono ${alchemistStatus === 'online' ? 'text-green-400' : 'text-red-400'}`}>{alchemistStatus.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <select value={selectedModel} onChange={e => setSelectedModel(e.target.value as 'alchemist' | 'claude')}
                        className="rounded border border-[rgba(212,175,55,0.18)] bg-black/60 px-1.5 py-1 text-[9px] text-gray-400 focus:outline-none focus:border-[var(--gold)]">
                        <option value="alchemist">Alchemist AI (Custom)</option>
                        <option value="claude">Claude (Fallback)</option>
                      </select>
                      {lastLatency !== null && <span className="px-1 text-[9px] font-mono text-gray-600">{lastLatency}ms</span>}
                      <div className="relative">
                        <button onClick={() => { setShowConvList(v => !v); loadConversations(); }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-gray-600 hover:text-[var(--gold)] hover:bg-[rgba(212,175,55,0.05)] transition-colors">
                          <Clock className="w-3 h-3" /> History
                        </button>
                        {showConvList && (
                          <div className="absolute right-0 top-full mt-1 w-60 rounded-xl border border-[rgba(212,175,55,0.2)] shadow-2xl z-50 overflow-hidden"
                            style={{ background: 'rgba(8,6,2,0.98)' }}>
                            <div className="px-3 py-2 border-b border-[rgba(212,175,55,0.1)] flex items-center justify-between">
                              <span className="text-[10px] font-bold text-[var(--gold)]">Sessions</span>
                              <button onClick={() => setShowConvList(false)} className="text-gray-600 hover:text-white text-xs">✕</button>
                            </div>
                            <div className="max-h-44 overflow-y-auto">
                              {conversations.length === 0 && <p className="text-[10px] text-gray-700 text-center py-4">No sessions yet</p>}
                              {conversations.map(conv => (
                                <button key={conv.id} onClick={() => handleSwitchConversation(conv.id)}
                                  className={`w-full text-left px-3 py-2 hover:bg-[rgba(212,175,55,0.04)] transition-colors border-b border-[rgba(255,255,255,0.02)] group flex items-center justify-between ${conv.id === conversationId ? 'bg-[rgba(212,175,55,0.06)]' : ''}`}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-white truncate">{conv.title}</p>
                                    <p className="text-[9px] text-gray-700">{new Date(conv.createdAt).toLocaleDateString()}</p>
                                  </div>
                                  <button onClick={(e) => handleDeleteConversation(conv.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:text-red-400">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <button onClick={handleNewChat}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-gray-600 hover:text-[var(--gold)] hover:bg-[rgba(212,175,55,0.05)] transition-colors">
                        <Plus className="w-3 h-3" /> New
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto border-b border-[rgba(212,175,55,0.06)] px-3 py-2">
                    {presetPrompts.map(([label, prompt]) => (
                      <button key={label} type="button" onClick={() => { setChatInput(prompt); setActiveTab('chat'); pendingPrefillRef.current = prompt; window.setTimeout(() => chatFormRef.current?.requestSubmit(), 0); }}
                        className="shrink-0 rounded border border-white/10 px-2 py-1 text-[9px] text-gray-500 transition hover:border-[var(--gold)] hover:text-[var(--gold)]">{label}</button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
                    {chatMessages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[88%] rounded-xl p-2.5 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-br from-[#d4af37] to-[#b8962e] text-black rounded-tr-none font-medium'
                            : 'bg-[rgba(212,175,55,0.06)] border border-[rgba(212,175,55,0.12)] text-gray-200 rounded-tl-none'
                        }`}>
                          {msg.role === 'assistant' ? (
                            <div className="prose prose-invert prose-xs max-w-none prose-headings:text-[var(--gold)] prose-headings:text-xs prose-strong:text-white">
                              <ReactMarkdown>{msg.content || (isChatStreaming ? '▌' : '')}</ReactMarkdown>
                            </div>
                          ) : msg.content}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <form ref={chatFormRef} onSubmit={handleSendChat} className="p-3 border-t border-[rgba(212,175,55,0.1)] flex gap-2 shrink-0">
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                      placeholder="Ask Alchemist anything..." disabled={isChatStreaming}
                      className="flex-1 bg-black/60 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[rgba(212,175,55,0.5)] transition-colors disabled:opacity-50 placeholder-gray-700" />
                    <button type="submit" disabled={isChatStreaming || !chatInput.trim() || !conversationId}
                      className="w-8 h-8 rounded-xl bg-[var(--gold)] flex items-center justify-center hover:bg-yellow-400 disabled:opacity-40 transition-all">
                      <Send className="w-3.5 h-3.5 text-black" />
                    </button>
                  </form>
                  {isChatStreaming && (
                    <p className="text-[9px] text-[var(--gold)] pb-2 text-center animate-pulse tracking-widest">NEURAL CORE PROCESSING...</p>
                  )}
                </motion.div>
              )}

              {/* ── INTEL TAB ── */}
              {activeTab === 'intel' && (
                <motion.div key="intel" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex-1 overflow-y-auto custom-scrollbar">

                  {/* Multi-pair scanner */}
                  <div className="p-3 border-b border-[rgba(212,175,55,0.08)]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Radar className="w-3.5 h-3.5 text-[var(--gold)]" />
                        <span className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-widest">Market Scanner</span>
                      </div>
                      <button onClick={runScanner}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.2)] text-[9px] font-bold text-[var(--gold)] hover:bg-[rgba(212,175,55,0.15)] transition-colors">
                        <ScanLine className="w-2.5 h-2.5" /> SCAN
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {SCANNER_PAIRS.map(p => {
                        const r = scanResults[p];
                        const px = prices[p] || 0;
                        return (
                          <button key={p} onClick={() => setPair(p)}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all hover:border-[rgba(212,175,55,0.3)] ${p === pair ? 'border-[rgba(212,175,55,0.3)] bg-[rgba(212,175,55,0.05)]' : 'border-[rgba(255,255,255,0.04)] bg-black/20'}`}>
                            <span className="text-xs font-bold text-white w-16 text-left shrink-0">{p}</span>
                            {px > 0 && <span className="text-[10px] font-mono text-gray-500 flex-1 text-left">{formatPriceForSymbol(p, px)}</span>}
                            {r?.loading ? (
                              <div className="w-12 h-1 bg-[rgba(212,175,55,0.1)] rounded-full animate-pulse" />
                            ) : r ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="w-8 h-1 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${r.bias === 'BULLISH' ? 'bg-green-500' : r.bias === 'BEARISH' ? 'bg-red-500' : 'bg-yellow-500'}`}
                                    style={{ width: `${r.score}%` }} />
                                </div>
                                <span className={`text-[9px] font-bold ${r.bias === 'BULLISH' ? 'text-green-400' : r.bias === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {r.bias}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[9px] text-gray-700">—</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Economic calendar */}
                  <div className="p-3 border-b border-[rgba(212,175,55,0.08)]">
                    <div className="flex items-center gap-1.5 mb-2">
                      <CalendarDays className="w-3.5 h-3.5 text-[var(--gold)]" />
                      <span className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-widest">Economic Calendar</span>
                      <span className="text-[9px] text-gray-600 ml-1">{selectedDate}</span>
                    </div>
                    <div className="space-y-1.5">
                      {ECONOMIC_EVENTS.map((ev, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/20 border border-[rgba(255,255,255,0.03)]">
                          <span className="text-[9px] font-mono text-gray-600 w-10 shrink-0">{ev.time}</span>
                          <div className="flex gap-0.5 shrink-0">
                            {[1,2,3].map(n => (
                              <div key={n} className={`w-1.5 h-3 rounded-sm ${n <= ev.impact ? 'bg-[var(--gold)]' : 'bg-[rgba(212,175,55,0.1)]'}`} />
                            ))}
                          </div>
                          <span className="text-[9px] font-bold text-gray-400 w-8 shrink-0">{ev.currency}</span>
                          <span className="text-[10px] text-white flex-1 truncate">{ev.event}</span>
                          <div className="flex gap-2 text-[9px] font-mono shrink-0">
                            <span className="text-[var(--gold)]">{ev.forecast}</span>
                            <span className="text-gray-600">{ev.prev}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* News */}
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Newspaper className="w-3.5 h-3.5 text-[var(--gold)]" />
                      <span className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-widest">Market Intelligence</span>
                    </div>
                    <div className="space-y-2">
                      {newsItems.map((item, i) => (
                        <motion.div key={i}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                          className="p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)] bg-black/20 hover:border-[rgba(212,175,55,0.15)] transition-colors cursor-pointer">
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.sentiment === 'BULL' ? 'bg-green-400' : item.sentiment === 'BEAR' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-gray-300 leading-snug">{item.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] text-gray-600">{item.source}</span>
                                <span className="text-[9px] text-gray-700">·</span>
                                <span className="text-[9px] text-gray-600">{item.time}</span>
                                <span className={`ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded ${item.sentiment === 'BULL' ? 'bg-green-500/10 text-green-400' : item.sentiment === 'BEAR' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                  {item.sentiment}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── RISK TAB ── */}
              {activeTab === 'risk' && (
                <motion.div key="risk" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">

                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[var(--gold)]" />
                    <span className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-widest">Precision Risk Engine</span>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[9px] text-gray-600 block mb-1 uppercase tracking-widest">Account Balance</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">$</span>
                        <input type="number" value={balance} onChange={e => setBalance(e.target.value)}
                          className="w-full bg-black border border-gray-800 rounded-xl pl-7 pr-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[rgba(212,175,55,0.5)] transition-colors" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[9px] mb-1">
                        <span className="text-gray-600 uppercase tracking-widest">Risk Per Trade</span>
                        <span className={`font-bold font-mono ${Number(riskPercent) > 2 ? 'text-red-400' : 'text-[var(--gold)]'}`}>{riskPercent}%</span>
                      </div>
                      <input type="range" min="0.25" max="5" step="0.25" value={riskPercent} onChange={e => setRiskPercent(e.target.value)}
                        className="w-full accent-[var(--gold)]" />
                      <div className="flex justify-between text-[9px] text-gray-700 mt-0.5">
                        <span>Conservative 0.25%</span><span>Aggressive 5%</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] text-gray-600 block mb-1 uppercase tracking-widest">Stop Loss (Pips)</label>
                      <input type="number" value={stopLossPips} onChange={e => setStopLossPips(e.target.value)}
                        className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[rgba(212,175,55,0.5)] transition-colors" />
                    </div>
                  </div>

                  {/* Output cards */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'AT RISK', value: `$${dollarRisk.toFixed(2)}`, col: 'text-red-400', bg: 'bg-red-900/10 border-red-500/20' },
                      { label: 'LOT SIZE', value: lotSize.toFixed(2), col: 'text-white', bg: 'bg-[rgba(212,175,55,0.06)] border-[rgba(212,175,55,0.2)]' },
                      { label: 'TP PIPS (2:1)', value: tp.toFixed(0), col: 'text-green-400', bg: 'bg-green-900/10 border-green-500/20' },
                      { label: 'POTENTIAL', value: `$${(dollarRisk * 2).toFixed(2)}`, col: 'text-green-400', bg: 'bg-green-900/10 border-green-500/20' },
                    ].map(c => (
                      <div key={c.label} className={`rounded-xl border p-3 text-center ${c.bg}`}>
                        <span className="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">{c.label}</span>
                        <span className={`text-base font-bold font-mono ${c.col}`}>{c.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Lot breakdown */}
                  <div className="flex gap-2">
                    {[['STANDARD', lotSize.toFixed(2)], ['MINI', (lotSize * 10).toFixed(1)], ['MICRO', (lotSize * 100).toFixed(0)]].map(([l, v]) => (
                      <div key={l} className="flex-1 bg-black/40 rounded-xl p-2.5 border border-[rgba(255,255,255,0.04)] text-center">
                        <span className="block text-[8px] text-gray-600 mb-1">{l}</span>
                        <span className="font-mono font-bold text-white text-xs">{v}</span>
                      </div>
                    ))}
                  </div>

                  {Number(riskPercent) > 2 && (
                    <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                      className="flex items-center gap-2 p-2.5 bg-red-900/20 border border-red-500/30 rounded-xl text-[10px] text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Risk above 2% — Alchemist protocol requires max 1% (2% for A+ setups only)
                    </motion.div>
                  )}

                  {confluenceData?.tradeIdea?.stopLoss && confluenceData.tradeIdea.stopLoss !== '—' && (
                    <div className="p-3 rounded-xl border border-[rgba(212,175,55,0.15)] bg-[rgba(212,175,55,0.04)]">
                      <div className="flex items-center gap-1.5 mb-2 text-[var(--gold)] font-bold text-[10px]">
                        <Zap className="w-3 h-3" /> AI TRADE SIGNAL
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <span className="text-gray-500">Direction: <span className={confluenceData.tradeIdea.direction === 'BUY' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{confluenceData.tradeIdea.direction}</span></span>
                        <span className="text-gray-500">R:R: <span className="text-[var(--gold)] font-bold">{confluenceData.tradeIdea.riskReward}</span></span>
                        <span className="text-gray-500">Entry: <span className="text-white font-mono">{confluenceData.tradeIdea.entry}</span></span>
                        <span className="text-gray-500">Probability: <span className="text-white font-bold">{confluenceData.tradeIdea.probability}%</span></span>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── MASTER CONFLUENCE TAB ── */}
              {activeTab === 'master' && (
                <motion.div key="master" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-3">

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[var(--gold)]" />
                      <span className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-widest">Multi-Source Confluence</span>
                    </div>
                    <button onClick={() => setMasterConf(getMasterConfluence(pair))} className="p-1 rounded hover:bg-white/5">
                      <RefreshCcw className="w-3 h-3 text-gray-600" />
                    </button>
                  </div>

                  {masterConf && (
                    <div className="rounded-xl border border-[rgba(212,175,55,0.2)] bg-black/40 p-3">
                      <div className="flex items-center gap-3 mb-3">
                        <SignalGauge score={masterConf.score} size={52} />
                        <div>
                          <div className={`font-bold text-sm ${masterConf.score >= 70 ? 'text-green-400' : masterConf.score >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>{masterConf.overallBias}</div>
                          <div className="text-[9px] text-gray-600">{masterConf.sources.length} source{masterConf.sources.length !== 1 ? 's' : ''} · {pair}</div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {[
                          { key: 'technical', label: '📈 Technical SMC', value: masterConf.technicalBias },
                          { key: 'fundamental', label: '🌍 Fundamental', value: masterConf.fundamentalBias },
                          { key: 'cot', label: '📊 COT Flow', value: masterConf.cotBias },
                          { key: 'sentiment', label: '👥 Sentiment', value: masterConf.sentimentBias },
                        ].map(src => {
                          const bias = src.value || '';
                          const col = bias.includes('Bullish') ? 'text-green-400 bg-green-500/10 border-green-500/20' : bias.includes('Bearish') ? 'text-red-400 bg-red-500/10 border-red-500/20' : bias ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' : 'text-gray-700 bg-white/3 border-white/5';
                          return (
                            <div key={src.key} className="flex items-center justify-between gap-2">
                              <span className="text-[9px] text-gray-600">{src.label}</span>
                              <span className={`text-[8px] font-bold px-2 py-0.5 rounded border ${col}`}>{bias || 'Not analyzed'}</span>
                            </div>
                          );
                        })}
                      </div>
                      {masterConf.sources.length === 0 && (
                        <p className="text-[9px] text-gray-700 text-center mt-2">Run analysis on other pages to populate confluence data</p>
                      )}
                    </div>
                  )}

                  <motion.button onClick={runMasterConfluence} disabled={isMasterRunning}
                    className="w-full relative flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs disabled:opacity-50 overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.9), rgba(184,150,46,0.9))' }}
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    {isMasterRunning && (
                      <motion.div className="absolute inset-0 opacity-40"
                        style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)' }}
                        animate={{ x: ['-100%', '200%'] }} transition={{ duration: 1, repeat: Infinity }} />
                    )}
                    <Sparkles className={`w-3.5 h-3.5 text-black ${isMasterRunning ? 'animate-spin' : ''}`} />
                    <span className="text-black">{isMasterRunning ? 'Synthesizing...' : '🔮 Run Master Confluence AI'}</span>
                  </motion.button>

                  {masterSaved && (
                    <div className="flex items-center gap-2 text-[9px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl p-2">
                      <CheckCircle className="w-3 h-3 shrink-0" />
                      Master verdict saved — broadcast to all pages
                    </div>
                  )}

                  {masterResult && (
                    <div className="rounded-xl border border-[rgba(212,175,55,0.15)] bg-black/40 p-3">
                      <div className="prose prose-invert prose-xs max-w-none text-gray-300 leading-relaxed prose-headings:text-[var(--gold)] prose-headings:text-xs prose-headings:font-bold prose-strong:text-white">
                        <ReactMarkdown>{masterResult}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {!masterResult && !isMasterRunning && (
                    <div className="text-center py-8 text-gray-700">
                      <Globe className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-[10px]">Run analysis on Fundamental & Order Flow pages first, then synthesize</p>
                    </div>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
