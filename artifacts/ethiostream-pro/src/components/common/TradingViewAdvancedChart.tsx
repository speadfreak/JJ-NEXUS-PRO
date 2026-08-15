import { useEffect, useRef, useState, useCallback } from 'react';
import LightweightChartWidget from './LightweightChartWidget';

const TV_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: 'OANDA:XAUUSD', XAGUSD: 'TVC:SILVER', XAUEUR: 'TVC:XAUEUR',
  EURUSD: 'FX:EURUSD', GBPUSD: 'FX:GBPUSD', USDJPY: 'FX:USDJPY',
  USDCAD: 'FX:USDCAD', AUDUSD: 'FX:AUDUSD', NZDUSD: 'FX:NZDUSD',
  USDCHF: 'FX:USDCHF', GBPJPY: 'FX:GBPJPY', EURJPY: 'FX:EURJPY',
  EURGBP: 'FX:EURGBP', EURNZD: 'FX:EURNZD', AUDJPY: 'FX:AUDJPY',
  CADJPY: 'FX:CADJPY', GBPCAD: 'FX:GBPCAD', GBPAUD: 'FX:GBPAUD',
  US30: 'TVC:DJI', NAS100: 'NASDAQ:NDX', SPX500: 'SP:SPX',
  GER40: 'XETR:DAX', BTCUSD: 'COINBASE:BTCUSD', ETHUSD: 'COINBASE:ETHUSD',
};

const TV_INTERVAL_MAP: Record<string, string> = {
  M1: '1', M5: '5', M15: '15', M30: '30',
  H1: '60', H4: '240', D1: 'D', W1: 'W', MN: 'M',
};

const SAVE_KEY = 'jjnexus_tv_state';

interface SavedState { symbol: string; interval: string }

function loadSaved(): SavedState | null {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; }
}

interface Props {
  symbol?: string;
  interval?: string;
  style?: React.CSSProperties;
  className?: string;
  showSideToolbar?: boolean;
}

// TradingView external embeds can't render inside an iframe (X-Frame-Options).
// The Replit preview is an iframe, so detect that and skip straight to the local chart.
function isInsideIframe(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

export default function TradingViewAdvancedChart({
  symbol = 'XAUUSD',
  interval = 'H1',
  style,
  className,
  showSideToolbar = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(() => isInsideIframe());
  const [loaded, setLoaded] = useState(false);
  const [showLoginHint, setShowLoginHint] = useState(false);
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saved = loadSaved();
  const effectiveSymbol = saved?.symbol || symbol;
  const effectiveInterval = saved?.interval || interval;

  const tvSymbol = TV_SYMBOL_MAP[effectiveSymbol] ?? `FX:${effectiveSymbol}`;
  const tvInterval = TV_INTERVAL_MAP[effectiveInterval] ?? '60';

  const buildWidget = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';
    setLoaded(false);
    setShowLoginHint(false);

    const config = {
      autosize: true,
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      hide_top_toolbar: false,
      hide_side_toolbar: !showSideToolbar,
      allow_symbol_change: true,
      withdateranges: true,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      toolbar_bg: '#050505',
      backgroundColor: 'rgba(5, 5, 5, 1)',
      gridColor: 'rgba(212, 175, 55, 0.04)',
      watchlist: [],
      details: false,
      hotlist: false,
      news: [],
      show_popup_button: false,
      popup_width: '1000',
      popup_height: '650',
    };

    // Use createContextualFragment so the script's textContent is preserved
    // alongside the src — plain createElement approach can lose textContent in
    // some browsers when both src and textContent are set on the same element.
    const configJson = JSON.stringify(config);
    const html = `
      <div class="tradingview-widget-container__widget" style="height:100%;width:100%;"></div>
      <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>
      ${configJson}
      </script>
    `;

    const range = document.createRange();
    range.selectNode(el);
    const fragment = range.createContextualFragment(html);
    el.appendChild(fragment);

    // Check for iframe appearance — TradingView loads asynchronously
    const checkLoaded = () => {
      const iframe = el.querySelector('iframe');
      if (iframe) {
        setLoaded(true);
        setFailed(false);
        setTimeout(() => setShowLoginHint(true), 3000);
      } else {
        setFailed(true);
      }
    };

    failTimer.current = setTimeout(checkLoaded, 3000);

    // Also poll every 500ms for faster detection
    let polls = 0;
    const pollTimer = setInterval(() => {
      polls++;
      const iframe = el.querySelector('iframe');
      if (iframe) {
        clearInterval(pollTimer);
        if (failTimer.current) clearTimeout(failTimer.current);
        setLoaded(true);
        setFailed(false);
        setTimeout(() => setShowLoginHint(true), 3000);
      } else if (polls > 6) {
        clearInterval(pollTimer);
      }
    }, 500);

    return () => {
      clearInterval(pollTimer);
    };
  }, [tvSymbol, tvInterval, showSideToolbar]);

  useEffect(() => {
    const cleanup = buildWidget();
    return () => {
      cleanup?.();
      if (failTimer.current) clearTimeout(failTimer.current);
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [buildWidget]);

  if (failed) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', ...style }}>
        <div style={{
          background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.25)',
          borderRadius: 8, padding: '8px 12px', margin: 4, fontSize: 11,
          color: '#f87171', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        }}>
          <span>⚠️</span>
          <span>TradingView blocked in preview — using local chart engine. Drawings available in production.</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <LightweightChartWidget symbol={effectiveSymbol} interval={effectiveInterval}
            style={{ width: '100%', height: '100%' }} className={className} />
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative', background: '#050505', ...style }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, background: '#050505', zIndex: 1,
        }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(212,175,55,0.2)',
            borderTop: '2px solid #D4AF37', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 12, color: '#6b7280' }}>Loading TradingView Chart…</div>
          <div style={{ fontSize: 10, color: '#374151' }}>Full chart · Drawing tools · Indicators</div>
        </div>
      )}
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ width: '100%', height: '100%' }}
      />
      {loaded && showLoginHint && (
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(212,175,55,0.2)', borderRadius: 8,
          padding: '5px 12px', zIndex: 2, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 10, color: '#888' }}>💾 To save drawings across sessions:</span>
          <a
            href="https://www.tradingview.com/accounts/sign-in/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 10, fontWeight: 700, color: '#D4AF37',
              textDecoration: 'none', padding: '2px 8px',
              background: 'rgba(212,175,55,0.12)', borderRadius: 4,
              border: '1px solid rgba(212,175,55,0.3)',
            }}
          >
            Log in to TradingView ↗
          </a>
          <button
            onClick={() => setShowLoginHint(false)}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
