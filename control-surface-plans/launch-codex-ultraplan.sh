#!/bin/bash
# Auto-launched when codex quota resets (systemd timer codex-ultraplan.timer).
# Runs SPEC queue sequentially in tmux; each spec capped; logs to logs/.
# Fable verifies + commits in the next session — codex NEVER commits.
set -uo pipefail
cd /root/control-surface-plans || exit 1
LOG=logs/codex-ultraplan-$(date -u +%Y%m%dT%H%M).log

probe() {
  timeout 90 codex exec --skip-git-repo-check 'Reply with exactly: CODEX_OK' 2>&1 | tail -2
}
P="$(probe)"
if ! echo "$P" | grep -q CODEX_OK || echo "$P" | grep -qi "usage limit"; then
  echo "$(date -u +%FT%TZ) codex still limited, giving up (timer will not re-arm): $P" >> "$LOG"
  exit 0
fi
echo "$(date -u +%FT%TZ) codex available — starting SPEC queue" >> "$LOG"

run_spec() {
  local spec="$1" cap="$2"
  echo "$(date -u +%FT%TZ) === $spec (cap ${cap}s) ===" >> "$LOG"
  timeout "$cap" codex exec --dangerously-bypass-approvals-and-sandbox \
    -C /opt/opencode-control-surface --skip-git-repo-check \
    "Read /root/control-surface-plans/tasks/$spec and execute it exactly. Obey every Hard rail. When done, write your report as the spec instructs." \
    >> "$LOG" 2>&1
  echo "$(date -u +%FT%TZ) === $spec finished (exit $?) ===" >> "$LOG"
}

# SPEC 2 first only if the Sonnet run didn't already deliver it (marker file set by Fable).
[ -f tasks/.spec2_done ] || run_spec SPEC_2_P1_CFO_HEADLINE.md 3600
[ -f tasks/.spec1_done ] || run_spec SPEC_1_P0_FRESH_HOST.md 7200
[ -f tasks/.spec3_done ] || run_spec SPEC_3_P2_ESCALATE_TO_WORKFLOW.md 5400
echo "$(date -u +%FT%TZ) queue complete — Fable to verify, fix, commit" >> "$LOG"
