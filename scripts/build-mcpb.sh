#!/usr/bin/env bash
# Build the one-click Claude Desktop extension bundle (mind.mcpb) for the MIND MCP server.
#
# What this does:
#   1. Builds the MCP server (npm ci && npm run build → dist/)
#   2. Stages a clean bundle dir: manifest.json + icon.png (from mcp-server/mcpb/) + built
#      server code (dist/ → server/) + production-only node_modules
#   3. Packs the stage into a .mcpb zip via the official `@anthropic-ai/mcpb` CLI
#   4. Publishes the result to frontend/public/downloads/mind.mcpb, which Vercel serves
#      statically at https://www.m-i-n-d.ai/downloads/mind.mcpb
#
# Regenerate after any change to mcp-server/src, mcp-server/mcpb/manifest.json, or the icon:
#   bash mcp-server/scripts/build-mcpb.sh
#
# Requires: node >=18, npm. Uses `npx @anthropic-ai/mcpb pack` (no global install needed).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$MCP_SERVER_DIR/.." && pwd)"
STAGE_DIR="$MCP_SERVER_DIR/.mcpb-stage"
OUT_DIR="$REPO_ROOT/frontend/public/downloads"
OUT_FILE="$OUT_DIR/mind.mcpb"

echo "==> [1/5] Building MIND MCP server (npm ci && npm run build)"
cd "$MCP_SERVER_DIR"
npm ci
npm run build

echo "==> [2/5] Staging MCPB bundle at $STAGE_DIR"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/server"
cp -R dist/. "$STAGE_DIR/server/"
cp "$MCP_SERVER_DIR/mcpb/manifest.json" "$STAGE_DIR/manifest.json"
cp "$MCP_SERVER_DIR/mcpb/icon.png" "$STAGE_DIR/icon.png"
[ -f "$MCP_SERVER_DIR/README.md" ] && cp "$MCP_SERVER_DIR/README.md" "$STAGE_DIR/README.md" || true

echo "==> [3/5] Installing production-only runtime dependencies into stage"
PKG_VERSION="$(node -p "require('$MCP_SERVER_DIR/package.json').version")"
node -e "
  const pkg = require('$MCP_SERVER_DIR/package.json');
  const fs = require('fs');
  fs.writeFileSync('$STAGE_DIR/package.json', JSON.stringify({
    name: 'mind-mcpb-runtime',
    private: true,
    version: pkg.version,
    dependencies: pkg.dependencies
  }, null, 2));
"
(cd "$STAGE_DIR" && npm install --omit=dev --no-audit --no-fund --no-package-lock)

echo "==> [4/5] Packing .mcpb bundle via @anthropic-ai/mcpb"
mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"
npx -y @anthropic-ai/mcpb pack "$STAGE_DIR" "$OUT_FILE"

echo "==> [5/5] Cleaning up stage dir"
rm -rf "$STAGE_DIR"

echo ""
echo "Built: $OUT_FILE"
ls -lh "$OUT_FILE"
echo ""
echo "Verify: unzip -l \"$OUT_FILE\" | head -20"
echo "Served at: https://www.m-i-n-d.ai/downloads/mind.mcpb (after deploy)"
