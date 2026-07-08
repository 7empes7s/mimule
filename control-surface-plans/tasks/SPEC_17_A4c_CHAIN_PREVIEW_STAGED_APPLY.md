# SPEC 17 — ULTRAPLAN Phase 3 A4c: Fallback-chain preview + staged apply

## Context & operator decision (READ FIRST — do not deviate)
ULTRAPLAN A4c is: *"show the resolved fallback chain that WOULD be written from live health,
diff vs current, one Apply (medium). Kills the manual chain-rebuild session forever."*

The **Apply target** is the LiteLLM router fallbacks in `/etc/litellm/config.yaml`
(`router_settings.fallbacks`) — the routing **authority** for the whole editorial pipeline +
Telegram + the CS gateway. The CS server has **no YAML serializer** (only a minimal read-only
parser in `server/gateway/config.ts`), and that config is hand-maintained with comments/ordering.

**The operator explicitly chose the SAFE mechanism: the CS NEVER writes `/etc/litellm/config.yaml`.**
"Apply" is a **staged patch**: the CS computes the diff and produces (a) the exact corrected
`router_settings.fallbacks` YAML block as copy-to-clipboard text and (b) a one-line apply command
the operator runs (backup + reload). This preserves the operator's comments/ordering and has zero
corruption risk. Do **NOT** add any code path that writes, renames, or reloads the live LiteLLM
config. Do **NOT** add a mutating action, a new auto/review tier, or touch `autoapplyPolicy.ts`.

Master is at `ee0cc0d` (clean). You work in `/opt/opencode-control-surface`. Server = Bun + TS
under `server/`, frontend = Vite/React/wouter under `app/`.

## The data model (this is exact — verified against live artifacts)
- **Proposed chains** come from `model-health.json` `.fallbacks` (the dynamic resolver output),
  keyed by ROLE. Read it with the existing `DASHBOARD_MODEL_HEALTH_PATH` env seam (default
  `/var/lib/mimule/model-health.json`). Live keys today:
  `editorialHeavy`, `editorialFast`, `editorialCloudHeavy`, `editorialCloudFast` → each a `string[]`.
- **Current chains** come from `/etc/litellm/config.yaml` `router_settings.fallbacks`, a list of
  single-key maps: `[{ "editorial-heavy": [...] }, { "editorial-fast": [...] }, ...]`, keyed by
  LOGICAL model name.
- **Role → logical-name map** (the ONLY 4 roles in scope):
  ```
  editorialHeavy      -> editorial-heavy
  editorialFast       -> editorial-fast
  editorialCloudHeavy -> editorial-cloud-heavy
  editorialCloudFast  -> editorial-cloud-fast
  ```
  Ignore any other health `.fallbacks` key. If a mapped logical name is absent from the live
  config's `router_settings.fallbacks`, treat `current` as `null` (a brand-new chain).

## Step 1 — Read live `router_settings.fallbacks` robustly (READ-ONLY, seamed)
CS has no YAML lib, so read the live config through the existing `runShell` seam
(`server/api/shell.ts`, `runShell` + `setRunShellForTests`) using a **read-only** `python3`
one-liner that emits the fallbacks as JSON:

```
python3 -c 'import yaml,json,sys; c=yaml.safe_load(open(sys.argv[1])) or {}; rs=c.get("router_settings") or {}; print(json.dumps(rs.get("fallbacks") or []))' <CONFIG_PATH>
```

- Config path via a NEW env seam `DASHBOARD_LITELLM_CONFIG_PATH` (default `/etc/litellm/config.yaml`).
- Parse the runShell stdout as JSON → an array of single-key maps → flatten to
  `Record<logicalName, string[]>`. On any failure (non-zero exit, unparseable), degrade gracefully:
  return an empty map and surface a `configReadError: true` flag in the payload (do NOT throw / 500).
- This `python3` call is the ONLY interaction with `/etc/litellm/config.yaml`, and it is a READ.
  NEVER write that file. Quote the path argument.

Put this helper in a new module (suggest `server/adapters/modelChainSync.ts`) or alongside the
models adapter — your call, but keep it importable + unit-testable and route the shell call through
`runShell` (NOT a bare `execSync`) so tests can stub it via `setRunShellForTests`.

## Step 2 — Compute the diff
For each of the 4 roles that exist in health `.fallbacks`, build a `ChainDiff`:
```ts
{
  role: string;              // e.g. "editorialHeavy"
  logicalName: string;       // e.g. "editorial-heavy"
  current: string[] | null;  // from live config, or null if absent
  proposed: string[];        // from health .fallbacks[role]
  inSync: boolean;           // current !== null && arrays deep-equal INCLUDING order
  added: string[];           // in proposed, not in current  (current null => all proposed)
  removed: string[];         // in current, not in proposed
  reordered: boolean;        // same set, different order (false when added/removed non-empty or current null)
}
```
Chain **order is routing priority** — a pure reorder is a real change (`inSync=false`, `reordered=true`).

## Step 3 — Generate the corrected block + apply command (staged patch, NO write)
- `correctedYamlBlock: string` — a valid YAML `router_settings.fallbacks` block that equals the
  **current** live list with ONLY the 4 editorial keys' arrays replaced by their `proposed` values,
  and **every other key preserved exactly** (routing-cheap, mimule-chat, github-gpt41, …). Because CS
  has no YAML serializer, hand-write a tiny serializer for this exact shape (list of
  `{ logicalName: string[] }`). Emit block style, 2-space indent, e.g.:
  ```yaml
  router_settings:
    fallbacks:
      - editorial-heavy:
          - nvidia-llama33-70b
          - nvidia-qwen3-80b
          - editorial-cloud-heavy
      - editorial-fast:
          - ...
  ```
  Include the `router_settings:` + `fallbacks:` headers so the operator can paste-replace cleanly.
  Preserve the current file's key ORDER for non-editorial entries; place keys not present in the
  current config (brand-new chains) at the end. Quote model names only if they contain YAML-special
  chars (they don't today — keep it simple, but a value starting with a non-alnum should be quoted).
- `applyCommand: string` — a single copy-pasteable command that does **backup + reload + verify**,
  NOT a write of the fallbacks (the operator pastes the block themselves). Exactly:
  ```
  sudo cp -a /etc/litellm/config.yaml /etc/litellm/config.yaml.bak-$(date +%Y%m%d-%H%M%S) && sudo systemctl reload litellm && sleep 2 && systemctl is-active litellm && curl -s http://127.0.0.1:4000/v1/models >/dev/null && echo "litellm reloaded OK"
  ```
  Keep it a documented string constant (a `LITELLM_APPLY_COMMAND` const is fine).

## Step 4 — Expose a read-only endpoint
Add `GET /api/models/chain-sync` (register in `server/api/router.ts` next to the other
`/api/models/*` GET routes) returning `ok({...})` with:
```ts
{
  generatedAt: number;
  healthAgeSec: number;          // now - health.lastFullCheckAt, in seconds
  stale: boolean;                // healthAgeSec > 6*3600 (mirror the 6h staleness the pipeline uses)
  configReadError: boolean;      // true if the python3 read failed
  anyChanges: boolean;           // any chain not inSync
  chains: ChainDiff[];
  correctedYamlBlock: string;
  applyCommand: string;
}
```
Use the standard `ok()` envelope + auth exactly like the neighbouring model routes. No POST, no
mutation, no job.

## Step 5 — Frontend section on the Models page
In `app/routes/ModelsPage.tsx`, add a **"Fallback chain sync"** card/section that:
- fetches `/api/models/chain-sync` (use the page's existing `authFetch`/fetch pattern),
- shows freshness ("health checked Nm ago", amber if `stale`) and a top-level badge
  ("All chains in sync" green vs "N chain(s) differ" amber); if `configReadError`, show a clear
  inline note ("couldn't read /etc/litellm/config.yaml — showing proposed only") and still render
  proposed,
- per role: logical name, `current` chips vs `proposed` chips with added (green) / removed
  (strikethrough/red) / reordered (badge) highlighting; "in sync" pill when unchanged,
- two buttons: **"Copy corrected block"** (copies `correctedYamlBlock`) and **"Copy apply command"**
  (copies `applyCommand`), each with a short inline instruction: "1) paste the block into
  `router_settings.fallbacks` in /etc/litellm/config.yaml, 2) run the apply command (backs up +
  reloads)". Reuse whatever clipboard helper the page/app already uses; if none, `navigator.clipboard.writeText`.
- Match the existing Models page styling + the CS table/section standard (consistent padding/borders,
  never silent). Keep it a section/card (not a new table).

## Hard rails (do not violate)
- **CS NEVER writes/renames/reloads `/etc/litellm/config.yaml`.** The only touch is the READ-ONLY
  `python3` one-liner via `runShell`. No `execSync` writes, no `systemctl`, no `docker`, no `pkill`.
- **No mutating action, no new tier, no auto-apply.** Do NOT edit `server/insights/autoapplyPolicy.ts`,
  `server/api/actionDescriptors.ts`, `server/api/actions.ts`, or `server/api/execute.ts`. A4c is a
  read view + copy affordance only.
- Route the config read through the `runShell` seam; add the `DASHBOARD_LITELLM_CONFIG_PATH` env seam.
  Reuse the existing `DASHBOARD_MODEL_HEALTH_PATH` seam for health.
- **Do NOT commit, do NOT restart any service, do NOT run systemctl/docker/pkill.** Working tree only.
  Claude (the orchestrator) verifies and commits.
- Read-only only for `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`. Never set
  `DEMO_SEED`. Never widen any `e2e/fresh-host/gate.sh` matcher/allowlist.

## Tests (hermetic — write these, they must pass)
Create `server/adapters/modelChainSync.test.ts` (or co-locate) with `DASHBOARD_DB=1`-safe, seamed tests:
1. **Diff correctness**: point `DASHBOARD_MODEL_HEALTH_PATH` at a temp health JSON with known
   `.fallbacks` for all 4 roles; stub `runShell` (via `setRunShellForTests`) to return a known
   `router_settings.fallbacks` JSON (as the python3 one-liner would). Assert `inSync`, `added`,
   `removed`, `reordered` for: (a) an identical chain, (b) an added model, (c) a removed model,
   (d) a pure reorder, (e) a logical name ABSENT from config → `current: null`, all `added`.
2. **correctedYamlBlock validity + fidelity**: assert the generated block, when parsed by
   `python3 -c 'import yaml,json,sys;print(json.dumps(yaml.safe_load(sys.stdin)))'` (spawn python3
   for real in the test — it is present; feed the block on stdin), yields a `router_settings.fallbacks`
   whose editorial keys equal `proposed` and whose non-editorial keys are byte-for-byte the current
   values (i.e. non-editorial chains preserved, order preserved). If you prefer not to spawn python3
   in-test, instead assert the exact expected string for a small fixture AND add one parse assertion.
3. **stale + configReadError**: health older than 6h → `stale: true`; runShell returns non-zero →
   `configReadError: true`, `chains` still built from proposed with `current: null`, no throw.
4. **Always reset the seam**: `setRunShellForTests(null)` in `afterEach`/`finally` (mirror
   `server/api/infra-restart.test.ts`). Never hit real LiteLLM, never read the real
   `/etc/litellm/config.yaml`, never write any `/var/lib/mimule/*` or `/etc/*`.

## Verify before you report (run these yourself, paste real output)
1. `bun run check` — must pass clean (tsc + vite build; the known Vite large-chunk warning is OK).
2. Focused tests: `DASHBOARD_DB=1 bun test server/adapters/modelChainSync.test.ts --timeout 30000`
   (add any other file you put tests in) — all pass / 0 fail.
3. `git status --short` — only the new adapter/module, its test, `server/api/router.ts`, and
   `app/routes/ModelsPage.tsx` (and possibly a small shared type file). NOT autoapplyPolicy/actions/
   execute/actionDescriptors. NOT shell.ts beyond an import (you should NOT need to edit shell.ts).
   NOT `/etc/litellm/*`. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
- The exact `git status --short`.
- The `ChainDiff` type + the diff-compute function, and the corrected-block serializer.
- The `GET /api/models/chain-sync` handler + its router registration line.
- The new ModelsPage section (the JSX for the card + the two Copy buttons).
- Full paste of `bun run check` tail + the focused test summary line (`N pass / 0 fail`).
- Explicitly confirm: no writes to /etc/litellm/config.yaml, no mutating action added,
  autoapplyPolicy.ts / actions.ts / execute.ts / actionDescriptors.ts untouched.

Do NOT run the fresh-host gate or the full 1000+ test suite — the orchestrator runs those.
Keep your run focused and fast.
