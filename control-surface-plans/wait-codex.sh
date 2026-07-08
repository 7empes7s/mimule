#!/bin/bash
# Sleep (background, detached) until codex's ~5h window resets, then exit so the
# orchestrator is re-invoked to dispatch the Phase 12+5 build. Target 14:53 UTC.
TARGET=$(date -u -d '2026-06-29 14:53:00' +%s)
while :; do
  NOW=$(date -u +%s)
  REMAIN=$(( TARGET - NOW ))
  [ "$REMAIN" -le 0 ] && break
  # sleep in <=10min chunks so the process stays responsive to kills
  SLP=$(( REMAIN > 600 ? 600 : REMAIN ))
  sleep "$SLP"
done
echo "codex-window-reset reached at $(date -u '+%F %T UTC')"
