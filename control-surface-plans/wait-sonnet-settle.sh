#!/bin/bash
# Monitor the tmux 'csbuild' Sonnet builder. Re-invokes the orchestrator when the
# working tree has SETTLED (changes present + unchanged for ~4 min => slice/phase
# likely done or stalled), or the session died, or the 40-min chunk cap is hit.
set -uo pipefail
APP=/opt/opencode-control-surface
SESSION=csbuild
STABLE_NEEDED=240        # 4 min of no tree change => settled
CHUNK_CAP=$(( $(date +%s) + 2400 ))   # 40 min re-arm
prev=""
stable_since=$(date +%s)
while [ "$(date +%s)" -lt "$CHUNK_CAP" ]; do
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "SESSION_GONE builder tmux exited at $(date -u +%H:%M:%SZ)"
    exit 0
  fi
  cur="$(git -C "$APP" status --porcelain 2>/dev/null | sha256sum | cut -d' ' -f1)"
  if [ "$cur" != "$prev" ]; then
    prev="$cur"; stable_since=$(date +%s)
  fi
  changes="$(git -C "$APP" status --porcelain 2>/dev/null | wc -l)"
  quiet=$(( $(date +%s) - stable_since ))
  if [ "$changes" -gt 0 ] && [ "$quiet" -ge "$STABLE_NEEDED" ]; then
    echo "SETTLED tree stable ${quiet}s with ${changes} changed files at $(date -u +%H:%M:%SZ)"
    exit 0
  fi
  sleep 30
done
echo "WAKE_REARM builder still active at $(date -u +%H:%M:%SZ); changed=$(git -C "$APP" status --porcelain 2>/dev/null | wc -l)"
exit 0
