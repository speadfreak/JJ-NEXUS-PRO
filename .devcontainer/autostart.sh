#!/bin/bash
# Runs every time the Codespace starts

echo "🚀 JJ NEXUS PRO Cloud Engine starting..."

# Kill any leftover processes from previous session
pkill -f Xvfb 2>/dev/null || true
pkill -f x11vnc 2>/dev/null || true
pkill -f websockify 2>/dev/null || true
pkill -f pulseaudio 2>/dev/null || true
pkill -f openbox 2>/dev/null || true
sleep 1

# Create required directories
mkdir -p /tmp/jjnexus/segments
mkdir -p /tmp/jjnexus/logs
mkdir -p /tmp/pulse

# Start virtual display
echo "Starting virtual display at 1280x720..."
Xvfb :99 -screen 0 1280x720x24 -ac -nolisten tcp +extension GLX &
XVFB_PID=$!
echo $XVFB_PID > /tmp/jjnexus/xvfb.pid
sleep 2

# Verify display started
if ! xdpyinfo -display :99 &>/dev/null; then
  echo "❌ Virtual display failed to start"
  exit 1
fi
echo "✅ Virtual display running"

# Start window manager (suppress config errors)
DISPLAY=:99 openbox 2>/dev/null &
sleep 1

# Start PulseAudio
echo "Starting audio system..."
pulseaudio --start \
  --exit-idle-time=-1 \
  --log-target=file:/tmp/jjnexus/logs/pulse.log \
  --daemon 2>/dev/null || true
sleep 2

# Create virtual audio sink
pactl load-module module-null-sink sink_name=jjnexus_sink \
  sink_properties="device.description='JJ NEXUS Stream Sink'" 2>/dev/null || true
pactl load-module module-null-sink sink_name=mic_input \
  sink_properties="device.description='Virtual Mic Input'" 2>/dev/null || true
pactl load-module module-virtual-source source_name=jjnexus_mic \
  master=mic_input.monitor 2>/dev/null || true

if pactl info &>/dev/null 2>&1; then
  echo "✅ Audio system ready"
else
  echo "⚠️  PulseAudio not running — stream will use silent audio"
fi

# ── noVNC: Codespaces proxies HTTPS at the edge so websockify runs plain HTTP ──
echo "Starting VNC server on port 5900..."
x11vnc \
  -display :99 \
  -forever \
  -nopw \
  -noxdamage \
  -noxrecord \
  -bg \
  -o /tmp/jjnexus/logs/x11vnc.log \
  -rfbport 5900
sleep 1

echo "Starting noVNC on port 6080 (plain HTTP — Codespaces adds HTTPS at edge)..."
# Generate a self-signed cert in case Codespaces sends raw SSL to the port
CERT_FILE="/tmp/jjnexus/novnc.pem"
if [ ! -f "$CERT_FILE" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$CERT_FILE" -out "$CERT_FILE" \
    -days 365 -subj '/CN=localhost' 2>/dev/null || true
fi

if [ -f "$CERT_FILE" ]; then
  websockify --web /usr/share/novnc/ --cert "$CERT_FILE" 6080 localhost:5900 &
else
  websockify --web /usr/share/novnc/ 6080 localhost:5900 &
fi
WEBSOCKIFY_PID=$!
echo $WEBSOCKIFY_PID > /tmp/jjnexus/websockify.pid

echo "✅ VNC server running on port 5900"
echo "✅ noVNC web interface running on port 6080"

echo ""
# Start webapp control server (port 7821) with auto-restart watchdog
echo "Starting Cloud Control Server on port 7821..."
pkill -f "control-server.js" 2>/dev/null || true
sleep 0.5

# Watchdog: restarts control-server.js if it dies
# NOTE: $LOGDIR is NOT used here — hardcode the path so the background subshell
# always has it, even after the parent script exits.
(
  while true; do
    node .devcontainer/control-server.js >> /tmp/jjnexus/logs/control-server.log 2>&1
    echo "[$(date '+%H:%M:%S')] Control server exited — restarting in 3s..." >> /tmp/jjnexus/logs/control-server.log
    sleep 3
  done
) &
WATCHDOG_PID=$!
echo $WATCHDOG_PID > /tmp/jjnexus/control-watchdog.pid
sleep 2

if curl -sf http://localhost:7821/api/status >/dev/null 2>&1; then
  echo "✅ Cloud Control Server running on port 7821"
else
  echo "⚠️  Control server may still be starting — check $LOGDIR/control-server.log"
fi

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  JJ NEXUS PRO Cloud Engine READY                  ║"
echo "║                                                   ║"
echo "║  Port 6080 → noVNC (visual control)               ║"
echo "║  Port 7821 → Webapp Control API (start/stop/nav)  ║"
echo "║  Run: bash .devcontainer/stable-stream.sh         ║"
echo "╚═══════════════════════════════════════════════════╝"
