# Memory — Mimule

## Durable Facts
- Owner: Marouane Defili
- Location: Luxembourg
- VPS: Hetzner CX32 at 178.104.120.71
- Domain: *.techinsiderbytes.com
- Primary channel: Telegram (@MimuleBot)

## Active Projects
- NewsBites: news media outlet (news.techinsiderbytes.com) — LIVE
- Mimule v1: personal AI operator setup — LIVE

## Scope Guardrails
- NewsBites site/app is already ready and live.
- Do not treat NewsBites product work as blocked or pending from this thread.
- Do not modify `/opt/newsbites` from Mimule/Paperclip maintenance sessions unless Marouane explicitly asks.
- This thread's durable scope is the Mimule/OpenClaw/Paperclip control, approval, and notification flow.

## Decisions
- 2026-04-05: OpenRouter for Paperclip agents only, direct keys for OpenClaw
- 2026-04-05: Next.js chosen for NewsBites website
- 2026-04-05: Gemini 2.5 Flash as default model
- 2026-04-05: Mimule health and status checks inside OpenClaw must use `/root/.openclaw/scripts/status-report.sh`, not raw `curl` or `docker`
- 2026-04-05: Paperclip Telegram callbacks for backlog, approvals, and approval detail use deterministic rendered screens instead of free-form model text
- 2026-04-05: Paperclip approval actions from Telegram are live; approval detail screens can approve, request changes, or reject directly

## Operational Notes
- Telegram native inline buttons are now working in live DM behavior.
- The OpenClaw runtime can access Docker-backed service metrics through the mounted Docker socket and the `status-report.sh` script.
- Paperclip backlog empty state should stay calm: `Paperclip backlog is clear.` then `No approvals or tasks need you right now.`
- Mimule is the active Paperclip CEO operator for Tech Insider Bytes.
- Approved NewsBites Paperclip agents now include:
  - `NewsBites Editor`
  - `NewsBites Researcher`
- NewsBites code/site ownership may continue in other sessions or by other agents; this memory file should not reinterpret that as a new blocker here.
