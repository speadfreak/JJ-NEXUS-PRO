/**
 * Backtest API Routes
 * Fetches historical COT data, price data, and regime data for the QuantLab backtest engine.
 */
import { Router } from 'express'

const router = Router()

// In-memory cache: key → { data, ts }
const cache = new Map<string, { data: unknown; ts: number }>()
const COT_CACHE_TTL    = 7 * 24 * 60 * 60 * 1000  // 7 days
const PRICE_CACHE_TTL  = 24 * 60 * 60 * 1000       // 1 day
const REGIME_CACHE_TTL = 24 * 60 * 60 * 1000       // 1 day

function getCached(key: string, ttl: number): unknown | null {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttl) return hit.data
  return null
}
function setCached(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() })
}

// ── CFTC market codes ──────────────────────────────────────────────────────────
const CFTC_CODES: Record<string, string> = {
  XAUUSD: '088691',
  EURUSD: '099741',
  GBPUSD: '096742',
}

// ── Route 1: Historical COT data (full 20+ years) ────────────────────────────
router.get('/cot-data', async (req, res) => {
  const instrument = String(req.query.instrument ?? 'XAUUSD')
  const cftcCode = CFTC_CODES[instrument]
  if (!cftcCode) {
    res.status(400).json({ error: `Unknown instrument: ${instrument}` })
    return
  }

  const cacheKey = `cot:${instrument}`
  const cached = getCached(cacheKey, COT_CACHE_TTL)
  if (cached) {
    res.json({ data: cached, cached: true, ts: Date.now() })
    return
  }

  try {
    // Socrata JSON API — simple query params (matches working /api/proxy/cftc-contract pattern)
    // cftc_contract_market_code is the correct filterable field; no $where clause needed
    const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json` +
      `?cftc_contract_market_code=${encodeURIComponent(cftcCode)}` +
      `&$limit=2000` +
      `&$order=report_date_as_yyyy_mm_dd+ASC`

    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'JJNexusPro/2.0' },
      signal: AbortSignal.timeout(30000),
    })

    if (!resp.ok) {
      res.status(502).json({ error: `CFTC API error ${resp.status}` })
      return
    }

    const rows = await resp.json() as any[]

    // Normalise rows
    const n = (row: any, k: string) => {
      const v = row[k]
      if (v == null || v === '') return 0
      const num = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v)
      return isNaN(num) ? 0 : num
    }

    const data = rows
      .filter((r: any) => r.report_date_as_yyyy_mm_dd)
      .map((r: any) => ({
        date:            String(r.report_date_as_yyyy_mm_dd).slice(0, 10),
        commLong:        n(r, 'comm_positions_long_all'),
        commShort:       n(r, 'comm_positions_short_all'),
        nonCommLong:     n(r, 'noncomm_positions_long_all'),
        nonCommShort:    n(r, 'noncomm_positions_short_all'),
        nonCommSpreads:  n(r, 'noncomm_positions_spread_all'),
        nonRepLong:      n(r, 'nonrept_positions_long_all'),
        nonRepShort:     n(r, 'nonrept_positions_short_all'),
        totalOI:         n(r, 'open_interest_all'),
      }))
      .filter((r: any) => r.totalOI > 0)

    setCached(cacheKey, data)
    res.json({ data, cached: false, ts: Date.now(), count: data.length })
  } catch (err: any) {
    res.status(502).json({ error: `Failed to fetch COT data: ${err.message}` })
  }
})

// ── Route 2: Historical weekly price data (Yahoo Finance) ────────────────────
// Ticker map for Yahoo Finance
const YF_TICKERS: Record<string, string> = {
  XAUUSD: 'GC%3DF',
  EURUSD: 'EURUSD%3DX',
  GBPUSD: 'GBPUSD%3DX',
  DXY:    'DX-Y.NYB',
  VIX:    '%5EVIX',
}

async function fetchYahooWeekly(symbol: string): Promise<{ date: string; close: number }[]> {
  const ticker = YF_TICKERS[symbol] ?? symbol
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}` +
    `?range=25y&interval=1wk&events=history`

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  })

  if (!resp.ok) throw new Error(`Yahoo Finance ${resp.status} for ${symbol}`)

  const json = await resp.json() as any
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`No data in Yahoo Finance response for ${symbol}`)

  const timestamps: number[] = result.timestamp ?? []
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []

  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      close: closes[i] ?? 0,
    }))
    .filter(r => r.close > 0)
}

router.get('/price-data', async (req, res) => {
  const instrument = String(req.query.instrument ?? 'XAUUSD')
  const cacheKey = `price:${instrument}`
  const cached = getCached(cacheKey, PRICE_CACHE_TTL)
  if (cached) {
    res.json({ data: cached, cached: true })
    return
  }

  try {
    const data = await fetchYahooWeekly(instrument)
    setCached(cacheKey, data)
    res.json({ data, cached: false, count: data.length })
  } catch (err: any) {
    res.status(502).json({ error: `Price data fetch failed: ${err.message}` })
  }
})

// ── Route 3: Regime data (DXY + VIX) ─────────────────────────────────────────
router.get('/regime-data', async (req, res) => {
  const cacheKey = 'regime:all'
  const cached = getCached(cacheKey, REGIME_CACHE_TTL)
  if (cached) {
    res.json({ data: cached, cached: true })
    return
  }

  try {
    const [dxyData, vixData] = await Promise.all([
      fetchYahooWeekly('DXY').catch(() => [] as { date: string; close: number }[]),
      fetchYahooWeekly('VIX').catch(() => [] as { date: string; close: number }[]),
    ])

    // Build date-indexed maps
    const dxyMap = new Map(dxyData.map(r => [r.date, r.close]))
    const vixMap = new Map(vixData.map(r => [r.date, r.close]))

    // Collect all unique dates
    const allDates = Array.from(new Set([...dxyMap.keys(), ...vixMap.keys()])).sort()

    // Compute DXY 50-week SMA for regime
    const dxyCloses = allDates.map(d => dxyMap.get(d) ?? null)
    const dxy50sma = allDates.map((_, i) => {
      const window = dxyCloses.slice(Math.max(0, i - 49), i + 1).filter(v => v != null) as number[]
      return window.length >= 10 ? window.reduce((a, b) => a + b, 0) / window.length : null
    })

    const data = allDates.map((date, i) => {
      const dxy = dxyMap.get(date) ?? null
      const vix = vixMap.get(date) ?? null
      const sma50 = dxy50sma[i]
      return {
        date,
        dxy,
        vix,
        dxyRegime: dxy == null || sma50 == null ? 'UNKNOWN'
          : Math.abs(dxy - sma50) / sma50 < 0.02 ? 'RANGING'
          : dxy > sma50 ? 'STRONG_USD'
          : 'WEAK_USD',
        vixRegime: vix == null ? 'UNKNOWN'
          : vix > 30 ? 'CRISIS'
          : vix > 20 ? 'ELEVATED'
          : 'NORMAL',
      }
    })

    setCached(cacheKey, data)
    res.json({ data, cached: false, count: data.length })
  } catch (err: any) {
    res.status(502).json({ error: `Regime data fetch failed: ${err.message}` })
  }
})

export default router
