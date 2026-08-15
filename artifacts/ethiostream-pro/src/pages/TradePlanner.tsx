import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, ChevronRight, ChevronLeft, Zap, Save, CheckCircle,
  Target, TrendingUp, TrendingDown, Shield, Clock, BarChart2,
  AlertTriangle, Crosshair, Layers, Brain, RefreshCcw, Bookmark
} from 'lucide-react'
import { callAlchemistAI } from '@/utils/freeAI'

const GOLD = '#D4AF37'
const G10 = 'rgba(212,175,55,0.10)'
const G20 = 'rgba(212,175,55,0.20)'
const G30 = 'rgba(212,175,55,0.30)'

const PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NAS100', 'US30']

interface TradePlan {
  pair: string
  bias: 'Bullish' | 'Bearish' | ''
  htfStructure: string
  liquidityTarget: string
  liquiditySwept: boolean
  poiType: 'Bullish OB' | 'Bearish OB' | 'FVG' | 'CHoCH' | ''
  poiHigh: string; poiLow: string; poiTimeframe: string; poiStrength: number
  entryModel: 'OB_Tap' | 'FVG_Fill' | 'CHoCH_Entry' | 'OTE_Entry' | ''
  entryPrice: string; entryTrigger: string
  stopLoss: string; stopLossReason: string
  tp1: string; tp2: string; tp3: string
  riskPercent: number; accountSize: number
  plannedSession: 'London' | 'NY' | 'London-NY-Overlap' | ''
  invalidationLevel: string; invalidationReason: string
  aiGrade: string; aiConfluenceScore: number; aiComments: string
  status: 'Planned' | 'Waiting' | 'Entered' | 'Done'
}

const emptyPlan = (): TradePlan => ({
  pair: 'XAUUSD', bias: '', htfStructure: '', liquidityTarget: '', liquiditySwept: false,
  poiType: '', poiHigh: '', poiLow: '', poiTimeframe: 'H4', poiStrength: 7,
  entryModel: '', entryPrice: '', entryTrigger: '',
  stopLoss: '', stopLossReason: '', tp1: '', tp2: '', tp3: '',
  riskPercent: 1, accountSize: 10000, plannedSession: '',
  invalidationLevel: '', invalidationReason: '',
  aiGrade: '', aiConfluenceScore: 0, aiComments: '', status: 'Planned'
})

const STEPS = [
  { label: 'Top-Down Bias', icon: TrendingUp, emoji: '🧭' },
  { label: 'Liquidity', icon: Layers, emoji: '🧲' },
  { label: 'POI', icon: Crosshair, emoji: '🎯' },
  { label: 'Entry Model', icon: Target, emoji: '⚡' },
  { label: 'Risk Mgmt', icon: Shield, emoji: '🛡️' },
  { label: 'Session', icon: Clock, emoji: '⏰' },
  { label: 'Invalidation', icon: AlertTriangle, emoji: '⚠️' },
  { label: 'AI Review', icon: Brain, emoji: '🤖' },
]

function getPairPrice(pair: string): number {
  try { const s = localStorage.getItem('jjnexus_prices'); if (s) { const p = JSON.parse(s); if (p[pair]) return p[pair] } } catch {}
  const d: Record<string, number> = { XAUUSD: 4725, EURUSD: 1.0845, GBPUSD: 1.2634, USDJPY: 149.5, AUDUSD: 0.6421, USDCAD: 1.3612, NAS100: 19850, US30: 39420 }
  return d[pair] || 1.0
}

function calcLotSize(risk: number, account: number, slPips: number): number {
  const riskAmount = (risk / 100) * account
  return slPips > 0 ? Math.round((riskAmount / slPips / 10) * 100) / 100 : 0.01
}

const inputCls = "w-full bg-black/60 border border-[rgba(212,175,55,0.2)] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[rgba(212,175,55,0.5)] placeholder:text-gray-700 transition-colors"
const labelCls = "text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 block font-bold"

export default function TradePlanner() {
  const [step, setStep] = useState(0)
  const [plan, setPlan] = useState<TradePlan>(emptyPlan())
  const [aiLoading, setAiLoading] = useState(false)
  const [savedPlans, setSavedPlans] = useState<TradePlan[]>(() => {
    try { return JSON.parse(localStorage.getItem('jjnexus_trade_plans') || '[]') } catch { return [] }
  })
  const [showSaved, setShowSaved] = useState(false)

  const price = getPairPrice(plan.pair)
  const set = (k: keyof TradePlan, v: any) => setPlan(p => ({ ...p, [k]: v }))

  const slPips = plan.stopLoss && price
    ? Math.abs(price - parseFloat(plan.stopLoss)) * (plan.pair.includes('JPY') ? 100 : plan.pair === 'XAUUSD' ? 1 : 10000)
    : 0
  const lotSize = calcLotSize(plan.riskPercent, plan.accountSize, slPips)
  const dollarRisk = (plan.riskPercent / 100) * plan.accountSize
  const rrRaw = plan.tp2 && plan.stopLoss && plan.entryPrice
    ? Math.abs(parseFloat(plan.tp2) - parseFloat(plan.entryPrice)) / Math.abs(parseFloat(plan.entryPrice) - parseFloat(plan.stopLoss))
    : 0

  const runAIReview = async () => {
    setAiLoading(true)
    const text = await callAlchemistAI(`
Complete Alchemist trade plan review. LIVE PRICE: ${price}

TRADE PLAN:
Pair: ${plan.pair} | HTF Bias: ${plan.bias} | Structure: ${plan.htfStructure}
Liquidity Target: ${plan.liquidityTarget} (swept: ${plan.liquiditySwept ? 'YES' : 'NO'})
POI: ${plan.poiType} ${plan.poiTimeframe} at ${plan.poiLow}–${plan.poiHigh} (strength: ${plan.poiStrength}/10)
Entry: ${plan.entryModel} @ ${plan.entryPrice} | Trigger: ${plan.entryTrigger}
SL: ${plan.stopLoss} (${plan.stopLossReason}) | TP1: ${plan.tp1} | TP2: ${plan.tp2} | TP3: ${plan.tp3}
R:R: ${rrRaw.toFixed(1)}:1 | Risk: ${plan.riskPercent}% ($${dollarRisk.toFixed(0)})
Session: ${plan.plannedSession} | Invalidation: ${plan.invalidationLevel} (${plan.invalidationReason})

Grade this plan A+/A/B/C/No Trade. Score 0–6 confluence criteria. List ✅/⚠️/❌ for each.
Provide specific improvement suggestions. End with confidence rating and single most important risk.`,
      price, plan.pair
    )
    const grade = text.includes('A+') ? 'A+' : text.includes('Grade: A') ? 'A' : text.includes('Grade: B') ? 'B' : text.includes('Grade: C') ? 'C' : 'B'
    const score = text.includes('6/6') ? 6 : text.includes('5/6') ? 5 : text.includes('4/6') ? 4 : text.includes('3/6') ? 3 : 3
    set('aiGrade', grade); set('aiConfluenceScore', score); set('aiComments', text)
    setAiLoading(false)
  }

  const savePlan = () => {
    const updated = [plan, ...savedPlans].slice(0, 20)
    setSavedPlans(updated)
    localStorage.setItem('jjnexus_trade_plans', JSON.stringify(updated))
  }

  const gradeColor = (g: string) => g === 'A+' ? '#22c55e' : g === 'A' ? '#60a5fa' : g === 'B' ? GOLD : '#f97316'

  const stepContent = [
    // 0: Top-Down Bias
    <div key={0} className="space-y-5">
      <div>
        <label className={labelCls}>Trading Pair</label>
        <div className="flex gap-2 flex-wrap">
          {PAIRS.map(p => (
            <button key={p} onClick={() => set('pair', p)}
              className="px-3 py-2 rounded-xl text-sm font-bold border transition-all"
              style={{ background: plan.pair === p ? GOLD : 'rgba(0,0,0,0.5)', color: plan.pair === p ? '#000' : '#888', borderColor: plan.pair === p ? GOLD : 'rgba(255,255,255,0.06)' }}>
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-600">Live price: <span className="font-mono font-bold" style={{ color: GOLD }}>{price > 100 ? '$' : ''}{price.toFixed(price > 100 ? 2 : 5)}</span></span>
        </div>
      </div>
      <div>
        <label className={labelCls}>Overall HTF Bias</label>
        <div className="grid grid-cols-2 gap-3">
          {['Bullish', 'Bearish'].map(b => (
            <button key={b} onClick={() => set('bias', b)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black border transition-all"
              style={{
                borderColor: plan.bias === b ? (b === 'Bullish' ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)') : 'rgba(255,255,255,0.06)',
                background: plan.bias === b ? (b === 'Bullish' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)') : 'rgba(0,0,0,0.5)',
                color: plan.bias === b ? (b === 'Bullish' ? '#22c55e' : '#ef4444') : '#555'
              }}>
              {b === 'Bullish' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {b}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>HTF Structure Summary (W1 → D1 → H4)</label>
        <textarea value={plan.htfStructure} onChange={e => set('htfStructure', e.target.value)}
          className={inputCls + ' resize-none h-24'} placeholder="e.g. W1 Bullish BOS. D1 CHoCH confirmed at 4,680. H4 bullish structure intact above 4,695 OB." />
      </div>
    </div>,

    // 1: Liquidity
    <div key={1} className="space-y-5">
      <div>
        <label className={labelCls}>Liquidity Target Price Level</label>
        <input value={plan.liquidityTarget} onChange={e => set('liquidityTarget', e.target.value)}
          className={inputCls} placeholder="e.g. 4750.00 (equal highs / BSL above)" />
      </div>
      <div>
        <label className={labelCls}>Has Liquidity Been Swept?</label>
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map(v => (
            <button key={String(v)} onClick={() => set('liquiditySwept', v)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all"
              style={{
                borderColor: plan.liquiditySwept === v ? (v ? 'rgba(34,197,94,0.5)' : 'rgba(250,204,21,0.5)') : 'rgba(255,255,255,0.06)',
                background: plan.liquiditySwept === v ? (v ? 'rgba(34,197,94,0.1)' : 'rgba(250,204,21,0.1)') : 'rgba(0,0,0,0.5)',
                color: plan.liquiditySwept === v ? (v ? '#22c55e' : '#facc15') : '#555'
              }}>
              {v ? <><CheckCircle className="w-4 h-4" /> YES — Swept</> : <><Clock className="w-4 h-4" /> NO — Waiting</>}
            </button>
          ))}
        </div>
      </div>
      <div className={`p-4 rounded-xl border text-sm ${plan.liquiditySwept ? 'border-green-500/20 bg-green-500/5 text-green-300' : 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300'}`}>
        {plan.liquiditySwept
          ? '✅ Liquidity swept — now locate your POI and wait for CHoCH confirmation.'
          : '⚠️ Patience required. Wait for the stop hunt before entering any position.'}
      </div>
    </div>,

    // 2: POI
    <div key={2} className="space-y-5">
      <div>
        <label className={labelCls}>Point of Interest Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['Bullish OB', 'Bearish OB', 'FVG', 'CHoCH'] as const).map(t => (
            <button key={t} onClick={() => set('poiType', t)}
              className="py-2.5 rounded-xl text-sm font-bold border transition-all"
              style={{ borderColor: plan.poiType === t ? G30 : 'rgba(255,255,255,0.06)', background: plan.poiType === t ? G10 : 'rgba(0,0,0,0.5)', color: plan.poiType === t ? GOLD : '#555' }}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'POI Low (entry zone low)', key: 'poiLow', placeholder: `~${(price * 0.993).toFixed(2)}` },
          { label: 'POI High (entry zone high)', key: 'poiHigh', placeholder: `~${(price * 0.997).toFixed(2)}` },
        ].map(f => (
          <div key={f.key}>
            <label className={labelCls}>{f.label}</label>
            <input value={(plan as any)[f.key]} onChange={e => set(f.key as any, e.target.value)} className={inputCls} placeholder={f.placeholder} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Timeframe</label>
          <select value={plan.poiTimeframe} onChange={e => set('poiTimeframe', e.target.value)} className={inputCls}>
            {['W1', 'D1', 'H4', 'H1', 'M15', 'M5'].map(tf => <option key={tf}>{tf}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>POI Strength: {plan.poiStrength}/10</label>
          <div className="pt-2">
            <input type="range" min={1} max={10} value={plan.poiStrength} onChange={e => set('poiStrength', +e.target.value)} className="w-full accent-yellow-400" />
            <div className="flex justify-between text-[9px] text-gray-600 mt-1">
              <span>Weak</span><span style={{ color: GOLD }} className="font-black">{plan.poiStrength}/10</span><span>Strong</span>
            </div>
          </div>
        </div>
      </div>
    </div>,

    // 3: Entry Model
    <div key={3} className="space-y-5">
      {plan.poiLow && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-xs" style={{ background: G10, border: `1px solid ${G20}` }}>
          <Crosshair className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
          <span className="text-gray-300">POI: <strong style={{ color: GOLD }}>{plan.poiType}</strong> on {plan.poiTimeframe} at {plan.poiLow} — {plan.poiHigh}</span>
        </div>
      )}
      <div>
        <label className={labelCls}>Entry Model</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: 'OB_Tap', label: 'OB Tap', desc: 'Price taps the Order Block' },
            { v: 'FVG_Fill', label: 'FVG Fill', desc: 'FVG inside OB fills' },
            { v: 'CHoCH_Entry', label: 'CHoCH Entry', desc: 'M15 CHoCH at the OB' },
            { v: 'OTE_Entry', label: 'OTE Entry', desc: '61.8–79% Fib retracement' },
          ].map(({ v, label, desc }) => (
            <button key={v} onClick={() => set('entryModel', v)}
              className="p-3 rounded-xl text-left border transition-all"
              style={{ borderColor: plan.entryModel === v ? G30 : 'rgba(255,255,255,0.06)', background: plan.entryModel === v ? G10 : 'rgba(0,0,0,0.5)' }}>
              <div className="text-sm font-black" style={{ color: plan.entryModel === v ? GOLD : '#999' }}>{label}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">{desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>Ideal Entry Price</label>
        <input value={plan.entryPrice} onChange={e => set('entryPrice', e.target.value)} className={inputCls} placeholder={`~${(price * 0.995).toFixed(2)}`} />
      </div>
      <div>
        <label className={labelCls}>Entry Trigger (exact condition that fires entry)</label>
        <textarea value={plan.entryTrigger} onChange={e => set('entryTrigger', e.target.value)}
          className={inputCls + ' resize-none h-20'} placeholder="e.g. Price taps H4 OB at 4,695–4,702 AND M15 forms bullish CHoCH. Enter on M5 OB inside the CHoCH." />
      </div>
    </div>,

    // 4: Risk Management
    <div key={4} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Stop Loss Price</label>
          <input value={plan.stopLoss} onChange={e => set('stopLoss', e.target.value)} className={inputCls} placeholder={`~${(price * 0.986).toFixed(2)}`} />
        </div>
        <div>
          <label className={labelCls}>SL Reason</label>
          <input value={plan.stopLossReason} onChange={e => set('stopLossReason', e.target.value)} className={inputCls} placeholder="Below OB low" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['tp1', 'tp2', 'tp3'].map((k, i) => (
          <div key={k}>
            <label className={labelCls}>TP{i + 1} {i === 1 ? '(R:R calc)' : ''}</label>
            <input value={(plan as any)[k]} onChange={e => set(k as any, e.target.value)} className={inputCls} placeholder={`~${(price * (1.008 + i * 0.008)).toFixed(2)}`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Risk % per trade</label>
          <input type="number" step="0.1" min="0.1" max="5" value={plan.riskPercent} onChange={e => set('riskPercent', +e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Account Size ($)</label>
          <input type="number" value={plan.accountSize} onChange={e => set('accountSize', +e.target.value)} className={inputCls} />
        </div>
      </div>
      {slPips > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'SL Pips', val: slPips.toFixed(1), color: '#888' },
            { label: 'Lot Size', val: String(lotSize), color: GOLD },
            { label: '$ at Risk', val: `$${dollarRisk.toFixed(0)}`, color: '#ef4444' },
          ].map(item => (
            <div key={item.label} className="text-center p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${G10}` }}>
              <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">{item.label}</div>
              <div className="font-mono font-black text-lg" style={{ color: item.color }}>{item.val}</div>
            </div>
          ))}
        </div>
      )}
      {rrRaw > 0 && (
        <div className={`text-center py-3 rounded-xl border font-black text-sm ${rrRaw >= 3 ? 'text-green-400 border-green-500/30 bg-green-500/8' : rrRaw >= 2 ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/8' : 'text-red-400 border-red-500/30 bg-red-500/8'}`}>
          R:R = 1:{rrRaw.toFixed(1)} {rrRaw >= 3 ? '✅ Excellent — Elite setup' : rrRaw >= 2 ? '⚠️ Acceptable — Proceed with care' : '❌ Too Low — Do not take this trade'}
        </div>
      )}
    </div>,

    // 5: Session
    <div key={5} className="space-y-5">
      <div>
        <label className={labelCls}>Planned Trading Session</label>
        <div className="grid grid-cols-3 gap-3">
          {(['London', 'NY', 'London-NY-Overlap'] as const).map(s => (
            <button key={s} onClick={() => set('plannedSession', s)}
              className="py-3 rounded-xl text-sm font-bold border transition-all text-center"
              style={{ borderColor: plan.plannedSession === s ? G30 : 'rgba(255,255,255,0.06)', background: plan.plannedSession === s ? G10 : 'rgba(0,0,0,0.5)', color: plan.plannedSession === s ? GOLD : '#555' }}>
              {s === 'London' ? '🇬🇧' : s === 'NY' ? '🇺🇸' : '⚡'}<br />
              <span className="text-[10px]">{s}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {[
          { zone: 'London Open Kill Zone', time: '07:00 — 09:00 UTC', color: '#22c55e', active: plan.plannedSession === 'London' || plan.plannedSession === 'London-NY-Overlap' },
          { zone: 'NY Open Kill Zone', time: '13:00 — 15:00 UTC', color: '#f97316', active: plan.plannedSession === 'NY' || plan.plannedSession === 'London-NY-Overlap' },
          { zone: 'London Close', time: '15:00 — 17:00 UTC', color: GOLD, active: false },
        ].map(z => (
          <div key={z.zone} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: z.active ? `${z.color}08` : 'rgba(0,0,0,0.4)', border: `1px solid ${z.active ? `${z.color}25` : 'rgba(255,255,255,0.04)'}` }}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: z.active ? z.color : '#333' }} />
            <span className="text-xs flex-1" style={{ color: z.active ? z.color : '#555' }}>{z.zone}</span>
            <span className="font-mono text-xs text-gray-500">{z.time}</span>
          </div>
        ))}
      </div>
      <div className="p-3 rounded-xl text-xs border border-yellow-500/15 bg-yellow-500/5 text-yellow-300/80">
        ⚠️ Only enter trades during kill zone windows. Outside these times, probability drops significantly.
      </div>
    </div>,

    // 6: Invalidation
    <div key={6} className="space-y-5">
      <div>
        <label className={labelCls}>Invalidation Level (price)</label>
        <input value={plan.invalidationLevel} onChange={e => set('invalidationLevel', e.target.value)} className={inputCls} placeholder={`~${(price * 0.982).toFixed(2)}`} />
      </div>
      <div>
        <label className={labelCls}>Invalidation Reason</label>
        <textarea value={plan.invalidationReason} onChange={e => set('invalidationReason', e.target.value)}
          className={inputCls + ' resize-none h-24'} placeholder="e.g. If price closes below D1 OB low at 4,680, the bullish structure is broken and the entire trade plan is cancelled." />
      </div>
      <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-300">
        ⚠️ If price reaches this level — your bias is WRONG. Exit all positions immediately and re-analyze from scratch.
      </div>
      {plan.poiLow && plan.invalidationLevel && (
        <div className="p-3 rounded-xl text-xs" style={{ background: G10, border: `1px solid ${G20}` }}>
          📐 Distance from POI to Invalidation: <strong style={{ color: GOLD }}>{Math.abs(parseFloat(plan.poiLow) - parseFloat(plan.invalidationLevel)).toFixed(2)} points</strong>
        </div>
      )}
    </div>,

    // 7: AI Review
    <div key={7} className="space-y-5">
      {!plan.aiGrade ? (
        <div className="flex flex-col items-center py-12 gap-6">
          <div className="relative">
            <motion.div className="absolute inset-0 rounded-2xl blur-xl" style={{ background: GOLD }}
              animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2, repeat: Infinity }} />
            <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: G10, border: `1px solid ${G30}` }}>
              <Brain className="w-10 h-10" style={{ color: GOLD }} />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-white font-black text-lg mb-1">Alchemist AI Review</h3>
            <p className="text-gray-600 text-sm max-w-xs">Submit your complete plan for AI grading, confluence scoring, and specific improvement suggestions</p>
          </div>
          <button onClick={runAIReview} disabled={aiLoading}
            className="flex items-center gap-2 px-8 py-3 rounded-xl font-black text-sm transition-all disabled:opacity-40"
            style={{ background: GOLD, color: '#000', boxShadow: '0 0 20px rgba(212,175,55,0.4)' }}>
            {aiLoading ? <><RefreshCcw className="w-4 h-4 animate-spin" /> Analyzing Plan…</> : <><Zap className="w-5 h-5" /> Submit for AI Review</>}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-5 p-4 rounded-2xl" style={{ background: G10, border: `1px solid ${G20}` }}>
            <div className="font-black text-5xl" style={{ color: gradeColor(plan.aiGrade) }}>{plan.aiGrade}</div>
            <div className="flex-1">
              <div className="text-white font-bold mb-1">Confluence Score: <span style={{ color: GOLD }}>{plan.aiConfluenceScore}/6</span></div>
              <div className="flex gap-1">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-2 flex-1 rounded-full transition-all" style={{ background: i < plan.aiConfluenceScore ? '#22c55e' : 'rgba(255,255,255,0.08)' }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { set('aiGrade', ''); set('aiComments', '') }}
                className="px-3 py-2 rounded-xl border border-gray-800 text-xs text-gray-500 hover:text-white transition-colors">Reset</button>
              <button onClick={runAIReview} disabled={aiLoading}
                className="px-3 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-40"
                style={{ background: G10, border: `1px solid ${G20}`, color: GOLD }}>
                {aiLoading ? 'Re-analyzing…' : 'Re-analyze'}
              </button>
            </div>
          </div>
          <div className="rounded-xl p-4 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar"
            style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${G10}` }}>
            {plan.aiComments}
          </div>
          <button onClick={savePlan}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm transition-all"
            style={{ background: '#22c55e', color: '#000' }}>
            <Save className="w-4 h-4" /> Save Plan to Library
          </button>
        </div>
      )}
    </div>,
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 pb-8">

      {/* ── Cinematic Header ─────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0800, #0d0a00, #050300)', border: `1px solid ${G30}` }}>
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(212,175,55,0.8) 0px, transparent 1px, transparent 20px, rgba(212,175,55,0.8) 21px)', backgroundSize: '28px 28px' }} />
        <motion.div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent opacity-40 pointer-events-none"
          animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} />
        <div className="relative flex items-center gap-5 p-6">
          <div className="relative">
            <motion.div className="absolute inset-0 rounded-2xl blur-xl opacity-40" style={{ background: GOLD }}
              animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2, repeat: Infinity }} />
            <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: G10, border: `1px solid ${G30}` }}>
              <ClipboardList className="w-7 h-7" style={{ color: GOLD }} />
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-bold tracking-widest text-gray-600 uppercase">JJ Nexus Pro · Trade Intelligence</div>
            <h1 className="font-serif font-black text-2xl tracking-wider" style={{ color: GOLD }}>ALCHEMIST TRADE PLANNER</h1>
            <p className="text-xs text-gray-500 mt-0.5">8-step pre-trade framework · AI grading · Confluence engine</p>
          </div>
          <button onClick={() => setShowSaved(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all"
            style={{ borderColor: G20, background: showSaved ? G10 : 'transparent', color: showSaved ? GOLD : '#666' }}>
            <Bookmark className="w-3.5 h-3.5" /> Plans ({savedPlans.length})
          </button>
        </div>
      </div>

      {/* ── Step Indicator ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-0.5 shrink-0">
            <motion.button onClick={() => i <= step && setStep(i)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[10px] font-black transition-all whitespace-nowrap"
              style={{
                background: i === step ? GOLD : i < step ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.5)',
                color: i === step ? '#000' : i < step ? '#22c55e' : '#444',
                border: `1px solid ${i === step ? GOLD : i < step ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`,
                cursor: i <= step ? 'pointer' : 'not-allowed',
              }}
              whileHover={i <= step ? { scale: 1.02 } : {}}>
              {i < step ? <CheckCircle className="w-3 h-3" /> : <span>{s.emoji}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </motion.button>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-800 shrink-0" />}
          </div>
        ))}
      </div>

      {/* ── Step Content ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
        <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
          {(() => { const S = STEPS[step].icon; return <S className="w-4 h-4" style={{ color: GOLD }} /> })()}
          <span className="font-black text-sm text-white">
            Step {step + 1}: {STEPS[step].emoji} {STEPS[step].label}
          </span>
        </div>
        <div className="p-5 min-h-[280px]">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {stepContent[step]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center">
        <button onClick={() => setStep(p => Math.max(0, p - 1))} disabled={step === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all disabled:opacity-30"
          style={{ borderColor: G10, color: '#777', background: 'rgba(0,0,0,0.5)' }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-[10px] text-gray-700">{step + 1} / {STEPS.length}</div>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(p => Math.min(STEPS.length - 1, p + 1))}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-black text-sm transition-all"
            style={{ background: GOLD, color: '#000', boxShadow: '0 0 16px rgba(212,175,55,0.35)' }}>
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={runAIReview} disabled={aiLoading}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-black text-sm transition-all disabled:opacity-40"
            style={{ background: GOLD, color: '#000', boxShadow: '0 0 16px rgba(212,175,55,0.35)' }}>
            {aiLoading ? <><RefreshCcw className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Zap className="w-4 h-4" /> Run AI Review</>}
          </button>
        )}
      </div>

      {/* ── Saved Plans Drawer ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSaved && savedPlans.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${G20}` }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${G10}`, background: 'rgba(0,0,0,0.5)' }}>
              <Bookmark className="w-4 h-4" style={{ color: GOLD }} />
              <span className="font-black text-sm text-white">SAVED TRADE PLANS</span>
            </div>
            <div className="p-3 space-y-1.5 max-h-[320px] overflow-y-auto custom-scrollbar">
              {savedPlans.map((p, i) => (
                <motion.div key={i} onClick={() => { setPlan(p); setShowSaved(false); setStep(7) }}
                  className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:border-[rgba(212,175,55,0.3)]"
                  style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.4)' }}
                  whileHover={{ x: 4 }}>
                  <div className="font-black text-lg" style={{ color: gradeColor(p.aiGrade || 'B'), minWidth: 32 }}>{p.aiGrade || '—'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{p.pair} <span className="text-gray-500 font-normal">{p.bias} · {p.entryModel?.replace('_', ' ') || 'No entry'}</span></div>
                    <div className="text-[10px] text-gray-700 font-mono">{p.entryPrice ? `@ ${p.entryPrice}` : 'Entry not set'} · Confluence {p.aiConfluenceScore}/6</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-700 shrink-0" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
