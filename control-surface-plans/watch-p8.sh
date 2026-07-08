#!/bin/bash
# Self-re-arming watcher for the codex P8+11 build. Watches up to ~40min, then:
#  - if codex exited  -> print CODEX_P8_DONE + tail (orchestrator verifies/commits)
#  - if still building -> print CODEX_P8_REARM (orchestrator re-launches another chunk)
# Short-lived so it survives the long-process reaping in this environment.
LOG=/root/control-surface-plans/logs/BUILD-P8.codex.log
PAT='codex exec .* -C /opt/opencode-control-surface'
DEADLINE=$(( $(date -u +%s) + 2400 ))   # 40 min cap
while pgrep -f "$PAT" >/dev/null 2>&1; do
  if [ "$(date -u +%s)" -ge "$DEADLINE" ]; then
    echo "CODEX_P8_REARM $(date -u '+%Y-%m-%d %H:%M:%S UTC') — still building; log lines: $(wc -l < "$LOG" 2>/dev/null); re-arm watcher"
    exit 0
  fi
  sleep 30
done
echo "CODEX_P8_DONE $(date -u '+%Y-%m-%d %H:%M:%S UTC') — log lines: $(wc -l < "$LOG" 2>/dev/null)"
echo "=== last 45 lines ==="
tail -45 "$LOG" 2>/dev/null
