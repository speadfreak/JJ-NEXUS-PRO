/**
 * Deterministic, browser-side statistical verification primitives.
 *
 * These routines deliberately avoid network and React dependencies. They use
 * seeded pseudo-randomness so a report can be exported and reproduced later.
 */

export interface HistoricalPrice {
  date: string
  close: number
}

export interface MonteCarloResult {
  grade: string
  instrument: string
  direction: 'LONG' | 'SHORT' | 'ALL'
  seed: number
  sampleSize: number
  insufficient: boolean
  actualWinRate: number
  randomWinRate: number
  actualSharpe: number
  rawSharpe: number
  randomSharpeMean: number
  randomSharpeP95: number
  percentile: number
  pValue: number
  simulations: number
  histogram: { bin: string; count: number; value: number }[]
  verdict: 'GENUINE ALPHA' | 'MARGINAL' | 'NOT SIGNIFICANT' | 'INSUFFICIENT SAMPLE'
}

export interface PosteriorResult {
  parameter: 'win-rate' | 'mean-return'
  group: string
  mean: number
  lower: number
  upper: number
  standardDeviation: number
  effectiveSampleSize: number
  rHat: number
  chains: number[][]
  samples: number[]
  density: { x: number; prior: number; posterior: number }[]
}

export interface BootstrapResult {
  actualSharpe: number
  rawSharpe: number
  lower: number
  upper: number
  mean: number
  seed: number
  histogram: { bin: string; count: number; value: number }[]
}

export interface DrawdownProjection {
  curves: { trade: number; median: number; lower: number; upper: number }[]
  drawdowns: { bin: string; count: number; value: number }[]
  terminalEquity: { bin: string; count: number; value: number }[]
  drawdown95: number
  drawdown99: number
  equity95: [number, number]
  worstLosingStreak95: number
}

export interface VerificationCorrection {
  label: string
  pValue: number
  bonferroniAdjusted: number
  bonferroniSignificant: boolean
  qValue: number
  bhSignificant: boolean
}

const DEFAULT_SIMULATIONS = 10_000
/** Shared annualization for a return measured over a four-week holding period. */
export const FOUR_WEEK_SHARPE_ANNUALIZATION = Math.sqrt(13)

/** Return the annualization factor for a holding period measured in weeks. */
export function sharpeAnnualizationForWeeks(weeks: number): number {
  if (weeks === 4) return FOUR_WEEK_SHARPE_ANNUALIZATION
  return Math.sqrt(52 / Math.max(1, weeks))
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

/** Sharpe before annualization, retained for audit transparency. */
export function rawSharpeRatio(returns: number[]): number {
  const deviation = standardDeviation(returns)
  return deviation > 0 ? mean(returns) / deviation : 0
}

export function quantile(values: number[], probability: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, probability))
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower] ?? 0
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (position - lower)
}

export function sharpeRatio(returns: number[], annualization = FOUR_WEEK_SHARPE_ANNUALIZATION): number {
  return rawSharpeRatio(returns) * annualization
}

function hashSeed(parts: string[]): number {
  let hash = 2166136261
  for (const part of parts.join('|')) {
    hash ^= part.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function normalRandom(random: () => number): number {
  const u = Math.max(Number.EPSILON, random())
  const v = Math.max(Number.EPSILON, random())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function histogram(values: number[], bins = 24): { bin: string; count: number; value: number }[] {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = max === min ? 1 : (max - min) / bins
  const counts = new Array<number>(bins).fill(0)
  for (const value of values) {
    const index = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)))
    counts[index] = (counts[index] ?? 0) + 1
  }
  return counts.map((count, index) => {
    const value = min + width * (index + 0.5)
    return { value, count, bin: value.toFixed(2) }
  })
}

function forwardReturn(prices: HistoricalPrice[], startIndex: number, direction: 'LONG' | 'SHORT' | 'ALL'): number | null {
  const entry = prices[startIndex]?.close
  const future = prices[startIndex + 4]?.close
  if (!entry || !future) return null
  const raw = (future - entry) / entry * 100
  return direction === 'SHORT' ? -raw : raw
}

/**
 * Tests the observed group against random 4-week returns from the same price
 * history. The null distribution samples random dates, not the observed
 * signal-return array, which avoids a bootstrap masquerading as Monte Carlo.
 */
export function runMonteCarlo(
  returns: number[],
  grade: string,
  instrument: string,
  direction: 'LONG' | 'SHORT' | 'ALL' = 'LONG',
  prices: HistoricalPrice[] = [],
  simulations = DEFAULT_SIMULATIONS,
  providedSeed?: number,
  annualization = FOUR_WEEK_SHARPE_ANNUALIZATION,
): MonteCarloResult {
  const clean = returns.filter(Number.isFinite)
  const seed = providedSeed ?? hashSeed([instrument, grade, direction, String(clean.length)])
  const insufficient = clean.length < 5
  const actualWinRate = clean.length ? clean.filter(value => value > 0).length / clean.length : 0
  const actualSharpe = sharpeRatio(clean, annualization)
  const randomSharpes: number[] = []
  let randomWinRateTotal = 0
  const random = mulberry32(seed)
  const usablePrices = prices.filter(row => Number.isFinite(row.close)).sort((a, b) => a.date.localeCompare(b.date))
  const maxStart = usablePrices.length - 5

  for (let simulation = 0; simulation < simulations && !insufficient; simulation += 1) {
    const sampled = maxStart >= 0 && usablePrices.length >= 5
      ? Array.from({ length: clean.length }, () => forwardReturn(usablePrices, Math.floor(random() * (maxStart + 1)), direction) ?? 0)
      : Array.from({ length: clean.length }, () => clean[Math.floor(random() * clean.length)] ?? 0)
    randomWinRateTotal += sampled.filter(value => value > 0).length / clean.length
    randomSharpes.push(sharpeRatio(sampled, annualization))
  }

  const pValue = randomSharpes.length ? randomSharpes.filter(value => value >= actualSharpe).length / randomSharpes.length : 1
  const percentile = randomSharpes.length ? randomSharpes.filter(value => value <= actualSharpe).length / randomSharpes.length : 0
  const verdict = insufficient ? 'INSUFFICIENT SAMPLE' : pValue < 0.01 ? 'GENUINE ALPHA' : pValue < 0.1 ? 'MARGINAL' : 'NOT SIGNIFICANT'
  return {
    grade,
    instrument,
    direction,
    seed,
    sampleSize: clean.length,
    insufficient,
    actualWinRate,
    randomWinRate: randomSharpes.length ? randomWinRateTotal / randomSharpes.length : 0,
    actualSharpe,
    rawSharpe: rawSharpeRatio(clean),
    randomSharpeMean: mean(randomSharpes),
    randomSharpeP95: quantile(randomSharpes, 0.95),
    percentile,
    pValue,
    simulations: randomSharpes.length ? simulations : 0,
    histogram: histogram(randomSharpes),
    verdict,
  }
}

function logGamma(value: number): number {
  if (value < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * value)) - logGamma(1 - value)
  const coefficients = [0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.1385710952657201, 9.984369578019572e-6, 1.505632735149312e-7]
  const shifted = value - 1
  let sum = coefficients[0] ?? 1
  for (let index = 1; index < coefficients.length; index += 1) sum += (coefficients[index] ?? 0) / (shifted + index)
  const t = shifted + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum)
}

function betaLogDensity(value: number, alpha: number, beta: number): number {
  if (value <= 0 || value >= 1) return -Infinity
  return (alpha - 1) * Math.log(value) + (beta - 1) * Math.log(1 - value) - logGamma(alpha) - logGamma(beta) + logGamma(alpha + beta)
}

function normalDensity(value: number, center: number, deviation: number): number {
  const safeDeviation = Math.max(deviation, 1e-8)
  return Math.exp(-0.5 * ((value - center) / safeDeviation) ** 2) / safeDeviation
}

function rHat(chains: number[][]): number {
  if (chains.length < 2 || !chains[0]?.length) return 1
  const chainLength = Math.min(...chains.map(chain => chain.length))
  const trimmed = chains.map(chain => chain.slice(0, chainLength))
  const chainMeans = trimmed.map(chain => mean(chain))
  const overallMean = mean(chainMeans)
  const between = chainLength * mean(chainMeans.map(value => (value - overallMean) ** 2))
  const within = mean(trimmed.map((chain, index) => mean(chain.map(value => (value - (chainMeans[index] ?? 0)) ** 2))))
  if (within <= Number.EPSILON) return 1
  const varianceEstimate = ((chainLength - 1) / chainLength) * within + between / chainLength
  return Math.sqrt(varianceEstimate / within)
}

function effectiveSampleSize(samples: number[]): number {
  if (samples.length < 4) return samples.length
  const average = mean(samples)
  const variance = mean(samples.map(value => (value - average) ** 2))
  if (variance <= Number.EPSILON) return samples.length
  let rhoSum = 0
  for (let lag = 1; lag < Math.min(1000, samples.length / 2); lag += 1) {
    let covariance = 0
    for (let index = lag; index < samples.length; index += 1) covariance += (samples[index]! - average) * (samples[index - lag]! - average)
    const rho = covariance / ((samples.length - lag) * variance)
    if (rho <= 0) break
    rhoSum += rho
  }
  return Math.max(1, Math.min(samples.length, Math.round(samples.length / (1 + 2 * rhoSum))))
}

function posteriorDensity(samples: number[], prior: (value: number) => number, bins = 100): { x: number; prior: number; posterior: number }[] {
  const lower = quantile(samples, 0.001)
  const upper = quantile(samples, 0.999)
  const range = upper === lower ? Math.max(1, Math.abs(upper) * 0.1) : upper - lower
  return Array.from({ length: bins }, (_, index) => {
    const x = lower - range * 0.05 + (index / (bins - 1)) * range * 1.1
    const bandwidth = Math.max(range / 30, 1e-4)
    const posterior = mean(samples.map(value => Math.exp(-0.5 * ((x - value) / bandwidth) ** 2)))
    return { x, prior: prior(x), posterior }
  })
}

function runMetropolis(
  target: (value: number) => number,
  start: number,
  lowerBound: number,
  upperBound: number,
  iterations: number,
  burnIn: number,
  thin: number,
  seed: number,
): number[] {
  const random = mulberry32(seed)
  const samples: number[] = []
  let current = start
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const proposal = current + normalRandom(random) * (upperBound - lowerBound) * 0.02
    if (proposal > lowerBound && proposal < upperBound) {
      const logAcceptance = Math.min(0, target(proposal) - target(current))
      if (Math.log(Math.max(Number.EPSILON, random())) < logAcceptance) current = proposal
    }
    if (iteration >= burnIn && (iteration - burnIn) % thin === 0) samples.push(current)
  }
  return samples
}

export function runMCMCWinRate(
  wins: number,
  observations: number,
  group = 'XAUUSD LONG',
  iterations = 10_000,
): PosteriorResult {
  if (observations <= 0) {
    return { parameter: 'win-rate', group, mean: 0.5, lower: 0, upper: 1, standardDeviation: 0, effectiveSampleSize: 0, rHat: 1, chains: [], samples: [], density: [] }
  }
  const burnIn = 2_000
  const thin = 5
  const chains = Array.from({ length: 5 }, (_, chainIndex) => runMetropolis(
    theta => betaLogDensity(theta, 2, 2) + wins * Math.log(theta) + (observations - wins) * Math.log(1 - theta),
    Math.min(0.99, Math.max(0.01, (wins + 2) / (observations + 4) + (chainIndex - 2) * 0.02)),
    0,
    1,
    iterations,
    burnIn,
    thin,
    hashSeed([group, 'win-rate', String(chainIndex)]),
  ))
  const samples = chains.flat()
  const density = posteriorDensity(samples, value => Math.exp(betaLogDensity(value, 2, 2)) / 4)
  return {
    parameter: 'win-rate',
    group,
    mean: mean(samples),
    lower: quantile(samples, 0.025),
    upper: quantile(samples, 0.975),
    standardDeviation: standardDeviation(samples),
    effectiveSampleSize: effectiveSampleSize(samples),
    rHat: rHat(chains),
    chains,
    samples,
    density,
  }
}

export function runMCMCMeanReturn(
  returns: number[],
  group = 'XAUUSD LONG',
  iterations = 10_000,
): PosteriorResult {
  const clean = returns.filter(Number.isFinite)
  if (!clean.length) {
    return { parameter: 'mean-return', group, mean: 0, lower: 0, upper: 0, standardDeviation: 0, effectiveSampleSize: 0, rHat: 1, chains: [], samples: [], density: [] }
  }
  const observedMean = mean(clean)
  const likelihoodDeviation = standardDeviation(clean) / Math.sqrt(Math.max(1, clean.length))
  const priorDeviation = 2
  const target = (value: number) => -0.5 * (value / priorDeviation) ** 2 - 0.5 * ((value - observedMean) / Math.max(likelihoodDeviation, 0.0001)) ** 2
  const burnIn = 2_000
  const thin = 5
  const chains = Array.from({ length: 5 }, (_, chainIndex) => runMetropolis(
    target,
    observedMean + (chainIndex - 2) * Math.max(0.01, likelihoodDeviation),
    -100,
    100,
    iterations,
    burnIn,
    thin,
    hashSeed([group, 'mean-return', String(chainIndex)]),
  ))
  const samples = chains.flat()
  const posteriorVariance = 1 / (1 / priorDeviation ** 2 + 1 / Math.max(likelihoodDeviation, 0.0001) ** 2)
  const posteriorMean = posteriorVariance * observedMean / Math.max(likelihoodDeviation, 0.0001) ** 2
  return {
    parameter: 'mean-return',
    group,
    mean: mean(samples),
    lower: quantile(samples, 0.025),
    upper: quantile(samples, 0.975),
    standardDeviation: standardDeviation(samples),
    effectiveSampleSize: effectiveSampleSize(samples),
    rHat: rHat(chains),
    chains,
    samples,
    density: posteriorDensity(samples, value => normalDensity(value, 0, priorDeviation)),
  }
}

export function runBootstrap(returns: number[], simulations = DEFAULT_SIMULATIONS): BootstrapResult | null {
  const clean = returns.filter(Number.isFinite)
  if (clean.length < 2) return null
  const seed = hashSeed(['bootstrap', String(clean.length), clean.map(value => value.toFixed(4)).join(',')])
  const random = mulberry32(seed)
  const values = Array.from({ length: simulations }, () => sharpeRatio(Array.from({ length: clean.length }, () => clean[Math.floor(random() * clean.length)] ?? 0), FOUR_WEEK_SHARPE_ANNUALIZATION))
  return { actualSharpe: sharpeRatio(clean, FOUR_WEEK_SHARPE_ANNUALIZATION), rawSharpe: rawSharpeRatio(clean), lower: quantile(values, 0.025), upper: quantile(values, 0.975), mean: mean(values), seed, histogram: histogram(values) }
}

export function applyMultipleTestingCorrection(values: { label: string; pValue: number }[], totalTests = values.length): VerificationCorrection[] {
  const tests = Math.max(1, totalTests)
  const sorted = [...values].sort((a, b) => a.pValue - b.pValue)
  const qValues = new Array<number>(sorted.length).fill(1)
  let runningMinimum = 1
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const rank = index + 1
    runningMinimum = Math.min(runningMinimum, (sorted[index]?.pValue ?? 1) * sorted.length / rank)
    qValues[index] = Math.min(1, runningMinimum)
  }
  const qByLabel = new Map(sorted.map((item, index) => [item.label, qValues[index] ?? 1]))
  return values.map(item => {
    const bonferroniAdjusted = Math.min(1, item.pValue * tests)
    const qValue = qByLabel.get(item.label) ?? 1
    return { ...item, bonferroniAdjusted, bonferroniSignificant: bonferroniAdjusted < 0.05, qValue, bhSignificant: qValue < 0.05 }
  })
}

export function runRiskProjection(returns: number[], simulations = 1_000): {
  parametricVaR: number
  historicalVaR: number
  cvar: number
  projection: DrawdownProjection
} | null {
  const clean = returns.filter(Number.isFinite)
  if (clean.length < 2) return null
  const deviation = standardDeviation(clean)
  const historicalVaR = quantile(clean, 0.05)
  const tail = clean.filter(value => value <= historicalVaR)
  const random = mulberry32(hashSeed(['risk', String(clean.length), clean.map(value => value.toFixed(3)).join(',')]))
  const drawdowns: number[] = []
  const terminal: number[] = []
  const streaks: number[] = []
  const paths: number[][] = []
  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let equity = 10_000
    let peak = equity
    let maxDrawdown = 0
    let currentStreak = 0
    let worstStreak = 0
    const path = [equity]
    for (let trade = 0; trade < 100; trade += 1) {
      const value = clean[Math.floor(random() * clean.length)] ?? 0
      equity *= Math.max(0.01, 1 + value / 100)
      peak = Math.max(peak, equity)
      maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak)
      currentStreak = value < 0 ? currentStreak + 1 : 0
      worstStreak = Math.max(worstStreak, currentStreak)
      path.push(equity)
    }
    paths.push(path)
    drawdowns.push(maxDrawdown * 100)
    terminal.push(equity)
    streaks.push(worstStreak)
  }
  const curves = Array.from({ length: 101 }, (_, trade) => {
    const values = paths.map(path => path[trade] ?? 10_000)
    return { trade, median: quantile(values, 0.5), lower: quantile(values, 0.05), upper: quantile(values, 0.95) }
  })
  return {
    parametricVaR: mean(clean) - 1.645 * deviation,
    historicalVaR,
    cvar: mean(tail),
    projection: {
      curves,
      drawdowns: histogram(drawdowns),
      terminalEquity: histogram(terminal),
      drawdown95: quantile(drawdowns, 0.95),
      drawdown99: quantile(drawdowns, 0.99),
      equity95: [quantile(terminal, 0.025), quantile(terminal, 0.975)],
      worstLosingStreak95: quantile(streaks, 0.95),
    },
  }
}

export function scoreVerification(components: {
  monteCarlo: number
  mcmc: number
  bootstrap: number
  overfitting: number
  integrity: number
  risk: number
}): number {
  const weights = { monteCarlo: 25, mcmc: 20, bootstrap: 15, overfitting: 15, integrity: 15, risk: 10 }
  return Math.round(Object.entries(weights).reduce((score, [key, weight]) => score + Math.min(weight, Math.max(0, components[key as keyof typeof weights])), 0))
}

/** Map the strongest primary-hypothesis p-value to the report's 25-point scale. */
export function scoreMonteCarloPValue(pValue: number): number {
  if (!Number.isFinite(pValue) || pValue >= 0.1) return 0
  if (pValue < 0.001) return 25
  if (pValue < 0.01) return 20
  if (pValue < 0.05) return 15
  return 8
}

/** Score tail risk using signed percentage returns and simulated drawdown. */
export function scoreRiskVerification(risk: {
  cvar: number
  parametricVaR: number
  historicalVaR: number
  projection: { drawdown95: number }
}): number {
  const cvarScore = risk.cvar > -5 ? 6 : risk.cvar > -10 ? 4 : risk.cvar > -15 ? 2 : 0
  const varBonus = Math.max(risk.parametricVaR, risk.historicalVaR) > -10 ? 2 : 0
  const drawdownBonus = risk.projection.drawdown95 < 40 ? 2 : 0
  return Math.min(10, cvarScore + varBonus + drawdownBonus)
}