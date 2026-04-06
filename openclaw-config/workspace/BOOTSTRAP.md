# BOOTSTRAP.md

Fresh-session rules for Mimule:

- Read `SOUL.md`, `USER.md`, `MEMORY.md`, today's memory note, and yesterday's memory note before doing meaningful work.
- Read `MASTER_PLAN.md` before major operational work.
- If the channel is Telegram, read `TELEGRAM_REPLY_TEMPLATES.md` before replying.
- On `/start` or `/new` in Telegram DM, return `Ready.` only, then use native Telegram inline buttons.
- Do not use fake bracket buttons like `[Approve] [Reject]` or `[[Approve]]`.
- When Telegram inline buttons are available, prefer a native message action with a `buttons` matrix.
- Callback handling rules:
  - `health` must run `sh /root/.openclaw/scripts/status-report.sh` and summarize the live results.
  - `morning_brief` must run `sh /root/.openclaw/scripts/status-report.sh` first for system health.
  - `paperclip_backlog` must run `sh /root/.openclaw/scripts/paperclip.sh telegram paperclip_backlog`, parse the stdout JSON, call the Telegram `message` tool with that exact `message` and `buttons`, then return `NO_REPLY`.
  - `paperclip_tasks` must run `sh /root/.openclaw/scripts/paperclip.sh telegram paperclip_tasks`, parse the stdout JSON, call the Telegram `message` tool with that exact `message` and `buttons`, then return `NO_REPLY`.
  - `paperclip_approvals` must run `sh /root/.openclaw/scripts/paperclip.sh telegram paperclip_approvals`, parse the stdout JSON, call the Telegram `message` tool with that exact `message` and `buttons`, then return `NO_REPLY`.
  - `pc_issue:<uuid>` must run `sh /root/.openclaw/scripts/paperclip.sh telegram pc_issue:<uuid>`, parse the stdout JSON, call the Telegram `message` tool with that exact `message` and `buttons`, then return `NO_REPLY`.
  - `pc_appr:<uuid>` must run `sh /root/.openclaw/scripts/paperclip.sh telegram pc_appr:<uuid>`, parse the stdout JSON, call the Telegram `message` tool with that exact `message` and `buttons`, then return `NO_REPLY`.
  - `pc_appr_ok:<uuid>`, `pc_appr_rev:<uuid>`, and `pc_appr_no:<uuid>` must follow the same render -> parse -> Telegram `message` -> `NO_REPLY` path.
  - For those Paperclip callbacks, never paste raw JSON into the chat and never follow up with a generic prose reply.
  - Never ask to install `curl`.
  - Never ask to locate `docker`.
  - Never claim health is blocked just because `curl` or `docker` are not in PATH.

Required Telegram bootstrap target:

```json
{
  "action": "send",
  "channel": "telegram",
  "to": "7783532877",
  "message": "Ready.",
  "buttons": [
    [
      { "text": "Backlog", "callback_data": "paperclip_backlog" },
      { "text": "Morning brief", "callback_data": "morning_brief" }
    ],
    [
      { "text": "Health", "callback_data": "health" },
      { "text": "Custom reply", "callback_data": "custom_reply" }
    ]
  ]
}
```

Paperclip callback execution example:

1. Run:
   `sh /root/.openclaw/scripts/paperclip.sh telegram paperclip_backlog`
2. Parse the stdout JSON into fields like:
   - `message`
   - `buttons`
3. Call the Telegram `message` tool with:
   - `action: "send"`
   - `channel: "telegram"`
   - `target: "7783532877"`
   - the parsed `message`
   - the parsed `buttons`
4. Return `NO_REPLY`

Never send the raw JSON blob itself as assistant text.
