# MIMULE MASTER PLAN AND CONTINUATION FILE

Last updated: 2026-04-05 UTC
Primary owner: Marouane Defili
Primary execution agents: Codex CLI, Claude CLI, OpenClaw/Mimule, future sub-agents
Canonical continuation file target: `/opt/mimoun/openclaw-config/workspace/MASTER_PLAN.md`
Easy shortcut path: `/home/agent/MIMULE_MASTER_PLAN.md`

## Purpose
This file is the single shared handoff, execution, and progress-log document for Mimule v1 and the surrounding TechInsiderBytes stack.

Any agent continuing the work should:
1. Read this file first.
2. Treat it as the current source of truth unless live evidence contradicts it.
3. Append progress to the `Progress Log` section in this same file after meaningful work.
4. Update decisions, current state, blockers, and changed priorities in this same file.

## Append Protocol For All Agents
Every meaningful work session must append a new entry to the `Progress Log` section using this format:

```markdown
### YYYY-MM-DD HH:MM UTC - <agent/tool name>
STATUS:
- one-line summary

CHANGES:
- files changed
- services changed
- commands or actions taken

EVIDENCE:
- health checks
- validation results
- observed outputs

NEXT:
- next recommended step
- blockers or open questions
```

Rules:
- Append, do not overwrite prior entries.
- Prefer facts and evidence over claims.
- If you changed a file, name it explicitly.
- If you made a recommendation only, say so clearly.
- If you are unsure, mark it as an inference.

## Current Reality Snapshot
Verified on 2026-04-05:

- VPS is running Ubuntu 24.04 on Hetzner at `178.104.120.71`.
- Caddy is active.
- OpenClaw gateway is up on `127.0.0.1:18789`.
- Paperclip is healthy on `:3100`.
- Goblin game is running on `:9000`.
- `news.techinsiderbytes.com` does not resolve yet.
- `/opt/newsbites` does not exist yet.
- `7empes7s/newsbites` does not exist yet.
- Caddy does not yet have a `news.techinsiderbytes.com` route.

## Mimule Workspace Status
Current workspace files:

- `SOUL.md`: now updated to explicitly require native Telegram button actions
- `AGENTS.md`: now updated with truthfulness, execution reporting, and button rules
- `TOOLS.md`: now updated with stack-specific notes
- `IDENTITY.md`: now updated with a real one-line identity
- `HEARTBEAT.md`: now updated for lightweight operational checks
- `MEMORY.md`: present and usable

Security and permissions:
- `/opt/mimoun/openclaw-config/openclaw.json` is no longer world-readable
- Current mode is `640`
- Current owner/group is `root:docker`

OpenClaw validation:
- `openclaw config validate --json` returned `{"valid":true,...}`

OpenClaw warnings still present:
- reverse proxy headers are not trusted
- `gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true` is enabled
- dangerous config flags warning follows from the above

These warnings are not blockers for v1 operator work, but should be cleaned up before wider exposure.

## Corrected Strategic Position
The earlier handover mixed completed, partial, and stale items. The corrected order of work is:

1. Stabilize Mimule and verify native Telegram button behavior
2. Add Telegram topics and topic-specific routing only after DM behavior is correct
3. Build NewsBites as the first productized stack
4. Simplify Paperclip to one editorial agent with strict budget control
5. Add automation, watchdogs, briefs, and deploy pipeline
6. Revisit dashboard and secondary enhancements later

## Core Principles For This Stack
- Cost control is a first-class requirement.
- Verification beats intention.
- Simpler architecture wins.
- Telegram should be tap-first.
- NewsBites is the first product, not the dashboard.
- Human approval is required for the first publishing phase.
- OpenClaw should remain stable before expanding scope.

## Recommended Architecture Decisions

### Model Routing
Recommended now:
- OpenClaw: direct provider keys, not OpenRouter yet
- Paperclip: OpenRouter for the editorial pipeline

Reason:
- OpenClaw is your operator layer and should be kept simple and stable first.
- Paperclip benefits more from unified model routing and cost control.

### Website Framework
Decision:
- Next.js for NewsBites, as already chosen

Recommended v1 deployment mode:
- static export first if the site remains content-first
- live Node runtime later only if you need server features

Reason:
- v1 is markdown-led, cost-sensitive, and operational simplicity matters.

### Publishing Cadence
Recommended v1:
- start at 1-2 articles/day, not 4/day

Reason:
- the approval, style, and deploy loop must be proven before scale.

## Execution Plan

### Phase 1 - Mimule Operator Stability
Goal:
- Make Mimule reliable, truthful, low-cost, and Telegram-native

Tasks:
- Verify clickable inline buttons in a real Telegram DM
- If buttons fail, inspect OpenClaw logs during a live reply
- Adjust prompt or tool/action usage until native buttons render correctly
- Keep `SOUL.md` and `AGENTS.md` aligned with actual OpenClaw Telegram behavior
- Record findings in this file

Definition of done:
- `/new` returns `Ready.` with real clickable buttons
- a normal reply can include working inline buttons
- no fake bracket-only buttons remain in user-facing Telegram behavior

### Phase 1.5 - Telegram Topic Architecture
Goal:
- create clean operational lanes without breaking the operator core

Recommended order:
1. keep DM stable first
2. create one Telegram supergroup with forum topics
3. add these topics:
   - `#general`
   - `#newsbites`
   - `#ops`
   - `#admin`
4. add topic config under `channels.telegram.groups.<chatId>.topics.<threadId>`
5. use one agent with topic-specific prompts first
6. split to topic-specific agents only if the single-agent pattern proves too noisy

### Phase 2 - NewsBites Website
Goal:
- ship the first public-facing product at `news.techinsiderbytes.com`

Tasks:
- create `/opt/newsbites`
- initialize Next.js app
- choose static export or runtime mode explicitly
- implement:
  - homepage
  - article page
  - category pages
  - about page
- use markdown content under `/content/articles`
- apply the NewsBites design direction:
  - deep navy `#1B2A4A`
  - amber `#F5A623`
  - Playfair Display for headlines
  - DM Sans for body
- push baseline repo to GitHub
- add Caddy route
- add DNS record

Definition of done:
- `news.techinsiderbytes.com` resolves
- site loads on desktop and mobile
- at least one sample article renders correctly

### Phase 3 - Paperclip Editorial Simplification
Goal:
- reduce cost and complexity

Tasks:
- audit current Paperclip agents and remove wasteful ones
- retain one editorial agent only
- use Gemini Flash via OpenRouter
- cap monthly spend
- cap turns per run
- install style guide and article template skills
- test one article from draft to approval

Definition of done:
- one agent writes one usable article draft
- approval path is clear
- no unnecessary agents remain running

### Phase 4 - Operational Automation
Goal:
- add self-healing and reporting after the core product works

Tasks:
- add:
  - `watchdog.sh`
  - `health-check.sh`
  - `cost-ledger.sh`
  - `self-repair.sh`
- wire morning brief
- wire weekly AI scout
- wire Telegram alerts for failures and costs

Definition of done:
- failed service detection works
- operator receives useful concise reports
- automation does not create noisy spam

### Phase 5 - GitHub and Deploy Pipeline
Goal:
- reliable promotion from approved content to live site

Tasks:
- create deploy script
- create backup script
- commit baseline configs
- wire:
  - draft article
  - approval
  - git commit
  - deploy

Definition of done:
- one approved article can move from content file to live site with a repeatable path

## Skill Research

### A. Codex Skills Already Present In This Session
These are already available as system skills:

- `imagegen`
- `openai-docs`
- `plugin-creator`
- `skill-creator`
- `skill-installer`

Use notes:
- `imagegen` is relevant for logo, hero visuals, article art, and social assets
- `skill-creator` is relevant once Mimule or NewsBites needs custom skills
- `skill-installer` is relevant for adding more Codex-side skills from OpenAI's curated set

### B. Codex Curated Installable Skills From OpenAI
Discovered via the local skill installer catalog:

- `aspnet-core`
- `chatgpt-apps`
- `cloudflare-deploy`
- `develop-web-game`
- `doc`
- `figma`
- `figma-code-connect-components`
- `figma-create-design-system-rules`
- `figma-create-new-file`
- `figma-generate-design`
- `figma-generate-library`
- `figma-implement-design`
- `figma-use`
- `frontend-skill`
- `gh-address-comments`
- `gh-fix-ci`
- `imagegen`
- `jupyter-notebook`
- `linear`
- `netlify-deploy`
- `notion-knowledge-capture`
- `notion-meeting-intelligence`
- `notion-research-documentation`
- `notion-spec-to-implementation`
- `openai-docs`
- `pdf`
- `playwright`
- `playwright-interactive`
- `render-deploy`
- `screenshot`
- `security-best-practices`
- `security-ownership-map`
- `security-threat-model`
- `sentry`
- `slides`
- `sora`
- `speech`
- `spreadsheet`
- `transcribe`
- `vercel-deploy`
- `winui-app`
- `yeet`

Experimental Codex skills:
- attempted to list `.experimental`
- result: path not found from the current installer script
- inference: either the upstream path changed or the helper script no longer supports that path as documented

#### Recommended Codex Skills For This Setup
High-priority candidates:
- `frontend-skill`
  - useful for the NewsBites UI build
- `playwright`
  - useful for real browser verification of `news.techinsiderbytes.com`
- `screenshot`
  - useful for UI review and documenting output
- `cloudflare-deploy`
  - potentially useful later if parts move away from the VPS deployment model
- `security-best-practices`
  - useful for VPS and public-service hardening review
- `security-threat-model`
  - useful before broader exposure of Mimule and NewsBites
- `notion-research-documentation`
  - useful if you decide to centralize research and memory in Notion
- `transcribe`
  - useful if voice notes become part of your operator workflow
- `speech`
  - useful for spoken output workflows
- `pdf`
  - useful for policy docs, reports, and editorial reference handling

Medium-priority candidates:
- `gh-fix-ci`
- `gh-address-comments`
- `spreadsheet`
- `slides`
- `doc`
- `jupyter-notebook`

Low-priority or situational:
- Figma skills unless you move actual design source-of-truth into Figma
- deploy-targeted skills like `vercel-deploy`, `netlify-deploy`, `render-deploy` unless hosting changes
- `develop-web-game`, `winui-app`, `chatgpt-apps`, `yeet` unless those become direct project needs

### C. OpenClaw Bundled Skills
OpenClaw currently reports 52 bundled skills.

Ready now:
- `clawflow`
- `clawflow-inbox-triage`
- `healthcheck`
- `node-connect`
- `notion`
- `skill-creator`

Missing requirements:
- `1password`
- `apple-notes`
- `apple-reminders`
- `bear-notes`
- `blogwatcher`
- `blucli`
- `bluebubbles`
- `camsnap`
- `clawhub`
- `coding-agent`
- `discord`
- `eightctl`
- `gemini`
- `gh-issues`
- `gifgrep`
- `github`
- `gog`
- `goplaces`
- `himalaya`
- `imsg`
- `mcporter`
- `model-usage`
- `nano-pdf`
- `obsidian`
- `openai-whisper`
- `openai-whisper-api`
- `openhue`
- `oracle`
- `ordercli`
- `peekaboo`
- `sag`
- `session-logs`
- `sherpa-onnx-tts`
- `slack`
- `songsee`
- `sonoscli`
- `spotify-player`
- `summarize`
- `things-mac`
- `tmux`
- `trello`
- `video-frames`
- `voice-call`
- `wacli`
- `weather`
- `xurl`

#### Best OpenClaw Skills For Your Setup
Immediate-value candidates:

- `coding-agent`
  - highest leverage for delegating code work from Mimule
  - current blocker: OpenClaw environment does not see `claude`, `codex`, `opencode`, or `pi` binaries

- `github`
  - needed for repo ops, PR review, CI checks
  - blocker: `gh` not installed/configured in the OpenClaw runtime environment

- `gh-issues`
  - useful for autonomous bug triage and issue-to-PR loops
  - blocker: `gh` plus supporting tooling

- `blogwatcher`
  - strong fit for AI scene scouting, feed monitoring, and NewsBites source detection
  - blocker: `blogwatcher` binary missing

- `summarize`
  - useful for URLs, podcasts, videos, and long sources
  - blocker: `summarize` binary missing

- `weather`
  - useful for operator briefings with no key required
  - blocker: `curl` not visible to the skill check in the current runtime

- `session-logs`
  - useful for self-review and learning from prior runs
  - blocker: `jq` and `rg`

- `tmux`
  - useful for controlling long-running terminal sessions and interactive tools
  - blocker: `tmux`

- `openai-whisper-api`
  - useful if voice notes become part of your Telegram workflow
  - blocker: `curl` in runtime plus API usage policy

- `voice-call`
  - future-facing if you want actual call initiation via OpenClaw
  - blocker: plugin not configured

Secondary candidates:
- `goplaces`
- `discord`
- `slack`
- `trello`
- `xurl`
- `sag`
- `video-frames`
- `camsnap`
- `obsidian`

Low-value or not relevant now:
- macOS-only Apple note/task skills
- home automation skills like `openhue`, `sonoscli`, `eightctl`
- music and media extras unless they become part of a consumer-facing flow

### D. Community ClawHub Search Results
Telegram-related community skills found via `openclaw skills search telegram`:
- `telegram-voice-group`
- `agent-telegram`
- `rho-telegram-alerts`
- `telegram-bot-builder`
- `telegram-history`
- `openclaw-telegram-chat`
- `telegram-notify`
- `openclaw-telegram-setup`
- `polymarket-telegram-picks`
- `telegram`

GitHub-related community skills found via `openclaw skills search github`:
- `openclaw-github-assistant`
- `github-cli`
- `github-search`
- `github-analyzer`
- `github-workflow`
- `github`
- `github-pages-auto-deploy`
- `github-development-standard`
- `github-code-analyzer`
- `huadafenqi-github`

Guidance:
- treat community ClawHub skills as optional and untrusted until reviewed
- prefer bundled skills first
- if installing community skills, pin the exact skill name/version and test in isolation

## Recommended Skill Roadmap

### Immediate Installs Or Enablements
For Codex:
- install `frontend-skill`
- install `playwright`
- install `screenshot`
- optionally install `security-best-practices`
- optionally install `security-threat-model`

For OpenClaw:
- make `coding-agent` viable if you want Mimule to delegate to Codex/Claude from Telegram
- make `github` viable by installing/configuring `gh`
- make `blogwatcher` viable for AI news scouting
- make `summarize` viable for source digestion
- make `session-logs` viable for self-improvement and postmortems
- make `weather` viable if desired for daily operator briefs

### Install Sequence Recommendation
1. `github`
2. `coding-agent`
3. `blogwatcher`
4. `summarize`
5. `session-logs`
6. `weather`
7. optional extras after product launch

## Agent Instructions To Mirror In Workspace Rules
All agents working on this stack should also follow these instructions:

- Before starting, read this file.
- After meaningful work, append a progress entry here.
- If you make a decision, update the decision or architecture sections here.
- If you discover a contradiction between the plan and the live system, record it here with evidence.
- Do not claim progress without evidence.

## Recommended Next Actions
Short-term next step:
1. test Telegram inline buttons live
2. if successful, start NewsBites app creation
3. if not successful, debug OpenClaw Telegram action path before anything else

Operational next step after button verification:
1. scaffold `/opt/newsbites`
2. create GitHub repo
3. implement the first version of the site
4. wire DNS and Caddy

## Sources Used For This Plan
- local VPS inspection under `/opt/mimoun`, `/opt/paperclip`, and `/etc/caddy/Caddyfile`
- OpenClaw CLI:
  - `skills list`
  - `skills check`
  - `skills info ...`
  - `status`
  - `config validate`
- Codex skill installer catalog:
  - `/home/agent/.codex/skills/.system/skill-installer/scripts/list-skills.py --format json`
- OpenClaw docs:
  - `https://docs.openclaw.ai/channels/telegram`
  - `https://docs.openclaw.ai/gateway/configuration-reference`
- Next.js docs:
  - `https://nextjs.org/docs/app/guides/single-page-applications`
  - `https://nextjs.org/blog/next-16`
- Gemini pricing:
  - `https://ai.google.dev/gemini-api/docs/pricing`

## Raw User Input Archive
The following raw input is included so any future agent can continue with original context.

### Raw Input 1 - Handover And Day 1 Plan
```text
here's the handover plan Mimule v1 — Codex Handoff
Date: April 5, 2026, ~18:00 UTC
VPS: root@178.104.120.71 (Hetzner CX32, Ubuntu 24.04)
Handoff from: Claude (claude.ai project chat)
Handoff to: Codex CLI on VPS

COMPLETED — Do Not Redo
✅ Infrastructure

VPS running Ubuntu 24.04 at 178.104.120.71
Docker installed and working
Caddy reverse proxy running (systemctl status caddy)
Cloudflare DNS configured for *.techinsiderbytes.com
Cloudflare Zero Trust protecting admin subdomains
Claude Code CLI + Codex CLI installed (root + agent user)
GitHub repos at 7empes7s/*

✅ OpenClaw Gateway (Sprint 0 — DONE)

Container: openclaw_gateway running on node:22-slim
Port: 127.0.0.1:18789
Config: bind-mounted from /opt/mimoun/openclaw-config/ → /root/.openclaw/
Config file: /opt/mimoun/openclaw-config/openclaw.json — VALID, gateway accepts it
Start script: /opt/mimoun/start-openclaw.sh — uses real OpenClaw v2026.4.2 from mimoun_npm_global volume
Docker compose: /opt/mimoun/docker-compose.yml — 2 services (openclaw-gateway + goblin-game)
Model: google/gemini-2.5-flash (default)
Gateway token in .env: OPENCLAW_GATEWAY_TOKEN (no oc_gw_ prefix)

✅ Telegram Bot (Sprint 0 — DONE)

Bot: @MimuleBot (ID: 8706128157)
Token: 8706128157:AAFjOLCh8Y86S5atNpz33WeZodSUcROHVow
Marouane's Telegram ID: 7783532877
dmPolicy: allowlist (only Marouane can message)
inlineButtons: "all" (enabled in config)
streaming: "partial"
Bot responds to messages ✅
Exec approvals target Telegram ✅

✅ Mimule Identity (Sprint 1 — PARTIAL)

SOUL.md written at /opt/mimoun/openclaw-config/workspace/SOUL.md
USER.md written at /opt/mimoun/openclaw-config/workspace/USER.md
MEMORY.md written at /opt/mimoun/openclaw-config/workspace/MEMORY.md
Bot identifies as "Mimule" ✅
Bot uses Gemini 2.5 Flash ✅

✅ Other Running Services

Goblin game: goblin_game container on port 9000 (nginx static)
Paperclip: running at /opt/paperclip on port 3100 (separate docker-compose)


NOT YET DONE — Pick Up Here
🔶 Sprint 1 Remaining — Mimule Identity Polish

Inline buttons not appearing yet — SOUL.md tells the agent to use them, but the agent needs to be instructed to use OpenClaw's native button format. The config inlineButtons: "all" is set, but the agent model (Gemini Flash) may need explicit prompting in SOUL.md to emit buttons in OpenClaw's action format. Test by asking Mimule something and checking if clickable buttons appear (not just text that looks like buttons).
Write AGENTS.md at /opt/mimoun/openclaw-config/workspace/AGENTS.md — should contain:

NON-NEGOTIABLE EXECUTION RULES (never claim done without verification)
TRUTHFULNESS CONTRACT (allowed vs forbidden claims)
EXECUTION REPORTING FORMAT (STATUS / EVIDENCE / REMAINING)
FORBIDDEN PHRASES list
Cost protection rules (never use premium models for cheap tasks, never retry >2x)
Session bootstrap rules (after /new → "Ready." + buttons, nothing else)


Write TOOLS.md at /opt/mimoun/openclaw-config/workspace/TOOLS.md — connected services, cost tiers, known issues
Write IDENTITY.md at /opt/mimoun/openclaw-config/workspace/IDENTITY.md — one-liner purpose
Telegram Topics (Forum Mode) — enable BotFather threaded mode, create 4 topics: #general, #newsbites, #ops, #admin. Configure per-topic system prompts in openclaw.json under channels.telegram.groups or topic overrides.
Morning brief flow — configure heartbeat to send a daily brief at 07:00 UTC via Telegram with inline buttons

🔴 Sprint 2 — NewsBites Website (NOT STARTED)

Framework: Next.js (Marouane chose this over Astro)
Location: /opt/newsbites
Served by Caddy at port 3001 → news.techinsiderbytes.com
Brand: "Bloomberg Terminal meets a Reel"

Primary color: Deep navy #1B2A4A
Accent: Amber #F5A623
Headlines: Editorial serif (Playfair Display)
Body: Clean sans (DM Sans)
Layout: Card-based, mobile-first, filterable by vertical


Pages: Homepage (article cards), Article page, Category pages, About page
Content: Markdown files in /content/articles/ with frontmatter (title, slug, date, vertical, tags, status, lead)
4 verticals: AI, Finance, Global Politics, Trends
Deploy: git pull && npm run build → Caddy serves static or Next.js runs on 3001
GitHub repo: 7empes7s/newsbites (create if not exists)
DNS: A record news → 178.104.120.71 in Cloudflare (may already exist)
Caddy route needs adding: news.techinsiderbytes.com { reverse_proxy localhost:3001 }
NewsBites logo image exists (generated via Nano Banana) — Marouane has it locally

🔴 Sprint 3 — Paperclip Editorial Agent Fix (NOT STARTED)

Paperclip at /opt/paperclip on port 3100
$15 already spent in onboarding — needs audit
Kill all existing agents except one editorial agent
Reconfigure: 1 "NewsBites Editor" agent on Gemini Flash via OpenRouter ($8/mo cap, 15 turns max)
OpenRouter is the API gateway for Paperclip ONLY (not for OpenClaw)
OpenRouter API key needed in Paperclip's .env as OPENROUTER_API_KEY
Install style guide + article template as Paperclip skills
Wire approval flow: agent writes article → submits to Telegram for approval → on approve → commit to GitHub → deploy

🔴 Sprint 4 — Orchestration & Self-Healing (NOT STARTED)

Self-healing scripts at /opt/mimoun/openclaw-config/scripts/:

watchdog.sh (*/2 cron) — check gateway, restart if silent >10min
health-check.sh (*/5 cron) — check all services, trigger self-repair
cost-ledger.sh (23:55 daily) — aggregate costs, write to ledger
self-repair.sh (on-demand) — restart gateway, rotate model, notify Telegram


Morning brief automated at 07:00 UTC
Weekly AI Scout (Saturday) — scan for new tools/frameworks matching goals
Wire cost-ledger to daily Telegram report

🔴 Sprint 5 — GitHub + Deploy Pipeline (NOT STARTED)

Deploy script at /opt/newsbites/deploy.sh
Backup script at /opt/backups/ (daily, 7-day rotation)
Git commit all working configs as "mimule-v1-baseline"
```

### Raw Input 2 - Master Plan, Strategy, Vision, Goals
```text
# MIMULE v1 — Master Plan

Date: April 5, 2026
Owner: Marouane Defili
Infrastructure: Hetzner CX32 (4 vCPU, 8GB RAM, 80GB NVMe) at 178.104.120.71
Domain: *.techinsiderbytes.com (Cloudflare DNS + Zero Trust)

Current State — What Actually Works Right Now

... [Original long user master plan and strategic context provided in the conversation should be preserved externally if needed. This continuation file intentionally retains the actionable content above plus the direct goals below.]

GOAL:
RIGHT NOW: Have multiple agents, harnesses, and tools running to leverage different capabilites, tools, channels, and sandbox this AI concept
Short-term: Have the techinsiderbytes.com setup as a portfolio for all AI projects made; all projects should be fully autonomous, like we did with everything.
Mid-term: Offer AI services, train local models, use more robust solutions, sell the same orchestrations, research, develop, and enhance workflows. And/Or have multiple AI companies fully autonomous making money, by making content, selling virtual art/goods, providing analytical, research, AI orchestration services...
Long-term: Be the person to call whenever there is something AI related, and have multiple fully automated AI companies, projects, automations. Have the best workflows, and the best results.

STARTING BLOCKS:
I have already had Openclaw running an agent called baba mimoun or mimoun for short that I envisoned to be my personal assistant that will brief me, give me ideas, and be my first point of contact in case I am on the go. I had also terminal page, that I now no longer need due to the Terminus app, but it was nonetheless a great project to test the capabilities to remotely control and we had worked a lot on the styling and end-user experience. This agent has been setup in a way that it reponds always with the Telegram pre-built option buttons, and I am to respond with text only if I want to customize my answer, there should always be options, the most reasonable ones, and ones that make the agent more autonomous. I have attached a history chat from another project here in claude that we worked on customizing this clawbot/openclaw telegram channel configuration and instructions. I need this behavior perfected in my new agent "mimule".

STRATEGY:
This is an indie-project, I have no plans on adding collaborators, it's only me and the AI. Cost is very important, we need to perfect it before anything else. If we can funnel everything through one API like openrouter it would be good. I have most APIs and I also have the subscriptions that I am using in the web and CLI to plan, troubleshoot, and review. I would like to also make use of those tokens, especially the Codex ones using my Plus subscriptions, alongside all API keys. All projects will be published to techinsiderbytes.com, some are going to be hidden behind entra sign-in others are meant to be public. for now all are admin access only so everything is hidden behind cloudflare zero trust

VISION:
Have a personal assistant in Telegram and other channels; that oversees multiple projects. Create a news media outlet via Paperclip to share digestible news, news for the lazy, news that can easily be understood, news that is not influenced by money or power. Well documented and researched news. This is to become a multi-channel news outlet for all kinds for news. I want it to be one that anyone can go through and read. I want it to be fun, responsive, and to give the users' the freedom of opting-in or out of such topics. For the beginning, what I want is for the AI to create the news.techinsiderbytes.com page; it must be the best looking, the most intuitive, easiest to use web page. To serve our SIMPLE NEWS approach. I chose NewsBites as a name and I am using Nano Banana to generate the logos. We can also ask for a UI/UX design if you want. This must work on all types of devices. I also plan to expand this to create content on all social media platforms, so we need to think about the orchestration that will automate this process. For the first 20 articles; I want everything to go by me, but I want persistent memory and a Q/A agent to learn everything that I I did for those 20 articles and do the same for everything else. For the next 20 articles I will only approve, and if I validate the behavior then we can turn the pipeline on to be fully automated.
```

### Raw Input 3 - Current User Directive
```text
ok, expand on this plan, research all skills that could be added to my setup. save the entire plan into a file that i could tell claude or codex or any to continue. make sure it has everything including the texts i sent u and then add instructions that will make all agents append their progress to that same file. make it somewhere easy.
```

## Progress Log

### 2026-04-05 18:00 UTC - Codex
STATUS:
- built the first durable continuation file and aligned it with the corrected live state

CHANGES:
- created this master continuation document
- researched Codex curated skills available from the local installer catalog
- researched OpenClaw bundled skills via local CLI
- identified immediate, medium, and optional skill candidates

EVIDENCE:
- local skill installer catalog returned 42 curated Codex skill names
- OpenClaw `skills check` reported 52 bundled skills, with 6 ready and 46 missing requirements
- OpenClaw `config validate --json` returned valid

NEXT:
- copy this file into the Mimule workspace as `MASTER_PLAN.md`
- add AGENTS.md instructions telling all agents to append to this file
- test Telegram buttons live

### 2026-04-05 18:28 UTC - Codex
STATUS:
- copied the continuation file into the Mimule workspace and wired AGENTS.md to it

CHANGES:
- copied MASTER_PLAN.md into /root/.openclaw/workspace
- created /home/agent/MIMULE_MASTER_PLAN.md as a symlink shortcut
- updated AGENTS.md so future agents read and append to MASTER_PLAN.md

EVIDENCE:
- /home/agent/MIMULE_MASTER_PLAN.md now points to /opt/mimoun/openclaw-config/workspace/MASTER_PLAN.md
- AGENTS.md now contains a Shared Continuation File section
- MASTER_PLAN.md exists in the workspace with root-owned protected permissions

NEXT:
- run the live Telegram button test
- then either debug button rendering or start NewsBites scaffolding

### 2026-04-05 19:53 UTC - Codex
STATUS:
- tightened the live Mimule workspace for Telegram-native bootstrap/buttons and fixed the broken heartbeat verification path

CHANGES:
- added `BOOTSTRAP.md` at `/opt/mimoun/openclaw-config/workspace/BOOTSTRAP.md`
- updated `/opt/mimoun/openclaw-config/workspace/SOUL.md` to explicitly forbid fake bracket and double-bracket pseudo-buttons and to prefer native Telegram `action: "send"` on `/start` and `/new`
- updated `/opt/mimoun/openclaw-config/workspace/AGENTS.md` with the same Telegram action rule and a log-first rule if live buttons still fail
- updated `/opt/mimoun/openclaw-config/workspace/HEARTBEAT.md` to use direct health endpoints instead of assuming `openclaw` exists in PATH
- updated `/opt/mimoun/openclaw-config/workspace/TOOLS.md` with the Docker/runtime constraint and corrected Paperclip health endpoint
- created `/opt/mimoun/openclaw-config/scripts/health-check.sh`
- restarted the `openclaw_gateway` container once to clear stale session context after prompt changes

EVIDENCE:
- OpenClaw docs inside the running container confirm Telegram inline buttons use a native message action with a `buttons` matrix and `callback_data`
- `/opt/mimoun/openclaw-config/workspace/BOOTSTRAP.md` is now visible inside the container at `/root/.openclaw/workspace/BOOTSTRAP.md`
- `node /usr/local/lib/node_modules/openclaw/openclaw.mjs config validate --json` returned `{"valid":true,"path":"/root/.openclaw/openclaw.json"}`
- `curl -fsS http://127.0.0.1:18789/health` returned `{"ok":true,"status":"live"}`
- `/opt/mimoun/openclaw-config/scripts/health-check.sh` returned gateway OK and Paperclip OK using `http://127.0.0.1:3100/api/health`
- `docker inspect paperclip --format '{{json .State.Health}}'` reported `"Status":"healthy"`
- post-restart logs show the gateway listening again on `ws://0.0.0.0:18789`

NEXT:
- run a real Telegram DM test with `/new` and confirm the reply shows clickable native inline buttons, not text that only looks like buttons
- if the DM still renders pseudo-buttons or plain text, capture the exact delivered message plus fresh `openclaw_gateway` logs during that reply
- after Telegram DM behavior is confirmed, move to NewsBites scaffolding in `/opt/newsbites`

### 2026-04-06 12:33 UTC - Codex
STATUS:
- simplified the live Paperclip NewsBites editorial roster to one active agent and aligned the workspace docs to the new operating mode

CHANGES:
- updated `/var/lib/docker/volumes/paperclip_data/_data/instances/default/companies/92de899d-c83d-49bb-9d96-7f98b85ec5fb/agents/deb584be-0360-4e38-a8ee-363e970b0f59/instructions/AGENTS.md` so `NewsBites Editor` now acts as the single live editorial agent and treats specialist desk files as reference-only
- updated `/var/lib/docker/volumes/paperclip_data/_data/instances/default/workspaces/newsbites_editorial/README.md` and `OPERATING_MODEL.md` to document the one-agent live roster and the $8 / 15-turn target
- updated Postgres `agents` rows so these agents are now terminated: `NewsBites Researcher` (`8d612720-1180-457d-9fd2-b51d68e7171c`), `News Desk`, `NewsBites Writer`, `Verification Desk`, `Publisher Desk`
- left legacy terminated `NewsBites Researcher` (`94fa5eed-5665-4738-9202-e63e7afbf25a`) untouched
- reassigned the full NewsBites issue queue from `News Desk` to `NewsBites Editor`
- synced `NewsBites Editor` to `budget_monthly_cents=800` and `adapter_config.maxTurnsPerRun=15`
- deactivated the old budget policies for the terminated NewsBites specialist agents
- audited runtime migration blockers and confirmed neither `gemini` nor `opencode` CLI is installed on the host yet

EVIDENCE:
- `select ... from agents` now shows `NewsBites Editor` as the only non-terminated NewsBites editorial agent with `budget_monthly_cents=800` and `maxTurnsPerRun=15`
- `select ... from issues` shows the pilot article and all NewsBites backlog articles now assigned to `deb584be-0360-4e38-a8ee-363e970b0f59`
- `select ... from budget_policies` shows only the editor's agent budget policy remains active at `800` cents; the five specialist policies are now inactive
- `curl -fsS http://127.0.0.1:3100/api/health` returned `{\"status\":\"ok\",\"version\":\"0.3.1\",\"deploymentMode\":\"authenticated\",...}`
- `gemini --version` failed with `command not found`
- `opencode --version` failed with `command not found`

NEXT:
- install and validate the intended low-cost runtime before changing the surviving editor away from `claude_local`
- preferred paths to test next:
- `gemini_local` with Gemini CLI plus `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- or `opencode_local` if you want a `provider/model` path that may fit OpenRouter better
- after the runtime is installed, switch `NewsBites Editor` from `claude_local` and run one end-to-end pilot article from dossier to approval

### 2026-04-06 12:39 UTC - Codex
STATUS:
- fully restored the Paperclip NewsBites roster after an incorrect simplification pass

CHANGES:
- restored the NewsBites issue queue assignment back to `News Desk`
- restored live Paperclip agent statuses, budgets, and max-turn settings for:
  - `NewsBites Editor`
  - `NewsBites Researcher`
  - `News Desk`
  - `NewsBites Writer`
  - `Verification Desk`
  - `Publisher Desk`
- re-activated the previously deactivated agent budget policies
- reverted the one-agent wording added earlier to the live `NewsBites Editor` instructions bundle
- reverted the one-agent wording added earlier to the shared `newsbites_editorial` workspace docs

EVIDENCE:
- `select ... from agents` now again shows:
  - `NewsBites Editor` idle / `claude-sonnet-4-6` / 600 cents / 8 turns
  - `NewsBites Researcher` idle / `claude-haiku-4-5-20251001` / 400 cents / 10 turns
  - `News Desk` error / `claude-haiku-4-5-20251001` / 300 cents / 10 turns
  - `NewsBites Writer` idle / `claude-sonnet-4-6` / 700 cents / 8 turns
  - `Verification Desk` idle / `claude-sonnet-4-6` / 600 cents / 8 turns
  - `Publisher Desk` idle / `claude-haiku-4-5-20251001` / 250 cents / 6 turns
- `select ... from issues` shows the pilot article and NewsBites backlog items assigned back to `6de4252a-9cec-4c9e-a892-dc36e9bdda65` (`News Desk`)
- `select ... from budget_policies` shows all six related agent budget policies active again
- `curl -fsS http://127.0.0.1:3100/api/health` still returned `{\"status\":\"ok\",\"version\":\"0.3.1\",\"deploymentMode\":\"authenticated\",...}`

NEXT:
- do research only before any further Paperclip changes
- compare best model/provider pairings per editorial role without modifying the roster
- present a recommended target mapping first, then wait for approval before changing any agent config
