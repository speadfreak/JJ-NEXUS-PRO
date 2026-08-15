/**
 * COT Backtest Engine — Pure Functions
 *
 * Implements Dreesmann et al. (2023) 5-condition signal engine over
 * 20+ years of historical COT data. All functions are pure and testable.
 *
 * Academic references:
 * - Dreesmann, S., Herberger, T.A. and Charifzadeh, M. (2023)
 * - Zhang, Y. and Laws, J. (2013)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

import { FOUR_WEEK_SHARPE_ANNUALIZATION, sharpeAnnualizationForWeeks } from './healthVerification'

export interface HistoricalCOTRow {
  date: string
  commLong: number
  commShort: number
  nonCommLong: number
  nonCommShort: number
  nonCommSpreads: number
  nonRepLong: number
  nonRepShort: number
  totalOI: number
}

export interface PriceRow {
  date: string
  close: number
}

export interface RegimeRow {
  date: string
  dxy: number | null
  vix: number | null
  dxyRegime: string
  vixRegime: string
}

export interface BacktestParams {
  instrument: string
  csiLookback: number        // default 156 weeks
  nrsiLookback: number       // default 156 weeks
  ncLongThreshold: number    // default 0.40
  ncShortThreshold: number   // default 0.15
  oiLookback: number         // default 26 (for 26-week index — kept for compat)
}

export interface BacktestSignal {
  date: string
  instrument: string
  direction: 'LONG' | 'SHORT'
  grade: 'A' | 'B+' | 'B' | 'C'
  conditions: [boolean, boolean, boolean, boolean, boolean]
  conditionsMet: number
  entryPrice: number
  // CSI, NCSI values at signal time
  csi: number
  ncPct: number
  nrsi: number
  commercialNetChange: number
  marketRet4W: number | null
  // Forward returns (%)
  ret1W:  number | null
  ret4W:  number | null
  ret8W:  number | null
  ret12W: number | null
  ret26W: number | null
  mfe4W:  number | null
  mae4W:  number | null
  // Regime at signal time
  dxyRegime: string
  vixRegime: string
  trendRegime: string
  // Period
  period: 'IN_SAMPLE' | 'OUT_OF_SAMPLE'
}

export interface PerformanceMetrics {
  grade: string
  instrument: string
  holdingPeriod: '1W' | '4W' | '8W' | '12W' | '26W'
  signals: number
  winRate: number
  avgReturn: number
  medianReturn: number
  stdDev: number
  rawSharpe: number
  sharpe: number
  sortino: number
  calmar: number
  profitFactor: number
  expectancy: number
  maxDrawdown: number
  tStat: number
  pValue: number
  avgMFE: number
  avgMAE: number
  benchmarkWinRate: number
  benchmarkAvgReturn: number
  benchmarkSharpe: number
}

export interface EquityPoint {
  date: string
  strategyEquity: number
  benchmarkEquity: number
  drawdown: number
}

export interface BacktestResult {
  signals: BacktestSignal[]
  metrics: PerformanceMetrics[]
  equityCurve4W: EquityPoint[]
  regimeMetrics: RegimePerformance[]
  gradeDistribution: { grade: string; count: number; bullish: number; bearish: number }[]
  signalsByYear: { year: number; A: number; 'B+': number; B: number; C: number }[]
  timeDemand: { weeks: number; sharpe: number; winRate: number; avgReturn: number }[]
  academicVerification: AcademicVerification
  inSampleMetrics: PerformanceMetrics[]
  outSampleMetrics: PerformanceMetrics[]
  params: BacktestParams
}

export interface RegimePerformance {
  regimeDimension: string
  regimeState: string
  signals: number
  winRate: number
  avgReturn: number
  sharpe: number
  pValue: number
}

export interface AcademicVerification {
  // Dreesmann replication
  dreesmannCumReturn: number
  dreesmannAnnReturn: number
  dreesmannSharpe: number
  dreesmannMaxDD: number
  dreesmannWinRate: number
  dreesmannPublishedSharpe: number  // 1.24–2.09 from paper
  // Zhang & Laws correlation
  zhangCorrelation: number
  zhangBeta: number
  zhangTStat: number
  zhangPValue: number
  zhangPublishedBeta: number        // -0.016
  zhangPublishedTStat: number       // -5.696
  dreesmannByGroup: DreesmannGroup[]
}

export interface DreesmannGroup {
  label: string
  instrument: string
  direction: 'LONG' | 'SHORT' | 'BOTH'
  sample: number
  cumulativeReturn: number
  annualReturn: number
  sharpe: number
  rawSharpe: number
  maxDrawdown: number
  winRate: number
}

export interface IndependentConditionResult {
  condition: string
  sample: number
  hitRate: number
  sharpe: number
  rawSharpe: number
}

// ── Math helpers ───────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1))
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Two-tailed p-value from t-statistic using approximation */
function pValueFromTStat(tStat: number, df: number): number {
  if (df <= 0) return 1
  const absoluteT = Math.abs(tStat)
  if (!Number.isFinite(absoluteT)) return 0
  const x = df / (df + absoluteT * absoluteT)
  // The two-tailed Student-t probability is the regularised incomplete beta
  // function I_x(df/2, 1/2). The previous series was not a continued
  // fraction and could collapse small correlations to p=0.
  return Math.min(1, Math.max(0, betaInc(x, 0.5 * df, 0.5)))
}

function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b)
  const front = Math.exp(a * Math.log(x) + b * Math.log1p(-x) - lbeta)
  if (x < (a + 1) / (a + b + 2)) return front * betaContinuedFraction(x, a, b) / a
  return 1 - front * betaContinuedFraction(1 - x, b, a) / b
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const maxIterations = 200
  const epsilon = 3e-12
  const minimum = 1e-30
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - qab * x / qap
  d = Math.abs(d) < minimum ? minimum : d
  d = 1 / d
  let h = d
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    d = Math.abs(d) < minimum ? minimum : d
    c = 1 + aa / c
    c = Math.abs(c) < minimum ? minimum : c
    d = 1 / d
    h *= d * c
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    d = Math.abs(d) < minimum ? minimum : d
    c = 1 + aa / c
    c = Math.abs(c) < minimum ? minimum : c
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < epsilon) break
  }
  return h
}

function lgamma(z: number): number {
  // Stirling approximation
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  z -= 1
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i]! / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function downsideStd(arr: number[], rf = 0): number {
  const neg = arr.filter(x => x < rf)
  if (neg.length < 2) return std(arr) || 1
  return Math.sqrt(neg.reduce((s, x) => s + (x - rf) ** 2, 0) / neg.length)
}

function maxDrawdown(equity: number[]): number {
  let peak = equity[0] ?? 1
  let mdd = 0
  for (const v of equity) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > mdd) mdd = dd
  }
  return mdd
}

/** Compute index (Wang/Dreesmann) over a lookback window */
function computeIndex(currentNet: number, history: number[]): number {
  if (history.length < 2) return 0.5
  const min = Math.min(...history)
  const max = Math.max(...history)
  if (max === min) return 0.5
  return Math.max(0, Math.min(1, (currentNet - min) / (max - min)))
}

/** Align COT date to nearest price date (within 7 days) */
function findNearestPrice(
  targetDate: string,
  priceMap: Map<string, number>,
  dates: string[],
): number | null {
  if (priceMap.has(targetDate)) return priceMap.get(targetDate)!
  const t = new Date(targetDate).getTime()
  let best: number | null = null
  let bestDiff = Infinity
  for (const d of dates) {
    const diff = Math.abs(new Date(d).getTime() - t)
    if (diff < bestDiff && diff < 7 * 86400_000) {
      bestDiff = diff
      best = priceMap.get(d)!
    }
  }
  return best
}

/** Align COT date to nearest regime row (within 7 days) — COT dates are Fridays, Yahoo dates are Mondays */
function findNearestRegime(
  targetDate: string,
  regimeMap: Map<string, RegimeRow>,
  dates: string[],
): RegimeRow | undefined {
  if (regimeMap.has(targetDate)) return regimeMap.get(targetDate)
  const t = new Date(targetDate).getTime()
  let best: RegimeRow | undefined
  let bestDiff = Infinity
  for (const d of dates) {
    const diff = Math.abs(new Date(d).getTime() - t)
    if (diff < bestDiff && diff < 7 * 86400_000) {
      bestDiff = diff
      best = regimeMap.get(d)
    }
  }
  return best
}

/** Trend regime from price vs SMAs */
function trendRegime(closes: number[], index: number): string {
  if (index < 40) return 'UNKNOWN'
  const sma10 = mean(closes.slice(index - 10, index))
  const sma40 = mean(closes.slice(index - 40, index))
  const price = closes[index]!
  if (price > sma10 && price > sma40) return 'BULL'
  if (price < sma10 && price < sma40) return 'BEAR'
  return 'RANGING'
}

/**
 * Evaluate each bullish Dreesmann condition independently. Unlike the signal
 * engine, this intentionally does not require the other four conditions to
 * pass, so the sample is all eligible COT weeks rather than only full signals.
 */
export function analyzeIndependentDreesmannConditions(
  cotData: HistoricalCOTRow[],
  priceData: PriceRow[],
  params: BacktestParams,
): IndependentConditionResult[] {
  const cot = [...cotData].sort((a, b) => a.date.localeCompare(b.date))
  const prices = [...priceData].sort((a, b) => a.date.localeCompare(b.date))
  const priceMap = new Map(prices.map(row => [row.date, row.close]))
  const priceDates = prices.map(row => row.date)
  const lookback = Math.max(params.csiLookback, params.nrsiLookback, 26)
  const returnsByCondition = Array.from({ length: 5 }, () => [] as number[])

  for (let i = lookback; i < cot.length - 5; i += 1) {
    const row = cot[i]
    const previous = cot[i - 1]
    if (!row || !previous) continue

    const commNet = row.commLong - row.commShort
    const nonCommNet = row.nonCommLong - row.nonCommShort
    const nonRepNet = row.nonRepLong - row.nonRepShort
    const histComm = cot.slice(i - params.csiLookback, i + 1).map(item => item.commLong - item.commShort)
    const histNonComm = cot.slice(i - params.csiLookback, i + 1).map(item => item.nonCommLong - item.nonCommShort)
    const histNonRep = cot.slice(i - params.nrsiLookback, i + 1).map(item => item.nonRepLong - item.nonRepShort)
    const csi = computeIndex(commNet, histComm)
    const nrsi = computeIndex(nonRepNet, histNonRep)
    const ncLongPct = row.totalOI > 0 ? row.nonCommLong / row.totalOI : 0
    const oiWoW = row.totalOI > previous.totalOI
    const oi4w = i >= 4
      ? mean(cot.slice(i - 3, i + 1).map(item => item.totalOI)) > mean(cot.slice(i - 4, i).map(item => item.totalOI))
      : false
    const commLongChange = row.commLong - previous.commLong
    const ncShortChange = row.nonCommShort - previous.nonCommShort
    const conditions: [boolean, boolean, boolean, boolean, boolean] = [
      csi < 0.30,
      ncLongPct < params.ncShortThreshold,
      nrsi < 0.30,
      oiWoW || oi4w,
      commLongChange > 0 && ncShortChange > 0,
    ]

    const entryPrice = findNearestPrice(cot[i + 1]?.date ?? row.date, priceMap, priceDates)
    const futurePrice = findNearestPrice(cot[i + 5]?.date ?? row.date, priceMap, priceDates)
    if (entryPrice == null || futurePrice == null || entryPrice <= 0) continue
    const forwardReturn = (futurePrice - entryPrice) / entryPrice * 100
    conditions.forEach((passes, index) => {
      if (passes) returnsByCondition[index]?.push(forwardReturn)
    })
  }

  return ['CSI', 'NC%', 'NRSI', 'OI Trend', 'WoW Change'].map((condition, index) => {
    const returns = returnsByCondition[index] ?? []
    const rawSharpe = std(returns) > 0 ? mean(returns) / std(returns) : 0
    return {
      condition,
      sample: returns.length,
      hitRate: returns.length ? returns.filter(value => value > 0).length / returns.length : 0,
      sharpe: rawSharpe * FOUR_WEEK_SHARPE_ANNUALIZATION,
      rawSharpe,
    }
  })
}

// ── Core Backtest Engine ───────────────────────────────────────────────────────

export function runBacktest(
  cotData: HistoricalCOTRow[],
  priceData: PriceRow[],
  regimeData: RegimeRow[],
  params: BacktestParams,
  onProgress?: (pct: number) => void,
): BacktestResult {
  // ── 1. Sort data oldest-first ────────────────────────────────────────────────
  const cot = [...cotData].sort((a, b) => a.date.localeCompare(b.date))
  const prices = [...priceData].sort((a, b) => a.date.localeCompare(b.date))
  const regimes = [...regimeData].sort((a, b) => a.date.localeCompare(b.date))

  const priceMap = new Map(prices.map(r => [r.date, r.close]))
  const priceDates = prices.map(r => r.date)
  const regimeMap = new Map(regimes.map(r => [r.date, r]))
  const regimeDates = regimes.map(r => r.date)          // for nearest-date lookup
  const priceCloses = prices.map(r => r.close)
  const priceDatesList = prices.map(r => r.date)

  const n = cot.length
  const lookback = Math.max(params.csiLookback, params.nrsiLookback, 26)

  // In-sample cutoff: 70% of data
  const cutoffIndex = Math.floor(n * 0.70)
  const cutoffDate = cot[cutoffIndex]?.date ?? '2015-01-01'

  const signals: BacktestSignal[] = []

  // ── 2. Iterate every COT week from lookback onwards ───────────────────────────
  for (let i = lookback; i < n - 26; i++) {
    const row = cot[i]!
    if (!row) continue

    const commNet    = row.commLong - row.commShort
    const nonCommNet = row.nonCommLong - row.nonCommShort
    const nonRepNet  = row.nonRepLong - row.nonRepShort

    // Build history arrays for CSI lookback
    const histComm    = cot.slice(i - params.csiLookback,  i + 1).map(r => r.commLong - r.commShort)
    const histNonComm = cot.slice(i - params.csiLookback,  i + 1).map(r => r.nonCommLong - r.nonCommShort)
    const histNonRep  = cot.slice(i - params.nrsiLookback, i + 1).map(r => r.nonRepLong - r.nonRepShort)

    const csi  = computeIndex(commNet, histComm)
    const nrsi = computeIndex(nonRepNet, histNonRep)
    const ncsi = computeIndex(nonCommNet, histNonComm)

    // NC Long % of total OI (Dreesmann condition 2)
    const ncLongPct = row.totalOI > 0 ? row.nonCommLong / row.totalOI : 0

    // OI trend (condition 4): OI increasing WoW OR 4-week MA of OI rising
    const prevRow = cot[i - 1]!
    const oiWoW = row.totalOI > (prevRow?.totalOI ?? 0)
    const oi4w  = i >= 4
      ? mean(cot.slice(i - 3, i + 1).map(r => r.totalOI)) >
        mean(cot.slice(i - 4, i).map(r => r.totalOI))
      : false
    const oiRising = oiWoW || oi4w

    // Condition 5: WoW change confirmation
    const commLongChange    = row.commLong     - (prevRow?.commLong    ?? row.commLong)
    const commShortChange   = row.commShort    - (prevRow?.commShort   ?? row.commShort)
    const ncLongChange      = row.nonCommLong  - (prevRow?.nonCommLong ?? row.nonCommLong)
    const ncShortChange     = row.nonCommShort - (prevRow?.nonCommShort ?? row.nonCommShort)

    // ── LONG conditions ────────────────────────────────────────────────────────
    // CSI LOW = commercials maximally net-short = hedging peak → contrarian LONG
    const longC: [boolean, boolean, boolean, boolean, boolean] = [
      csi < 0.30,                             // commercials net-short extreme → bullish reversal
      ncLongPct < params.ncShortThreshold,   // speculative longs low (crowd bearish → contrarian)
      nrsi < 0.30,                            // retail maximally net-short → contrarian LONG
      oiRising,
      commLongChange > 0 && ncShortChange > 0,
    ]

    // ── SHORT conditions ───────────────────────────────────────────────────────
    // CSI HIGH = commercials maximally net-long = over-hedged into rally → contrarian SHORT
    const shortC: [boolean, boolean, boolean, boolean, boolean] = [
      csi > 0.70,                             // commercials net-long extreme → bearish reversal
      ncLongPct > params.ncLongThreshold,    // speculative longs extreme (crowd bullish → contrarian)
      nrsi > 0.70,                            // retail maximally net-long → contrarian SHORT
      oiRising,
      commShortChange > 0 && ncLongChange > 0,
    ]

    const longScore  = longC.filter(Boolean).length
    const shortScore = shortC.filter(Boolean).length

    let direction: 'LONG' | 'SHORT' | null = null
    let score = 0
    let conditions: [boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false]

    if (longScore >= 2 && longScore >= shortScore) {
      direction = 'LONG'
      score = longScore
      conditions = longC
    } else if (shortScore >= 2 && shortScore > longScore) {
      direction = 'SHORT'
      score = shortScore
      conditions = shortC
    }

    if (!direction) continue

    const grade: 'A' | 'B+' | 'B' | 'C' =
      score === 5 ? 'A' :
      score === 4 ? 'A' :
      score === 3 ? 'B+' :
      score === 2 ? 'B' :
      'C'

    // Entry price = close of week AFTER signal (simulates Friday publication lag)
    const entryDate = cot[i + 1]?.date ?? row.date
    const entryPrice = findNearestPrice(entryDate, priceMap, priceDates)
    if (!entryPrice) continue

    // Forward returns
    const forwardWeeks = [1, 4, 8, 12, 26] as const
    const returns: Record<number, number | null> = {}
    for (const w of forwardWeeks) {
      const futureRow = cot[i + 1 + w]
      if (!futureRow) { returns[w] = null; continue }
      const futurePrice = findNearestPrice(futureRow.date, priceMap, priceDates)
      if (!futurePrice) { returns[w] = null; continue }
      const ret = direction === 'LONG'
        ? (futurePrice - entryPrice) / entryPrice * 100
        : (entryPrice - futurePrice) / entryPrice * 100
      returns[w] = parseFloat(ret.toFixed(4))
    }

    // MFE/MAE over 4W window
    let mfe4W = 0, mae4W = 0
    for (let w = 1; w <= 4; w++) {
      const futureRow = cot[i + 1 + w]
      if (!futureRow) continue
      const fp = findNearestPrice(futureRow.date, priceMap, priceDates)
      if (!fp) continue
      const r = direction === 'LONG'
        ? (fp - entryPrice) / entryPrice * 100
        : (entryPrice - fp) / entryPrice * 100
      if (r > mfe4W) mfe4W = r
      if (r < mae4W) mae4W = r
    }

    // Regime at signal date — use nearest-date lookup (COT=Friday, Yahoo=Monday)
    const regime = findNearestRegime(row.date, regimeMap, regimeDates)
    const dxyR = regime?.dxyRegime ?? 'UNKNOWN'
    const vixR = regime?.vixRegime ?? 'UNKNOWN'

    // Price-based trend regime
    const priceIdx = priceDatesList.findIndex(d => d >= row.date)
    const trendR = priceIdx >= 40 ? trendRegime(priceCloses, priceIdx) : 'UNKNOWN'

    signals.push({
      date: row.date,
      instrument: params.instrument,
      direction,
      grade,
      conditions,
      conditionsMet: score,
      entryPrice,
      csi: parseFloat(csi.toFixed(4)),
      ncPct: parseFloat(ncLongPct.toFixed(4)),
      nrsi: parseFloat(nrsi.toFixed(4)),
      commercialNetChange: parseFloat((commLongChange - commShortChange).toFixed(4)),
      marketRet4W: returns[4] == null || !entryPrice || !findNearestPrice(cot[i + 5]?.date ?? row.date, priceMap, priceDates)
        ? null
        : parseFloat(((findNearestPrice(cot[i + 5]!.date, priceMap, priceDates)! - entryPrice) / entryPrice * 100).toFixed(4)),
      ret1W:  returns[1] ?? null,
      ret4W:  returns[4] ?? null,
      ret8W:  returns[8] ?? null,
      ret12W: returns[12] ?? null,
      ret26W: returns[26] ?? null,
      mfe4W: parseFloat(mfe4W.toFixed(4)),
      mae4W: parseFloat(mae4W.toFixed(4)),
      dxyRegime: dxyR,
      vixRegime: vixR,
      trendRegime: trendR,
      period: row.date < cutoffDate ? 'IN_SAMPLE' : 'OUT_OF_SAMPLE',
    })

    if (onProgress && i % 50 === 0) {
      onProgress(Math.round(((i - lookback) / (n - lookback - 26)) * 70))
    }
  }

  onProgress?.(75)

  // ── 3. Compute performance metrics ────────────────────────────────────────────
  const holdingPeriods: ('1W' | '4W' | '8W' | '12W' | '26W')[] = ['1W', '4W', '8W', '12W', '26W']
  const grades = ['A', 'B+', 'B', 'C', 'ALL']

  const metrics: PerformanceMetrics[] = []
  const inSampleMetrics: PerformanceMetrics[] = []
  const outSampleMetrics: PerformanceMetrics[] = []

  for (const g of grades) {
    for (const hp of holdingPeriods) {
      const retKey: keyof BacktestSignal = hp === '1W' ? 'ret1W' : hp === '4W' ? 'ret4W' : hp === '8W' ? 'ret8W' : hp === '12W' ? 'ret12W' : 'ret26W'
      const holdWeeks = parseInt(hp)

      for (const period of ['ALL', 'IN_SAMPLE', 'OUT_OF_SAMPLE'] as const) {
        const subset = signals.filter(s => {
          const gradeMatch = g === 'ALL' || s.grade === g
          const periodMatch = period === 'ALL' || s.period === period
          return gradeMatch && periodMatch
        })

        const returns = subset.map(s => s[retKey]).filter(r => r != null) as number[]
        if (returns.length < 5) continue

        const wins = returns.filter(r => r > 0)
        const losses = returns.filter(r => r < 0)
        const winRate = returns.length > 0 ? wins.length / returns.length * 100 : 0
        const avgRet = mean(returns)
        const stdDev = std(returns)
        const annFactor = sharpeAnnualizationForWeeks(holdWeeks)
        const sharpe = stdDev > 0 ? (avgRet / stdDev) * annFactor : 0
        const dStd = downsideStd(returns)
        const sortino = dStd > 0 ? (avgRet / dStd) * annFactor : 0
        const profitFactor = losses.length > 0
          ? Math.abs(wins.reduce((a, b) => a + b, 0)) / Math.abs(losses.reduce((a, b) => a + b, 0))
          : 99
        const avgWin  = wins.length  > 0 ? mean(wins)   : 0
        const avgLoss = losses.length > 0 ? Math.abs(mean(losses)) : 0
        const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss
        const tStat = stdDev > 0 ? (avgRet / (stdDev / Math.sqrt(returns.length))) : 0
        const pVal = pValueFromTStat(tStat, returns.length - 1)

        // Equity curve for MDD
        let eq = 100
        const eqCurve = returns.map(r => { eq *= (1 + r / 100); return eq })
        const mdd = maxDrawdown(eqCurve) * 100
        const calmar = mdd > 0 ? avgRet * (52 / holdWeeks) / mdd : 0

        // Benchmark (naive buy-and-hold same signal dates)
        const benchReturns = subset.map(s => s[retKey]).filter(r => r != null) as number[]
        const bWinRate = benchReturns.filter(r => r > 0).length / (benchReturns.length || 1) * 100
        const bAvgRet  = mean(benchReturns)
        const bStd     = std(benchReturns)
        const bSharpe  = bStd > 0 ? (bAvgRet / bStd) * annFactor : 0

        const m: PerformanceMetrics = {
          grade: g, instrument: params.instrument, holdingPeriod: hp,
          signals: returns.length, winRate, avgReturn: avgRet, medianReturn: median(returns),
          stdDev, rawSharpe: stdDev > 0 ? avgRet / stdDev : 0, sharpe, sortino, calmar, profitFactor, expectancy, maxDrawdown: mdd,
          tStat, pValue: pVal, avgMFE: mean(subset.map(s => s.mfe4W ?? 0)),
          avgMAE: mean(subset.map(s => s.mae4W ?? 0)),
          benchmarkWinRate: bWinRate, benchmarkAvgReturn: bAvgRet, benchmarkSharpe: bSharpe,
        }

        if (period === 'ALL') metrics.push(m)
        else if (period === 'IN_SAMPLE') inSampleMetrics.push(m)
        else outSampleMetrics.push(m)
      }
    }
  }

  onProgress?.(85)

  // ── 4. Equity curve (4W signals, ALL grades) ──────────────────────────────────
  const signalsWith4W = signals.filter(s => s.ret4W != null).sort((a, b) => a.date.localeCompare(b.date))
  let stratEq = 100, benchEq = 100, peakEq = 100
  const equityCurve4W: EquityPoint[] = signalsWith4W.map(s => {
    stratEq *= (1 + (s.ret4W ?? 0) / 100)
    // Benchmark: same-direction as signal direction (long always)
    const bRet = s.direction === 'LONG' ? (s.ret4W ?? 0) : -(s.ret4W ?? 0)
    benchEq *= (1 + bRet / 200)
    if (stratEq > peakEq) peakEq = stratEq
    const dd = peakEq > 0 ? -(peakEq - stratEq) / peakEq * 100 : 0
    return {
      date: s.date,
      strategyEquity: parseFloat(stratEq.toFixed(2)),
      benchmarkEquity: parseFloat(benchEq.toFixed(2)),
      drawdown: parseFloat(dd.toFixed(2)),
    }
  })

  // ── 5. Grade distribution ──────────────────────────────────────────────────────
  const gradeDist = (['A', 'B+', 'B', 'C'] as const).map(g => ({
    grade: g,
    count: signals.filter(s => s.grade === g).length,
    bullish: signals.filter(s => s.grade === g && s.direction === 'LONG').length,
    bearish: signals.filter(s => s.grade === g && s.direction === 'SHORT').length,
  }))

  // ── 6. Signals by year ────────────────────────────────────────────────────────
  const years = Array.from(new Set(signals.map(s => parseInt(s.date.slice(0, 4))))).sort()
  const signalsByYear = years.map(year => ({
    year,
    'A':  signals.filter(s => parseInt(s.date.slice(0, 4)) === year && s.grade === 'A').length,
    'B+': signals.filter(s => parseInt(s.date.slice(0, 4)) === year && s.grade === 'B+').length,
    'B':  signals.filter(s => parseInt(s.date.slice(0, 4)) === year && s.grade === 'B').length,
    'C':  signals.filter(s => parseInt(s.date.slice(0, 4)) === year && s.grade === 'C').length,
  }))

  // ── 7. Time-decay analysis ────────────────────────────────────────────────────
  const timeDemand = ([1, 4, 8, 12, 26] as const).map(w => {
    const retKey: keyof BacktestSignal = w === 1 ? 'ret1W' : w === 4 ? 'ret4W' : w === 8 ? 'ret8W' : w === 12 ? 'ret12W' : 'ret26W'
    const rets = signals.filter(s => s.grade !== 'C').map(s => s[retKey]).filter(r => r != null) as number[]
    const m = mean(rets), s = std(rets)
    const ann = sharpeAnnualizationForWeeks(w)
    return {
      weeks: w,
      sharpe: s > 0 ? parseFloat(((m / s) * ann).toFixed(3)) : 0,
      winRate: rets.length > 0 ? parseFloat((rets.filter(r => r > 0).length / rets.length * 100).toFixed(1)) : 0,
      avgReturn: parseFloat(m.toFixed(3)),
    }
  })

  // ── 8. Regime performance ──────────────────────────────────────────────────────
  const regimeMetrics: RegimePerformance[] = []
  const regimeDimensions: { dim: string; key: keyof BacktestSignal; states: string[] }[] = [
    { dim: 'DXY Regime',   key: 'dxyRegime',   states: ['STRONG_USD', 'WEAK_USD', 'RANGING'] },
    { dim: 'VIX Regime',   key: 'vixRegime',   states: ['NORMAL', 'ELEVATED', 'CRISIS'] },
    { dim: 'Trend Regime', key: 'trendRegime', states: ['BULL', 'BEAR', 'RANGING'] },
  ]
  for (const { dim, key, states } of regimeDimensions) {
    for (const state of states) {
      const subset = signals.filter(s => s[key] === state && s.grade !== 'C')
      const rets = subset.map(s => s.ret4W).filter(r => r != null) as number[]
      if (rets.length < 3) continue
      const m = mean(rets), s = std(rets), n = rets.length
      const tStat = s > 0 ? m / (s / Math.sqrt(n)) : 0
      regimeMetrics.push({
        regimeDimension: dim, regimeState: state, signals: n,
        winRate: rets.filter(r => r > 0).length / n * 100,
         avgReturn: m, sharpe: s > 0 ? (m / s) * FOUR_WEEK_SHARPE_ANNUALIZATION : 0,
        pValue: pValueFromTStat(tStat, n - 1),
      })
    }
  }

  // ── 9. Academic verification ──────────────────────────────────────────────────
  function summarizeDreesmann(label: string, instrument: string, direction: 'LONG' | 'SHORT' | 'BOTH', source: BacktestSignal[]): DreesmannGroup {
    const grouped = source.filter(s => s.grade !== 'C' && s.ret4W != null)
    const returns = grouped.map(s => s.ret4W!) as number[]
    let equity = 1
    const curve = returns.map(value => { equity *= 1 + value / 100; return equity })
    const years = grouped.length > 1
      ? (new Date(grouped[grouped.length - 1]!.date).getTime() - new Date(grouped[0]!.date).getTime()) / (365.25 * 86400_000)
      : 0
    return {
      label, instrument, direction, sample: returns.length,
      cumulativeReturn: parseFloat(((equity - 1) * 100).toFixed(2)),
      annualReturn: parseFloat((years > 0 ? (Math.pow(equity, 1 / years) - 1) * 100 : 0).toFixed(2)),
       sharpe: parseFloat((std(returns) > 0 ? (mean(returns) / std(returns)) * FOUR_WEEK_SHARPE_ANNUALIZATION : 0).toFixed(3)),
      rawSharpe: parseFloat((std(returns) > 0 ? mean(returns) / std(returns) : 0).toFixed(3)),
      maxDrawdown: parseFloat((maxDrawdown(curve) * 100).toFixed(2)),
      winRate: parseFloat((returns.filter(value => value > 0).length / (returns.length || 1) * 100).toFixed(1)),
    }
  }
  const dreesmannByGroup: DreesmannGroup[] = [
    summarizeDreesmann(`${params.instrument} LONG`, params.instrument, 'LONG', signals.filter(s => s.direction === 'LONG')),
    summarizeDreesmann(`${params.instrument} SHORT`, params.instrument, 'SHORT', signals.filter(s => s.direction === 'SHORT')),
  ]
  const primaryDreesmann = dreesmannByGroup.find(group => group.direction === 'LONG') ?? dreesmannByGroup[0]!

  // Zhang & Laws: commercial net-position changes vs subsequent raw gold returns.
  const cotWithReturns = signals.filter(s => s.instrument === 'XAUUSD' && s.ret4W != null && s.marketRet4W != null && Number.isFinite(s.commercialNetChange))
  const csiVals = cotWithReturns.map(s => s.commercialNetChange)
  const retVals = cotWithReturns.map(s => s.marketRet4W!)
  const n2 = csiVals.length
  const meanCSI = mean(csiVals), meanRet = mean(retVals)
  let covXY = 0, varX = 0, varY = 0
  for (let i = 0; i < n2; i++) {
    const dx = csiVals[i]! - meanCSI, dy = retVals[i]! - meanRet
    covXY += dx * dy; varX += dx * dx; varY += dy * dy
  }
  const zhangCorr = Math.sqrt(varX * varY) > 0 ? covXY / Math.sqrt(varX * varY) : 0
  const zhangBeta = varX > 0 ? covXY / varX : 0
  let residualSumSquares = 0
  for (let i = 0; i < n2; i += 1) {
    const fitted = meanRet + zhangBeta * (csiVals[i]! - meanCSI)
    residualSumSquares += (retVals[i]! - fitted) ** 2
  }
  const seB = varX > 0 && n2 > 2
    ? Math.sqrt((residualSumSquares / (n2 - 2)) / varX)
    : 0
  const zhangTStat = seB > 0 ? zhangBeta / seB : 0

  const academicVerification: AcademicVerification = {
    dreesmannCumReturn: primaryDreesmann.cumulativeReturn,
    dreesmannAnnReturn: primaryDreesmann.annualReturn,
    dreesmannSharpe:    primaryDreesmann.sharpe,
    dreesmannMaxDD:     primaryDreesmann.maxDrawdown,
    dreesmannWinRate:   primaryDreesmann.winRate,
    dreesmannPublishedSharpe: 1.66,
    zhangCorrelation:   parseFloat(zhangCorr.toFixed(4)),
    zhangBeta:          parseFloat(zhangBeta.toFixed(4)),
    zhangTStat:         parseFloat(zhangTStat.toFixed(3)),
    zhangPValue:        pValueFromTStat(zhangTStat, n2 - 2),
    zhangPublishedBeta: -0.016,
    zhangPublishedTStat: -5.696,
    dreesmannByGroup,
  }

  onProgress?.(100)

  return {
    signals,
    metrics,
    equityCurve4W,
    regimeMetrics,
    gradeDistribution: gradeDist,
    signalsByYear,
    timeDemand,
    academicVerification,
    inSampleMetrics,
    outSampleMetrics,
    params,
  }
}

/** Merge results from multiple instruments */
export function mergeBacktestResults(results: BacktestResult[]): BacktestResult {
  if (results.length === 0) throw new Error('No results to merge')
  if (results.length === 1) return results[0]!

  const merged: BacktestResult = {
    signals: results.flatMap(r => r.signals).sort((a, b) => a.date.localeCompare(b.date)),
    metrics: results.flatMap(r => r.metrics),
    equityCurve4W: results[0]!.equityCurve4W, // use first instrument for now
    regimeMetrics: results[0]!.regimeMetrics,
    gradeDistribution: results[0]!.gradeDistribution, // TODO: merge
    signalsByYear: results[0]!.signalsByYear,
    timeDemand: results[0]!.timeDemand,
    academicVerification: {
      ...results[0]!.academicVerification,
      dreesmannByGroup: results.flatMap(result => result.academicVerification.dreesmannByGroup),
      dreesmannCumReturn: results[0]!.academicVerification.dreesmannCumReturn,
      dreesmannAnnReturn: results[0]!.academicVerification.dreesmannAnnReturn,
      dreesmannSharpe: results[0]!.academicVerification.dreesmannSharpe,
      dreesmannMaxDD: results[0]!.academicVerification.dreesmannMaxDD,
      dreesmannWinRate: results[0]!.academicVerification.dreesmannWinRate,
    },
    inSampleMetrics: results.flatMap(r => r.inSampleMetrics),
    outSampleMetrics: results.flatMap(r => r.outSampleMetrics),
    params: { ...results[0]!.params, instrument: 'ALL' },
  }

  return merged
}
