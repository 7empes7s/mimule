#!/bin/bash
# Sonnet build session — follows /root/DASHBOARD_V5_PLAN.md, funnels per-page plans, documents everything.
cd /opt/opencode-control-surface || exit 1
export IS_SANDBOX=1   # permits --dangerously-skip-permissions while running as root on this VPS
exec claude --model sonnet --dangerously-skip-permissions "$(cat /root/control-surface-plans/_BUILDER_PROMPT.md)"
