#!/bin/bash
# Block until the Phase 10 codex build finishes, re-arming in <=40min chunks so a
# long build survives reaping. Exits 0 with BUILD_DONE when no codex proc remains;
# exits 0 with WAKE_REARM at the chunk cap so the orchestrator re-arms the next chunk.
set -uo pipefail
DEADLINE=$(( $(date +%s) + 2400 ))   # 40 min chunk
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if ! pgrep -x codex >/dev/null 2>&1; then
    echo "BUILD_DONE codex exited at $(date -u +%H:%M:%SZ)"
    exit 0
  fi
  sleep 30
done
echo "WAKE_REARM codex still building at $(date -u +%H:%M:%SZ)"
exit 0
