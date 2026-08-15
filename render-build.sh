#!/usr/bin/env bash
# Render build script for JJ Nexus Pro
# Installs pnpm to a temp directory (Render's system dirs are read-only)
set -e

echo "▶ Installing pnpm..."
npm install --prefix /tmp/pnpm-bin --ignore-scripts pnpm@10
export PATH=/tmp/pnpm-bin/node_modules/.bin:$PATH
echo "✅ pnpm $(pnpm --version)"

echo "▶ Installing workspace dependencies..."
pnpm install --frozen-lockfile

echo "▶ Pushing DB schema..."
pnpm --filter @workspace/db run push

echo "▶ Building API server..."
NODE_ENV=production BASE_PATH=/ pnpm --filter @workspace/api-server run build

echo "▶ Building frontend..."
NODE_ENV=production BASE_PATH=/ pnpm --filter @workspace/ethiostream-pro run build

echo "✅ Build complete"
