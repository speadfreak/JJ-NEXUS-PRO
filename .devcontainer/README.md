# JJ NEXUS PRO — GitHub Codespaces Cloud Streaming

## Quick Start (3 steps)

### Step 1 — Configure (run once)
```bash
bash .devcontainer/configure.sh
```
Enter your JJ NEXUS PRO URL on Render and your Restream key.

### Step 2 — Control the cloud screen
Open port **6080** in the Codespace ports panel.
This opens noVNC — you can see and control the cloud browser from your Chromebook.

### Step 3 — Start streaming
```bash
bash .devcontainer/stable-stream.sh
```
Stream starts. Restream receives it and sends to TikTok + YouTube.

## Monitor your stream
```bash
bash .devcontainer/dashboard.sh
```

## Stop streaming
```bash
bash .devcontainer/stop.sh
```

## How it works
- GitHub Codespace runs Ubuntu with 4 CPUs
- Xvfb creates a virtual 1280x720 display
- Chrome opens JJ NEXUS PRO on that virtual display
- FFmpeg captures the display and streams to Restream via RTMP
- You control what's on screen via noVNC from your Chromebook browser
- Stream is completely independent of your Chromebook performance
- Auto-reconnects up to 20 times if anything interrupts

## Architecture

```
GitHub Codespace (4 CPU, 8GB RAM, Ubuntu, free 60h/month)
  │
  ├── Xvfb (virtual display :99) — fake screen in the cloud
  │     └── Chrome browser — JJ NEXUS PRO on render.com
  │
  ├── x11vnc + noVNC (port 6080) — control from Chromebook
  │
  ├── PulseAudio — virtual audio device
  │     └── routed to FFmpeg audio input
  │
  └── FFmpeg — captures display + audio → RTMP
        └── rtmp://live.restream.io/live/[KEY] → TikTok + YouTube
```

## Free tier: 60 hours/month
Plan your streams: 4 streams × 15 hours = uses full monthly quota
Or: 8 streams × 7.5 hours each

## Tips
- Keep noVNC open in a second tab to monitor/control the cloud screen
- Use `bash .devcontainer/dashboard.sh` in a second terminal to monitor health
- The stable-stream script auto-reconnects up to 20 times on failure
- If Chrome crashes, it auto-restarts while keeping FFmpeg running
