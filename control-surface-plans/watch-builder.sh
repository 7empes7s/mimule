#!/bin/bash
# Heartbeat watcher for the tmux builder (harness can't track it). Exits -> re-invokes orchestrator.
for i in $(seq 1 10); do
  sleep 90
  tmux has-session -t csbuild 2>/dev/null || { echo "EVENT=BUILDER_DOWN iter=$i"; exit 0; }
  if grep -qiE 'phase[ _-]*1' /root/control-surface-plans/BUILD_LOG.md 2>/dev/null; then
    echo "EVENT=PHASE1_DOCUMENTED iter=$i"; exit 0
  fi
done
echo "EVENT=HEARTBEAT (~15min, builder still on Phase 1) — check pane and nudge if idle"
