# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Overview

This is the **MIMULE / TechInsiderBytes** stack — a personal AI-operated media company running on a Hetzner CX32 VPS (Ubuntu 24.04). The "repo" is effectively the entire VPS. Services are a mix of systemd-managed Node apps and Docker containers, reverse-proxied by Caddy and exposed via Cloudflare Tunnel.

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
| TIB Markets | systemd (`tib-markets.service`) | `/opt/tib-markets/` | 3500 | finance.techinsiderbytes.com |
| Paperclip | Docker (`paperclip`) | `/opt/paperclip/` | 3100 | paperclip.techinsiderbytes.com |
| OpenClaw/Mimule | Docker (`openclaw_gateway`) | `/opt/mimoun/` | 18789 | mimoun.techinsiderbytes.com |
| Goblin Game | Docker (`goblin_game`) | — | 9000 | goblin.techinsiderbytes.com |
| LiteLLM proxy | systemd (`litellm.service`) | `/etc/litellm/config.yaml` | 4000 | internal only |
| Autopipeline | systemd (`newsbites-autopipeline.service`) | editorial scripts | 3200 (HTTP API) | internal only |
| OpenCode | systemd (`opencode-server.service`) | — | 4096 | opencode.techinsiderbytes.com |
| Control Surface | systemd (`control-surface.service`) | `/opt/opencode-control-surface/` | 3000 | control.techinsiderbytes.com |
| Vast.ai tunnel | systemd (`vast-tunnel.service`) | autossh | 11434 | internal only (RTX 3090) |

---

## Model Routing (LiteLLM at :4000)

**Config**: `/etc/litellm/config.yaml` — **this is always authoritative**. Use logical model names, never backend names.

### Local GPU Models (RTX 3090 via Vast.ai tunnel on :11434)

| Logical name | Backend | Timeout | Use for |
|---|---|---|---|
| `editorial-heavy` | gemma4:26b | 600s | Research, writing, verification |
| `editorial-fast` | gemma4:26b | 300s | Triage, editing, light tasks |
| `routing-cheap` | gemma4:26b | 120s | Classification, routing decisions |
| `mimule-chat` | qwen3:8b | 300s | Telegram bot only (Gemma leaked raw tokens) |
| `coding-heavy` | gemma4:26b | 600s | Code edits — **no fallback, fail loud** |
| `coding-fast` | qwen2.5-coder:32b | 300s | Small code edits — **no fallback, fail loud** |

**Gemma4 26B** is the primary model for all editorial work — 2–3x faster than qwen3:32b, same quality, 100% GPU at 16K context. qwen3:8b kept for Telegram only (Gemma leaked raw tokens in /new path).

### Cloud Models (for editorial pipeline when GPU is busy or down)

| Logical name | Primary backend | Notes |
|---|---|---|
| `editorial-cloud-heavy` | DeepSeek-chat-v3:free via OpenRouter | 60s timeout; primary for research/write |
| `editorial-cloud-fast` | gemma4-31b:free via OpenRouter | 60s timeout; for publish-prep |
| `github-gpt41` | GPT-4.1 via GitHub Models (Azure) | Reliable paid fallback, 120s |
| `openrouter-nemotron-120b-free` | nvidia/nemotron-3-super-120b:free | ~1–2s, excellent |
| `openrouter-gemma4-31b-free` | google/gemma-4-31b-it:free | Good, sometimes rate-limited |
| `openrouter-minimax-free` | minimax/minimax-m2.5:free | Good for long context |
| `openrouter-gemma4-26b-free` | google/gemma-4-26b:free | Auto-discovered |
| `openrouter-arcee-trinity-free` | arcee-ai/trinity-large-preview:free | Auto-discovered |
| `openrouter-liquid-lfm-free` | liquid/lfm-2.5-1.2b-thinking:free | Very fast, smaller |
| `gemini-flash` / `gemini-pro` | OpenRouter | Fallback only |

**Cloud fallback chain (heavy)**: nemotron → github-gpt41 → gemma4-31b-free → gemma4-26b-free → arcee-trinity → liquid-lfm → minimax → local editorial-heavy

**Dynamic model selection**: Autopipeline reads `/var/lib/mimule/model-health.json` (written every 5h by model-health-check.timer) and picks the currently-fastest available model via `getCloudModel("heavy"/"fast")`. Falls back to defaults if health file is stale (>6h).

**API notes**: Google Direct (GEMINI_API_KEY) and OpenAI Direct hit spending caps 2026-04-11 — use OpenRouter variants. GitHub Models is the most reliable paid fallback.

---

## NewsBites (`/opt/newsbites/`)

Next.js 16 + React 19 + TypeScript + Tailwind CSS 4. Live at `news.techinsiderbytes.com`.

### Commands

```bash
cd /opt/newsbites
./deploy.sh           # npm install + build + restart newsbites.service
npm run dev           # Dev server on :3000
npm run lint
npm run publish:dossier  # Publish from a dossier package
```

### Architecture

- **Content**: `lib/articles.ts` — reads `content/articles/` markdown, only `status: "approved"/"published"` appear live
- **Routes** (App Router): `/` homepage, `/app` reader app, `/articles/[slug]`, `/category/[vertical]`, `/about`
- **Reader app** (`/app`): Focus (card-based) and Flow (TikTok-style vertical snap) modes. Deep-linkable via query params.
- **Panels**: `lib/panels/registry.tsx` — sports, finance, world, climate. Embedded via `panel_hints` in frontmatter.
- **Verticals**: `ai`, `finance`, `global-politics`, `trends`, `science`, `wellness`, `culture`, `sports`
- **Fonts**: Playfair Display + DM Sans. Brand: Navy `#1B2A4A`, Amber `#F5A623`.
- **Styling**: Tailwind v4 with semantic CSS in `app/globals.css`.

### Article Frontmatter Schema

```yaml
title, slug, date, vertical, tags, status, lead, digest, coverImage, author
```

`digest` = short-form for `/app` reader. `lead` = card/hero excerpt. Never conflate.

**Do not set `status: published` manually** — use `npm run publish:dossier` or the autopipeline.

---

## Editorial Pipeline

### Autopipeline (`newsbites-autopipeline.service`)

Continuous event loop at `.../newsbites_editorial/scripts/newsbites-autopipeline.mjs`.

**HTTP API**: `http://127.0.0.1:3200`
```bash
curl -s http://127.0.0.1:3200/queue
curl -s -X POST http://127.0.0.1:3200/command -H "Content-Type: application/json" \
  -d '{"cmd":"add","topic":"UK inflation March 2026","vertical":"finance"}'
# Inject dossier at specific stage (after manual work):
curl -s -X POST http://127.0.0.1:3200/command \
  -d '{"cmd":"inject","dossierDir":"/path/to/dossier","stage":"write"}'
```

**Stage routing**:
- `CLOUD_STAGES` (parallel, up to 3 concurrent): `research`, `write`, `publish-prep`
- `GPU_32B_STAGES` (sequential, GPU mutex): `verify`
- `GPU_8B_STAGES` (sequential): `scout`, `rank`

**Model selection for cloud stages** is dynamic — reads model health file every call.

**Auto-publish verticals**: `ai, trends, science, finance, global-politics, healthcare, culture, energy, climate, cybersecurity, economy, crypto`

**Dossier artifacts**: `dossiers/YYYY-MM-DD/<slug>/` — `DOSSIER.md`, `sources.json`, `draft.md`, `publish.md`, `TASK.md`

### Small-desk-agent

`scripts/small-desk-agent.mjs` — runs individual pipeline stages:
```bash
node small-desk-agent.mjs run --mode=research --dossier-dir=/path --backend=litellm --model=editorial-cloud-heavy --timeout-ms=600000
node small-desk-agent.mjs run --mode=write --dossier-dir=/path --backend=litellm --model=editorial-cloud-heavy
node small-desk-agent.mjs run --mode=publish-prep --dossier-dir=/path --backend=litellm --model=editorial-cloud-fast
```
Backends: `litellm`, `ollama`, `claude`, `codex`

---

## Paperclip (`/opt/paperclip/`)

Docker agent orchestration platform. Agents use `gemini_local` adapter → `gemini-litellm` shim → LiteLLM → GPU.

```bash
cd /opt/paperclip && docker compose ps
docker compose logs paperclip --tail 50
docker compose restart paperclip
docker exec -it paperclip_db psql -U paperclip -d paperclip
```

### Adapter Status

| Adapter | CLI | Status |
|---|---|---|
| `gemini_local` | `gemini-litellm` shim | **Active** — all 7 editorial agents |
| `openclaw_gateway` | WebSocket | Active — Mimule only |
| `claude_local` | `claude` | **EXHAUSTED** — do not assign |
| `codex_local` | `codex` | Terminated agent only |

**Verification agent ID**: `cee5f7de-c677-42fb-8077-6a12693fc65d`

---

## OpenClaw / Mimule (`/opt/mimoun/`)

```bash
cd /opt/mimoun && docker compose ps
docker logs openclaw_gateway --tail 50
docker compose restart openclaw_gateway
```

**Telegram**: @MimuleBot — only Marouane (ID `7783532877`). Every interaction MUST end with native inline keyboard buttons. Read `SOUL.md` for rules, `TELEGRAM_REPLY_TEMPLATES.md` for callback names.

**Model**: `mimule-chat` → qwen3:8b (not Gemma4 — leaked raw tokens in /new path)

---

## Model Health Check

**Script**: `/opt/mimoun/scripts/model-health-check.mjs`
**Timer**: `model-health-check.timer` — every 5 hours + 5min after boot

```bash
systemctl start model-health-check.service    # run immediately
journalctl -u model-health-check.service -n 50
cat /var/lib/mimule/model-health.json | python3 -m json.tool
```

---

## Automated Timers

| Timer | Interval | Purpose |
|---|---|---|
| `model-health-check.timer` | Every 5 hours | Test all models, discover new free ones |
| `paperclip-action-notify` | Every 2 min | Telegram notifications for Paperclip actions |
| `newsbites-agent-watch` | Every 3 min | Agent guardrail watcher |
| `newsbites-brief` | Every 4 hours | Scout brief generation |
| `morning-brief` | Daily 07:00 UTC | Telegram morning brief |
| `mimule-backup` | Daily 04:00 UTC | Full stack backup to `/opt/backups/` |
| `vast-watchdog` | Every 60s | GPU tunnel health probe |

---

## Key File Locations

| What | Path |
|---|---|
| Master plan | `/home/agent/MIMULE_MASTER_PLAN_V3.md` |
| AI Vault | `/opt/ai-vault/` |
| Articles | `/opt/newsbites/content/articles/` |
| Editorial scripts | `.../newsbites_editorial/scripts/` |
| Editorial prompts | `.../newsbites_editorial/prompts/small-model/` |
| Agent definitions | `.../newsbites_editorial/agent_definitions/` |
| LiteLLM config | `/etc/litellm/config.yaml` |
| LiteLLM env | `/etc/litellm/litellm.env` |
| Pipeline state | `/var/lib/mimule/pipeline-state.json` |
| Model health | `/var/lib/mimule/model-health.json` |
| GPU health | `/var/lib/mimule/gpu-health.json` |
| Autopipeline env | `/etc/default/newsbites-autopipeline` |
| Mimule ops scripts | `/opt/mimoun/scripts/` |
| Vault helpers | `/opt/mimoun/openclaw-config/scripts/vault.sh` |
| GPU SSH key | `/root/.ssh/vast_gpu` |
| Vast SSH | `root@209.146.116.50 -p 30583` (SSH port; tunnel uses same IP) |

---

## Infrastructure

- **Reverse proxy**: Caddy (80/443) at `/etc/caddy/Caddyfile`
- **Cloudflare**: DNS + Zero Trust + Tunnel (`cloudflared.service`)
- **GitHub**: Repo `7empes7s/newsbites`, PAT in `/root/.profile` and `/opt/mimoun/.env`
- **Backups**: `/opt/backups/YYYY-MM-DD/` via `mimule-backup.service`
- **GPU instance**: Vast.ai instance `35735457`, RTX 3090 24GB, `$0.138/hr`

## Core Principles

- **GPU-first**: prefer local GPU over cloud; cloud is the fallback when GPU is busy or down
- **Cost control**: cheap models for triage/extraction, strong models only for synthesis/verification
- **Verify before claiming done** — always provide evidence
- **Simpler architecture wins**: fewer moving parts
- **Human approval** required for sensitive verticals (first run)
- **The `/app` reader** is the primary product surface

## Coding Agent Rules

- **Never touch `/opt/newsbites` without explicit instruction** — it is live at news.techinsiderbytes.com
- **Never assign `claude_local` adapter** — Anthropic credits exhausted
- **Never commit `.env`, `.key`, `.pem`, or credential files**
- **Never force-push to main/master**
- **Deploy**: `cd /opt/newsbites && ./deploy.sh` — always run after any code change
- **Model routing**: use logical names (`editorial-fast`, `editorial-heavy`, `mimule-chat`) — never hardcode backend names
- **LiteLLM config** is the authority for model routing
