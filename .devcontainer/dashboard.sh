#!/bin/bash

# Live stream health dashboard
LOGDIR="/tmp/jjnexus/logs"
CONFIG_FILE=".devcontainer/stream-config.json"

while true; do
  clear
  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║        JJ NEXUS PRO — CLOUD STREAM DASHBOARD         ║"
  echo "╠═══════════════════════════════════════════════════════╣"

  # System resources
  CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo "?")
  RAM=$(free -m 2>/dev/null | awk 'NR==2{printf "%.1f%%", $3*100/$2}' || echo "?")
  UPTIME=$(uptime -p 2>/dev/null || echo "?")

  echo "║  System: CPU ${CPU}% | RAM ${RAM} | ${UPTIME}"

  # FFmpeg status
  if pgrep -f ffmpeg > /dev/null; then
    FFMPEG_PID=$(pgrep -f ffmpeg | head -1)
    FFMPEG_UPTIME=$(ps -p $FFMPEG_PID -o etime= 2>/dev/null | tr -d ' ')
    echo "║  FFmpeg: ✅ RUNNING (PID: $FFMPEG_PID, uptime: $FFMPEG_UPTIME)"

    # Get last FFmpeg progress line
    LAST_PROGRESS=$(grep "frame=" $LOGDIR/ffmpeg.log 2>/dev/null | tail -1)
    if [ -n "$LAST_PROGRESS" ]; then
      FRAMES=$(echo $LAST_PROGRESS | grep -oP 'frame=\s*\K[0-9]+')
      FPS_VAL=$(echo $LAST_PROGRESS | grep -oP 'fps=\s*\K[0-9.]+')
      BITRATE=$(echo $LAST_PROGRESS | grep -oP 'bitrate=\s*\K[0-9.]+kbits/s')
      SPEED=$(echo $LAST_PROGRESS | grep -oP 'speed=\s*\K[0-9.]+x')
      echo "║  Stream: frames=$FRAMES fps=$FPS_VAL bitrate=$BITRATE speed=$SPEED"
    fi
  else
    echo "║  FFmpeg: ❌ NOT RUNNING"
  fi

  # Chrome status
  if pgrep -f google-chrome > /dev/null; then
    echo "║  Chrome: ✅ RUNNING"
  else
    echo "║  Chrome: ❌ NOT RUNNING"
  fi

  # Virtual display
  if xdpyinfo -display :99 &>/dev/null 2>&1; then
    echo "║  Display: ✅ :99 ACTIVE"
  else
    echo "║  Display: ❌ NOT RUNNING"
  fi

  # VNC
  if pgrep -f x11vnc > /dev/null; then
    echo "║  VNC: ✅ Running on port 5900"
    echo "║  noVNC: ✅ Browser control on port 6080"
  else
    echo "║  VNC: ❌ NOT RUNNING"
  fi

  # Restream config
  if [ -f "$CONFIG_FILE" ]; then
    JJNEXUS_URL=$(jq -r '.jjnexusUrl' $CONFIG_FILE 2>/dev/null)
    echo "║  App URL: $JJNEXUS_URL"
  else
    echo "║  Config: ❌ Not configured (run configure.sh)"
  fi

  echo "╠═══════════════════════════════════════════════════════╣"
  echo "║  Commands:                                            ║"
  echo "║  Start stable stream: bash .devcontainer/stable-stream.sh"
  echo "║  Configure:           bash .devcontainer/configure.sh"
  echo "║  Stop everything:     bash .devcontainer/stop.sh"
  echo "╚═══════════════════════════════════════════════════════╝"
  echo ""
  echo "Refreshing in 5 seconds... (Ctrl+C to exit dashboard)"

  sleep 5
done
