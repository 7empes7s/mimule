# TOOLS.md - Mimule Environment Notes

## Core Stack
- VPS: Hetzner CX32, Ubuntu 24.04, `178.104.120.71`
- Domain: `*.techinsiderbytes.com`
- Reverse proxy: Caddy via `/etc/caddy/Caddyfile`
- Primary operator channel: Telegram via `@MimuleBot`

## Active Services
- OpenClaw gateway: `/opt/mimoun`, local port `18789`
- Goblin game: `/opt/mimoun/projects/goblin-goldmine`, local port `9000`
- Paperclip: `/opt/paperclip`, local port `3100`
- NewsBites: live at `/opt/newsbites`, served publicly at `news.techinsiderbytes.com`

## GitHub
- Owner: `7empes7s`
- Main Mimule repo: `7empes7s/babamimoun`
- NewsBites repo remote configured locally as `https://github.com/7empes7s/newsbites.git`
- Note: first push from this box was previously blocked by missing GitHub auth

## Models And Cost Tiers
- Default low-cost operator model: `google/gemini-2.5-flash`
- Premium escalation tier: Claude Sonnet class only when the cheaper path is inadequate
- OpenClaw routing policy: direct provider keys for now
- Paperclip routing policy: OpenRouter only

## Known Constraints
- Telegram buttons must be native OpenClaw Telegram actions to appear as clickable inline buttons.
- The running gateway is in Docker and the agent should not assume `openclaw` is available in PATH during tool execs.
- The running gateway image does not include `curl` or the Docker CLI in PATH.
- For on-demand infrastructure status, use `sh /root/.openclaw/scripts/status-report.sh` instead of raw `curl` or `docker` commands.
- For authenticated Paperclip control from Mimule, use `sh /root/.openclaw/scripts/paperclip-api.sh ...`.
- Paperclip auth for Mimule is a dedicated long-lived agent API key stored in gateway environment variables, not browser cookies.
- NewsBites is already deployed and reverse proxied through Caddy.
- Paperclip is healthy, but the editorial-agent simplification work is still pending.
- Do not modify `/opt/newsbites` from Mimule/Paperclip operations work unless Marouane explicitly requests NewsBites changes in that session.

## Paperclip Control Path
- Base API: `http://host.docker.internal:3100/api`
- Active company id for Mimule control: `92de899d-c83d-49bb-9d96-7f98b85ec5fb`
- Active Paperclip agent identity for Mimule: `4a2fdefb-4a65-465c-9939-a271a374c090`
- Preferred operator entrypoint:
  `sh /root/.openclaw/scripts/paperclip.sh ...`
- Real hire-request route when board approval is required:
  `POST /api/companies/{companyId}/agent-hires`
- Verify auth:
  `docker exec openclaw_gateway sh -lc 'sh /root/.openclaw/scripts/paperclip-api.sh GET /agents/me'`
- Read current company:
  `docker exec openclaw_gateway sh -lc 'sh /root/.openclaw/scripts/paperclip.sh company get'`
- Update company branding:
  `docker exec openclaw_gateway sh -lc 'sh /root/.openclaw/scripts/paperclip.sh company branding "{\"name\":\"Tech Insider Bytes\"}"'`
- List agents:
  `docker exec openclaw_gateway sh -lc 'sh /root/.openclaw/scripts/paperclip.sh agents list'`
- List issues:
  `docker exec openclaw_gateway sh -lc 'sh /root/.openclaw/scripts/paperclip.sh issues list'`
- List approvals:
  `docker exec openclaw_gateway sh -lc 'sh /root/.openclaw/scripts/paperclip.sh approvals list'`
- List Marouane-actionable Paperclip items:
  `docker exec openclaw_gateway sh -lc 'sh /root/.openclaw/scripts/paperclip.sh attention all'`
- Render Telegram callback screens deterministically:
  `docker exec openclaw_gateway sh -lc 'sh /root/.openclaw/scripts/paperclip.sh telegram paperclip_backlog'`

## Paperclip Action Notifications
- Notifier script:
  `/opt/mimoun/openclaw-config/scripts/paperclip-attention.sh`
- Action-state file:
  `/opt/mimoun/openclaw-config/telegram/paperclip-action-state.json`
- Host notifier env:
  `/opt/mimoun/paperclip-action-notify.env`
- Scheduler:
  `paperclip-action-notify.timer`
- Current policy:
  only unread Paperclip issues assigned directly to Marouane
  only pending Paperclip approvals requiring board action
  dedupe by item id plus latest status/update fingerprint
  send native Telegram inline buttons through the existing Mimule bot
  use calm empty-state messaging when there is nothing actionable

## Current Paperclip Agents
- `Mimule` - CEO operator, company control surface
- `NewsBites Editor` - approved, active
- `NewsBites Researcher` - approved, active

## Telegram Approval Actions
- Approval detail screens now support:
  - `Approve`
  - `Changes`
  - `Reject`
- These actions use board-authenticated Paperclip API writes from the rendered Telegram callback path.

## Operational Priorities
1. Keep Mimule stable and truthful.
2. Keep costs low.
3. Keep Telegram tap-first.
4. Keep Paperclip approvals, backlog, and action-needed Telegram flow reliable.
5. Leave the live NewsBites site alone unless explicitly asked to change it.

## Verification Shortcuts
- OpenClaw config validation:
  `docker exec openclaw_gateway sh -lc 'node $(find /usr/local/lib/node_modules -name openclaw.mjs | head -1) config validate --json'`
- OpenClaw status:
  `docker exec openclaw_gateway sh -lc 'node $(find /usr/local/lib/node_modules -name openclaw.mjs | head -1) status'`
- Gateway health:
  `curl http://127.0.0.1:18789/health`
- Paperclip health:
  `curl http://127.0.0.1:3100/api/health`
- On-demand full status:
  `sh /root/.openclaw/scripts/status-report.sh`
