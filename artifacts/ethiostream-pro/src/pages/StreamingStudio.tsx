import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CircleDot, Activity, MessageSquare, MonitorPlay, Bell, Cloud, Cpu, Wifi, Terminal, CheckCircle2, Copy, ExternalLink, Play, Square, RotateCcw, Monitor, Zap, Shield } from 'lucide-react';
import StreamAlertsSettings from '@/components/streaming/StreamAlertsSettings';
import PhoneCameraConnect from '@/components/streaming/PhoneCameraConnect';
import AudioWaveformVisualizer from '@/components/streaming/AudioWaveformVisualizer';
import { SiTiktok, SiYoutube, SiInstagram, SiGithub } from 'react-icons/si';
import { useCamera } from '@/context/CameraContext';
import CameraPreview from '@/components/streaming/CameraPreview';
import PiPCameraWindow from '@/components/streaming/PiPCameraWindow';
import TradingViewAdvancedChart from '@/components/common/TradingViewAdvancedChart';
import ChartSymbolSwitcher from '@/components/common/ChartSymbolSwitcher';
import { streamEngine, StreamStats } from '@/services/BrowserStreamEngine';

type SceneKey = 'pip' | 'face-chart' | 'full-chart' | 'full-camera' | 'vertical' | 'side-by-side';

const SCENES: { key: SceneKey; label: string }[] = [
  { key: 'pip', label: 'PiP Mode' },
  { key: 'face-chart', label: 'Face + Chart' },
  { key: 'full-chart', label: 'Full Chart' },
  { key: 'full-camera', label: 'Full Camera' },
  { key: 'vertical', label: 'Vertical 9:16' },
  { key: 'side-by-side', label: 'Side by Side' },
];


function RtmpModal({ platform, onClose }: { platform: string; onClose: () => void }) {
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const rtmpUrls: Record<string, string> = {
    youtube: 'rtmp://a.rtmp.youtube.com/live2',
    tiktok: 'rtmp://push.tiktok.com/live/',
    instagram: 'rtmp://live-api-s.facebook.com:80/rtmp/',
  };

  const defaultUrl = rtmpUrls[platform.toLowerCase()] || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0a0a0a] border border-[rgba(212,175,55,0.4)] rounded-xl p-6 w-full max-w-md shadow-[0_0_40px_rgba(212,175,55,0.15)]"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[var(--gold)] font-bold text-lg mb-4 flex items-center gap-2">
          📡 Stream to {platform}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">RTMP URL</label>
            <input
              type="text"
              value={rtmpUrl || defaultUrl}
              onChange={e => setRtmpUrl(e.target.value)}
              placeholder={defaultUrl}
              className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--gold)]"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Stream Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={streamKey}
                onChange={e => setStreamKey(e.target.value)}
                placeholder="Paste your stream key here"
                className="flex-1 bg-black border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--gold)]"
              />
              <button onClick={() => setShowKey(!showKey)} className="px-3 text-gray-400 hover:text-white border border-gray-700 rounded">
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div className="bg-black/60 rounded-lg p-4 text-xs text-gray-400 space-y-1 border border-[rgba(212,175,55,0.1)]">
            <p className="text-[var(--gold)] font-semibold mb-2">How to go live with OBS:</p>
            <p>1. Copy your stream key from {platform}</p>
            <p>2. Open OBS Studio</p>
            <p>3. Settings → Stream → Custom</p>
            <p>4. Paste the RTMP URL and Stream Key</p>
            <p>5. Click "Start Streaming" in OBS</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(rtmpUrl || defaultUrl)}
              className="flex-1 py-2 bg-[rgba(212,175,55,0.15)] border border-[var(--gold)] text-[var(--gold)] rounded text-sm font-medium hover:bg-[rgba(212,175,55,0.25)]"
            >
              Copy RTMP URL
            </button>
            <a
              href="https://obsproject.com/download"
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 bg-black border border-gray-600 text-white rounded text-sm font-medium text-center hover:border-gray-400"
            >
              Get OBS
            </a>
          </div>
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 text-gray-500 text-sm hover:text-white">Close</button>
      </div>
    </div>
  );
}

function ScreenShareDisplay({ stream, style }: { stream: MediaStream; style?: React.CSSProperties }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.srcObject = stream
    videoRef.current.play().catch(() => {})
  }, [stream])
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block', ...style }}
    />
  )
}

function ScreenShareSourcePanel({ stream, onStop }: { stream: MediaStream; onStop: () => void }) {
  const thumbRef = useRef<HTMLVideoElement>(null)
  const track = stream.getVideoTracks()[0]
  const rawLabel = track?.label ?? ''
  const label = rawLabel.replace(/^screen:/i, '').trim() || 'Screen Share'
  const { width, height, frameRate } = track?.getSettings() ?? {}
  const res = width && height ? `${width}×${height}` : '—'
  const fps = frameRate ? `${Math.round(frameRate)}fps` : ''

  useEffect(() => {
    if (!thumbRef.current) return
    thumbRef.current.srcObject = stream
    thumbRef.current.play().catch(() => {})
  }, [stream])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(41,98,255,0.07)', border: '1px solid rgba(41,98,255,0.25)', marginBottom: 2 }}>
      {/* Thumbnail */}
      <div style={{ position: 'relative', flexShrink: 0, width: 120, height: 68, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(41,98,255,0.4)', background: '#000' }}>
        <video ref={thumbRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '2px 6px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
          <span style={{ color: '#22c55e', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>LIVE</span>
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: '#5b9bff', fontWeight: 800, fontSize: 12, marginBottom: 3 }}>Sharing to Studio Chart</p>
        <p style={{ color: '#ccc', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }} title={label}>
          {label}
        </p>
        <p style={{ color: '#555', fontSize: 11 }}>{res}{fps ? ` · ${fps}` : ''} — viewers see this exact source</p>
      </div>

      {/* Controls */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <button
          onClick={onStop}
          style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#f87171', whiteSpace: 'nowrap' }}
        >
          Stop Sharing
        </button>
        <p style={{ color: '#333', fontSize: 10 }}>Replacing embedded chart</p>
      </div>
    </div>
  )
}

function GoLiveGuide() {
  const [copied, setCopied] = useState<string | null>(null)
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.replit.app'
  const TIKTOK_SERVER = 'rtmp://push.tiktokv.com/live/'

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const CopyRow = ({ label, value, id }: { label: string; value: string; id: string }) => (
    <div style={{ marginBottom: 8 }}>
      <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{label}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <code style={{ flex: 1, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, padding: '7px 10px', color: '#D4AF37', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</code>
        <button onClick={() => copy(value, id)} style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, background: copied === id ? 'rgba(22,163,74,0.2)' : 'rgba(212,175,55,0.12)', border: `1px solid ${copied === id ? '#22c55e' : 'rgba(212,175,55,0.3)'}`, color: copied === id ? '#22c55e' : '#D4AF37', whiteSpace: 'nowrap' }}>
          {copied === id ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )

  const Method = ({ emoji, title, badge, steps, note, extra }: { emoji: string; title: string; badge?: string; steps: string[]; note?: string; extra?: React.ReactNode }) => (
    <div style={{ border: '1px solid rgba(212,175,55,0.2)', borderRadius: 12, padding: 16, background: 'rgba(212,175,55,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontWeight: 800, color: '#fff', fontSize: 13 }}>{title}</span>
        {badge && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }}>{badge}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#D4AF37', color: '#000', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
            <p style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: s }} />
          </div>
        ))}
      </div>
      {extra && <div style={{ marginTop: 12 }}>{extra}</div>}
      {note && <p style={{ marginTop: 10, color: '#555', fontSize: 11, lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>{note}</p>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,175,55,0.25)' }}>
        <p style={{ color: '#D4AF37', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>📡 Stream JJ Nexus Pro to TikTok LIVE</p>
        <p style={{ color: '#666', fontSize: 12, lineHeight: 1.6 }}>No OBS on Chromebook? Here are the <strong style={{ color: '#aaa' }}>3 real methods</strong> — all free, all work today.</p>
      </div>

      <div style={{ padding: 12, borderRadius: 10, background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}>
        <p style={{ color: '#888', fontSize: 11, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>YOUR APP LINK (Browser Source for Streamlabs)</p>
        <CopyRow label="JJ NEXUS PRO URL" value={appUrl} id="appurl" />
      </div>

      {/* Situation alert for 1000+ followers but no Creator Tools */}
      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)' }}>
        <p style={{ color: '#facc15', fontWeight: 800, fontSize: 12, marginBottom: 6 }}>⚠️ Have 1000+ followers but no Creator Tools / Stream Key?</p>
        <p style={{ color: '#777', fontSize: 11, lineHeight: 1.7 }}>
          This is common — TikTok restricts LIVE in some regions and account types even with enough followers. <strong style={{ color: '#aaa' }}>The fix: use Streamlabs Mobile TikTok Sign-In (Method 1)</strong> — it bypasses the stream key entirely and works even without Creator Tools. Or try <strong style={{ color: '#aaa' }}>StreamYard</strong> (Method 2) — it's browser-based and works on Chromebook with just a TikTok login.
        </p>
      </div>

      <Method
        emoji="🏆"
        title="Streamlabs Mobile — No Stream Key Needed"
        badge="BEST FOR YOU"
        steps={[
          'Download <strong style="color:#fff">Streamlabs Mobile</strong> on your phone (free, iOS & Android)',
          'Open Streamlabs → tap the <strong style="color:#D4AF37">TikTok icon</strong> → tap <strong style="color:#fff">Sign in with TikTok</strong> — this handles LIVE permission directly, no stream key needed',
          'Tap <strong style="color:#fff">+ Add Layer → Browser Source</strong> → paste your JJ Nexus Pro URL from above',
          'Resize the browser layer to fill the screen so viewers see your full trading dashboard',
          'Optionally add your <strong style="color:#fff">phone camera</strong> as another layer on top',
          'Tap <strong style="color:#fff">GO LIVE</strong> — done!',
        ]}
        note="This is your best option. Streamlabs handles TikTok LIVE authorization internally — you never need a stream key. Works even if Creator Tools doesn't show LIVE settings."
      />

      <Method
        emoji="🌐"
        title="StreamYard — Browser-Based, Works on Chromebook"
        badge="EASY"
        steps={[
          'Go to <strong style="color:#fff">streamyard.com</strong> on your Chromebook — no download needed',
          'Sign up free → tap <strong style="color:#fff">Create Broadcast → Add Destination → TikTok</strong>',
          'Log in with your TikTok account — StreamYard handles LIVE authorization, no stream key required',
          'Click <strong style="color:#fff">Add a web page</strong> → paste your JJ Nexus Pro URL — it appears as a browser overlay',
          'Hit <strong style="color:#fff">Go Live</strong> — you\'re streaming with your full dashboard visible!',
        ]}
        note="StreamYard is 100% browser-based — perfect for Chromebook. Free tier allows TikTok streaming with a watermark. No stream key or Creator Tools needed."
      />

      <div style={{ border: '1px solid rgba(41,98,255,0.25)', borderRadius: 12, padding: 16, background: 'rgba(41,98,255,0.04)' }}>
        <p style={{ color: '#5b9bff', fontWeight: 800, fontSize: 12, marginBottom: 12 }}>🔑 TikTok RTMP — Only if You Have Stream Key Access</p>
        <CopyRow label="SERVER URL" value={TIKTOK_SERVER} id="rtmp" />
        <div style={{ marginTop: 8 }}>
          <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>HOW TO FIND YOUR STREAM KEY (try in this order):</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              '<strong style="color:#D4AF37">Option A — LIVE Center (desktop):</strong> Go to <strong style="color:#fff">tiktok.com/live-center/</strong> on your Chromebook → click <strong style="color:#fff">Go LIVE</strong> → <strong style="color:#fff">Stream Software</strong> → your Stream Key appears here',
              '<strong style="color:#D4AF37">Option B — TikTok Studio:</strong> Go to <strong style="color:#fff">studio.tiktok.com</strong> → left sidebar → <strong style="color:#fff">LIVE → Go LIVE → Use stream key</strong>',
              '<strong style="color:#D4AF37">Option C — TikTok app:</strong> Tap <strong style="color:#fff">+</strong> → <strong style="color:#fff">LIVE</strong> → if you see a settings/gear icon → tap it → <strong style="color:#fff">Stream Key</strong> (only shows if your account has RTMP access)',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(41,98,255,0.3)', color: '#5b9bff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                <p style={{ color: '#666', fontSize: 11, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: s }} />
              </div>
            ))}
          </div>
          <p style={{ color: '#444', fontSize: 10, marginTop: 10, borderTop: '1px solid #111', paddingTop: 8 }}>If none of these show a stream key, your account doesn't have RTMP access yet — use Streamlabs or StreamYard above instead.</p>
        </div>
      </div>

      <Method
        emoji="📱"
        title="Android TikTok Screen Share — Zero Setup"
        badge="EASIEST"
        steps={[
          'Open <strong style="color:#fff">JJ Nexus Pro</strong> in Chrome on your phone',
          'Open TikTok → tap <strong style="color:#fff">+</strong> → <strong style="color:#fff">LIVE</strong> → start your live',
          'Once live, swipe up on the TikTok screen → tap <strong style="color:#fff">Screen Share</strong>',
          'Switch to Chrome showing JJ Nexus Pro — viewers now see your full dashboard',
          'Use Focus Mode for a clean full-screen chart view',
        ]}
        note="Android only. No followers required. Your phone camera + screen share both stream simultaneously."
      />

      <Method
        emoji="🖥️"
        title="Share Real TradingView Tab → Studio Chart"
        badge="PRO"
        steps={[
          'Open your real <strong style="color:#fff">TradingView.com</strong> chart in a separate browser tab',
          'In the Studio above, click <strong style="color:#fff">Share Screen → Choose Tab</strong>',
          'Select your <strong style="color:#fff">TradingView tab</strong> — it instantly replaces the embedded chart in the Studio',
          'Your real TradingView chart (with your indicators, layouts, alerts) now shows live in the stream',
          'Combine with Phone HD Camera for the full professional broadcast setup',
        ]}
        note="This uses your browser's built-in screen share. No quality loss — you get your exact TradingView setup with all your custom indicators live in the stream."
      />

      <div style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid #1a1a1a' }}>
        <p style={{ color: '#D4AF37', fontWeight: 700, fontSize: 11, marginBottom: 8, letterSpacing: 1 }}>💡 PRO TIPS</p>
        {[
          '📸 Phone HD Camera connects via WebRTC — keep the phone-camera tab open in background',
          '🖥️ Share your real TradingView tab using the Share Screen button above the Studio',
          '🎵 Mute background music before going live (Volume in sidebar)',
          '📊 Streamlabs Browser Source works best in landscape at 1080p',
          '⚡ Keep JJ Nexus Pro open on Chromebook for AI signals while streaming from phone',
        ].map((t, i) => (
          <p key={i} style={{ color: '#555', fontSize: 11, lineHeight: 1.8 }}>{t}</p>
        ))}
      </div>
    </div>
  )
}

// ─── Cloud Stream Guide (GitHub Codespaces Engine) ───────────────────────────
// ─── Cloud Control Panel ────────────────────────────────────────────────────
// Connects to the Node.js control-server.js running in the Codespace (port 7821)
// and gives the streamer full control from inside the webapp.

const APP_PAGES = [
  { label: '📊 Dashboard',          path: '/' },
  { label: '🎬 Streaming Studio',   path: '/streaming' },
  { label: '🖥️ Stream Command',     path: '/stream' },
  { label: '📓 Trade Journal',      path: '/journal' },
  { label: '🏦 Funded Account',     path: '/funded' },
  { label: '🤖 Alchemist AI',       path: '/alchemist' },
  { label: '📈 Trade Statistics',   path: '/statistics' },
  { label: '👁️ Watchlist',          path: '/watchlist' },
  { label: '🔫 Sniper Alerts',      path: '/sniper-alerts' },
  { label: '🌍 Currency Heatmap',   path: '/currency-heatmap' },
  { label: '⚔️ War Room',           path: '/war-room' },
  { label: '⚙️ Settings',           path: '/settings' },
];

function CloudControlPanel() {
  const [codespaceUrl, setCodespaceUrl] = useState<string>(() =>
    localStorage.getItem('jjnexus_codespace_url') || ''
  );
  const [inputUrl, setInputUrl]         = useState('');
  const [editingUrl, setEditingUrl]     = useState(false);

  type Status = { streaming: boolean; pid: number; uptime: number; cpu: string; configOk: boolean; serverTime: string };
  const [status, setStatus]         = useState<Status | null>(null);
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [logs, setLogs]             = useState<string[]>([]);
  const [navigating, setNavigating] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  type CloudConfig = { resolution: string; fps: string; videoBitrate: string; audioBitrate: string; jjnexusUrl: string };
  const [cloudConfig, setCloudConfig]       = useState<CloudConfig>({ resolution: '1280x720', fps: '24', videoBitrate: '2500k', audioBitrate: '128k', jjnexusUrl: '' });
  const [editingConfig, setEditingConfig]   = useState<CloudConfig | null>(null);
  const [savingConfig, setSavingConfig]     = useState(false);
  const [configSaved, setConfigSaved]       = useState(false);

  const logsEndRef       = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef    = useRef(true);   // false when user scrolled up
  const sseRef           = useRef<EventSource | null>(null);
  const pollRef          = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Browser stream (direct from this browser → API server → Restream) ─────
  const [brStreamKey, setBrStreamKey] = useState(() => localStorage.getItem('jjnexus_br_key') || '');
  const [brRtmpUrl]                   = useState('rtmp://live.restream.io/live');
  const [brStats, setBrStats]         = useState<StreamStats>({
    status: 'idle', duration: 0, fps: 0, bitrate: '0 kbps',
    bytesSent: 0, mbSent: 0, chunksSent: 0, viewers: 0,
    error: null, startTime: null,
    ffmpegFps: '0', ffmpegBitrate: '0', ffmpegSpeed: '0x', queueDepth: 0,
  });
  const [brStarting, setBrStarting] = useState(false);
  const [brShowKey, setBrShowKey]   = useState(false);

  const apiBase = codespaceUrl.replace(/\/$/, '');

  // ── connect / disconnect ──────────────────────────────────────────────────
  const disconnect = () => {
    sseRef.current?.close();
    sseRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setConnected(false);
    setStatus(null);
    setLogs([]);
  };

  const connect = async (base: string) => {
    disconnect();
    setConnecting(true);
    setLogs([]);
    try {
      const r = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = await r.json() as Status;
      setStatus(s);
      setConnected(true);

      // Load stream quality config + app URL
      try {
        const cr = await fetch(`${base}/api/config`, { signal: AbortSignal.timeout(4000) });
        if (cr.ok) {
          const cfg = await cr.json();
          if (cfg.ok) {
            const appUrl = (cfg.jjnexusUrl || '').replace(/\/$/, '');
            setCloudConfig({ resolution: cfg.resolution, fps: cfg.fps, videoBitrate: cfg.videoBitrate, audioBitrate: cfg.audioBitrate, jjnexusUrl: appUrl });
            // Persist so Layout.tsx useStreamSync uses the correct Render URL for auto-navigation
            if (appUrl) localStorage.setItem('jjnexus_app_url', appUrl);
          }
        }
      } catch {}

      // SSE log stream
      const sse = new EventSource(`${base}/api/logs`);
      sse.onmessage = (e) => {
        try {
          const { line } = JSON.parse(e.data);
          setLogs(prev => [...prev.slice(-199), line]);
        } catch {}
      };
      sse.onerror = () => { setConnected(false); };
      sseRef.current = sse;

      // Status poll every 4s
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(4000) });
          if (pr.ok) { setStatus(await pr.json()); setConnected(true); }
          else setConnected(false);
        } catch { setConnected(false); }
      }, 4000);

    } catch {
      setConnected(false);
      setLogs(['❌ Could not reach control server. Check the URL and that autostart.sh is running.']);
    } finally {
      setConnecting(false);
    }
  };

  // Auto-connect on mount if URL saved
  useEffect(() => {
    if (codespaceUrl) connect(codespaceUrl);
    return disconnect;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Browser stream stats subscription ───────────────────────────────────
  useEffect(() => {
    streamEngine.onStats(setBrStats);
  }, []);

  // ── Scroll: only auto-scroll when user hasn't manually scrolled up ───────
  const handleLogsScroll = useCallback(() => {
    const el = logsContainerRef.current;
    if (!el) return;
    // If within 40px of bottom → re-enable auto-scroll
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // ── Keep localStorage in sync so Layout auto-navigates Codespace Chrome ──
  useEffect(() => {
    try {
      localStorage.setItem('jjnexus_stream_sync', JSON.stringify({
        url      : codespaceUrl,                          // control server (port 7821)
        appUrl   : cloudConfig.jjnexusUrl || '',          // actual app URL Chrome visits (e.g. jj-nexus-pro.onrender.com)
        connected,
        streaming: !!status?.streaming,
        ts       : Date.now(),
      }));
    } catch {}
  }, [codespaceUrl, cloudConfig.jjnexusUrl, connected, status?.streaming]);

  const saveAndConnect = () => {
    const url = inputUrl.trim().replace(/\/$/, '');
    if (!url) return;
    localStorage.setItem('jjnexus_codespace_url', url);
    setCodespaceUrl(url);
    setEditingUrl(false);
    connect(url);
  };

  const apiPost = async (endpoint: string) => {
    setActionBusy(true);
    try {
      const r = await fetch(`${apiBase}${endpoint}`, { method: 'POST', signal: AbortSignal.timeout(8000) });
      return await r.json();
    } catch (e) {
      setLogs(prev => [...prev, `❌ Request failed: ${e}`]);
      return null;
    } finally {
      setActionBusy(false);
    }
  };

  const handleStart = () => apiPost('/api/start');
  const handleStop  = () => apiPost('/api/stop');

  const navigateTo = async (path: string) => {
    if (!connected) return;
    setNavigating(path);
    try {
      // Use the Render/production URL stored in cloudConfig after connecting.
      // This is what Chrome in the Codespace is actually visiting (e.g. jj-nexus-pro.onrender.com).
      // Fall back to window.location.origin only for same-origin setups.
      const appBase = cloudConfig.jjnexusUrl || window.location.origin;
      const r = await fetch(`${apiBase}/api/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${appBase}${path}` }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        setLogs(prev => [...prev, `✅ Navigated stream → ${appBase}${path}`]);
      }
    } catch (e) {
      setLogs(prev => [...prev, `❌ Navigate failed: ${e}`]);
    } finally {
      setNavigating(null);
    }
  };

  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // ── render ────────────────────────────────────────────────────────────────
  const dot = (ok: boolean, pulse = false) => (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? '#22c55e' : '#555',
      animation: pulse && ok ? 'pulse 1.5s infinite' : 'none',
      flexShrink: 0,
    }} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 14, padding: '16px 18px',
        background: 'linear-gradient(135deg, #0a0800 0%, #120e00 60%, #0a0500 100%)',
        border: '1px solid rgba(212,175,55,0.35)',
        boxShadow: '0 0 30px rgba(212,175,55,0.07)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(212,175,55,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(212,175,55,0.03) 1px,transparent 1px)', backgroundSize: '28px 28px', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Cloud size={22} color="#D4AF37" />
              </div>
              <div>
                <p style={{ color: '#D4AF37', fontWeight: 900, fontSize: 15, letterSpacing: 0.5 }}>☁️ CLOUD CONTROL PANEL</p>
                <p style={{ color: '#555', fontSize: 11, marginTop: 2 }}>Start streams · Navigate pages · Watch logs — all from here</p>
              </div>
            </div>
            {/* Connection indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
              {dot(connected, true)}
              <span style={{ color: connected ? '#22c55e' : '#555', fontSize: 12, fontWeight: 700 }}>
                {connecting ? 'Connecting…' : connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Codespace URL setup ────────────────────────────────────────── */}
      <div style={{ borderRadius: 12, padding: '14px 16px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(212,175,55,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ color: '#888', fontSize: 10, fontWeight: 800, letterSpacing: 1.2 }}>CODESPACE CONTROL SERVER URL</p>
          {codespaceUrl && !editingUrl && (
            <button onClick={() => { setInputUrl(codespaceUrl); setEditingUrl(true); }} style={{ fontSize: 10, color: '#555', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              ✏️ Change
            </button>
          )}
        </div>

        {(!codespaceUrl || editingUrl) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ color: '#666', fontSize: 11, lineHeight: 1.6 }}>
              In your Codespace, run <code style={{ color: '#D4AF37', background: 'rgba(212,175,55,0.08)', padding: '1px 5px', borderRadius: 4 }}>bash .devcontainer/autostart.sh</code> then open port <strong style={{ color: '#D4AF37' }}>7821</strong> and paste the URL below.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveAndConnect(); }}
                placeholder="https://your-codespace-7821.app.github.dev"
                style={{ flex: 1, background: '#050505', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 8, padding: '8px 12px', color: '#D4AF37', fontSize: 12, outline: 'none' }}
              />
              <button
                onClick={saveAndConnect}
                disabled={!inputUrl.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)', color: '#D4AF37', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Connect
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dot(connected)}
            <code style={{ color: connected ? '#D4AF37' : '#555', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{codespaceUrl}</code>
            {!connected && !connecting && (
              <button
                onClick={() => connect(codespaceUrl)}
                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 7, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', color: '#D4AF37', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Emergency Stop (always visible, no server needed) ─────────── */}
      <div style={{ borderRadius: 12, padding: '12px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ color: '#f87171', fontWeight: 800, fontSize: 12, marginBottom: 3 }}>🚨 STREAM WON'T STOP?</p>
          <p style={{ color: '#555', fontSize: 11, lineHeight: 1.5 }}>Use Restream dashboard to kill TikTok + YouTube instantly — works even when disconnected.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <a
            href="https://restream.io/studio"
            target="_blank"
            rel="noreferrer"
            style={{ padding: '9px 18px', borderRadius: 9, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.45)', color: '#f87171', fontSize: 12, fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            ⏹ End Stream on Restream
          </a>
        </div>
      </div>

      {/* ── Stream Controls ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button
          onClick={handleStart}
          disabled={!connected || actionBusy || !!status?.streaming}
          style={{
            padding: '16px 0', borderRadius: 12, fontWeight: 900, fontSize: 14,
            letterSpacing: 0.5, cursor: (!connected || actionBusy || !!status?.streaming) ? 'not-allowed' : 'pointer',
            background: status?.streaming ? 'rgba(34,197,94,0.08)' : connected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
            border: `2px solid ${status?.streaming ? 'rgba(34,197,94,0.5)' : connected ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.07)'}`,
            color: status?.streaming ? '#22c55e' : connected ? '#4ade80' : '#333',
            transition: 'all 0.2s',
            boxShadow: status?.streaming ? '0 0 20px rgba(34,197,94,0.15)' : 'none',
          }}
        >
          {status?.streaming ? (
            <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', marginRight: 8, animation: 'pulse 1s infinite' }} />🔴 LIVE</>
          ) : '▶ START STREAM'}
        </button>
        <button
          onClick={handleStop}
          disabled={!connected || actionBusy || !status?.streaming}
          style={{
            padding: '16px 0', borderRadius: 12, fontWeight: 900, fontSize: 14,
            cursor: (!connected || actionBusy || !status?.streaming) ? 'not-allowed' : 'pointer',
            background: (!connected || !status?.streaming) ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.12)',
            border: `2px solid ${(!connected || !status?.streaming) ? 'rgba(255,255,255,0.07)' : 'rgba(239,68,68,0.35)'}`,
            color: (!connected || !status?.streaming) ? '#333' : '#f87171',
            transition: 'all 0.2s',
          }}
        >
          ⏹ STOP
        </button>
      </div>

      {/* ── Browser Relay Stream ── stream direct from this browser → API → Restream ── */}
      <div style={{ borderRadius: 12, border: '1px solid rgba(212,175,55,0.25)', overflow: 'hidden' }}>
        <div style={{ background: 'rgba(0,0,0,0.7)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(212,175,55,0.12)' }}>
          <span style={{ fontSize: 16 }}>🖥</span>
          <div style={{ flex: 1 }}>
            <p style={{ color: '#D4AF37', fontWeight: 900, fontSize: 13 }}>BROWSER RELAY STREAM</p>
            <p style={{ color: '#555', fontSize: 10 }}>Capture this screen from your browser → sends directly to Restream.io — no Codespace needed</p>
          </div>
          {brStats.status === 'live' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1s infinite' }} />
              <span style={{ color: '#f87171', fontSize: 11, fontWeight: 800 }}>LIVE</span>
              <span style={{ color: '#555', fontSize: 10 }}>{Math.floor(brStats.duration / 60)}:{String(brStats.duration % 60).padStart(2, '0')}</span>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Stream key input */}
          <div>
            <p style={{ color: '#666', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>RESTREAM STREAM KEY</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={brShowKey ? 'text' : 'password'}
                value={brStreamKey}
                onChange={e => { setBrStreamKey(e.target.value); localStorage.setItem('jjnexus_br_key', e.target.value); }}
                placeholder="re_xxxxxxxx_xxxxxxxx"
                disabled={brStats.status === 'live' || brStarting}
                style={{ flex: 1, background: '#050505', border: `1px solid ${brStreamKey ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, padding: '8px 12px', color: '#D4AF37', fontSize: 12, outline: 'none', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => setBrShowKey(v => !v)}
                style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#555', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >{brShowKey ? '🙈 Hide' : '👁 Show'}</button>
            </div>
            <p style={{ color: '#444', fontSize: 10, marginTop: 4 }}>
              Find it at <a href="https://restream.io/settings/streaming-setup" target="_blank" rel="noreferrer" style={{ color: '#D4AF37' }}>restream.io → Streaming Setup → Stream Key</a>
            </p>
          </div>

          {/* Error */}
          {brStats.status === 'error' && brStats.error && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 11 }}>
              ❌ {brStats.error}
            </div>
          )}

          {/* Stats bar when live */}
          {brStats.status === 'live' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[
                { label: 'FPS',     val: brStats.ffmpegFps || '—' },
                { label: 'BITRATE', val: brStats.ffmpegBitrate || '—' },
                { label: 'CHUNKS',  val: String(brStats.chunksSent) },
                { label: 'SENT',    val: `${brStats.mbSent.toFixed(1)} MB` },
              ].map(m => (
                <div key={m.label} style={{ textAlign: 'center', padding: '7px 4px', borderRadius: 8, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ color: '#444', fontSize: 8, fontWeight: 800, letterSpacing: 1, marginBottom: 3 }}>{m.label}</p>
                  <p style={{ color: '#D4AF37', fontSize: 12, fontWeight: 900, fontFamily: 'monospace' }}>{m.val}</p>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              disabled={!brStreamKey.trim() || brStarting || brStats.status === 'live' || brStats.status === 'connecting'}
              onClick={async () => {
                if (!brStreamKey.trim()) return;
                setBrStarting(true);
                try {
                  await streamEngine.startStream({
                    rtmpUrl: brRtmpUrl,
                    streamKey: brStreamKey.trim(),
                    resolution: '1280x720',
                    fps: 30,
                    videoBitrate: '2500k',
                    audioBitrate: '128k',
                    captureMode: 'full_screen',
                    includeMicrophone: false,
                    includeSystemAudio: true,
                  });
                } catch (e: any) {
                  // error surfaced via brStats.error
                } finally {
                  setBrStarting(false);
                }
              }}
              style={{
                padding: '14px 0', borderRadius: 10, fontWeight: 900, fontSize: 13,
                cursor: (!brStreamKey.trim() || brStarting || brStats.status === 'live') ? 'not-allowed' : 'pointer',
                background: brStats.status === 'live' ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.15)',
                border: `2px solid ${brStats.status === 'live' ? 'rgba(34,197,94,0.5)' : 'rgba(34,197,94,0.35)'}`,
                color: brStats.status === 'live' ? '#22c55e' : '#4ade80',
                opacity: (!brStreamKey.trim() || brStarting || brStats.status === 'live') ? 0.4 : 1,
                transition: 'all 0.2s',
              }}
            >
              {brStarting ? '⏳ Starting…' : brStats.status === 'connecting' ? '⏳ Connecting…' : brStats.status === 'live' ? '🔴 LIVE' : '▶ GO LIVE'}
            </button>
            <button
              disabled={brStats.status !== 'live' && brStats.status !== 'connecting'}
              onClick={() => { streamEngine.stopStream(); setBrStarting(false); }}
              style={{
                padding: '14px 0', borderRadius: 10, fontWeight: 900, fontSize: 13,
                cursor: (brStats.status !== 'live' && brStats.status !== 'connecting') ? 'not-allowed' : 'pointer',
                background: (brStats.status !== 'live' && brStats.status !== 'connecting') ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.12)',
                border: `2px solid ${(brStats.status !== 'live' && brStats.status !== 'connecting') ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.35)'}`,
                color: (brStats.status !== 'live' && brStats.status !== 'connecting') ? '#333' : '#f87171',
                opacity: (brStats.status !== 'live' && brStats.status !== 'connecting') ? 0.4 : 1,
                transition: 'all 0.2s',
              }}
            >
              ⏹ STOP
            </button>
          </div>

          <p style={{ color: '#444', fontSize: 10, lineHeight: 1.6 }}>
            💡 <strong style={{ color: '#666' }}>How it works:</strong> Your browser captures the screen, sends it to the relay server, which pipes it to Restream via FFmpeg — same engine as the Live Broadcast page. No Codespace or x11grab involved. Use Page Navigator above to change what viewers see while live.
          </p>
        </div>
      </div>

      {/* ── Stream Quality Controls (Codespace) ────────────────────────── */}
      {connected && (
        <div style={{ borderRadius: 12, padding: '14px 16px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(212,175,55,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ color: '#D4AF37', fontSize: 10, fontWeight: 800, letterSpacing: 1.2, margin: 0 }}>⚙️ STREAM QUALITY — changes apply on next stream start</p>
            {!editingConfig ? (
              <button
                onClick={() => setEditingConfig({ ...cloudConfig })}
                style={{ fontSize: 11, padding: '5px 14px', borderRadius: 7, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', cursor: 'pointer', fontWeight: 700 }}
              >✏️ Edit</button>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={async () => {
                    if (!editingConfig) return;
                    setSavingConfig(true);
                    try {
                      const r = await fetch(`${apiBase}/api/config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(editingConfig),
                        signal: AbortSignal.timeout(6000),
                      });
                      if (r.ok) {
                        setCloudConfig(editingConfig);
                        setEditingConfig(null);
                        setConfigSaved(true);
                        setTimeout(() => setConfigSaved(false), 3000);
                      }
                    } catch {}
                    setSavingConfig(false);
                  }}
                  disabled={savingConfig}
                  style={{ fontSize: 11, padding: '5px 14px', borderRadius: 7, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', cursor: 'pointer', fontWeight: 700 }}
                >{savingConfig ? 'Saving…' : '✅ Save'}</button>
                <button
                  onClick={() => setEditingConfig(null)}
                  style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#666', cursor: 'pointer' }}
                >Cancel</button>
              </div>
            )}
          </div>

          {configSaved && (
            <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', fontSize: 11, fontWeight: 700 }}>
              ✅ Saved! Restart the stream to apply new quality settings.
            </div>
          )}

          {/* Quick presets */}
          {editingConfig && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>QUICK PRESETS</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: '📱 TikTok HD',    res: '720x1280',  fps: '30', vbr: '2500k', abr: '128k' },
                  { label: '🖥 720p Standard', res: '1280x720',  fps: '24', vbr: '2500k', abr: '128k' },
                  { label: '✨ 720p Smooth',   res: '1280x720',  fps: '30', vbr: '3000k', abr: '160k' },
                  { label: '🔥 1080p Full',    res: '1920x1080', fps: '30', vbr: '4500k', abr: '192k' },
                  { label: '⚡ Low Latency',   res: '1280x720',  fps: '24', vbr: '1500k', abr: '128k' },
                ].map(p => (
                  <button
                    key={p.label}
                    onClick={() => setEditingConfig(prev => ({ ...(prev ?? cloudConfig), resolution: p.res, fps: p.fps, videoBitrate: p.vbr, audioBitrate: p.abr }))}  
                    style={{
                      padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      background: editingConfig.resolution === p.res && editingConfig.fps === p.fps && editingConfig.videoBitrate === p.vbr
                        ? 'rgba(212,175,55,0.2)' : 'rgba(212,175,55,0.05)',
                      border: editingConfig.resolution === p.res && editingConfig.fps === p.fps && editingConfig.videoBitrate === p.vbr
                        ? '1px solid rgba(212,175,55,0.5)' : '1px solid rgba(212,175,55,0.12)',
                      color: '#D4AF37',
                    }}
                  >{p.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Individual controls */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {/* Resolution */}
            <div>
              <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>RESOLUTION</p>
              {editingConfig ? (
                <select
                  value={editingConfig.resolution}
                  onChange={e => setEditingConfig(p => p ? { ...p, resolution: e.target.value } : p)}
                  style={{ width: '100%', background: '#080808', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 7, padding: '7px 10px', color: '#D4AF37', fontSize: 12, outline: 'none' }}
                >
                  <option value="1280x720">1280×720 — 720p</option>
                  <option value="1920x1080">1920×1080 — 1080p</option>
                  <option value="720x1280">720×1280 — TikTok portrait</option>
                  <option value="854x480">854×480 — 480p (low CPU)</option>
                  <option value="640x360">640×360 — 360p (minimum)</option>
                </select>
              ) : (
                <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>{cloudConfig.resolution}</p>
              )}
            </div>

            {/* FPS */}
            <div>
              <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>FRAME RATE</p>
              {editingConfig ? (
                <select
                  value={editingConfig.fps}
                  onChange={e => setEditingConfig(p => p ? { ...p, fps: e.target.value } : p)}
                  style={{ width: '100%', background: '#080808', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 7, padding: '7px 10px', color: '#D4AF37', fontSize: 12, outline: 'none' }}
                >
                  <option value="24">24 fps — cinematic</option>
                  <option value="30">30 fps — standard</option>
                  <option value="60">60 fps — ultra smooth</option>
                  <option value="15">15 fps — very low CPU</option>
                </select>
              ) : (
                <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>{cloudConfig.fps} fps</p>
              )}
            </div>

            {/* Video bitrate */}
            <div>
              <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>VIDEO BITRATE</p>
              {editingConfig ? (
                <select
                  value={editingConfig.videoBitrate}
                  onChange={e => setEditingConfig(p => p ? { ...p, videoBitrate: e.target.value } : p)}
                  style={{ width: '100%', background: '#080808', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 7, padding: '7px 10px', color: '#D4AF37', fontSize: 12, outline: 'none' }}
                >
                  <option value="1000k">1000k — minimum</option>
                  <option value="1500k">1500k — low quality</option>
                  <option value="2000k">2000k — standard</option>
                  <option value="2500k">2500k — recommended</option>
                  <option value="3000k">3000k — high quality</option>
                  <option value="4000k">4000k — very high</option>
                  <option value="4500k">4500k — 1080p max</option>
                  <option value="6000k">6000k — broadcast</option>
                </select>
              ) : (
                <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>{cloudConfig.videoBitrate}</p>
              )}
            </div>

            {/* Audio bitrate */}
            <div>
              <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>AUDIO BITRATE</p>
              {editingConfig ? (
                <select
                  value={editingConfig.audioBitrate}
                  onChange={e => setEditingConfig(p => p ? { ...p, audioBitrate: e.target.value } : p)}
                  style={{ width: '100%', background: '#080808', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 7, padding: '7px 10px', color: '#D4AF37', fontSize: 12, outline: 'none' }}
                >
                  <option value="96k">96k — low</option>
                  <option value="128k">128k — standard</option>
                  <option value="160k">160k — good</option>
                  <option value="192k">192k — high quality</option>
                  <option value="320k">320k — maximum</option>
                </select>
              ) : (
                <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>{cloudConfig.audioBitrate}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Status metrics ─────────────────────────────────────────────── */}
      {connected && status && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'STATUS', value: status.streaming ? '🔴 LIVE' : '⚪ IDLE', color: status.streaming ? '#22c55e' : '#555' },
            { label: 'UPTIME',  value: status.streaming ? formatUptime(status.uptime) : '—', color: '#D4AF37' },
            { label: 'CPU LOAD', value: status.cpu, color: '#60a5fa' },
          ].map(m => (
            <div key={m.label} style={{ borderRadius: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <p style={{ color: '#444', fontSize: 9, fontWeight: 800, letterSpacing: 1.5, marginBottom: 5 }}>{m.label}</p>
              <p style={{ color: m.color, fontSize: 14, fontWeight: 900, fontFamily: 'monospace' }}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Page Navigator ─────────────────────────────────────────────── */}
      <div style={{ borderRadius: 12, padding: '14px 16px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(41,98,255,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <p style={{ color: '#5b9bff', fontSize: 10, fontWeight: 800, letterSpacing: 1.2, margin: 0 }}>
            🔀 NAVIGATE STREAM — click to change what TikTok viewers see live
          </p>
          {connected && status?.streaming && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80' }}>AUTO-SYNC ON</span>
              <span style={{ fontSize: 9, color: '#555' }}>— sidebar nav also changes stream</span>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 7 }}>
          {APP_PAGES.map(page => (
            <button
              key={page.path}
              onClick={() => navigateTo(page.path)}
              disabled={!connected || navigating === page.path}
              style={{
                padding: '9px 12px', borderRadius: 9, textAlign: 'left',
                cursor: !connected ? 'not-allowed' : 'pointer',
                background: navigating === page.path ? 'rgba(41,98,255,0.2)' : connected ? 'rgba(41,98,255,0.08)' : 'rgba(41,98,255,0.03)',
                border: `1px solid ${navigating === page.path ? 'rgba(41,98,255,0.5)' : connected ? 'rgba(41,98,255,0.2)' : 'rgba(41,98,255,0.08)'}`,
                color: !connected ? '#333' : '#93c5fd',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                opacity: !connected ? 0.4 : 1,
              }}
            >
              {navigating === page.path ? '↻ Navigating…' : page.label}
            </button>
          ))}
        </div>
        {!connected && (
          <p style={{ color: '#444', fontSize: 10, marginTop: 8 }}>Connect to Codespace to enable navigation</p>
        )}
        {connected && !status?.streaming && (
          <p style={{ color: '#666', fontSize: 10, marginTop: 8 }}>✅ Navigation works even before stream starts — great for rehearsing</p>
        )}
      </div>

      {/* ── Live Log Terminal ──────────────────────────────────────────── */}
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ background: 'rgba(0,0,0,0.8)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Terminal size={13} color="#D4AF37" />
          <p style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, flex: 1 }}>LIVE LOGS</p>
          <button
            onClick={() => setLogs([])}
            style={{ fontSize: 10, color: '#555', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
          >
            Clear
          </button>
          {dot(connected && !!status?.streaming, true)}
        </div>
        <div
          ref={logsContainerRef}
          onScroll={handleLogsScroll}
          style={{
            background: '#020202', padding: '12px 14px',
            height: 240, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11,
            lineHeight: 1.65, color: '#888',
          }}
        >
          {logs.length === 0 ? (
            <p style={{ color: '#333', fontStyle: 'italic' }}>
              {connected ? 'Waiting for stream output…' : 'Connect to Codespace to see logs'}
            </p>
          ) : (
            logs.map((line, i) => {
              const isErr  = /error|fail|❌/i.test(line);
              const isOk   = /✅|frame=|started|ready|connected|navigated/i.test(line);
              const isWarn = /⚠️|warn/i.test(line);
              const color  = isErr ? '#f87171' : isOk ? '#86efac' : isWarn ? '#fbbf24' : '#666';
              return <div key={i} style={{ color, borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: 1 }}>{line}</div>;
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* ── Setup instructions (collapsed) ────────────────────────────── */}
      <details style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <summary style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.4)', color: '#555', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}>
          📖 First time? Setup instructions
        </summary>
        <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { n: 1, t: 'Open your GitHub Codespace', d: 'Go to github.com/speadfreak/JJ-NEXUS-PRO → Code → Codespaces → New (4-core)' },
            { n: 2, t: 'Start the engine (once per session)', d: 'In the Codespace terminal: bash .devcontainer/autostart.sh' },
            { n: 3, t: 'Expose port 7821', d: 'In VS Code: Ports tab → Port 7821 → right-click → Port Visibility → Public. Copy the URL.' },
            { n: 4, t: 'Paste URL above & Connect', d: 'Paste the https://your-codespace-7821.app.github.dev URL in the field above.' },
            { n: 5, t: 'Hit ▶ START STREAM', d: 'The button starts Chrome + FFmpeg automatically. Use Page Navigator to switch pages live.' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(212,175,55,0.15)', color: '#D4AF37', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</div>
              <div>
                <p style={{ color: '#D4AF37', fontWeight: 700, fontSize: 12 }}>{s.t}</p>
                <p style={{ color: '#555', fontSize: 11, lineHeight: 1.5 }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </details>

    </div>
  );
}

// Legacy guide kept as hidden dead-code so the old component name doesn't break imports
function CloudStreamGuide() {
  const [copied, setCopied] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [streamConfig, setStreamConfig] = useState({
    restreamUrl: 'rtmp://live.restream.io/live',
    restreamKey: '',
    renderUrl: '',
    resolution: '1280x720',
    fps: '24',
    bitrate: '2000k',
  });

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copy(text, id)}
      style={{
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
        background: copied === id ? 'rgba(34,197,94,0.2)' : 'rgba(212,175,55,0.12)',
        border: `1px solid ${copied === id ? '#22c55e' : 'rgba(212,175,55,0.3)'}`,
        color: copied === id ? '#22c55e' : '#D4AF37', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      }}
    >
      {copied === id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
      {copied === id ? 'Copied' : 'Copy'}
    </button>
  );

  const CodeBlock = ({ code, id }: { code: string; id: string }) => (
    <div style={{ position: 'relative', background: '#050505', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 10, padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#e2c97e', lineHeight: 1.7, marginTop: 6 }}>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
      <div style={{ position: 'absolute', top: 8, right: 8 }}>
        <CopyBtn text={code} id={id} />
      </div>
    </div>
  );

  const StepCard = ({
    num, icon: Icon, title, badge, color, children,
  }: {
    num: number; icon: React.ElementType; title: string; badge?: string; color: string; children: React.ReactNode;
  }) => {
    const open = activeStep === num;
    return (
      <div
        style={{
          border: `1px solid ${open ? color : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 14, overflow: 'hidden',
          background: open ? `${color}08` : 'rgba(0,0,0,0.3)',
          transition: 'all 0.25s',
          boxShadow: open ? `0 0 20px ${color}18` : 'none',
        }}
      >
        <button
          onClick={() => setActiveStep(open ? null : num)}
          style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left' }}
        >
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${color}22`, border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={14} color={color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#888', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>STEP {num}</span>
              {badge && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: `${color}22`, color, border: `1px solid ${color}44` }}>{badge}</span>}
            </div>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginTop: 2 }}>{title}</p>
          </div>
          <span style={{ color: '#444', fontSize: 18, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
        </button>
        {open && (
          <div style={{ padding: '0 18px 18px' }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const repoUrl = 'https://github.com/speadfreak/JJ-NEXUS-PRO';

  // Build the stream-config JSON that the user will paste into the Codespace
  const configJson = JSON.stringify({
    jjnexusUrl: streamConfig.renderUrl || 'https://jjnexuspro.onrender.com',
    rtmpUrl: streamConfig.restreamUrl,
    restreamKey: streamConfig.restreamKey || 're_your_key_here',
    resolution: streamConfig.resolution,
    fps: streamConfig.fps,
    videoBitrate: streamConfig.bitrate,
    audioBitrate: '128k',
  }, null, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Hero Banner */}
      <div style={{
        borderRadius: 16, padding: '20px 22px', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a0800 0%, #120e00 50%, #0a0500 100%)',
        border: '1px solid rgba(212,175,55,0.35)',
        boxShadow: '0 0 40px rgba(212,175,55,0.08)',
      }}>
        {/* Animated grid bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(212,175,55,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.04) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Cloud size={24} color="#D4AF37" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <p style={{ color: '#D4AF37', fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>☁️ CLOUD STREAMING ENGINE</p>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>ZERO CHROMEBOOK LOAD</span>
              </div>
              <p style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>
                Stream JJ NEXUS PRO from a <strong style={{ color: '#D4AF37' }}>GitHub Codespace</strong> — 4 CPU cloud machine runs Chrome + FFmpeg → Restream → TikTok + YouTube. Your Chromebook only controls the screen via VNC. <strong style={{ color: '#aaa' }}>60 hours free per month.</strong>
              </p>
            </div>
          </div>

          {/* Architecture visual */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {[
              { icon: <SiGithub size={13} />, label: 'Codespace', sub: '4 CPU Ubuntu', color: '#6e40c9' },
              { label: '→', color: '#333', sub: '' },
              { icon: <Monitor size={13} />, label: 'Xvfb :99', sub: 'Virtual Display', color: '#2962ff' },
              { label: '→', color: '#333', sub: '' },
              { icon: <Zap size={13} />, label: 'FFmpeg', sub: 'x264 RTMP', color: '#f59e0b' },
              { label: '→', color: '#333', sub: '' },
              { icon: <Wifi size={13} />, label: 'Restream', sub: 'Multi-platform', color: '#D4AF37' },
              { label: '→', color: '#333', sub: '' },
              { icon: <SiTiktok size={13} />, label: 'TikTok', sub: 'LIVE', color: '#ee1d52' },
              { label: '+', color: '#555', sub: '' },
              { icon: <SiYoutube size={13} />, label: 'YouTube', sub: 'LIVE', color: '#ff0000' },
            ].map((item, i) =>
              item.label === '→' || item.label === '+' ? (
                <span key={i} style={{ color: '#333', fontSize: 16, fontWeight: 300 }}>{item.label}</span>
              ) : (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: `${item.color}18`, border: `1px solid ${item.color}33` }}>
                  <span style={{ color: item.color }}>{item.icon}</span>
                  <div>
                    <p style={{ color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>{item.label}</p>
                    {item.sub && <p style={{ color: '#555', fontSize: 9, lineHeight: 1, marginTop: 2 }}>{item.sub}</p>}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Stats row */}
          <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { icon: <Cpu size={12} />, label: '4 vCPU', sub: 'cloud power' },
              { icon: <Shield size={12} />, label: 'Auto-reconnect', sub: 'up to 20× restarts' },
              { icon: <Cloud size={12} />, label: '60h/month', sub: 'GitHub free tier' },
              { icon: <Zap size={12} />, label: '2000kbps', sub: '1280×720 @ 24fps' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#D4AF37' }}>{s.icon}</span>
                <div>
                  <p style={{ color: '#D4AF37', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>{s.label}</p>
                  <p style={{ color: '#555', fontSize: 10, lineHeight: 1, marginTop: 2 }}>{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stream Config Builder */}
      <div style={{ borderRadius: 14, padding: '16px 18px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,175,55,0.2)' }}>
        <p style={{ color: '#D4AF37', fontWeight: 800, fontSize: 12, letterSpacing: 1, marginBottom: 12 }}>⚙️ CONFIGURE YOUR STREAM</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { label: 'JJ NEXUS URL on Render', key: 'renderUrl', placeholder: 'https://jjnexuspro.onrender.com' },
            { label: 'Restream RTMP URL', key: 'restreamUrl', placeholder: 'rtmp://live.restream.io/live' },
            { label: 'Restream Stream Key', key: 'restreamKey', placeholder: 're_xxxxxxxxxxxx' },
          ].map(f => (
            <div key={f.key}>
              <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>{f.label}</p>
              <input
                type={f.key === 'restreamKey' ? 'password' : 'text'}
                value={(streamConfig as Record<string, string>)[f.key]}
                onChange={e => setStreamConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ width: '100%', background: '#050505', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 8, padding: '8px 10px', color: '#D4AF37', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          ))}
          <div>
            <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>RESOLUTION</p>
            <select
              value={streamConfig.resolution}
              onChange={e => setStreamConfig(p => ({ ...p, resolution: e.target.value }))}
              style={{ width: '100%', background: '#050505', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 8, padding: '8px 10px', color: '#D4AF37', fontSize: 12, outline: 'none' }}
            >
              <option value="1280x720">1280×720 (720p)</option>
              <option value="1920x1080">1920×1080 (1080p)</option>
              <option value="854x480">854×480 (480p)</option>
            </select>
          </div>
          <div>
            <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>VIDEO BITRATE</p>
            <select
              value={streamConfig.bitrate}
              onChange={e => setStreamConfig(p => ({ ...p, bitrate: e.target.value }))}
              style={{ width: '100%', background: '#050505', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 8, padding: '8px 10px', color: '#D4AF37', fontSize: 12, outline: 'none' }}
            >
              <option value="1500k">1500k (TikTok safe)</option>
              <option value="2000k">2000k (recommended)</option>
              <option value="3000k">3000k (high quality)</option>
              <option value="4000k">4000k (1080p max)</option>
            </select>
          </div>
        </div>
        {/* Generated config */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>GENERATED stream-config.json</p>
            <CopyBtn text={configJson} id="configjson" />
          </div>
          <pre style={{ margin: 0, background: '#050505', border: '1px solid rgba(212,175,55,0.1)', borderRadius: 10, padding: '12px 14px', fontFamily: 'monospace', fontSize: 11, color: '#e2c97e', lineHeight: 1.7, overflow: 'auto', maxHeight: 200 }}>{configJson}</pre>
        </div>
      </div>

      {/* Step-by-step accordion */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>STEP-BY-STEP LAUNCH GUIDE</p>

        <StepCard num={1} icon={SiGithub} title="Open GitHub Codespace" badge="RUN ONCE" color="#6e40c9">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>Go to your GitHub repo and start a new Codespace. The setup script installs Chrome, FFmpeg, Xvfb, PulseAudio and noVNC automatically (takes 2–3 min).</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={repoUrl} target="_blank" rel="noreferrer" style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(110,64,201,0.15)', border: '1px solid rgba(110,64,201,0.4)', color: '#a78bfa', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                <ExternalLink size={13} /> Open Repo → Codespaces
              </a>
            </div>
            <div style={{ background: '#050505', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ color: '#555', fontSize: 10, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>HOW TO CREATE A CODESPACE</p>
              {['Click the green Code button on the repo', 'Select the Codespaces tab', 'Click New codespace → 4-core machine', 'Wait 2–3 min for setup.sh to complete'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(110,64,201,0.2)', color: '#a78bfa', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                  <p style={{ color: '#777', fontSize: 12 }}>{s}</p>
                </div>
              ))}
            </div>
          </div>
        </StepCard>

        <StepCard num={2} icon={Terminal} title="Configure stream settings" badge="IN CODESPACE TERMINAL" color="#f59e0b">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>Option A: Run the interactive wizard in the Codespace terminal:</p>
            <CodeBlock code="bash .devcontainer/configure.sh" id="cfg-sh" />
            <p style={{ color: '#888', fontSize: 12, lineHeight: 1.7, marginTop: 4 }}>Option B: Paste your generated config directly (faster — use the builder above):</p>
            <CodeBlock code={`cat > .devcontainer/stream-config.json << 'EOF'\n${configJson}\nEOF`} id="cfg-paste" />
          </div>
        </StepCard>

        <StepCard num={3} icon={Monitor} title="Open noVNC cloud screen" badge="PORT 6080" color="#2962ff">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>noVNC gives you a live view and control of the cloud Chrome browser. Open it from the Codespace Ports panel to see JJ NEXUS PRO running in the cloud.</p>
            <div style={{ background: '#050505', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(41,98,255,0.2)' }}>
              {['In VS Code / Codespace, click the Ports tab', 'Find port 6080 — click the globe icon to open in browser', 'You\'ll see the virtual Ubuntu desktop with Chrome', 'Navigate to JJ NEXUS PRO — it\'s running in the cloud'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(41,98,255,0.2)', color: '#5b9bff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                  <p style={{ color: '#777', fontSize: 12 }}>{s}</p>
                </div>
              ))}
            </div>
          </div>
        </StepCard>

        <StepCard num={4} icon={Play} title="Start the stable stream" badge="AUTO-RECONNECT" color="#22c55e">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>The stable-stream script opens Chrome → loads JJ NEXUS PRO → starts FFmpeg → streams to Restream. Auto-reconnects up to 20 times if disconnected.</p>
            <CodeBlock code="bash .devcontainer/stable-stream.sh" id="stable-sh" />
            <p style={{ color: '#555', fontSize: 11, lineHeight: 1.7 }}>✅ FFmpeg shows <code style={{ color: '#D4AF37' }}>frame=</code> progress when live. Check Restream dashboard to confirm receiving.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 11, marginBottom: 6 }}>📊 Monitor health</p>
                <CodeBlock code="bash .devcontainer/dashboard.sh" id="dash-sh" />
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p style={{ color: '#f87171', fontWeight: 700, fontSize: 11, marginBottom: 6 }}>🛑 Stop stream</p>
                <CodeBlock code="bash .devcontainer/stop.sh" id="stop-sh" />
              </div>
            </div>
          </div>
        </StepCard>

        <StepCard num={5} icon={RotateCcw} title="Stable session tips" badge="PRO" color="#D4AF37">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { emoji: '🖥️', title: 'Keep noVNC open', desc: 'Monitor the cloud screen from your Chromebook — Chrome stays running even if FFmpeg restarts' },
              { emoji: '⏱️', title: '60 hours/month free', desc: 'Plan: 4×15h sessions or 8×7.5h sessions — Codespace bills when running, pause it to save hours' },
              { emoji: '🔑', title: 'Stream key stays private', desc: 'stream-config.json is git-ignored — your Restream key never leaves the Codespace' },
              { emoji: '🎙️', title: 'Phone mic via WebRTC', desc: 'Connect your phone camera on the Phone Camera tab — audio routes to PulseAudio → FFmpeg automatically' },
              { emoji: '📱', title: 'Control from phone', desc: 'Open noVNC (port 6080) on your phone browser to control the cloud screen hands-free' },
              { emoji: '🔄', title: 'Auto-restart on crash', desc: 'stable-stream.sh restarts FFmpeg (not Chrome) on failure — 20 restarts before giving up' },
            ].map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}>
                <span style={{ fontSize: 18 }}>{tip.emoji}</span>
                <div>
                  <p style={{ color: '#D4AF37', fontWeight: 700, fontSize: 12, marginBottom: 3 }}>{tip.title}</p>
                  <p style={{ color: '#666', fontSize: 11, lineHeight: 1.6 }}>{tip.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </StepCard>
      </div>

      {/* Quick command reference */}
      <div style={{ borderRadius: 14, padding: '16px 18px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, marginBottom: 12 }}>⚡ QUICK COMMAND REFERENCE</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
          {[
            { cmd: 'bash .devcontainer/configure.sh', desc: 'Set stream config (interactive)', color: '#f59e0b' },
            { cmd: 'bash .devcontainer/autostart.sh', desc: 'Start Xvfb + VNC + PulseAudio', color: '#2962ff' },
            { cmd: 'bash .devcontainer/stable-stream.sh', desc: 'Start stream with auto-reconnect', color: '#22c55e' },
            { cmd: 'bash .devcontainer/stream.sh', desc: 'Single-shot stream (no auto-restart)', color: '#D4AF37' },
            { cmd: 'bash .devcontainer/dashboard.sh', desc: 'Live health dashboard', color: '#a78bfa' },
            { cmd: 'bash .devcontainer/stop.sh', desc: 'Stop FFmpeg + Chrome', color: '#f87171' },
          ].map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#050505', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <code style={{ color: c.color, fontSize: 11, fontFamily: 'monospace', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cmd}</code>
                <p style={{ color: '#444', fontSize: 10, marginTop: 3 }}>{c.desc}</p>
              </div>
              <CopyBtn text={c.cmd} id={`qr-${i}`} />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

export default function StreamingStudio() {
  const { activeStream, stream, phoneState, screenStream, isActive, startCamera, stopCamera, startScreenShare, stopScreenShare, filters, setFilters } = useCamera();

  const [activeScene, setActiveScene] = useState<SceneKey>('pip');
  const [chartSymbol, setChartSymbol] = useState('XAUUSD');
  const [activeTab, setActiveTab] = useState('Camera');
  const [restreamEmbedUrl, setRestreamEmbedUrl] = useState('');
  const [embedUrlInput, setEmbedUrlInput] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [overlays, setOverlays] = useState({
    lowerThird: true,
    logo: true,
    ticker: true,
    watermark: false,
  });
  const [lowerThirdText, setLowerThirdText] = useState('JJ TRADES • LIVE ANALYSIS');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState('00:00');
  const recordingTimerRef = useRef<number | null>(null);

  const [fps, setFps] = useState(0);
  const [rtmpModal, setRtmpModal] = useState<string | null>(null);
  // canvasRef retained for future use

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;
    const measure = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
      rafId = requestAnimationFrame(measure);
    };
    rafId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafId);
  }, []);


  const toggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setIsRecording(false);
    } else {
      const s = stream || screenStream;
      if (!s) { alert('Please enable camera or screen share first.'); return; }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const recorder = new MediaRecorder(s, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jjnexus-pro-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime('00:00');

      let secs = 0;
      recordingTimerRef.current = window.setInterval(() => {
        secs++;
        const m = String(Math.floor(secs / 60)).padStart(2, '0');
        const s2 = String(secs % 60).padStart(2, '0');
        setRecordingTime(`${m}:${s2}`);
      }, 1000);
    }
  };

  const getResolution = () => {
    if (!stream) return 'No signal';
    const track = stream.getVideoTracks()[0];
    if (!track) return 'No video';
    const { width, height } = track.getSettings();
    return `${width ?? '?'}×${height ?? '?'}`;
  };

  // Use a plain function (not a JSX component) so React never unmounts/remounts
  // the TradingViewWidget on parent re-renders — prevents chart glitching.
  const makeChart = (style?: React.CSSProperties) =>
    screenStream
      ? <ScreenShareDisplay stream={screenStream} style={style} />
      : <TradingViewAdvancedChart key={chartSymbol} symbol={chartSymbol} showSideToolbar={true} style={style} />;

  const renderScene = () => {
    switch (activeScene) {
      case 'pip':
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {makeChart({ width: '100%', height: '100%' })}
            <PiPCameraWindow />
          </div>
        );
      case 'face-chart':
        return (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            <CameraPreview style={{ width: '40%', height: '100%' }} />
            {makeChart({ width: '60%', height: '100%' })}
          </div>
        );
      case 'full-chart':
        return <>{makeChart({ width: '100%', height: '100%' })}</>;
      case 'full-camera':
        return <CameraPreview style={{ width: '100%', height: '100%' }} />;
      case 'vertical':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            {makeChart({ width: '100%', height: '60%' })}
            <CameraPreview style={{ width: '100%', height: '40%' }} />
          </div>
        );
      case 'side-by-side':
        return (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {makeChart({ width: '50%', height: '100%' })}
            <CameraPreview style={{ width: '50%', height: '100%' }} />
          </div>
        );
      default:
        return <>{makeChart({ width: '100%', height: '100%' })}</>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full gap-4 max-w-[1600px] mx-auto w-full"
    >
      {rtmpModal && <RtmpModal platform={rtmpModal} onClose={() => setRtmpModal(null)} />}

      {/* Scene Presets */}
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar shrink-0">
        {SCENES.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveScene(s.key)}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all whitespace-nowrap ${
              activeScene === s.key
                ? 'bg-[rgba(212,175,55,0.2)] text-[var(--gold)] border border-[var(--gold)] shadow-[0_0_10px_rgba(212,175,55,0.3)]'
                : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] border border-[rgba(212,175,55,0.1)] hover:border-[rgba(212,175,55,0.3)]'
            }`}
          >
            {s.label}
          </button>
        ))}
        <ChartSymbolSwitcher currentSymbol={chartSymbol} onSymbolChange={setChartSymbol} className="shrink-0" />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {!isActive ? (
            <button
              onClick={() => startCamera()}
              className="px-4 py-2 bg-[var(--gold)] text-black text-sm font-bold rounded hover:bg-yellow-500 transition-colors flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> Enable Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/40 text-sm font-bold rounded hover:bg-red-500/30 transition-colors flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> Stop Camera
            </button>
          )}
          {!screenStream ? (
            <button
              onClick={startScreenShare}
              className="px-4 py-2 border text-sm font-bold rounded transition-all flex items-center gap-2"
              style={{ background: 'rgba(41,98,255,0.1)', borderColor: 'rgba(41,98,255,0.4)', color: '#5b9bff' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(41,98,255,0.2)'; (e.currentTarget as HTMLElement).style.borderColor = '#2962FF'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(41,98,255,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(41,98,255,0.4)'; }}
              title="Share your TradingView tab or any window into the Studio chart area"
            >
              <MonitorPlay className="w-4 h-4" />
              Share TradingView Tab
            </button>
          ) : (
            <button onClick={stopScreenShare} className="px-4 py-2 text-sm font-bold rounded flex items-center gap-2" style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.5)', color: '#f87171' }}>
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <MonitorPlay className="w-4 h-4" />
              Stop Sharing
            </button>
          )}
        </div>
      </div>

      {/* Screen Share Source Panel — shown when screen share is active */}
      {screenStream && <ScreenShareSourcePanel stream={screenStream} onStop={stopScreenShare} />}

      {/* Main Preview */}
      <div className={`w-full bg-black border border-[rgba(212,175,55,0.2)] rounded-lg relative overflow-hidden shrink-0 shadow-lg ${activeScene === 'vertical' ? 'aspect-[9/16] max-w-[360px] mx-auto' : 'aspect-video'}`}>
        {renderScene()}

        {/* Overlays */}
        {overlays.ticker && (
          <div className="absolute top-0 left-0 w-full h-8 bg-black/80 backdrop-blur border-b border-[var(--gold)]/30 z-20 flex items-center overflow-hidden pointer-events-none">
            <div className="flex whitespace-nowrap animate-[marquee_20s_linear_infinite] text-[var(--gold)] font-mono text-xs">
              <span className="mx-4">XAUUSD 3,340.00 (+0.82%)</span>
              <span className="mx-4">EURUSD 1.1280 (+0.14%)</span>
              <span className="mx-4">GBPUSD 1.3410 (+0.22%)</span>
              <span className="mx-4">USDJPY 145.30 (-0.18%)</span>
              <span className="mx-4">BTCUSD 104,200 (+1.50%)</span>
            </div>
          </div>
        )}

        {isRecording && (
          <div className="absolute top-10 left-4 flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded border border-red-500/50 z-20 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-bold tracking-widest text-xs">REC</span>
            <span className="text-white font-mono text-xs ml-1">{recordingTime}</span>
          </div>
        )}

        {overlays.watermark && (
          <div className="absolute top-10 right-4 z-20 opacity-30 pointer-events-none">
            <h1 className="font-serif text-3xl font-bold tracking-widest text-white drop-shadow-md">JJ NEXUS PRO</h1>
          </div>
        )}

        {overlays.logo && (
          <div className="absolute top-4 right-4 z-20 w-14 h-14 rounded-full overflow-hidden border-2 border-[var(--gold)] shadow-[0_0_15px_rgba(212,175,55,0.5)] pointer-events-none">
            <img src="/jj-trades-logo.jpg" alt="Logo" className="w-full h-full object-cover" />
          </div>
        )}

        {overlays.lowerThird && (
          <div className="absolute bottom-[88px] left-10 z-20">
            <div className="bg-gradient-to-r from-black/90 to-transparent pr-20 py-3 pl-4 border-l-4 border-[var(--gold)] backdrop-blur-md shadow-2xl">
              <input
                type="text"
                value={lowerThirdText}
                onChange={e => setLowerThirdText(e.target.value)}
                className="bg-transparent text-[var(--gold)] font-serif font-bold text-xl tracking-widest uppercase outline-none w-full min-w-[280px]"
              />
              <p className="text-white text-xs font-mono mt-1 tracking-wider uppercase">JJ NEXUS PRO BROADCAST</p>
            </div>
          </div>
        )}

        {/* ── Audio Waveform Visualizer Overlay ── */}
        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
          <AudioWaveformVisualizer
            stream={stream ?? undefined}
            fallbackStream={screenStream ?? undefined}
          />
        </div>
      </div>

      {/* Stream Health Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[hsl(var(--card))] border border-[rgba(212,175,55,0.2)] rounded-lg shrink-0 overflow-x-auto custom-scrollbar text-sm gap-4">
        <div className="flex items-center gap-6 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${isActive ? 'text-[var(--gold)] animate-pulse' : 'text-gray-600'}`} />
            <span className="text-gray-400">FPS:</span>
            <span className="font-mono text-white">{isActive ? fps : 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Resolution:</span>
            <span className="font-mono text-white">{getResolution()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Camera:</span>
            <span className={`font-mono ${isActive ? 'text-green-400' : 'text-gray-500'}`}>{isActive ? 'LIVE' : 'OFF'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Screen:</span>
            <span className={`font-mono ${screenStream ? 'text-green-400' : 'text-gray-500'}`}>{screenStream ? 'SHARING' : 'OFF'}</span>
          </div>
        </div>

        {/* Compact audio level meter */}
        <div className="ml-auto shrink-0">
          <AudioWaveformVisualizer
            stream={stream ?? undefined}
            fallbackStream={screenStream ?? undefined}
            compact
          />
        </div>
      </div>

      {/* Bottom Columns */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-[400px]">
        {/* Controls */}
        <div className="flex-[2] border border-[rgba(212,175,55,0.2)] rounded-lg bg-[hsl(var(--card))] flex flex-col overflow-hidden group hover:border-[var(--gold)] transition-colors">
          <div className="flex border-b border-[rgba(212,175,55,0.1)] shrink-0 overflow-x-auto custom-scrollbar">
            {['Camera', 'Overlays', 'Stream', 'Alerts', '📺 Go Live', '☁️ Cloud'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-shrink-0 flex-1 min-w-[80px] py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                  activeTab === tab
                    ? tab === '☁️ Cloud'
                      ? 'text-[var(--gold)] border-b-2 border-[var(--gold)] bg-[rgba(212,175,55,0.07)]'
                      : 'text-[var(--gold)] border-b-2 border-[var(--gold)] bg-white/5'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-white hover:bg-white/5'
                }`}
              >
                {tab === 'Alerts' && <Bell className="w-3.5 h-3.5" />}
                {tab === '☁️ Cloud' && <Cloud className="w-3.5 h-3.5" />}
                {tab === '☁️ Cloud' ? 'Cloud' : tab}
              </button>
            ))}
          </div>

          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'Camera' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Mirror Camera</span>
                    <button
                      onClick={() => setFilters({ flipped: !filters.flipped })}
                      className={`w-12 h-6 rounded-full p-1 transition-colors ${filters.flipped ? 'bg-[var(--gold)]' : 'bg-gray-700'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${filters.flipped ? 'translate-x-6' : ''}`} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Zoom</span>
                      <span className="text-[var(--gold)] font-mono">{filters.zoom.toFixed(1)}x</span>
                    </div>
                    <input type="range" min="1" max="3" step="0.1" value={filters.zoom} onChange={e => setFilters({ zoom: Number(e.target.value) })} className="w-full accent-[var(--gold)]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Brightness</span>
                      <span className="text-[var(--gold)] font-mono">{filters.brightness}%</span>
                    </div>
                    <input type="range" min="50" max="150" value={filters.brightness} onChange={e => setFilters({ brightness: Number(e.target.value) })} className="w-full accent-[var(--gold)]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Contrast</span>
                      <span className="text-[var(--gold)] font-mono">{filters.contrast}%</span>
                    </div>
                    <input type="range" min="50" max="150" value={filters.contrast} onChange={e => setFilters({ contrast: Number(e.target.value) })} className="w-full accent-[var(--gold)]" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Saturation</span>
                      <span className="text-[var(--gold)] font-mono">{filters.saturation}%</span>
                    </div>
                    <input type="range" min="0" max="200" value={filters.saturation} onChange={e => setFilters({ saturation: Number(e.target.value) })} className="w-full accent-[var(--gold)]" />
                  </div>
                </div>

                <div>
                  <PhoneCameraConnect />
                </div>
              </div>
            )}

            {activeTab === 'Overlays' && (
              <div className="space-y-4">
                {Object.entries(overlays).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-4 rounded-lg bg-black/40 border border-[rgba(212,175,55,0.1)]">
                    <span className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <button
                      onClick={() => setOverlays(prev => ({ ...prev, [key]: !value }))}
                      className={`w-10 h-5 rounded-full p-1 transition-colors ${value ? 'bg-[var(--gold)]' : 'bg-gray-700'}`}
                    >
                      <div className={`w-3 h-3 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                ))}
                {overlays.lowerThird && (
                  <div className="p-4 rounded-lg bg-black/40 border border-[rgba(212,175,55,0.1)]">
                    <label className="text-xs text-gray-400 mb-2 block">Lower Third Text</label>
                    <input
                      type="text"
                      value={lowerThirdText}
                      onChange={e => setLowerThirdText(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-sm text-[var(--gold)] focus:outline-none focus:border-[var(--gold)]"
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'Alerts' && (
              <StreamAlertsSettings />
            )}

            {activeTab === '📺 Go Live' && (
              <GoLiveGuide />
            )}

            {activeTab === '☁️ Cloud' && (
              <CloudControlPanel />
            )}

            {activeTab === 'Stream' && (
              <div className="space-y-4">
                {[
                  { id: 'YouTube', icon: SiYoutube, color: 'text-red-500' },
                  { id: 'TikTok', icon: SiTiktok, color: 'text-white' },
                  { id: 'Instagram', icon: SiInstagram, color: 'text-pink-500' },
                ].map(platform => {
                  const Icon = platform.icon;
                  return (
                    <div key={platform.id} className="flex items-center justify-between p-4 rounded-lg bg-black/40 border border-[rgba(212,175,55,0.1)]">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-6 h-6 ${platform.color}`} />
                        <span className="font-medium text-white">{platform.id} Live</span>
                      </div>
                      <button
                        onClick={() => setRtmpModal(platform.id)}
                        className="px-4 py-1.5 bg-[var(--gold)] text-black text-xs font-bold rounded hover:bg-yellow-500 transition-colors"
                      >
                        SETUP STREAM
                      </button>
                    </div>
                  );
                })}

                <div className="mt-6 pt-6 border-t border-[rgba(212,175,55,0.1)]">
                  <button
                    onClick={toggleRecording}
                    className={`w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                      isRecording
                        ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                        : 'bg-black border border-gray-600 text-white hover:border-[var(--gold)]'
                    }`}
                  >
                    <CircleDot className={`w-5 h-5 ${isRecording ? 'animate-pulse' : ''}`} />
                    {isRecording ? `STOP RECORDING (${recordingTime})` : 'START LOCAL RECORDING (.webm)'}
                  </button>
                  {isRecording && (
                    <p className="text-center text-xs text-red-400 mt-2">Recording in progress — file auto-downloads on stop</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat — Restream Embed Only */}
        <div className="w-full md:w-72 border border-[rgba(212,175,55,0.2)] rounded-lg bg-[hsl(var(--card))] flex flex-col group hover:border-[var(--gold)] transition-colors shrink-0">
          <div className="p-3 border-b border-[rgba(212,175,55,0.1)] bg-black/60 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[var(--gold)] shrink-0" />
            <h3 className="font-semibold text-sm flex-1">Restream Live Chat</h3>
            {restreamEmbedUrl && (
              <button
                onClick={() => setRestreamEmbedUrl('')}
                className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {restreamEmbedUrl ? (
            <>
              <iframe
                src={restreamEmbedUrl}
                className="flex-1 w-full border-0 min-h-0"
                allow="autoplay"
                title="Restream Chat"
              />
              <div className="p-2 border-t border-[rgba(212,175,55,0.1)] flex gap-2 shrink-0">
                <button
                  onClick={() => setRestreamEmbedUrl('')}
                  className="flex-1 py-1.5 text-[10px] text-gray-500 hover:text-red-400 transition-colors border border-gray-800 rounded"
                >
                  ✕ Disconnect
                </button>
                <a
                  href={restreamEmbedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-1.5 text-[10px] text-[var(--gold)] transition-colors border border-[rgba(212,175,55,0.2)] rounded text-center hover:bg-[rgba(212,175,55,0.1)]"
                >
                  ↗ Pop Out
                </a>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-auto">
              <div className="text-center">
                <div className="text-3xl mb-2">📺</div>
                <p className="text-xs text-gray-400 font-semibold mb-1">Restream Chat Embed</p>
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  Paste your Restream chat widget URL to see live viewer messages from TikTok, YouTube & all platforms in one feed
                </p>
              </div>
              <div className="space-y-2">
                <input
                  type="url"
                  value={embedUrlInput}
                  onChange={e => setEmbedUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && embedUrlInput.trim()) setRestreamEmbedUrl(embedUrlInput.trim()); }}
                  placeholder="https://chat.restream.io/embed?cid=..."
                  className="w-full bg-black/60 border border-gray-700 rounded px-3 py-2 text-[11px] focus:outline-none focus:border-[var(--gold)] text-white placeholder-gray-700"
                />
                <button
                  onClick={() => { if (embedUrlInput.trim()) setRestreamEmbedUrl(embedUrlInput.trim()); }}
                  disabled={!embedUrlInput.trim()}
                  className="w-full py-2 bg-[var(--gold)] text-black text-xs font-bold rounded hover:bg-yellow-500 disabled:opacity-40 transition-all"
                >
                  Connect Chat
                </button>
              </div>
              <div className="border border-[rgba(212,175,55,0.1)] rounded p-3 bg-black/40 space-y-1.5">
                <p className="text-[10px] text-[var(--gold)] font-bold">How to get your embed URL:</p>
                <p className="text-[9px] text-gray-600">1. Go to restream.io → Dashboard</p>
                <p className="text-[9px] text-gray-600">2. Settings → Chat → Embed Widget</p>
                <p className="text-[9px] text-gray-600">3. Copy the embed iframe src URL</p>
                <p className="text-[9px] text-gray-600">4. Paste above and press Enter ↵</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
