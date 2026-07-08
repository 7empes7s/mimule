#!/bin/bash
# Sleep until codex's usage window resets (~2026-06-30 01:25 UTC), then exit so
# the orchestrator is re-invoked to dispatch Phase 8+11 on codex.
TARGET=$(date -u -d "2026-06-30 01:25:00" +%s)
while [ "$(date -u +%s)" -lt "$TARGET" ]; do
  remain=$(( TARGET - $(date -u +%s) ))
  [ "$remain" -le 0 ] && break
  sleep $(( remain > 600 ? 600 : remain ))
done
echo "CODEX_WINDOW_RESET $(date -u '+%Y-%m-%d %H:%M:%S UTC') — re-invoke orchestrator to dispatch Phase 8+11 on codex"
