# Claude Fable handover — model discovery and unified Agent Workspace

**Prepared:** 2026-07-19 UTC
**Status:** continuation contract; verify every runtime fact before acting
**Role:** Claude Fable researches, plans, decomposes, delegates, reviews, integrates, logs, and reports. GPT Terra or Sonnet 5 writes production code in bounded isolated worktrees.

## Mission

Continue the MIMULE / TechInsiderBytes Control Surface program without losing any operator requirement or weakening its evidence rules. The two active tracks are:

1. trustworthy provider catalogs, credential health, free-model admission, and redemption; and
2. a persistent all-in-one Agent Workspace for Terminal, Codex, OpenCode, Claude, and Gemini.

Do not interpret “copy the competition” as copying proprietary source. Reproduce the useful behavior and workflow patterns in an original implementation, and improve them where MIMULE needs stronger ownership, security, traceability, or operator control.

## Operating model

- Fable is the orchestrator and research lead. Ground each slice in the current repository, current primary documentation, and verified live state.
- Delegate implementation only to **GPT Terra or Sonnet 5**, one bounded task and file scope at a time, preferably in a detached worktree.
- Keep review bounded. Fable runs the objective acceptance gates itself. Use at most one separate GPT Terra or Sonnet 5 adversarial pass when a slice is security-sensitive, production-mutating, or its specification explicitly requires one; fix concrete findings, rerun the gates once, and ship or stop. Do not create an open-ended review loop.
- Fable reconciles the shared tree, runs the final gates itself, commits only intended paths, deploys only when authorized, verifies live evidence, and logs the result.
- Never let two builders write the same checkout. Preserve unrelated dirty files.

## Read first

1. `/root/AGENTS.md`
2. `/root/CLAUDE.md`
3. `/home/agent/MIMULE_MASTER_PLAN_V3.md`
4. `/root/README.md`
5. `/root/control-surface-plans/REPAIR_PLAN_MODEL_ROUTING.md`
6. `/root/control-surface-plans/tasks/SPEC_48_CREDENTIAL_HEALTHCHECK.md`
7. `/root/control-surface-plans/tasks/SPEC_49_MODEL_CATALOG_DISCOVERY_AND_REDEMPTION.md`
8. `/root/control-surface-plans/OMNIROUTE_INTEGRATION_PLAN.md`
9. `/root/control-surface-plans/ALL_IN_ONE_AGENT_WORKSPACE_PLAN.md`
10. `/opt/opencode-control-surface/README.md`
11. the latest entry in `/opt/ai-vault/daily/<UTC-date>.md`
12. current status, log, remotes, branches, worktrees, services, and timers in every repository you will touch

## Operator requirements — preserve all of them

### Models and providers

- Check AIHubMix at `https://aihubmix.com` and its documented backup `https://api.inferera.com`.
- Keep the supplied AIHubMix credential in a root-readable server environment only. Never put its value in Git, plans, logs, prompts, process arguments, browser state, or this handover. Recommend rotation because it was pasted into chat.
- Discover AIHubMix’s free text/chat models, but add only models that return a substantive bounded completion. A catalog price of zero, a list response, HTTP 200, or a canned quota/balance message is not enough.
- Treat AIHubMix and inferera as one provider identity, not two independent redundancy domains.
- Scan the complete supported catalog for every existing provider and detect additions, removals, schema changes, capability changes, and price/eligibility drift.
- Harden discovery so partial, malformed, implausibly collapsed, stale, or oversized catalogs cannot erase healthy models or invent authoritative removals.
- Separate provider catalog presence, policy eligibility, credential validity, and substantive model success.
- Check credential health with model health so an expired or exhausted key does not make a good model look permanently dead.
- Give temporarily blocked, degraded, or automatically quarantined models bounded full-scan redemption opportunities when the current complete catalog still lists their exact identity.
- Manual force-blocks remain authoritative. Quick scans cannot run an uncapped redemption cohort. Catalog-absent routes cannot escape through a generic stale path.
- A recovered route needs current substantive success; fallback promotion needs its configured consecutive-success evidence. Rate limits and 5xx responses do not build promotion evidence.
- Prevent surprise billing: auto-discovered free routes that later become paid or ineligible are quarantined from the free rotation. Incomplete evidence cannot create a destructive decision.
- Preserve exact provider/model identity and distinguish it from the logical LiteLLM route.

### OmniRoute and comparable projects

- Continue evaluating `diegosouzapw/OmniRoute` as a semi-trusted, loopback-only leaf behind LiteLLM, never as the routing authority.
- OmniRoute may eventually be shared. It must not receive personal keys, reused passwords, personal information, or private prompts during the first phase.
- Use only manifest-approved truly keyless providers initially. Any later provider credential must be new, dedicated, minimally scoped, independently revocable, and separate from personal/LiteLLM keys.
- Pin source and image digests, require authentication, encrypt stored credentials, sandbox the process/container, bind locally, scope every consumer key, and keep dashboard/admin paths private.
- OmniRoute Phase 1 is plan-only until separately authorized. Start with synthetic/public prompts and one reviewed keyless adapter.
- Research Arena AI, Mammouth AI, Lookatmy.ai, Portkey, and other relevant gateways/workspaces from primary sources.
- Do not scrape consumer-only products to manufacture an API integration. At the 2026-07-18 observation, Arena’s developer API was authenticated/credit-billed, Mammouth exposed no zero-input-and-output-price catalog entries, and Lookatmy.ai had no documented public developer API.
- Adopt the best workflow, routing, observability, isolation, and control ideas from competitors when they are better than MIMULE’s current behavior. Record each adopted behavior as a delivery slice with an executable acceptance test.

### Terminal and all-in-one Agent Workspace

- Replace the current one-session terminal experience with multiple persistent terminal sessions.
- Sessions must remain alive while the operator navigates elsewhere, support collapse/restore, tabs/splits, reconnect, retained output, exact stop, and server-enforced writer leases.
- Study and plan the merger of Terminal, Codex, OpenCode, Claude, and Gemini pages into one GUI/CLI workspace.
- Preserve each harness’s real capabilities through adapters; do not reduce everything to a lowest common denominator.
- Provide complete, capability-aware model and inference control: exact model, fallback, auto, compare, reasoning effort/budget, variant, temperature/top-p, output/context limits, tools/MCP, modalities, sandbox, network, and approval profile where supported.
- Treat image, audio, and video generation, embeddings, reranking, and batch inference as separate capability-gated adapters; never imply that selecting any text model makes every inference type available.
- Record requested and effective settings. Unsupported settings must fail visibly rather than disappear.
- Make sessions, runs, workspaces, artifacts, model attempts, fallback reasons, tools, commands, diffs, checkpoints, tokens, cost, latency, permissions, and provenance traceable and exportable through the same API in GUI and CLI.
- Borrow the best proven behaviors from VS Code, Zed, Warp, Claude, OpenCode, Cursor, Devin, Windsurf, Google Antigravity, Arena, Conductor, T3 Code, and Agent Deck. The scorecard and acceptance tests are in `ALL_IN_ONE_AGENT_WORKSPACE_PLAN.md`.
- Google Antigravity is a future reference/adapter, not the current Gemini CLI backend.

### OpenCode test-session privacy — highest priority

- Internal OpenCode probe/test sessions must be hidden from every normal UI and API path forever while retaining root-only audit evidence.
- This is a server-side authorization/visibility invariant, not a CSS filter and not deletion.
- Future producers use the exact reserved marker `__mimule_probe_v1__:`. Ordinary clients cannot request the internal classification.
- The verified legacy ids require a one-time immutable migration receipt; never keep a broad title/root-directory heuristic that could hide a legitimate session.
- Exclude hidden sessions before serialization from lists, direct-id descendants, messages, diffs, mutations, search, recents, counts, restored state, notifications, analytics, imports, and filtered SSE.
- A root-only audited CLI may include them only with an explicit diagnostic flag.
- Do not claim this is complete while the raw OpenCode upstream remains publicly reachable.

## Verified state to recheck

- Credential observation shipped in `/opt/mimoun@84770ba`; its Control Surface reader/UI shipped in `/opt/opencode-control-surface@56934b0`.
- Validation receipt schema v3 shipped in Control Surface `a4b0046`.
- The AIHubMix credential is installed by name in `/etc/litellm/litellm.env`, which was verified `0600 root:root`. Never display its value.
- The observed AIHubMix catalog had zero-price candidates, but the supplied account returned a canned zero-usage quota/balance response. Therefore zero AIHubMix models were durably verified usable and none should be added from catalog evidence alone.
- Catalog/discovery/redemption shipped in `/opt/mimoun@4007b3f` and was pushed to `origin/main`. It is observation-only on full scans: it writes catalog/health/proposal evidence but cannot edit LiteLLM configuration, hot-add a route, or restart LiteLLM. Recheck the first scheduled-run evidence in the newest repair-plan and Vault append before acting on a proposal.
- `OMNIROUTE_INTEGRATION_PLAN.md` is research and design only. No OmniRoute service, container, provider key, route, or public endpoint has been authorized or created.
- `ALL_IN_ONE_AGENT_WORKSPACE_PLAN.md` is a Shape design brief awaiting explicit operator confirmation.
- A verified raw OpenCode upstream bypass remains reachable outside the authenticated Control Surface, and its service configuration exposes credentials too broadly. Exact endpoint, listener, and unit evidence is retained only in the private AI Vault. This prevents an honest “hidden forever” claim.
- At the 2026-07-18 observation, OpenCode history contained about 100 root-directory sessions, overwhelmingly probe/test noise. Future marker changes do not retroactively secure or hide them.
- Root and runtime READMEs now explain current behavior and roadmap behavior in plain language; verify their committed hashes before editing.

## Next execution order

1. Reconcile the newest commits, pushes, plan/Vault evidence, timers, service state, and dirty-tree ownership. Do not assume this prompt’s snapshot is newer than the append-only logs.
2. Observe the next scheduled model-health cycles. Inspect only sanitized catalog counts, diff hashes, credential categories, candidate/admission decisions, config diffs, and service identity. Never print provider bodies or key values.
3. If no AIHubMix model returned a substantive completion, leave its live rotation empty and report the truthful reason. If a model passes every SPEC 49 gate, admit only that exact route and prove the config/hot-add result without bypassing restart gates.
4. Ask the operator to confirm the recommended defaults in the Agent Workspace Shape brief.
5. Separately request one-shot authorization for Slice 0 production containment: loopback/Unix binding, raw Caddy/DNS route removal, firewall verification, secrets-file migration, and rotation of credentials exposed inline.
6. After that authorization, write a bounded Slice 0 spec; have GPT Terra or Sonnet 5 implement it; run Fable's objective gates and at most one risk-based adversarial pass; capture external and loopback acceptance evidence. Do not combine it with UI work.
7. Only after Slice 0 passes, implement Slice 1: durable ownership-aware registry plus immutable hidden-session enforcement across every path and SSE.
8. Then implement Slice 2 multi-session terminals, Slice 3 unified read shell, Slice 4 complete launch/model controls, Slice 5 traces/artifacts/CLI, and Slice 6 workspace/profile hardening. Each slice must preserve legacy behavior until its parity gate passes.
9. OmniRoute Phase 1 remains a separate explicit decision. Do not let Agent Workspace approval imply aggregator deployment or external sharing.
10. Keep the routing repair arc shadow-only until its existing restart, causal receipt, exact-429, recovery/canary, R4/R5, and authorized real-work gates all pass. Do not infer enforcement permission.

## Safety boundaries

- Never touch `/opt/newsbites`.
- Do not run Playwright or a browser on this VPS. Use an allowed external/staging visual-verification path when a UI slice needs it.
- Never broad-kill processes, rewrite branch history, force-push, reset a dirty tree, or discard another agent’s work.
- Resolve exact process and file targets before operational changes.
- Never hand-edit fallback chains owned by reprobe.
- Do not manually restart LiteLLM or run a competing reprobe while repair-arc timing evidence is aging unless a separately authorized recovery requires it.
- Do not enable R2 enforcement, public OmniRoute sharing, or raw OpenCode production containment by implication.
- Never echo credentials, read them into chat, put them on command lines, or commit environment files.
- Keep docs factual: label research, proposal, implemented code, deployed runtime, and accepted behavior as different states.

## Required evidence and publication protocol

For every slice:

1. record scope and acceptance conditions in the relevant spec;
2. implement in an isolated worktree with GPT Terra or Sonnet 5;
3. run focused executable tests, syntax/type/build checks, and diff checks; add at most one independent adversarial pass only when risk or the specification requires it, and never loop reviews indefinitely;
4. inspect live/config effects in proportion to risk;
5. secret-scan the staged diff without printing candidate values;
6. commit only owned paths with an imperative subject;
7. push the correct branch to its verified GitHub remote when authorized;
8. append a UTC entry to the most specific plan;
9. append the same factual status to both `/root/MIMULE_MASTER_PLAN_V3.md` and `/home/agent/MIMULE_MASTER_PLAN_V3.md`;
10. append the session to `/opt/ai-vault/daily/<UTC-date>.md`;
11. update the relevant README and docs when behavior, architecture, commands, or operator expectations change; keep goals, components, control/data flow, routing/health logic, current-versus-roadmap status, commands, security boundaries, and the documentation map in plain language;
12. report commit hashes, pushed branches, tests, live evidence, remaining gates, and any credential-rotation recommendation.

Completion means every operator requirement above is either shipped with evidence or explicitly recorded as still gated. Never turn a plan, a hidden UI row, an HTTP 200, or a passing self-test into a false completion claim.
