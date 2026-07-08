# SPEC 16 — ULTRAPLAN Phase 3 A4a + A4b: Model probe + clear-cooldown (ADOPT + GOVERN)

## Context
A concurrent (now-stopped) Codex loop already implemented A4a (`probe:model:<logicalName>`)
and A4b (`clear-cooldown:model:<name>`) as **uncommitted** working-tree WIP. That WIP was
preserved verbatim on branch **`v4-builder-wip-20260707`** (commit a91d1f2). It is good,
convention-following work — BUT it was never verified/committed to master, and it contains
**two problems** we must fix before it ships. Your job is to bring that draft onto master's
working tree **exactly**, then make the minimal governance/hygiene corrections below, and
prove it green. Do NOT rewrite the implementation from scratch — adopt the exact bytes.

Master is at `f326532` (clean). You work in `/opt/opencode-control-surface`.

## Step 1 — Adopt the exact draft (git checkout, NOT re-authoring)
From master's working tree, bring in the draft for these **10 files only** (exact bytes):

```
git checkout v4-builder-wip-20260707 -- \
  server/api/types.ts \
  server/api/execute.ts \
  server/api/actionDescriptors.ts \
  server/insights/autoapplyPolicy.ts \
  server/adapters/models.ts \
  server/api/actions.ts \
  server/api/actionDescriptors.test.ts \
  server/api/actions.test.ts \
  server/api/execute.test.ts \
  server/api/model-single-probe.test.ts
```

**Do NOT** bring in `server/api/shell.ts` (its only change on that branch is two cosmetic
comment word-swaps — leave master's shell.ts untouched). **Do NOT** touch the
`e2e/fresh-host/REPORT.*` artifacts (they regenerate). After the checkout, `git status`
should show exactly those 10 files modified/added and nothing else.

## Step 2 — Governance fix (REQUIRED): probe:model must be REVIEW tier, not auto
The draft promoted `probe:model:*` to **auto** tier in `server/insights/autoapplyPolicy.ts`.
That is a NEW auto-promotion and it did **not** go through the gate (no
`docs/AUTOAPPLY_PROMOTION_REVIEW.md` entry, no operator sign-off). Until that gate is passed,
a single-model probe must ship at **review** tier.

In `server/insights/autoapplyPolicy.ts`, inside `defaultTierForAction(...)`, the draft added:
```ts
if (actionId.startsWith("probe:model:")) return "auto";
```
Change it to:
```ts
// probe:model is a read-only diagnostic, but auto-promotion still requires the
// gate (docs/AUTOAPPLY_PROMOTION_REVIEW.md entry + operator OK), which it has NOT
// passed yet. Ship at review tier; flip to "auto" only when that gate clears.
if (actionId.startsWith("probe:model:")) return "review";
```
- **KEEP** `MODEL_PROBE_POLICY_KEY = "probe:model:*"` and its `AUTO_ROLLBACK_AFFORDANCES`
  read-only entry exactly as the draft has them (forward-looking rollback metadata; harmless
  at review tier). KEEP the `policyKeyForAction` mapping for `probe:model:`.
- **DO NOT** change anything about `clear-cooldown:model:*` — it must remain **auto** tier.
  It is a rename of the already-auto `mutate-policy:model:*:cooldown-clear` family (promoted
  2026-07-05, already in AUTOAPPLY_PROMOTION_REVIEW.md), not a new promotion. Leave the
  backward-compat OR-branches (both `clear-cooldown:model:` and the old
  `mutate-policy:model:...:cooldown-clear`) intact.

## Step 3 — Lock the governance decision with a test
Add ONE focused test (in `server/api/actionDescriptors.test.ts` or a new
`server/insights/autoapplyPolicy.test.ts` — match whatever already tests `defaultTierForAction`;
grep for it first) asserting:
- `defaultTierForAction("probe:model:editorial-heavy")` === `"review"`
- `defaultTierForAction("clear-cooldown:model:editorial-heavy")` === `"auto"`
If an existing test already asserts `probe:model` → `"auto"`, FIX it to `"review"` (there
should be none — the branch tests assert only risk/confirm/kind/jobKind, not tier — but verify).

## Hard rails (do not violate)
- **Adopt exact bytes** for the implementation; the only hand-edits are the Step-2 tier flip +
  its comment and the Step-3 test. Do not refactor, rename, or "improve" the adopted code.
- Tests must be **hermetic**: the probe uses the injectable `singleModelProbeFetch` seam
  (`setSingleModelProbeFetchForTests`) and env-path seams (`DASHBOARD_MODEL_HEALTH_PATH`,
  `DASHBOARD_MODEL_COOLDOWNS_PATH`) — NEVER hit real LiteLLM (:4000), NEVER write real
  `/var/lib/mimule/*.json`. Use per-test temp files. Follow the exact seam pattern already in
  the adopted `model-single-probe.test.ts`.
- Do NOT set `singleModelProbeFetch` back to real `fetch` and leave it — always reset the seam
  to `null` in afterEach/finally (mirror how `setRunShellForTests(null)` is reset elsewhere).
- Do NOT commit, do NOT restart any service, do NOT run systemctl/docker/pkill. Working tree
  only. Claude (the orchestrator) verifies and commits.

## Verify before you report (run these yourself, paste real output)
1. `bun run check` — must pass clean (tsc + vite build; the known Vite large-chunk warning is OK).
2. Focused tests:
   `DASHBOARD_DB=1 bun test server/api/actionDescriptors.test.ts server/api/execute.test.ts server/api/actions.test.ts server/api/model-single-probe.test.ts server/insights/autoapplyPolicy.test.ts --timeout 30000`
   (drop autoapplyPolicy.test.ts from the list if it doesn't exist and you added the tier test elsewhere) — all pass / 0 fail.
3. `git status --short` — exactly the 10 adopted files (+ maybe 1 new test file if you created
   autoapplyPolicy.test.ts). NOT shell.ts. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
- The exact `git status --short` output.
- The Step-2 diff hunk (proving probe→review) and the Step-3 test.
- Full paste of `bun run check` tail + the focused test summary line (`N pass / 0 fail`).
- Confirm shell.ts is NOT in your changeset.

Do NOT run the fresh-host gate or the full 1000+ test suite — the orchestrator (Claude) runs
those during verification. Keep your run focused and fast.
