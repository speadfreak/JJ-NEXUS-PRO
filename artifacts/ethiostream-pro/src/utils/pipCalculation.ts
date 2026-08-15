/**
 * Instrument-aware pip conventions used by the trade journal.
 *
 * A pip is a price unit, not a fixed decimal position across all markets:
 *   - Forex: 0.0001 (JPY pairs: 0.01)
 *   - Gold and silver: 0.01 (a $1.00 move = 100 pips)
 *   - Index CFDs: 1.0 index point
 *   - Crypto: 1.0 quote-currency unit
 */

const INDEX_SYMBOLS = new Set([
  'NAS100', 'US100', 'NDX', 'US30', 'DJ30', 'DOW', 'SPX500', 'US500',
  'UK100', 'DE40', 'GER40', 'JP225', 'AUS200', 'HK50',
]);

const METAL_SYMBOLS = new Set(['XAUUSD', 'GOLD', 'XAGUSD', 'XPTUSD', 'XPDUSD']);
const CRYPTO_SYMBOLS = new Set(['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD']);

export function getPipSize(symbol: string): number {
  const normalized = symbol.toUpperCase().replace('/', '');
  if (METAL_SYMBOLS.has(normalized)) return 0.01;
  if (normalized.includes('JPY')) return 0.01;
  if (INDEX_SYMBOLS.has(normalized)) return 1;
  if (CRYPTO_SYMBOLS.has(normalized)) return 1;
  return 0.0001;
}

/** Approximate USD value of one pip for one standard lot. */
export function getPipValuePerLot(symbol: string, price = 0): number {
  const normalized = symbol.toUpperCase().replace('/', '');
  if (METAL_SYMBOLS.has(normalized)) return 1;
  if (INDEX_SYMBOLS.has(normalized)) return 1;
  if (CRYPTO_SYMBOLS.has(normalized)) return 1;
  if (normalized.includes('JPY')) return price > 0 ? 1000 / price : 6.67;
  return 10;
}

export function calculateDollarPnl(symbol: string, pips: number, lotSize: number, price = 0): number {
  const lots = Number(lotSize);
  if (!Number.isFinite(lots) || lots <= 0) return 0;
  return pips * lots * getPipValuePerLot(symbol, price);
}

export function priceDistanceToPips(symbol: string, distance: number): number {
  const numericDistance = Number(distance);
  if (!Number.isFinite(numericDistance)) return 0;
  return numericDistance / getPipSize(symbol);
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
  const resultKey = String(result || '').toUpperCase();
  if (resultKey === 'BE' || resultKey === 'BREAKEVEN') return 0;

  const entry = Number(entryPrice);
  const sl = Number(stopLoss);
  const tp = Number(takeProfit);
  if (!Number.isFinite(entry)) return 0;

  const exit = Number(actualExit);
  const resolvedExit = Number.isFinite(exit) && exit > 0
    ? exit
    : resultKey === 'LOSS' ? sl : resultKey === 'WIN' ? tp : 0;
  if (!Number.isFinite(resolvedExit) || resolvedExit <= 0) return 0;

  // Realized pips are signed from the trade direction. This keeps the
  // journal honest if someone enters an exit price instead of just WIN/LOSS.
  const isSell = String(direction || '').toUpperCase() === 'SELL';
  const signedMove = isSell ? entry - resolvedExit : resolvedExit - entry;
  if (resultKey === 'WIN' && signedMove < 0 && !actualExit) return 0;
  if (resultKey === 'LOSS' && signedMove > 0 && !actualExit) return 0;
  return priceDistanceToPips(symbol, signedMove);
}

export function calculateRiskReward(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
): number {
  const risk = Math.abs(Number(entryPrice) - Number(stopLoss));
  const reward = Math.abs(Number(takeProfit) - Number(entryPrice));
  return risk > 0 && Number.isFinite(reward) ? reward / risk : 0;
}
