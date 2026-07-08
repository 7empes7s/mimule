#!/bin/bash
# Dispatch the current phase build (_NEXT.md) to a chosen CLI coder.
# Usage: launch-build.sh codex|gemini|opencode|claude
set -uo pipefail
CODER="${1:?coder required: codex|gemini|opencode|claude}"
D=/root/control-surface-plans
APP=/opt/opencode-control-surface
PROMPT="$(cat "$D/_BUILD_RULES.md"; echo; echo '=== TASK (_NEXT.md) ==='; cat "$D/_NEXT.md")"

case "$CODER" in
  codex)
    exec codex exec --dangerously-bypass-approvals-and-sandbox -C "$APP" --skip-git-repo-check "$PROMPT"
    ;;
  gemini)
    exec gemini -p "$PROMPT" --include-directories "$APP","$D" --skip-trust --approval-mode yolo
    ;;
  opencode)
    # free coding model; opencode reads files itself via --dir. Override model with $2 if given.
    MODEL="${2:-opencode/deepseek-v4-flash-free}"
    exec opencode run --dir "$APP" -m "$MODEL" "$PROMPT"
    ;;
  claude)
    # LAST RESORT only. tmux-launched separately via launch-phase.sh (IS_SANDBOX=1). Here for completeness.
    cd "$APP" || exit 1
    export IS_SANDBOX=1
    exec claude --model sonnet --dangerously-skip-permissions "$PROMPT"
    ;;
  *) echo "unknown coder: $CODER" >&2; exit 2 ;;
esac
