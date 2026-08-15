import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';

interface Props {
  symbol?: string;
  interval?: string;
  style?: React.CSSProperties;
  className?: string;
}

const INTERVAL_LABELS: Record<string, string> = {
  M1: '1m', M5: '5m', M15: '15m', M30: '30m',
  H1: '1h', H4: '4h', D1: '1D', W1: '1W', MN: '1M',
};

const INTERVALS = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

const BG = '#050505';
const GRID = 'rgba(212,175,55,0.05)';
const TEXT = '#6b7280';
const BORDER = 'rgba(212,175,55,0.12)';
const UP = '#26a69a';
const DOWN = '#ef5350';
const CROSSHAIR = 'rgba(212,175,55,0.4)';

export default function LightweightChartWidget({ symbol = 'XAUUSD', interval = 'H1', style, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [activeInterval, setActiveInterval] = useState(interval);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState(0);

  const fetchCandles = useCallback(async (sym: string, ivl: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/ohlc?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(ivl)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> };
      return data.candles ?? [];
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        fontFamily: "'Inter', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CROSSHAIR, width: 1, style: 3, labelBackgroundColor: '#1a1a1a' },
        horzLine: { color: CROSSHAIR, width: 1, style: 3, labelBackgroundColor: '#1a1a1a' },
      },
      rightPriceScale: {
        borderColor: BORDER,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: BORDER,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      color: UP,
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volRef.current = volSeries;

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e && chartRef.current) {
        chartRef.current.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !candleRef.current || !volRef.current) return;
    fetchCandles(symbol, activeInterval).then((candles) => {
      if (!candles || !candleRef.current || !volRef.current || !chartRef.current) return;

      const candleData: CandlestickData<Time>[] = candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const volData: HistogramData<Time>[] = candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.45)',
      }));

      candleRef.current.setData(candleData);
      volRef.current.setData(volData);
      chartRef.current.timeScale().fitContent();

      if (candles.length >= 2) {
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        setLastPrice(last.close);
        setPriceChange(((last.close - prev.close) / prev.close) * 100);
      }
    });
  }, [symbol, activeInterval, fetchCandles]);

  const isUp = priceChange >= 0;
  const decimals = symbol.includes('JPY') ? 3 : symbol === 'XAUUSD' || symbol === 'XAGUSD' ? 2 : 5;

  return (
    <div className={className} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BG, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.5)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', letterSpacing: 0.5 }}>{symbol}</span>
        {lastPrice !== null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginLeft: 4 }}>
            {lastPrice.toFixed(decimals)}
          </span>
        )}
        {priceChange !== 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: isUp ? UP : DOWN }}>
            {isUp ? '+' : ''}{priceChange.toFixed(2)}%
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {INTERVALS.map((ivl) => (
            <button
              key={ivl}
              onClick={() => setActiveInterval(ivl)}
              style={{
                padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                border: activeInterval === ivl ? '1px solid rgba(212,175,55,0.6)' : '1px solid transparent',
                background: activeInterval === ivl ? 'rgba(212,175,55,0.15)' : 'transparent',
                color: activeInterval === ivl ? '#D4AF37' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >
              {INTERVAL_LABELS[ivl] ?? ivl}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,5,5,0.85)', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: 26, height: 26, border: '2px solid rgba(212,175,55,0.2)', borderTop: '2px solid #D4AF37', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>Loading {symbol}…</span>
          </div>
        )}
        {error && !loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,5,5,0.9)', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: DOWN }}>Chart unavailable</span>
            <span style={{ fontSize: 10, color: '#6b7280' }}>{error}</span>
            <button onClick={() => setActiveInterval(activeInterval)} style={{ marginTop: 4, padding: '4px 12px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 4, color: '#D4AF37', fontSize: 11, cursor: 'pointer' }}>Retry</button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
