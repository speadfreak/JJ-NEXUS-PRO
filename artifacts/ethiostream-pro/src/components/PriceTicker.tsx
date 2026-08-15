import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { subscribeToPrice, refreshAllPrices, formatPriceForSymbol } from '@/utils/priceEngine';

const TICKER_SYMBOLS = [
  'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'AUDUSD',
  'USDCHF', 'USDCAD', 'NZDUSD', 'XAGUSD', 'BTCUSD', 'ETHUSD',
  'US30', 'NAS100', 'SPX500', 'USOIL', 'EURJPY', 'EURGBP',
]

interface TickerItem {
  symbol: string
  price: number
  prevPrice: number
}

export function PriceTicker() {
  const [items, setItems] = useState<TickerItem[]>(
    TICKER_SYMBOLS.map(s => ({ symbol: s, price: 0, prevPrice: 0 }))
  )

  useEffect(() => {
    const unsub = subscribeToPrice((prices) => {
      setItems(prev => prev.map(item => {
        const newPrice = prices[item.symbol] || 0
        return {
          ...item,
          prevPrice: item.price > 0 ? item.price : newPrice,
          price: newPrice > 0 ? newPrice : item.price,
        }
      }))
    })
    return () => unsub()
  }, [])

  const TickerContent = ({ prefix }: { prefix: string }) => (
    <div className="flex items-center whitespace-nowrap px-4 space-x-8">
      {items.filter(i => i.price > 0).map((item) => {
        const isUp = item.price >= item.prevPrice
        const formattedPrice = formatPriceForSymbol(item.symbol, item.price)
        const changePct = item.prevPrice > 0
          ? ((item.price - item.prevPrice) / item.prevPrice * 100).toFixed(3)
          : '0.000'

        return (
          <div key={`${prefix}-${item.symbol}`} className="flex items-center space-x-2 text-sm font-mono">
            <span className="font-bold text-[hsl(var(--foreground))] text-xs">{item.symbol}</span>
            <span className={`text-sm font-semibold transition-colors ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {formattedPrice}
            </span>
            <span className={`flex items-center text-xs ${isUp ? 'text-green-500' : 'text-red-500'}`}>
              {isUp ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
              {Math.abs(parseFloat(changePct)).toFixed(2)}%
            </span>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex-1 overflow-hidden flex items-center bg-black/50 h-full relative z-10 backdrop-blur-md">
      <div className="flex animate-[marquee_50s_linear_infinite]">
        <TickerContent prefix="a" />
        <TickerContent prefix="b" />
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
