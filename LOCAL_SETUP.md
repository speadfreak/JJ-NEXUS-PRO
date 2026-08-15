# JJ NEXUS PRO — Local Setup Guide

Elite Forex live streaming + AI trading command center.

---

## Requirements

- **Node.js** 20+ → https://nodejs.org
- **pnpm** 9+ → `npm install -g pnpm`
- **PostgreSQL** 15+ → https://www.postgresql.org/download/
- **Anthropic API key** → https://console.anthropic.com (for Alchemist AI)

---

## Step 1 — Install dependencies

```bash
pnpm install
```

---

## Step 2 — Create the database

In PostgreSQL (psql or pgAdmin), create a database:

```sql
CREATE DATABASE jjnexus;
```

---

## Step 3 — Set environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Anthropic API Key — get from https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# PostgreSQL connection string
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/jjnexus

# Session secret (any random string 32+ chars)
SESSION_SECRET=replace-with-a-random-secret-string-here
```

---

## Step 4 — Push database schema

```bash
pnpm --filter @workspace/db run push
```

This creates all tables (trades, conversations, messages).

---

## Step 5 — Run the app

Open **two terminal windows**:

**Terminal 1 — API Server (port 8080):**
```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Frontend (port 5173):**
```bash
pnpm --filter @workspace/ethiostream-pro run dev
```

Then open: **http://localhost:5173**

---

## Features

| Feature | Notes |
|---------|-------|
| 📡 Streaming Studio | Real WebRTC camera + screen share, local .webm recording |
| 🤖 Alchemist AI | Claude AI chat with live web search (needs API key) |
| 📊 Watchlist | 15 forex pairs with live ticks + Frankfurter API |
| 📅 Economic Calendar | Live ForexFactory events with AI analysis |
| 📓 Trade Journal | Full CRUD with PostgreSQL + AI insights |
| 🎵 Music Player | YouTube embeds + 3 ambient MP3 tracks |
| 🔔 Notifications | Real-time market session alerts |

---

## Troubleshooting

**"Cannot connect to database"**
→ Make sure PostgreSQL is running and DATABASE_URL is correct

**"Alchemist AI not responding"**
→ Make sure ANTHROPIC_API_KEY is set in .env

**"Port already in use"**
→ Change ports: API: set `PORT=8081` in api-server dev, Frontend: edit vite.config.ts

**Camera/microphone not working**
→ Browser requires HTTPS for camera access on non-localhost origins. Use http://localhost only.

---

## Production Build

```bash
# Build frontend
pnpm --filter @workspace/ethiostream-pro run build
# Output in: artifacts/ethiostream-pro/dist/

# Build API
pnpm --filter @workspace/api-server run build
# Output in: artifacts/api-server/dist/
```

---

## Tech Stack

- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4 + Framer Motion
- **Backend**: Express 5 + PostgreSQL + Drizzle ORM
- **AI**: Anthropic Claude (claude-sonnet-4-6)
- **Streaming**: Real WebRTC (browser getUserMedia API)
