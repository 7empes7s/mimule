#!/bin/sh
set -eu
exec node /root/.openclaw/scripts/paperclip-api.js "$@"
