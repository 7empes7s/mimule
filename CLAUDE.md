# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Overview

This is the **MIMULE / TechInsiderBytes** stack — a personal AI-operated media company running on a Hetzner CX32 VPS (Ubuntu 24.04). The "repo" is effectively the entire VPS. Services are a mix of systemd-managed Node apps and Docker containers, all reverse-proxied by Caddy and externally exposed via Cloudflare Tunnel.

**Always read `/home/agent/MIMULE_MASTER_PLAN_V3.md` first.** It is the authoritative continuation file (V3 supersedes V2). Append a progress entry after every meaningful session (see the Append Protocol at the top of that file).

## Compaction Instructions

When compacting this conversation, always preserve:
- Modified file paths and what changed in them
- Current task context and which tasks are in_progress
- Pipeline state (queue, current story, last GPU error if any)
- Any commands that failed and why
- Open blockers or decisions pending from the user

---

## Services at a Glance

| Service | Type | Path | Port | Public URL |
|---|---|---|---|---|
| NewsBites | systemd (`newsbites.service`) | `/opt/newsbites/` | 3001 | news.techinsiderbytes.com |
| Paperclip | Docker (`paperclip`) | `/opt/paperclip/` | 3100 | paperclip.techinsiderbytes.com |
| OpenClaw/Mimule | Docker (`openclaw_gateway`) | `/opt/mimoun/` | 18789 | mimoun.techinsiderbytes.com |
| Goblin Game | Docker (`goblin_game`) | — | 9000 | goblin.techinsiderbytes.com |
| LiteLLM proxy | systemd (`litellm.service`) | `/etc/litellm/config.yaml` | 4000 | internal only |
| Autopipeline | systemd (`newsbites-autopipeline.service`) | editorial scripts | — | internal only |
| OpenCode | systemd (`opencode-server.service`) | — | 4096 | opencode.techinsiderbytes.com |
| Control Surface | systemd (`control-surface.service`) | `/opt/opencode-control-surface/` | 3000 | control.techinsiderbytes.com |
| Vast.ai tunnel | systemd (`vast-tunnel.service`) | autossh | 11434 | internal only (RTX 3090) |

---

## NewsBites (`/opt/newsbites/`)

The primary product. **Next.js 16 + React 19 + TypeScript + Tailwind CSS 4**, content-first app serving `news.techinsiderbytes.com`.

### Commands

```bash
# Development
cd /opt/newsbites
npm run dev          # Dev server on :3000

# Build & deploy (host only, requires systemctl)
./deploy.sh          # npm install + build + restart newsbites.service

# From container context — triggers host deploy over a socket
./trigger-deploy.sh

# Lint
npm run lint

# Publish an article from a dossier package
npm run publish:dossier
```

### Architecture

- **Content layer**: `lib/articles.ts` — reads markdown from `content/articles/`, parses frontmatter with `gray-matter`. Only `status: "approved"` or `status: "published"` articles appear on the live site. Drafts are invisible.
- **Routes** (App Router): `/` homepage, `/app` reader app, `/articles/[slug]`, `/category/[vertical]`, `/about`.
- **Reader app** (`/app`): Two modes — Focus (card-based) and Flow (TikTok-style vertical snap). Entry state driven by query params for deep-linking.
- **Verticals**: `ai`, `finance`, `global-politics`, `trends` (canonical); others are allowed via frontmatter.
- **Fonts**: Playfair Display + DM Sans (loaded via `next/font/google`). Brand colors: Navy `#1B2A4A`, Amber `#F5A623`.
- **Styling**: Tailwind v4 with custom semantic CSS classes in `app/globals.css`. Not utility-heavy markup.

### Article Frontmatter Schema

```yaml
title, slug, date, vertical, tags, status, lead, digest, coverImage, author
```

`digest` is the short-form summary shown in the `/app` reader. `lead` is the card/hero excerpt. These are separate fields — never conflate them.

### Important Note on Next.js Version

This is **Next.js 16** — it has breaking changes from earlier versions. Before writing any route or API code, check `node_modules/next/dist/docs/` for the relevant guide. Do not assume App Router behavior from your training data.

---

## Paperclip Editorial Pipeline (`/opt/paperclip/`)

Paperclip is an AI agent orchestration platform managing the editorial pipeline. Agents run inside the `paperclip` Docker container.

```bash
# Container management
cd /opt/paperclip
docker compose ps
docker compose logs paperclip --tail 50
docker compose restart paperclip

# Access Paperclip DB directly
docker exec -it paperclip_db psql -U paperclip -d paperclip
```

### Agent Adapter Status

| Adapter | CLI | Auth | Status |
|---|---|---|---|
| `gemini_local` | `gemini-litellm` shim | LiteLLM → Ollama (RTX 3090) | **Active** — all 7 editorial agents |
| `openclaw_gateway` | None (WebSocket) | gateway token | Active — Mimule only |
| `claude_local` | `claude` | `ANTHROPIC_API_KEY` | **EXHAUSTED** — do not assign |
| `codex_local` | `codex` | `OPENAI_API_KEY` | Terminated agent only |

**Model routing**: All agents use logical names (`editorial-fast` → qwen3:8b, `editorial-heavy` → qwen3:32b via LiteLLM at port 4000 → Vast.ai RTX 3090 via autossh tunnel on port 11434. Fallback: OpenRouter.

### 10-Stage Editorial Pipeline

Defined in `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/OPERATING_MODEL.md`:

`Source Registry → Scout → Assignment Desk → Research Dossier → Editorial Gate → Full Article Draft → Verification Pass → Lock Record → Derivative Packaging → Human Approval → Publish`

### Agent Definitions

On-disk JSON at `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/`. These must stay in sync with DB state — if you update DB adapter/model, update the JSON too.

### Dossier Artifacts

Every story must have a local dossier at `dossiers/YYYY-MM-DD/<slug>/`:
`DOSSIER.md`, `sources.json`, `claims.csv`, `draft.md`, `verify.md`, `digest.md`, `publish.md`

---

## OpenClaw / Mimule (`/opt/mimoun/`)

OpenClaw is the AI gateway. Mimule is the Telegram bot persona running on it.

```bash
# Container management
cd /opt/mimoun
docker compose ps
docker logs openclaw_gateway --tail 50
docker compose restart openclaw_gateway

# Mimule workspace
/opt/mimoun/openclaw-config/workspace/   # SOUL.md, AGENTS.md, TOOLS.md, MEMORY.md, etc.
/opt/mimoun/openclaw-config/openclaw.json  # Main gateway config
```

Mimule uses `google/gemini-2.5-flash` (free tier). Accessible only to Marouane (Telegram ID `7783532877`) via @MimuleBot. Every Telegram interaction must end with native inline keyboard buttons — see `SOUL.md` for the full button rules and `TELEGRAM_REPLY_TEMPLATES.md` for stable callback names.

---

## Automated Timers

| Timer | Interval | Purpose |
|---|---|---|
| `paperclip-action-notify` | Every 2 min | Telegram notifications for Paperclip actions |
| `newsbites-agent-watch` | Every 3 min | Agent guardrail watcher |
| `newsbites-brief` | Every 4 hours | Scout brief generation |
| `morning-brief` | Daily 07:00 UTC | Telegram morning brief |
| `mimule-backup` | Daily 04:00 UTC | Full stack backup to `/opt/backups/` |

---

## Infrastructure

- **Reverse proxy**: Caddy (port 80/443), config manages all subdomain routes
- **Cloudflare**: DNS + Zero Trust + Tunnel (cloudflared systemd service)
- **GitHub**: Repo `7empes7s/newsbites`, PAT in `/root/.profile` and `/opt/mimoun/.env`
- **Backups**: `/opt/backups/YYYY-MM-DD/` via `mimule-backup.service`

## Core Principles (from Master Plan)

- Cost control is first-class: cheap models (Haiku, Flash) for triage/extraction, strong models (Pro, Sonnet) only for synthesis/verification
- Verify before claiming done — always provide evidence
- Simpler architecture wins: fewer moving parts
- Human approval required for first-run publishing
- The `/app` reader is the primary product surface (short digest first); the main site `/` shows long-form articles behind explicit intent
