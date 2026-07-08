#!/bin/bash
# Wake orchestrator when the current build coder exits (or heartbeat ~50min).
# Usage: watch-build.sh codex|gemini|opencode
CODER="${1:-codex}"
case "$CODER" in
  codex)    PAT='openai/codex' ;;
  gemini)   PAT='gemini' ;;
  opencode) PAT='opencode' ;;
  *)        PAT="$CODER" ;;
esac
miss=0
for i in $(seq 1 100); do
  sleep 30
  n=$(ps -eo cmd | grep -i "$PAT" | grep -v grep | grep -cv 'watch-build')
  if [ "$n" -eq 0 ]; then miss=$((miss+1)); else miss=0; fi
  [ "$miss" -ge 2 ] && { echo "EVENT=BUILD_DONE coder=$CODER iter=$i"; exit 0; }
done
echo "EVENT=BUILD_HEARTBEAT coder=$CODER (~50min, still running)"
