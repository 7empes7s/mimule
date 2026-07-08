#!/bin/bash
# Launch a codex rerun session for a cluster. Usage: launch-rerun.sh RX1|RX2|RX3
set -euo pipefail
CL="$1"
D=/root/control-surface-plans
PROMPT="$(cat "$D/_RERUN_HEADER.md"; echo; cat "$D/_RERUN_${CL}.md")"
exec codex exec --dangerously-bypass-approvals-and-sandbox \
  -C /opt/opencode-control-surface --skip-git-repo-check "$PROMPT"
