#!/bin/bash
# Monitor the tmux 'csbuild' Sonnet builder for IDLE (turn finished). The agent
# shows an active-work indicator ("esc to interrupt", spinner words) while running;
# when the turn ends the pane is just the input prompt. Re-invokes the orchestrator
# when the builder has been idle ~2 min, or the session died, or 40-min chunk cap.
set -uo pipefail
SESSION=csbuild
IDLE_NEEDED=120         # ~2 min of no active-work indicator => turn done
CHUNK_CAP=$(( $(date +%s) + 2400 ))
idle_since=$(date +%s)
ACTIVE_RE='esc to interrupt|Sublimating|Running|Ran |tokens ·|Thinking|Working|Computing|↓ '
while [ "$(date +%s)" -lt "$CHUNK_CAP" ]; do
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "SESSION_GONE builder tmux exited at $(date -u +%H:%M:%SZ)"
    exit 0
  fi
  pane="$(tmux capture-pane -p -t "$SESSION" 2>/dev/null | tail -8)"
  if echo "$pane" | grep -qE "$ACTIVE_RE"; then
    idle_since=$(date +%s)
  fi
  idle=$(( $(date +%s) - idle_since ))
  if [ "$idle" -ge "$IDLE_NEEDED" ]; then
    echo "BUILDER_IDLE idle ${idle}s at $(date -u +%H:%M:%SZ)"
    exit 0
  fi
  sleep 20
done
echo "WAKE_REARM builder still active at $(date -u +%H:%M:%SZ)"
exit 0
