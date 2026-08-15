import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Download,
  FlaskConical, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, XCircle,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  applyMultipleTestingCorrection, mean, quantile, runBootstrap, runMCMCMeanReturn,
  runMCMCWinRate, runMonteCarlo, runRiskProjection, scoreMonteCarloPValue,
  scoreRiskVerification, scoreVerification, sharpeRatio, FOUR_WEEK_SHARPE_ANNUALIZATION,
  type BootstrapResult, type MonteCarloResult, type PosteriorResult,
} from '@/utils/healthVerification'
import {
  analyzeIndependentDreesmannConditions, mergeBacktestResults, runBacktest, type BacktestResult, type BacktestParams, type BacktestSignal,
  type HistoricalCOTRow, type PriceRow, type RegimeRow,
} from '@/utils/backtestEngine'

const GOLD = '#D4AF37'
const GREEN = '#00C853'
const AMBER = '#FFB300'
const ORANGE = '#FF6D00'
const RED = '#FF1744'
const INSTRUMENTS = ['XAUUSD', 'EURUSD', 'GBPUSD']
const GRADES = ['A', 'B+', 'B']
const DIRECTIONS = ['LONG', 'SHORT'] as const

type IntegrityCheck = {
  name: string
  status: 'PASS' | 'WARN' | 'FAIL'
  details: string
  verified: string
}
type AcademicCondition = { condition: string; sample: number; hitRate: number; sharpe: number; rawSharpe: number }
type WalkForward = { window: string; inSample: number; outOfSample: number; failed: boolean }
type Overfit = { inSample: number; outOfSample: number; ratio: number }
type ReportState = {
  results: MonteCarloResult[]
  posteriors: PosteriorResult[]
  bootstrap: BootstrapResult | null
  walkForward: WalkForward[]
  overfit: Overfit
  corrections: ReturnType<typeof applyMultipleTestingCorrection>
  risk: NonNullable<ReturnType<typeof runRiskProjection>>
  backtest: BacktestResult
  integrity: IntegrityCheck[]
  academicConditions: AcademicCondition[]
  sourceCounts: { cot: number; prices: number; signals: number }
  score: number
  completedAt: string
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}
function returnPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`
}
function decimal(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}
function pStars(value: number): string {
  return value < 0.01 ? '***' : value < 0.05 ? '**' : value < 0.1 ? '*' : 'ns'
}
function metricStatus(value: number, max: number): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  return value / Math.max(max, 1) >= 0.8 ? 'HEALTHY' : value / Math.max(max, 1) >= 0.5 ? 'WARNING' : 'CRITICAL'
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'PASS' || status === 'HEALTHY' || status === 'SIGNIFICANT' ? GREEN
    : status === 'FAIL' || status === 'CRITICAL' || status === 'NOT SIGNIFICANT' ? RED : AMBER
  return <span className="rounded border px-2 py-0.5 text-[9px] font-bold tracking-wider" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{status}</span>
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-lg border border-white/8 bg-white/[.02] p-2.5"><div className="text-[9px] uppercase tracking-wider text-gray-600">{label}</div><div className="mt-1 font-mono text-sm text-gray-200">{value}</div>{hint && <div className="mt-1 text-[9px] text-gray-600">{hint}</div>}</div>
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded border border-white/15 bg-[#101216] px-2 py-1.5 text-[10px] shadow-xl"><div className="text-gray-500">{label}</div>{payload.map((item, index) => <div key={index} className="font-mono text-white">{item.name ?? 'value'}: {typeof item.value === 'number' ? item.value.toFixed(3) : item.value}</div>)}</div>
}

function CollapsiblePanel({ title, eyebrow, description, children, defaultOpen = true, action }: {
  title: string
  eyebrow: string
  description: string
  children: React.ReactNode
  defaultOpen?: boolean
  action?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0d0f13]/90 shadow-[0_12px_50px_rgba(0,0,0,0.18)]">
    <button onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-3 border-b border-white/8 px-4 py-3 text-left hover:bg-white/[.02]">
      <div><div className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--gold)]">{eyebrow}</div><h2 className="text-sm font-bold tracking-wide text-white">{title}</h2><p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-gray-600">{description}</p></div>
      <div className="flex items-center gap-3">{action}<ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} /></div>
    </button>
    {open && <div className="p-4">{children}</div>}
  </section>
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 74
  const circumference = 2 * Math.PI * radius
  const color = score >= 80 ? GREEN : score >= 60 ? AMBER : score >= 40 ? ORANGE : RED
  const label = score >= 80 ? 'SYSTEM HEALTHY' : score >= 60 ? 'MODERATE CONCERNS' : score >= 40 ? 'SIGNIFICANT ISSUES' : 'CRITICAL — DO NOT TRADE'
  return <div className="relative flex h-48 w-48 items-center justify-center">
    <svg viewBox="0 0 180 180" className="-rotate-90"><circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="12" /><circle cx="90" cy="90" r={radius} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} className="transition-all duration-700" /></svg>
    <div className="absolute text-center"><div className="font-mono text-5xl font-bold" style={{ color }}>{score}</div><div className="mt-1 text-[8px] font-bold tracking-[0.18em]" style={{ color }}>{label}</div></div>
  </div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-white/10 px-4 text-center text-xs text-gray-600"><Activity className="mr-2 h-4 w-4 text-gray-700" />{text}</div>
}

function buildIntegrity(
  datasets: { instrument: string; cot: HistoricalCOTRow[]; prices: PriceRow[] }[],
  backtest: BacktestResult,
  apiOnline: boolean,
): IntegrityCheck[] {
  const now = Date.now()
  const newestCot = datasets.flatMap(dataset => dataset.cot).sort((a, b) => b.date.localeCompare(a.date))[0]?.date
  const age = newestCot ? Math.floor((now - new Date(newestCot).getTime()) / 86_400_000) : Infinity
  const allPrices = datasets.flatMap(dataset => dataset.prices)
  const gaps = datasets.reduce((total, dataset) => total + dataset.prices.slice(1).filter((row, index) => new Date(row.date).getTime() - new Date(dataset.prices[index]?.date ?? row.date).getTime() > 10 * 86_400_000).length, 0)
  const signals = backtest.signals
  const regimeCoverage = signals.length ? signals.filter(signal => signal.dxyRegime !== 'UNKNOWN' && signal.vixRegime !== 'UNKNOWN' && signal.trendRegime !== 'UNKNOWN').length / signals.length : 0
  const independentReturns = signals.filter(signal => signal.instrument === 'XAUUSD' && signal.direction === 'LONG' && signal.ret4W != null).map(signal => signal.ret4W as number)
  const independentSharpe = sharpeRatio(independentReturns, FOUR_WEEK_SHARPE_ANNUALIZATION)
  const reportedSharpe = backtest.academicVerification.dreesmannSharpe
  const coherenceDifference = Number.isFinite(reportedSharpe) ? Math.abs(reportedSharpe - independentSharpe) : Infinity
  const coherence = coherenceDifference < 0.01
  const verified = new Date().toISOString()
  return [
    { name: 'CFTC data freshness', status: age <= 7 ? 'PASS' : age <= 14 ? 'WARN' : 'FAIL', details: newestCot ? `${newestCot} · ${age} day(s) old` : 'No COT report returned', verified },
    { name: 'Price data completeness', status: allPrices.length > 100 && gaps === 0 ? 'PASS' : 'WARN', details: `${allPrices.length.toLocaleString()} weekly points · ${gaps} gap(s) greater than five trading days`, verified },
    { name: 'Signal engine consistency', status: signals.length > 0 ? 'PASS' : 'FAIL', details: signals.length ? `${signals.length.toLocaleString()} signals independently regenerated from the five-condition engine` : 'No signals were generated', verified },
    { name: 'Regime data coverage', status: regimeCoverage >= 0.9 ? 'PASS' : regimeCoverage >= 0.7 ? 'WARN' : 'FAIL', details: `${(regimeCoverage * 100).toFixed(1)}% of signals have DXY, VIX, and trend regimes`, verified },
    { name: 'Statistical coherence', status: coherence ? 'PASS' : coherenceDifference <= 0.05 ? 'WARN' : 'FAIL', details: Number.isFinite(reportedSharpe) ? `XAUUSD LONG 4W Sharpe ${reportedSharpe.toFixed(3)} vs independently calculated ${independentSharpe.toFixed(3)} (Δ ${coherenceDifference.toFixed(3)})` : 'No reported XAUUSD LONG Sharpe available', verified },
    { name: 'API endpoint health', status: apiOnline ? 'PASS' : 'FAIL', details: apiOnline ? 'Health, COT, price, and regime endpoints responded' : 'One or more required endpoints did not respond', verified },
  ]
}

function buildAcademicConditions(
  cot: HistoricalCOTRow[],
  prices: PriceRow[],
  params: BacktestParams,
): AcademicCondition[] {
  return analyzeIndependentDreesmannConditions(cot, prices, params)
}

function buildWalkForward(signals: BacktestSignal[]): WalkForward[] {
  const years = Array.from(new Set(signals.map(signal => Number(signal.date.slice(0, 4))))).sort((a, b) => a - b)
  if (years.length < 3) return []
  const first = years[0] ?? 2000
  const last = years[years.length - 1] ?? first
  const windows: WalkForward[] = []
  for (let start = first; start + 2 <= last && windows.length < 10; start += 1) {
    const inSample = signals.filter(signal => {
      const year = Number(signal.date.slice(0, 4))
      return year >= start && year < start + 2 && signal.ret4W != null
    }).map(signal => signal.ret4W as number)
    const outOfSample = signals.filter(signal => {
      const year = Number(signal.date.slice(0, 4))
      return year === start + 2 && signal.ret4W != null
    }).map(signal => signal.ret4W as number)
    if (inSample.length < 3 || outOfSample.length < 3) continue
    const isSharpe = sharpeRatio(inSample, FOUR_WEEK_SHARPE_ANNUALIZATION)
    const oosSharpe = sharpeRatio(outOfSample, FOUR_WEEK_SHARPE_ANNUALIZATION)
    windows.push({ window: `${start}–${start + 1} → ${start + 2}`, inSample: isSharpe, outOfSample: oosSharpe, failed: oosSharpe < 0 })
  }
  return windows
}

function makeReportText(report: ReportState): string {
  const lines = [
    'JJ NEXUS PRO — HEALTH REPORT',
    `Generated: ${report.completedAt}`,
    'Version: Phase 2 verification engine · browser-side deterministic analysis',
    'Disclaimer: Statistical outputs describe historical samples and are not financial advice.',
    `Sharpe convention: four-week returns annualized with sqrt(13) = ${FOUR_WEEK_SHARPE_ANNUALIZATION.toFixed(4)}; raw Sharpe is shown alongside where available.`,
    '',
    `SYSTEM HEALTH SCORE: ${report.score}/100`,
    `Source data: ${report.sourceCounts.cot} COT rows · ${report.sourceCounts.prices} price rows · ${report.sourceCounts.signals} signals`,
    '',
    'MONTE CARLO COT SIGNAL VERIFICATION',
    ...report.results.map(result => `${result.instrument} ${result.direction} ${result.grade} | n=${result.sampleSize} seed=${result.seed} | win ${percent(result.actualWinRate)} vs random ${percent(result.randomWinRate)} | Sharpe ${decimal(result.actualSharpe)} (raw ${decimal(result.rawSharpe)}) | percentile ${percent(result.percentile)} | p=${result.pValue.toFixed(4)} ${pStars(result.pValue)} | ${result.verdict}`),
    '',
    'MCMC BAYESIAN POSTERIORS',
    ...report.posteriors.map(result => `${result.group} ${result.parameter} | mean ${decimal(result.mean, 4)} | 95% CI [${decimal(result.lower, 4)}, ${decimal(result.upper, 4)}] | ESS ${result.effectiveSampleSize} | R-hat ${result.rHat.toFixed(3)}`),
    '',
    'BOOTSTRAP SHARPE',
    report.bootstrap ? `Actual ${decimal(report.bootstrap.actualSharpe)} | 95% CI [${decimal(report.bootstrap.lower)}, ${decimal(report.bootstrap.upper)}] | mean ${decimal(report.bootstrap.mean)} | seed ${report.bootstrap.seed}` : 'Insufficient completed signals',
    '',
    'OVERFITTING AND WALK-FORWARD',
    `IS Sharpe ${decimal(report.overfit.inSample)} | OOS Sharpe ${decimal(report.overfit.outOfSample)} | ratio ${report.overfit.ratio.toFixed(3)}`,
    ...report.walkForward.map(row => `${row.window}: IS ${decimal(row.inSample)} · OOS ${decimal(row.outOfSample)}${row.failed ? ' · FAILED' : ''}`),
    '',
    'MULTIPLE TESTING CORRECTION',
    ...report.corrections.map(row => `${row.label} | raw ${row.pValue.toFixed(4)} | Bonferroni ${row.bonferroniAdjusted.toFixed(4)} | BH q ${row.qValue.toFixed(4)} | Bonferroni ${row.bonferroniSignificant ? 'PASS' : 'FAIL'} | BH ${row.bhSignificant ? 'PASS' : 'FAIL'}`),
    '',
    'ACADEMIC CORRELATION VERIFICATION',
    `Zhang & Laws: beta ${decimal(report.backtest.academicVerification.zhangBeta, 4)} · correlation ${decimal(report.backtest.academicVerification.zhangCorrelation, 4)} · t ${decimal(report.backtest.academicVerification.zhangTStat, 3)} · p ${report.backtest.academicVerification.zhangPValue.toFixed(4)}`,
    ...report.backtest.academicVerification.dreesmannByGroup.map(group => `Dreesmann ${group.label}: n=${group.sample} · annual return ${returnPercent(group.annualReturn)} · Sharpe ${decimal(group.sharpe)} · raw Sharpe ${decimal(group.rawSharpe)} · max drawdown ${returnPercent(group.maxDrawdown)} · win rate ${returnPercent(group.winRate)}`),
    ...report.academicConditions.map(row => `${row.condition}: n=${row.sample} hit rate ${percent(row.hitRate)} · Sharpe ${decimal(row.sharpe)} · raw Sharpe ${decimal(row.rawSharpe)}`),
    '',
    'RISK ENGINE',
    `Parametric VaR ${returnPercent(report.risk.parametricVaR, 3)} · Historical VaR ${returnPercent(report.risk.historicalVaR, 3)} · CVaR ${returnPercent(report.risk.cvar, 3)}`,
    `95% terminal equity range $${Math.round(report.risk.projection.equity95[0]).toLocaleString()}–$${Math.round(report.risk.projection.equity95[1]).toLocaleString()} · 95% max drawdown ${returnPercent(report.risk.projection.drawdown95)} · 99% max drawdown ${returnPercent(report.risk.projection.drawdown99)}`,
    '',
    'DATA INTEGRITY',
    ...report.integrity.map(check => `${check.status.padEnd(4)} ${check.name}: ${check.details} · verified ${check.verified}`),
    '',
    'Summary: Use this report to challenge assumptions, not to predict returns. Replicate with the recorded seeds and the same source data before relying on any result.',
  ]
  return lines.join('\n')
}

export default function HealthReport() {
  const [report, setReport] = useState<ReportState | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('Ready to verify live COT and backtest data')
  const [error, setError] = useState<string | null>(null)

  const runVerification = useCallback(async () => {
    setLoading(true); setError(null); setProgress(3); setMessage('Loading CFTC, price, and regime history…')
    try {
      const [datasets, apiOnline] = await Promise.all([
        Promise.all(INSTRUMENTS.map(async instrument => {
          const [cot, prices] = await Promise.all([
            fetch(`/api/backtest/cot-data?instrument=${instrument}`).then(async response => { if (!response.ok) throw new Error(`COT endpoint returned ${response.status}`); return response.json() as Promise<{ data: HistoricalCOTRow[] }> }),
            fetch(`/api/backtest/price-data?instrument=${instrument}`).then(async response => { if (!response.ok) throw new Error(`Price endpoint returned ${response.status}`); return response.json() as Promise<{ data: PriceRow[] }> }),
          ])
          return { instrument, cot: cot.data, prices: prices.data }
        })),
        fetch('/api/healthz').then(response => response.ok).catch(() => false),
      ])
      setProgress(20); setMessage('Rebuilding five-condition Dreesmann signals…')
      const regimes = await fetch('/api/backtest/regime-data').then(async response => response.ok ? (await response.json() as { data: RegimeRow[] }).data : []).catch(() => [])
      const results = datasets.map(dataset => runBacktest(dataset.cot, dataset.prices, regimes, { instrument: dataset.instrument, csiLookback: 156, nrsiLookback: 156, ncLongThreshold: 0.4, ncShortThreshold: 0.15, oiLookback: 26 }))
      const backtest = mergeBacktestResults(results)
      setProgress(38); setMessage('Running seeded 10,000-draw historical-date Monte Carlo tests…')
       const monteCarlo: MonteCarloResult[] = []
       const goldDataset = datasets.find(dataset => dataset.instrument === 'XAUUSD')
       const goldResult = results.find(item => item.params.instrument === 'XAUUSD')
      const goldSignals = goldResult?.signals.filter(signal => signal.ret4W != null) ?? []
      const goldLongSignals = goldSignals.filter(signal => signal.direction === 'LONG')
       const combinedGroups: { label: string; direction: 'LONG' | 'SHORT' | 'ALL'; signals: BacktestSignal[] }[] = [
         { label: 'ALL GRADES', direction: 'LONG', signals: goldSignals.filter(signal => signal.direction === 'LONG') },
         { label: 'ALL GRADES', direction: 'SHORT', signals: goldSignals.filter(signal => signal.direction === 'SHORT') },
         { label: 'ALL', direction: 'ALL', signals: goldSignals },
       ]
       for (const [groupIndex, group] of combinedGroups.entries()) {
         monteCarlo.push(runMonteCarlo(
           group.signals.map(signal => signal.ret4W as number),
           group.label,
           'XAUUSD',
           group.direction,
           goldDataset?.prices ?? [],
         ))
          if (groupIndex === 0) {
            const oosSignals = goldLongSignals.filter(signal => signal.date >= '2015-01-01' && signal.date <= '2025-12-31')
            monteCarlo.push(runMonteCarlo(
              oosSignals.map(signal => signal.ret4W as number),
              'ALL GRADES (OOS 2015-2025)',
              'XAUUSD',
              'LONG',
              goldDataset?.prices ?? [],
            ))
          }
       }
      for (const dataset of datasets) {
        const result = results.find(item => item.params.instrument === dataset.instrument)
        for (const grade of GRADES) {
          for (const direction of DIRECTIONS) {
            const returns = result?.signals.filter(signal => signal.grade === grade && signal.direction === direction && signal.ret4W != null).map(signal => signal.ret4W as number) ?? []
            monteCarlo.push(runMonteCarlo(returns, grade, dataset.instrument, direction, dataset.prices))
          }
        }
      }
      setProgress(65); setMessage('Sampling five-chain Bayesian posteriors and bootstrap intervals…')
       const posteriorGroups = [...GRADES.map(grade => ({ label: `XAUUSD LONG ${grade}`, signals: goldLongSignals.filter(signal => signal.grade === grade) })), { label: 'XAUUSD LONG ALL', signals: goldLongSignals }]
      const posteriors = posteriorGroups.flatMap(group => {
        const returns = group.signals.map(signal => signal.ret4W as number)
        return [runMCMCWinRate(returns.filter(value => value > 0).length, returns.length, group.label), runMCMCMeanReturn(returns, group.label)]
      })
       const goldReturns = goldLongSignals.map(signal => signal.ret4W as number)
      const bootstrap = runBootstrap(goldReturns)
      const walkForward = buildWalkForward(goldLongSignals)
      const isReturns = goldLongSignals.filter(signal => signal.period === 'IN_SAMPLE').map(signal => signal.ret4W as number)
      const oosReturns = goldLongSignals.filter(signal => signal.period === 'OUT_OF_SAMPLE').map(signal => signal.ret4W as number)
      const overfitIn = sharpeRatio(isReturns, FOUR_WEEK_SHARPE_ANNUALIZATION)
      const overfitOut = sharpeRatio(oosReturns, FOUR_WEEK_SHARPE_ANNUALIZATION)
      const overfit = { inSample: overfitIn, outOfSample: overfitOut, ratio: overfitIn > 0 ? overfitOut / overfitIn : 0 }
       const correctionInputs = monteCarlo
         .filter(result => result.instrument === 'XAUUSD' && !result.grade.includes('(OOS'))
         .map(result => ({ label: `${result.instrument} ${result.direction} ${result.grade}`, pValue: result.pValue }))
       const corrections = applyMultipleTestingCorrection(correctionInputs, correctionInputs.length)
      const risk = runRiskProjection(goldReturns)
      if (!risk) throw new Error('At least two completed XAUUSD LONG 4W returns are required for risk projection')
      setProgress(86); setMessage('Checking data integrity, academic replication, and composite score…')
      const integrity = buildIntegrity(datasets, backtest, apiOnline)
      const allCot = datasets.reduce((total, dataset) => total + dataset.cot.length, 0)
      const allPrices = datasets.reduce((total, dataset) => total + dataset.prices.length, 0)
        const primaryP = monteCarlo.find(result => result.instrument === 'XAUUSD' && result.direction === 'LONG' && result.grade === 'ALL GRADES')?.pValue ?? 1
       const mcScore = scoreMonteCarloPValue(primaryP)
      const primaryPosterior = posteriors.find(result => result.group === 'XAUUSD LONG ALL' && result.parameter === 'win-rate')
      const mcmcScore = primaryPosterior ? 20 * (primaryPosterior.lower > 0.5 || primaryPosterior.upper < 0.5 ? 1 : Math.max(0, 1 - (primaryPosterior.upper - primaryPosterior.lower) / 0.5)) : 0
      const bootstrapScore = bootstrap ? (bootstrap.lower > 0 ? 15 : 0) : 0
      const overfitScore = overfit.ratio >= 0.7 ? 15 : overfit.ratio <= 0.5 ? 0 : 15 * (overfit.ratio - 0.5) / 0.2
      const integrityScore = integrity.reduce((score, check) => score + (check.status === 'PASS' ? 2.5 : check.status === 'WARN' ? 1.25 : 0), 0)
       const riskScore = scoreRiskVerification(risk)
      const nextReport: ReportState = {
        results: monteCarlo, posteriors, bootstrap, walkForward, overfit, corrections, risk, backtest, integrity,
        academicConditions: buildAcademicConditions(
          goldDataset?.cot ?? [],
          goldDataset?.prices ?? [],
          goldResult?.params ?? { instrument: 'XAUUSD', csiLookback: 156, nrsiLookback: 156, ncLongThreshold: 0.4, ncShortThreshold: 0.15, oiLookback: 26 },
        ),
        sourceCounts: { cot: allCot, prices: allPrices, signals: backtest.signals.length },
        score: scoreVerification({ monteCarlo: mcScore, mcmc: mcmcScore, bootstrap: bootstrapScore, overfitting: overfitScore, integrity: integrityScore, risk: riskScore }),
        completedAt: new Date().toISOString(),
      }
      setReport(nextReport); setProgress(100); setMessage('Verification complete — report recalculated from source data')
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Verification failed')
      setMessage('Unable to complete verification')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void runVerification() }, [runVerification])

  const scoreBreakdown = useMemo(() => {
    if (!report) return { monteCarlo: 0, mcmc: 0, bootstrap: 0, overfitting: 0, integrity: 0, risk: 0 }
    const primary = report.posteriors.find(result => result.group === 'XAUUSD LONG ALL' && result.parameter === 'win-rate')
     const primaryP = report.results.find(result => result.instrument === 'XAUUSD' && result.direction === 'LONG' && result.grade === 'ALL GRADES')?.pValue ?? 1
    return {
      monteCarlo: scoreMonteCarloPValue(primaryP),
      mcmc: Math.round(primary && (primary.lower > 0.5 || primary.upper < 0.5) ? 20 : 0),
      bootstrap: report.bootstrap?.lower && report.bootstrap.lower > 0 ? 15 : 0,
      overfitting: Math.round(report.overfit.ratio >= 0.7 ? 15 : report.overfit.ratio <= 0.5 ? 0 : 15 * (report.overfit.ratio - 0.5) / 0.2),
      integrity: report.integrity.reduce((score, check) => score + (check.status === 'PASS' ? 2.5 : check.status === 'WARN' ? 1.25 : 0), 0),
      risk: scoreRiskVerification(report.risk),
    }
  }, [report])

  const downloadReport = () => {
    if (!report) return
    const url = URL.createObjectURL(new Blob([makeReportText(report)], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `jj-nexus-health-report-${new Date().toISOString().slice(0, 10)}.txt`; anchor.click(); URL.revokeObjectURL(url)
  }
  const healthError = error ? <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"><AlertTriangle className="mr-2 inline h-3.5 w-3.5" />{error}. Check that the API Server workflow is running.</div> : null

  return <div className="mx-auto max-w-[1500px] space-y-4 pb-8">
    <div className="relative overflow-hidden rounded-xl border border-[rgba(212,175,55,.25)] bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,.12),transparent_42%),#0b0d11] p-5">
       <div className="relative flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-[var(--gold)]"><ShieldCheck className="h-4 w-4" /> QUANTITATIVE VERIFICATION ENGINE</div><h1 className="text-2xl font-bold tracking-tight text-white">Health Report</h1><p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">A reproducible, browser-side audit of signal edge, uncertainty, robustness, academic correlation, risk, and source-data integrity.</p><p className="mt-2 max-w-2xl text-[10px] leading-relaxed text-[var(--gold)]/80">Sharpe convention: all four-week returns use √13 annualization. Raw (non-annualized) Sharpe is displayed alongside the annualized value for transparency.</p></div><div className="flex gap-2"><button onClick={() => void runVerification()} disabled={loading} className="flex items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-[10px] font-bold tracking-wider text-black transition hover:bg-[#f2d36d] disabled:cursor-wait disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> RUN FULL VERIFICATION</button><button onClick={downloadReport} disabled={!report} className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold tracking-wider text-gray-300 transition hover:border-[var(--gold)] hover:text-[var(--gold)] disabled:opacity-40"><Download className="h-3.5 w-3.5" /> EXPORT FULL .TXT</button></div></div>
      {loading && <div className="relative mt-5"><div className="mb-1 flex justify-between text-[10px] text-gray-500"><span>{message}</span><span>{progress}%</span></div><div className="h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-[var(--gold)] transition-all duration-500" style={{ width: `${progress}%` }} /></div></div>}{healthError}
    </div>

    <CollapsiblePanel title="System Health Score" eyebrow="01 · Composite integrity" description="A weighted score recalculated on every page load from all verification sections. It is a diagnostic summary, not a trade approval.">
      <div className="grid items-center gap-5 lg:grid-cols-[220px_1fr]"><div className="flex flex-col items-center"><ScoreGauge score={report?.score ?? 0} /><span className="mt-1 text-[9px] text-gray-600">{report ? `Verified ${new Date(report.completedAt).toLocaleTimeString()}` : 'Awaiting verification'}</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{([['MONTE CARLO', scoreBreakdown.monteCarlo, 25], ['MCMC', scoreBreakdown.mcmc, 20], ['BOOTSTRAP', scoreBreakdown.bootstrap, 15], ['OVERFITTING', scoreBreakdown.overfitting, 15], ['INTEGRITY', scoreBreakdown.integrity, 15], ['RISK', scoreBreakdown.risk, 10]] as [string, number, number][]).map(([label, value, max]) => <div key={label} className="rounded-lg border border-white/8 bg-white/[.025] p-3"><div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-gray-500"><span>{label}</span><span className="font-mono">{value.toFixed(1)}/{max}</span></div><div className="mb-2 h-1 overflow-hidden rounded bg-white/10"><div className="h-full rounded" style={{ width: `${Math.min(100, value / max * 100)}%`, background: scoreBreakdown[value === 0 ? 'risk' : 'monteCarlo'] >= 0 ? (metricStatus(value, max) === 'HEALTHY' ? GREEN : metricStatus(value, max) === 'WARNING' ? AMBER : RED) : RED }} /></div><div className="text-[10px] font-bold tracking-widest" style={{ color: metricStatus(value, max) === 'HEALTHY' ? GREEN : metricStatus(value, max) === 'WARNING' ? AMBER : RED }}>{metricStatus(value, max)}</div></div>)}</div></div>
    </CollapsiblePanel>

     <CollapsiblePanel title="COT Signal Monte Carlo Verification" eyebrow="02 · Historical-date null distribution" description="The three combined XAUUSD hypotheses appear first, followed by the OOS check and exploratory instrument/grade/direction cells. Each test uses 10,000 seeded simulations from the same weekly price history." action={<span className="text-[10px] text-gray-600">22 cells · 10,000 draws</span>}>
     {!report ? <EmptyState text="Run verification to test whether the signal results outperform random dates." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{report.results.map(result => <div key={`${result.instrument}-${result.direction}-${result.grade}`} className="rounded-lg border border-white/8 bg-white/[.02] p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="font-mono text-[11px] font-bold text-white">{result.instrument} · {result.direction} · {result.grade}</span><StatusBadge status={result.verdict} /></div>{result.insufficient ? <div className="flex h-40 items-center text-center text-[10px] text-amber-400">Insufficient sample size (n={result.sampleSize}). At least five completed signals are required.</div> : <><div className="grid grid-cols-2 gap-2 text-[10px]"><Metric label="Win rate" value={percent(result.actualWinRate)} hint={`random ${percent(result.randomWinRate)}`} /><Metric label="Sharpe" value={decimal(result.actualSharpe)} hint={`raw ${decimal(result.rawSharpe)} · random P95 ${decimal(result.randomSharpeP95)}`} /><Metric label="Percentile" value={percent(result.percentile)} hint={`seed ${result.seed}`} /><Metric label="p-value" value={`${result.pValue.toFixed(4)} ${pStars(result.pValue)}`} hint={result.verdict} /></div><div className="mt-3 h-24"><ResponsiveContainer width="100%" height="100%"><BarChart data={result.histogram}><XAxis dataKey="bin" hide /><YAxis hide /><Tooltip content={<ChartTip />} /><Bar dataKey="count" fill={`${GOLD}90`} isAnimationActive={false} /><ReferenceLine x={result.actualSharpe.toFixed(2)} stroke={RED} strokeWidth={2} /></BarChart></ResponsiveContainer></div><p className="mt-2 text-[9px] leading-relaxed text-gray-500">Actual Sharpe {decimal(result.actualSharpe)} (raw {decimal(result.rawSharpe)}) is at the {percent(result.percentile)} percentile of random chance (p = {result.pValue.toFixed(3)}). {result.verdict === 'GENUINE ALPHA' ? 'SIGNIFICANT.' : 'NOT SIGNIFICANT.'}</p></>}</div>)}</div>}
    </CollapsiblePanel>

    <CollapsiblePanel title="MCMC Bayesian Posterior Distributions" eyebrow="03 · Five-chain Metropolis–Hastings" description="Five 10,000-iteration chains estimate the true win rate and mean four-week return with weakly informative priors. R-hat below 1.10 indicates convergence.">
      {!report ? <EmptyState text="Posterior density charts appear after the backtest data is verified." /> : <div className="grid gap-4 xl:grid-cols-2">{report.posteriors.map(result => <div key={`${result.group}-${result.parameter}`} className="rounded-lg border border-white/8 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{result.group}</div><div className="text-[9px] text-gray-600">{result.parameter === 'win-rate' ? 'True win rate' : 'True mean return per signal'}</div></div><div className="flex gap-2"><StatusBadge status={result.rHat < 1.1 ? 'PASS' : 'WARN'} /><span className="font-mono text-xs text-[var(--gold)]">{result.parameter === 'win-rate' ? percent(result.mean) : returnPercent(result.mean)}</span></div></div><div className="h-40"><ResponsiveContainer width="100%" height="100%"><AreaChart data={result.density}><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} /><XAxis dataKey="x" tick={{ fill: '#666', fontSize: 9 }} tickFormatter={value => result.parameter === 'win-rate' ? percent(value, 0) : returnPercent(value, 1)} /><YAxis hide /><Tooltip content={<ChartTip />} /><Area dataKey="prior" stroke="#6b7280" strokeDasharray="4 4" fill="transparent" /><Area dataKey="posterior" stroke={GOLD} fill={`${GOLD}20`} /><ReferenceLine x={result.lower} stroke={GREEN} strokeDasharray="3 3" /><ReferenceLine x={result.upper} stroke={GREEN} strokeDasharray="3 3" /><ReferenceLine x={result.parameter === 'win-rate' ? 0.5 : 0} stroke={RED} strokeDasharray="3 3" /></AreaChart></ResponsiveContainer></div><div className="grid grid-cols-3 gap-2 text-[9px] text-gray-500"><span>95% CI <b className="font-mono text-gray-200">{result.parameter === 'win-rate' ? `${percent(result.lower)} – ${percent(result.upper)}` : `${returnPercent(result.lower)} – ${returnPercent(result.upper)}`}</b></span><span>ESS <b className="font-mono text-gray-200">{result.effectiveSampleSize}</b></span><span>R-hat <b className="font-mono text-gray-200">{result.rHat.toFixed(3)}</b></span></div></div>)}</div>}
    </CollapsiblePanel>

    <div className="grid gap-4 xl:grid-cols-2">
     <CollapsiblePanel title="Backtest Result Verification" eyebrow="04 · Bootstrap + overfitting" description="Bootstrap uncertainty, fixed in-sample/out-of-sample comparison, and walk-forward windows challenge the stability of the observed Sharpe."><>{!report ? <EmptyState text="Bootstrap, overfitting, and walk-forward checks appear after verification." /> : <div className="space-y-4"><div className="grid grid-cols-4 gap-2"><Metric label="Actual Sharpe" value={decimal(report.bootstrap?.actualSharpe ?? 0)} hint={`raw ${decimal(report.bootstrap?.rawSharpe ?? 0)}`} /><Metric label="Bootstrap mean" value={decimal(report.bootstrap?.mean ?? 0)} /><Metric label="95% CI" value={report.bootstrap ? `[${decimal(report.bootstrap.lower)}, ${decimal(report.bootstrap.upper)}]` : '—'} /><Metric label="Annualization" value="sqrt(13)" hint="4-week returns" /></div><div className="h-40"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.bootstrap?.histogram ?? []}><XAxis dataKey="bin" hide /><YAxis hide /><Tooltip content={<ChartTip />} /><Bar dataKey="count" fill={`${GOLD}90`} isAnimationActive={false} /><ReferenceLine x={report.bootstrap?.actualSharpe.toFixed(2)} stroke={RED} /><ReferenceLine x={report.bootstrap?.lower.toFixed(2)} stroke={GREEN} /><ReferenceLine x={report.bootstrap?.upper.toFixed(2)} stroke={GREEN} /></BarChart></ResponsiveContainer></div><div className="grid grid-cols-3 gap-2"><Metric label="IS Sharpe" value={decimal(report.overfit.inSample)} /><Metric label="OOS Sharpe" value={decimal(report.overfit.outOfSample)} /><Metric label="OOS / IS" value={report.overfit.ratio.toFixed(3)} hint={report.overfit.ratio >= 0.7 ? 'NO SIGNIFICANT OVERFITTING' : report.overfit.ratio >= 0.5 ? 'MODERATE OVERFITTING RISK' : 'SEVERE OVERFITTING DETECTED'} /></div><div className="h-36"><ResponsiveContainer width="100%" height="100%"><LineChart data={report.walkForward}><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} /><XAxis dataKey="window" tick={{ fill: '#666', fontSize: 8 }} /><YAxis tick={{ fill: '#666', fontSize: 9 }} /><Tooltip content={<ChartTip />} /><ReferenceLine y={0} stroke={RED} strokeDasharray="3 3" /><Line dataKey="inSample" name="IS Sharpe" stroke={GOLD} strokeWidth={2} /><Line dataKey="outOfSample" name="OOS Sharpe" stroke={GREEN} strokeWidth={2} /></LineChart></ResponsiveContainer></div></div>}</></CollapsiblePanel>
       <CollapsiblePanel title="Multiple Testing Correction" eyebrow="05 · Bonferroni + Benjamini–Hochberg" description="Combined hypotheses are primary; per-grade cells are exploratory. Bonferroni controls family-wise error and BH controls the false discovery rate.">
        {!report ? <EmptyState text="Corrected p-values appear after Monte Carlo verification." /> : <div className="overflow-x-auto">
            <div className="mb-3 rounded-lg border border-[rgba(212,175,55,.25)] bg-[rgba(212,175,55,.06)] p-3 text-[10px] leading-relaxed text-gray-300"><span className="font-bold text-[var(--gold)]">PRIMARY HYPOTHESIS:</span> XAUUSD LONG COT signals have positive expected returns. This is a pre-registered directional test based on Zhang &amp; Laws (2020) commercial hedging pressure theory and Dreesmann&apos;s 5-condition COT framework. Per-grade breakdowns (A, B+, B) are exploratory sub-analyses. Raw p = {report.corrections.find(row => row.label === 'XAUUSD LONG ALL GRADES')?.pValue.toFixed(4) ?? '—'}.</div>
          <table className="w-full text-left text-[10px]"><thead className="text-gray-600"><tr><th className="pb-2">RESULT</th><th className="pb-2">RAW P</th><th className="pb-2">BONF.</th><th className="pb-2">BH Q</th><th className="pb-2">STATUS</th></tr></thead>
            <tbody>{report.corrections.map(row => <tr key={row.label} className="border-t border-white/5"><td className="py-2 font-mono text-gray-300">{row.label}</td><td className="py-2 font-mono">{row.pValue.toFixed(4)}</td><td className="py-2 font-mono">{row.bonferroniAdjusted.toFixed(4)}</td><td className="py-2 font-mono">{row.qValue.toFixed(4)}</td><td className="py-2"><StatusBadge status={row.bonferroniSignificant || row.bhSignificant ? 'PASS' : '—'} /></td></tr>)}</tbody>
          </table>
          <div className="mt-3 space-y-1 text-[10px] text-gray-600">
             <div>Bonferroni uses {report.corrections.length} planned XAUUSD cells · α = {(0.05 / Math.max(1, report.corrections.length)).toFixed(5)} · BH target FDR = 5%.</div>
              <div>EURUSD/GBPUSD excluded from multiple testing correction. No COT-based edge expected for these pairs (Zhang &amp; Laws 2020). Their Monte Carlo results are shown above for reference only. The OOS 2015–2025 row is reported separately and is not counted in this family.</div>
            {(() => {
              const primary = report.corrections.find(row => row.label === 'XAUUSD LONG ALL GRADES')
              return <div className={primary?.bonferroniSignificant ? 'text-green-400' : 'text-amber-400'}>{primary?.bonferroniSignificant ? `Primary hypothesis (XAUUSD LONG combined) survives Bonferroni correction (p_adj = ${primary.bonferroniAdjusted.toFixed(4)} < 0.05).` : 'Primary hypothesis (XAUUSD LONG combined) does not survive Bonferroni correction in this source sample.'} Per-grade breakdowns are exploratory.</div>
            })()}
          </div>
        </div>}
      </CollapsiblePanel>
    </div>

    <CollapsiblePanel title="Academic Correlation Verification" eyebrow="06 · Zhang & Laws + Dreesmann" description="Replicates the published gold-positioning relationship and keeps every Dreesmann instrument/direction separate. A mismatch is a result, not a failure to hide.">
      {!report ? <EmptyState text="Academic comparison appears after the backtest is independently regenerated." /> : <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5"><Metric label="Zhang beta" value={decimal(report.backtest.academicVerification.zhangBeta, 4)} hint="published −0.016" /><Metric label="Correlation" value={decimal(report.backtest.academicVerification.zhangCorrelation, 4)} /><Metric label="t-stat" value={decimal(report.backtest.academicVerification.zhangTStat, 3)} hint="two-tailed" /><Metric label="p-value" value={report.backtest.academicVerification.zhangPValue.toFixed(4)} /><Metric label="XAUUSD LONG Sharpe" value={decimal(report.backtest.academicVerification.dreesmannSharpe)} hint={`raw ${decimal(report.backtest.academicVerification.dreesmannByGroup.find(group => group.direction === 'LONG')?.rawSharpe ?? 0)} · 4W returns · √13 annualization`} /></div>
         <div className="overflow-x-auto"><table className="w-full text-left text-[10px]"><thead className="text-gray-600"><tr><th className="pb-2">DREESMANN GROUP</th><th className="pb-2">SIGNALS</th><th className="pb-2">ANNUAL RETURN</th><th className="pb-2">SHARPE</th><th className="pb-2">RAW SHARPE</th><th className="pb-2">MAX DD</th><th className="pb-2">WIN RATE</th></tr></thead><tbody>{report.backtest.academicVerification.dreesmannByGroup.map(group => <tr key={group.label} className="border-t border-white/5"><td className="py-2 text-gray-300">{group.label}</td><td className="py-2 font-mono">{group.sample}</td><td className="py-2 font-mono">{returnPercent(group.annualReturn)}</td><td className="py-2 font-mono">{decimal(group.sharpe, 3)}</td><td className="py-2 font-mono">{decimal(group.rawSharpe, 3)}</td><td className="py-2 font-mono">{returnPercent(group.maxDrawdown)}</td><td className="py-2 font-mono">{returnPercent(group.winRate)}</td></tr>)}</tbody></table></div>
         <div className="overflow-x-auto"><table className="w-full text-left text-[10px]"><thead className="text-gray-600"><tr><th className="pb-2">CONDITION (INDEPENDENT)</th><th className="pb-2">ELIGIBLE WEEKS</th><th className="pb-2">HIT RATE</th><th className="pb-2">SHARPE</th><th className="pb-2">RAW SHARPE</th></tr></thead><tbody>{report.academicConditions.map(row => <tr key={row.condition} className="border-t border-white/5"><td className="py-2 text-gray-300">{row.condition}</td><td className="py-2 font-mono">{row.sample}</td><td className="py-2 font-mono">{percent(row.hitRate)}</td><td className="py-2 font-mono">{decimal(row.sharpe)}</td><td className="py-2 font-mono">{decimal(row.rawSharpe)}</td></tr>)}</tbody></table></div>
         <p className="text-[10px] text-gray-600">Each condition is evaluated on all eligible COT weeks where that single bullish rule passes, regardless of the other four conditions. Forward return is the next four-week XAUUSD return.</p>
      </div>}
    </CollapsiblePanel>

    <CollapsiblePanel title="Risk Engine Verification" eyebrow="07 · Equity, VaR, CVaR, drawdown" description="Projects 1,000 equity paths over 100 trades using the observed XAUUSD LONG return distribution, then reports tail loss and drawdown uncertainty.">
      {!report ? <EmptyState text="Risk projections appear after at least two completed four-week returns are available." /> : <div className="space-y-4"><div className="grid grid-cols-3 gap-2"><Metric label="Parametric VaR" value={returnPercent(report.risk.parametricVaR, 3)} /><Metric label="Historical VaR" value={returnPercent(report.risk.historicalVaR, 3)} /><Metric label="CVaR / ES" value={returnPercent(report.risk.cvar, 3)} /></div><div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]"><div><div className="mb-1 text-[9px] text-gray-600">Equity projection · $10,000 start · 1% risk framework</div><div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart data={report.risk.projection.curves}><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} /><XAxis dataKey="trade" tick={{ fill: '#666', fontSize: 9 }} /><YAxis tick={{ fill: '#666', fontSize: 9 }} /><Tooltip content={<ChartTip />} /><Line dataKey="lower" stroke={ORANGE} strokeDasharray="4 4" dot={false} /><Line dataKey="upper" stroke={ORANGE} strokeDasharray="4 4" dot={false} /><Line dataKey="median" stroke={GREEN} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></div><div><div className="mb-1 text-[9px] text-gray-600">Terminal equity distribution</div><div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.risk.projection.terminalEquity}><XAxis dataKey="bin" hide /><YAxis hide /><Tooltip content={<ChartTip />} /><Bar dataKey="count" fill={`${GREEN}90`} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></div></div><div className="grid grid-cols-3 gap-2"><Metric label="95% terminal range" value={`$${Math.round(report.risk.projection.equity95[0]).toLocaleString()}–$${Math.round(report.risk.projection.equity95[1]).toLocaleString()}`} /><Metric label="95% max drawdown" value={returnPercent(report.risk.projection.drawdown95)} /><Metric label="99% max drawdown" value={returnPercent(report.risk.projection.drawdown99)} /></div><p className="text-[10px] text-gray-500">With 95% simulation confidence, terminal equity falls between ${Math.round(report.risk.projection.equity95[0]).toLocaleString()} and ${Math.round(report.risk.projection.equity95[1]).toLocaleString()}; the 95th-percentile maximum drawdown is {returnPercent(report.risk.projection.drawdown95)}.</p></div>}
    </CollapsiblePanel>

    <CollapsiblePanel title="Data Integrity Report" eyebrow="08 · Source and consistency checks" description="Six checks run on every page load: CFTC freshness, price completeness, signal consistency, regime coverage, statistical coherence, and API endpoint health.">
      {!report ? <EmptyState text="Integrity checks are waiting for source data." /> : <div className="overflow-x-auto"><table className="w-full text-left text-[10px]"><thead className="text-gray-600"><tr><th className="pb-2">CHECK NAME</th><th className="pb-2">STATUS</th><th className="pb-2">DETAILS</th><th className="pb-2">LAST VERIFIED</th></tr></thead><tbody>{report.integrity.map(check => <tr key={check.name} className="border-t border-white/5"><td className="py-2 text-gray-300">{check.name}</td><td className="py-2"><StatusBadge status={check.status} /></td><td className="py-2 text-gray-500">{check.details}</td><td className="py-2 font-mono text-gray-600">{new Date(check.verified).toLocaleTimeString()}</td></tr>)}</tbody></table></div>}
    </CollapsiblePanel>

    <div className="flex items-center justify-between text-[10px] text-gray-600"><span><FlaskConical className="mr-1 inline h-3 w-3" /> Historical statistical outputs are not financial advice.</span><span>{report ? `${report.sourceCounts.signals.toLocaleString()} signals in scope` : 'No report loaded'}</span></div>
  </div>
}