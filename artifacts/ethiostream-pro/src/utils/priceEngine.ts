import { useState, useEffect } from 'react'

async function fetchFrankfurter(): Promise<Record<string, number>> {
  const res = await fetch('/api/proxy/forex-rates')
  const data = await res.json()
  const r = data.rates as Record<string, number>
  if (!r) throw new Error('No rates')
  const safe = (v?: number, decimals = 5) => v ? +v.toFixed(decimals) : undefined
  const result: Record<string, number> = {}
  const add = (k: string, v: number | undefined) => { if (v && v > 0) result[k] = v }
  add('EURUSD', safe(r.EUR ? 1/r.EUR : undefined))
  add('GBPUSD', safe(r.GBP ? 1/r.GBP : undefined))
  add('USDJPY', safe(r.JPY, 3))
  add('USDCHF', safe(r.CHF))
  add('AUDUSD', safe(r.AUD ? 1/r.AUD : undefined))
  add('NZDUSD', safe(r.NZD ? 1/r.NZD : undefined))
  add('USDCAD', safe(r.CAD))
  add('EURGBP', safe(r.EUR && r.GBP ? r.GBP/r.EUR : undefined))
  add('EURJPY', safe(r.EUR && r.JPY ? r.JPY/r.EUR : undefined, 3))
  add('GBPJPY', safe(r.GBP && r.JPY ? r.JPY/r.GBP : undefined, 3))
  add('EURCHF', safe(r.EUR && r.CHF ? r.CHF/r.EUR : undefined))
  add('GBPCHF', safe(r.GBP && r.CHF ? r.CHF/r.GBP : undefined))
  add('AUDJPY', safe(r.AUD && r.JPY ? r.JPY/r.AUD : undefined, 3))
  add('CADJPY', safe(r.CAD && r.JPY ? r.JPY/r.CAD : undefined, 3))
  add('AUDCAD', safe(r.AUD && r.CAD ? r.CAD/r.AUD : undefined))
  add('AUDNZD', safe(r.AUD && r.NZD ? r.NZD/r.AUD : undefined))
  add('NZDCAD', safe(r.NZD && r.CAD ? r.CAD/r.NZD : undefined))
  add('CHFJPY', safe(r.CHF && r.JPY ? r.JPY/r.CHF : undefined, 3))
  add('USDSGD', safe(r.SGD))
  add('USDHKD', safe(r.HKD))
  add('USDMXN', safe(r.MXN))
  add('USDZAR', safe(r.ZAR))
  add('USDNOK', safe(r.NOK))
  add('USDSEK', safe(r.SEK))
  add('USDDKK', safe(r.DKK))
  add('USDTRY', safe(r.TRY))
  add('USDPLN', safe(r.PLN))
  add('USDHUF', safe(r.HUF))
  add('USDCZK', safe(r.CZK))
  return result
}

async function fetchCrypto(): Promise<Record<string, number>> {
  const res = await fetch('/api/proxy/crypto')
  if (!res.ok) throw new Error(`Crypto proxy HTTP ${res.status}`)
  const d = await res.json()
  return {
    BTCUSD: d.bitcoin?.usd || 0,
    ETHUSD: d.ethereum?.usd || 0,
    SOLUSD: d.solana?.usd || 0,
    XRPUSD: d.ripple?.usd || 0,
    BNBUSD: d.binancecoin?.usd || 0,
    ADAUSD: d.cardano?.usd || 0,
    DOGEUSD: d.dogecoin?.usd || 0,
    DOTUSD: d.polkadot?.usd || 0,
    BTC_CHANGE: d.bitcoin?.usd_24h_change || 0,
    ETH_CHANGE: d.ethereum?.usd_24h_change || 0,
    SOL_CHANGE: d.solana?.usd_24h_change || 0,
  }
}

async function fetchGoldYahoo(): Promise<number> {
  // Use backend proxy to avoid CORS issues
  try {
    const res = await fetch('/api/proxy/gold-price')
    if (res.ok) {
      const data = await res.json()
      if (data.price && data.price > 1500 && data.price < 15000) return data.price
    }
  } catch {}
  return 0
}

async function fetchCommodities(): Promise<Record<string, number>> {
  const results: Record<string, number> = {}

  // Try Yahoo Finance for gold first
  const goldYahoo = await fetchGoldYahoo()
  if (goldYahoo > 1500) {
    results.XAUUSD = goldYahoo
    results.GOLD = goldYahoo
  }

  if (!results.XAUUSD) {
    try {
      const res = await fetch('/api/proxy/gold-price')
      if (res.ok) {
        const data = await res.json()
        if (data.price && data.price > 1500) {
          results.XAUUSD = +data.price.toFixed(2)
          results.GOLD = results.XAUUSD
        }
      }
    } catch {}
  }

  // GoldAPI.io fallback
  if (!results.XAUUSD) {
    try {
      const key = localStorage.getItem('jjnexus_goldapi_key') || ''
      if (key) {
        const res = await fetch('https://www.goldapi.io/api/XAU/USD', {
          headers: { 'x-access-token': key, 'Content-Type': 'application/json' }
        })
        const d = await res.json()
        if (d.price && d.price > 1500) {
          results.XAUUSD = +d.price.toFixed(2)
          results.GOLD = results.XAUUSD
          if (d.silver_price) results.XAGUSD = +d.silver_price.toFixed(3)
        }
      }
    } catch {}
  }

  // Silver, WTI Oil, Brent via backend proxy
  const commodityMap: Array<[string, string, number, number]> = [
    ['XAGUSD', 'SI=F', 10, 200],
    ['USOIL', 'CL=F', 10, 500],
    ['UKOIL', 'BZ=F', 10, 500],
  ]
  await Promise.allSettled(
    commodityMap.map(async ([name, sym, min, max]) => {
      if (name === 'XAGUSD' && results.XAGUSD) return
      try {
        const res = await fetch(`/api/proxy/yahoo-price?symbol=${encodeURIComponent(sym)}`)
        if (res.ok) {
          const d = await res.json()
          if (d.price && d.price > min && d.price < max) results[name] = d.price
        }
      } catch {}
    })
  )

  return results
}

async function fetchIndices(): Promise<Record<string, number>> {
  const symbols: Record<string, string> = {
    US30: '^DJI', NAS100: '^IXIC', SPX500: '^GSPC',
    GER40: '^GDAXI', UK100: '^FTSE', JP225: '^N225',
    AUS200: '^AXJO', HK50: '^HSI', VIX: '^VIX',
    DXY: 'DX-Y.NYB',
  }
  const results: Record<string, number> = {}
  await Promise.allSettled(
    Object.entries(symbols).map(async ([name, sym]) => {
      try {
        const res = await fetch(`/api/proxy/yahoo-price?symbol=${encodeURIComponent(sym)}`)
        if (res.ok) {
          const d = await res.json()
          if (d.price && d.price > 0) results[name] = d.price
        }
      } catch {}
    })
  )
  return results
}

async function fetchStocks(): Promise<Record<string, number>> {
  const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'NFLX', 'AMD', 'INTC']
  const results: Record<string, number> = {}
  await Promise.allSettled(
    symbols.map(async (sym) => {
      try {
        const res = await fetch(`/api/proxy/yahoo-price?symbol=${encodeURIComponent(sym)}`)
        if (res.ok) {
          const d = await res.json()
          if (d.price && d.price > 0) results[sym] = d.price
        }
      } catch {}
    })
  )
  return results
}

let priceCache: Record<string, number> = {}
let lastFetch = 0
let listeners: Array<(prices: Record<string, number>) => void> = []
let isFetching = false

export async function refreshAllPrices(): Promise<Record<string, number>> {
  if (isFetching) return priceCache
  isFetching = true
  try {
    const [forex, crypto, commodities, indices] = await Promise.allSettled([
      fetchFrankfurter(),
      fetchCrypto(),
      fetchCommodities(),
      fetchIndices(),
    ])

    const fresh: Record<string, number> = {}
    if (forex.status === 'fulfilled') Object.assign(fresh, forex.value)
    if (crypto.status === 'fulfilled') Object.assign(fresh, crypto.value)
    if (commodities.status === 'fulfilled') Object.assign(fresh, commodities.value)
    if (indices.status === 'fulfilled') Object.assign(fresh, indices.value)

    // Sanity checks
    if (fresh.XAUUSD && (fresh.XAUUSD < 1000 || fresh.XAUUSD > 10000)) delete fresh.XAUUSD
    if (fresh.EURUSD && (fresh.EURUSD < 0.5 || fresh.EURUSD > 2.5)) delete fresh.EURUSD
    if (fresh.BTCUSD && fresh.BTCUSD < 1000) delete fresh.BTCUSD

    priceCache = { ...priceCache, ...fresh }
    lastFetch = Date.now()
    listeners.forEach(fn => fn({ ...priceCache }))

    // Fetch stocks in background without blocking
    fetchStocks().then(stocks => {
      Object.assign(priceCache, stocks)
      listeners.forEach(fn => fn({ ...priceCache }))
    }).catch(() => {})

  } finally {
    isFetching = false
  }
  return priceCache
}

export function getPrice(symbol: string): number {
  return priceCache[symbol] || priceCache[symbol.replace('/', '')] || 0
}

export function getPriceCache(): Record<string, number> {
  return { ...priceCache }
}

export function subscribeToPrice(fn: (prices: Record<string, number>) => void): () => void {
  listeners.push(fn)
  if (Object.keys(priceCache).length > 0) fn({ ...priceCache })
  return () => { listeners = listeners.filter(l => l !== fn) }
}

export function formatPriceForSymbol(symbol: string, price: number): string {
  if (!price || price === 0) return '—'
  if (typeof symbol !== 'string' || !symbol) return typeof price === 'number' ? price.toFixed(5) : '—'
  const sym = symbol.toUpperCase()
  if (sym.includes('JPY') || sym === 'USDJPY' || sym === 'CHFJPY') return price.toFixed(3)
  if (sym === 'XAUUSD' || sym === 'GOLD' || sym === 'XAGUSD' || sym === 'XPTUSD' || sym === 'XPDUSD') return price.toFixed(2)
  if (['US30','NAS100','SPX500','GER40','UK100','JP225','AUS200','HK50'].includes(sym)) return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (['BTCUSD','ETHUSD'].includes(sym)) return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (['SOLUSD','BNBUSD'].includes(sym)) return price.toFixed(2)
  if (price > 100) return price.toFixed(2)
  if (price > 10) return price.toFixed(3)
  return price.toFixed(5)
}

export function useLivePrices() {
  const [prices, setPrices] = useState<Record<string, number>>(priceCache)
  const [loading, setLoading] = useState(Object.keys(priceCache).length === 0)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub = subscribeToPrice(p => {
      setPrices({ ...p })
      setLoading(false)
      setLastUpdate(new Date())
    })
    if (Date.now() - lastFetch > 8000) {
      refreshAllPrices().catch(e => setError(e.message))
    }
    const interval = setInterval(() => {
      refreshAllPrices().catch(e => setError(e.message))
    }, 15000)
    return () => { unsub(); clearInterval(interval) }
  }, [])

  const formatPrice = (symbol: string, price?: number) => {
    const p = price ?? prices[symbol]
    if (!p || p === 0) return '—'
    return formatPriceForSymbol(symbol, p)
  }

  return {
    prices,
    loading,
    lastUpdate,
    error,
    formatPrice,
    getPrice: (s: string) => prices[s] || priceCache[s] || 0,
  }
}
