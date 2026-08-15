export const FOREX_PAIRS = [
  { symbol: "XAUUSD", price: 3340.50, change: 12.40, changePercent: 0.37, bid: 3340.10, ask: 3340.90 },
  { symbol: "EURUSD", price: 1.0845, change: -0.0012, changePercent: -0.11, bid: 1.0844, ask: 1.0846 },
  { symbol: "GBPUSD", price: 1.2630, change: 0.0025, changePercent: 0.20, bid: 1.2629, ask: 1.2631 },
  { symbol: "USDJPY", price: 154.25, change: -0.35, changePercent: -0.23, bid: 154.24, ask: 154.26 },
  { symbol: "USDCHF", price: 0.9020, change: 0.0010, changePercent: 0.11, bid: 0.9019, ask: 0.9021 },
  { symbol: "AUDUSD", price: 0.6480, change: -0.0015, changePercent: -0.23, bid: 0.6479, ask: 0.6481 },
  { symbol: "NZDUSD", price: 0.6050, change: 0.0008, changePercent: 0.13, bid: 0.6049, ask: 0.6051 },
  { symbol: "USDCAD", price: 1.3620, change: -0.0018, changePercent: -0.13, bid: 1.3619, ask: 1.3621 },
  { symbol: "GBPJPY", price: 194.85, change: 0.25, changePercent: 0.13, bid: 194.83, ask: 194.87 },
  { symbol: "EURJPY", price: 167.45, change: -0.15, changePercent: -0.09, bid: 167.43, ask: 167.47 },
  { symbol: "BTCUSD", price: 97800.0, change: 1250.0, changePercent: 1.29, bid: 97790.0, ask: 97810.0 },
  { symbol: "XAGUSD", price: 32.45, change: 0.25, changePercent: 0.78, bid: 32.44, ask: 32.46 },
];

export const AI_ANALYSES = [
  { date: "2026-05-08T08:00:00Z", pair: "XAUUSD", bias: "BULLISH", confidence: 88, entry: "4700.00 - 4715.00", stop: 4680.00, target: 4780.00 },
  { date: "2026-05-07T14:30:00Z", pair: "EURUSD", bias: "BEARISH", confidence: 72, entry: "1.0870 - 1.0890", stop: 1.0920, target: 1.0800 },
];

export const ECONOMIC_CALENDAR = [
  { id: 1, event: "Non-Farm Payrolls", currency: "USD", impact: "HIGH", forecast: "175K", previous: "228K", actual: "", time: "13:30" },
  { id: 2, event: "CPI m/m", currency: "USD", impact: "HIGH", forecast: "0.3%", previous: "0.2%", actual: "", time: "13:30" },
  { id: 3, event: "ECB Rate Decision", currency: "EUR", impact: "HIGH", forecast: "3.50%", previous: "3.50%", actual: "", time: "12:45" },
  { id: 4, event: "BOE Rate Statement", currency: "GBP", impact: "HIGH", forecast: "4.75%", previous: "4.75%", actual: "", time: "12:00" },
];

export const TRADE_JOURNAL_ENTRIES = [
  { id: 1, date: "2026-05-07", pair: "XAUUSD", direction: "BUY", entry: 4695.50, stop: 4680.00, target: 4760.00, result: "WIN", pips: 645, rr: "1:4.3" },
  { id: 2, date: "2026-05-06", pair: "GBPUSD", direction: "SELL", entry: 1.2680, stop: 1.2710, target: 1.2620, result: "LOSS", pips: -30, rr: "1:2" },
  { id: 3, date: "2026-05-05", pair: "USDJPY", direction: "BUY", entry: 153.80, stop: 153.50, target: 154.80, result: "WIN", pips: 100, rr: "1:3.3" },
];

export const CHAT_MESSAGES = [
  { id: 1, user: "AbebeT", text: "Gold through 4700 now! 🚀" },
  { id: 2, user: "Kaleb_FX", text: "NFP tomorrow, be careful with sizing" },
  { id: 3, user: "Sara_Trades", text: "Nice FVG fill on EURUSD H1" },
  { id: 4, user: "JJ_Admin", text: "Welcome to the premium stream! XAUUSD setup incoming." },
  { id: 5, user: "Miki_Sniper", text: "Gold OB holding perfectly 🎯" },
  { id: 6, user: "HabeshaPip", text: "This streaming quality is fire" },
  { id: 7, user: "SelamPips", text: "What's the London open bias?" },
  { id: 8, user: "Dawit_G", text: "DXY looking weak, gold bulls in control" },
];

export const MARKET_SESSIONS = {
  london: { start: 8, end: 17, timezone: 'GMT' },
  newYork: { start: 13, end: 22, timezone: 'EST' },
  tokyo: { start: 0, end: 9, timezone: 'JST' },
  sydney: { start: 22, end: 7, timezone: 'AEST' },
};

export const STREAM_HEALTH = {
  fps: 60, bitrate: 6000, latency: 0, resolution: "1920x1080"
};
