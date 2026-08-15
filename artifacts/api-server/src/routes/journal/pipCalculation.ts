const INDEX_SYMBOLS = new Set([
  "NAS100", "US100", "NDX", "US30", "DJ30", "DOW", "SPX500", "US500",
  "UK100", "DE40", "GER40", "JP225", "AUS200", "HK50",
]);
const METAL_SYMBOLS = new Set(["XAUUSD", "GOLD", "XAGUSD", "XPTUSD", "XPDUSD"]);
const CRYPTO_SYMBOLS = new Set(["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD"]);

export function getPipSize(symbol: string): number {
  const normalized = String(symbol || "").toUpperCase().replace("/", "");
  if (METAL_SYMBOLS.has(normalized)) return 0.01;
  if (normalized.includes("JPY")) return 0.01;
  if (INDEX_SYMBOLS.has(normalized)) return 1;
  if (CRYPTO_SYMBOLS.has(normalized)) return 1;
  return 0.0001;
}

export function calculateTradePips(
  symbol: string,
  result: string | null | undefined,
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  direction?: string,
  actualExit?: number,
): number {
  const resultKey = String(result || "").toUpperCase();
  if (resultKey === "BE" || resultKey === "BREAKEVEN") return 0;
  const entry = Number(entryPrice);
  const sl = Number(stopLoss);
  const tp = Number(takeProfit);
  if (!Number.isFinite(entry)) return 0;
  const exit = Number(actualExit);
  const resolvedExit = Number.isFinite(exit) && exit > 0
    ? exit
    : resultKey === "LOSS" ? sl : resultKey === "WIN" ? tp : 0;
  if (!Number.isFinite(resolvedExit) || resolvedExit <= 0) return 0;
  const isSell = String(direction || "").toUpperCase() === "SELL";
  const signedMove = isSell ? entry - resolvedExit : resolvedExit - entry;
  if (resultKey === "WIN" && signedMove < 0 && !actualExit) return 0;
  if (resultKey === "LOSS" && signedMove > 0 && !actualExit) return 0;
  return signedMove / getPipSize(symbol);
}

export function calculateRiskReward(entryPrice: number, stopLoss: number, takeProfit: number): number {
  const risk = Math.abs(Number(entryPrice) - Number(stopLoss));
  const reward = Math.abs(Number(takeProfit) - Number(entryPrice));
  return risk > 0 && Number.isFinite(reward) ? reward / risk : 0;
}
