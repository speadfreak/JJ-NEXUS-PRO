/**
 * COT Data Engine
 * Fetches real CFTC data and computes all research-based indices.
 *
 * Dreesmann et al. (2023) — 26-week Dreesmann index (signal generation)
 * Zhang and Laws (2013) — 156-week Wang sentiment index (3-year context)
 */

import {
  calculateWangSentimentIndex,
  calculateCOTIndex26Week,
  calculate10WeekSMA,
} from './cotSignalEngine'

export interface COTWeeklyData {
  reportDate: string
  pair: string

  // Raw positions
  commercialLong: number
  commercialShort: number
  commercialNet: number
  nonCommercialLong: number
  nonCommercialShort: number
  nonCommercialSpreads: number
  nonCommercialNet: number
  nonReportableLong: number
  nonReportableShort: number
  nonReportableNet: number
  totalOpenInterest: number

  // Open interest percentages (Dreesmann validation)
  commercialLongOIPercent: number
  commercialShortOIPercent: number
  nonCommercialOIPercent: number
  nonReportableOIPercent: number

  // Dreesmann 26-week indices (signal generation)
  commercialIndex26: number
  nonCommercialIndex26: number
  nonReportableIndex26: number

  // Wang 3-year (156-week) sentiment indices (Zhang precision)
  commercialSI156: number
  nonCommercialSI156: number
  nonReportableSI156: number

  // Weekly changes
  weeklyChange: {
    commercialNet: number
    nonCommercialNet: number
    nonReportableNet: number
    openInterest: number
  }

  // Price data
  weeklyClose: number
  sma10Week: number
  smaRising: boolean
}

// CFTC contract codes mapped to JJ NEXUS PRO pairs
export const CFTC_MARKET_MAP: Record<string, {
  cftcCode: string
  contractName: string
  pairName: string
  category: string
}> = {
  'XAUUSD': { cftcCode: '088691', contractName: 'GOLD - COMMODITY EXCHANGE INC.', pairName: 'Gold', category: 'Metals' },
  'XAGUSD': { cftcCode: '084691', contractName: 'SILVER - COMMODITY EXCHANGE INC.', pairName: 'Silver', category: 'Metals' },
  'EURUSD': { cftcCode: '099741', contractName: 'EURO FX - CHICAGO MERCANTILE EXCHANGE', pairName: 'Euro FX', category: 'Currencies' },
  'GBPUSD': { cftcCode: '096742', contractName: 'BRITISH POUND STERLING - CHICAGO MERCANTILE EXCHANGE', pairName: 'British Pound', category: 'Currencies' },
  'USDJPY': { cftcCode: '097741', contractName: 'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE', pairName: 'Japanese Yen', category: 'Currencies' },
  'AUDUSD': { cftcCode: '232741', contractName: 'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE', pairName: 'Australian Dollar', category: 'Currencies' },
  'USDCAD': { cftcCode: '090741', contractName: 'CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE', pairName: 'Canadian Dollar', category: 'Currencies' },
  'USDCHF': { cftcCode: '092741', contractName: 'SWISS FRANC - CHICAGO MERCANTILE EXCHANGE', pairName: 'Swiss Franc', category: 'Currencies' },
  'SPX500': { cftcCode: '13874A', contractName: 'S&P 500 STOCK INDEX - CHICAGO MERCANTILE EXCHANGE', pairName: 'S&P 500', category: 'Stock Indices' },
  'NAS100': { cftcCode: '20974P', contractName: 'NASDAQ-100 STOCK INDEX - CHICAGO MERCANTILE EXCHANGE', pairName: 'Nasdaq 100', category: 'Stock Indices' },
  'USOIL':  { cftcCode: '067651', contractName: 'CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE', pairName: 'Crude Oil', category: 'Energy' },
  'NZDUSD': { cftcCode: '112741', contractName: 'NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE', pairName: 'New Zealand Dollar', category: 'Currencies' },
}

const CACHE_PREFIX = 'jjnexus_cot_research_'
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours

// Fetch real CFTC COT data via backend proxy (filters by contract code)
async function fetchCFTCData(contractCode: string): Promise<any[]> {
  try {
    // Try backend proxy first (filtered by contract code)
    const resp = await fetch(
      `/api/proxy/cftc-contract?code=${encodeURIComponent(contractCode)}&limit=200`,
      { signal: AbortSignal.timeout(15000) },
    )
    if (resp.ok) {
      const json = await resp.json()
      // Handle both Socrata JSON formats
      if (Array.isArray(json)) return json
      if (json.data && Array.isArray(json.data)) {
        // Old-style Socrata: rows are arrays; columns defined in json.meta
        const cols: string[] = json.meta?.view?.columns?.map((c: any) => c.fieldName) ?? []
        return json.data.map((row: any[]) => {
          const obj: Record<string, any> = {}
          cols.forEach((col, i) => { obj[col] = row[i] })
          return obj
        })
      }
    }
  } catch (e) {
    console.error('[COT] Proxy fetch failed:', e)
  }
  return []
}

// Parse a single CFTC row into numeric values
function parseRow(row: any) {
  const n = (k: string) => {
    const v = row[k]
    if (v === null || v === undefined || v === '') return 0
    const num = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v)
    return isNaN(num) ? 0 : num
  }
  return {
    reportDate: (row['report_date_as_yyyy_mm_dd'] || row['report_date'] || '').toString().slice(0, 10),
    commLong:     n('comm_positions_long_all')     || n('commercials_long')     || 0,
    commShort:    n('comm_positions_short_all')    || n('commercials_short')    || 0,
    nonCommLong:  n('noncomm_positions_long_all')  || n('noncommercial_long')   || 0,
    nonCommShort: n('noncomm_positions_short_all') || n('noncommercial_short')  || 0,
    nonCommSpreads: n('noncomm_positions_spread_all') || 0,
    nonRepLong:   n('nonrept_positions_long_all')  || n('nonreportable_long')   || 0,
    nonRepShort:  n('nonrept_positions_short_all') || n('nonreportable_short')  || 0,
    totalOI:      n('open_interest_all')           || n('open_interest')        || 0,
  }
}

export async function buildCOTDataset(
  pair: string,
  currentPrice: number,
  historicalPrices: number[],
): Promise<COTWeeklyData[]> {
  const marketInfo = CFTC_MARKET_MAP[pair]
  if (!marketInfo) return []

  // Check cache
  const cacheKey = `${CACHE_PREFIX}${pair}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { data, ts } = JSON.parse(cached)
      if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length >= 26) {
        console.log(`[COT] Cache hit for ${pair} (${data.length} weeks)`)
        return data
      }
    }
  } catch { /* ignore */ }

  const rawData = await fetchCFTCData(marketInfo.cftcCode)

  if (rawData.length < 26) {
    console.warn(`[COT] Insufficient CFTC data for ${pair}: ${rawData.length} rows`)
    return []
  }

  // Sort newest first
  const sortedData = [...rawData].sort((a, b) => {
    const da = (a['report_date_as_yyyy_mm_dd'] || a['report_date'] || '').toString()
    const db = (b['report_date_as_yyyy_mm_dd'] || b['report_date'] || '').toString()
    return db.localeCompare(da)
  })

  const parsed = sortedData.map(parseRow)

  // Build weekly dataset with all calculations (up to 156 weeks for Wang index)
  const result: COTWeeklyData[] = parsed.slice(0, 156).map((row, index) => {
    const commNet    = row.commLong - row.commShort
    const nonCommNet = row.nonCommLong - row.nonCommShort
    const nonRepNet  = row.nonRepLong - row.nonRepShort

    // 26-week net position arrays for Dreesmann indices
    const hist26Comm    = parsed.slice(index, index + 26).map(r => r.commLong - r.commShort)
    const hist26NonComm = parsed.slice(index, index + 26).map(r => r.nonCommLong - r.nonCommShort)
    const hist26NonRep  = parsed.slice(index, index + 26).map(r => r.nonRepLong - r.nonRepShort)

    // 156-week net position arrays for Wang indices
    const hist156Comm    = parsed.slice(index, index + 156).map(r => r.commLong - r.commShort)
    const hist156NonComm = parsed.slice(index, index + 156).map(r => r.nonCommLong - r.nonCommShort)
    const hist156NonRep  = parsed.slice(index, index + 156).map(r => r.nonRepLong - r.nonRepShort)

    // Price approximation
    const priceIndex = Math.min(index, Math.max(0, historicalPrices.length - 1))
    const weeklyClose = index === 0 ? currentPrice : (historicalPrices[priceIndex] || currentPrice)

    const recentPrices  = historicalPrices.slice(0, 10)
    const olderPrices   = historicalPrices.slice(1, 11)
    const sma10         = recentPrices.length >= 2 ? calculate10WeekSMA(recentPrices) : currentPrice
    const prevSma10     = olderPrices.length >= 2 ? calculate10WeekSMA(olderPrices) : sma10

    const prevRow = index < parsed.length - 1 ? parsed[index + 1] : null

    return {
      reportDate: row.reportDate,
      pair,
      commercialLong: row.commLong,
      commercialShort: row.commShort,
      commercialNet: commNet,
      nonCommercialLong: row.nonCommLong,
      nonCommercialShort: row.nonCommShort,
      nonCommercialSpreads: row.nonCommSpreads,
      nonCommercialNet: nonCommNet,
      nonReportableLong: row.nonRepLong,
      nonReportableShort: row.nonRepShort,
      nonReportableNet: nonRepNet,
      totalOpenInterest: row.totalOI,

      commercialLongOIPercent:    row.totalOI > 0 ? row.commLong / row.totalOI : 0,
      commercialShortOIPercent:   row.totalOI > 0 ? row.commShort / row.totalOI : 0,
      nonCommercialOIPercent:     row.totalOI > 0 ? (row.nonCommLong + row.nonCommShort + 2 * row.nonCommSpreads) / (2 * row.totalOI) : 0,
      nonReportableOIPercent:     row.totalOI > 0 ? (row.nonRepLong + row.nonRepShort) / (2 * row.totalOI) : 0,

      commercialIndex26:    calculateCOTIndex26Week(commNet, hist26Comm),
      nonCommercialIndex26: calculateCOTIndex26Week(nonCommNet, hist26NonComm),
      nonReportableIndex26: calculateCOTIndex26Week(nonRepNet, hist26NonRep),

      commercialSI156:    calculateWangSentimentIndex(commNet, hist156Comm),
      nonCommercialSI156: calculateWangSentimentIndex(nonCommNet, hist156NonComm),
      nonReportableSI156: calculateWangSentimentIndex(nonRepNet, hist156NonRep),

      weeklyChange: {
        commercialNet:    prevRow ? commNet    - (prevRow.commLong    - prevRow.commShort)    : 0,
        nonCommercialNet: prevRow ? nonCommNet - (prevRow.nonCommLong - prevRow.nonCommShort) : 0,
        nonReportableNet: prevRow ? nonRepNet  - (prevRow.nonRepLong  - prevRow.nonRepShort)  : 0,
        openInterest:     prevRow ? row.totalOI - prevRow.totalOI : 0,
      },

      weeklyClose,
      sma10Week: sma10,
      smaRising: sma10 > prevSma10,
    }
  })

  // Save to cache
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ data: result, ts: Date.now() }))
  } catch { /* ignore quota errors */ }

  return result
}

export function clearCOTCache(pair?: string) {
  if (pair) {
    localStorage.removeItem(`${CACHE_PREFIX}${pair}`)
  } else {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k))
  }
}
