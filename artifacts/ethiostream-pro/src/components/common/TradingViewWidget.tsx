import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    TradingView: {
      widget: new (config: Record<string, unknown>) => void
    }
  }
}

const TV_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: 'OANDA:XAUUSD',
  XAGUSD: 'TVC:SILVER',
  XAUEUR: 'TVC:XAUEUR',
  EURUSD: 'FX:EURUSD',
  GBPUSD: 'FX:GBPUSD',
  USDJPY: 'FX:USDJPY',
  USDCAD: 'FX:USDCAD',
  AUDUSD: 'FX:AUDUSD',
  NZDUSD: 'FX:NZDUSD',
  USDCHF: 'FX:USDCHF',
  GBPJPY: 'FX:GBPJPY',
  EURJPY: 'FX:EURJPY',
  EURGBP: 'FX:EURGBP',
  EURNZD: 'FX:EURNZD',
  AUDJPY: 'FX:AUDJPY',
  CADJPY: 'FX:CADJPY',
  US30: 'TVC:DJI',
  NAS100: 'NASDAQ:NDX',
  SPX500: 'SP:SPX',
  GER40: 'XETR:DAX',
  BTCUSD: 'COINBASE:BTCUSD',
  ETHUSD: 'COINBASE:ETHUSD',
}

const INTERVAL_MAP: Record<string, string> = {
  M1: '1', '1': '1',
  M5: '5', '5': '5',
  M15: '15', '15': '15',
  M30: '30', '30': '30',
  H1: '60', '60': '60',
  H4: '240', '240': '240',
  D1: 'D', D: 'D',
  W1: 'W', W: 'W',
  MN: 'M', M: 'M',
}

interface Props {
  symbol?: string
  interval?: string
  style?: React.CSSProperties
  className?: string
  showSideToolbar?: boolean
  studies?: string[]
}

let tvScriptPromise: Promise<void> | null = null

function loadTradingViewScript(): Promise<void> {
  if (tvScriptPromise) return tvScriptPromise
  if (typeof window !== 'undefined' && window.TradingView) {
    return (tvScriptPromise = Promise.resolve())
  }
  tvScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('tradingview-script')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('TradingView script failed')))
      return
    }
    const script = document.createElement('script')
    script.id = 'tradingview-script'
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load TradingView'))
    document.head.appendChild(script)
  })
  return tvScriptPromise
}

let widgetCounter = 0

export default function TradingViewWidget({
  symbol = 'XAUUSD',
  interval = 'H1',
  style,
  className,
  showSideToolbar = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef(`tv_widget_${++widgetCounter}`)

  useEffect(() => {
    const containerId = widgetIdRef.current
    const tvSymbol = TV_SYMBOL_MAP[symbol] ?? `FX:${symbol}`
    const tvInterval = INTERVAL_MAP[interval] ?? '60'
    let cancelled = false

    loadTradingViewScript()
      .then(() => {
        if (cancelled || !containerRef.current) return

        containerRef.current.innerHTML = `<div id="${containerId}" style="width:100%;height:100%"></div>`

        new window.TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: tvInterval,
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#0a0a0a',
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          hide_side_toolbar: !showSideToolbar,
          allow_symbol_change: true,
          withdateranges: true,
          save_image: false,
          container_id: containerId,
          studies: ['Volume@tv-basicstudies'],
          overrides: {
            'paneProperties.background': '#050505',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': 'rgba(212,175,55,0.04)',
            'paneProperties.horzGridProperties.color': 'rgba(212,175,55,0.04)',
            'scalesProperties.textColor': '#9ca3af',
            'scalesProperties.backgroundColor': '#050505',
            'mainSeriesProperties.candleStyle.upColor': '#26a69a',
            'mainSeriesProperties.candleStyle.downColor': '#ef5350',
            'mainSeriesProperties.candleStyle.borderUpColor': '#26a69a',
            'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
            'mainSeriesProperties.candleStyle.wickUpColor': '#26a69a',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ef5350',
          },
          studies_overrides: {
            'volume.volume.color.0': '#ef5350',
            'volume.volume.color.1': '#26a69a',
            'volume.volume ma.visible': false,
          },
        })
      })
      .catch((e) => {
        console.error('[TradingViewWidget] Script load failed:', e)
      })

    return () => {
      cancelled = true
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [symbol, interval, showSideToolbar])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', background: '#050505', ...style }}
    />
  )
}
