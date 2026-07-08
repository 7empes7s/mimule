#!/bin/bash
# Wake orchestrator when all 3 codex rerun sessions exit (or after ~45min heartbeat).
EXPECT="governance security compliance governance-risk newsbites autopipeline scout content-health finance-intel dossier today opencode codex claude gemini"
for i in $(seq 1 90); do
  sleep 30
  n=$(pgrep -fc 'codex exec --dangerously' 2>/dev/null || echo 0)
  have=0; for s in $EXPECT; do [ -f "/root/control-surface-plans/pages/$s.plan.md" ] && have=$((have+1)); done
  if [ "$n" -eq 0 ]; then echo "EVENT=RERUN_DONE codex_procs=0 files=$have/15 iter=$i"; exit 0; fi
done
echo "EVENT=RERUN_TIMEOUT (~45min) codex_procs_still=$(pgrep -fc 'codex exec --dangerously') files=$have/15"
