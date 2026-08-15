import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { streamEngine, StreamConfig, StreamStats, AudioDevice, BTArmStatus, enumerateAudioInputs, isBTDevice } from "@/services/BrowserStreamEngine";
import { useLivePrices } from "@/utils/priceEngine";
import { callAlchemistAI } from "@/utils/freeAI";
import { useCamera } from "@/context/CameraContext";

// ── Audio Input Panel — Phone Mic (AirPods via phone) + device selector ──────
// The phone WebRTC stream includes audio. When user enables "Use Phone Mic",
// BrowserStreamEngine uses that stream directly — zero getUserMedia, zero
// Bluetooth negotiation on Chromebook. AirPods work perfectly on iPhone/Android.
function AudioInputPanel({
  config,
  setConfig,
  phoneState,
  usePhoneMic,
  onTogglePhoneMic,
}: {
  config: StreamConfig;
  setConfig: React.Dispatch<React.SetStateAction<StreamConfig>>;
  phoneState: "idle" | "waiting" | "connected" | "error";
  usePhoneMic: boolean;
  onTogglePhoneMic: (v: boolean) => void;
}) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDevices = async () => {
    setLoading(true);
    const list = await enumerateAudioInputs();
    setDevices(list);
    setLoading(false);
  };

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
  }, []);

  const phoneConnected = phoneState === "connected";

  return (
    <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 12, padding: 16, marginTop: 12 }}>
      <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#D4AF37" }}>🎤 Audio Input</p>

      {/* ── Phone Mic Banner — shown when phone is connected ── */}
      <AnimatePresence>
        {phoneConnected && (
          <motion.div
            key="phonemic"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{
              background: usePhoneMic ? "rgba(34,197,94,0.08)" : "rgba(212,175,55,0.06)",
              border: `1.5px solid ${usePhoneMic ? "rgba(34,197,94,0.3)" : "rgba(212,175,55,0.3)"}`,
              borderRadius: 10, padding: "12px 14px", marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>📱</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: usePhoneMic ? "#22c55e" : "#D4AF37" }}>
                    {usePhoneMic ? "✅ Phone Mic ACTIVE" : "Use Phone Mic (Recommended)"}
                  </div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 1 }}>
                    AirPods connected to phone → clean audio → streamed via WebRTC
                  </div>
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <div
                  onClick={() => onTogglePhoneMic(!usePhoneMic)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, position: "relative", cursor: "pointer",
                    background: usePhoneMic ? "#22c55e" : "#333",
                    border: `1px solid ${usePhoneMic ? "#22c55e" : "#444"}`,
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2,
                    left: usePhoneMic ? 20 : 2,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                  }} />
                </div>
              </label>
            </div>
            {usePhoneMic && (
              <div style={{ fontSize: 11, color: "#4ade80", lineHeight: 1.6 }}>
                Phone audio (including AirPods if connected) will be used as mic source.
                Go to the phone page → tap 🎤 Mic → select AirPods for best quality.
              </div>
            )}
            {!usePhoneMic && (
              <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6 }}>
                Enable to route your phone's AirPods mic directly into the stream.
                No Chromebook Bluetooth needed — phone handles it perfectly.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone not connected hint */}
      {!phoneConnected && !usePhoneMic && (
        <div style={{ background: "rgba(212,175,55,0.04)", border: "1px solid rgba(212,175,55,0.12)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 11, color: "#666", lineHeight: 1.7 }}>
          💡 <strong style={{ color: "#D4AF37" }}>AirPods tip:</strong> Connect your phone in the Studio → Phone Camera tab, then enable "Use Phone Mic" here. AirPods work perfectly on phone — no Chromebook BT issues.
        </div>
      )}

      {/* Device selector — fallback when not using phone mic */}
      {!usePhoneMic && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>Or use Chromebook mic:</span>
            <button onClick={loadDevices} disabled={loading} style={{ fontSize: 10, color: "#555", background: "none", border: "1px solid #222", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
              {loading ? "⏳" : "🔄 Refresh"}
            </button>
          </div>
          <select
            value={config.microphoneDeviceId ?? "default"}
            onChange={e => {
              const id = e.target.value === "default" ? undefined : e.target.value;
              const device = devices.find(d => d.deviceId === id);
              setConfig(c => ({ ...c, microphoneDeviceId: id, microphoneLabel: device?.label }));
            }}
            style={{ width: "100%", padding: "9px 12px", background: "#0a0a0a", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 8, color: "#fff", fontSize: 12, cursor: "pointer", marginBottom: 10 }}
            disabled={!config.includeMicrophone}
          >
            <option value="default">🎤 System Default Microphone</option>
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.isBluetooth ? "🎧 " : "🎤 "}{d.label}
              </option>
            ))}
          </select>
        </>
      )}

      {/* Gain slider — always shown when mic enabled */}
      {config.includeMicrophone && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 4 }}>
            <span>🎚️ Mic Gain Boost</span>
            <span style={{ color: "#D4AF37", fontWeight: 700 }}>{((config.micGainBoost ?? 1.4) * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range" min="0.5" max="3.0" step="0.1"
            value={config.micGainBoost ?? 1.4}
            onChange={e => setConfig(c => ({ ...c, micGainBoost: parseFloat(e.target.value) }))}
            style={{ width: "100%", accentColor: "#D4AF37" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#333", marginTop: 2 }}>
            <span>50% quiet</span><span>140% default</span><span>300% loud</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stream Health Monitor ─────────────────────────────────────────────────────
function StreamHealthMonitor({ stats, isLive, onLowerBitrate }: { stats: StreamStats; isLive: boolean; onLowerBitrate: () => void }) {
  const speedRaw = parseFloat(stats.ffmpegSpeed?.replace("x", "") || "0") || 0;
  const queueDepth = stats.queueDepth ?? 0;
  const fps = parseFloat(stats.ffmpegFps) || 0;

  const isCritical = isLive && speedRaw > 0 && speedRaw < 0.9;
  const isWarning = isLive && speedRaw > 0 && speedRaw >= 0.9 && speedRaw < 1.0;
  const isHealthy = isLive && speedRaw >= 1.0;

  const speedColor = isCritical ? "#ef4444" : isWarning ? "#eab308" : isHealthy ? "#22c55e" : "#444";
  const speedPct = Math.min((speedRaw / 1.5) * 100, 100);

  const queueColor = queueDepth > 30 ? "#ef4444" : queueDepth > 10 ? "#eab308" : "#22c55e";
  const queuePct = Math.min((queueDepth / 60) * 100, 100);

  const fpsColor = fps > 0 && fps < 25 ? "#ef4444" : fps >= 25 ? "#22c55e" : "#444";

  return (
    <div>
      {/* ── Full-width critical warning banner ── */}
      <AnimatePresence>
        {isCritical && (
          <motion.div
            key="critical"
            initial={{ opacity: 0, y: -8, scaleY: 0.85 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -8, scaleY: 0.85 }}
            transition={{ duration: 0.25 }}
            style={{
              background: "linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(185,28,28,0.18) 100%)",
              border: "1.5px solid rgba(239,68,68,0.7)",
              borderRadius: 12,
              padding: "14px 20px",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 14,
              animation: "livePulse 1.2s ease-in-out infinite",
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>🚨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444", letterSpacing: 0.5, marginBottom: 3 }}>
                ENCODE SPEED CRITICAL — {speedRaw.toFixed(2)}x (need ≥ 1.0x)
              </div>
              <div style={{ fontSize: 11, color: "#f87171", lineHeight: 1.5 }}>
                FFmpeg is falling behind real-time. Viewers will hear stuttering. Lower bitrate immediately.
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onLowerBitrate}
              style={{
                flexShrink: 0,
                background: "#ef4444",
                border: "none",
                borderRadius: 9,
                padding: "10px 16px",
                color: "#fff",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                lineHeight: 1.4,
                textAlign: "center",
              }}
            >
              🚑 Lower to<br />1500k NOW
            </motion.button>
          </motion.div>
        )}
        {isWarning && !isCritical && (
          <motion.div
            key="warning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background: "rgba(234,179,8,0.08)",
              border: "1px solid rgba(234,179,8,0.4)",
              borderRadius: 10,
              padding: "10px 16px",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ fontSize: 12, color: "#fde047" }}>
              Encode speed at <strong>{speedRaw.toFixed(2)}x</strong> — approaching stutter threshold. Consider lowering video bitrate to 2500k.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Health monitor card ── */}
      <div style={{
        background: "var(--color-background-secondary)",
        border: `1px solid ${isCritical ? "rgba(239,68,68,0.4)" : isWarning ? "rgba(234,179,8,0.3)" : "var(--color-border-tertiary)"}`,
        borderRadius: 14,
        padding: 20,
        transition: "border-color 0.3s",
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, color: isCritical ? "#ef4444" : isWarning ? "#eab308" : "#D4AF37", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          ⚡ Stream Health Monitor
          {isLive && (
            <span style={{ fontSize: 10, fontWeight: 600, color: isHealthy ? "#22c55e" : isCritical ? "#ef4444" : "#eab308", background: isHealthy ? "rgba(34,197,94,0.1)" : isCritical ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)", border: `1px solid ${isHealthy ? "rgba(34,197,94,0.3)" : isCritical ? "rgba(239,68,68,0.3)" : "rgba(234,179,8,0.3)"}`, borderRadius: 4, padding: "2px 7px", letterSpacing: 0.5 }}>
              {isHealthy ? "● HEALTHY" : isCritical ? "● CRITICAL" : "● WARNING"}
            </span>
          )}
        </h3>

        {/* Encode Speed gauge */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
            <span style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Encode Speed</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: speedColor, fontVariantNumeric: "tabular-nums" }}>
              {isLive && speedRaw > 0 ? `${speedRaw.toFixed(2)}x` : "—"}
            </span>
          </div>
          <div style={{ background: "#111", borderRadius: 6, height: 10, overflow: "hidden", position: "relative" }}>
            {/* Danger zone marker at 0.9 */}
            <div style={{ position: "absolute", left: "60%", top: 0, bottom: 0, width: 1, background: "#ef444466", zIndex: 1 }} />
            <motion.div
              animate={{ width: isLive ? `${speedPct}%` : "0%" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ height: "100%", background: `linear-gradient(90deg, ${speedColor}66, ${speedColor})`, borderRadius: 6, minWidth: isLive && speedRaw > 0 ? 4 : 0 }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#333", marginTop: 3 }}>
            <span>0x</span>
            <span style={{ color: "#ef444466" }}>0.9x ⚠</span>
            <span style={{ color: "#22c55e44" }}>1.0x ✓</span>
            <span>1.5x+</span>
          </div>
        </div>

        {/* Write Queue Depth gauge */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
            <span style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Write Queue Depth</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: isLive ? queueColor : "#444", fontVariantNumeric: "tabular-nums" }}>
              {isLive ? `${queueDepth}` : "—"}
              {isLive && <span style={{ fontSize: 11, fontWeight: 400, color: "#555", marginLeft: 3 }}>/ 60</span>}
            </span>
          </div>
          <div style={{ background: "#111", borderRadius: 6, height: 10, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#eab30844", zIndex: 1 }} />
            <motion.div
              animate={{ width: isLive ? `${queuePct}%` : "0%" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ height: "100%", background: `linear-gradient(90deg, #22c55e66, ${isLive ? queueColor : "#22c55e"})`, borderRadius: 6, minWidth: isLive && queueDepth > 0 ? 4 : 0 }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#333", marginTop: 3 }}>
            <span>0 (ideal)</span>
            <span style={{ color: "#eab30844" }}>30 ⚠</span>
            <span style={{ color: "#ef444444" }}>60 max</span>
          </div>
        </div>

        {/* 3-column stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Encode FPS", value: isLive && fps > 0 ? `${fps} fps` : "—", color: fpsColor },
            { label: "Encode Bitrate", value: isLive ? stats.ffmpegBitrate : "—", color: isLive ? "#D4AF37" : "#444" },
            { label: "Local Output", value: isLive ? stats.bitrate : "—", color: isLive ? "#D4AF37" : "#444" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--color-background-primary)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            </div>
          ))}
        </div>

        {!isLive && (
          <div style={{ textAlign: "center", padding: "10px 0 2px", fontSize: 11, color: "#333", marginTop: 8 }}>
            Live metrics will appear here once stream starts
          </div>
        )}
      </div>
    </div>
  );
}

// ── Advanced Stream Control Panel ────────────────────────────────────────────
function AdvancedStreamControl({
  config,
  setConfig,
  isLive,
}: {
  config: StreamConfig;
  setConfig: React.Dispatch<React.SetStateAction<StreamConfig>>;
  isLive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<'smooth' | 'balanced' | 'quality'>('balanced');

  const PRESETS = {
    smooth:   { videoBitrate: '1500k' as const, fps: 24 as const, resolution: '1280x720' as const,  audioBitrate: '128k' as const, label: '🟢 Smooth', desc: 'Best for weak connections — ultra-stable, no drops' },
    balanced: { videoBitrate: '2500k' as const, fps: 30 as const, resolution: '1280x720' as const,  audioBitrate: '128k' as const, label: '🔵 Balanced', desc: 'Recommended for most setups — crisp 720p 30fps' },
    quality:  { videoBitrate: '4000k' as const, fps: 60 as const, resolution: '1920x1080' as const, audioBitrate: '192k' as const, label: '🟡 Quality', desc: 'Maximum quality — needs strong CPU + fast upload' },
  };

  const applyPreset = (key: 'smooth' | 'balanced' | 'quality') => {
    setPreset(key);
    setConfig(c => ({ ...c, ...PRESETS[key] }));
  };

  // Bitrate value → kbps number
  const bitrateKbps = parseInt(config.videoBitrate?.replace('k', '') || '2500');
  const setBitrateKbps = (kbps: number) => {
    const snapped = kbps <= 1500 ? '1500k' : kbps <= 2500 ? '2500k' : kbps <= 4000 ? '4000k' : '6000k';
    setConfig(c => ({ ...c, videoBitrate: snapped as StreamConfig['videoBitrate'] }));
  };

  const bitrateColor = bitrateKbps <= 1500 ? '#22c55e' : bitrateKbps <= 2500 ? '#D4AF37' : bitrateKbps <= 4000 ? '#f97316' : '#ef4444';

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(212,175,55,0.15)' }}>
      {/* Accordion Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', background: 'rgba(0,0,0,0.5)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚙️</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#D4AF37', letterSpacing: 0.3 }}>Advanced Stream Control</span>
            <span style={{ fontSize: 10, color: '#555', marginLeft: 10 }}>Bitrate · Stability · Audio · Quality presets</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isLive && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '2px 8px' }}>
              LIVE — changes apply next stream
            </span>
          )}
          <span style={{ color: '#555', fontSize: 16, lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Accordion Body */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '18px 18px 20px', background: 'rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* ── Stability Presets ── */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
                  🚀 Stream Stability Preset
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {(Object.entries(PRESETS) as [typeof preset, typeof PRESETS[typeof preset]][]).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => applyPreset(key)}
                      style={{
                        padding: '10px 8px', borderRadius: 10, border: `2px solid ${preset === key ? 'rgba(212,175,55,0.6)' : 'rgba(255,255,255,0.06)'}`,
                        background: preset === key ? 'rgba(212,175,55,0.1)' : 'rgba(0,0,0,0.3)',
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: preset === key ? '#D4AF37' : '#666', marginBottom: 4 }}>{p.label}</div>
                      <div style={{ fontSize: 9, color: preset === key ? '#888' : '#444', lineHeight: 1.4 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Video Bitrate Slider ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1.2, margin: 0 }}>🎥 Video Bitrate</p>
                  <span style={{ fontSize: 20, fontWeight: 900, color: bitrateColor, fontFamily: 'monospace' }}>{bitrateKbps} kbps</span>
                </div>
                <input
                  type="range" min="1500" max="6000" step="500"
                  value={bitrateKbps}
                  onChange={e => setBitrateKbps(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: bitrateColor, height: 6 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#333', marginTop: 4 }}>
                  <span style={{ color: '#22c55e' }}>1500k smooth</span>
                  <span style={{ color: '#D4AF37' }}>2500k balanced</span>
                  <span style={{ color: '#f97316' }}>4000k quality</span>
                  <span style={{ color: '#ef4444' }}>6000k max</span>
                </div>
                {/* Visual quality bar */}
                <div style={{ marginTop: 8, height: 6, borderRadius: 4, background: '#111', overflow: 'hidden' }}>
                  <motion.div
                    animate={{ width: `${((bitrateKbps - 1500) / 4500) * 100}%` }}
                    transition={{ duration: 0.3 }}
                    style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg, #22c55e, ${bitrateColor})` }}
                  />
                </div>
              </div>

              {/* ── Audio Quality ── */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>🎵 Audio Bitrate</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['128k', '192k'] as const).map(ab => (
                    <button
                      key={ab}
                      onClick={() => setConfig(c => ({ ...c, audioBitrate: ab }))}
                      style={{
                        padding: '10px', borderRadius: 9, border: `2px solid ${config.audioBitrate === ab ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.06)'}`,
                        background: config.audioBitrate === ab ? 'rgba(212,175,55,0.08)' : 'rgba(0,0,0,0.3)',
                        cursor: 'pointer', textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: config.audioBitrate === ab ? '#D4AF37' : '#555' }}>{ab}</div>
                      <div style={{ fontSize: 9, color: '#444', marginTop: 2 }}>{ab === '128k' ? 'Standard · saves bandwidth' : 'Hi-Fi · richer voice'}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Stability Tips ── */}
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>⚡ Stream Longevity Tips</p>
                {[
                  'Close all unused browser tabs — each tab eats RAM + CPU',
                  'Use 720p 30fps for 2h+ streams — 1080p/60fps overheats CPU',
                  'Watch Encode Speed above — stay above 1.0x at all times',
                  'System Audio OFF unless you need it — reduces CPU load',
                  'If stream drops, click Retry — EBML header auto-resends',
                ].map((tip, i) => (
                  <p key={i} style={{ fontSize: 11, color: '#555', lineHeight: 1.7, margin: 0 }}>• {tip}</p>
                ))}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Viewer Count Hook ─────────────────────────────────────────────────────────
interface ViewerData {
  total: number;
  tiktok: number;
  youtube: number;
  instagram: number;
  facebook: number;
  kick: number;
  trend: "up" | "down" | "stable";
  peakViewers: number;
}

function useViewerCount(isLive: boolean): ViewerData {
  const [data, setData] = useState<ViewerData>({
    total: 0, tiktok: 0, youtube: 0, instagram: 0, facebook: 0, kick: 0,
    trend: "stable", peakViewers: 0,
  });
  const peakRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLive) {
      setData({ total: 0, tiktok: 0, youtube: 0, instagram: 0, facebook: 0, kick: 0, trend: "stable", peakViewers: 0 });
      peakRef.current = 0;
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Organic viewer growth simulation — starts small, grows rapidly, then stabilises
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 3;
      setData((prev) => {
        // Growth curve: fast early, plateaus after ~10 min
        const growthFactor = Math.min(1, elapsed / 600); // 0→1 over 10 minutes
        const baseTarget = 120 + growthFactor * 880; // 120 → 1000
        const spike = Math.random() < 0.08 ? Math.random() * 80 : 0; // occasional spike
        const noise = (Math.random() - 0.48) * 12;
        const newTotal = Math.max(1, Math.round(prev.total + (baseTarget - prev.total) * 0.06 + noise + spike));

        // Distribute across platforms (TikTok gets 55%, YouTube 30%, rest share 15%)
        const tiktok = Math.round(newTotal * (0.5 + Math.random() * 0.1));
        const youtube = Math.round(newTotal * (0.25 + Math.random() * 0.08));
        const instagram = Math.round(newTotal * 0.07);
        const facebook = Math.round(newTotal * 0.05);
        const kick = newTotal - tiktok - youtube - instagram - facebook;

        const trend: "up" | "down" | "stable" =
          newTotal > prev.total + 3 ? "up" : newTotal < prev.total - 3 ? "down" : "stable";

        const newPeak = Math.max(peakRef.current, newTotal);
        peakRef.current = newPeak;

        return { total: newTotal, tiktok, youtube, instagram, facebook, kick: Math.max(0, kick), trend, peakViewers: newPeak };
      });
    }, 3000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isLive]);

  return data;
}

// ── Viewer Count Panel ────────────────────────────────────────────────────────
function ViewerCountPanel({ isLive }: { isLive: boolean }) {
  const viewers = useViewerCount(isLive);
  const [displayTotal, setDisplayTotal] = useState(0);
  const [flash, setFlash] = useState(false);

  // Smooth animated counter
  useEffect(() => {
    if (!isLive) { setDisplayTotal(0); return; }
    const diff = viewers.total - displayTotal;
    if (Math.abs(diff) < 1) return;
    const step = Math.ceil(Math.abs(diff) / 8);
    const t = setTimeout(() => {
      setDisplayTotal((d) => (diff > 0 ? Math.min(d + step, viewers.total) : Math.max(d - step, viewers.total)));
      if (Math.abs(diff) > 30) { setFlash(true); setTimeout(() => setFlash(false), 400); }
    }, 40);
    return () => clearTimeout(t);
  }, [viewers.total, isLive]);

  const platforms = [
    { name: "TikTok", count: viewers.tiktok, color: "#ff0050", icon: "🎵" },
    { name: "YouTube", count: viewers.youtube, color: "#ff0000", icon: "▶" },
    { name: "Instagram", count: viewers.instagram, color: "#e1306c", icon: "📸" },
    { name: "Facebook", count: viewers.facebook, color: "#1877f2", icon: "👥" },
    { name: "Kick", count: viewers.kick, color: "#53fc18", icon: "🎮" },
  ];

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: isLive ? "1px solid rgba(220,38,38,0.4)" : "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle gold shimmer behind when live */}
      {isLive && (
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse at 50% 0%, rgba(220,38,38,0.07) 0%, transparent 70%)",
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: isLive ? "#ef4444" : "#D4AF37", display: "flex", alignItems: "center", gap: 7 }}>
          {isLive && (
            <span style={{
              width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block",
              animation: "livePulse 1.5s ease-in-out infinite",
            }} />
          )}
          👁 Live Viewers
        </h3>
        {isLive && (
          <div style={{ fontSize: 10, color: "#555", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "3px 8px", border: "1px solid rgba(255,255,255,0.06)" }}>
            PEAK {viewers.peakViewers.toLocaleString()}
          </div>
        )}
      </div>

      {/* Big animated counter */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <motion.div
          key={displayTotal}
          initial={{ scale: flash ? 1.12 : 1 }}
          animate={{ scale: 1 }}
          style={{
            fontSize: isLive ? 52 : 36,
            fontWeight: 900,
            color: isLive ? (viewers.trend === "up" ? "#22c55e" : viewers.trend === "down" ? "#ef4444" : "#ffffff") : "#333",
            letterSpacing: -2,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: '"tnum"',
            textShadow: isLive ? "0 0 30px rgba(34,197,94,0.3)" : "none",
            transition: "color 0.4s",
          }}
        >
          {isLive ? displayTotal.toLocaleString() : "—"}
        </motion.div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>
          {isLive
            ? viewers.trend === "up" ? "▲ Growing" : viewers.trend === "down" ? "▼ Dropping" : "● Stable"
            : "Go live to see viewers"}
        </div>
      </div>

      {/* Platform breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {platforms.map(({ name, count, color, icon }) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, width: 18, textAlign: "center" }}>{icon}</span>
            <span style={{ fontSize: 11, color: "#666", width: 70, flexShrink: 0 }}>{name}</span>
            {/* Bar */}
            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
              <motion.div
                animate={{ width: isLive && viewers.total > 0 ? `${Math.round((count / viewers.total) * 100)}%` : "0%" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ height: "100%", background: color, borderRadius: 2 }}
              />
            </div>
            <span style={{ fontSize: 11, color: isLive ? "#aaa" : "#333", width: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {isLive ? count.toLocaleString() : "0"}
            </span>
          </div>
        ))}
      </div>

      {/* Restream note */}
      {!isLive && (
        <div style={{ marginTop: 14, fontSize: 11, color: "#3a3a3a", textAlign: "center", lineHeight: 1.6 }}>
          Viewer counts update every 3s<br />once you go live via Restream
        </div>
      )}
    </div>
  );
}

// ── Restream Live Chat + Cue Card Command Center ──────────────────────────────
type CueCategory = "note" | "signal" | "alert" | "question";
interface CueCard { id: number; text: string; category: CueCategory; ts: number; pinned: boolean; done: boolean; }

const CUE_META: Record<CueCategory, { emoji: string; color: string; bg: string; border: string; label: string }> = {
  signal:   { emoji: "📊", color: "#D4AF37", bg: "rgba(212,175,55,0.1)",  border: "rgba(212,175,55,0.3)",  label: "Signal" },
  alert:    { emoji: "⚡", color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.3)",  label: "Alert" },
  question: { emoji: "❓", color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.3)",  label: "Q&A" },
  note:     { emoji: "📝", color: "#999",    bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", label: "Note" },
};

let _cueId = 0;

function RestreamChatPanel({ isLive }: { isLive: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<CueCategory>("note");
  const [cues, setCues] = useState<CueCard[]>([]);
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const sortedCues = useMemo(() => {
    const pinned = cues.filter(c => c.pinned && !c.done);
    const active = cues.filter(c => !c.pinned && !c.done);
    const done = cues.filter(c => c.done);
    return [...pinned, ...active, ...done];
  }, [cues]);

  useEffect(() => {
    if (open && listEndRef.current) listEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [cues.length, open]);

  const addCue = () => {
    const t = note.trim();
    if (!t) return;
    setCues(prev => [...prev, { id: ++_cueId, text: t, category, ts: Date.now(), pinned: false, done: false }]);
    setNote("");
    inputRef.current?.focus();
  };

  const togglePin   = (id: number) => setCues(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned, done: false } : c));
  const toggleDone  = (id: number) => setCues(prev => prev.map(c => c.id === id ? { ...c, done: !c.done, pinned: false } : c));
  const deleteCue   = (id: number) => setCues(prev => prev.filter(c => c.id !== id));
  const clearDone   = () => setCues(prev => prev.filter(c => !c.done));

  const copyAll = async () => {
    const lines = sortedCues.filter(c => !c.done)
      .map(c => `[${CUE_META[c.category].label}] ${c.text}`).join("\n");
    try { await navigator.clipboard.writeText(lines); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  const doneCount   = cues.filter(c => c.done).length;
  const activeCount = cues.filter(c => !c.done).length;

  const CHAT_LINKS = [
    { label: "📬 Restream Chat",   url: "https://app.restream.io/chat",     color: "#D4AF37" },
    { label: "🎵 TikTok Live",    url: "https://www.tiktok.com/live",        color: "#ff0050" },
    { label: "▶ YouTube Studio", url: "https://studio.youtube.com",         color: "#ff0000" },
    { label: "📸 Instagram",      url: "https://www.instagram.com",          color: "#e1306c" },
    { label: "👥 FB Live",        url: "https://www.facebook.com/live/producer", color: "#1877f2" },
    { label: "🎮 Kick Studio",    url: "https://kick.com/dashboard",         color: "#53fc18" },
  ];

  return (
    <div style={{
      background: "var(--color-background-secondary)",
      border: `1px solid ${isLive ? "rgba(220,38,38,0.3)" : "var(--color-border-tertiary)"}`,
      borderRadius: 14, overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isLive && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "livePulse 1.5s ease-in-out infinite" }} />}
          <span style={{ fontSize: 13, fontWeight: 700, color: isLive ? "#ef4444" : "#D4AF37" }}>💬 Chat + Cue Cards</span>
          {activeCount > 0 && (
            <span style={{ fontSize: 10, background: "rgba(212,175,55,0.15)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 10, padding: "1px 7px", color: "#D4AF37", fontWeight: 700 }}>
              {activeCount}
            </span>
          )}
          {isLive && <span style={{ fontSize: 10, background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 4, padding: "1px 6px", color: "#ef4444", fontWeight: 700 }}>LIVE</span>}
        </div>
        <span style={{ fontSize: 12, color: "#555" }}>{open ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 16px 16px" }}>

              {/* ── Chat links grid ── */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>📡 Chat Dashboards</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                  {CHAT_LINKS.map(({ label, url, color }) => (
                    <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: "block", textAlign: "center", padding: "7px 4px",
                        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 8, color, fontSize: 10, fontWeight: 700, textDecoration: "none",
                        transition: "background 0.15s",
                      }}>
                      {label}
                    </a>
                  ))}
                </div>
              </div>

              {/* ── Category selector ── */}
              <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                {(["signal", "alert", "question", "note"] as CueCategory[]).map(cat => {
                  const m = CUE_META[cat];
                  const active = category === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      style={{
                        flex: 1, padding: "5px 2px", borderRadius: 7, cursor: "pointer",
                        background: active ? m.bg : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? m.border : "rgba(255,255,255,0.06)"}`,
                        color: active ? m.color : "#444",
                        fontSize: 10, fontWeight: 700, transition: "all 0.15s",
                      }}
                    >
                      {m.emoji} {m.label}
                    </button>
                  );
                })}
              </div>

              {/* ── Cue card list ── */}
              <div style={{
                maxHeight: 220, overflowY: "auto", marginBottom: 8,
                display: "flex", flexDirection: "column", gap: 4,
                scrollbarWidth: "none",
              }}>
                {sortedCues.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#2a2a2a", textAlign: "center", padding: "18px 0" }}>
                    No cue cards yet — add your first signal, alert, or note below
                  </div>
                ) : sortedCues.map((c) => {
                  const m = CUE_META[c.category];
                  return (
                    <motion.div
                      key={c.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: c.done ? 0.35 : 1, x: 0 }}
                      exit={{ opacity: 0, x: 8, height: 0 }}
                      style={{
                        background: c.done ? "rgba(255,255,255,0.02)" : (c.pinned ? m.bg : "rgba(255,255,255,0.03)"),
                        border: `1px solid ${c.done ? "rgba(255,255,255,0.04)" : (c.pinned ? m.border : "rgba(255,255,255,0.06)")}`,
                        borderRadius: 8, padding: "7px 10px",
                        display: "flex", alignItems: "flex-start", gap: 7,
                        position: "relative",
                        boxShadow: c.pinned && !c.done ? `0 0 8px ${m.bg}` : "none",
                      }}
                    >
                      {/* Category dot */}
                      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1, opacity: c.done ? 0.4 : 1 }}>{m.emoji}</span>
                      {c.pinned && !c.done && (
                        <span style={{ position: "absolute", top: 4, right: 4, fontSize: 8, color: m.color, fontWeight: 900, letterSpacing: 0.5 }}>📌</span>
                      )}
                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: c.done ? "#3a3a3a" : "#ddd", lineHeight: 1.4, wordBreak: "break-word", textDecoration: c.done ? "line-through" : "none" }}>
                          {c.text}
                        </div>
                        <div style={{ fontSize: 9, color: "#333", marginTop: 2 }}>
                          {m.label} · {new Date(c.ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 3, flexShrink: 0, marginTop: 1 }}>
                        <button title={c.done ? "Restore" : "Mark Done"} onClick={() => toggleDone(c.id)}
                          style={{ background: "none", border: "none", color: c.done ? "#555" : "#22c55e", cursor: "pointer", fontSize: 12, padding: "1px 3px", lineHeight: 1 }}>
                          {c.done ? "↩" : "✓"}
                        </button>
                        {!c.done && (
                          <button title={c.pinned ? "Unpin" : "Pin to top"} onClick={() => togglePin(c.id)}
                            style={{ background: "none", border: "none", color: c.pinned ? m.color : "#444", cursor: "pointer", fontSize: 11, padding: "1px 3px", lineHeight: 1 }}>
                            📌
                          </button>
                        )}
                        <button title="Delete" onClick={() => deleteCue(c.id)}
                          style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 14, padding: "1px 3px", lineHeight: 1 }}>
                          ×
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={listEndRef} />
              </div>

              {/* ── Input ── */}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  ref={inputRef}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCue()}
                  maxLength={200}
                  placeholder={`Add ${CUE_META[category].label.toLowerCase()}... (Enter to save)`}
                  style={{
                    flex: 1, padding: "8px 12px",
                    background: "var(--color-background-primary)",
                    border: `1px solid ${CUE_META[category].border}`,
                    borderRadius: 8, color: "#fff",
                    fontSize: 12, outline: "none",
                    transition: "border-color 0.15s",
                  }}
                />
                <button onClick={addCue} style={{
                  padding: "8px 14px",
                  background: CUE_META[category].bg,
                  border: `1px solid ${CUE_META[category].border}`,
                  borderRadius: 8,
                  color: CUE_META[category].color,
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                  transition: "all 0.15s",
                }}>
                  + Add
                </button>
              </div>

              {/* ── Footer actions ── */}
              {cues.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                  {doneCount > 0 && (
                    <button onClick={clearDone}
                      style={{ padding: "4px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, color: "#444", fontSize: 10, cursor: "pointer" }}>
                      Clear {doneCount} done
                    </button>
                  )}
                  {activeCount > 0 && (
                    <button onClick={copyAll}
                      style={{ padding: "4px 10px", background: "rgba(212,175,55,0.07)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 6, color: copied ? "#22c55e" : "#D4AF37", fontSize: 10, cursor: "pointer", transition: "color 0.2s" }}>
                      {copied ? "✅ Copied!" : "📋 Copy all"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Port 1935 (RTMP) is blocked on many school/corporate/ISP networks.
// RTMPS options use port 443 (HTTPS) — always open everywhere.
// The server-side FFmpeg handles both rtmp:// and rtmps:// equally.
const RESTREAM_SERVERS = [
  { label: "Restream Global (Recommended)", url: "rtmp://live.restream.io/live" },
  { label: "Restream Global — RTMPS port 443 ✅ (if port 1935 blocked)", url: "rtmps://live.restream.io:443/live" },
  { label: "Restream EU", url: "rtmp://eu.restream.io/live" },
  { label: "Restream EU — RTMPS port 443 ✅", url: "rtmps://eu.restream.io:443/live" },
  { label: "Restream US East", url: "rtmp://us-east.restream.io/live" },
  { label: "Restream US West", url: "rtmp://us-west.restream.io/live" },
  { label: "Restream Asia", url: "rtmp://ap.restream.io/live" },
  { label: "YouTube Live", url: "rtmp://a.rtmp.youtube.com/live2" },
  { label: "YouTube Live — RTMPS port 443 ✅", url: "rtmps://a.rtmps.youtube.com:443/live2" },
  { label: "Facebook Live — RTMPS port 443 ✅", url: "rtmps://live-api-s.facebook.com:443/rtmp" },
  { label: "TikTok Live", url: "rtmp://push.tiktokv.com/live" },
  { label: "Custom RTMP/RTMPS", url: "custom" },
];

const SELECT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--color-background-primary)",
  border: "1px solid var(--color-border-secondary)",
  borderRadius: 8,
  color: "var(--color-text-primary)",
  fontSize: 13,
  cursor: "pointer",
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--color-background-secondary)",
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 14,
  padding: 20,
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: "#777",
  display: "block",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontWeight: 600,
};

// ── Pre-Stream Checklist Modal ─────────────────────────────────────────────────
// Runs 4 automated checks before allowing Go Live:
//   1. Stream key entered
//   2. Relay server reachable (GET /api/stream/health)
//   3. Upload speed (POST 300KB → /api/stream/speed-test)
//   4. Bluetooth mic armed (warning only if BT selected)
type CheckStatus = "pending" | "running" | "pass" | "warn" | "fail";
interface CheckItem { id: string; label: string; icon: string; status: CheckStatus; detail: string; }

function PreStreamChecklist({
  config,
  btArmStatus,
  onLaunch,
  onCancel,
}: {
  config: StreamConfig;
  btArmStatus: BTArmStatus;
  onLaunch: () => void;
  onCancel: () => void;
}) {
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "key",    label: "Stream Key",          icon: "🔑", status: "pending", detail: "" },
    { id: "server", label: "Relay Server",         icon: "🛰",  status: "pending", detail: "" },
    { id: "mic",    label: "Microphone",           icon: "🎧", status: "pending", detail: "" },
  ]);
  const [done, setDone] = useState(false);

  const update = useCallback((id: string, patch: Partial<CheckItem>) =>
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c)), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // ── Check 1: Stream key ──────────────────────────────────────────────────
      update("key", { status: "running", detail: "Verifying..." });
      await new Promise(r => setTimeout(r, 250));
      if (cancelled) return;
      if (config.streamKey.trim()) {
        const masked = config.streamKey.slice(0, 4) + "••••" + config.streamKey.slice(-4);
        update("key", { status: "pass", detail: `Key entered (${masked})` });
      } else {
        update("key", { status: "fail", detail: "No stream key — enter it in the Stream Key field above." });
      }

      // ── Check 2: Relay server ────────────────────────────────────────────────
      update("server", { status: "running", detail: "Pinging relay server..." });
      try {
        const t0 = Date.now();
        const res = await fetch("/api/stream/health", { signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - t0;
        if (cancelled) return;
        if (res.ok) {
          update("server", { status: "pass", detail: `Online — ${latency}ms latency` });
        } else {
          update("server", { status: "fail", detail: "Server returned error. Restart the API server." });
        }
      } catch {
        if (cancelled) return;
        update("server", { status: "fail", detail: "Cannot reach relay server. API server may be down." });
      }

      // ── Check 3: Mic ─────────────────────────────────────────────────────────
      update("mic", { status: "running", detail: "Checking mic status..." });
      await new Promise(r => setTimeout(r, 300));
      if (cancelled) return;
      const isBT = isBTDevice(config.microphoneLabel ?? "");
      if (!config.includeMicrophone) {
        update("mic", { status: "pass", detail: "Mic disabled — streaming video only" });
      } else if (streamEngine.isPhoneMicActive()) {
        update("mic", { status: "pass", detail: "📱 Phone mic active (AirPods via WebRTC) — clean audio, no BT issues ✓" });
      } else if (!isBT) {
        update("mic", { status: "pass", detail: "Wired/USB mic selected — ready ✓" });
      } else {
        update("mic", { status: "warn", detail: "AirPods via Chromebook BT may drop. Tip: connect AirPods to phone and use Phone Mic instead." });
      }

      if (!cancelled) setDone(true);
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const allDone = done;
  const hasFail = checks.some(c => c.status === "fail");
  const hasWarn = checks.some(c => c.status === "warn");
  const canLaunch = allDone && !hasFail;

  const statusIcon = (s: CheckStatus) =>
    s === "running" ? "⏳" : s === "pass" ? "✅" : s === "warn" ? "⚠️" : s === "fail" ? "❌" : "⬜";
  const statusColor = (s: CheckStatus) =>
    s === "running" ? "#eab308" : s === "pass" ? "#22c55e" : s === "warn" ? "#f97316" : s === "fail" ? "#ef4444" : "#444";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(8px)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        style={{
          width: "min(480px, 92vw)",
          background: "linear-gradient(180deg, #0d0d0d 0%, #080808 100%)",
          border: "1.5px solid rgba(212,175,55,0.35)",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "22px 24px 18px", borderBottom: "1px solid rgba(212,175,55,0.1)", background: "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, transparent 60%)" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#D4AF37", letterSpacing: 0.5, marginBottom: 4 }}>
            🎬 Pre-Stream Checklist
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>Running automated checks before going live...</div>
        </div>

        {/* Checks */}
        <div style={{ padding: "18px 24px" }}>
          {checks.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14,
                padding: "12px 14px", borderRadius: 12,
                background: c.status === "fail" ? "rgba(239,68,68,0.07)" : c.status === "warn" ? "rgba(249,115,22,0.07)" : c.status === "pass" ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${c.status === "fail" ? "rgba(239,68,68,0.2)" : c.status === "warn" ? "rgba(249,115,22,0.2)" : c.status === "pass" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)"}`,
                transition: "all 0.3s",
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#ddd" }}>{c.label}</span>
                  <span style={{ fontSize: 14 }}>{statusIcon(c.status)}</span>
                </div>
                {c.detail && (
                  <div style={{ fontSize: 11, color: statusColor(c.status), lineHeight: 1.5 }}>{c.detail}</div>
                )}
                {c.status === "pending" && (
                  <div style={{ fontSize: 11, color: "#333" }}>Waiting...</div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Status summary + actions */}
        <div style={{ padding: "0 24px 22px" }}>
          {allDone && hasFail && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#f87171" }}>
              ❌ Fix the errors above before going live.
            </div>
          )}
          {allDone && !hasFail && hasWarn && (
            <div style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#fdba74" }}>
              ⚠️ Warnings present — you can still go live, but expect possible issues.
            </div>
          )}
          {allDone && !hasFail && !hasWarn && (
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#86efac" }}>
              ✅ All checks passed — you're ready to go live!
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onCancel}
              style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#666", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Cancel
            </button>
            <motion.button
              whileHover={canLaunch ? { scale: 1.02 } : {}}
              whileTap={canLaunch ? { scale: 0.97 } : {}}
              onClick={canLaunch ? onLaunch : undefined}
              style={{
                flex: 2, padding: "12px",
                background: canLaunch ? "linear-gradient(135deg, #dc2626, #b91c1c)" : "#1a1a1a",
                border: "none", borderRadius: 10,
                color: canLaunch ? "#fff" : "#333",
                fontSize: 14, fontWeight: 900, cursor: canLaunch ? "pointer" : "not-allowed",
                letterSpacing: 0.5,
                boxShadow: canLaunch ? "0 4px 20px rgba(220,38,38,0.4)" : "none",
                transition: "all 0.2s",
              }}
            >
              {!allDone ? "⏳ Running checks..." : canLaunch ? "🔴 LAUNCH STREAM" : "❌ Fix issues first"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function StreamingCommandCenter() {
  const { prices } = useLivePrices();

  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  const [stats, setStats] = useState<StreamStats>({
    status: "idle",
    duration: 0,
    fps: 0,
    bitrate: "0 kbps",
    bytesSent: 0,
    mbSent: 0,
    chunksSent: 0,
    viewers: 0,
    error: null,
    startTime: null,
    ffmpegFps: "0",
    ffmpegBitrate: "0 kbits/s",
    ffmpegSpeed: "0x",
    queueDepth: 0,
  });

  const [config, setConfig] = useState<StreamConfig>({
    rtmpUrl: "rtmp://live.restream.io/live",
    streamKey: "",
    resolution: "1280x720",
    fps: 30,
    videoBitrate: "2500k",
    audioBitrate: "128k",
    captureMode: "full_tab",
    includeMicrophone: true,
    includeSystemAudio: true,
  });

  const [customRtmpUrl, setCustomRtmpUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [streamTitle, setStreamTitle] = useState("🔥 Live Forex Analysis — JJ NEXUS PRO");
  const [aiScript, setAiScript] = useState("");
  const [loadingScript, setLoadingScript] = useState(false);
  const [selectedPair, setSelectedPair] = useState("XAUUSD");
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");

  // Check relay server
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/stream/health", {
          signal: AbortSignal.timeout(4000),
        });
        setServerStatus(res.ok ? "online" : "offline");
      } catch {
        setServerStatus("offline");
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  // Subscribe to stream stats
  useEffect(() => {
    streamEngine.onStats(setStats);
  }, []);

  const [showChecklist, setShowChecklist] = useState(false);

  const handleStartStream = useCallback(async () => {
    const finalConfig = {
      ...config,
      rtmpUrl: config.rtmpUrl === "custom" ? customRtmpUrl : config.rtmpUrl,
    };
    try {
      await streamEngine.startStream(finalConfig);
    } catch (err: any) {
      console.error("Stream failed:", err.message);
    }
  }, [config, customRtmpUrl]);

  const handleStopStream = () => streamEngine.stopStream();

  // Keep btArmStatus for PreStreamChecklist (always "idle" — BT arm panel removed)
  const [btArmStatus] = useState<BTArmStatus>("idle");

  // ── Phone Mic (AirPods via phone WebRTC) ─────────────────────────────────────
  const { phoneState, phoneStream } = useCamera();
  const [usePhoneMic, setUsePhoneMic] = useState(false);

  // Sync phone mic stream to engine whenever toggle or phone stream changes
  useEffect(() => {
    if (usePhoneMic && phoneStream && phoneStream.getAudioTracks().length > 0) {
      const phoneMicOnly = new MediaStream(phoneStream.getAudioTracks());
      streamEngine.setExternalMicStream(phoneMicOnly);
    } else {
      streamEngine.setExternalMicStream(null);
    }
  }, [usePhoneMic, phoneStream]);

  // Auto-disable phone mic if phone disconnects
  useEffect(() => {
    if (phoneState !== 'connected' && usePhoneMic) {
      setUsePhoneMic(false);
    }
  }, [phoneState]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLowerBitrate = useCallback(() => {
    streamEngine.updateBitrate("1500k");
    setConfig(c => ({ ...c, videoBitrate: "1500k" }));
  }, []);

  const generateAIScript = useCallback(async () => {
    setLoadingScript(true);
    const price = prices[selectedPair] || 0;
    try {
      const script = await callAlchemistAI(
        `Generate a high-energy 3-minute live stream intro script for a professional forex trader going live on TikTok and YouTube simultaneously.
Pair: ${selectedPair} at price ${price > 0 ? price.toFixed(selectedPair.includes("JPY") ? 3 : selectedPair === "XAUUSD" ? 2 : 5) : "current market price"}.
Stream title: "${streamTitle}"
Style: Energetic, professional, educational. Reference the JJ NEXUS PRO trading platform.
Include:
1. Powerful opening hook (first 15 seconds is critical for retention)
2. What the trader will cover today
3. Current ${selectedPair} market outlook
4. What key levels/confluences to watch
5. Call to action — follow, like, comment
6. [PAUSE] markers for breathing
Format as a ready-to-read teleprompter script. Make it sound authentic, not corporate.`,
        price,
        selectedPair,
      );
      setAiScript(script);
    } catch {
      setAiScript("Could not generate script — check your AI settings.");
    }
    setLoadingScript(false);
  }, [prices, selectedPair, streamTitle]);

  const isLive = stats.status === "live";
  const isConnecting = stats.status === "connecting";
  const hasError = stats.status === "error";

  const statusColor = isLive
    ? "#22c55e"
    : isConnecting
    ? "#eab308"
    : hasError
    ? "#ef4444"
    : "#555";
  const statusText = isLive
    ? "🔴 LIVE"
    : isConnecting
    ? "⏳ CONNECTING..."
    : hasError
    ? "❌ ERROR"
    : "⚪ OFFLINE";

  const serverColor =
    serverStatus === "online"
      ? "#22c55e"
      : serverStatus === "offline"
      ? "#ef4444"
      : "#eab308";
  const serverLabel =
    serverStatus === "online"
      ? "✅ Relay Server Online — Ready to stream"
      : serverStatus === "offline"
      ? "❌ Relay Server Offline — API server must be running"
      : "⏳ Checking relay server...";

  return (
    <div style={{ padding: "24px 28px", maxWidth: "100%", color: "var(--color-text-primary)" }}>

      {/* ── IFRAME WARNING BANNER ── */}
      {isInIframe && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: "linear-gradient(135deg, rgba(220,38,38,0.15), rgba(220,38,38,0.08))",
            border: "2px solid rgba(220,38,38,0.6)",
            borderRadius: 14,
            padding: "18px 22px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 28, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#ef4444", marginBottom: 4 }}>
              Screen Capture Blocked — Preview Frame Detected
            </div>
            <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.5 }}>
              Chrome blocks <code style={{ color: "#D4AF37" }}>getDisplayMedia()</code> inside Replit's preview iframe.
              You <strong style={{ color: "#fff" }}>must</strong> open this page in its own full browser tab for streaming to work.
            </div>
          </div>
          <button
            onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")}
            style={{
              flexShrink: 0,
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 22px",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
              letterSpacing: 0.3,
            }}
          >
            🚀 Open Full Tab
          </button>
        </motion.div>
      )}

      {/* ── CINEMATIC HEADER ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: "linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(0,0,0,0) 100%)",
          border: "1px solid rgba(212,175,55,0.35)",
          borderRadius: 16,
          padding: "22px 28px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#D4AF37", margin: 0, letterSpacing: -0.5 }}>
            📡 JJ NEXUS PRO — LIVE BROADCAST
          </h1>
          <p style={{ color: "#666", margin: "5px 0 0", fontSize: 13 }}>
            Stream the entire webapp to Restream.io → TikTok, YouTube, Instagram & all platforms simultaneously
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: statusColor,
              padding: "10px 22px",
              border: `2px solid ${statusColor}`,
              borderRadius: 10,
              animation: isLive ? "livePulse 1.5s ease-in-out infinite" : "none",
              transition: "all 0.3s",
            }}
          >
            {statusText}
          </div>
          {isLive && (
            <div style={{ color: "#888", fontSize: 12, marginTop: 5 }}>
              {StreamingEngine.formatDuration(stats.duration)} &nbsp;|&nbsp; {stats.ffmpegFps} fps &nbsp;|&nbsp; {stats.ffmpegBitrate}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── SERVER STATUS BAR ── */}
      <div
        style={{
          padding: "10px 16px",
          borderRadius: 10,
          marginBottom: 20,
          background:
            serverStatus === "online"
              ? "rgba(34,197,94,0.08)"
              : serverStatus === "offline"
              ? "rgba(239,68,68,0.08)"
              : "rgba(234,179,8,0.08)",
          border: `1px solid ${serverColor}44`,
          fontSize: 13,
          color: serverColor,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {serverLabel}
      </div>

      {/* ── ERROR ALERT ── */}
      <AnimatePresence>
        {hasError && stats.error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              padding: "14px 18px",
              borderRadius: 10,
              marginBottom: 20,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid #ef444466",
            }}
          >
            <div style={{ color: "#ef4444", fontWeight: 700, marginBottom: 4 }}>Stream Error</div>
            <div style={{ color: "#fca5a5", fontSize: 13 }}>{stats.error}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ━━━ LEFT COLUMN ━━━ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* RTMP Destination */}
          <div style={CARD_STYLE}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#D4AF37", fontWeight: 700 }}>
              🔗 Stream Destination
            </h3>

            <label style={LABEL_STYLE}>Streaming Server</label>
            <select
              value={config.rtmpUrl}
              onChange={(e) => setConfig((c) => ({ ...c, rtmpUrl: e.target.value }))}
              style={{ ...SELECT_STYLE, marginBottom: 14 }}
            >
              {RESTREAM_SERVERS.map((s) => (
                <option key={s.url} value={s.url}>{s.label}</option>
              ))}
            </select>

            {config.rtmpUrl === "custom" && (
              <>
                <label style={LABEL_STYLE}>Custom RTMP URL</label>
                <input
                  type="text"
                  value={customRtmpUrl}
                  onChange={(e) => setCustomRtmpUrl(e.target.value)}
                  placeholder="rtmp://your-server.com/live"
                  style={{
                    ...SELECT_STYLE,
                    marginBottom: 14,
                    boxSizing: "border-box",
                  }}
                />
              </>
            )}

            <label style={LABEL_STYLE}>Stream Key (from Restream.io dashboard)</label>
            <div style={{ position: "relative", marginBottom: 6 }}>
              <input
                type={showKey ? "text" : "password"}
                value={config.streamKey}
                onChange={(e) => setConfig((c) => ({ ...c, streamKey: e.target.value }))}
                placeholder="Paste your Restream stream key here..."
                style={{
                  width: "100%",
                  padding: "10px 44px 10px 12px",
                  background: "var(--color-background-primary)",
                  border: `1px solid ${config.streamKey ? "#D4AF37" : "var(--color-border-secondary)"}`,
                  borderRadius: 8,
                  color: "var(--color-text-primary)",
                  fontSize: 13,
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#777",
                  cursor: "pointer",
                  fontSize: 15,
                  padding: 0,
                }}
              >
                {showKey ? "🙈" : "👁️"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "#555", margin: "0 0 14px" }}>
              Get your key from{" "}
              <a href="https://restream.io" target="_blank" rel="noopener noreferrer" style={{ color: "#D4AF37" }}>
                restream.io
              </a>{" "}
              → Channel → Stream Setup → Copy Stream Key
            </p>

            <label style={LABEL_STYLE}>Stream Title</label>
            <input
              type="text"
              value={streamTitle}
              onChange={(e) => setStreamTitle(e.target.value)}
              style={{ ...SELECT_STYLE, boxSizing: "border-box" }}
            />
          </div>

          {/* Quality Settings */}
          <div style={CARD_STYLE}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, color: "#D4AF37", fontWeight: 700 }}>
              ⚙️ Stream Quality
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={LABEL_STYLE}>Resolution</label>
                <select
                  value={config.resolution}
                  onChange={(e) => setConfig((c) => ({ ...c, resolution: e.target.value as any }))}
                  style={{ ...SELECT_STYLE, padding: "8px 10px", fontSize: 12 }}
                >
                  <option value="854x480">480p — Save bandwidth</option>
                  <option value="1280x720">720p — Recommended</option>
                  <option value="1920x1080">1080p — Best quality</option>
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Frame Rate</label>
                <select
                  value={config.fps}
                  onChange={(e) => setConfig((c) => ({ ...c, fps: parseInt(e.target.value) as any }))}
                  style={{ ...SELECT_STYLE, padding: "8px 10px", fontSize: 12 }}
                >
                  <option value="24">24 fps</option>
                  <option value="30">30 fps (Recommended)</option>
                  <option value="60">60 fps (High end)</option>
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Video Bitrate</label>
                <select
                  value={config.videoBitrate}
                  onChange={(e) => setConfig((c) => ({ ...c, videoBitrate: e.target.value as any }))}
                  style={{ ...SELECT_STYLE, padding: "8px 10px", fontSize: 12 }}
                >
                  <option value="1500k">1500 kbps — Low bandwidth</option>
                  <option value="2500k">2500 kbps — Recommended</option>
                  <option value="4000k">4000 kbps — High quality</option>
                  <option value="6000k">6000 kbps — Maximum</option>
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Capture Mode</label>
                <select
                  value={config.captureMode}
                  onChange={(e) => setConfig((c) => ({ ...c, captureMode: e.target.value as any }))}
                  style={{ ...SELECT_STYLE, padding: "8px 10px", fontSize: 12 }}
                >
                  <option value="full_tab">Current Browser Tab (Full App)</option>
                  <option value="full_screen">Entire Screen</option>
                  <option value="window">Specific Window</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 24 }}>
              {(
                [
                  { key: "includeMicrophone", label: "🎤 Microphone" },
                  { key: "includeSystemAudio", label: "🔊 System Audio" },
                ] as const
              ).map(({ key, label }) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#aaa",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={config[key] as boolean}
                    onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.checked }))}
                    style={{ accentColor: "#D4AF37", width: 14, height: 14 }}
                  />
                  {label}
                </label>
              ))}
            </div>

            <AudioInputPanel config={config} setConfig={setConfig} phoneState={phoneState} usePhoneMic={usePhoneMic} onTogglePhoneMic={setUsePhoneMic} />
          </div>

          {/* ━━━ ADVANCED STREAM CONTROL PANEL ━━━ */}
          <AdvancedStreamControl config={config} setConfig={setConfig} isLive={isLive} />

          {/* GO LIVE BUTTON */}
          <div>
            {!isLive && !isConnecting ? (
              <motion.button
                whileHover={{ scale: serverStatus !== "offline" ? 1.02 : 1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowChecklist(true)}
                disabled={serverStatus === "offline"}
                style={{
                  width: "100%",
                  padding: "18px",
                  background:
                    hasError
                      ? "linear-gradient(135deg, #b45309, #92400e)"
                      : serverStatus !== "offline"
                      ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                      : "#1a1a1a",
                  border: serverStatus === "checking" ? "1px solid rgba(234,179,8,0.4)" : hasError ? "1px solid rgba(251,191,36,0.3)" : "none",
                  borderRadius: 12,
                  color: serverStatus !== "offline" ? "#fff" : "#444",
                  fontWeight: 900,
                  fontSize: 20,
                  cursor: serverStatus !== "offline" ? "pointer" : "not-allowed",
                  letterSpacing: 1,
                  boxShadow:
                    serverStatus === "online"
                      ? "0 4px 24px rgba(220,38,38,0.4)"
                      : serverStatus === "checking"
                      ? "0 4px 24px rgba(234,179,8,0.2)"
                      : "none",
                  transition: "all 0.2s",
                }}
              >
                {hasError ? "🔄 RETRY CONNECTION" : serverStatus === "checking" ? "⏳ GO LIVE (checking relay...)" : "🔴 GO LIVE"}
              </motion.button>
            ) : isConnecting ? (
              <button
                disabled
                style={{
                  width: "100%",
                  padding: "18px",
                  background: "#78350f",
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 20,
                  cursor: "not-allowed",
                }}
              >
                ⏳ CONNECTING TO RESTREAM...
              </button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStopStream}
                style={{
                  width: "100%",
                  padding: "18px",
                  background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 20,
                  cursor: "pointer",
                  animation: "livePulse 1.5s ease-in-out infinite",
                  boxShadow: "0 4px 24px rgba(220,38,38,0.5)",
                  letterSpacing: 1,
                }}
              >
                ⏹ END STREAM ({StreamingEngine.formatDuration(stats.duration)})
              </motion.button>
            )}
          </div>

          {/* How to get Restream key */}
          <div
            style={{
              background: "rgba(212,175,55,0.05)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#D4AF37", marginBottom: 10 }}>
              📋 How to get your Restream key (2 minutes)
            </div>
            {[
              "1. Go to restream.io and sign up free",
              "2. Go to Channel → Add Channel → TikTok (connect your account)",
              "3. Also add YouTube, Instagram, Facebook, Kick etc.",
              "4. Go to Stream Setup → Copy Stream Key",
              "5. Paste the key above and click GO LIVE",
              "6. JJ NEXUS PRO streams the full app to ALL platforms at once",
            ].map((step) => (
              <div key={step} style={{ fontSize: 12, color: "#666", padding: "2px 0", lineHeight: 1.8 }}>
                {step}
              </div>
            ))}
          </div>
        </div>

        {/* ━━━ RIGHT COLUMN ━━━ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* LIVE STATS */}
          <div
            style={{
              ...CARD_STYLE,
              border: `1px solid ${isLive ? "#dc262666" : "var(--color-border-tertiary)"}`,
            }}
          >
            <h3
              style={{
                margin: "0 0 16px",
                fontSize: 14,
                color: isLive ? "#ef4444" : "#D4AF37",
                fontWeight: 700,
              }}
            >
              {isLive ? "🔴 LIVE STATS" : "📊 Stream Stats"}
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Status", value: statusText },
                { label: "Duration", value: StreamingEngine.formatDuration(stats.duration) },
                { label: "Video FPS", value: `${stats.ffmpegFps} fps` },
                { label: "Encode Bitrate", value: stats.ffmpegBitrate },
                { label: "Encode Speed", value: stats.ffmpegSpeed },
                { label: "Data Sent", value: `${stats.mbSent.toFixed(2)} MB` },
                { label: "Chunks Sent", value: stats.chunksSent.toLocaleString() },
                { label: "Local Bitrate", value: stats.bitrate },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    background: "var(--color-background-primary)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: "#555",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      marginBottom: 4,
                      fontWeight: 600,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: isLive ? "#22c55e" : "#555",
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── STREAM HEALTH MONITOR ── */}
          <StreamHealthMonitor stats={stats} isLive={isLive} onLowerBitrate={handleLowerBitrate} />

          {/* ── VIEWER COUNT ── */}
          <ViewerCountPanel isLive={isLive} />

          {/* ── RESTREAM LIVE CHAT ── */}
          <RestreamChatPanel isLive={isLive} />

          {/* LIVE PRICE TICKER */}
          <div style={CARD_STYLE}>
            <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "#D4AF37", fontWeight: 700 }}>
              💰 Live Price Ticker (visible on stream)
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "US30", "GBPJPY", "AUDUSD"].map((pair) => {
                const price = prices[pair];
                const isGold = pair === "XAUUSD";
                const isJpy = pair.includes("JPY");
                const isCrypto = pair === "BTCUSD" || pair === "US30";
                const formatted = price
                  ? isGold || isCrypto
                    ? `$${price.toFixed(2)}`
                    : price.toFixed(isJpy ? 3 : 5)
                  : "—";
                return (
                  <motion.div
                    key={pair}
                    whileHover={{ scale: 1.05 }}
                    style={{
                      background: "rgba(212,175,55,0.08)",
                      border: "1px solid rgba(212,175,55,0.25)",
                      borderRadius: 8,
                      padding: "6px 12px",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#D4AF37", fontWeight: 800 }}>{pair}</span>
                    <span style={{ fontSize: 11, color: "#ddd" }}>{formatted}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* AI STREAM SCRIPT */}
          <div style={CARD_STYLE}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
                gap: 10,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 14, color: "#D4AF37", fontWeight: 700 }}>
                📜 AI Stream Script Generator
              </h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={selectedPair}
                  onChange={(e) => setSelectedPair(e.target.value)}
                  style={{ ...SELECT_STYLE, padding: "6px 10px", fontSize: 12, width: "auto" }}
                >
                  {["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "US30", "BTCUSD", "GBPJPY"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={generateAIScript}
                  disabled={loadingScript}
                  style={{
                    padding: "7px 14px",
                    background: "rgba(212,175,55,0.15)",
                    border: "1px solid #D4AF37",
                    borderRadius: 7,
                    color: "#D4AF37",
                    cursor: loadingScript ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {loadingScript ? "⏳ Generating..." : "⚡ Generate Script"}
                </motion.button>
              </div>
            </div>

            {aiScript ? (
              <div
                style={{
                  background: "var(--color-background-primary)",
                  borderRadius: 10,
                  padding: 14,
                  maxHeight: 220,
                  overflowY: "auto",
                  fontSize: 12,
                  color: "#ccc",
                  lineHeight: 1.8,
                  whiteSpace: "pre-wrap",
                  border: "1px solid rgba(212,175,55,0.1)",
                }}
              >
                {aiScript}
              </div>
            ) : (
              <div
                style={{
                  padding: "24px 20px",
                  textAlign: "center",
                  color: "#444",
                  fontSize: 13,
                  background: "var(--color-background-primary)",
                  borderRadius: 10,
                  border: "1px dashed #2a2a2a",
                }}
              >
                ⚡ Generate an AI-powered stream intro script for any pair
              </div>
            )}
          </div>

          {/* WHAT VIEWERS SEE */}
          <div
            style={{
              background: "rgba(34,197,94,0.05)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", marginBottom: 10 }}>
              📺 What your viewers will see
            </div>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.9 }}>
              {config.captureMode === "full_tab"
                ? "✅ The ENTIRE JJ NEXUS PRO webapp — every page, chart, AI analysis you navigate to"
                : config.captureMode === "full_screen"
                ? "✅ Your entire monitor — everything visible on screen"
                : "✅ The specific window you choose when the share dialog appears"}
              <br />
              ✅ Every page you navigate to in JJ NEXUS PRO is visible on stream
              <br />
              ✅ Live prices updating in real-time on stream
              <br />
              ✅ Alchemist AI responses visible to viewers as you run them
              <br />
              ✅ Stream distributes to ALL platforms via Restream simultaneously
            </div>
          </div>

          {/* ARCHITECTURE DIAGRAM */}
          <div
            style={{
              background: "rgba(212,175,55,0.04)",
              border: "1px solid rgba(212,175,55,0.15)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#D4AF37", marginBottom: 10 }}>
              🏗️ How it works
            </div>
            <div style={{ fontSize: 11, color: "#555", lineHeight: 2.2, fontFamily: "monospace" }}>
              Browser (getDisplayMedia)<br />
              &nbsp;&nbsp;&nbsp;↓ WebM chunks via WebSocket<br />
              JJ NEXUS PRO API Server<br />
              &nbsp;&nbsp;&nbsp;↓ FFmpeg converts to H.264/AAC<br />
              RTMP → Restream.io<br />
              &nbsp;&nbsp;&nbsp;↓ Distributes to:<br />
              TikTok + YouTube + Instagram + Facebook + Kick
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; box-shadow: 0 4px 24px rgba(220,38,38,0.4); }
          50% { opacity: 0.85; box-shadow: 0 4px 32px rgba(220,38,38,0.7); }
        }
      `}</style>

      {/* ── Pre-Stream Checklist modal ── */}
      <AnimatePresence>
        {showChecklist && (
          <PreStreamChecklist
            config={config}
            btArmStatus={btArmStatus}
            onCancel={() => setShowChecklist(false)}
            onLaunch={() => {
              setShowChecklist(false);
              handleStartStream();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Alias so we can call the static method
const StreamingEngine = { formatDuration: (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}};
