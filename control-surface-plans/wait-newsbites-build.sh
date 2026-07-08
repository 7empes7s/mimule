#!/bin/bash
# Wait until the autopipeline's next build finishes (deploy.sh spawns it), cap 8 min.
for i in $(seq 1 96); do
  if ! pgrep -f '/opt/newsbites/node_modules/.bin/next build' >/dev/null 2>&1; then
    echo "NEWSBITES_BUILD_DONE after $((i*5))s at $(date -u +%H:%M:%SZ)"
    exit 0
  fi
  sleep 5
done
echo "NEWSBITES_BUILD_TIMEOUT 480s at $(date -u +%H:%M:%SZ)"
