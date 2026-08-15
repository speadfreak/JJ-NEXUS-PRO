import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const ALCHEMIST_SYSTEM_PROMPT = [
  "You are Alchemist AI, the proprietary trading intelligence system of JJ NEXUS PRO.",
  "You are an expert in three integrated methodologies: Smart Money Concepts (SMC), including Order Blocks, Fair Value Gaps, Liquidity Sweeps, CHoCH, BOS, and premium/discount zones; CFTC COT, including the Dreesmann five-condition methodology using CSI, NC%, NRSI, OI trends, and week-over-week changes; and Market Structure / MSNR, including institutional levels and structure shifts.",
  "Always provide specific price levels, explain institutional reasoning, assess confluence, state risk/reward and confidence, and identify invalidation. Never give financial advice; frame every response as scenario analysis.",
].join(" ");

type TrainingMessage = { role: "system" | "user" | "assistant"; content: string };
export type TrainingExample = { messages: TrainingMessage[]; category: string; difficulty: string };

const instruments = ["XAUUSD", "EURUSD", "GBPUSD"];
const timeframes = ["M15", "H1", "H4", "D1"];
const conditions = ["trending", "ranging", "volatile", "low-liquidity", "post-news"];
const concepts = [
  "a bullish order block after displacement",
  "a bearish fair value gap under a broken swing low",
  "a sell-side liquidity sweep followed by CHoCH",
  "a buy-side liquidity sweep followed by BOS",
  "a premium-zone rejection at a monthly institutional level",
  "a discount-zone mitigation into a nested order block",
  "a three-drive range expansion with an unfilled imbalance",
  "a failed breakout that left equal highs as resting liquidity",
  "a clean H4 structure shift with M15 entry refinement",
  "a displacement candle that created two overlapping FVGs",
  "a protected low beneath a high-timeframe demand zone",
  "a protected high above a high-timeframe supply zone",
  "a London-session raid into a New York continuation setup",
  "a low-volume Asian range sweep before the London open",
  "a weekly rejection that conflicts with the intraday structure",
];
const smcTemplates = [
  "Audit the {instrument} {timeframe} structure around {level}. The chart shows {concept}. What must be confirmed before an entry is considered?",
  "Build a conditional {direction} scenario for {instrument} after {concept} in a {condition} market. Distinguish confirmation from prediction.",
  "Compare two possible entries on {instrument}: a first-touch entry at {level} and a retest after displacement. Which has cleaner invalidation and why?",
  "A trader sees {concept} on {instrument} {timeframe} but the higher timeframe is unclear. Explain the top-down process and the no-trade conditions.",
  "Evaluate whether {instrument} is in premium or discount between {low} and {high}. Use the structure and liquidity evidence before describing a plan.",
  "Explain how an institutional desk could use {concept} on {instrument} without treating a wick, FVG, or BOS as proof by itself.",
  "Design a replay checklist for {instrument} {timeframe}: liquidity, structure, displacement, mitigation, entry, invalidation, and outcome logging.",
  "The market swept liquidity on {instrument}, but follow-through is weak. Explain the difference between absorption, a true CHoCH, and a failed setup.",
  "Assess a conflict: SMC is {direction} near {level}, while the weekly structure points the other way. State what evidence would resolve the conflict.",
  "Explain how the same {concept} should be interpreted differently on M15, H1, H4, and D1 for {instrument}.",
  "A range high at {high} and range low at {low} contain price. Map the likely liquidity pools and the conditions for a valid breakout or fade.",
  "Review this {instrument} setup as an institutional post-trade critique. Identify the strongest evidence, the hidden assumption, and the invalidation.",
  "Use confluence scoring for {instrument}: structure, order block, FVG, liquidity, COT context, and regime. Show why a score is not a guarantee.",
  "Explain how low liquidity and spread expansion can make a technically attractive {instrument} level untradeable.",
  "Create two branches for {instrument}: continuation after acceptance and reversal after rejection. Give separate levels and conditions.",
];
const cotTemplates = [
  "Interpret {instrument} COT values CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}. What are commercials, speculators, and non-reportables communicating?",
  "The weekly {instrument} report reads CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, and WoW={wow}. Derive a grade only after explaining each condition.",
  "Explain whether this {instrument} positioning snapshot is a crowded trade or a contrarian opportunity: CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}.",
  "Use the Dreesmann five-condition framework on {instrument} with CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}. Highlight any missing condition.",
  "A mentor asks why COT is context rather than timing. Use these actual-style values for {instrument}: CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}.",
];
const combinedTemplates = [
  "Integrate this {instrument} {timeframe} SMC context ({concept}, level {level}) with COT CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}. Do not analyze the inputs separately.",
  "SMC shows {concept} near {level}, while the weekly COT report for {instrument} shows CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}. Decide whether confluence improves or reduces conviction.",
  "The chart suggests a {direction} setup on {instrument} but positioning is mixed: CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}. Build a conflict-aware institutional analysis.",
  "Combine premium/discount structure, the {concept}, and the following {instrument} positioning: CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}. Include a grade with an evidence count.",
  "Create a conditional trade-replay plan for {instrument}: SMC level {level}, COT CSI={csi}, NC%={nc}, NRSI={nrsi}, OI={oi}, WoW={wow}. Explain what would invalidate the combined thesis.",
];
const msnrTemplates = [
  "Map MSNR structure for {instrument} from {low} to {high}. Explain premium, discount, equilibrium, range liquidity, and how an SMC entry would be refined.",
  "Teach a new analyst how market structure and Nasdaq/range logic apply to {instrument} {timeframe} when price is between {low} and {high}.",
  "Evaluate a structure shift on {instrument} around {level}. Separate a genuine institutional break from a stop run and describe the retest process.",
  "Build a range-expansion playbook for {instrument}: high {high}, low {low}, equilibrium {equilibrium}. Include continuation and failure branches.",
  "Explain how MSNR levels can add or contradict a {concept} on {instrument}. Use exact levels and a conservative invalidation rule.",
];
const riskTemplates = [
  "Create a risk audit for a {direction} {instrument} setup with entry {level}, stop {stop}, target {target}, account $10,000, and 1% account risk.",
  "Calculate R-multiple outcomes and a conservative position-sizing process for {instrument}: entry {level}, stop {stop}, target {target}. Discuss Kelly only as a capped reference.",
  "Explain portfolio heat and correlation if a trader already holds a gold position and considers this {instrument} setup at {level}.",
  "A losing streak is affecting a {instrument} system. Use entry {level}, stop {stop}, target {target}, and a 1% baseline to design drawdown controls.",
  "Review this risk plan for {instrument}: entry {level}, stop {stop}, target {target}, expected win rate {winRate}%. Identify assumptions and what must be logged.",
];

function valueFor(index: number, instrument: string, offset = 0): number {
  const base = instrument === "XAUUSD" ? 2340 : instrument === "EURUSD" ? 1.084 : 1.267;
  const step = instrument === "XAUUSD" ? 2.5 : 0.004;
  return base + ((index * 13 + offset * 7) % 29 - 14) * step;
}

function formatLevel(value: number, instrument: string): string {
  return value.toFixed(instrument === "XAUUSD" ? 2 : 4);
}

function parameters(index: number) {
  const instrument = instruments[index % instruments.length]!;
  const level = valueFor(index, instrument);
  const stop = valueFor(index, instrument, -1) - (instrument === "XAUUSD" ? 12 : 0.009);
  const target = level + (instrument === "XAUUSD" ? 28 : 0.018);
  const csi = (0.12 + ((index * 17) % 76) / 100).toFixed(2);
  const nc = (0.12 + ((index * 11) % 42) / 100).toFixed(2);
  const nrsi = (0.08 + ((index * 19) % 80) / 100).toFixed(2);
  return {
    instrument, timeframe: timeframes[(index * 3) % timeframes.length]!, condition: conditions[(index * 5) % conditions.length]!,
    concept: concepts[(index * 7) % concepts.length]!, direction: index % 2 === 0 ? "bullish" : "bearish",
    level: formatLevel(level, instrument), low: formatLevel(level - (instrument === "XAUUSD" ? 36 : 0.024), instrument),
    high: formatLevel(level + (instrument === "XAUUSD" ? 44 : 0.03), instrument),
    equilibrium: formatLevel(level + (instrument === "XAUUSD" ? 4 : 0.003), instrument),
    stop: formatLevel(stop, instrument), target: formatLevel(target, instrument),
    csi, nc, nrsi, oi: index % 3 === 0 ? "rising" : index % 3 === 1 ? "flat" : "falling",
    wow: index % 2 === 0 ? "commercials increasing longs" : "commercials increasing shorts",
    winRate: `${48 + index % 24}%`,
  };
}

function chooseTemplate(templates: string[], index: number, values: Record<string, string>): string {
  const template = templates[index % templates.length]!;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? key);
}

function responseFor(category: string, index: number, values: ReturnType<typeof parameters>, question: string): string {
  const rr = ((Number(values.target) - Number(values.level)) / Math.max(0.0001, Math.abs(Number(values.level) - Number(values.stop)))).toFixed(1);
  const scenario = values.direction === "bullish" ? "long-side" : "short-side";
  const evidence = 3 + (index % 3);
  return [
    `This is a fictional ${values.instrument} ${values.timeframe} ${category.toLowerCase()} scenario for training, not a live signal or financial advice. The working thesis is ${values.direction} and the decision level is ${values.level}; the surrounding range is ${values.low} to ${values.high}, with equilibrium near ${values.equilibrium}. The level matters because institutional orders tend to cluster around obvious liquidity, displacement origins, and failed auctions, but a level by itself is not confirmation. The first task is to mark the prior swing, the nearest opposing liquidity, and whether price is in premium or discount.`,
    `The ${scenario} plan uses an entry zone around ${values.level}, an invalidation at ${values.stop}, and a first objective at ${values.target}. That is approximately 1:${rr} reward-to-risk before spread, slippage, and execution uncertainty. Confirmation requires acceptance or rejection consistent with the higher-timeframe structure, a meaningful displacement candle, and a retest that does not immediately reclaim the invalidation. If those conditions do not occur, the correct output is no trade. The stop should never be widened to rescue a thesis; record the outcome in R multiples instead.`,
    `Institutional context comes from the weekly positioning snapshot: CSI=${values.csi}, NC%=${values.nc}, NRSI=${values.nrsi}, open interest is ${values.oi}, and the week-over-week change says ${values.wow}. Commercials can be hedging rather than forecasting, so COT supplies directional context while SMC supplies timing. A COT reading that agrees with structure adds context, not certainty; a conflict is a reason to reduce conviction or wait for a new structure shift. COT is also stale between reports and must not be presented as an intraday trigger.`,
    `The confluence audit has ${evidence}/5 factors aligned: price structure, liquidity behavior, the order-block or imbalance location, COT positioning, and regime quality. A high count still fails if the entry is late, the range is too compressed, volatility is abnormal, or the setup is exposed to a scheduled release. For MSNR, a rejection from premium favors the bearish branch and a discount mitigation favors the bullish branch; acceptance outside the range changes the map rather than automatically validating continuation.`,
    `Confidence is conditional and should be stated as ${48 + index % 24}%, not as a promise. Before any replay, define the entry, stop, target, maximum account risk, and the event that invalidates the idea. A mentor-quality record includes the exact prices ${values.level}, ${values.stop}, and ${values.target}, the five-condition pass/fail vector, market regime, screenshot, execution result, and reason for exit. This keeps the analysis testable and protects against hindsight, selection bias, and the temptation to convert a plausible narrative into advice.`,
  ].join(" ");
}

const TRAINING_CATEGORY_COUNTS = {
  "SMC Analysis": 1000,
  "COT Data Interpretation": 500,
  "Combined SMC + COT": 500,
  "MSNR Concepts": 300,
  "Risk Management": 200,
} as const;

function validateTrainingExample(example: TrainingExample): void {
  const response = example.messages.find(message => message.role === "assistant")?.content ?? "";
  const words = response.trim().split(/\s+/).filter(Boolean).length;
  const priceLevels = response.match(/\b\d+(?:[.,]\d{2,4})\b/g) ?? [];
  const hasInstitutionalLogic = /\b(institutional|commercials?|liquidity|order block)\b/i.test(response);
  const hasRiskReward = /\b(risk[\/ -]?reward|reward[\/ -]?to[\/ -]?risk|1:\d)\b/i.test(response);
  const hasConfluence = /\bconfluence\b/i.test(response);
  if (words < 200 || priceLevels.length < 2 || !hasInstitutionalLogic || !hasRiskReward || !hasConfluence) {
    throw new Error(`Training example failed quality validation: category=${example.category}, words=${words}, priceLevels=${priceLevels.length}`);
  }
}

function makeExample(category: string, index: number, templates: string[]): TrainingExample {
  const values = parameters(index);
  const rawValues = values as unknown as Record<string, string>;
  const question = chooseTemplate(templates, index, rawValues);
  return { category, difficulty: index % 3 === 0 ? "advanced" : index % 3 === 1 ? "intermediate" : "foundational", messages: [{ role: "system", content: ALCHEMIST_SYSTEM_PROMPT }, { role: "user", content: question }, { role: "assistant", content: responseFor(category, index, values, question) }] };
}

export function buildTrainingExamples(): TrainingExample[] {
  const categories: Array<[keyof typeof TRAINING_CATEGORY_COUNTS, string[]]> = [
    ["SMC Analysis", smcTemplates],
    ["COT Data Interpretation", cotTemplates],
    ["Combined SMC + COT", combinedTemplates],
    ["MSNR Concepts", msnrTemplates],
    ["Risk Management", riskTemplates],
  ];
  const examples: TrainingExample[] = [];
  let index = 0;
  for (const [category, templates] of categories) {
    const count = TRAINING_CATEGORY_COUNTS[category];
    for (let item = 0; item < count; item += 1) examples.push(makeExample(category, index++, templates));
  }
  for (const example of examples) validateTrainingExample(example);
  return examples;
}

export async function generateTrainingDataset(outputPath = path.resolve(process.cwd(), "data/alchemist_training_data.jsonl")) {
  const examples = buildTrainingExamples();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${examples.map(example => JSON.stringify(example)).join("\n")}\n`, "utf8");
  return {
    outputPath,
    examples: examples.length,
    categories: { smc: 1000, cot: 500, combined: 500, msnr: 300, risk: 200 },
    quality: { minAssistantWords: 200, minPriceLevels: 2, requiresInstitutionalLogic: true, requiresRiskReward: true, requiresConfluence: true },
  };
}