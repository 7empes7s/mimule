#!/bin/bash
set -euo pipefail
FILES="$1"   # space-separated slugs
D=/root/control-surface-plans
PROMPT="$(cat "$D/_AUGMENT_DISCOVERY.md" | sed "s|<<INJECTED>>|$FILES|")"
exec codex exec --dangerously-bypass-approvals-and-sandbox -C /opt/opencode-control-surface --skip-git-repo-check "$PROMPT"
