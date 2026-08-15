#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# JJ Nexus Pro — First-run setup script
# Run this once after importing to a new Replit account:
#   bash setup.sh
# ─────────────────────────────────────────────────────────────────

set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     JJ NEXUS PRO — Setup Script          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Install dependencies
echo "▶ Installing dependencies..."
pnpm install
echo "✅ Dependencies installed"
echo ""

# 2. Check required env vars
MISSING=0

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL is not set."
  echo "   → In Replit: go to Tools → Database (adds PostgreSQL automatically)"
  MISSING=1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "❌ SESSION_SECRET is not set."
  echo "   → In Replit: go to Secrets → add SESSION_SECRET with any 32+ char random string"
  MISSING=1
fi

if [ $MISSING -eq 1 ]; then
  echo ""
  echo "⚠️  Set the missing secrets above, then run: bash setup.sh"
  exit 1
fi

# 3. Push database schema
echo "▶ Pushing database schema..."
pnpm --filter @workspace/db run push
echo "✅ Database schema ready"
echo ""

echo "✅ Setup complete!"
echo ""
echo "The app runs automatically via Replit's workflows."
echo "If needed, restart them from the workflow panel."
echo ""
echo "Optional: Add ANTHROPIC_API_KEY in Secrets for Alchemist AI."
echo ""
