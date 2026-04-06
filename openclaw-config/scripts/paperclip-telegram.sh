#!/bin/sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

exec node /root/.openclaw/scripts/paperclip-telegram.js "$@"
