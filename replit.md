# JJ Nexus Pro

Elite Forex live streaming + AI trading command center for JJ Trades.

## Development Workflow

This Replit is the **dev environment**. The app is hosted on **Render** (auto-deploys from GitHub).

1. Make changes here in Replit
2. Use the **Git** pane (or ask the agent to push) to commit and push to `origin/main`
3. Render picks up the push and auto-deploys

GitHub remote: `https://github.com/speadfreak/JJ-NEXUS-PRO`

> Dependencies are pre-installed (`pnpm install` already run). You do not need to run `setup.sh` unless you want the app running locally in Replit too.

---

## Fresh Import Setup (new Replit account)

When you import this project from GitHub to a new Replit account, do these three steps:

### Step 1 — Add a PostgreSQL database
Go to **Tools → Database** in the Replit sidebar. Click **Create Database**.
This automatically sets `DATABASE_URL` for you.

### Step 2 — Add secrets
Go to **Secrets** (lock icon) and add:
| Key | Value |
|-----|-------|
| `SESSION_SECRET` | Any random string 32+ characters |
| `ANTHROPIC_API_KEY` | *(optional)* Your Anthropic key for Alchemist AI |

> Tip: If you have a Replit Anthropic integration, add it via **Tools → Integrations → Anthropic** instead — it's free and no key needed.

### Step 3 — Run setup
Open the **Shell** tab and run:
```bash
bash setup.sh
```
This installs all dependencies and pushes the database schema.
After it completes, click **Run** (or restart the workflows from the workflow panel).

---

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm --filter @workspace/ethiostream-pro run dev` — Frontend (Vite dev server)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + Framer Motion
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: Anthropic Claude (claude-sonnet-4-6) with web_search_20250305 tool
- Streaming: Real WebRTC via browser APIs (getUserMedia, MediaRecorder)

## Where things live

- `artifacts/ethiostream-pro/` — React frontend (Vite)
- `artifacts/api-server/src/routes/` — Express API routes:
  - `analysis/` — Forex analysis, confluence, news (with web search)
  - `anthropic/` — Alchemist AI chat (persistent conversations in DB)
  - `journal/` — Trade journal CRUD
  - `proxy/` — Backend proxy for external APIs (calendar, forex rates)
- `artifacts/ethiostream-pro/src/pages/` — App pages (Dashboard, Studio, AlchemistAI, Watchlist, Journal, EconomicCalendar, Settings)
- `lib/db/` — PostgreSQL schema + Drizzle ORM
- `lib/api-zod/` — Zod validation schemas (generated from OpenAPI)

## Architecture decisions

- Web_search enabled via `anthropic-beta: web-search-2025-03-05` header on the Anthropic SDK client (works with both Replit integration and direct API key)
- All external APIs (ForexFactory calendar, Frankfurter forex rates) proxied through `/api/proxy/*` backend routes to avoid browser CORS restrictions
- Background music uses HTML audio with Web Audio API fallback (ambient oscillators if CDN fails)
- XAUUSD base price: $4720 (May 2026 gold price — AI uses web_search to fetch current price)

## Product

- 📡 **Streaming Studio** — Real WebRTC camera/screen share, local .webm recording, professional overlays
- 🤖 **Alchemist AI** — Claude chat with live web search for current prices/news, SSE streaming responses
- 📊 **Watchlist** — 15 pairs with simulated live ticks, Frankfurter API for major pairs every 30s
- 📅 **Economic Calendar** — Live events from ForexFactory (proxied), countdown timers, AI analysis on click
- 📓 **Trade Journal** — Full CRUD with PostgreSQL, win rate / net pips stats, AI insights
- ⚙️ **Settings** — Accent color picker, font size, API key, audio volume, notifications, risk defaults

## User preferences

- Gold (XAUUSD) price is $4700+ in 2026 — never use lower training data prices
- AI must use web_search to fetch CURRENT live prices before any analysis
- Cinematic dark gold premium UI throughout
- Logo: `/jj-trades-logo.jpg` used in sidebar, favicon, settings profile

## Gotchas

- API key priority: Replit integration (`AI_INTEGRATIONS_ANTHROPIC_BASE_URL` + `AI_INTEGRATIONS_ANTHROPIC_API_KEY`) > `ANTHROPIC_API_KEY` env var. Integration goes through Replit's local proxy (localhost:1106) and is free. Direct key gets web_search beta header but requires paid credits.
- Never call external APIs directly from frontend (CORS) — always use `/api/proxy/*` backend routes
- Do not run `pnpm dev` at workspace root — use individual package filters
- For local dev: copy `artifacts/ethiostream-pro/.env.example` to root `.env`

## Pointers

- See `artifacts/ethiostream-pro/README.md` for local hosting guide
- See the `pnpm-workspace` skill for workspace structure and TypeScript setup
