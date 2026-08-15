/**
 * AudioWaveformVisualizer
 *
 * Real-time microphone/audio monitoring for the Streaming Studio.
 * Uses Web Audio API AnalyserNode fed from the active MediaStream's audio
 * tracks — draws both a waveform line and frequency-bar spectrum on canvas.
 *
 * Props
 * ─────
 * stream       — the primary audio/video MediaStream (camera or screen share)
 * fallbackStream — secondary stream to try if primary has no audio tracks
 * compact      — if true, renders only the dB meter bar (for health-bar use)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, AlertTriangle, Volume2 } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const FFT_SIZE = 512;            // frequency resolution for bar spectrum
const WAVEFORM_FFT = 2048;       // time-domain resolution for waveform
const SMOOTHING = 0.7;           // AnalyserNode smoothing (0–1)
const PEAK_HOLD_MS = 2500;       // how long peak indicator holds
const CLIP_THRESHOLD_DB = -3;    // dB above this = clipping
const SILENCE_THRESHOLD_DB = -70; // dB below this = show "silence" indicator

// ── Helpers ───────────────────────────────────────────────────────────────────

function rmsToDb(rms: number): number {
  if (rms < 1e-10) return -Infinity;
  return 20 * Math.log10(rms);
}

function dbToNormalized(db: number, minDb = -70, maxDb = 0): number {
  return Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
}

function dbColor(db: number): string {
  if (db > CLIP_THRESHOLD_DB) return '#ef4444';        // red — clipping
  if (db > -12) return '#f59e0b';                      // amber — hot
  if (db > -24) return '#D4AF37';                      // gold — good
  return '#22c55e';                                    // green — quiet
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AudioState {
  db: number;
  peakDb: number;
  isClipping: boolean;
  isSilent: boolean;
  hasAudio: boolean;
}

interface Props {
  stream?: MediaStream | null;
  fallbackStream?: MediaStream | null;
  compact?: boolean;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AudioWaveformVisualizer({ stream, fallbackStream, compact = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const peakHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [audioState, setAudioState] = useState<AudioState>({
    db: -Infinity,
    peakDb: -Infinity,
    isClipping: false,
    isSilent: true,
    hasAudio: false,
  });

  // Track peak separately in a ref so draw loop reads it without stale closure
  const peakDbRef = useRef<number>(-Infinity);

  // ── Resolve active audio stream ────────────────────────────────────────────
  const resolveAudioStream = useCallback((): MediaStream | null => {
    for (const s of [stream, fallbackStream]) {
      if (s && s.getAudioTracks().some(t => t.readyState === 'live')) return s;
    }
    return null;
  }, [stream, fallbackStream]);

  // ── Setup / teardown AudioContext chain ───────────────────────────────────
  const setupAudio = useCallback((activeStream: MediaStream) => {
    // Tear down any prior chain
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();

    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      audioCtxRef.current = ctx;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;

    const source = ctx.createMediaStreamSource(activeStream);
    source.connect(analyser);

    analyserRef.current = analyser;
    sourceRef.current = source;

    setAudioState(prev => ({ ...prev, hasAudio: true }));
  }, []);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    peakDbRef.current = -Infinity;
    if (peakHoldTimer.current) clearTimeout(peakHoldTimer.current);
    setAudioState({ db: -Infinity, peakDb: -Infinity, isClipping: false, isSilent: true, hasAudio: false });
  }, []);

  // ── Connect / disconnect when stream changes ───────────────────────────────
  useEffect(() => {
    const active = resolveAudioStream();
    if (!active) {
      teardown();
      return;
    }
    setupAudio(active);
    return () => {
      cancelAnimationFrame(rafRef.current);
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
    };
  }, [stream, fallbackStream, resolveAudioStream, setupAudio, teardown]);

  // ── Draw loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      const ctx2d = canvas.getContext('2d');
      if (!analyser || !ctx2d) return;

      const W = canvas.width;
      const H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);

      // ── Background ──────────────────────────────────────────────────────
      ctx2d.fillStyle = 'rgba(0,0,0,0.85)';
      ctx2d.fillRect(0, 0, W, H);

      if (compact) {
        drawCompact(analyser, ctx2d, W, H);
      } else {
        drawFull(analyser, ctx2d, W, H);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [compact]);

  // ── Draw: compact meter (health bar) ──────────────────────────────────────
  function drawCompact(analyser: AnalyserNode, ctx: CanvasRenderingContext2D, W: number, H: number) {
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    // Calculate RMS from time-domain
    const timeDom = new Float32Array(WAVEFORM_FFT);
    analyser.fftSize = WAVEFORM_FFT;
    analyser.getFloatTimeDomainData(timeDom);
    analyser.fftSize = FFT_SIZE;

    let sum = 0;
    for (let i = 0; i < timeDom.length; i++) sum += timeDom[i] * timeDom[i];
    const rms = Math.sqrt(sum / timeDom.length);
    const db = rmsToDb(rms);

    updatePeak(db);
    updateState(db);

    // Level bar
    const normalized = dbToNormalized(db);
    const barW = (W - 4) * normalized;
    const barColor = dbColor(db);

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(0.6, '#D4AF37');
    grad.addColorStop(0.85, '#f59e0b');
    grad.addColorStop(1, '#ef4444');

    ctx.fillStyle = '#111';
    ctx.fillRect(2, 2, W - 4, H - 4);
    ctx.fillStyle = grad;
    ctx.fillRect(2, 2, barW, H - 4);

    // Peak marker
    if (peakDbRef.current > -Infinity) {
      const peakX = 2 + (W - 4) * dbToNormalized(peakDbRef.current);
      ctx.fillStyle = barColor;
      ctx.fillRect(peakX - 1, 0, 2, H);
    }

    // dB label
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(H * 0.55)}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(isFinite(db) ? `${db.toFixed(0)}dB` : '—', W - 4, H - 3);
  }

  // ── Draw: full visualizer (preview overlay) ────────────────────────────────
  function drawFull(analyser: AnalyserNode, ctx: CanvasRenderingContext2D, W: number, H: number) {
    const FREQ_H = Math.floor(H * 0.55);    // lower section: frequency bars
    const WAVE_H = H - FREQ_H;              // upper section: waveform

    // ── Waveform (time domain) ────────────────────────────────────────────
    const waveAnalyser = analyser;
    const prevFft = analyser.fftSize;
    waveAnalyser.fftSize = WAVEFORM_FFT;
    const waveData = new Float32Array(WAVEFORM_FFT);
    waveAnalyser.getFloatTimeDomainData(waveData);
    waveAnalyser.fftSize = prevFft;

    // RMS for dB
    let sum = 0;
    for (let i = 0; i < waveData.length; i++) sum += waveData[i] * waveData[i];
    const rms = Math.sqrt(sum / waveData.length);
    const db = rmsToDb(rms);
    updatePeak(db);
    updateState(db);

    const waveColor = dbColor(db);

    // Waveform background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, WAVE_H);

    // Waveform line
    const sliceW = W / WAVEFORM_FFT;
    ctx.beginPath();
    ctx.strokeStyle = waveColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = waveColor;
    ctx.shadowBlur = 4;
    for (let i = 0; i < WAVEFORM_FFT; i++) {
      const x = i * sliceW;
      const y = (waveData[i] * 0.5 + 0.5) * WAVE_H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Zero-line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, WAVE_H / 2);
    ctx.lineTo(W, WAVE_H / 2);
    ctx.stroke();

    // ── Frequency bars ────────────────────────────────────────────────────
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    const BAR_COUNT = Math.min(freqData.length, 64);
    const barW = W / BAR_COUNT;
    const gap = Math.max(1, barW * 0.12);

    for (let i = 0; i < BAR_COUNT; i++) {
      const v = freqData[i] / 255;
      const barH = v * FREQ_H;
      const x = i * barW;
      const y = WAVE_H + (FREQ_H - barH);

      // Gradient per bar based on level
      const hue = 45 - v * 45; // gold (45°) → red (0°) as level increases
      ctx.fillStyle = v > 0.85
        ? `rgba(239,68,68,${0.7 + v * 0.3})`
        : `hsla(${hue},100%,${40 + v * 30}%,${0.5 + v * 0.5})`;
      ctx.fillRect(x + gap / 2, y, barW - gap, barH);

      // Reflection
      ctx.fillStyle = `hsla(${hue},80%,40%,0.15)`;
      ctx.fillRect(x + gap / 2, WAVE_H + FREQ_H, barW - gap, -(barH * 0.2));
    }

    // Divider line
    ctx.strokeStyle = 'rgba(212,175,55,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, WAVE_H);
    ctx.lineTo(W, WAVE_H);
    ctx.stroke();

    // ── Level meter (right edge) ──────────────────────────────────────────
    const meterW = 6;
    const normalized = dbToNormalized(db);
    const meterH = normalized * H;
    const meterGrad = ctx.createLinearGradient(0, H, 0, 0);
    meterGrad.addColorStop(0, '#22c55e');
    meterGrad.addColorStop(0.65, '#D4AF37');
    meterGrad.addColorStop(0.85, '#f59e0b');
    meterGrad.addColorStop(1, '#ef4444');
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(W - meterW - 2, 0, meterW, H);
    ctx.fillStyle = meterGrad;
    ctx.fillRect(W - meterW - 2, H - meterH, meterW, meterH);

    // Peak tick on meter
    if (peakDbRef.current > -Infinity) {
      const peakY = H - dbToNormalized(peakDbRef.current) * H;
      ctx.fillStyle = dbColor(peakDbRef.current);
      ctx.fillRect(W - meterW - 2, peakY - 1, meterW, 2);
    }

    // ── dB label ─────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(4, H - 20, 58, 18);
    ctx.fillStyle = waveColor;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(isFinite(db) ? `${db.toFixed(1)} dB` : '– dB', 8, H - 6);

    // Peak label
    if (isFinite(peakDbRef.current)) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(68, H - 20, 64, 18);
      ctx.fillStyle = dbColor(peakDbRef.current);
      ctx.fillText(`PK ${peakDbRef.current.toFixed(1)}`, 72, H - 6);
    }
  }

  // ── Peak hold logic ────────────────────────────────────────────────────────
  function updatePeak(db: number) {
    if (db > peakDbRef.current) {
      peakDbRef.current = db;
      if (peakHoldTimer.current) clearTimeout(peakHoldTimer.current);
      peakHoldTimer.current = setTimeout(() => {
        peakDbRef.current = -Infinity;
      }, PEAK_HOLD_MS);
    }
  }

  // ── React state updates (throttled via rAF — no extra setState spam) ────────
  const lastStateUpdate = useRef(0);
  function updateState(db: number) {
    const now = performance.now();
    if (now - lastStateUpdate.current < 100) return; // 10 fps state updates
    lastStateUpdate.current = now;
    const isClipping = db > CLIP_THRESHOLD_DB;
    const isSilent = db < SILENCE_THRESHOLD_DB;
    setAudioState(prev => {
      if (prev.db === db && prev.isClipping === isClipping && prev.isSilent === isSilent) return prev;
      return { ...prev, db, peakDb: peakDbRef.current, isClipping, isSilent, hasAudio: true };
    });
  }

  // ── Render: compact (health bar) ──────────────────────────────────────────
  if (compact) {
    const { hasAudio, db, isClipping } = audioState;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {hasAudio
            ? <Mic className={`w-3.5 h-3.5 ${isClipping ? 'text-red-400 animate-pulse' : 'text-[var(--gold)]'}`} />
            : <MicOff className="w-3.5 h-3.5 text-gray-600" />
          }
          <span className="text-gray-400 text-xs">Audio:</span>
        </div>
        <div className="relative w-24 h-4 rounded overflow-hidden">
          <canvas
            ref={canvasRef}
            width={96}
            height={16}
            className="w-full h-full"
          />
        </div>
        <span className={`font-mono text-[10px] w-14 ${isClipping ? 'text-red-400' : 'text-gray-400'}`}>
          {hasAudio && isFinite(db) ? `${db.toFixed(1)}dB` : '—'}
        </span>
        {isClipping && (
          <span className="text-[9px] font-bold text-red-400 animate-pulse uppercase tracking-wider">CLIP</span>
        )}
      </div>
    );
  }

  // ── Render: full overlay ───────────────────────────────────────────────────
  const { hasAudio, isClipping, isSilent, db } = audioState;
  return (
    <div className="flex flex-col gap-0 w-full select-none">
      {/* Status bar above canvas */}
      <div className="flex items-center justify-between px-2 py-1 bg-black/90 border-t border-[rgba(212,175,55,0.2)]">
        <div className="flex items-center gap-1.5">
          {hasAudio ? (
            <Volume2 className={`w-3 h-3 ${isClipping ? 'text-red-400' : 'text-[var(--gold)]'}`} />
          ) : (
            <MicOff className="w-3 h-3 text-gray-600" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">
            Audio Monitor
          </span>
          {!hasAudio && (
            <span className="text-[9px] text-gray-600 font-mono">No mic detected</span>
          )}
          {hasAudio && isSilent && (
            <span className="text-[9px] text-gray-600 font-mono animate-pulse">Silence</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isClipping && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/50">
              <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
              <span className="text-[9px] font-black text-red-400 uppercase tracking-widest animate-pulse">CLIPPING</span>
            </div>
          )}
          <span className={`font-mono text-[10px] tabular-nums ${isClipping ? 'text-red-400' : 'text-[var(--gold)]'}`}>
            {hasAudio && isFinite(db) ? `${db.toFixed(1)} dB` : '— dB'}
          </span>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={80}
        className="w-full block"
        style={{ height: 80, imageRendering: 'pixelated' }}
      />
    </div>
  );
}
