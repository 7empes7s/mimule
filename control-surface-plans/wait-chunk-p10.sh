#!/bin/bash
# Self-re-arming chunked waiter (survives long-process reaping). Sleeps <=45min then
# exits to re-invoke the orchestrator: dispatch Phase 10+2+13+6 on codex once its
# window resets (~2026-06-30 06:45 UTC), else re-arm another chunk.
TARGET=$(date -u -d "2026-06-30 06:45:00" +%s)
NOW=$(date -u +%s); REMAIN=$(( TARGET - NOW ))
[ "$REMAIN" -lt 0 ] && REMAIN=0
SLEEP=$(( REMAIN < 2700 ? REMAIN : 2700 )); [ "$SLEEP" -lt 60 ] && SLEEP=60
sleep "$SLEEP"
NOW=$(date -u +%s)
if [ "$NOW" -ge "$TARGET" ]; then
  echo "WAKE_DISPATCH_P10 $(date -u '+%H:%M:%S UTC') — codex window should be reset; probe + dispatch Phase 10+2+13+6 (after reconciling branch 0b6c764)"
else
  echo "WAKE_REARM $(date -u '+%H:%M:%S UTC') — ~$(( (TARGET-NOW)/60 ))min to codex reset; re-arm another chunk"
fi
