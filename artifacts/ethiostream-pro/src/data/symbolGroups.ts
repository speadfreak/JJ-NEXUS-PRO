export interface SymbolGroup {
  label: string
  symbols: string[]
}

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    label: 'Commodities',
    symbols: ['XAUUSD', 'XAGUSD', 'XPTUSD', 'USOIL', 'UKOIL', 'NGAS', 'COPPER'],
  },
  {
    label: 'Forex Majors',
    symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD'],
  },
  {
    label: 'Forex Minors',
    symbols: ['EURGBP', 'EURJPY', 'GBPJPY', 'EURCAD', 'EURCHF', 'AUDCAD', 'AUDNZD', 'GBPCAD', 'GBPCHF', 'NZDJPY', 'CADJPY', 'CHFJPY'],
  },
  {
    label: 'Indices',
    symbols: ['US30', 'NAS100', 'SPX500', 'UK100', 'GER40', 'FRA40', 'AUS200', 'JPN225'],
  },
  {
    label: 'Crypto',
    symbols: ['BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD'],
  },
]

export const ALL_SYMBOLS = SYMBOL_GROUPS.flatMap(g => g.symbols)

export const SYMBOL_DISPLAY_NAMES: Record<string, string> = {
  XAUUSD: 'Gold',
  XAGUSD: 'Silver',
  USOIL: 'WTI Oil',
  UKOIL: 'Brent Oil',
  US30: 'Dow Jones',
  NAS100: 'Nasdaq',
  SPX500: 'S&P 500',
  UK100: 'FTSE 100',
  GER40: 'DAX 40',
  BTCUSD: 'Bitcoin',
  ETHUSD: 'Ethereum',
}
