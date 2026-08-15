#!/bin/bash

# ═══════════════════════════════════════════════
# JJ NEXUS PRO — CLOUD STREAM LAUNCHER (manual)
# Run this directly in the terminal to test.
# For the auto-restart wrapper use stable-stream.sh
# ═══════════════════════════════════════════════

LOGDIR="/tmp/jjnexus/logs"
mkdir -p $LOGDIR

# Load config
CONFIG_FILE=".devcontainer/stream-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ No stream config found. Run: bash .devcontainer/configure.sh first"
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

if [ -z "$RESTREAM_KEY" ] || [ "$RESTREAM_KEY" = "null" ]; then
  echo "❌ Restream key not configured. Run: bash .devcontainer/configure.sh"
  exit 1
fi

# Pure-bash arithmetic
FPS_INT=${FPS%.*}
GOP=$(( FPS_INT * 2 ))
BITRATE_K=${VIDEO_BITRATE%k}
BUFSIZE="$(( BITRATE_K * 2 ))k"

# Audio
if pactl info &>/dev/null 2>&1; then
  if pactl list sources short 2>/dev/null | grep -q "jjnexus_mic"; then
    AUDIO_ARGS="-f pulse -thread_queue_size 256 -i jjnexus_mic"
    echo "✅ Audio: PulseAudio (jjnexus_mic)"
  else
    AUDIO_ARGS="-f pulse -thread_queue_size 256 -i default"
    echo "✅ Audio: PulseAudio (default)"
  fi
else
  AUDIO_ARGS="-f lavfi -thread_queue_size 256 -i anullsrc=r=44100:cl=stereo"
  echo "⚠️  Audio: silent (PulseAudio not available)"
fi

echo "╔═══════════════════════════════════════════════╗"
echo "║  JJ NEXUS PRO — CLOUD STREAM STARTING        ║"
echo "╠═══════════════════════════════════════════════╣"
echo "║  Resolution: $RESOLUTION @ ${FPS_INT}fps"
echo "║  Video: $VIDEO_BITRATE | Audio: $AUDIO_BITRATE | GOP: $GOP"
echo "║  Destination: ${RTMP_URL}/[key]"
echo "║  JJ NEXUS URL: $JJNEXUS_URL"
echo "╚═══════════════════════════════════════════════╝"

# Ensure virtual display
if ! xdpyinfo -display :99 &>/dev/null; then
  echo "Starting virtual display..."
  bash .devcontainer/autostart.sh
  sleep 3
fi

# Open Chrome
pkill -f google-chrome 2>/dev/null || true
pkill -f ffmpeg 2>/dev/null || true
sleep 1

echo "Opening JJ NEXUS PRO in cloud Chrome..."
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
echo "✅ Chrome opened (PID: $CHROME_PID)"

echo "Waiting for JJ NEXUS PRO to load..."
sleep 8

echo ""
echo "▶ Starting FFmpeg — will appear on Restream in 5-10 seconds..."
echo "Press Ctrl+C to stop"
echo ""

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
  -af "aresample=async=1:first_pts=0" \
  -f flv \
  -flvflags no_duration_filesize \
  "${RTMP_URL}/${RESTREAM_KEY}" \
  2>&1 | tee $LOGDIR/ffmpeg.log

EXIT_CODE=$?
echo ""
echo "FFmpeg exited with code: $EXIT_CODE"
if [ $EXIT_CODE -ne 0 ]; then
  echo "Last FFmpeg error:"
  tail -20 $LOGDIR/ffmpeg.log
fi

pkill -f google-chrome 2>/dev/null || true
echo "Stream stopped."
