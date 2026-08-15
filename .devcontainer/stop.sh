#!/bin/bash
# JJ NEXUS PRO — Hard stop: kills stream, Chrome, and the entire process group

echo "⏹ Stopping JJ NEXUS PRO stream..."

# 1. Write the sentinel so stable-stream.sh loop exits cleanly
echo "STOP" > /tmp/jjnexus/stop.flag

# 2. Kill by PGID if we have it (most reliable)
if [ -f /tmp/jjnexus/stream.pgid ]; then
  PGID=$(cat /tmp/jjnexus/stream.pgid)
  if [ -n "$PGID" ] && [ "$PGID" -gt 1 ] 2>/dev/null; then
    echo "Killing process group $PGID..."
    kill -TERM -- -$PGID 2>/dev/null || true
    sleep 2
    kill -9 -- -$PGID 2>/dev/null || true
  fi
fi

# 3. Belt-and-suspenders: kill by name too
pkill -TERM -f "stable-stream.sh" 2>/dev/null || true
pkill -TERM -f "ffmpeg" 2>/dev/null || true
sleep 1
pkill -9 -f "stable-stream.sh" 2>/dev/null || true
pkill -9 -f "ffmpeg" 2>/dev/null || true
pkill -9 -f "google-chrome" 2>/dev/null || true

# 4. Clean up PID files
rm -f /tmp/jjnexus/stream.pid /tmp/jjnexus/stream.pgid

echo "✅ Stream stopped. Virtual display and VNC still running."
echo "Run bash .devcontainer/stable-stream.sh to start again."
