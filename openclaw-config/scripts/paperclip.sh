#!/bin/sh
set -eu

api() {
  sh /root/.openclaw/scripts/paperclip-api.sh "$@"
}

need_arg() {
  if [ $# -lt 1 ] || [ -z "${1:-}" ]; then
    echo "missing required argument" >&2
    exit 2
  fi
}

usage() {
  cat <<'EOF'
Usage:
  paperclip.sh company get
  paperclip.sh company update '<json>'
  paperclip.sh company branding '<json>'

  paperclip.sh issues list [query]
  paperclip.sh issues get <issue-id-or-key>
  paperclip.sh issues create '<json>'
  paperclip.sh issues update <issue-id> '<json>'
  paperclip.sh issues comments <issue-id>
  paperclip.sh issues comment <issue-id> '<body>'
  paperclip.sh issues approvals <issue-id>

  paperclip.sh agents me
  paperclip.sh agents list
  paperclip.sh agents get <agent-id>
  paperclip.sh agents create '<json>'
  paperclip.sh agents update <agent-id> '<json>'
  paperclip.sh agents pause <agent-id>
  paperclip.sh agents resume <agent-id>
  paperclip.sh agents terminate <agent-id>
  paperclip.sh agents wake <agent-id> ['<json>']
  paperclip.sh agents invoke <agent-id>
  paperclip.sh agents key <agent-id> ['<name>']

  paperclip.sh approvals list [status]
  paperclip.sh approvals get <approval-id>
  paperclip.sh approvals create '<json>'
  paperclip.sh approvals issues <approval-id>
  paperclip.sh approvals approve <approval-id> ['<decision-note>']
  paperclip.sh approvals reject <approval-id> ['<decision-note>']
  paperclip.sh approvals revision <approval-id> ['<decision-note>']
  paperclip.sh approvals comment <approval-id> '<body>'

  paperclip.sh attention all
  paperclip.sh attention tasks
  paperclip.sh attention approvals
  paperclip.sh attention issue <issue-id>
  paperclip.sh attention approval <approval-id>
  paperclip.sh telegram <paperclip_backlog|paperclip_tasks|paperclip_approvals|pc_issue:<id>|pc_appr:<id>>
EOF
}

company_id="${PAPERCLIP_COMPANY_ID:-}"
if [ -z "$company_id" ]; then
  echo "Missing PAPERCLIP_COMPANY_ID" >&2
  exit 1
fi

scope="${1:-}"
action="${2:-}"

if [ -z "$scope" ]; then
  usage
  exit 2
fi

if [ "$scope" = "telegram" ]; then
  shift 1
  need_arg "$@"
  sh /root/.openclaw/scripts/paperclip-telegram.sh "$1"
  exit 0
fi

if [ -z "$action" ]; then
  usage
  exit 2
fi

shift 2

case "$scope:$action" in
  company:get)
    api GET "companies/$company_id"
    ;;
  company:update)
    need_arg "$@"
    api PATCH "companies/$company_id" "$1"
    ;;
  company:branding)
    need_arg "$@"
    api PATCH "companies/$company_id/branding" "$1"
    ;;

  issues:list)
    query="${1:-}"
    if [ -n "$query" ]; then
      api GET "companies/$company_id/issues?$query"
    else
      api GET "companies/$company_id/issues"
    fi
    ;;
  issues:get)
    need_arg "$@"
    api GET "issues/$1"
    ;;
  issues:create)
    need_arg "$@"
    api POST "companies/$company_id/issues" "$1"
    ;;
  issues:update)
    if [ $# -lt 2 ]; then
      echo "usage: paperclip.sh issues update <issue-id> '<json>'" >&2
      exit 2
    fi
    api PATCH "issues/$1" "$2"
    ;;
  issues:comments)
    need_arg "$@"
    api GET "issues/$1/comments"
    ;;
  issues:comment)
    if [ $# -lt 2 ]; then
      echo "usage: paperclip.sh issues comment <issue-id> '<body>'" >&2
      exit 2
    fi
    api POST "issues/$1/comments" "{\"body\":$(
      printf '%s' "$2" | node -p 'JSON.stringify(require("fs").readFileSync(0,"utf8"))'
    )}"
    ;;
  issues:approvals)
    need_arg "$@"
    api GET "issues/$1/approvals"
    ;;

  agents:me)
    api GET "agents/me"
    ;;
  agents:list)
    api GET "companies/$company_id/agents"
    ;;
  agents:get)
    need_arg "$@"
    api GET "agents/$1"
    ;;
  agents:create)
    need_arg "$@"
    api POST "companies/$company_id/agents" "$1"
    ;;
  agents:update)
    if [ $# -lt 2 ]; then
      echo "usage: paperclip.sh agents update <agent-id> '<json>'" >&2
      exit 2
    fi
    api PATCH "agents/$1" "$2"
    ;;
  agents:pause)
    need_arg "$@"
    api POST "agents/$1/pause" '{}'
    ;;
  agents:resume)
    need_arg "$@"
    api POST "agents/$1/resume" '{}'
    ;;
  agents:terminate)
    need_arg "$@"
    api POST "agents/$1/terminate" '{}'
    ;;
  agents:wake)
    need_arg "$@"
    payload="${2:-{\"source\":\"on_demand\",\"triggerDetail\":\"manual\"}}"
    api POST "agents/$1/wakeup" "$payload"
    ;;
  agents:invoke)
    need_arg "$@"
    api POST "agents/$1/heartbeat/invoke" '{}'
    ;;
  agents:key)
    need_arg "$@"
    key_name="${2:-default}"
    api POST "agents/$1/keys" "{\"name\":$(
      printf '%s' "$key_name" | node -p 'JSON.stringify(require("fs").readFileSync(0,"utf8"))'
    )}"
    ;;

  approvals:list)
    status="${1:-}"
    if [ -n "$status" ]; then
      api GET "companies/$company_id/approvals?status=$status"
    else
      api GET "companies/$company_id/approvals"
    fi
    ;;
  approvals:get)
    need_arg "$@"
    api GET "approvals/$1"
    ;;
  approvals:create)
    need_arg "$@"
    api POST "companies/$company_id/approvals" "$1"
    ;;
  approvals:issues)
    need_arg "$@"
    api GET "approvals/$1/issues"
    ;;
  approvals:approve)
    need_arg "$@"
    if [ $# -ge 2 ]; then
      api POST "approvals/$1/approve" "{\"decisionNote\":$(
        printf '%s' "$2" | node -p 'JSON.stringify(require("fs").readFileSync(0,"utf8"))'
      )}"
    else
      api POST "approvals/$1/approve" '{}'
    fi
    ;;
  approvals:reject)
    need_arg "$@"
    if [ $# -ge 2 ]; then
      api POST "approvals/$1/reject" "{\"decisionNote\":$(
        printf '%s' "$2" | node -p 'JSON.stringify(require("fs").readFileSync(0,"utf8"))'
      )}"
    else
      api POST "approvals/$1/reject" '{}'
    fi
    ;;
  approvals:revision)
    need_arg "$@"
    if [ $# -ge 2 ]; then
      api POST "approvals/$1/request-revision" "{\"decisionNote\":$(
        printf '%s' "$2" | node -p 'JSON.stringify(require("fs").readFileSync(0,"utf8"))'
      )}"
    else
      api POST "approvals/$1/request-revision" '{}'
    fi
    ;;
  approvals:comment)
    if [ $# -lt 2 ]; then
      echo "usage: paperclip.sh approvals comment <approval-id> '<body>'" >&2
      exit 2
    fi
    api POST "approvals/$1/comments" "{\"body\":$(
      printf '%s' "$2" | node -p 'JSON.stringify(require("fs").readFileSync(0,"utf8"))'
    )}"
    ;;

  attention:all)
    sh /root/.openclaw/scripts/paperclip-attention.sh all
    ;;
  attention:tasks)
    sh /root/.openclaw/scripts/paperclip-attention.sh tasks
    ;;
  attention:approvals)
    sh /root/.openclaw/scripts/paperclip-attention.sh approvals
    ;;
  attention:issue)
    need_arg "$@"
    sh /root/.openclaw/scripts/paperclip-attention.sh issue "$1"
    ;;
  attention:approval)
    need_arg "$@"
    sh /root/.openclaw/scripts/paperclip-attention.sh approval "$1"
    ;;

  *)
    usage
    exit 2
    ;;
esac
