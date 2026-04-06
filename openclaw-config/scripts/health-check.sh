#!/bin/sh
set -eu

check() {
  name="$1"
  url="$2"
  if body="$(curl -fsS "$url")"; then
    printf '%s\tOK\t%s\n' "$name" "$body"
  else
    printf '%s\tFAIL\t%s\n' "$name" "$url"
    return 1
  fi
}

check "gateway" "http://127.0.0.1:18789/health"
check "paperclip" "http://127.0.0.1:3100/api/health"
