#!/bin/bash
# Block until codex's usage limit resets, re-arming in <=45min chunks so the long
# wait survives reaping. Re-probes codex every 10 min. Exits CODEX_AVAILABLE when
# the probe returns CODEX_OK; exits WAKE_REARM at the chunk cap to re-arm.
set -uo pipefail
cd /root/control-surface-plans || exit 1
DEADLINE=$(( $(date +%s) + 2700 ))   # 45 min chunk
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  OUT="$(timeout 60 codex exec --model gpt-5.5 --skip-git-repo-check 'Reply with exactly: CODEX_OK' 2>&1 | tail -3)"
  if echo "$OUT" | grep -q "CODEX_OK" && ! echo "$OUT" | grep -qi "usage limit"; then
    echo "CODEX_AVAILABLE at $(date -u +%H:%M:%SZ)"
    exit 0
  fi
  sleep 600   # re-probe every 10 min
done
echo "WAKE_REARM codex still usage-limited at $(date -u +%H:%M:%SZ)"
exit 0
