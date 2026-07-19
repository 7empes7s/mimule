# SPEC 20 — Hermetic builder-test seam: `bun test` must NEVER spawn real builder passes

## Context (read first — this fixes a proven live incident)
Work in `/opt/opencode-control-surface` (Bun + TS). Do NOT commit/push/restart; leave changes
uncommitted. PROVEN 2026-07-11: running `DASHBOARD_DB=1 bun test` on this host spawns REAL
`codex exec --dangerously-bypass-approvals-and-sandbox` builder passes against this very repo.
Mechanism:
- `server/api/builder.test.ts` calls `builderStartWorkflowHandler` (6 call sites) →
  `startWorkflowRun` → the REAL spawn path in `server/builder/runner.ts`.
- The temp `DASHBOARD_DB_PATH` only isolates DB rows. `runner.ts` hardcodes
  `BUILDER_RUNS_DIR = "/var/lib/control-surface/builder-runs"` and
  `TENANT_RUNS_BASE_DIR = "/var/lib/control-surface/tenants"` (~lines 38–39, used by the
  run-dir resolver ~line 121) plus backups at `"/var/lib/control-surface/builder-backups"`
  (~line 422), and `tmuxSocket(tenantId)` returns `"tib-" + tenantId` (~line 241) — so test
  runs write REAL run dirs and spawn through the REAL hidden `tmux -L tib-mimule` server.
- The test's fake-codex PATH shim (builder.test.ts ~1199–1210) NEVER reaches the main pass:
  the pass script is spawned via `tmux new-session` (~lines 944 and 1885) and inherits the
  tmux SERVER's environment (PATH is not in tmux's update-environment) — the server's PATH
  contains the real codex. Only `builder_spawn_child` explicitly forwards PATH (~line 1596),
  which is why the fake-child assertions pass while the MAIN pass runs real codex.

## Build this

### 1. Env-resolved state root (server/builder/runner.ts + every other consumer)
Replace the module-level constants with call-time resolvers (same file, exported for reuse):
```ts
export function builderStateRoot(): string {
  return process.env.BUILDER_STATE_ROOT?.trim() || "/var/lib/control-surface";
}
```
- `BUILDER_RUNS_DIR` → `join(builderStateRoot(), "builder-runs")`
- `TENANT_RUNS_BASE_DIR` → `join(builderStateRoot(), "tenants")`
- builder-backups dir (~line 422) → `join(builderStateRoot(), "builder-backups")`
- `BUILDER_OPENCODE_CONFIG_HOME` stays as-is (not test-reachable).
Resolution must happen AT CALL TIME (inside the functions that build paths), never captured
at module load — tests set the env in beforeEach after import.
Then `grep -rn "/var/lib/control-surface" server/` and route EVERY builder-runs / tenants /
builder-backups path construction through these resolvers (check `server/builder/store.ts`,
`server/api/builder.ts`, and anything else that reconstructs run-dir paths for artifacts,
logs, or summaries). Do NOT touch non-builder paths (e.g. the dashboard.sqlite default, live
service state files) — builder state paths ONLY.

### 2. Env-resolved tmux socket prefix (runner.ts)
`tmuxSocket(tenantId)` → `` `${process.env.BUILDER_TMUX_SOCKET_PREFIX?.trim() || "tib-"}${tenantId}` ``,
read at call time. Signature and export unchanged (it is re-exported ~line 245 — keep every
existing import working). Grep for any OTHER place that hardcodes the `tib-` prefix
(runner.ts pass-contract/child-helper generation uses `tib-${TENANT_ID}` inside generated
bash — that interpolates the env var TENANT_ID at run time; those generated snippets must
use the SAME prefix: emit the resolved prefix into the generated script instead of the
literal `tib-`).

### 3. Deterministic PATH for pass scripts (runner.ts)
In the generated `pass-N.sh` preamble (where BUILDER_DIR/RUN_ID/etc. are exported), add an
exported PATH line baked from the GENERATING process's `process.env.PATH` at script-write
time, safely single-quoted (escape embedded `'` as `'\''`):
```bash
export PATH='<current process.env.PATH>'
```
This makes the main pass deterministic (today it inherits whatever environment the
long-lived tmux server happened to be born with — nondeterministic in production too) and
lets the tests' fake-codex shim actually govern the main pass. Apply to BOTH spawn paths'
script generation (first pass ~1885 and follow-up pass ~941 use the same generator — verify
and cover both). Children already forward PATH (~1596) — with the export they inherit it
anyway; leave line 1596 alone.

### 4. Hermetic test environment (server/api/builder.test.ts)
In the existing beforeEach/afterEach (extend the current save/restore idiom):
- Save/set `BUILDER_STATE_ROOT = join(tempDir, "builder-state")` and
  `BUILDER_TMUX_SOCKET_PREFIX = "tib-test-" + <short random per file run> + "-"`.
- Restore both in afterEach exactly like the existing env vars, and kill the test tmux
  server best-effort: `spawnSync("tmux", ["-L", socket, "kill-server"])` for each socket the
  tests may have created (at minimum `${prefix}mimule`; derive from the prefix, ignore
  failures).
- Replace EVERY `planFile: "/root/DASHBOARD_V4_SCHEDULER_PLAN.md"` (10 occurrences) with a
  temp plan file written under tempDir in beforeEach. Its content must satisfy
  `getPlanSanityStartBlockers` (read `server/builder/plan-sanity.ts` and write the minimal
  markdown that passes — do not weaken plan-sanity itself).
- In the child-helper lifecycle test (~1197), keep the fake-codex shim; it should now govern
  the MAIN pass too (via the baked PATH). Extend its assertions: the `command-script`
  artifact path must start with the temp `BUILDER_STATE_ROOT` (proves run dirs land in the
  temp root), and `pass-1.sh` must contain the baked `export PATH=` line whose value contains
  the fake-bin dir.
- Add one focused guard test: snapshot `readdirSync` of the REAL
  `/var/lib/control-surface/builder-runs` and `/var/lib/control-surface/tenants` (existsSync
  guard) before starting a workflow run, start + stop one, assert both listings are
  UNCHANGED afterward.
- Check the other test files that exercise the runner (`grep -rln "startWorkflowRun\|builderStartWorkflowHandler" server/ --include='*.test.ts'`)
  and give each the same env seam in its setup if it can reach the spawn path.

## Hard rails
- Production behavior with the env vars UNSET must be byte-identical paths (`/var/lib/control-surface/...`, `tib-<tenant>`) — the ONLY intended production-visible change is the
  `export PATH=...` line inside generated pass scripts.
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts; no dev server on :3000.
- Do NOT edit `server/insights/autoapplyPolicy.ts`. Never widen `e2e/fresh-host/gate.sh` matchers.
- Do NOT touch the live tmux server `tib-mimule` or `/var/lib/control-surface` contents.
- The working tree contains UNRELATED uncommitted work (terminal feature: `app/routes/TerminalPage.tsx`,
  `server/terminal/`, `server/index.ts`, `App.tsx`, `DashSidebar.tsx`, `navRegistry.ts`,
  `globals.css`, `package.json`, `bun.lock`, plus `e2e/fresh-host/REPORT.*`) — do NOT modify
  or revert ANY of those files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. Snapshot before/after proof around the focused run:
   `ls /var/lib/control-surface/builder-runs | wc -l` and
   `ls /var/lib/control-surface/tenants/mimule/projects/project__opt_opencode-control-surface/builder-runs | wc -l`
   BEFORE and AFTER step 3 — counts must be IDENTICAL, and
   `ps -eo args | grep -c '[c]odex exec'` must be 0 after.
3. `DASHBOARD_DB=1 bun test server/api/builder.test.ts server/builder/ --timeout 120000` — all pass.
4. `tmux -L tib-mimule list-sessions` — still exactly the sessions present before (expect: `init` only).
5. `git status --short` — ONLY runner.ts, builder.test.ts, plus any consumer files from the
   grep in step 1 of "Build this" and test files from step 4's last bullet. None of the
   terminal-feature files listed in Hard rails.
6. `git diff --check` — no whitespace errors.

## Report back
Files changed (one line each), the resolver snippets, the pass-script PATH preamble snippet,
the before/after run-dir counts + codex process count, test summary lines, and explicit
confirmation that defaults are unchanged with env unset and that no terminal-feature file
was touched.
