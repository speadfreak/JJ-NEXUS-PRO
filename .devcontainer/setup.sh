#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║  JJ NEXUS PRO — Cloud Streaming Engine Setup    ║"
echo "╚══════════════════════════════════════════════════╝"

# Update system
sudo apt-get update -qq

# Install all required packages in one shot
echo "Installing system packages..."
sudo apt-get install -y -qq \
  ffmpeg \
  xvfb \
  x11vnc \
  xdotool \
  wmctrl \
  openbox \
  x11-xserver-utils \
  pulseaudio \
  pulseaudio-utils \
  alsa-utils \
  wget \
  curl \
  jq \
  netcat-openbsd \
  procps \
  python3 \
  python3-pip \
  novnc \
  websockify \
  net-tools \
  git

# Install Google Chrome
echo "Installing Google Chrome..."
if ! command -v google-chrome &>/dev/null; then
  wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt-get install -y -qq ./google-chrome-stable_current_amd64.deb
  rm -f google-chrome-stable_current_amd64.deb
fi

# Verify FFmpeg
echo "FFmpeg version: $(ffmpeg -version 2>&1 | head -1)"

# Verify Chrome
echo "Chrome version: $(google-chrome --version)"

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install 2>/dev/null || true

# Create required directories
mkdir -p /tmp/jjnexus/segments
mkdir -p /tmp/jjnexus/logs
mkdir -p /tmp/pulse
mkdir -p ~/.vnc

# Create VNC password (empty for easy access from Codespace)
x11vnc -storepasswd "" ~/.vnc/passwd 2>/dev/null || true

# Make all scripts executable
chmod +x .devcontainer/*.sh 2>/dev/null || true
chmod +x streaming/*.sh 2>/dev/null || true

echo "✅ JJ NEXUS PRO Cloud Streaming Engine setup complete"
echo "Run: bash .devcontainer/stream.sh to start streaming"
