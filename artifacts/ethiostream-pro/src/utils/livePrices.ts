import { useState, useEffect, useRef } from 'react'

export interface PriceData {
  symbol: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  source: string
  timestamp: Date
}

async function fetchFrankfurter(): Promise<Record<string, number>> {
  const res = await fetch('/api/proxy/forex-rates')
  const data = await res.json()
  const rates = data.rates as Record<string, number>
  const prices: Record<string, number> = {}
  if (rates) {
    if (rates.EUR) prices['EURUSD'] = parseFloat((1 / rates.EUR).toFixed(5))
    if (rates.GBP) prices['GBPUSD'] = parseFloat((1 / rates.GBP).toFixed(5))
    if (rates.JPY) prices['USDJPY'] = parseFloat(rates.JPY.toFixed(3))
    if (rates.CHF) prices['USDCHF'] = parseFloat(rates.CHF.toFixed(5))
    if (rates.AUD) prices['AUDUSD'] = parseFloat((1 / rates.AUD).toFixed(5))
    if (rates.NZD) prices['NZDUSD'] = parseFloat((1 / rates.NZD).toFixed(5))
    if (rates.CAD) prices['USDCAD'] = parseFloat(rates.CAD.toFixed(5))
    if (rates.GBP && rates.EUR) prices['EURGBP'] = parseFloat((rates.GBP / rates.EUR).toFixed(5))
    if (rates.JPY && rates.EUR) prices['EURJPY'] = parseFloat((rates.JPY / rates.EUR).toFixed(3))
    if (rates.JPY && rates.GBP) prices['GBPJPY'] = parseFloat((rates.JPY / rates.GBP).toFixed(3))
    if (rates.JPY && rates.AUD) prices['AUDJPY'] = parseFloat((rates.JPY / rates.AUD).toFixed(3))
    if (rates.JPY && rates.CHF) prices['CHFJPY'] = parseFloat((rates.JPY / rates.CHF).toFixed(3))
  }
  return prices
}

async function fetchCoinGecko(): Promise<Record<string, number>> {
  const res = await fetch('/api/proxy/crypto')
  if (!res.ok) throw new Error(`Crypto proxy HTTP ${res.status}`)
  const data = await res.json()
  return {
    'BTCUSD': data.bitcoin?.usd || 0,
    'ETHUSD': data.ethereum?.usd || 0,
    'SOLUSD': data.solana?.usd || 0,
    'XRPUSD': data.ripple?.usd || 0,
  }
}

export async function fetchGoldPrice(): Promise<number> {
  const sources = [
    async () => {
      const res = await fetch('/api/proxy/gold-price')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data?.price || null
    },
    async () => {
      const key = localStorage.getItem('jjnexus_goldapi_key') || ''
      if (!key) throw new Error('No gold api key')
      const res = await fetch('https://www.goldapi.io/api/XAU/USD', {
        headers: { 'x-access-token': key }
      })
      const data = await res.json()
      return data.price || data.ask || null
    },
  ]

  for (const source of sources) {
    try {
      const price = await source()
      if (price && price > 1500 && price < 10000) {
        console.log(`Gold price fetched: $${price}`)
        return price
      }
    } catch {
      continue
    }
  }

  console.warn('All gold price sources failed')
  return 0
}

export async function fetchAllPrices(): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}

  const [forex, gold, crypto] = await Promise.allSettled([
    fetchFrankfurter(),
    fetchGoldPrice(),
    fetchCoinGecko(),
  ])

  if (forex.status === 'fulfilled') Object.assign(prices, forex.value)
  if (gold.status === 'fulfilled' && gold.value > 0) {
    prices['XAUUSD'] = gold.value
    prices['GOLD'] = gold.value
  }
  if (crypto.status === 'fulfilled') Object.assign(prices, crypto.value)

  return prices
}

export const livePrices = {
  get: (pair: string): number => {
    try { const s = localStorage.getItem('jjnexus_prices'); if (s) { const p = JSON.parse(s); if (p[pair]) return p[pair] } } catch {}
    return 0
  },
  getAll: (): Record<string, number> => {
    try { const s = localStorage.getItem('jjnexus_prices'); if (s) return JSON.parse(s) } catch {}
    return {}
  },
  save: (pair: string, price: number) => {
    try {
      const s = localStorage.getItem('jjnexus_prices')
      const p = s ? JSON.parse(s) : {}
      p[pair] = price
      localStorage.setItem('jjnexus_prices', JSON.stringify(p))
    } catch {}
  },
}

export function useLivePrices() {
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const prevPrices = useRef<Record<string, number>>({})

  const refresh = async () => {
    setLoading(true)
    try {
      const fresh = await fetchAllPrices()
      setPrices(fresh)
      setLastUpdate(new Date())
      prevPrices.current = fresh
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [])

  const getPrice = (symbol: string): number => prices[symbol] || 0

  const formatPrice = (symbol: string, price?: number): string => {
    const p = price ?? prices[symbol]
    if (!p || p === 0) return '— Fetching...'
    if (symbol.includes('JPY') || symbol === 'EURJPY' || symbol === 'GBPJPY' || symbol === 'AUDJPY') return p.toFixed(3)
    if (p > 500) return p.toFixed(2)
    if (p > 10) return p.toFixed(3)
    return p.toFixed(5)
  }

  return { prices, lastUpdate, loading, refresh, getPrice, formatPrice }
}
