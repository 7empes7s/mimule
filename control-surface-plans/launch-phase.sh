#!/bin/bash
# Launch a fresh Sonnet builder for the current phase (task spec in _NEXT.md).
# Reusable per-phase: update _NEXT.md, then `tmux kill-session -t csbuild` and run this.
cd /opt/opencode-control-surface || exit 1
export IS_SANDBOX=1   # permits --dangerously-skip-permissions as root on this VPS
exec claude --model sonnet --dangerously-skip-permissions \
  "$(cat /root/control-surface-plans/_STANDING_RULES.md; echo; cat /root/control-surface-plans/_NEXT.md)"
