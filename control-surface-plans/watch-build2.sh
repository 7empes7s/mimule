#!/bin/bash
# Wake on: opencode build proc exit (done/dead), early stall (0 tracked changes by ~15min), or ~45min heartbeat.
PID="$1"
APP=/opt/opencode-control-surface
chg() { cd "$APP" && git status --short | grep -v csbuild | wc -l; }
for i in $(seq 1 90); do
  sleep 30
  if ! ps -o pid= -p "$PID" >/dev/null 2>&1; then echo "EVENT=BUILD_EXIT pid=$PID changes=$(chg) iter=$i"; exit 0; fi
  c=$(chg); el=$((i*30))
  if [ "$el" -ge 900 ] && [ "$c" -eq 0 ]; then echo "EVENT=BUILD_STALL (15min, 0 changes) pid=$PID"; exit 0; fi
done
echo "EVENT=BUILD_HEARTBEAT (~45min) changes=$(chg) pid=$PID"
