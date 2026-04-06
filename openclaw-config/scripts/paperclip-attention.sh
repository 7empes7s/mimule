#!/bin/sh
set -eu
if command -v node >/dev/null 2>&1; then
  exec node /opt/mimoun/openclaw-config/scripts/paperclip-attention.js "$@"
fi
if [ -x /usr/local/bin/node ]; then
  exec /usr/local/bin/node /opt/mimoun/openclaw-config/scripts/paperclip-attention.js "$@"
fi
if [ -x /usr/bin/node ]; then
  exec /usr/bin/node /opt/mimoun/openclaw-config/scripts/paperclip-attention.js "$@"
fi
echo "node runtime not found" >&2
exit 127
