// ═══════════════════════════════════════════════════════════════════════════════
// BrowserStreamEngine — File-Based Segment Relay Architecture
//
// Instead of piping raw MediaRecorder bytes to FFmpeg stdin (which causes
// WebM header-corruption on chunk boundaries), this engine:
//   1. Records 1-second MediaRecorder segments (independently decodable blobs)
//   2. Sends each blob as a binary WebSocket message to the server
//   3. Server writes each blob to a numbered .webm file
//   4. Server uses FFmpeg concat demuxer to relay them continuously to RTMP
//
// All BT arm, phone mic, audio device enumeration, and audio mixing APIs are
// preserved for compatibility with StreamingCommandCenter.tsx
// ═══════════════════════════════════════════════════════════════════════════════

export interface StreamConfig {
  rtmpUrl: string;
  streamKey: string;
  resolution: "1280x720" | "1920x1080" | "854x480";
  fps: 30 | 60 | 24;
  videoBitrate: "1500k" | "2500k" | "4000k" | "6000k";
  audioBitrate: "128k" | "192k";
  captureMode: "full_tab" | "full_screen" | "window";
  includeMicrophone: boolean;
  includeSystemAudio: boolean;
  microphoneDeviceId?: string;
  microphoneLabel?: string;
  micGainBoost?: number;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
  isBluetooth: boolean;
}

const BT_PATTERN = /bluetooth|bt |airpod|earbud|headset|wireless|jabra|sony|bose|sennheiser|plantronics|jbl|beats|galaxy bud|anker|soundcore|wh-[0-9]+|h[0-9]{3,}|wb-[0-9]+/i;

export function isBTDevice(label: string): boolean {
  return BT_PATTERN.test(label ?? "");
}

export async function enumerateAudioInputs(): Promise<AudioDevice[]> {
  try {
    let alreadyGranted = false;
    try {
      const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
      alreadyGranted = perm.state === "granted";
    } catch {}

    if (!alreadyGranted) {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => null);
      tmp?.getTracks().forEach(t => t.stop());
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === "audioinput")
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`,
        isBluetooth: BT_PATTERN.test(d.label),
      }));
  } catch {
    return [];
  }
}

export interface StreamStats {
  status: "idle" | "connecting" | "live" | "error" | "stopped";
  duration: number;
  fps: number;
  bitrate: string;
  bytesSent: number;
  mbSent: number;
  chunksSent: number;
  viewers: number;
  error: string | null;
  startTime: Date | null;
  ffmpegFps: string;
  ffmpegBitrate: string;
  ffmpegSpeed: string;
  queueDepth: number;
}

export type BTArmStatus = "idle" | "arming" | "armed" | "error";

type StatsCallback = (stats: StreamStats) => void;

export class BrowserStreamEngine {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private displayStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private combinedStream: MediaStream | null = null;
  private sessionId: string | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private onStatsUpdate: StatsCallback | null = null;
  private config: StreamConfig | null = null;
  private audioCtx: AudioContext | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private micGainNode: GainNode | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;

  // ── Bluetooth Pre-Arm ──────────────────────────────────────────────────────
  private armedMicStream: MediaStream | null = null;
  private armedMicAudioCtx: AudioContext | null = null;
  private armedTrackLabel: string | null = null;

  // ── Phone WebRTC mic (AirPods via phone) ──────────────────────────────────
  private externalMicStream: MediaStream | null = null;

  private stats: StreamStats = {
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
    ffmpegBitrate: "0",
    ffmpegSpeed: "0x",
    queueDepth: 0,
  };

  onStats(callback: StatsCallback) {
    this.onStatsUpdate = callback;
  }

  private updateStats(partial: Partial<StreamStats>) {
    this.stats = { ...this.stats, ...partial };
    this.onStatsUpdate?.(this.stats);
  }

  getStats(): StreamStats {
    return { ...this.stats };
  }

  private isChromeOS(): boolean {
    return /CrOS/.test(navigator.userAgent);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BLUETOOTH PRE-ARM — forces OS BT profile switch (A2DP → HFP) before Go Live
  // ═══════════════════════════════════════════════════════════════════════════
  async armBluetoothMic(deviceId?: string, deviceLabel?: string): Promise<BTArmStatus> {
    this.releaseArmedMic();
    this.armedTrackLabel = null;

    const isBT = BT_PATTERN.test(deviceLabel ?? "");
    if (!isBT) return "idle";

    const useChromeOSMode = this.isChromeOS();
    console.log(`[BT-Arm] Arming (${useChromeOSMode ? "ChromeOS" : "non-ChromeOS"}): "${deviceLabel}" id=${deviceId?.slice(0, 8)}…`);

    const constraintSets: MediaTrackConstraints[] = [];
    if (deviceId && deviceId !== "default") {
      constraintSets.push({ deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
      constraintSets.push({ deviceId: { ideal: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    }
    constraintSets.push({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });

    const MAX_OUTER = useChromeOSMode ? 3 : 1;
    const RECONNECT_WAIT_MS = 12000;

    for (let attempt = 1; attempt <= MAX_OUTER; attempt++) {
      console.log(`[BT-Arm] Outer attempt ${attempt}/${MAX_OUTER}…`);

      for (let ci = 0; ci < constraintSets.length; ci++) {
        const tag = ci === 0 ? "exact-id" : ci === 1 ? "ideal-id" : "system-default";
        try {
          console.log(`[BT-Arm]   Trying ${tag}…`);
          const stream = await navigator.mediaDevices.getUserMedia({ audio: constraintSets[ci], video: false });
          return this._keepArmedStream(stream, deviceLabel);
        } catch (e: any) {
          console.warn(`[BT-Arm]   ${tag} failed: ${e.name}`);
        }
      }

      if (useChromeOSMode && attempt < MAX_OUTER) {
        console.log(`[BT-Arm] Waiting up to ${RECONNECT_WAIT_MS / 1000}s for devicechange…`);
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = async (reason: string) => {
            if (settled) return;
            settled = true;
            navigator.mediaDevices.removeEventListener("devicechange", onChange);
            clearTimeout(timer);
            if (reason === "devicechange") await new Promise(r => setTimeout(r, 900));
            resolve();
          };
          const onChange = async () => {
            try {
              const devs = await navigator.mediaDevices.enumerateDevices();
              if (devs.some(d => d.kind === "audioinput")) {
                console.log("[BT-Arm] devicechange: audio input appeared — retrying");
                done("devicechange");
              }
            } catch {}
          };
          const timer = setTimeout(() => done("timeout"), RECONNECT_WAIT_MS);
          navigator.mediaDevices.addEventListener("devicechange", onChange);
        });
      }
    }

    console.error("[BT-Arm] ❌ All attempts exhausted");
    this.armedMicStream = null;
    return "error";
  }

  getArmedTrackLabel(): string | null {
    return this.armedTrackLabel;
  }

  private _keepArmedStream(stream: MediaStream, expectedLabel?: string): BTArmStatus {
    this.armedMicStream = stream;
    const track = stream.getAudioTracks()[0];
    const rawLabel = track?.label ?? "unknown";

    const gotBuiltIn = /built.?in|internal|integrated/i.test(rawLabel);
    const gotBT = BT_PATTERN.test(rawLabel);
    if (expectedLabel && gotBuiltIn && !gotBT) {
      console.warn(`[BT-Arm] ⚠️ Got built-in mic "${rawLabel}" — AirPods may not support mic on this Chromebook`);
      this.armedTrackLabel = `⚠️ Built-in mic (not AirPods) — see Chromebook setup guide below`;
    } else {
      this.armedTrackLabel = rawLabel;
    }

    console.log(`[BT-Arm] ✅ Armed — "${rawLabel}"`);

    try {
      const keepCtx = new AudioContext({ latencyHint: "playback" });
      keepCtx.createMediaStreamSource(stream).connect(keepCtx.createMediaStreamDestination());
      this.armedMicAudioCtx = keepCtx;
    } catch (ctxErr) {
      console.warn("[BT-Arm] AudioContext keeper failed:", ctxErr);
    }

    track?.addEventListener("ended", () => {
      console.warn("[BT-Arm] Armed mic track ended — BT may have disconnected");
      this.armedMicAudioCtx?.close().catch(() => {});
      this.armedMicAudioCtx = null;
      this.armedMicStream = null;
    });

    return "armed";
  }

  isArmed(): boolean {
    return !!(this.armedMicStream && this.armedMicStream.getTracks().some(t => t.readyState === "live"));
  }

  releaseArmedMic(): void {
    this.armedMicAudioCtx?.close().catch(() => {});
    this.armedMicAudioCtx = null;
    this.armedTrackLabel = null;
    if (this.armedMicStream) {
      this.armedMicStream.getTracks().forEach(t => t.stop());
      this.armedMicStream = null;
      console.log("[BT-Arm] Released armed mic stream + AudioContext keeper");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHONE MIC (AirPods via phone WebRTC) — zero BT negotiation risk
  // ═══════════════════════════════════════════════════════════════════════════
  setExternalMicStream(stream: MediaStream | null): void {
    this.externalMicStream = stream;
    if (stream) {
      const track = stream.getAudioTracks()[0];
      console.log(`[BrowserStreamEngine] 📱 Phone mic set: "${track?.label || "phone audio"}"`);
    } else {
      console.log("[BrowserStreamEngine] 📱 Phone mic cleared");
    }
  }

  isPhoneMicActive(): boolean {
    if (!this.externalMicStream) return false;
    const tracks = this.externalMicStream.getAudioTracks();
    return tracks.length > 0 && tracks[0].readyState === "live";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET URL RESOLUTION — Replit-aware
  // ═══════════════════════════════════════════════════════════════════════════
  private getRelayUrls(): string[] {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const port = window.location.port;

    // Replit dev: use same-origin via Vite proxy — direct -8080- WS returns 502
    if (host.includes(".replit.dev")) {
      const sameOrigin = port ? `${host}:${port}` : host;
      return [`${protocol}//${sameOrigin}/api/stream/ws`];
    }

    const origin = port ? `${host}:${port}` : host;
    return [`${protocol}//${origin}/api/stream/ws`];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN CAPTURE
  // ═══════════════════════════════════════════════════════════════════════════
  async captureScreen(config: StreamConfig): Promise<MediaStream> {
    const [width, height] = config.resolution.split("x").map(Number);
    const displayMediaOptions: any = {
      video: {
        width: { ideal: width, max: 1920 },
        height: { ideal: height, max: 1080 },
        frameRate: { ideal: config.fps, max: 60 },
        cursor: "always",
      },
      audio: config.includeSystemAudio
        ? { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 }
        : false,
    };

    if (config.captureMode === "full_tab") {
      displayMediaOptions.preferCurrentTab = true;
      displayMediaOptions.selfBrowserSurface = "include";
      displayMediaOptions.surfaceSwitching = "exclude";
      displayMediaOptions.video.displaySurface = "browser";
    } else if (config.captureMode === "full_screen") {
      displayMediaOptions.video.displaySurface = "monitor";
      displayMediaOptions.surfaceSwitching = "exclude";
    } else {
      displayMediaOptions.video.displaySurface = "window";
      displayMediaOptions.surfaceSwitching = "exclude";
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    this.displayStream = displayStream;

    displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      console.log("[BrowserStreamEngine] Screen share stopped by user");
      this.stopStream();
    });

    return displayStream;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MICROPHONE CAPTURE — priority: phone WebRTC → pre-armed BT → getUserMedia
  // ═══════════════════════════════════════════════════════════════════════════
  async captureMicrophone(deviceId?: string, deviceLabel?: string): Promise<MediaStream | null> {
    // Fastest path: phone WebRTC mic (AirPods on phone — zero BT disconnect risk)
    if (this.externalMicStream) {
      const tracks = this.externalMicStream.getAudioTracks();
      if (tracks.length > 0 && tracks[0].readyState === "live") {
        console.log(`[BrowserStreamEngine] 📱 Using phone mic: "${tracks[0].label}"`);
        const phoneMic = new MediaStream(tracks);
        this.micStream = phoneMic;
        tracks[0].addEventListener("ended", () => {
          console.warn("[BrowserStreamEngine] ⚠️ Phone mic track ended");
        });
        return phoneMic;
      }
    }

    // Fast path: pre-armed Bluetooth stream
    if (this.isArmed()) {
      console.log("[BrowserStreamEngine] ✅ Using pre-armed Bluetooth mic");
      this.armedMicAudioCtx?.close().catch(() => {});
      this.armedMicAudioCtx = null;
      const armed = this.armedMicStream!;
      this.micStream = armed;
      this.armedMicStream = null;

      armed.getAudioTracks()[0]?.addEventListener("ended", () => {
        console.warn("[BrowserStreamEngine] ⚠️ BT mic track ended mid-stream — attempting hot-reconnect");
        if (this.stats.status === "live" && this.config?.includeMicrophone) {
          this.reacquireMic();
        }
      });
      return armed;
    }

    // Slow path: fresh getUserMedia capture
    const isLikelyBluetooth = BT_PATTERN.test(deviceLabel ?? "");
    const useChromeOSMode = this.isChromeOS();

    type AudioC = MediaStreamConstraints["audio"];
    const constraintSets: AudioC[] = [];

    if (isLikelyBluetooth && useChromeOSMode) {
      constraintSets.push({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
      constraintSets.push(true);
    } else if (isLikelyBluetooth && !useChromeOSMode) {
      if (deviceId && deviceId !== "default") {
        constraintSets.push({ deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
        constraintSets.push({ deviceId: { ideal: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
      }
      constraintSets.push({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
      constraintSets.push(true);
    } else {
      if (deviceId && deviceId !== "default") {
        constraintSets.push({ deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 2 });
        constraintSets.push({ deviceId: { ideal: deviceId }, echoCancellation: true, noiseSuppression: true });
      }
      constraintSets.push({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 2 });
      constraintSets.push(true);
    }

    for (let i = 0; i < constraintSets.length; i++) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: constraintSets[i], video: false });
        this.micStream = micStream;
        const track = micStream.getAudioTracks()[0];
        const settings = track?.getSettings();
        console.log(`[BrowserStreamEngine] ✅ Mic — "${track?.label || "system default"}" | ${settings?.sampleRate}Hz`);

        track?.addEventListener("ended", () => {
          console.warn("[BrowserStreamEngine] ⚠️ Mic track ended — attempting hot-reconnect");
          if (this.stats.status === "live" && this.config?.includeMicrophone) {
            this.reacquireMic();
          }
        });

        return micStream;
      } catch (e) {
        console.warn(`[BrowserStreamEngine] Mic attempt ${i + 1}/${constraintSets.length} failed:`, e);
      }
    }

    console.error("[BrowserStreamEngine] ❌ All mic capture attempts failed");
    return null;
  }

  private async reacquireMic(): Promise<void> {
    if (!this.config || !this.audioCtx || !this.audioDest || !this.micGainNode) return;
    try {
      await new Promise(r => setTimeout(r, 1200));
      const newMicStream = await this.captureMicrophone(
        this.config.microphoneDeviceId,
        this.config.microphoneLabel,
      );
      if (newMicStream) {
        this.micStream = newMicStream;
        const newSource = this.audioCtx.createMediaStreamSource(newMicStream);
        newSource.connect(this.micGainNode);
        console.log("[BrowserStreamEngine] ✅ Mic hot-reconnected");
      }
    } catch (e) {
      console.error("[BrowserStreamEngine] Hot mic reconnect failed:", e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAM MIXING — combine display + mic with Web Audio
  // ═══════════════════════════════════════════════════════════════════════════
  combineStreams(displayStream: MediaStream, micStream: MediaStream | null, micGainBoost?: number): MediaStream {
    const tracks: MediaStreamTrack[] = [];
    displayStream.getVideoTracks().forEach(t => tracks.push(t));

    const sysAudio = displayStream.getAudioTracks();

    if (micStream && sysAudio.length > 0) {
      const audioCtx = new AudioContext({ sampleRate: 44100, latencyHint: "playback" });
      this.audioCtx = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      this.audioDest = dest;

      const sysSource = audioCtx.createMediaStreamSource(new MediaStream(sysAudio));
      const sysGain = audioCtx.createGain();
      sysGain.gain.value = 1.0;
      sysSource.connect(sysGain);
      sysGain.connect(dest);

      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micGain = audioCtx.createGain();
      micGain.gain.value = typeof micGainBoost === "number" ? micGainBoost : 1.4;
      this.micGainNode = micGain;
      micSource.connect(micGain);
      micGain.connect(dest);

      tracks.push(...dest.stream.getAudioTracks());
    } else if (micStream) {
      const audioCtx = new AudioContext({ sampleRate: 44100, latencyHint: "playback" });
      this.audioCtx = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      this.audioDest = dest;

      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micGain = audioCtx.createGain();
      micGain.gain.value = typeof micGainBoost === "number" ? micGainBoost : 1.4;
      this.micGainNode = micGain;
      micSource.connect(micGain);
      micGain.connect(dest);

      tracks.push(...dest.stream.getAudioTracks());
    } else if (sysAudio.length > 0) {
      sysAudio.forEach(t => tracks.push(t));
    }

    return new MediaStream(tracks);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════
  private connectWS(): Promise<void> {
    return new Promise((resolve, reject) => {
      const urls = this.getRelayUrls();
      const url = urls[0];
      console.log(`[BrowserStreamEngine] Connecting WS: ${url}`);

      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket connection timed out (10s)"));
      }, 10000);

      ws.onopen = () => {
        console.log("[BrowserStreamEngine] ✅ WS connected");
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "connected") {
            clearTimeout(timeout);
            this.ws = ws;
            this.sessionId = msg.sessionId;
            resolve();
          }

          if (msg.type === "stream_buffering") {
            // Server is accumulating segments before first RTMP attempt — keep "connecting"
            console.log("[BrowserStreamEngine] Server buffering:", msg.message);
          }

          if (msg.type === "stream_starting" || msg.type === "stream_started") {
            this.updateStats({ status: "live", error: null });
            if (!this.durationTimer) {
              this.durationTimer = setInterval(() => {
                this.updateStats({ duration: this.stats.duration + 1 });
              }, 1000);
            }
          }

          if (msg.type === "ffmpeg_progress") {
            // Map server field names → client StreamStats fields
            this.updateStats({
              ffmpegFps: msg.fps ?? "0",
              ffmpegBitrate: msg.bitrate ?? "0kbits/s",
              ffmpegSpeed: msg.speed ?? "0x",
            });
          }

          if (msg.type === "stats") {
            // Legacy stats message from server
            this.updateStats({ queueDepth: msg.queueDepth ?? 0 });
          }

          if (msg.type === "error") {
            this.updateStats({ status: "error", error: msg.message });
            this.cleanup();
          }

          if (msg.type === "warning") {
            console.warn("[BrowserStreamEngine] Server warning:", msg.message);
          }

          if (msg.type === "stream_ended") {
            if (this.stats.status !== "stopped") {
              this.updateStats({ status: "stopped", error: null });
            }
          }

          if (msg.type === "stream_recovering") {
            console.log("[BrowserStreamEngine] Server auto-recovering FFmpeg...");
          }
        } catch {}
      };

      ws.onerror = (e) => {
        clearTimeout(timeout);
        console.error("[BrowserStreamEngine] WS error");
        reject(new Error("WebSocket connection failed"));
      };

      ws.onclose = () => {
        if (this.stats.status === "live") {
          this.updateStats({ status: "error", error: "Connection to server lost" });
          this.cleanup();
        }
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIARECORDER — 1-second segments, each sent as binary blob
  // Key advantage over stdin pipe: each segment is a self-contained WebM clip
  // that the server writes to disk and FFmpeg concat demuxer decodes independently
  // → no header-corruption, no moov-atom issues at chunk boundaries
  // ═══════════════════════════════════════════════════════════════════════════
  private startSegmentRecorder(): void {
    if (!this.combinedStream) return;

    // Choose best codec — prefer VP8 for widest compat with concat demuxer
    const mimeTypes = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
    ];
    const mime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || "";
    if (mime) console.log(`[BrowserStreamEngine] MediaRecorder codec: ${mime}`);

    const videoBitrate = parseInt(this.config!.videoBitrate) * 1000;
    const audioBitrate = parseInt(this.config!.audioBitrate) * 1000;

    try {
      this.mediaRecorder = new MediaRecorder(this.combinedStream, {
        mimeType: mime || undefined,
        videoBitsPerSecond: videoBitrate,
        audioBitsPerSecond: audioBitrate,
      });
    } catch {
      // Fallback: no constraints
      this.mediaRecorder = new MediaRecorder(this.combinedStream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 100 && this.ws?.readyState === WebSocket.OPEN) {
        // Convert blob to ArrayBuffer and send as binary WebSocket frame
        e.data.arrayBuffer().then(buf => {
          try {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(buf);
              this.updateStats({
                chunksSent: this.stats.chunksSent + 1,
                bytesSent: this.stats.bytesSent + buf.byteLength,
                mbSent: (this.stats.bytesSent + buf.byteLength) / 1024 / 1024,
                bitrate: `${Math.round(buf.byteLength * 8 / 1000)} kbps`,
              });
            }
          } catch (err) {
            console.error("[BrowserStreamEngine] Failed to send segment:", err);
          }
        }).catch(err => {
          console.error("[BrowserStreamEngine] arrayBuffer() failed:", err);
        });
      }
    };

    this.mediaRecorder.onerror = (e) => {
      console.error("[BrowserStreamEngine] MediaRecorder error:", e);
    };

    // 1-second segments — each blob is independently decodable by FFmpeg concat
    this.mediaRecorder.start(1000);
    console.log("[BrowserStreamEngine] ✅ MediaRecorder started (1s segments)");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // START STREAM — main entry point
  // ═══════════════════════════════════════════════════════════════════════════
  async startStream(config: StreamConfig): Promise<void> {
    this.config = config;
    this.updateStats({ status: "connecting", error: null, duration: 0, chunksSent: 0, bytesSent: 0, mbSent: 0 });

    if (!config.streamKey?.trim()) {
      this.updateStats({ status: "error", error: "Stream key is required" });
      throw new Error("No stream key provided");
    }

    // Health check — ensure server FFmpeg is available
    try {
      const health = await fetch("/api/stream/health").then(r => r.json()).catch(() => null);
      if (!health?.ffmpegAvailable) {
        const msg = "FFmpeg is not available on the server. Contact support.";
        this.updateStats({ status: "error", error: msg });
        throw new Error(msg);
      }
    } catch (e: any) {
      if (e.message.includes("FFmpeg")) throw e;
      // Network error — proceed optimistically
      console.warn("[BrowserStreamEngine] Health check failed (network?) — proceeding");
    }

    // 1. Screen capture (requires fresh user gesture — never auto-retry)
    let displayStream: MediaStream;
    try {
      displayStream = await this.captureScreen(config);
    } catch (e: any) {
      const msg = e.name === "NotAllowedError"
        ? "Screen share permission denied. Click 'Share' in the browser dialog."
        : `Screen capture failed: ${e.message}`;
      this.updateStats({ status: "error", error: msg });
      throw new Error(msg);
    }

    // 2. Microphone capture (optional — don't fail stream on mic error)
    let micStream: MediaStream | null = null;
    if (config.includeMicrophone) {
      micStream = await this.captureMicrophone(config.microphoneDeviceId, config.microphoneLabel).catch(() => null);
      if (!micStream) console.warn("[BrowserStreamEngine] No mic — streaming without audio input");
    }

    // 3. Combine display + mic
    this.combinedStream = this.combineStreams(displayStream, micStream, config.micGainBoost);

    // 4. Connect WebSocket to server relay
    await this.connectWS();

    // 5. Send init message (server combines rtmpUrl + streamKey into full RTMP URL)
    if (!this.ws) throw new Error("WebSocket not connected");
    this.ws.send(JSON.stringify({
      type: "init",
      rtmpUrl: config.rtmpUrl,
      streamKey: config.streamKey,
      videoBitrate: config.videoBitrate,
      audioBitrate: config.audioBitrate,
      fps: config.fps,
      resolution: config.resolution,
    }));

    // 6. Start recording + segment dispatch
    this.startSegmentRecorder();

    // Visibility handler — warn when tab is hidden (MediaRecorder may throttle)
    this.visibilityHandler = () => {
      if (document.hidden && this.stats.status === "live") {
        console.warn("[BrowserStreamEngine] Tab hidden — MediaRecorder may throttle, segments may arrive late");
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    // Keep-alive ping every 20s
    this.keepAliveTimer = setInterval(() => {
      try {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        }
      } catch {}
    }, 20000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STOP STREAM
  // ═══════════════════════════════════════════════════════════════════════════
  stopStream(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try { this.mediaRecorder.stop(); } catch {}
    }

    this.displayStream?.getTracks().forEach(t => t.stop());
    this.micStream?.getTracks().forEach(t => t.stop());
    this.audioCtx?.close().catch(() => {});

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "Stream stopped by user");
    }

    if (this.durationTimer) { clearInterval(this.durationTimer); this.durationTimer = null; }
    this.cleanup();
    this.updateStats({ status: "stopped" });
  }

  // ── Update video bitrate live (kills + respawns FFmpeg with new settings) ──
  updateBitrate(videoBitrate: string): void {
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: "bitrate_update",
          videoBitrate,
          audioBitrate: this.config?.audioBitrate,
          fps: this.config?.fps,
          resolution: this.config?.resolution,
        }));
      }
    } catch {}
  }

  private cleanup(): void {
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
    if (this.visibilityHandler) { document.removeEventListener("visibilitychange", this.visibilityHandler); this.visibilityHandler = null; }
    if (this.durationTimer) { clearInterval(this.durationTimer); this.durationTimer = null; }
    this.releaseArmedMic();
    this.mediaRecorder = null;
    this.displayStream = null;
    this.micStream = null;
    this.combinedStream = null;
    this.ws = null;
    this.sessionId = null;
    this.audioCtx = null;
    this.audioDest = null;
    this.micGainNode = null;
  }

  // ── Static utilities ──────────────────────────────────────────────────────
  static formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
  }

  static detectCodec(): { mimeType: string; codec: string } {
    const candidates = [
      { mimeType: "video/webm;codecs=vp8,opus", codec: "VP8" },
      { mimeType: "video/webm;codecs=vp9,opus", codec: "VP9" },
      { mimeType: "video/webm;codecs=h264,opus", codec: "H264" },
      { mimeType: "video/webm", codec: "auto" },
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    }
    return { mimeType: "", codec: "none" };
  }
}

export const streamEngine = new BrowserStreamEngine();
