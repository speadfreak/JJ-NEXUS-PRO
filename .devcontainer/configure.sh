#!/bin/bash

echo "╔═══════════════════════════════════════════════════════╗"
echo "║  JJ NEXUS PRO — Stream Configuration                 ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# ── JJ NEXUS PRO URL ──────────────────────────────────────
echo "Step 1: Your JJ NEXUS PRO webapp URL"
echo "  • If using Replit dev preview: https://xxxx.replit.dev"
echo "  • If using Replit deployed URL: https://xxx.replit.app"
echo ""
read -p "Enter your JJ NEXUS PRO URL: " JJNEXUS_URL

# Strip trailing slash
JJNEXUS_URL="${JJNEXUS_URL%/}"

# ── Restream settings ─────────────────────────────────────
echo ""
echo "Step 2: Restream settings"
echo "  Go to: restream.io → Channels → Your channel → Stream Setup"
echo "  You need TWO things from that page:"
echo ""
echo "  Option A — They give you a full URL like:"
echo "    rtmp://live.restream.io/live/re_XXXXXXXXXXXXXXXX"
echo "    → RTMP URL = rtmp://live.restream.io/live"
echo "    → Stream Key = re_XXXXXXXXXXXXXXXX"
echo ""
echo "  Option B — They give you separate fields (newer Restream UI):"
echo "    Server: rtmps://live.restream.io:443/live"
echo "    Stream Key: re_XXXXXXXXXXXXXXXX"
echo ""
read -p "Enter Restream RTMP Server URL (rtmp:// or rtmps://): " RTMP_URL
RTMP_URL="${RTMP_URL%/}"

read -p "Enter Restream Stream Key (re_xxxx...): " RESTREAM_KEY

# Warn if key looks like it's in the URL already
if echo "$RTMP_URL" | grep -q "re_"; then
  echo ""
  echo "⚠️  WARNING: Your RTMP URL seems to include the stream key (contains 're_')."
  echo "   Please use only the base URL (before the key) in the RTMP URL field."
  echo "   Example: rtmp://live.restream.io/live"
  echo ""
  read -p "Fix the RTMP URL now (or press Enter to keep as-is): " RTMP_URL_FIX
  [ -n "$RTMP_URL_FIX" ] && RTMP_URL="$RTMP_URL_FIX"
fi

echo ""
echo "The stream will push to: ${RTMP_URL}/${RESTREAM_KEY}"
echo ""

# ── Quality settings ──────────────────────────────────────
echo "Step 3: Quality (press Enter for recommended defaults)"
echo ""
read -p "Resolution [1280x720]: " RESOLUTION
RESOLUTION=${RESOLUTION:-1280x720}

read -p "FPS [24]: " FPS
FPS=${FPS:-24}

read -p "Video bitrate [2500k]: " VIDEO_BITRATE
VIDEO_BITRATE=${VIDEO_BITRATE:-2500k}

# ── Save config ───────────────────────────────────────────
mkdir -p .devcontainer
cat > .devcontainer/stream-config.json << EOF
{
  "jjnexusUrl": "$JJNEXUS_URL",
  "rtmpUrl": "$RTMP_URL",
  "restreamKey": "$RESTREAM_KEY",
  "resolution": "$RESOLUTION",
  "fps": "$FPS",
  "videoBitrate": "$VIDEO_BITRATE",
  "audioBitrate": "128k"
}
EOF

echo ""
echo "✅ Configuration saved to .devcontainer/stream-config.json"
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  Config Summary                                       ║"
echo "║  App URL : $JJNEXUS_URL"
echo "║  RTMP    : ${RTMP_URL}/[key-hidden]"
echo "║  Quality : $RESOLUTION @ ${FPS}fps | $VIDEO_BITRATE video"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Run autostart if not done: bash .devcontainer/autostart.sh"
echo "  2. In VS Code Ports tab: right-click port 7821 → Visibility → Public"
echo "  3. Copy the 7821 URL → paste into the Cloud Control panel in your webapp"
echo "  4. Start streaming via the webapp OR: bash .devcontainer/stable-stream.sh"
