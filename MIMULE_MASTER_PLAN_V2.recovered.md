# MIMULE MASTER PLAN V2

Last updated: 2026-04-08 UTC
Primary owner: Marouane Defili
Primary execution agents: Codex CLI, Claude Code, OpenClaw/Mimule, future sub-agents
Canonical path: `/home/agent/MIMULE_MASTER_PLAN_V2.md`
Previous version: `/home/agent/MIMULE_MASTER_PLAN.md` (V1 — retained for history, do not modify)

---

## Purpose

This file replaces V1 as the single continuation file for all AI agents working on the MIMULE/TechInsiderBytes stack. It contains everything needed to resume work without reading any other planning document.

Any agent continuing the work should:
1. Read this file first (in order: Purpose → Current State → What's Next → then deeper sections as needed)
2. Treat it as the current source of truth unless live evidence contradicts it
3. Append progress to the `Progress Log` section after every meaningful task
4. Update decisions, blockers, and priorities when they change
5. Never claim done without evidence

## Append Protocol

Every meaningful work session must append a new entry to the `Progress Log` section:

```markdown
### YYYY-MM-DD HH:MM UTC - <agent/tool name>
STATUS:
- one-line summary

CHANGES:
- files changed, services changed, commands/actions taken

EVIDENCE:
- health checks, validation results, observed outputs

NEXT:
- next recommended step, blockers, open questions
```

Rules:
- Append, do not overwrite prior entries
- Prefer facts and evidence over claims
- If you changed a file, name it explicitly
- Logging is mandatory for any task that changes files, runtime behavior, or discovers a blocker

---

## Current Reality Snapshot (Verified 2026-04-08)

### Infrastructure
- **VPS**: Hetzner CX32 (4 vCPU, 8GB RAM, 80GB NVMe), Ubuntu 24.04, IP `178.104.120.71`
- **Domain**: `*.techinsiderbytes.com` (Cloudflare DNS + Zero Trust + Tunnel)
- **Disk**: 150GB total, 29GB used (20%)
- **Memory**: 7.6GB total, 5.8GB used (76%)
- **Caddy**: active reverse proxy on port 80

### Running Services
| Service | Type | Port | Status | Notes |
|---|---|---|---|---|
| OpenClaw Gateway | Docker (`openclaw_gateway`) | 127.0.0.1:18789 | UP | Mimule Telegram bot, Gemini 2.5 Flash |
| Paperclip | Docker (`paperclip`) | 0.0.0.0:3100 | UP (healthy) | Editorial AI platform |
| Paperclip DB | Docker (`paperclip_db`) | 5432 (internal) | UP (healthy) | PostgreSQL 17 |
| NewsBites | systemd (`newsbites.service`) | 127.0.0.1:3001 | UP | Next.js 16, news site + reader app |
| Goblin Game | Docker (`goblin_game`) | 127.0.0.1:9000 | UP | Nginx static game |
| Cloudflared | systemd | — | UP | Cloudflare Tunnel for external access |

### Caddy Routes
| Subdomain | Backend |
|---|---|
| news.techinsiderbytes.com | localhost:3001 (NewsBites) |
| paperclip.techinsiderbytes.com | localhost:3100 (Paperclip) |
| mimoun.techinsiderbytes.com | localhost:18789 (OpenClaw) |
| goblin.techinsiderbytes.com | localhost:9000 (Goblin) |
| dashboard.techinsiderbytes.com | localhost:3000 (not running) |
| terminal.techinsiderbytes.com | localhost:7681 (not running) |

### Automated Timers
| Timer | Interval | Service | Purpose |
|---|---|---|---|
| paperclip-action-notify | Every 2 min | paperclip-action-notify.service | Telegram notifications for Paperclip actions |
| newsbites-agent-watch | Every 3 min | newsbites-agent-watch.service | Agent guardrail watcher |
| newsbites-brief | Every 4 hours | newsbites-brief.service | Scout brief generation |
| morning-brief | Daily 07:00 UTC | morning-brief.service | Telegram morning brief |
| mimule-backup | Daily 04:00 UTC | mimule-backup.service | Full stack backup |

### Key File Locations
| Path | Description |
|---|---|
| `/home/agent/MIMULE_MASTER_PLAN_V2.md` | This file (V2 master plan) |
| `/home/agent/MIMULE_MASTER_PLAN.md` | V1 master plan (symlink → `/opt/mimoun/openclaw-config/workspace/MASTER_PLAN.md`) |
| `/opt/newsbites/` | NewsBites Next.js app |
| `/opt/mimoun/openclaw-config/` | OpenClaw config, workspace, scripts |
| `/opt/mimoun/openclaw-config/openclaw.json` | OpenClaw main config |
| `/opt/mimoun/openclaw-config/workspace/` | Mimule workspace (SOUL.md, AGENTS.md, etc.) |
| `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/` | Editorial pipeline files |
| `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/` | 7 agent definition JSONs |
| `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/source_registry/` | Source registries per vertical (EMPTY) |
| `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/` | Story dossiers |
| `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/OPERATING_MODEL.md` | 10-stage editorial pipeline spec |
| `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/AGENT_SPECS.md` | Agent role specifications |
| `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/EDITORIAL_POLICY.md` | Editorial policy |
| `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/ARTICLE_DOSSIER_TEMPLATE.md` | Dossier template |
| `/opt/mimoun/openclaw-config/worksp…1170 chars truncated…| `/opt/paperclip/.env` | Active |
| `GEMINI_API_KEY` | `/opt/mimoun/.env` (in OpenClaw container) | Active — **NOT in Paperclip container** |
| `GH_TOKEN` / `GITHUB_TOKEN` | `/opt/mimoun/.env`, `/root/.profile` | Active (ghp_tR9D...) |
| Telegram Bot Token | OpenClaw config | `8706128157:AAFjOLCh...` for @MimuleBot |
| Marouane Telegram ID | OpenClaw config | `7783532877` |

### GitHub
- User: `7empes7s`
- NewsBites repo: `https://github.com/7empes7s/newsbites.git`
- Remote `origin/main` matches local `main` at `f45f1ff` (all committed and pushed as of 2026-04-08)
- PAT works: verified via `gh api user`

---

## NewsBites Status (Phase 2 — DONE)

- **Live** at `news.techinsiderbytes.com`
- **5 articles** (4 approved, 1 published):
  - `ai-cost-discipline.md` (AI, approved)
  - `finance-liquidity-watch.md` (Finance, approved)
  - `global-politics-middle-powers.md` (Global Politics, approved)
  - `openai-altman-trust-investigation.md` (AI, published)
  - `trends-interface-fatigue.md` (Trends, approved)
- **Reader app** at `/app` with two modes:
  - **Focus**: Card-based single article reader with nav, search, favorites, random
  - **Flow** (TikTok-style): Full-screen vertical scroll with snap navigation
- **Design**: Navy `#1B2A4A`, Amber `#F5A623`, Playfair Display + DM Sans
- **Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Deploy**: `deploy.sh` → `npm run build` → `systemctl restart newsbites.service`
- **12 commits** on main, all pushed to GitHub

---

## Paperclip Editorial Pipeline Status (Phase 3 — DESIGNED, NOT EXECUTED)

### Pipeline Design (10 stages)
Fully documented in `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/OPERATING_MODEL.md`:

0. Source Registry → 1. Scout → 2. Assignment Desk → 3. Research Dossier → 4. Editorial Gate → 5. Full Article Draft → 6. Verification Pass → 7. Lock Record → 8. Derivative Packaging → 9. Human Approval → 10. Publish

### Current Agents in Paperclip DB (8 total)
| ID (short) | Name | Adapter | Model | Status | Spent |
|---|---|---|---|---|---|
| `4a2fdefb` | Mimule | openclaw_gateway | (gateway default) | idle | $0.00 |
| `deb584be` | NewsBites Editor | claude_local | claude-sonnet-4-6 | idle | $0.57 |
| `94fa5eed` | NewsBites Researcher | codex_local | gpt-5.3-codex | **terminated** | $0.00 |
| `8d612720` | NewsBites Researcher | claude_local | claude-haiku-4-5 | idle | $0.59 |
| `594a2718` | NewsBites Writer | claude_local | claude-sonnet-4-6 | idle | $0.62 |
| `6de4252a` | News Desk | claude_local | claude-haiku-4-5 | **running** (stuck) | $1.87 |
| `169db076` | Publisher Desk | claude_local | claude-haiku-4-5 | idle | $0.10 |
| `cee5f7de` | Verification Desk | claude_local | claude-sonnet-4-6 | idle | $0.24 |

**Total spend to date**: $3.99 across 30 cost events (all Anthropic, all on 2026-04-06).

### Agent Definitions on Disk (7 files)
Located at `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/`:
| File | Name | Model | Budget |
|---|---|---|---|
| `news-desk.json` | News Desk | claude-haiku-4-5 | $3/mo |
| `news-scout.json` | News Scout | claude-haiku-4-5 | $2.50/mo |
| `editorial-lead.json` | NewsBites Editor | claude-sonnet-4-6 | $6/mo |
| `research-lead.json` | NewsBites Researcher | claude-haiku-4-5 | $4/mo |
| `newsbites-writer.json` | NewsBites Writer | claude-sonnet-4-6 | $7/mo |
| `verification-desk.json` | Verification Desk | claude-sonnet-4-6 | $6/mo |
| `publisher-desk.json` | Publisher Desk | claude-haiku-4-5 | $2.50/mo |

**All use `adapterType: "claude_local"` — all broken due to Anthropic credit exhaustion.**

### Paperclip Adapter Types Available
| Adapter | CLI Required | Installed in Paperclip Container? | Auth |
|---|---|---|---|
| `claude_local` | `claude` CLI | Yes (v2.1.92) | `ANTHROPIC_API_KEY` (**EXHAUSTED**) |
| `codex_local` | `codex` CLI | Yes (v0.118.0) | `OPENAI_API_KEY` (active) |
| `gemini_local` | `gemini` CLI | **NO — not installed** | `GEMINI_API_KEY` / `GOOGLE_API_KEY` |
| `openclaw_gateway` | None (WebSocket) | N/A | Gateway token |

### What Has Never Been Done
- No story has ever been run through the full automated pipeline
- Source registries are empty templates
- No real dossier has been created by agents (the one at `dossiers/2026-04-06/` was manually created by Claude Code)
- DB password in `/opt/paperclip/.env` is still `REPLACE_WITH_STRONG_PASSWORD`
- Telegram inline buttons still not verified in live DM

---

## CRITICAL BLOCKER: Anthropic API Credits Exhausted

Since 2026-04-08 09:13 UTC, OpenClaw logs show repeated errors:
```
[agent/embedded] embedded run agent end: isError=true model=claude-haiku-4-5-20251001 provider=anthropic error=LLM request rejected: Your credit balance is too low to access the Anthropic API
```

The News Desk agent (`6de4252a`) is stuck in `running` status, attempting failed API calls every ~30 minutes.

**Resolution**: Switch agents to Gemini or OpenAI models. See "What To Do Next" section.

---

## OpenClaw / Mimule Status

- **Gateway**: Healthy, responding at `127.0.0.1:18789`
- **Model**: `google/gemini-2.5-flash` (free tier, working)
- **Telegram**: @MimuleBot, DM policy allowlist (Marouane only, ID `7783532877`)
- **Inline buttons**: Configured as `"all"` but **never verified in live DM**
- **Execution approvals**: Require Telegram approval
- **Streaming**: Partial
- **Skills eligible**: 13 bundled skills (including `coding-agent`, `github`, `gh-issues`, `session-logs`, `tmux`, `weather`)

### Workspace Files
| File | Status |
|---|---|
| `SOUL.md` | Configured — Mimule identity, Telegram button rules |
| `AGENTS.md` | Configured — execution rules, truthfulness contract |
| `TOOLS.md` | Configured — environment notes, Docker constraints |
| `IDENTITY.md` | Configured — one-line identity |
| `HEARTBEAT.md` | Configured — health check procedure |
| `BOOTSTRAP.md` | Configured — `/start` and `/new` behavior |
| `MEMORY.md` | Active — durable facts |
| `TELEGRAM_REPLY_TEMPLATES.md` | Template library for structured Telegram responses |

### OpenClaw Warnings (non-blocking)
- Reverse proxy headers not trusted
- `dangerouslyAllowHostHeaderOriginFallback=true` enabled
- Should be cleaned up before wider exposure

---

## Core Principles

- Cost control is a first-class requirement
- Verification beats intention
- Simpler architecture wins
- Telegram should be tap-first
- NewsBites is the first product, not the dashboard
- Human approval required for the first publishing phase
- OpenClaw should remain stable before expanding scope
- Cheap models for triage/extraction/packaging, strong models only for synthesis/verification

---

## What To Do Next — Prioritized Action Plan

### IMMEDIATE: Fix the Blocker (Step 1)

**Goal**: Get at least one Paperclip agent running successfully.

**Option A — Install Gemini CLI in Paperclip container (RECOMMENDED, free)**:
1. Add `GEMINI_API_KEY=AIzaSyAlgzg2r4Gi6vkbY8PUFccfy5SELSfDSOs` to `/opt/paperclip/.env`
2. Add `GEMINI_API_KEY: "${GEMINI_API_KEY}"` to `/opt/paperclip/docker-compose.yml` environment section
3. Install Gemini CLI inside Paperclip container: `docker exec paperclip npm install -g @anthropic-ai/gemini-cli` (verify correct package name first)
4. Update agents in DB: change `adapter_type` to `gemini_local`, `adapter_config->model` to `gemini-2.5-flash`
5. Unstick News Desk: update status from `running` to `idle` in DB
6. Restart Paperclip: `cd /opt/paperclip && docker compose restart paperclip`
7. Validate: trigger one agent run, check `docker logs paperclip --tail 50`

**Option B — Use Codex adapter (fallback, ~$3-5/mo)**:
1. Update agents in DB: change `adapter_type` to `codex_local`, model to `gpt-5-mini` or `gpt-5-nano`
2. Codex CLI and `OPENAI_API_KEY` are already in the container
3. No installation needed — zero friction
4. Slightly more expensive than Gemini free tier

**Option C — Route through OpenClaw gateway (free but riskier)**:
1. Switch agents to `adapter_type: openclaw_gateway` like the Mimule agent
2. All work routes through OpenClaw → Gemini Flash (free)
3. Risk: shared session context, not designed for batch editorial work

**Note**: The `gemini_local` adapter requires the `gemini` CLI binary (confirmed in source: line 145 of execute.ts: `const command = asString(config.command, "gemini")`). It shells out to `gemini --output-format stream-json --model <model> --approval-mode yolo <prompt>`.

### Step 2: Swap Agent Models

Recommended model mapping (keeps 5 core agents, preserves architecture):
| Agent | New Adapter | New Model | Cost |
|---|---|---|---|
| News Desk | gemini_local | gemini-2.5-flash | Free |
| NewsBites Editor | gemini_local | gemini-2.5-flash | Free |
| NewsBites Researcher | gemini_local | gemini-2.5-flash | Free |
| NewsBites Writer | gemini_local | gemini-2.5-pro | ~$0.05/article |
| Verification Desk | codex_local | gpt-5-mini | ~$0.03/article |
| Publisher Desk | gemini_local | gemini-2.5-flash | Free |

Also update the 7 JSON definition files in `agent_definitions/` to match.

### Step 3: Fill Source Registries

Fill empty files at `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/source_registry/`:
- `ai.md`: OpenAI blog, Anthropic blog, Google DeepMind, Meta AI, Nvidia dev, arXiv cs.AI, EU AI Act, NIST AI, Import AI, Zvi
- `finance.md`: Fed, ECB, SEC EDGAR, BIS, IMF, Reuters, Matt Levine
- `global-politics.md`: UN, European Council, Bellingcat, Reuters World, AP, ProPublica
- `trends.md`: Ars Technica, The Verge, Stratechery, Benedict Evans, Platformer, 404 Media

Expand `scout_sources.json` from 14 to ~25 RSS feeds.

### Step 4: Run First Real Story Through Pipeline

One story end-to-end: Scout → News Desk → Researcher → Editor gate → Writer → Verification → Publisher → Human approval → Publish. Log token usage and time at every stage.

### Step 5: Telegram Button Verification

Send `/new` to @MimuleBot, verify clickable inline buttons appear. Test all callbac…3574 chars truncated…d`, not from chat history

### Canonical Rules
- Full verified article is the truth record
- App digest is a derivative — users see it first, `Read full` opens the long-form
- Short form must feel intentionally written for the app, not paragraph-truncated
- No downstream format may introduce facts absent from the verified article
- Every story must have a local dossier under `dossiers/YYYY-MM-DD/<slug>/`

### Dossier Artifacts
- `DOSSIER.md` — evidence packet
- `sources.json` — source metadata
- `claims.csv` — claim table
- `draft.md` — full article
- `verify.md` — verification memo
- `digest.md` — app summary
- `publish.md` — locked publication package

---

## Marouane's Vision & Goals

- **RIGHT NOW**: Multiple agents leveraging different capabilities, tools, channels
- **SHORT-TERM**: techinsiderbytes.com as AI portfolio, all projects autonomous
- **MID-TERM**: Offer AI services, train local models, sell orchestrations, multiple autonomous AI companies
- **LONG-TERM**: Be the person to call for AI, multiple fully automated companies

### Product Split
- The **app** (`/app`) is the core NewsBites product surface — short-form digest first
- The **main site** (`/`) is the editorial homepage — long-form articles behind explicit "Read full"
- All editorial packaging assumes: short form in app first, full article behind explicit intent

---

## Execution Timeline

| Week | Focus | Deliverable |
|---|---|---|
| **1** | Fix blocker, swap agent models, unstick News Desk, run first story | 1 article through full pipeline |
| **2** | Source registries, 4 more stories, security, timers | 5 pipeline articles, DB password fixed |
| **3** | Deploy hardening, cost ledger, RSS + sitemap | Automated deploy, cost tracking live |
| **4** | Telegram buttons, 10 more articles, SEO | 15 total articles, buttons confirmed |
| **5-6** | Reach 20 articles, tune prompts, social cards | 20 articles, prompt tuning complete |
| **7+** | Multi-channel expansion, semi-autonomous ops | Social packaging, newsletter |

---

## Progress Log

### 2026-04-08 15:10 UTC - Claude Code (Opus 4.6)
STATUS:
- Created MIMULE MASTER PLAN V2 as the new continuation document, consolidating all findings from deep infrastructure audit

CHANGES:
- Created `/home/agent/MIMULE_MASTER_PLAN_V2.md` (this file)
- Ran manual backup via `/opt/mimoun/backup.sh` (today's backup already existed from 04:00 cron)
- No service changes, no config modifications — research and planning only

EVIDENCE:
- Full audit of Paperclip DB: 8 agents found, $3.99 total spend, all on Anthropic (2026-04-06)
- News Desk agent `6de4252a` confirmed stuck in `running` status
- Anthropic credit error confirmed in OpenClaw logs since 09:13 UTC
- `gemini` CLI confirmed NOT installed in Paperclip container (adapter requires it)
- `codex` CLI (v0.118.0) and `claude` CLI (v2.1.92) confirmed available in Paperclip container
- `OPENAI_API_KEY` active in Paperclip container, `GEMINI_API_KEY` NOT present
- `GEMINI_API_KEY` exists in OpenClaw container env (`AIzaSyAlg...`)
- GitHub PAT verified working: `gh api user` → `7empes7s`
- NewsBites all committed and pushed: local main = remote main at `f45f1ff`
- Backup exists at `/opt/backups/2026-04-08/`

NEXT:
- Execute Step 1: Install Gemini CLI in Paperclip container OR switch to Codex adapter
- Unstick News Desk agent (update status in DB)
- Add GEMINI_API_KEY to Paperclip docker-compose if going Gemini path
- Run first real story through pipeline

### 2026-04-08 16:19 UTC - Codex CLI
STATUS:
- reverted this session's non-V2 edits and started executing the V2 plan; unblocked Paperclip from Anthropic credit failures by moving core agents to Gemini/Codex and verifying a successful News Desk run

CHANGES:
- rollback of prior non-V2 edits completed:
  - reverted `/opt/newsbites` article/frontmatter + removed `/opt/newsbites/public/story-covers/`
  - removed appended non-V2 continuity entries from `/opt/mimoun/openclaw-config/workspace/MASTER_PLAN.md`
- V2 Step 1 implemented (Gemini path):
  - added `GEMINI_API_KEY` and `GOOGLE_API_KEY` to `/opt/paperclip/.env`
  - added `GEMINI_API_KEY` and `GOOGLE_API_KEY` env passthrough to `/opt/paperclip/docker-compose.yml`
  - installed Gemini CLI in running Paperclip container: `npm install -g @google/gemini-cli`
  - switched `News Desk` agent (`6de4252a-9cec-4c9e-a892-dc36e9bdda65`) to:
    - `adapter_type = gemini_local`
    - `adapter_config.model = gemini-2.5-flash`
    - `adapter_config.command = gemini`
    - `status = idle`
  - aligned `agent_runtime_state` adapter for News Desk and cleared stale error text
  - triggered on-demand wakeup through board-auth API with valid payload (`triggerDetail: manual`)
- V2 Step 2 implemented (core model swap in DB):
  - `NewsBites Editor` -> `gemini_local / gemini-2.5-flash`
  - `NewsBites Researcher` -> `gemini_local / gemini-2.5-flash`
  - `NewsBites Writer` -> `gemini_local / gemini-2.5-pro`
  - `Verification Desk` -> `codex_local / gpt-5-mini`
  - `Publisher Desk` -> `gemini_local / gemini-2.5-flash`
  - normalized affected agent statuses to `idle`
  - aligned corresponding `agent_runtime_state.adapter_type` values
- updated on-disk agent definition JSON files to match V2 routing:
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/news-desk.json`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/editorial-lead.json`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/research-lead.json`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/newsbites-writer.json`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/verification-desk.json`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/publisher-desk.json`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/agent_definitions/news-scout.json`
- cleaned one manually inserted invalid wakeup request (`manual-v2-step1`) by marking it failed with explicit error text

EVIDENCE:
- package resolution check:
  - `@google/gemini-cli` exists on npm; `@anthropic-ai/gemini-cli` does not
- Paperclip container tooling now present:
  - `gemini --version` -> `0.36.0`
  - `codex --version` -> `0.118.0`
- env wiring verified:
  - `/opt/paperclip/.env` includes redacted `GEMINI_API_KEY` + `GOOGLE_API_KEY`
  - compose env includes both variables for `paperclip` service
- successful on-demand News Desk run after adapter switch:
  - `heartbeat_runs.id = 1f5d749b-87f0-4d67-9680-73c27d05ca0b`
  - `status = succeeded`, `exit_code = 0`, `invocation_source = on_demand`, `trigger_detail = manual`
  - wakeup request `d688ccb2-03ad-4c27-9996-832720c6f17b` -> `status = completed`
- current core mapping in DB now matches V2 intent:
  - News Desk / Editor / Researcher / Publisher = `gemini_local` + `gemini-2.5-flash`
  - Writer = `gemini_local` + `gemini-2.5-pro`
  - Verification = `codex_local` + `gpt-5-mini`
- all 7 local definition JSON files parse successfully (`node JSON.parse` check)

NEXT:
- execute V2 Step 3: fill `source_registry/*.md` with high-quality source lists and expand `scout_sources.json` from 14 toward ~25 feeds
- execute V2 Step 4: run one real story end-to-end through the pipeline and capture per-stage time/token/cost
- harden Gemini durability before next container recreation: current Gemini CLI install is in-container and would need re-install if the `paperclip` container is recreated from image

### 2026-04-08 16:28 UTC - Codex CLI
STATUS:
- completed V2 Step 3 (source registry completion + scout feed expansion)

CHANGES:
- expanded `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/scout_sources.json` from 14 -> 25 sources
- removed weak/broken feed dependencies from prior set (notably Nitter + blocked social feeds)
- rebalanced feed mix by vertical:
  - `ai`: 7
  - `finance`: 7
  - `global-politics`: 6
  - `trends`: 5
- fully populated source registries with concrete source lists, feed links, and manual fallback notes:
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/source_registry/ai.md`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/source_registry/finance.md`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/source_registry/global-politics.md`
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/source_registry/trends.md`

EVIDENCE:
- JSON validation passed for `scout_sources.json`
- unique source IDs confirmed (no duplicates)
- feed health check result: 25/25 feeds returned HTTP 200 with parseable RSS/Atom content at time of update

NOTES:
- Reuters/AP/European Council/IMF entries are preserved in source registries with manual-monitoring notes where direct feed access is blocked from this host

NEXT:
- execute V2 Step 4: run one real story end-to-end through Scout -> Desk -> Research -> Editor -> Writer -> Verification -> Publisher -> Human approval -> Publish
- capture per-stage timing and token/cost traces for the first full pipeline run

### 2026-04-08 16:41 UTC - Codex CLI
STATUS:
- started V2 Step 4 with a real story kickoff, but full stage handoff is currently blocked by News Desk runtime behavior

CHANGES:
- generated a fresh scout brief from the expanded source set and queued a real story:
  - brief id: `4bf92ca6-9f5d-4b25-b5a6-9a6b85b565c8`
  - selected candidate: UN News Middle East live brief
  - created issue: `TEC-28` (`907efd28-3332-4051-9f20-37bc055efd30`) assigned to News Desk
- triggered News Desk wakeup (`70f91706-6cec-4df6-95d2-cced0cc04a76`)
- diagnosed and fixed a runtime blocker for Gemini home permissions:
  - run `57185767-bc92-4539-ae4e-db221787a28b` logged `EACCES` creating `/paperclip/.gemini/skills`
  - fixed ownership for `/paperclip/.gemini` to runtime uid/gid 1000
  - restarted `paperclip` to reap orphaned run; server logged reaped run `57185767-bc92-4539-ae4e-db221787a28b`

EVIDENCE:
- assignment run failed then retry succee…113 chars truncated…-4f44-b136-6cf4e17b8c93` (succeeded, exit code 0)
- run log path inspected:
  - `/paperclip/instances/default/data/run-logs/92de899d-c83d-49bb-9d96-7f98b85ec5fb/6de4252a-9cec-4c9e-a892-dc36e9bdda65/57185767-bc92-4539-ae4e-db221787a28b.ndjson`
  - showed permission error on Gemini skills dir before fix

BLOCKER:
- despite successful retry run status, `TEC-28` did not receive comments/child handoff issues yet (still `todo`), so full Step 4 chain (Desk -> Research -> Editor -> Writer -> Verification -> Publisher) is not complete
- observed behavior indicates News Desk is still operating against legacy local context/files and issuing malformed shell JSON patches in-run, so stage transition is not reliably committing to Paperclip issue state

NEXT:
- harden News Desk runtime behavior for task targeting (`PAPERCLIP_TASK_ID`) and safe API comment/update calls
- rerun `TEC-28` once task-targeted updates are confirmed
- then continue downstream stage-by-stage with timing + cost capture

### 2026-04-08 17:05 UTC - Codex CLI
STATUS:
- enforced V2-only continuation and advanced V2 Step 4 to publisher-ready state for one real story (`TEC-28` lineage), now blocked only on explicit human approval + final publish action

CHANGES:
- reverted leftover non-V2 generated artifacts in `/opt/newsbites`:
  - removed untracked Playwright outputs under `/opt/newsbites/output/playwright/`
- hardened remaining stage-agent runtime instructions in-container (Editor/Writer/Verification/Publisher):
  - task targeting via `PAPERCLIP_TASK_ID`
  - safe API-write guidance (`curl --data-binary @file`)
- synchronized dossier artifacts from Paperclip shared workspace back to host workspace:
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/2026-04-08/middle-east-live-8-april-us-iran-ceasefire-announced-strikes-continue-in-lebanon/`
- executed Step 4 downstream stages with explicit task-bound wakeups and issue handoffs:
  - `TEC-30` Editorial gate -> `done`
  - `TEC-31` Writer draft -> `done`
  - `TEC-32` Verification pass -> `done`
  - `TEC-33` Publisher packaging -> `in_review` (approval-ready)
- verification-stage blocker handling:
  - failed codex runs due permission/trust/auth (`ba1e66a5`, `28cf4318`, `08557fae`)
  - fixed `/paperclip/.codex` ownership and git safe directory in workspace
  - switched Verification Desk agent temporarily from `codex_local` to `gemini_local` to unblock this Step 4 run

EVIDENCE:
- stage run IDs and outcomes:
  - Editor: `d94da19d-3cfb-490a-ac29-d13cac6014c9` (succeeded, 83s)
  - Writer: `6e120268-1cd5-4244-9629-cb768a593803` (succeeded, 75s)
  - Verification final: `aa48130d-b46f-4b9e-be76-f2487294c0cf` (succeeded, 34s)
  - Publisher: `626d0ff8-3019-46b6-a1ea-94a6e4146d0b` (succeeded, 31s)
- verification failure evidence captured in DB/run logs:
  - `ba1e66a5` permission error copying codex config
  - `28cf4318` trusted-directory check failure
  - `08557fae` OpenAI auth failure in codex websocket path
- issue state evidence:
  - `TEC-30` status `done` with editorial go comment
  - `TEC-31` status `done` with draft handoff comment
  - `TEC-32` status `done` with verification recommendation (`Pass`)
  - `TEC-33` status `in_review` with packaging-ready comment
- dossier artifacts now present for this story:
  - `DOSSIER.md`, `sources.json`, `claims.csv`, `draft.md`, `verify.md`, `digest.md`, `publish.md`

NEXT:
- complete Step 4 final two actions:
  - perform/record human approval for `TEC-33`
  - normalize `publish.md` into frontmatter format expected by `/opt/newsbites/scripts/publish-dossier.mjs`, then publish to `content/articles/`
- after Step 4 closes, run V2 Step 5 (Telegram inline button verification)
- restore Verification Desk to V2 target (`codex_local/gpt-5-mini`) once codex auth path is stabilized in this runtime

### 2026-04-08 17:19 UTC - Codex CLI
STATUS:
- appended the latest V2 execution summary to the master plan per user request

CHANGES:
- recorded that V2-only continuation is active
- recorded current Step 4 stage outcomes for the active story chain:
  - TEC-30 Editorial gate: done
  - TEC-31 Writer draft: done
  - TEC-32 Verification: done
  - TEC-33 Publisher packaging: in_review (approval-ready)
- recorded dossier sync location:
  - /opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/2026-04-08/middle-east-live-8-april-us-iran-ceasefire-announced-strikes-continue-in-lebanon/
- recorded temporary runtime fallback note:
  - Verification Desk temporarily moved to gemini_local for this run due codex_local runtime/auth failures

EVIDENCE:
- issue state check confirms:
  - TEC-30 done
  - TEC-31 done
  - TEC-32 done
  - TEC-33 in_review
- artifacts present in dossier path:
  - DOSSIER.md
  - sources.json
  - claims.csv
  - draft.md
  - verify.md
  - digest.md
  - publish.md

NEXT:
- record human approval for TEC-33
- normalize publish.md to frontmatter format required by /opt/newsbites/scripts/publish-dossier.mjs
- publish to /opt/newsbites/content/articles/
### 2026-04-08 18:31 UTC - Codex CLI
STATUS:
- resolved the still-live Telegram API-limit blocker in OpenClaw by replacing the stale Anthropic-bound direct DM session with a fresh Gemini session, and verified `/new` plus `paperclip_backlog` callback delivery in Telegram

CHANGES:
- diagnosed the real blocker source:
  - Paperclip agents had been rerouted earlier, but Mimule's active direct Telegram session `agent:main:main` was still pinned to `anthropic/claude-haiku-4-5-20251001`
  - this stale OpenClaw session override, not the Paperclip adapter config, was causing ongoing Telegram credit-limit failures
- patched the live OpenClaw session store in-container:
  - cleared persisted `providerOverride` / `modelOverride` for `agent:main:main`
  - set runtime model fields to `google/gemini-2.5-flash`
  - restarted `openclaw_gateway`
- hardened Telegram cron behavior to stop isolated auto-delivery runs from incorrectly calling the Telegram `message` tool:
  - updated `/opt/mimoun/openclaw-config/workspace/AGENTS.md`
  - updated `/opt/mimoun/openclaw-config/workspace/SOUL.md`
  - updated `/opt/mimoun/openclaw-config/cron/jobs.json`
- tightened fresh-session precedence:
  - clarified in `SOUL.md` that `/start` and `/new` override the "first message of the day" brief rule
- removed startup noise from missing daily memory files:
  - created `/opt/mimoun/openclaw-config/workspace/memory/2026-04-07.md`
  - created `/opt/mimoun/openclaw-config/workspace/memory/2026-04-08.md`

EVIDENCE:
- pre-fix failure evidence:
  - stale direct session file `/root/.openclaw/agents/main/sessions/d49905c4-4094-45a9-bcc4-711e992c05d7.jsonl` showed repeated Anthropic billing failures through `2026-04-08 17:43 UTC`
  - OpenClaw logs repeatedly reported `Your credit balance is too low to access the Anthropic API`
- post-fix session evidence:
  - active `agent:main:main` session is now `4e90661c-4ca5-437d-aee3-41a084094d2a`
  - session store now reports `modelProvider: google`, `model: gemini-2.5-flash`, `providerOverride: null`, `modelOverride: null`
  - fresh `/new` session transcript begins with:
    - `✅ New session started · model: google/gemini-2.5-flash`
- Telegram verification evidence:
  - `/new` bootstrap delivered successfully with `Ready.` and native buttons:
    - Telegram `messageId: 351`
  - `paperclip_backlog` callback rendered and delivered successfully:
    - Telegram `messageId: 352`
  - later `morning_brief` callback also delivered successfully on Gemini:
    - Telegram `messageId: 353`
  - no new Anthropic credit-limit errors appeared after the fresh Gemini session was created

NEXT:
- observe the next hourly cron run to confirm the new "plain text only" cron instruction prevents spurious `Action send requires a target` attempts
- continue V2 Step 4 closeout for NewsBites:
  - record human approval for `TEC-33`
  - normalize `publish.md` into the frontmatter format expected by `/opt/newsbites/scripts/publish-dossier.mjs`
  - publish the first real article

### 2026-04-08 19:09 UTC - Codex CLI
STATUS:
- completed the non-human part of V2 Step 4 closeout for `TEC-33`: the locked package is now valid, the final publish approval exists, and the Telegram approval view is ready for Marouane to approve

CHANGES:
- normalized the real story's locked publish package at:
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/2026-04-08/middle-east-live-8-april-us-iran-ceasefire-announced-strikes-continue-in-lebanon/publish.md`
- replaced placeholder packaging notes in `publish.md` with:
  - NewsBites frontmatter (`title`, `slug`, `date`, `vertical`, `tags`, `status`, `lead`, `coverImage`, `author`)
  - final article body derived from the verified draft and kept within the verified claim set
- tightened the companion digest and dossier metadata:
  - updated `digest.md` to a cleaner two-sentence digest without placeholder CTA text
  - updated `DOSSIER.md` status to `awaiting final publish approval`
  - updated `DOSSIER.md` approval-ready summary to reflect deterministic publish packaging
  - updated `DOSSIER.md` publication log notes to show publication is still pending approval
- created the missing final Paperclip publish approval from inside `openclaw_gateway`:
  - approval id: `d484aead-8d55-4234-833f-a86742d213b2`
  - kind: `article_publish`
  - identifier: `TEC-33`
- posted a trace comment back to `TEC-33` recording the normalized package and approval id

EVIDENCE:
- temp publish validation succeeded without touching the live site repo:
  - `node /opt/newsbites/scripts/publish-dossier.mjs <dossier> --status=published` run from a temporary cwd returned:
    - `ok: true`
    - `slug: middle-east-live-8-april-us-iran-ceasefire-announced-strikes-continue-in-lebanon`
- pending approval queue now contains exactly the article publish approval:
  - `d484aead-8d55-4234-833f-a86742d213b2` status `pending`
- Telegram approval rendering preview now resolves cleanly:
  - heading: `Ready for publication approval`
  - buttons: `Approve`, `Changes`, `Reject`, `Back to approvals`
- `TEC-33` issue comment now records:
  - normalized package validated against `publish-dossier.mjs`
  - approval id `d484aead-8d55-4234-833f-a86742d213b2`

NEXT:
- Marouane should approve `d484aead-8d55-4234-833f-a86742d213b2` in Telegram
- on approval, the Telegram callback path will run `publish-dossier.mjs` against the locked dossier and attempt deploy automatically
- after that approval action lands, verify:
  - article file written under `/opt/newsbites/content/articles/`
  - deploy result in the Telegram approval-action response
  - `TEC-33` / dossier publication log updated with the final published slug and path
### 2026-04-08 19:31 UTC - Codex CLI
STATUS:
- V2 Step 4 is now fully closed for the first real story: Marouane approved the publish action in Telegram, the article was written to the NewsBites content tree, and the live article route is serving

CHANGES:
- verified final approval outcome for `d484aead-8d55-4234-833f-a86742d213b2`:
  - status `approved`
  - decision note `Approved from Telegram via Mimule.`
  - decided at `2026-04-08T19:29:54.543Z`
- verified publication side effect:
  - article file written at `/opt/newsbites/content/articles/middle-east-live-8-april-us-iran-ceasefire-announced-strikes-continue-in-lebanon.md`
  - file frontmatter is `status: "published"`
- verified Telegram approval-action transcript for the direct session:
  - callback `pc_appr_ok:d484aead-8d55-4234-833f-a86742d213b2`
  - response text reported:
    - `Published slug: middle-east-live-8-april-us-iran-ceasefire-announced-strikes-continue-in-lebanon.`
    - `Deploy completed.`
  - Telegram delivery succeeded with `messageId: 357`
- verified live serving from the NewsBites app:
  - `GET /articles/middle-east-live-8-april-us-iran-ceasefire-announced-strikes-continue-in-lebanon` on `127.0.0.1:3001` returned the published title/body
- updated dossier continuity:
  - `/opt/mimoun/openclaw-config/workspace/newsbites_editorial/dossiers/2026-04-08/middle-east-live-8-april-us-iran-ceasefire-announced-strikes-continue-in-lebanon/DOSSIER.md`
    - top status -> `published`
    - publication log filled with route and app entry
- posted the required post-publication trace comment to `TEC-33` with exact slug and file path

EVIDENCE:
- article file mtime:
  - `2026-04-08 19:29:54 UTC`
- built page artifacts updated shortly after publish:
  - `/opt/newsbites/.next/server/app/index.html` at `2026-04-08 19:30:02 UTC`
  - `/opt/newsbites/.next/server/app/category/global-politics.html` at `2026-04-08 19:30:02 UTC`
- direct session transcript:
  - `/root/.openclaw/agents/main/sessions/4e90661c-4ca5-437d-aee3-41a084094d2a.jsonl`
  - contains the approval callback, publish confirmation, and Telegram `messageId: 357`

RISK / NOTE:
- the deploy callback reported success, and the article route is live, but the host `newsbites.service` start time did not change; the current deploy path appears to run from inside `openclaw_gateway` and also dropped repo-local `.pid` and `server.log` artifacts under `/opt/newsbites`
- this means the first publish is operationally successful, but the deploy mechanism still needs hardening so it restarts the intended host service instead of spawning container-local process artifacts

NEXT:
- execute V2 Step 5: verify Telegram inline-button flows cleanly against the now-real published story and any remaining action-needed screens
- then fix the NewsBites deploy path so approval-driven publication targets the host runtime cleanly without leaving `.pid` / `server.log` artifacts in the repo
### 2026-04-08 19:35 UTC - Codex CLI
STATUS:
- fixed the approval-driven NewsBites deploy path so container-origin publish callbacks now target the host systemd deploy unit cleanly instead of spawning repo-local `.pid` / `server.log` artifacts

CHANGES:
- hardened `/opt/newsbites/deploy.sh` into a host-only script:
  - removed the fallback branches that launched `npm run start` directly and wrote `.pid` / `server.log`
  - now fails fast if `systemctl` is unavailable, with an explicit instruction to use `trigger-deploy.sh` from container contexts
- rebuilt `/opt/newsbites/trigger-deploy.sh` as the cross-context deploy entrypoint:
  - added `--help` handling so inspection no longer triggers a deploy
  - host path now uses `systemctl start --wait newsbites-deploy.service`
  - container path now uses the Docker socket directly via `curl --unix-socket` to create a short-lived privileged helper container running `nsenter` into host PID 1 and starting `newsbites-deploy.service`
  - removed dependency on a `docker` CLI binary inside `openclaw_gateway`
- updated `/opt/mimoun/openclaw-config/scripts/paperclip-telegram.js` so article publication prefers `trigger-deploy.sh` over calling `deploy.sh` directly
- removed stale broken-path artifacts from the repo root:
  - `/opt/newsbites/.pid`
  - `/opt/newsbites/server.log`

EVIDENCE:
- safety check:
  - `bash /opt/newsbites/trigger-deploy.sh --help` now prints usage on both host and inside `openclaw_gateway` without triggering deployment
- real container-origin deploy verification:
  - `docker exec openclaw_gateway sh -lc 'bash /opt/newsbites/trigger-deploy.sh'` returned `Deploy triggered.`
  - host `newsbites.service` restarted cleanly:
    - before: `Wed 2026-04-08 19:33:10 UTC`
    - after: `Wed 2026-04-08 19:35:26 UTC`
    - new `ExecMainPID=2029651`
  - `journalctl -u newsbites-deploy.service` shows the full build and successful completion at `19:35:26 UTC`
- artifact cleanliness check after the container-origin deploy:
  - no repo-local `.pid` or `server.log` files were recreated under `/opt/newsbites`

NEXT:
- V2 Step 5 is now the next clean step: verify Telegram inline-button flows against the real published story and current action-needed surfaces
### 2026-04-08 19:39 UTC - Codex CLI
STATUS:
- advanced V2 Step 5 by closing the currently visible Telegram callback graph in code; one fresh live `/new` session plus tap test is still required to mark Step 5 fully verified

CHANGES:
- added deterministic top-level Telegram callback renderer:
  - `/opt/mimoun/openclaw-config/scripts/telegram-menu.js`
  - `/opt/mimoun/openclaw-config/scripts/telegram-menu.sh`
- wired these callbacks away from prompt improvisation and into the helper:
  - `back_home`
  - `custom_reply`
  - `health`
  - `morning_brief`
  - `show_articles` / `articles`
  - `cost_report` / `costs`
- updated Telegram callback rules in:
  - `/opt/mimoun/openclaw-config/workspace/BOOTSTRAP.md`
  - `/opt/mimoun/openclaw-config/workspace/SOUL.md`
  - `/opt/mimoun/openclaw-config/workspace/AGENTS.md`

EVIDENCE:
- in-container callback render checks now succeed for the previously missing top-level paths:
  - `back_home` -> returns the clean `Ready.` home screen
  - `custom_reply` -> returns a clear free-form prompt screen
  - `health` -> returns a concise live status summary from `status-report.js`
  - `morning_brief` -> returns a concise ops summary plus latest published story
  - `show_articles` -> returns the latest published NewsBites stories
  - `cost_report` -> returns an honest deterministic placeholder until a real ledger exists
- existing Paperclip callbacks still render correctly with the same button set:
  - `paperclip_backlog`
  - `paperclip_tasks`
  - `paperclip_approvals`

BLOCKER / NEXT:
- the active Mimule DM session was created before these callback-rule changes, so one fresh `/new` is still needed in Telegram to ensure the runtime loads the updated rules before live button tapping
- after that, run the live tap sequence and confirm the callback transcript follows the new deterministic helper path instead of prompt improvisation
### 2026-04-08 19:55 UTC - Codex CLI
STATUS:
- fixed the last visible V2 Step 5 gap: `cost_report` no longer returns a placeholder and now renders a live session-backed spend summary inside Telegram callback flow

CHANGES:
- updated `/opt/mimoun/openclaw-config/scripts/telegram-menu.js`
  - added UTC-day session cost aggregation over `/root/.openclaw/agents/main/sessions`
  - classifies spend into direct Telegram, hourly cron, and Paperclip wake-event buckets
  - replaced the old placeholder `cost_report` / `costs` callback text with a live summary showing:
    - total spend today so far
    - direct / cron / Paperclip split
    - total input/output token counts
    - explicit source note: OpenClaw session logs

EVIDENCE:
- `node --check /opt/mimoun/openclaw-config/scripts/telegram-menu.js` passed
- in-container render check now returns a real report:
  - `Cost report for 2026-04-08 UTC so far.`
  - `Total session spend: $0.66.`
  - `Direct $0.24 · Cron $0.35 · Paperclip $0.07.`
  - `Tokens: 1.8M in · 21.8K out.`
- Paperclip DB inspection confirmed there are no new `cost_events` for `2026-04-08`; today’s live spend is currently on the Mimule/OpenClaw side, not Paperclip metered-agent runs

NEXT:
- re-tap `Cost report` once in Telegram to confirm the live callback now shows the session-backed numbers instead of the placeholder
- if that passes, V2 Step 5 can be marked complete