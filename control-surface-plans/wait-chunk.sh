#!/bin/bash
# One short chunk (survives long-process reaping). Sleeps <=45min then exits so
# the orchestrator is re-invoked to decide: dispatch Phase 8+11 on codex if its
# window has reset, else re-arm another chunk. Target reset ~2026-06-30 01:17 UTC.
TARGET=$(date -u -d "2026-06-30 01:17:00" +%s)
NOW=$(date -u +%s)
REMAIN=$(( TARGET - NOW ))
CHUNK=2700   # 45 min
[ "$REMAIN" -lt 0 ] && REMAIN=0
SLEEP=$(( REMAIN < CHUNK ? REMAIN : CHUNK ))
[ "$SLEEP" -lt 60 ] && SLEEP=60
sleep "$SLEEP"
NOW=$(date -u +%s)
if [ "$NOW" -ge "$TARGET" ]; then
  echo "WAKE_DISPATCH $(date -u '+%H:%M:%S UTC') — codex window should be reset; probe + dispatch Phase 8+11"
else
  echo "WAKE_REARM $(date -u '+%H:%M:%S UTC') — still ~$(( (TARGET-NOW)/60 ))min to codex reset; re-arm another chunk"
fi
