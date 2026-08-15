#!/bin/bash

# ═══════════════════════════════════════════════════════
# JJ NEXUS PRO — STABLE STREAM WRAPPER
# Auto-restarts stream on any failure
# Designed for 2+ hour sessions
# ═══════════════════════════════════════════════════════

LOGDIR="/tmp/jjnexus/logs"
PGIDFILE="/tmp/jjnexus/stream.pgid"
mkdir -p $LOGDIR
MAX_RESTARTS=20
RESTART_COUNT=0
RESTART_DELAY=5
START_TIME=$(date +%s)

# Save our own process group ID so control-server can kill us reliably
echo $$ > /tmp/jjnexus/stream.pid
echo "$(ps -o pgid= -p $$ | tr -d ' ')" > "$PGIDFILE"

log() {
  echo "[$(date '+%H:%M:%S')] $1" | tee -a $LOGDIR/stable-stream.log
}

log "╔══════════════════════════════════════════════════╗"
log "║  JJ NEXUS PRO STABLE STREAM — AUTO-RECONNECT   ║"
log "║  PID=$$ PGID=$(cat $PGIDFILE)                    ║"
log "║  Will restart up to $MAX_RESTARTS times          ║"
log "╚══════════════════════════════════════════════════╝"

# Load config
CONFIG_FILE=".devcontainer/stream-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  log "❌ No stream config found. Run: bash .devcontainer/configure.sh first"
  exit 1
fi

RESTREAM_KEY=$(jq -r '.restreamKey' $CONFIG_FILE)
RTMP_URL=$(jq -r '.rtmpUrl' $CONFIG_FILE)
JJNEXUS_URL=$(jq -r '.jjnexusUrl' $CONFIG_FILE)
RESOLUTION=$(jq -r '.resolution // "1280x720"' $CONFIG_FILE)
FPS=$(jq -r '.fps // "24"' $CONFIG_FILE)
VIDEO_BITRATE=$(jq -r '.videoBitrate // "2000k"' $CONFIG_FILE)
AUDIO_BITRATE=$(jq -r '.audioBitrate // "128k"' $CONFIG_FILE)
WIDTH=$(echo $RESOLUTION | cut -d'x' -f1)
HEIGHT=$(echo $RESOLUTION | cut -d'x' -f2)

# Validate required config
if [ -z "$RESTREAM_KEY" ] || [ "$RESTREAM_KEY" = "null" ]; then
  log "❌ No Restream key in config — run bash .devcontainer/configure.sh"
  exit 1
fi
if [ -z "$RTMP_URL" ] || [ "$RTMP_URL" = "null" ]; then
  log "❌ No RTMP URL in config — run bash .devcontainer/configure.sh"
  exit 1
fi

FULL_RTMP="${RTMP_URL}/${RESTREAM_KEY}"

# ── Pure-bash arithmetic (no bc needed) ──────────────
FPS_INT=${FPS%.*}                              # strip decimals e.g. "24.0" → "24"
GOP=$(( FPS_INT * 2 ))                         # keyframe interval (2-second)
BITRATE_K=${VIDEO_BITRATE%k}                   # strip trailing k
BUFSIZE="$(( BITRATE_K * 2 ))k"               # buffer = 2x bitrate for smoother delivery

log "📋 Config: ${RESOLUTION}@${FPS_INT}fps | video=${VIDEO_BITRATE} audio=${AUDIO_BITRATE}"
log "📡 RTMP: ${RTMP_URL}/[key-hidden]"
log "🌐 App URL: ${JJNEXUS_URL}"

# ── Audio setup ──────────────────────────────────────
if pactl info &>/dev/null 2>&1; then
  if pactl list sources short 2>/dev/null | grep -q "jjnexus_mic"; then
    AUDIO_ARGS="-f pulse -thread_queue_size 256 -i jjnexus_mic"
    log "✅ Audio: PulseAudio (jjnexus_mic)"
  else
    AUDIO_ARGS="-f pulse -thread_queue_size 256 -i default"
    log "✅ Audio: PulseAudio (default)"
  fi
else
  AUDIO_ARGS="-f lavfi -thread_queue_size 256 -i anullsrc=r=44100:cl=stereo"
  log "⚠️  Audio: silent (PulseAudio not available)"
fi

# ── Ensure virtual display is running ───────────────
if ! xdpyinfo -display :99 &>/dev/null; then
  log "Starting virtual display..."
  bash .devcontainer/autostart.sh
  sleep 3
fi

# ── Open Chrome once — keep it running for entire session ──
pkill -f google-chrome 2>/dev/null || true
sleep 1
log "Opening JJ NEXUS PRO in cloud Chrome..."
DISPLAY=:99 google-chrome \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --disable-software-rasterizer \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-features=TranslateUI \
  --no-first-run \
  --no-default-browser-check \
  --window-size=${WIDTH},${HEIGHT} \
  --window-position=0,0 \
  --kiosk \
  --remote-debugging-port=9222 \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --app="$JJNEXUS_URL" \
  > $LOGDIR/chrome.log 2>&1 &
CHROME_PID=$!
log "Chrome started (PID: $CHROME_PID)"
sleep 8

# ── Remove any leftover stop flag ───────────────────
rm -f /tmp/jjnexus/stop.flag

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "▶ Stream loop starting — FFmpeg will connect to RTMP"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Stream loop ─────────────────────────────────────
while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do

  # Stop flag check
  if [ -f /tmp/jjnexus/stop.flag ]; then
    log "⏹ Stop flag detected — exiting cleanly"
    break
  fi

  STREAM_START=$(date +%s)
  log "▶ FFmpeg attempt $((RESTART_COUNT + 1))/$MAX_RESTARTS — connecting to Restream..."

  # ── THE FFMPEG COMMAND ───────────────────────────────
  # NOTE: -draw_mouse 1 makes the cursor visible on stream
  # NOTE: reconnect flags are NOT placed on FLV/RTMP output (they only work for HTTP inputs)
  # NOTE: For RTMP reconnect we rely on the restart loop instead
  DISPLAY=:99 ffmpeg \
    -loglevel info \
    -f x11grab \
      -framerate $FPS_INT \
      -thread_queue_size 512 \
      -draw_mouse 1 \
      -video_size ${WIDTH}x${HEIGHT} \
      -i :99.0+0,0 \
    $AUDIO_ARGS \
    -c:v libx264 \
    -preset veryfast \
    -tune zerolatency \
    -profile:v baseline \
    -level 3.1 \
    -pix_fmt yuv420p \
    -b:v $VIDEO_BITRATE \
    -maxrate $VIDEO_BITRATE \
    -bufsize $BUFSIZE \
    -g $GOP \
    -keyint_min $FPS_INT \
    -sc_threshold 0 \
    -r $FPS_INT \
    -c:a aac \
    -b:a $AUDIO_BITRATE \
    -ar 44100 \
    -ac 2 \
    -af "aresample=async=1:first_pts=0,volume=1.5" \
    -f flv \
    -flvflags no_duration_filesize \
    "$FULL_RTMP" \
    2>&1 | tee -a $LOGDIR/ffmpeg.log
  # ─────────────────────────────────────────────────────

  EXIT_CODE=$?
  STREAM_END=$(date +%s)
  DURATION=$((STREAM_END - STREAM_START))

  log "FFmpeg exited (code=$EXIT_CODE, ran for ${DURATION}s)"

  # Show last FFmpeg error lines
  if [ $EXIT_CODE -ne 0 ]; then
    log "--- Last FFmpeg output ---"
    tail -5 $LOGDIR/ffmpeg.log | while IFS= read -r line; do log "  $line"; done
    log "-------------------------"
  fi

  # Check stop flag again before restart decision
  if [ -f /tmp/jjnexus/stop.flag ]; then
    log "⏹ Stop flag set — not restarting"
    break
  fi

  # If stream ran >30s it was healthy — reset counter
  if [ $DURATION -gt 30 ]; then
    log "✅ Healthy run — resetting restart counter"
    RESTART_COUNT=0
  else
    RESTART_COUNT=$((RESTART_COUNT + 1))
    log "⚠️  Short run — restart $RESTART_COUNT/$MAX_RESTARTS"
  fi

  # Check Chrome is still alive
  if ! kill -0 $CHROME_PID 2>/dev/null; then
    log "Chrome crashed — restarting..."
    DISPLAY=:99 google-chrome \
      --no-sandbox --disable-dev-shm-usage --disable-gpu \
      --no-first-run --window-size=${WIDTH},${HEIGHT} --window-position=0,0 \
      --kiosk --remote-debugging-port=9222 \
      --autoplay-policy=no-user-gesture-required \
      --use-fake-ui-for-media-stream \
      --app="$JJNEXUS_URL" \
      > $LOGDIR/chrome.log 2>&1 &
    CHROME_PID=$!
    log "Chrome restarted (PID: $CHROME_PID)"
    sleep 5
  fi

  if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
    log "❌ Max restarts reached — stopping"
    break
  fi

  log "Restarting in ${RESTART_DELAY}s..."
  sleep $RESTART_DELAY
done

log "Stable stream session ended — cleaning up"
pkill -f google-chrome 2>/dev/null || true
rm -f /tmp/jjnexus/stream.pid /tmp/jjnexus/stream.pgid
