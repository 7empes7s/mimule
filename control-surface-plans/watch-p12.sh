#!/bin/bash
# Block until the codex P12 build finishes, then exit so the orchestrator is re-invoked.
LOG=/root/control-surface-plans/logs/BUILD-P12.codex.log
while pgrep -f 'codex exec .* -C /opt/opencode-control-surface' >/dev/null 2>&1; do
  sleep 30
done
echo "CODEX_P12_DONE $(date -u '+%Y-%m-%d %H:%M:%S UTC') — log lines: $(wc -l < "$LOG")"
echo "=== last 40 lines ==="
tail -40 "$LOG"
