#!/bin/bash
# Short wait until just after codex reset (01:18 UTC), then exit to re-invoke orchestrator.
TARGET=$(date -u -d "2026-06-30 01:18:30" +%s)
while [ "$(date -u +%s)" -lt "$TARGET" ]; do sleep 30; done
echo "WAKE_DISPATCH $(date -u '+%H:%M:%S UTC') — codex reset passed; probe + dispatch Phase 8+11"
