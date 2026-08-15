import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { ParticleCanvas } from './ParticleCanvas';
import { PriceTicker } from './PriceTicker';
import {
  LayoutDashboard, Radio, Brain, ListOrdered, BookOpen, Settings, Menu, MonitorPlay,
  Calendar, Ghost, Target, Globe, CalendarDays, ScrollText, Smartphone,
  Flame, Shield, Send, ChevronDown, ChevronRight, Crosshair, BookMarked, Wrench,
  Scan, Sun, Keyboard, Maximize2, FlaskConical, BarChart2,
  Waves, Radio as Radar, Map, Droplets, Zap, ClipboardList, Bell, PlayCircle, TrendingUp,
  Trophy, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationCenter, { NotificationToasts } from './notifications/NotificationCenter';
import LiveNewsTicker from './notifications/LiveNewsTicker';
import { AlertService } from '@/services/AlertService';
import { MusicPlayer } from './layout/MusicPlayer';

interface NavItem {
  path?: string
  label: string
  icon: React.ComponentType<any>
  children?: NavItem[]
  badge?: string
}

const NAV_GROUPS: { group: string; emoji: string; badge?: string; items: NavItem[] }[] = [
  {
    group: 'FUNDED ACCOUNT',
    emoji: '🏆',
    badge: 'LIVE',
    items: [
      { path: '/funded', label: 'Mission Control', icon: Trophy, badge: 'LIVE' },
    ],
  },
  {
    group: 'MAIN',
    emoji: '📊',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/morning-briefing', label: 'Morning Briefing', icon: Sun, badge: 'NEW' },
    ],
  },
  {
    group: 'TRADING',
    emoji: '📈',
    items: [
      { path: '/alchemist', label: 'Alchemist AI', icon: Brain },
      { path: '/fundamental', label: 'Fundamental Analysis', icon: Globe, badge: 'NEW' },
      { path: '/backtest', label: 'Strategy Backtester', icon: BarChart2, badge: 'NEW' },
      { path: '/chart-tools', label: 'Chart Tools', icon: Wrench },
      { path: '/watchlist', label: 'Watchlist', icon: ListOrdered },
      { path: '/journal', label: 'Journal', icon: BookOpen },
      { path: '/statistics', label: 'Trade Statistics', icon: BarChart2, badge: 'NEW' },
    ],
  },
  {
    group: 'AI TOOLS',
    emoji: '🧠',
    badge: 'NEW',
    items: [
      { path: '/scanner', label: 'Setup Scanner', icon: Scan, badge: 'NEW' },
      { path: '/ghost-copilot', label: 'Ghost Co-Pilot', icon: Ghost },
      { path: '/sniper-alerts', label: 'Sniper Alerts', icon: Target },
      { path: '/session-oracle', label: 'Session Oracle', icon: Globe },
      { path: '/seasonality', label: 'Seasonality Atlas', icon: CalendarDays },
    ],
  },
  {
    group: 'STREAMING',
    emoji: '📡',
    items: [
      { path: '/stream', label: 'Live Broadcast', icon: MonitorPlay, badge: 'NEW' },
      { path: '/streaming', label: 'Studio', icon: Radio },
      { path: '/teleprompter', label: 'Teleprompter', icon: ScrollText },
    ],
  },
  {
    group: 'MARKET INTEL',
    emoji: '🔥',
    items: [
      { path: '/currency-heatmap', label: 'Currency Heat Map', icon: Flame },
      { path: '/calendar', label: 'Economic Calendar', icon: Calendar },
    ],
  },
  {
    group: 'COMMUNITY',
    emoji: '👥',
    items: [
      { path: '/war-room', label: 'War Room', icon: Shield },
      { path: '/telegram-bot', label: 'Telegram Bot', icon: Send },
    ],
  },
  {
    group: 'HEDGE FUND SUITE',
    emoji: '🏦',
    badge: 'NEW',
    items: [
      { path: '/order-flow', label: 'Order Flow / COT', icon: Waves, badge: 'NEW' },
      { path: '/quant-lab', label: 'Quant Lab (COT Backtest)', icon: FlaskConical, badge: 'NEW' },
      { path: '/health-report', label: 'Health Report', icon: ShieldCheck, badge: 'NEW' },
      { path: '/divergence', label: 'Divergence Detector', icon: Radar, badge: 'NEW' },
      { path: '/mtf-map', label: 'MTF Confluence Map', icon: Map, badge: 'NEW' },
      { path: '/liquidity-map', label: 'Liquidity Map', icon: Droplets, badge: 'NEW' },
      { path: '/kill-zone', label: 'Kill Zone Sniper', icon: Zap, badge: 'NEW' },
      { path: '/trade-planner', label: 'Trade Planner', icon: ClipboardList, badge: 'NEW' },
      { path: '/alerts', label: 'Alert Command Center', icon: Bell, badge: 'NEW' },
      { path: '/backtest-replay', label: 'Backtest Replay', icon: PlayCircle, badge: 'NEW' },
      { path: '/performance', label: 'Performance Analytics', icon: TrendingUp, badge: 'NEW' },
    ],
  },
  {
    group: 'MASTERY',
    emoji: '🎓',
    items: [
      { path: '/discipline', label: 'Discipline Tracker', icon: Crosshair },
      { path: '/market-mechanics', label: 'Market Mechanics', icon: BookMarked },
    ],
  },
  {
    group: 'ACCOUNT',
    emoji: '⚙️',
    items: [
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

// ── Stream sync: auto-navigate Codespace Chrome when user changes page ────────
function useStreamSync(location: string) {
  const [syncActive, setSyncActive] = useState(false);

  const checkAndSync = useCallback((path: string) => {
    try {
      const raw = localStorage.getItem('jjnexus_stream_sync');
      if (!raw) { setSyncActive(false); return; }
      const sync = JSON.parse(raw);
      const active = !!(sync.streaming && sync.connected && sync.url);
      setSyncActive(active);
      if (active) {
        // Use the Render/production app URL that Chrome in the Codespace is actually visiting.
        // sync.appUrl = "https://jj-nexus-pro.onrender.com" (set by CloudControlPanel after connecting)
        // Fallback to window.location.origin only if appUrl is missing (same-origin setup).
        const base = sync.appUrl ? sync.appUrl.replace(/\/$/, '') : window.location.origin;
        const appUrl = `${base}${path}`;
        fetch(`${sync.url.replace(/\/$/, '')}/api/navigate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: appUrl }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }
    } catch {}
  }, []);

  // Fire on every route change
  useEffect(() => { checkAndSync(location); }, [location, checkAndSync]);

  // React to stream start/stop from the Studio tab (storage events)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'jjnexus_stream_sync') {
        try {
          const sync = JSON.parse(e.newValue || '{}');
          setSyncActive(!!(sync.streaming && sync.connected));
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    // Also poll every 5s to detect same-tab changes
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem('jjnexus_stream_sync');
        if (raw) {
          const sync = JSON.parse(raw);
          setSyncActive(!!(sync.streaming && sync.connected && sync.url));
        }
      } catch {}
    }, 5000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(interval); };
  }, []);

  return syncActive;
}

interface LayoutProps {
  children: React.ReactNode;
  onFocusModeToggle?: () => void;
  onHelpToggle?: () => void;
}

export function Layout({ children, onFocusModeToggle, onHelpToggle }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();
  const welcomeFired = useRef(false);
  const streamSyncActive = useStreamSync(location);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'FUNDED ACCOUNT': true, 'MAIN': true, 'TRADING': true, 'AI TOOLS': true, 'STREAMING': true,
    'MARKET INTEL': true, 'COMMUNITY': true, 'HEDGE FUND SUITE': true, 'MASTERY': true, 'ACCOUNT': true,
  });

  useEffect(() => {
    if (welcomeFired.current) return;
    welcomeFired.current = true;
    const t = setTimeout(() => {
      AlertService.notify('🚀 JJ Nexus Pro Online', 'Markets are live. Alchemist AI is ready. Good trading!', '/jj-trades-logo.jpg', 'info');
    }, 2000);
    const t2 = setTimeout(() => {
      const utcH = new Date().getUTCHours();
      const londonActive = utcH >= 8 && utcH < 17;
      const nyActive = utcH >= 13 && utcH < 22;
      if (londonActive && nyActive) {
        AlertService.notify('⚡ London & New York Overlap', 'Highest liquidity window is open — prime time for SMC setups.', '/jj-trades-logo.jpg', 'signal');
      } else if (londonActive) {
        AlertService.notify('🇬🇧 London Session Active', 'London is open. Watch GBPUSD, EURUSD, XAUUSD for breakouts.', '/jj-trades-logo.jpg', 'signal');
      } else if (nyActive) {
        AlertService.notify('🇺🇸 New York Session Active', 'NY is open. DXY correlation in play — watch XAUUSD reaction.', '/jj-trades-logo.jpg', 'signal');
      }
    }, 5000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  const toggleGroup = (group: string) => {
    if (collapsed) return;
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#050505] text-[hsl(var(--foreground))]">
      <ParticleCanvas />

      {/* Sidebar */}
      <motion.div
        animate={{ width: collapsed ? 64 : 230 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="flex flex-col h-full bg-black/40 backdrop-blur-xl border-r border-[rgba(212,175,55,0.2)] z-20 shrink-0 overflow-hidden"
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-center border-b border-[rgba(212,175,55,0.1)] px-2 shrink-0">
          <div className="relative group cursor-pointer overflow-hidden rounded-full shrink-0">
            <img src="/jj-trades-logo.jpg" alt="Logo" className="w-8 h-8 rounded-full border border-[var(--gold)]" />
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] skew-x-12" />
          </div>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="ml-2.5 font-serif font-bold text-[var(--gold)] tracking-wider whitespace-nowrap text-sm"
            >
              JJ NEXUS PRO
            </motion.span>
          )}
        </div>

        {/* Nav groups */}
        <div className="flex-1 py-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden scrollbar-hide">
          {NAV_GROUPS.map((group) => {
            const isExpanded = expandedGroups[group.group] !== false;

            return (
              <div key={group.group}>
                {/* Group header */}
                {!collapsed && (
                  <button
                    onClick={() => toggleGroup(group.group)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest flex-1 whitespace-nowrap overflow-hidden">
                      {group.emoji} {group.group}
                    </span>
                    {group.badge && (
                      <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-[rgba(212,175,55,0.2)] text-[var(--gold)] shrink-0">
                        {group.badge}
                      </span>
                    )}
                    {isExpanded
                      ? <ChevronDown className="w-3 h-3 text-gray-700 shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-gray-700 shrink-0" />
                    }
                  </button>
                )}

                {/* Nav items */}
                <AnimatePresence>
                  {(collapsed || isExpanded) && (
                    <motion.div
                      initial={collapsed ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      {group.items.map((item) => {
                        if (!item.path) return null;
                        const isActive = location === item.path;
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.path}
                            href={item.path}
                            className={`flex items-center px-3 py-2 mx-1 rounded-md transition-all duration-200 relative group overflow-hidden ${
                              isActive
                                ? 'bg-[var(--gold)] text-black'
                                : 'hover:bg-white/5 text-[hsl(var(--muted-foreground))]'
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : 'group-hover:text-[var(--gold)] transition-colors'}`} />
                            {!collapsed && (
                              <span className={`ml-2.5 font-medium whitespace-nowrap text-xs ${isActive ? 'text-black' : 'group-hover:text-white transition-colors'}`}>
                                {item.label}
                              </span>
                            )}
                            {!collapsed && item.badge && !isActive && (
                              <span className="ml-auto text-[7px] font-bold px-1 py-0.5 rounded bg-[rgba(212,175,55,0.2)] text-[var(--gold)] shrink-0">
                                {item.badge}
                              </span>
                            )}
                            {isActive && !collapsed && (
                              <motion.div
                                layoutId="sidebar-active"
                                className="absolute inset-0 rounded-md border border-[var(--gold)] shadow-[0_0_10px_rgba(212,175,55,0.5)] pointer-events-none"
                              />
                            )}
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Music Player */}
        <MusicPlayer collapsed={collapsed} sidebarWidth={collapsed ? 64 : 230} />

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-9 flex items-center justify-center border-t border-[rgba(212,175,55,0.1)] hover:bg-white/5 transition-colors text-[hsl(var(--muted-foreground))] shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>
      </motion.div>

      {/* Main Area */}
      <div className="flex flex-col flex-1 min-w-0 z-10">
        <header className="h-11 flex shrink-0 border-b border-[rgba(212,175,55,0.2)] bg-black/40 backdrop-blur-xl">
          <PriceTicker />
          <div className="flex items-center px-3 gap-2 bg-[#050505] shrink-0">
            {/* Stream Sync indicator — shows when Codespace Chrome is auto-following navigation */}
            {streamSyncActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}
                title="Stream Sync ON — navigating here auto-changes what TikTok viewers see"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE SYNC
              </motion.div>
            )}
            {onFocusModeToggle && (
              <button
                onClick={onFocusModeToggle}
                title="Focus Mode (Ctrl+F)"
                className="w-7 h-7 rounded flex items-center justify-center text-gray-500 hover:text-[var(--gold)] hover:bg-[rgba(212,175,55,0.1)] transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onHelpToggle && (
              <button
                onClick={onHelpToggle}
                title="Keyboard shortcuts (?)"
                className="w-7 h-7 rounded flex items-center justify-center text-gray-500 hover:text-[var(--gold)] hover:bg-[rgba(212,175,55,0.1)] transition-colors font-bold text-xs"
              >
                ?
              </button>
            )}
            <NotificationCenter />
            <div className="w-7 h-7 rounded-full bg-[var(--gold)] flex items-center justify-center text-black font-bold text-xs">
              JJ
            </div>
          </div>
        </header>

        <NotificationToasts />
        <LiveNewsTicker />
        <main className="flex-1 overflow-y-auto p-4 md:p-5 relative pb-8">
          {children}
        </main>
        <footer className="h-7 shrink-0 flex items-center justify-center border-t border-[rgba(212,175,55,0.08)] bg-black/60 backdrop-blur-sm text-[10px] text-gray-600 tracking-widest uppercase select-none">
          JJ NEXUS PRO &nbsp;•&nbsp; 2026 &nbsp;•&nbsp; Elite Forex Command Center &nbsp;•&nbsp; Press ? for shortcuts
        </footer>
      </div>

      <style>{`
        @keyframes shimmer { 100% { transform: translateX(100%); } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
