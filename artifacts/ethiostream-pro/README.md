# JJ Nexus Pro

**The Ultimate Trading Command Center** — Built by The Debug Squad • 2026

A full-stack forex trading platform featuring:
- 📡 Real WebRTC live streaming studio with camera, screen share & recording
- 🤖 Alchemist AI powered by Claude (Anthropic) with live web search
- 📊 Real-time watchlist with live forex prices
- 📅 Economic calendar with AI event analysis
- 📓 Trade journal with PostgreSQL persistence
- 🎵 Ambient background music

---

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- PostgreSQL database

### 2. Setup

```bash
# Clone and install
npm install -g pnpm
pnpm install

# Environment variables
cp artifacts/ethiostream-pro/.env.example .env
# Edit .env and fill in your values (API key, database URL, etc.)
```

### 3. Database
```bash
pnpm --filter @workspace/db run push
```

### 4. Run (Development)
```bash
# Terminal 1 — API Server (port 5000)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (port 5173)
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/ethiostream-pro run dev
```

Open http://localhost:5173

### 5. Production Build
```bash
pnpm run build

# Serve the built frontend
npx serve artifacts/ethiostream-pro/dist/public

# Run API server in production
NODE_ENV=production pnpm --filter @workspace/api-server run start
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (enables live web search in AI) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random secret for sessions |
| `PORT` | Server port |

**Note:** The API key can also be set in the app UI under Settings → API & Keys. It's stored in localStorage and used for all AI calls.

---

## Key Features

### Alchemist AI
- Searches the web for **current live prices** before every analysis
- SMC/ICT technical analysis with real-time data
- Confluence engine scoring 0-100
- Real-time streaming responses

### Streaming Studio
- Real camera feed via WebRTC (`getUserMedia`)
- Screen share with picture-in-picture
- Local .webm recording via MediaRecorder API
- Professional overlays (lower third, logo, ticker)
- RTMP key management for OBS integration

### Economic Calendar
- Live data from ForexFactory API
- Real countdown timers to each event
- AI analysis of any event on click
- Color-coded results (beat/missed forecast)

### Trade Journal
- Full CRUD with PostgreSQL
- AI insights on your trading patterns
- Win rate, R:R, and net pips statistics

---

## Tech Stack

- **Frontend:** React + Vite + Tailwind CSS + Framer Motion
- **Backend:** Express 5 + TypeScript
- **Database:** PostgreSQL + Drizzle ORM
- **AI:** Anthropic Claude with web search tool
- **Real-time:** WebRTC, MediaRecorder API, SSE streams

---

*Built for JJ Trades community. The Debug Squad • 2026*
