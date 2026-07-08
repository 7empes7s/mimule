#!/bin/bash
# Wake orchestrator when the tmux builder goes idle (footer drops "esc to interrupt" for 2 polls) or dies.
miss=0
for i in $(seq 1 30); do
  sleep 30
  tmux has-session -t csbuild 2>/dev/null || { echo "EVENT=BUILDER_DOWN iter=$i"; exit 0; }
  if tmux capture-pane -t csbuild -p 2>/dev/null | grep -q 'esc to interrupt'; then miss=0; else miss=$((miss+1)); fi
  [ "$miss" -ge 2 ] && { echo "EVENT=BUILDER_IDLE iter=$i"; exit 0; }
done
echo "EVENT=TIMEOUT_STILL_BUSY (~15min)"
