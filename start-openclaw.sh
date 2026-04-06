#!/bin/sh
set -e
OPENCLAW_BIN="/usr/local/lib/node_modules/openclaw/openclaw.mjs"
if [ ! -f "$OPENCLAW_BIN" ]; then
  echo "[mimule] ERROR: openclaw.mjs not found at $OPENCLAW_BIN"
  ls /usr/local/lib/node_modules/ 2>/dev/null
  exit 1
fi
if [ ! -f /root/.openclaw/openclaw.json ]; then
  echo "[mimule] ERROR: config not found"
  exit 1
fi
echo "[mimule] OpenClaw $(node $OPENCLAW_BIN --version 2>/dev/null || echo 'v?')"
echo "[mimule] Config OK. Starting gateway..."
exec node "$OPENCLAW_BIN" gateway run --bind lan --port 18789 --auth token
