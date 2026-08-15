import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Palette, Video, Shield, BellRing, Info, Key, Volume2,
  Check, Eye, EyeOff, ExternalLink, CheckCircle, XCircle, RefreshCcw,
  Cpu, Zap, Brain, Radio, Target, Flame, Globe, Lock, Rocket,
  AlertTriangle, BarChart2, TrendingUp
} from 'lucide-react';

interface ApiProvider {
  id: string; name: string; storageKey: string; description: string
  signupUrl: string; steps: string; placeholder: string; badge: string; badgeColor: string
  testFn?: (key: string) => Promise<boolean>
}

const API_PROVIDERS: ApiProvider[] = [
  { id:'groq', name:'Groq API Key', storageKey:'jjnexus_groq_key', description:'FREE — 14,400 requests/day. Fastest option. Llama 3.3 70B. No credit card needed.', signupUrl:'https://groq.com', steps:'1. groq.com → Sign up free\n2. API Keys → Create API Key\n3. Paste here', placeholder:'gsk_...', badge:'✅ FREE', badgeColor:'#16a34a',
    testFn: async (k) => (await fetch('https://api.groq.com/openai/v1/models',{headers:{Authorization:`Bearer ${k}`}})).ok },
  { id:'openrouter', name:'OpenRouter API Key', storageKey:'jjnexus_openrouter_key', description:'FREE tier — access to many free models including Llama 3.3 70B and others.', signupUrl:'https://openrouter.ai', steps:'1. openrouter.ai → Sign up free\n2. API Keys → Create key\n3. Paste here', placeholder:'sk-or-...', badge:'✅ FREE', badgeColor:'#16a34a',
    testFn: async (k) => (await fetch('https://openrouter.ai/api/v1/models',{headers:{Authorization:`Bearer ${k}`}})).ok },
  { id:'github', name:'GitHub Models Token', storageKey:'jjnexus_github_token', description:'FREE — 150 requests/day. Access Llama 3.3 70B and GPT-4o-mini via GitHub.', signupUrl:'https://github.com/settings/tokens', steps:'1. GitHub → Settings → Developer Settings\n2. Fine-grained tokens → New token\n3. Enable "Models" permission → Generate → Paste here', placeholder:'github_pat_...', badge:'✅ FREE', badgeColor:'#16a34a' },
  { id:'anthropic', name:'Anthropic Claude Key', storageKey:'jjnexus_api_key', description:'Paid — Claude Sonnet with live web search for real-time market data. Best quality.', signupUrl:'https://console.anthropic.com', steps:'1. console.anthropic.com → Sign up\n2. API Keys → Create key\n3. Paste here', placeholder:'sk-ant-...', badge:'💳 PAID', badgeColor:'#d97706',
    testFn: async (k) => (await fetch('https://api.anthropic.com/v1/models',{headers:{'x-api-key':k,'anthropic-version':'2023-06-01'}})).ok },
  { id:'goldapi', name:'Gold API Key', storageKey:'jjnexus_goldapi_key', description:'FREE 100 req/month — accurate XAU/USD real-time gold price feed.', signupUrl:'https://www.goldapi.io', steps:'1. goldapi.io → Sign up free\n2. Copy your API key\n3. Paste here', placeholder:'goldapi-...', badge:'✅ FREE', badgeColor:'#16a34a',
    testFn: async (k) => (await fetch('https://www.goldapi.io/api/XAU/USD',{headers:{'x-access-token':k}})).ok },
]

async function fetchLiveAIStatus(): Promise<{ provider: string; type: string; active: boolean; color: string }> {
  const h: Record<string,string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const grok = localStorage.getItem('jjnexus_grok_key'); if (grok) h['x-grok-key'] = grok;
    const groq = localStorage.getItem('jjnexus_groq_key'); if (groq) h['x-groq-key'] = groq;
    const ant = localStorage.getItem('jjnexus_api_key') || localStorage.getItem('jjnexus_anthropic_key'); if (ant) h['x-anthropic-key'] = ant;
    const or = localStorage.getItem('jjnexus_openrouter_key'); if (or) h['x-openrouter-key'] = or;
    const gh = localStorage.getItem('jjnexus_github_token'); if (gh) h['x-github-token'] = gh;
  }
  try {
    const res = await fetch('/api/analysis/ai-status', { headers: h });
    if (res.ok) return res.json();
  } catch {}
  return { provider: 'Unable to check — try refreshing', type: 'error', active: false, color: '#6b7280' };
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-[#D4AF37]' : 'bg-gray-800 border border-gray-700'}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function ApiProviderCard({ provider }: { provider: ApiProvider }) {
  const [value, setValue] = useState(() => localStorage.getItem(provider.storageKey) || '')
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success'|'fail'|null>(null)
  const isSet = value.length > 8

  const handleSave = () => { localStorage.setItem(provider.storageKey, value); setSaved(true); setTestResult(null); setTimeout(() => setSaved(false), 2000) }
  const handleClear = () => { localStorage.removeItem(provider.storageKey); setValue(''); setTestResult(null) }
  const handleTest = async () => {
    if (!value || !provider.testFn) return; setTesting(true); setTestResult(null)
    try { setTestResult(await provider.testFn(value) ? 'success' : 'fail') } catch { setTestResult('fail') } finally { setTesting(false) }
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(212,175,55,0.12)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-white text-sm">{provider.name}</span>
            <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ color: provider.badgeColor, background: `${provider.badgeColor}22` }}>{provider.badge}</span>
            {isSet && <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="w-3 h-3" />Configured</span>}
          </div>
          <p className="text-xs text-gray-600 mt-1">{provider.description}</p>
        </div>
        <a href={provider.signupUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-[#D4AF37] hover:text-yellow-300 shrink-0 whitespace-nowrap">
          Get Key <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="bg-black/40 rounded-lg px-3 py-2">
        <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{provider.steps}</p>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input type={showKey ? 'text' : 'password'} value={value} onChange={e => setValue(e.target.value)}
            placeholder={provider.placeholder}
            className="w-full bg-black/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#D4AF37] pr-9" />
          <button onClick={() => setShowKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300">
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button onClick={handleSave} disabled={!value}
          className={`px-4 py-2 rounded-lg font-black text-sm flex items-center gap-1 ${saved ? 'bg-green-500 text-white' : 'bg-[#D4AF37] text-black hover:bg-yellow-400 disabled:opacity-40'}`}>
          {saved ? <><Check className="w-3.5 h-3.5" />Saved</> : 'Save'}
        </button>
        {isSet && provider.testFn && (
          <button onClick={handleTest} disabled={testing}
            className="px-3 py-2 rounded-lg border border-[rgba(212,175,55,0.3)] text-[#D4AF37] text-sm hover:bg-[rgba(212,175,55,0.1)] flex items-center gap-1">
            {testing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
          </button>
        )}
        {isSet && (
          <button onClick={handleClear} className="px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10">✕</button>
        )}
      </div>
      {testResult && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${testResult === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {testResult === 'success' ? <><CheckCircle className="w-3.5 h-3.5" />Connection successful!</> : <><XCircle className="w-3.5 h-3.5" />Test failed — check your key</>}
        </div>
      )}
    </div>
  )
}

const FUNNY_QUOTES = [
  "Buy the dip. No seriously. Like right now.",
  "Stop loss is just a limit order for your emotions.",
  "The market is always right (it's you that's wrong).",
  "Risk management is just adulting for traders.",
  "If you're not backtesting, you're gambling with extra steps.",
  "Your entry is only as good as your exit.",
  "Patience is a strategy. Revenge trading is not.",
]

export default function Settings() {
  const [activeSection, setActiveSection] = useState('Profile')
  const [accentColor, setAccentColor] = useState('#D4AF37')
  const [fontSize, setFontSize] = useState(16)
  const [musicVolume, setMusicVolume] = useState(0.3)
  const [alertVolume, setAlertVolume] = useState(0.7)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  const [streamQuality, setStreamQuality] = useState('1080p')
  const [streamFps, setStreamFps] = useState('30')
  const [darkMode, setDarkMode] = useState(true)
  const [liveAIStatus, setLiveAIStatus] = useState<{ provider: string; type: string; active: boolean; color: string }|null>(null)
  const [aiStatusLoading, setAiStatusLoading] = useState(false)
  const [quoteIdx, setQuoteIdx] = useState(0)
  const [tradingStyle, setTradingStyle] = useState(localStorage.getItem('jjnexus_trading_style') || '')
  const [oathChecked, setOathChecked] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [density, setDensity] = useState<'Compact'|'Comfortable'|'Spacious'>('Comfortable')
  const [overlays, setOverlays] = useState({ ticker: true, alerts: true, killzone: true, whispers: false })
  const [riskPct, setRiskPct] = useState(1)
  const [riskRR, setRiskRR] = useState('1:2')
  const [maxDailyLoss, setMaxDailyLoss] = useState(3)
  const [maxTrades, setMaxTrades] = useState(3)
  const [telegramToken, setTelegramToken] = useState(localStorage.getItem('jjnexus_telegram_token') || '')
  const [telegramChatId, setTelegramChatId] = useState(() => { try { const t = JSON.parse(localStorage.getItem('jjnexus_telegram_targets')||'[]'); return t[0]?.id || '' } catch { return '' } })
  const [telegramTesting, setTelegramTesting] = useState(false)
  const [telegramResult, setTelegramResult] = useState<'ok'|'fail'|null>(null)
  const [alertFreq, setAlertFreq] = useState<'every'|'aplus'|'paranoid'>('aplus')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [tgAlertsEnabled, setTgAlertsEnabled] = useState(false)

  const ACCENT_COLORS = [
    { color:'#D4AF37',label:'Gold'},{ color:'#22c55e',label:'Emerald'},{ color:'#ef4444',label:'Red'},
    { color:'#3b82f6',label:'Blue'},{ color:'#a855f7',label:'Purple'},{ color:'#f97316',label:'Orange'},
  ]

  const configuredKeysCount = API_PROVIDERS.filter(p => (localStorage.getItem(p.storageKey) || '').length > 8).length

  useEffect(() => {
    const saved = localStorage.getItem('accentColor') || '#D4AF37'
    setAccentColor(saved); document.documentElement.style.setProperty('--gold', saved)
    const savedFS = localStorage.getItem('fontSize'); if (savedFS) { setFontSize(Number(savedFS)); document.documentElement.style.fontSize = savedFS + 'px' }
    if ('Notification' in window) setNotifPermission(Notification.permission)
    checkAIStatus()
    const t = setInterval(() => setQuoteIdx(q => (q + 1) % FUNNY_QUOTES.length), 8000)
    return () => clearInterval(t)
  }, [])

  const checkAIStatus = async () => {
    setAiStatusLoading(true)
    try { setLiveAIStatus(await fetchLiveAIStatus()) } finally { setAiStatusLoading(false) }
  }

  const handleAccentChange = (c: string) => { setAccentColor(c); document.documentElement.style.setProperty('--gold', c); localStorage.setItem('accentColor', c) }
  const handleFontSize = (n: number) => { setFontSize(n); document.documentElement.style.fontSize = n + 'px'; localStorage.setItem('fontSize', String(n)) }
  const handleBrightness = (n: number) => { setBrightness(n); document.documentElement.style.filter = n === 100 ? '' : `brightness(${n}%)`; localStorage.setItem('jjnexus_brightness', String(n)) }
  const requestNotifications = async () => {
    if (!('Notification' in window)) return
    const p = await Notification.requestPermission(); setNotifPermission(p)
    if (p === 'granted') new Notification('JJ Nexus Pro',{body:'Notifications enabled!',icon:'/jj-trades-logo.jpg'})
  }
  const updateMusicVolume = (v: number) => { setMusicVolume(v); const a = document.getElementById('bg-music') as HTMLAudioElement; if (a) a.volume = v; localStorage.setItem('musicVolume', String(v)) }
  const testAlertSound = () => {
    try {
      const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime); osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(alertVolume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5)
    } catch {}
  }
  const saveTelegram = () => {
    localStorage.setItem('jjnexus_telegram_token', telegramToken)
    if (telegramChatId) localStorage.setItem('jjnexus_telegram_targets', JSON.stringify([{ id: telegramChatId, name: 'Primary' }]))
  }
  const testTelegram = async () => {
    if (!telegramToken || !telegramChatId) return
    setTelegramTesting(true); setTelegramResult(null)
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ chat_id: telegramChatId, text: '🤖 JJ Nexus Pro — Telegram connection test successful! Your sniper alerts will be delivered here.', parse_mode: 'HTML' })
      })
      setTelegramResult(res.ok ? 'ok' : 'fail')
    } catch { setTelegramResult('fail') } finally { setTelegramTesting(false) }
  }
  const nuclearOption = () => {
    const confirmed = window.confirm(
      '☢️ NUCLEAR OPTION ENGAGED\n\nThis will delete ALL configured API keys, settings, and preferences.\n\nYour future self will be extremely disappointed.\n\nAre you absolutely certain?\n\n(This cannot be undone)'
    )
    if (confirmed) {
      const keys = ['accentColor','fontSize','musicVolume','jjnexus_telegram_token','jjnexus_telegram_targets','jjnexus_trading_style','jjnexus_brightness','jjnexus_overlay_ticker','jjnexus_overlay_alerts','jjnexus_overlay_killzone','jjnexus_overlay_whispers','jjnexus_risk_pct','jjnexus_risk_rr','jjnexus_risk_maxloss','jjnexus_risk_maxtrades']
      API_PROVIDERS.forEach(p => keys.push(p.storageKey))
      keys.forEach(k => localStorage.removeItem(k))
      window.location.reload()
    }
  }

  const sections = [
    { label:'Profile',        icon: User,     desc:'Identity & trader profile' },
    { label:'Appearance',     icon: Palette,  desc:'Colors, fonts & layout density' },
    { label:'API & Keys',     icon: Key,      desc:'AI providers & neural network' },
    { label:'Stream Settings',icon: Video,    desc:'Quality, RTMP & overlays' },
    { label:'Audio',          icon: Volume2,  desc:'Music, alerts & voice' },
    { label:'Notifications',  icon: BellRing, desc:'Browser, Telegram & frequency' },
    { label:'Risk Defaults',  icon: Shield,   desc:'Circuit breakers & limits' },
    { label:'About',          icon: Info,     desc:'Version, legal & nuclear' },
  ]

  const cardStyle = { background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.15)' }
  const inputStyle = "w-full bg-black/60 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#D4AF37]"

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-0 h-full">
      {/* Header */}
      <div className="mb-5">
        <h1 className="font-black text-3xl tracking-[0.12em] uppercase" style={{ color: '#D4AF37' }}>NEXUS CONFIG</h1>
        <p className="text-xs text-gray-600 font-mono mt-1 uppercase tracking-widest">Command Terminal · System Configuration v3.0</p>
      </div>

      <div className="flex gap-6 flex-col md:flex-row min-h-0 flex-1">
        {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
        <div className="md:w-52 shrink-0 flex flex-col gap-1">
          {sections.map(item => (
            <button key={item.label} onClick={() => setActiveSection(item.label)}
              className={`group w-full flex items-center px-3 py-2.5 rounded-xl transition-all text-left ${activeSection === item.label ? 'text-[#D4AF37] border-l-2 border-[#D4AF37]' : 'text-gray-500 hover:text-gray-300 border-l-2 border-transparent'}`}
              style={{ background: activeSection === item.label ? 'rgba(212,175,55,0.07)' : 'transparent' }}>
              <item.icon className={`w-4 h-4 mr-2.5 shrink-0 ${activeSection === item.label ? 'text-[#D4AF37]' : 'text-gray-700 group-hover:text-gray-400'}`} />
              <div className="min-w-0">
                <div className={`text-xs font-black ${activeSection === item.label ? 'text-[#D4AF37]' : ''}`}>{item.label}</div>
                <div className="text-[8px] text-gray-700 font-mono truncate">{item.desc}</div>
              </div>
            </button>
          ))}
          {/* System health */}
          <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="text-[8px] text-gray-700 uppercase tracking-widest font-mono mb-2">System Health</div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${liveAIStatus?.active ? 'bg-green-500 animate-pulse' : 'bg-gray-700'}`} />
              <span className="text-[9px] font-mono text-gray-500 truncate">{liveAIStatus?.active ? liveAIStatus.provider : 'No AI active'}</span>
            </div>
            <div className="text-[8px] text-gray-800 font-mono">v3.0 NEXUS</div>
            <motion.div key={quoteIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
              className="text-[7px] text-gray-800 italic mt-1.5 leading-tight">"{FUNNY_QUOTES[quoteIdx]}"</motion.div>
          </div>
        </div>

        {/* ── CONTENT ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div key={activeSection} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.15 }}
              className="flex flex-col gap-4">

              {/* ── PROFILE ──────────────────────────────────────────── */}
              {activeSection === 'Profile' && (
                <>
                  <div className="rounded-2xl p-6" style={cardStyle}>
                    <div className="flex items-center gap-5 mb-5">
                      <div className="relative">
                        <div className="w-20 h-20 rounded-2xl border-2 border-[#D4AF37] overflow-hidden shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                          <img src="/jj-trades-logo.jpg" alt="Profile" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#D4AF37] flex items-center justify-center border-2 border-black">
                          <span className="text-black text-[9px] font-black">✓</span>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-black text-white text-xl">JJ Trades</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-[rgba(212,175,55,0.15)] text-[#D4AF37] border border-[rgba(212,175,55,0.3)]">
                            <Shield className="w-2.5 h-2.5" />CLEARANCE: ELITE TRADER
                          </div>
                        </div>
                        <div className="flex gap-3 mt-2">
                          {[{ l:'MISSIONS', v:'247' },{ l:'WIN STREAK', v:'7d' }].map(s => (
                            <div key={s.l} className="text-center">
                              <div className="font-black text-sm text-[#D4AF37]">{s.v}</div>
                              <div className="text-[8px] text-gray-700 font-mono uppercase">{s.l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div><label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono block mb-1.5">Display Name</label>
                        <input type="text" defaultValue="JJ Trades" className={inputStyle} /></div>
                      <div><label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono block mb-1.5">Bio</label>
                        <textarea rows={2} defaultValue="Professional Forex Trader & Educator. Building the African trading community." className={`${inputStyle} resize-none`} /></div>
                    </div>
                  </div>
                  <div className="rounded-2xl p-5" style={cardStyle}>
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-3">Trading Style</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {['Scalper','Swing','Position','Day Trader'].map(style => (
                        <button key={style} onClick={() => { setTradingStyle(style); localStorage.setItem('jjnexus_trading_style', style) }}
                          className={`py-3 rounded-xl font-black text-sm border transition-all ${tradingStyle === style ? 'border-[rgba(212,175,55,0.5)] bg-[rgba(212,175,55,0.1)] text-[#D4AF37]' : 'border-gray-800 text-gray-600 hover:border-gray-600'}`}>
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl p-5" style={cardStyle}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="oath" checked={oathChecked} onChange={e => setOathChecked(e.target.checked)} className="w-4 h-4 accent-[#D4AF37]" />
                      <label htmlFor="oath" className="cursor-pointer" title="This is legally binding in the court of the market.">
                        <div className="text-xs text-white font-bold">⚔️ Trader's Oath</div>
                        <div className="text-[9px] text-gray-600 italic">I solemnly swear: I shall not revenge trade. I shall respect my stop loss. I shall not over-leverage.</div>
                      </label>
                      {oathChecked && <span className="ml-auto text-xs text-green-400 font-black">✅ SWORN</span>}
                    </div>
                  </div>
                  <button className="self-start px-6 py-2.5 rounded-xl font-black text-sm text-black" style={{ background: '#D4AF37' }}>Save Changes</button>
                </>
              )}

              {/* ── APPEARANCE ───────────────────────────────────────── */}
              {activeSection === 'Appearance' && (
                <div className="rounded-2xl p-6 space-y-6" style={cardStyle}>
                  <div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-3">Accent Color</div>
                    <div className="flex gap-3 flex-wrap mb-3">
                      {ACCENT_COLORS.map(({ color, label }) => (
                        <button key={color} onClick={() => handleAccentChange(color)} title={label}
                          className={`w-12 h-12 rounded-xl transition-all hover:scale-110 flex items-center justify-center border-2 ${accentColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ background: color, boxShadow: accentColor === color ? `0 0 12px ${color}88` : 'none' }}>
                          {accentColor === color && <Check className="w-5 h-5 text-black" />}
                        </button>
                      ))}
                      <input type="color" value={accentColor} onChange={e => handleAccentChange(e.target.value)}
                        className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-700" title="Custom" />
                    </div>
                    {/* Live preview */}
                    <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${accentColor}33` }}>
                      <div className="text-[8px] text-gray-700 font-mono mb-2 uppercase">Live Preview</div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}50` }}>
                          <Zap className="w-4 h-4" style={{ color: accentColor }} />
                        </div>
                        <div>
                          <div className="text-sm font-black" style={{ color: accentColor }}>NEXUS PRO</div>
                          <div className="text-xs text-gray-600">Dashboard · Live</div>
                        </div>
                        <button className="ml-auto px-3 py-1 rounded-lg text-xs font-black text-black" style={{ background: accentColor }}>Trade</button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-[9px] text-gray-600 uppercase tracking-widest font-mono">Font Size</span>
                      <span className="text-[9px] text-[#D4AF37] font-mono font-black">{fontSize}px</span>
                    </div>
                    <input type="range" min={12} max={20} value={fontSize} onChange={e => handleFontSize(Number(e.target.value))} className="w-full accent-[#D4AF37] mb-2" />
                    <div className="p-3 rounded-xl bg-black/40 border border-gray-800">
                      <p style={{ fontSize }}>Gold is the new green — buy the open, sell the close.</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-[9px] text-gray-600 uppercase tracking-widest font-mono">Screen Brightness</span>
                      <span className="text-[9px] text-[#D4AF37] font-mono font-black">{brightness}%</span>
                    </div>
                    <input type="range" min={40} max={100} value={brightness} onChange={e => handleBrightness(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
                  </div>
                  <div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-2">Interface Density</div>
                    <div className="flex gap-2">
                      {(['Compact','Comfortable','Spacious'] as const).map(d => (
                        <button key={d} onClick={() => setDensity(d)}
                          className={`flex-1 py-2 rounded-xl font-bold text-xs border transition-all ${density === d ? 'border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.08)] text-[#D4AF37]' : 'border-gray-800 text-gray-600 hover:border-gray-600'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── API & KEYS ───────────────────────────────────────── */}
              {activeSection === 'API & Keys' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-5" style={cardStyle}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-[#D4AF37]" />
                        <h3 className="font-black text-white">Neural Network Config</h3>
                      </div>
                      <button onClick={checkAIStatus} disabled={aiStatusLoading} className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#D4AF37] transition-colors">
                        <RefreshCcw className={`w-3 h-3 ${aiStatusLoading ? 'animate-spin' : ''}`} />Refresh
                      </button>
                    </div>
                    {liveAIStatus && (
                      <div className="flex items-center gap-3 p-3 rounded-xl mb-4 border" style={{ background: liveAIStatus.active ? `${liveAIStatus.color}12` : '#ef444412', borderColor: liveAIStatus.active ? `${liveAIStatus.color}35` : '#ef444435' }}>
                        <div className="relative w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${liveAIStatus.color}20` }}>
                          {liveAIStatus.active && <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: liveAIStatus.color }} />}
                          {liveAIStatus.active ? <Zap className="w-4 h-4" style={{ color: liveAIStatus.color }} /> : <XCircle className="w-4 h-4 text-red-400" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-black text-white">{liveAIStatus.active ? '✅ AI Active' : '❌ No AI Provider'}</p>
                          <p className="text-xs mt-0.5" style={{ color: liveAIStatus.active ? liveAIStatus.color : '#f87171' }}>{liveAIStatus.provider}</p>
                        </div>
                        <span className="text-xs font-black px-2 py-1 rounded-full border shrink-0" style={{ color: liveAIStatus.active ? liveAIStatus.color : '#ef4444', background: liveAIStatus.active ? `${liveAIStatus.color}18` : '#ef444418', borderColor: liveAIStatus.active ? `${liveAIStatus.color}35` : '#ef444435' }}>
                          {liveAIStatus.active ? 'ACTIVE' : 'NO KEY'}
                        </span>
                      </div>
                    )}
                    {/* Signal strength */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">Signal Strength</span>
                        <span className="text-[9px] font-black" style={{ color: configuredKeysCount >= 4 ? '#D4AF37' : configuredKeysCount >= 2 ? '#22c55e' : '#6b7280' }}>
                          {configuredKeysCount >= 4 ? '⚡ MAXIMUM POWER' : configuredKeysCount >= 2 ? '🔋 GOOD' : '🪫 LOW'}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="flex-1 h-2 rounded-sm transition-all" style={{ background: i <= configuredKeysCount ? '#D4AF37' : 'rgba(255,255,255,0.06)', boxShadow: i <= configuredKeysCount ? '0 0 4px rgba(212,175,55,0.5)' : 'none' }} />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <p className="font-bold text-gray-500 text-[10px] mb-2 uppercase tracking-wider">Priority order — server uses first available:</p>
                      {[{n:1,name:'Replit Free AI',desc:'Auto-injected by platform',k:'replit'},{n:2,name:'Grok (xAI)',desc:'xAI key, very fast',k:'grok'},{n:3,name:'Groq',desc:'Free, 14,400 req/day — RECOMMENDED',k:'groq'},{n:4,name:'Anthropic',desc:'Paid, best quality + web search',k:'anthropic'},{n:5,name:'OpenRouter',desc:'Free tier available',k:'openrouter'},{n:6,name:'GitHub Models',desc:'Free with GitHub account',k:'github'}].map(item => (
                        <div key={item.n} className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[rgba(212,175,55,0.1)] text-[#D4AF37] text-[9px] font-black flex items-center justify-center shrink-0">{item.n}</span>
                          <span className={`font-bold text-[10px] ${liveAIStatus?.type === item.k ? 'text-[#D4AF37]' : 'text-gray-500'}`}>{item.name}</span>
                          <span className="text-gray-700 text-[9px]">— {item.desc}</span>
                          {liveAIStatus?.type === item.k && <span className="text-[8px] font-black text-[#D4AF37] bg-[rgba(212,175,55,0.15)] px-1.5 py-0.5 rounded-full ml-auto">IN USE</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl p-4 border border-[rgba(212,175,55,0.1)]" style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <p className="text-sm text-gray-500 mb-1">Keys stored in your browser only — never sent to our servers.</p>
                    <p className="text-xs text-[#D4AF37] font-bold">💡 Start with Groq (free, fastest). Unlock all AI features in 2 min.</p>
                  </div>
                  {API_PROVIDERS.map(provider => <ApiProviderCard key={provider.id} provider={provider} />)}
                  {/* Telegram */}
                  <div className="rounded-2xl p-5" style={cardStyle}>
                    <div className="flex items-center gap-2 mb-4">
                      <Radio className="w-4 h-4 text-blue-400" />
                      <span className="font-black text-white">Telegram Bot</span>
                      <span className="text-[9px] text-gray-600 font-mono">For auto-sending trade alerts</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono block mb-1.5">Bot Token</label>
                        <input type="password" value={telegramToken} onChange={e => setTelegramToken(e.target.value)} placeholder="1234567890:AABBCCdd..." className={inputStyle} />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono block mb-1.5">Chat ID</label>
                        <input type="text" value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} placeholder="-100123456789 or @username" className={inputStyle} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveTelegram} className="px-4 py-2 rounded-xl font-black text-sm text-black" style={{ background: '#D4AF37' }}>Save</button>
                        <button onClick={testTelegram} disabled={telegramTesting || !telegramToken || !telegramChatId}
                          className="px-4 py-2 rounded-xl font-bold text-sm border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 disabled:opacity-40 flex items-center gap-1.5">
                          {telegramTesting ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : null}
                          Test Connection
                        </button>
                      </div>
                      {telegramResult && (
                        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${telegramResult === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {telegramResult === 'ok' ? '✅ Telegram connected! Alerts will be delivered.' : '❌ Failed — check bot token and chat ID'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STREAM SETTINGS ──────────────────────────────────── */}
              {activeSection === 'Stream Settings' && (
                <div className="rounded-2xl p-6 space-y-5" style={cardStyle}>
                  <h3 className="font-black text-white text-lg border-b border-[rgba(212,175,55,0.1)] pb-3">Stream Defaults</h3>
                  <div>
                    <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono block mb-2">Stream Title</label>
                    <input type="text" defaultValue="🔴 LIVE | XAUUSD Snipe Session | JJ Nexus Pro" className={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono block mb-2">Resolution</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[{v:'4K',l:'4K UHD',sub:'3840×2160'},{v:'1080p',l:'Full HD',sub:'1920×1080 ★'},{v:'720p',l:'HD',sub:'1280×720'},{v:'480p',l:'SD',sub:'854×480'}].map(q => (
                        <button key={q.v} onClick={() => { setStreamQuality(q.v); localStorage.setItem('streamQuality', q.v) }}
                          className={`py-3 rounded-xl border transition-all ${streamQuality === q.v ? 'border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.08)] text-[#D4AF37]' : 'border-gray-800 text-gray-600 hover:border-gray-600'}`}>
                          <div className="font-black text-sm">{q.l}</div>
                          <div className="text-[9px] font-mono">{q.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono block mb-2">Frame Rate</label>
                    <div className="flex gap-2">
                      {[{v:'24',l:'24 FPS',sub:'Cinematic'},{v:'30',l:'30 FPS',sub:'Recommended'},{v:'60',l:'60 FPS',sub:'Smooth'}].map(f => (
                        <button key={f.v} onClick={() => { setStreamFps(f.v); localStorage.setItem('streamFps', f.v) }}
                          className={`flex-1 py-3 rounded-xl border transition-all ${streamFps === f.v ? 'border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.08)] text-[#D4AF37]' : 'border-gray-800 text-gray-600'}`}>
                          <div className="font-black text-sm">{f.l}</div>
                          <div className="text-[9px]">{f.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono block mb-2">HUD Overlays</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([['ticker','Price Ticker'],['alerts','Alerts'],['killzone','Kill Zone Timer'],['whispers','AI Whispers']] as [keyof typeof overlays, string][]).map(([k,l]) => (
                        <div key={k} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <span className="text-xs text-gray-400">{l}</span>
                          <Toggle on={overlays[k]} onToggle={() => { setOverlays(o => ({...o,[k]:!o[k]})); localStorage.setItem(`jjnexus_overlay_${k}`, String(!overlays[k])) }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-gray-800 text-xs text-gray-600 font-mono">
                    Estimated bandwidth: ~{streamQuality === '4K' ? '25-50' : streamQuality === '1080p' ? '8-15' : streamQuality === '720p' ? '4-8' : '2-4'} Mbps upload required for {streamFps} FPS
                  </div>
                </div>
              )}

              {/* ── AUDIO ────────────────────────────────────────────── */}
              {activeSection === 'Audio' && (
                <div className="rounded-2xl p-6 space-y-6" style={cardStyle}>
                  <h3 className="font-black text-white text-lg border-b border-[rgba(212,175,55,0.1)] pb-3">Audio Command</h3>
                  {[
                    { label: 'Background Music', val: musicVolume, set: updateMusicVolume, desc: 'Ambient trading music volume' },
                    { label: 'Alert Sounds', val: alertVolume, set: setAlertVolume, desc: 'Scanner & sniper alert volume' },
                  ].map(({ label, val, set, desc }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-2">
                        <div><div className="text-sm font-bold text-white">{label}</div><div className="text-[9px] text-gray-600">{desc}</div></div>
                        <span className="text-sm font-black text-[#D4AF37] font-mono">{Math.round(val * 100)}%</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.05} value={val} onChange={e => set(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <button onClick={testAlertSound} className="px-4 py-2 rounded-xl border border-[rgba(212,175,55,0.3)] text-[#D4AF37] text-sm font-black hover:bg-[rgba(212,175,55,0.1)] transition-colors">
                      🔊 Test Alert Sound
                    </button>
                    <div className="flex items-center gap-2">
                      <Toggle on={voiceEnabled} onToggle={() => setVoiceEnabled(v => !v)} />
                      <span className="text-xs text-gray-400">Voice Alerts</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── NOTIFICATIONS ────────────────────────────────────── */}
              {activeSection === 'Notifications' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-5 flex items-center justify-between" style={cardStyle}>
                    <div>
                      <p className="font-bold text-white">Browser Notifications</p>
                      <p className="text-xs text-gray-500 mt-1">Alerts before high-impact events & A+ setups</p>
                    </div>
                    <button onClick={requestNotifications}
                      className={`px-4 py-2 rounded-xl font-black text-sm ${notifPermission === 'granted' ? 'bg-green-500/15 text-green-400 border border-green-500/30' : notifPermission === 'denied' ? 'bg-red-500/15 text-red-400 border border-red-500/30 cursor-not-allowed' : 'text-black'}`}
                      style={notifPermission === 'default' ? { background: '#D4AF37' } : {}} disabled={notifPermission === 'denied'}>
                      {notifPermission === 'granted' ? '✅ Enabled' : notifPermission === 'denied' ? '🚫 Blocked' : 'Enable'}
                    </button>
                  </div>
                  <div className="rounded-2xl p-5 flex items-center justify-between" style={cardStyle}>
                    <div>
                      <p className="font-bold text-white">Telegram Alerts</p>
                      <p className="text-xs text-gray-500 mt-1">{localStorage.getItem('jjnexus_telegram_token') ? 'Bot configured — ready to fire' : 'Configure bot in API & Keys first'}</p>
                    </div>
                    <Toggle on={tgAlertsEnabled} onToggle={() => setTgAlertsEnabled(v => !v)} />
                  </div>
                  <div className="rounded-2xl p-5" style={cardStyle}>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-3">Alert Frequency</p>
                    <div className="space-y-2">
                      {([['every','Every Setup','You want ALL the alerts. Living on the edge.'],['aplus','A+ Only (Recommended)','Only the elite setups. Fewer pings, higher quality.'],['paranoid','Paranoid Mode','I will wake you up at 3am for a C-grade setup.']] as [typeof alertFreq, string, string][]).map(([v,l,desc]) => (
                        <button key={v} onClick={() => setAlertFreq(v)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${alertFreq === v ? 'border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.06)]' : 'border-gray-800 hover:border-gray-700'}`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${alertFreq === v ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-gray-600'}`}>
                            {alertFreq === v && <div className="w-2 h-2 rounded-full bg-black" />}
                          </div>
                          <div>
                            <div className={`text-sm font-bold ${alertFreq === v ? 'text-[#D4AF37]' : 'text-gray-300'}`}>{l}</div>
                            <div className="text-[9px] text-gray-600 italic">{desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── RISK DEFAULTS ────────────────────────────────────── */}
              {activeSection === 'Risk Defaults' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-5" style={cardStyle}>
                    <div className="flex items-center gap-2 mb-4">
                      <Shield className="w-4 h-4 text-[#D4AF37]" />
                      <span className="font-black text-white">Risk Parameters</span>
                    </div>
                    <div className="space-y-5">
                      <div>
                        <div className="flex justify-between mb-2">
                          <div><div className="text-sm font-bold text-white">Risk Per Trade</div>
                          <div className="text-[9px] text-gray-600">On $10,000 account: <span className="text-[#D4AF37] font-black">${(10000 * riskPct / 100).toFixed(0)}</span></div></div>
                          <span className="text-lg font-black text-[#D4AF37]">{riskPct}%</span>
                        </div>
                        <input type="range" min={0.5} max={5} step={0.5} value={riskPct} onChange={e => { setRiskPct(Number(e.target.value)); localStorage.setItem('jjnexus_risk_pct', e.target.value) }} className="w-full accent-[#D4AF37]" />
                        <div className="flex justify-between text-[8px] text-gray-700 font-mono mt-1">
                          <span>Conservative 0.5%</span><span>Aggressive 5%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white mb-2">Target R:R</div>
                        <div className="grid grid-cols-4 gap-2">
                          {['1:1.5','1:2','1:3','1:5'].map(rr => (
                            <button key={rr} onClick={() => { setRiskRR(rr); localStorage.setItem('jjnexus_risk_rr', rr) }}
                              className={`py-2.5 rounded-xl font-black text-sm border ${riskRR === rr ? 'border-[rgba(212,175,55,0.4)] bg-[rgba(212,175,55,0.08)] text-[#D4AF37]' : 'border-gray-800 text-gray-600 hover:border-gray-600'}`}>
                              {rr}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <div><div className="text-sm font-bold text-white">Daily Loss Circuit Breaker</div>
                          <div className="text-[9px] text-gray-600">Stop trading after losing <span className="text-red-400 font-black">{maxDailyLoss}%</span> today</div></div>
                          <span className="text-lg font-black text-red-400">{maxDailyLoss}%</span>
                        </div>
                        <input type="range" min={1} max={10} value={maxDailyLoss} onChange={e => { setMaxDailyLoss(Number(e.target.value)); localStorage.setItem('jjnexus_risk_maxloss', e.target.value) }} className="w-full accent-red-500" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <div className="text-sm font-bold text-white">Max Open Trades</div>
                          <span className="text-lg font-black text-[#D4AF37]">{maxTrades}</span>
                        </div>
                        <input type="range" min={1} max={10} value={maxTrades} onChange={e => { setMaxTrades(Number(e.target.value)); localStorage.setItem('jjnexus_risk_maxtrades', e.target.value) }} className="w-full accent-[#D4AF37]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ABOUT ────────────────────────────────────────────── */}
              {activeSection === 'About' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-8 text-center" style={cardStyle}>
                    <div className="w-20 h-20 rounded-2xl mx-auto mb-4 overflow-hidden border-2 border-[#D4AF37] shadow-[0_0_30px_rgba(212,175,55,0.4)]">
                      <img src="/jj-trades-logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <div className="font-black text-4xl tracking-widest text-[#D4AF37]">JJ NEXUS PRO</div>
                    <div className="text-gray-600 font-mono text-sm mt-1">v3.0 NEXUS · Elite Forex Command Center</div>
                    <div className="text-gray-700 text-xs mt-2">Built by JJ Trades · Powered by Alchemist AI</div>
                  </div>
                  <div className="rounded-2xl p-5 border border-yellow-500/20 bg-yellow-500/03" style={{ background: 'rgba(234,179,8,0.03)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      <span className="font-black text-yellow-500 text-sm">LEGAL DISCLAIMER</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed italic">
                      This software is provided "as is" for educational and informational purposes only. Past performance is not indicative of future results. The Alchemist AI algorithm is not responsible for your revenge trades, your blown accounts, or your decision to go all-in on a D-grade setup at 3am. All trading involves substantial risk of loss. The market has been doing this longer than you have. JJ Nexus Pro Holdings LLC, Alchemist AI Corp, and the ghost whispering into your ear are not registered financial advisors and accept no liability for your trading decisions. Past setups may appear larger in the rearview mirror. Do not trade with money you cannot afford to lose, your rent money, your emergency fund, or your children's college fund. You have been warned.
                    </p>
                  </div>
                  <div className="rounded-2xl p-5 border border-red-500/25" style={{ background: 'rgba(239,68,68,0.04)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Rocket className="w-4 h-4 text-red-400" />
                      <span className="font-black text-red-400">☢️ NUCLEAR OPTION</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-4">Reset ALL settings, API keys, and preferences. This cannot be undone. Your future self will be disappointed.</p>
                    <button onClick={nuclearOption} className="flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm text-red-300 border border-red-500/30 hover:bg-red-500/10 transition-colors">
                      <Lock className="w-4 h-4" />Initiate Nuclear Option
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
