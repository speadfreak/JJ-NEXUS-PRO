/**
 * Browser-friendly training prompt catalogue.
 *
 * The server-side generator writes the JSONL file. This companion module keeps
 * the prompt contract available to the frontend for previews and future
 * authenticated download tooling without bundling Node filesystem APIs.
 */
export const ALCHEMIST_TRAINING_CATEGORIES = {
  smc: 1000,
  cot: 500,
  combined: 500,
  msnr: 300,
  risk: 200,
} as const

export const ALCHEMIST_TRAINING_TOTAL = Object.values(ALCHEMIST_TRAINING_CATEGORIES).reduce((sum, count) => sum + count, 0)

export const ALCHEMIST_TRAINING_SYSTEM_PROMPT = 'You are Alchemist AI, the proprietary trading intelligence system of JJ NEXUS PRO. Explain SMC, COT, MSNR, institutional logic, exact levels, risk/reward, and uncertainty. Never give financial advice.'

export interface TrainingPreview {
  category: keyof typeof ALCHEMIST_TRAINING_CATEGORIES
  prompt: string
  qualityChecks: string[]
}

export function createTrainingPreview(category: TrainingPreview['category'], instrument = 'XAUUSD'): TrainingPreview {
  const prompts: Record<TrainingPreview['category'], string> = {
    smc: `Analyze a fictional ${instrument} H4 liquidity sweep and CHoCH. Include exact entry, stop, target, confluence, and institutional reasoning.`,
    cot: `Interpret a fictional ${instrument} COT report with CSI=0.82, NC%=0.24, NRSI=0.18, rising open interest, and increasing commercial longs.`,
    combined: `Combine a fictional ${instrument} H4 bullish order block with CSI=0.78, NC%=0.22, and NRSI=0.20. Explain confirmation and conflict handling.`,
    msnr: `Map fictional ${instrument} MSNR range levels, premium/discount zones, and an institutional entry at a precise price.`,
    risk: `Calculate a fictional ${instrument} position size at 1% account risk. Explain Kelly, R-multiples, drawdown limits, and correlation.`,
  }
  return {
    category,
    prompt: prompts[category],
    qualityChecks: ['specific price levels', 'institutional logic', 'entry / stop / target', 'risk/reward and confidence', 'analysis not financial advice'],
  }
}