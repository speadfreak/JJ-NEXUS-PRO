import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { CameraProvider } from "@/context/CameraContext";

import { Preloader } from "@/components/Preloader";
import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";
import { refreshAllPrices } from "@/utils/priceEngine";
import StreamAlertOverlay from "@/components/streaming/StreamAlertOverlay";
import FocusMode from "@/components/FocusMode";
import KeyboardShortcutsPanel from "@/components/KeyboardShortcutsPanel";
import { useKeyboardShortcuts, useHelpPanel } from "@/hooks/useKeyboardShortcuts";
import GlobalPiPCamera from "@/components/streaming/GlobalPiPCamera";

import Dashboard from "@/pages/Dashboard";
import StreamingStudio from "@/pages/StreamingStudio";
import StreamingCommandCenter from "@/pages/StreamingCommandCenter";
import AlchemistAI from "@/pages/AlchemistAI";
import Watchlist from "@/pages/Watchlist";
import Journal from "@/pages/Journal";
import TradeStatistics from "@/pages/TradeStatistics";
import Settings from "@/pages/Settings";
import EconomicCalendar from "@/pages/EconomicCalendar";

// Elite AI Tools
import ChartTools from "@/pages/ChartTools";
import GhostCoPilot from "@/pages/GhostCoPilot";
import SessionOracle from "@/pages/SessionOracle";
import CurrencyHeatmap from "@/pages/CurrencyHeatmap";
import SniperAlerts from "@/pages/SniperAlerts";
import Teleprompter from "@/pages/Teleprompter";
import WarRoom from "@/pages/WarRoom";
import Seasonality from "@/pages/Seasonality";
import TelegramBot from "@/pages/TelegramBot";

// New Elite Pages
import DisciplineTracker from "@/pages/DisciplineTracker";
import MarketMechanics from "@/pages/MarketMechanics";
import TradeSetupScanner from "@/pages/TradeSetupScanner";
import MorningBriefing from "@/pages/MorningBriefing";
import FundamentalAnalysis from "@/pages/FundamentalAnalysis";
import Backtest from "@/pages/Backtest";
import QuantLab from "@/pages/QuantLab";
import HealthReport from "@/pages/HealthReport";

// Hedge Fund Feature Suite
import OrderFlowDashboard from "@/pages/OrderFlowDashboard";
import DivergenceDetector from "@/pages/DivergenceDetector";
import MTFConfluenceMap from "@/pages/MTFConfluenceMap";
import LiquidityMap from "@/pages/LiquidityMap";
import KillZoneSniper from "@/pages/KillZoneSniper";
import TradePlanner from "@/pages/TradePlanner";
import AlertCommandCenter from "@/pages/AlertCommandCenter";
import BacktestReplay from "@/pages/BacktestReplay";
import PerformanceAnalytics from "@/pages/PerformanceAnalytics";
import FundedAccountPage from "@/pages/FundedAccountPage";

const queryClient = new QueryClient();

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.25 }}
    className="h-full"
  >
    {children}
  </motion.div>
);

function AppInner() {
  const [location, navigate] = useLocation();
  const [focusMode, setFocusMode] = useState(false);
  const { showHelp, setShowHelp } = useHelpPanel();

  useKeyboardShortcuts({
    navigateTo: navigate,
    toggleFocusMode: () => setFocusMode(p => !p),
  });

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Hide global PiP on the Studio page (it has its own PiP)
  const isStudioPage = location === '/streaming';

  return (
    <>
      <Layout onFocusModeToggle={() => setFocusMode(p => !p)} onHelpToggle={() => setShowHelp(p => !p)}>
        <AnimatePresence mode="wait">
          <Switch>
            <Route path="/"><PageWrapper><Dashboard /></PageWrapper></Route>
            <Route path="/streaming"><PageWrapper><StreamingStudio /></PageWrapper></Route>
            <Route path="/stream"><PageWrapper><StreamingCommandCenter /></PageWrapper></Route>
            <Route path="/alchemist"><PageWrapper><AlchemistAI /></PageWrapper></Route>
            <Route path="/watchlist"><PageWrapper><Watchlist /></PageWrapper></Route>
            <Route path="/journal"><PageWrapper><Journal /></PageWrapper></Route>
            <Route path="/statistics"><PageWrapper><TradeStatistics /></PageWrapper></Route>
            <Route path="/calendar"><PageWrapper><EconomicCalendar /></PageWrapper></Route>
            <Route path="/settings"><PageWrapper><Settings /></PageWrapper></Route>
            {/* Elite AI Tools */}
            <Route path="/chart-tools"><PageWrapper><ChartTools /></PageWrapper></Route>
            <Route path="/ghost-copilot"><PageWrapper><GhostCoPilot /></PageWrapper></Route>
            <Route path="/session-oracle"><PageWrapper><SessionOracle /></PageWrapper></Route>
            <Route path="/sniper-alerts"><PageWrapper><SniperAlerts /></PageWrapper></Route>
            <Route path="/seasonality"><PageWrapper><Seasonality /></PageWrapper></Route>
            {/* Streaming */}
            <Route path="/teleprompter"><PageWrapper><Teleprompter /></PageWrapper></Route>
            {/* Market Intel */}
            <Route path="/currency-heatmap"><PageWrapper><CurrencyHeatmap /></PageWrapper></Route>
            {/* Community */}
            <Route path="/war-room"><PageWrapper><WarRoom /></PageWrapper></Route>
            <Route path="/telegram-bot"><PageWrapper><TelegramBot /></PageWrapper></Route>
            {/* New Elite Pages */}
            <Route path="/discipline"><PageWrapper><DisciplineTracker /></PageWrapper></Route>
            <Route path="/market-mechanics"><PageWrapper><MarketMechanics /></PageWrapper></Route>
            <Route path="/scanner"><PageWrapper><TradeSetupScanner /></PageWrapper></Route>
            <Route path="/morning-briefing"><PageWrapper><MorningBriefing /></PageWrapper></Route>
            <Route path="/fundamental"><PageWrapper><FundamentalAnalysis /></PageWrapper></Route>
            <Route path="/backtest"><PageWrapper><Backtest /></PageWrapper></Route>
            <Route path="/quant-lab"><PageWrapper><QuantLab /></PageWrapper></Route>
            <Route path="/health-report"><PageWrapper><HealthReport /></PageWrapper></Route>
            {/* Hedge Fund Feature Suite */}
            <Route path="/order-flow"><PageWrapper><OrderFlowDashboard /></PageWrapper></Route>
            <Route path="/divergence"><PageWrapper><DivergenceDetector /></PageWrapper></Route>
            <Route path="/mtf-map"><PageWrapper><MTFConfluenceMap /></PageWrapper></Route>
            <Route path="/liquidity-map"><PageWrapper><LiquidityMap /></PageWrapper></Route>
            <Route path="/kill-zone"><PageWrapper><KillZoneSniper /></PageWrapper></Route>
            <Route path="/trade-planner"><PageWrapper><TradePlanner /></PageWrapper></Route>
            <Route path="/alerts"><PageWrapper><AlertCommandCenter /></PageWrapper></Route>
            <Route path="/backtest-replay"><PageWrapper><BacktestReplay /></PageWrapper></Route>
            <Route path="/performance"><PageWrapper><PerformanceAnalytics /></PageWrapper></Route>
            <Route path="/funded"><PageWrapper><FundedAccountPage /></PageWrapper></Route>
            <Route component={NotFound} />
          </Switch>
        </AnimatePresence>
      </Layout>

      {/* Global overlays */}
      <StreamAlertOverlay />
      <FocusMode isOpen={focusMode} onClose={() => setFocusMode(false)} />
      <KeyboardShortcutsPanel isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Global PiP Camera — follows you across ALL pages except Studio */}
      {!isStudioPage && <GlobalPiPCamera />}
    </>
  );
}

function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshAllPrices().catch(console.warn);
    const interval = setInterval(() => {
      refreshAllPrices().catch(console.warn);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CameraProvider>
          <AnimatePresence mode="wait">
            {loading ? (
              <Preloader key="preloader" onComplete={() => setLoading(false)} />
            ) : (
              <motion.div
                key="main-app"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="h-screen w-full"
              >
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <AppInner />
                </WouterRouter>
              </motion.div>
            )}
          </AnimatePresence>
          <Toaster />
        </CameraProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
