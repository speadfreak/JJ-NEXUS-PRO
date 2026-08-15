import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, TrendingUp, TrendingDown, Star, Bell, BellOff, RefreshCcw, ChevronRight, X, Zap, Activity } from 'lucide-react';
import { useLivePrices, formatPriceForSymbol, subscribeToPrice } from '@/utils/priceEngine';
import { callAlchemistAI } from '@/utils/freeAI';
import ReactMarkdown from 'react-markdown';

const ALL_PAIRS = [
  // Forex Majors
  'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD',
  // Forex Minors
  'EURGBP','EURJPY','GBPJPY','EURAUD','EURCAD','EURCHF','EURNZD',
  'GBPAUD','GBPCAD','GBPCHF','GBPNZD','AUDJPY','CADJPY','CHFJPY',
  'NZDJPY','AUDCAD','AUDCHF','AUDNZD','NZDCAD','NZDCHF',
  // Exotics
  'USDMXN','USDZAR','USDTRY','USDNOK','USDSEK','USDDKK','USDPLN',
  'USDSGD','USDHKD',
  // Metals
  'XAUUSD','XAGUSD','XPTUSD','XPDUSD',
  // Energy
  'USOIL','UKOIL',
  // Indices
  'US30','NAS100','SPX500','GER40','UK100','JP225','AUS200','HK50','VIX','DXY',
  // Crypto
  'BTCUSD','ETHUSD','SOLUSD','XRPUSD','BNBUSD','ADAUSD','DOGEUSD',
  // Stocks
  'AAPL','TSLA','NVDA','MSFT','AMZN','META','GOOGL',
]

const CATEGORIES: Record<string, string[]> = {
  'All': ALL_PAIRS,
  'Forex': ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD','EURGBP','EURJPY','GBPJPY','EURAUD','AUDJPY','CADJPY','CHFJPY','NZDJPY'],
  'Metals': ['XAUUSD','XAGUSD','XPTUSD','XPDUSD'],
  'Indices': ['US30','NAS100','SPX500','GER40','UK100','JP225','AUS200','HK50','VIX','DXY'],
  'Crypto': ['BTCUSD','ETHUSD','SOLUSD','XRPUSD','BNBUSD','ADAUSD','DOGEUSD'],
  'Stocks': ['AAPL','TSLA','NVDA','MSFT','AMZN','META','GOOGL'],
  'Energy': ['USOIL','UKOIL'],
  'Watchlist': [],
}

const DEFAULT_WATCHLIST = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','NAS100','US30','BTCUSD','ETHUSD','XAGUSD']

interface PriceHistory {
  [symbol: string]: number[]
}

interface Alert {
  symbol: string
  condition: 'above' | 'below'
  price: number
  triggered: boolean
}

function Sparkline({ data, positive }: { data: number[], positive: boolean }) {
  if (data.length < 2) return <div className="w-20 h-8 bg-white/5 rounded" />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 80, h = 32
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
  const path = `M ${pts.join(' L ')}`
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={path} fill="none" stroke={positive ? '#22c55e' : '#ef4444'} strokeWidth={1.5} />
    </svg>
  )
}

export default function Watchlist() {
  const [category, setCategory] = useState('Watchlist')
  const [search, setSearch] = useState('')
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const saved = localStorage.getItem('jjnexus_watchlist')
    return saved ? JSON.parse(saved) : DEFAULT_WATCHLIST
  })
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({})
  const [selectedPair, setSelectedPair] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>(() => {
    const saved = localStorage.getItem('jjnexus_alerts')
    return saved ? JSON.parse(saved) : []
  })
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above')
  const [alertPrice, setAlertPrice] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const prevPrices = useRef<Record<string, number>>({})

  const { prices, loading, lastUpdate, formatPrice, getPrice } = useLivePrices()

  // Build price history (last 20 ticks) per symbol
  useEffect(() => {
    const unsub = subscribeToPrice((p) => {
      setPriceHistory(prev => {
        const updated = { ...prev }
        Object.entries(p).forEach(([sym, price]) => {
          if (price > 0) {
            const hist = updated[sym] || []
            const last = hist[hist.length - 1]
            if (last !== price) {
              updated[sym] = [...hist.slice(-19), price]
            }
          }
        })
        return updated
      })
    })
    return () => unsub()
  }, [])

  // Check alerts
  useEffect(() => {
    alerts.forEach(alert => {
      if (alert.triggered) return
      const price = prices[alert.symbol]
      if (!price) return
      const triggered = alert.condition === 'above' ? price >= alert.price : price <= alert.price
      if (triggered) {
        setAlerts(prev => prev.map(a =>
          a.symbol === alert.symbol && a.price === alert.price ? { ...a, triggered: true } : a
        ))
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`🔔 JJ NEXUS PRO Alert`, {
            body: `${alert.symbol} is ${alert.condition} ${formatPriceForSymbol(alert.symbol, alert.price)}`,
          })
        }
      }
    })
  }, [prices])

  const saveWatchlist = (list: string[]) => {
    setWatchlist(list)
    localStorage.setItem('jjnexus_watchlist', JSON.stringify(list))
  }

  const saveAlerts = (list: Alert[]) => {
    setAlerts(list)
    localStorage.setItem('jjnexus_alerts', JSON.stringify(list))
  }

  const toggleWatchlist = (sym: string) => {
    if (watchlist.includes(sym)) {
      saveWatchlist(watchlist.filter(s => s !== sym))
    } else {
      saveWatchlist([...watchlist, sym])
    }
  }

  const addAlert = () => {
    if (!selectedPair || !alertPrice) return
    const alert: Alert = { symbol: selectedPair, condition: alertCondition, price: parseFloat(alertPrice), triggered: false }
    const updated = [...alerts.filter(a => !(a.symbol === selectedPair && a.price === parseFloat(alertPrice))), alert]
    saveAlerts(updated)
    setAlertPrice('')
  }

  const removeAlert = (idx: number) => {
    saveAlerts(alerts.filter((_, i) => i !== idx))
  }

  const runAnalysis = async (sym: string) => {
    const p = prices[sym] || 0
    setLoadingAnalysis(true)
    setAnalysis('')
    setSelectedPair(sym)
    try {
      const res = await callAlchemistAI(`
Quick Alchemist analysis for ${sym}. Live price: ${p > 0 ? formatPriceForSymbol(sym, p) : 'fetching'}.

Give a concise SMC analysis:
## ${sym} Quick View

**Bias:** [Bullish/Bearish/Neutral]
**HTF Structure:** [Brief description]
**Key Level:** [Most important price right now]
**Setup Quality:** X/10

**Watch For:** [1-2 sentence actionable insight]
`, p, sym)
      setAnalysis(res)
    } catch {
      setAnalysis('⚠️ Analysis failed. Please try again.')
    }
    setLoadingAnalysis(false)
  }

  const displayPairs = (() => {
    let list = category === 'Watchlist' ? watchlist : (CATEGORIES[category] || ALL_PAIRS)
    if (search) list = ALL_PAIRS.filter(s => s.toLowerCase().includes(search.toLowerCase()))
    return list
  })()

  const livePrice = selectedPair ? (prices[selectedPair] || 0) : 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-[var(--gold)]" />
          <div>
            <h1 className="font-serif font-bold text-2xl text-[var(--gold)]">WATCHLIST</h1>
            <p className="text-xs text-gray-500">
              {lastUpdate ? `Live • Updated ${lastUpdate.toLocaleTimeString()}` : 'Fetching live prices...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCcw className="w-4 h-4 text-[var(--gold)] animate-spin" />}
        </div>
      </div>

      {/* Search & Category */}
      <div className="flex flex-wrap gap-2 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search any pair, crypto, stock..."
            className="w-full bg-black border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {Object.keys(CATEGORIES).map(cat => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setSearch('') }}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                category === cat && !search
                  ? 'bg-[var(--gold)] text-black'
                  : 'bg-black border border-gray-700 text-gray-400 hover:border-[rgba(212,175,55,0.4)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Pairs List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
          {/* Header Row */}
          <div className="grid grid-cols-[1fr_120px_80px_80px_80px_60px] gap-2 px-3 py-1.5 text-[10px] font-bold text-gray-600 uppercase tracking-widest border-b border-[rgba(212,175,55,0.1)] sticky top-0 bg-[#050505]">
            <span>Pair</span>
            <span>Price</span>
            <span>Change</span>
            <span>Spread</span>
            <span className="hidden lg:block">Sparkline</span>
            <span></span>
          </div>

          <AnimatePresence>
            {displayPairs.map((sym) => {
              const price = prices[sym] || 0
              const prevPrice = prevPrices.current[sym] || price
              const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice * 100) : 0
              const isUp = price >= prevPrice
              const hist = priceHistory[sym] || []
              const spread = price > 0 ? (price * (price > 100 ? 0.0001 : 0.00005)).toFixed(price > 100 ? 1 : 4) : '—'
              const isSelected = selectedPair === sym
              const inWatchlist = watchlist.includes(sym)
              const hasAlert = alerts.some(a => a.symbol === sym && !a.triggered)

              return (
                <motion.div
                  key={sym}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`grid grid-cols-[1fr_120px_80px_80px_80px_60px] gap-2 items-center px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.06)]'
                      : 'border-[rgba(255,255,255,0.04)] hover:border-[rgba(212,175,55,0.2)] hover:bg-white/[0.02]'
                  }`}
                  onClick={() => setSelectedPair(sym === selectedPair ? null : sym)}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); toggleWatchlist(sym) }}
                      className={`shrink-0 ${inWatchlist ? 'text-[var(--gold)]' : 'text-gray-700 hover:text-gray-500'}`}
                    >
                      <Star className="w-3.5 h-3.5" fill={inWatchlist ? 'currentColor' : 'none'} />
                    </button>
                    <div>
                      <span className="font-bold text-sm text-white">{sym}</span>
                      {hasAlert && <span className="ml-1.5 text-[var(--gold)]"><Bell className="w-2.5 h-2.5 inline" /></span>}
                    </div>
                  </div>

                  <div className={`font-mono text-sm font-bold transition-colors ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                    {price > 0 ? formatPriceForSymbol(sym, price) : <span className="text-gray-700 text-xs">Loading...</span>}
                  </div>

                  <div className={`text-xs flex items-center gap-0.5 ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                    {price > 0 && (isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                    {price > 0 ? `${Math.abs(change).toFixed(2)}%` : '—'}
                  </div>

                  <div className="text-xs text-gray-600 font-mono">{spread}</div>

                  <div className="hidden lg:block">
                    <Sparkline data={hist} positive={isUp} />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); runAnalysis(sym) }}
                      className="text-[var(--gold)] hover:text-yellow-300 transition-colors"
                      title="Quick AI Analysis"
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform text-gray-600 ${isSelected ? 'rotate-90' : ''}`} />
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {displayPairs.length === 0 && (
            <div className="flex items-center justify-center py-16 text-gray-600">
              {category === 'Watchlist' ? 'No pairs in watchlist. Star pairs to add them.' : 'No pairs found.'}
            </div>
          )}
        </div>

        {/* Right Panel */}
        <AnimatePresence>
          {selectedPair && (
            <motion.div
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto custom-scrollbar"
            >
              <div className="border border-[rgba(212,175,55,0.3)] rounded-xl bg-[hsl(var(--card))] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(212,175,55,0.1)] bg-black/40">
                  <div>
                    <div className="font-bold text-white">{selectedPair}</div>
                    <div className={`text-xl font-mono font-bold ${prices[selectedPair] ? 'text-[var(--gold)]' : 'text-gray-600'}`}>
                      {livePrice > 0 ? formatPriceForSymbol(selectedPair, livePrice) : 'Loading...'}
                    </div>
                  </div>
                  <button onClick={() => setSelectedPair(null)} className="text-gray-600 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Sparkline big */}
                <div className="px-4 py-3 border-b border-[rgba(212,175,55,0.1)]">
                  <svg width="100%" height="60" viewBox="0 0 240 60" className="overflow-visible">
                    {(() => {
                      const hist = priceHistory[selectedPair] || []
                      if (hist.length < 2) return null
                      const min = Math.min(...hist)
                      const max = Math.max(...hist)
                      const range = max - min || 1
                      const pts = hist.map((v, i) =>
                        `${(i / (hist.length - 1)) * 240},${60 - ((v - min) / range) * 50}`
                      )
                      const isUp = hist[hist.length - 1] >= hist[0]
                      return (
                        <>
                          <path d={`M ${pts.join(' L ')}`} fill="none" stroke={isUp ? '#22c55e' : '#ef4444'} strokeWidth={2} />
                          {pts.map((pt, i) => {
                            const [x, y] = pt.split(',')
                            return <circle key={i} cx={x} cy={y} r={1.5} fill={isUp ? '#22c55e' : '#ef4444'} />
                          })}
                        </>
                      )
                    })()}
                  </svg>
                  <div className="text-xs text-gray-600 text-center mt-1">Last {(priceHistory[selectedPair] || []).length} ticks</div>
                </div>

                {/* Quick Analysis */}
                <div className="p-3">
                  <button
                    onClick={() => runAnalysis(selectedPair)}
                    disabled={loadingAnalysis}
                    className="w-full bg-[var(--gold)] text-black py-2 rounded font-bold text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    {loadingAnalysis ? 'Analyzing...' : 'Run Alchemist Analysis'}
                  </button>
                </div>

                {(analysis || loadingAnalysis) && (
                  <div className="px-4 pb-3 border-t border-[rgba(212,175,55,0.1)] pt-3">
                    {loadingAnalysis ? (
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <div className="w-4 h-4 border border-[rgba(212,175,55,0.3)] border-t-[var(--gold)] rounded-full animate-spin" />
                        Alchemist AI analyzing...
                      </div>
                    ) : (
                      <div className="prose prose-invert prose-xs max-w-none prose-headings:text-[var(--gold)] prose-strong:text-white text-xs">
                        <ReactMarkdown>{analysis}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Price Alert */}
              <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Bell className="w-4 h-4 text-[var(--gold)]" />
                  <span className="font-bold text-sm text-white">PRICE ALERT</span>
                </div>
                <div className="flex gap-2 mb-3">
                  <select
                    value={alertCondition}
                    onChange={e => setAlertCondition(e.target.value as 'above' | 'below')}
                    className="bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                  <input
                    type="number" value={alertPrice} onChange={e => setAlertPrice(e.target.value)}
                    placeholder={livePrice > 0 ? formatPriceForSymbol(selectedPair, livePrice) : 'Price'}
                    className="flex-1 bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--gold)]"
                  />
                  <button
                    onClick={addAlert}
                    className="bg-[rgba(212,175,55,0.2)] text-[var(--gold)] px-3 py-1.5 rounded text-xs font-bold hover:bg-[var(--gold)] hover:text-black transition-colors"
                  >
                    Set
                  </button>
                </div>

                <div className="space-y-1.5">
                  {alerts.filter(a => a.symbol === selectedPair).map((alert, i) => (
                    <div key={i} className={`flex items-center gap-2 p-2 rounded border text-xs ${alert.triggered ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-[rgba(212,175,55,0.2)] text-gray-400'}`}>
                      <Bell className="w-3 h-3" />
                      <span className="flex-1">{alert.condition} {formatPriceForSymbol(selectedPair, alert.price)}</span>
                      {alert.triggered && <span className="text-green-400 font-bold">✓ HIT</span>}
                      <button onClick={() => removeAlert(alerts.indexOf(alert))} className="text-gray-600 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {alerts.filter(a => a.symbol !== selectedPair).length > 0 && (
                    <div className="text-xs text-gray-600 pt-1">
                      +{alerts.filter(a => a.symbol !== selectedPair).length} alerts on other pairs
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
