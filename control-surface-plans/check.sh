#!/bin/bash
# Deterministic orchestration done-check.
exp=$(tr ' ' '\n' < /root/control-surface-plans/_EXPECTED.txt | grep -v '^$' | sort -u)
have=$(ls /root/control-surface-plans/pages/ 2>/dev/null | sed 's/\.plan\.md$//' | sort -u)
total=$(echo "$exp" | wc -l); got=$(comm -12 <(echo "$exp") <(echo "$have") | wc -l)
echo "PLANS: $got/$total"
miss=$(comm -23 <(echo "$exp") <(echo "$have"))
[ -n "$miss" ] && { echo "MISSING:"; echo "$miss" | sed 's/^/  - /'; }
echo "RESEARCH PROCS: codex=$(pgrep -f 'codex exec'|wc -l) gemini=$(pgrep -f 'gemini -p'|wc -l)"
tmux has-session -t csbuild 2>/dev/null && echo "BUILDER: alive" || echo "BUILDER: down"
echo "PHASE7 edits: $(cd /opt/opencode-control-surface && git status --short -- server/api/cost.ts server/api/systemConfig.ts server/api/gemini.ts app/routes/CostPage.tsx 2>/dev/null | wc -l)/4 target files touched"
ls /root/control-surface-plans/BUILD_LOG.md >/dev/null 2>&1 && echo "BUILD_LOG: present" || echo "BUILD_LOG: not yet"
