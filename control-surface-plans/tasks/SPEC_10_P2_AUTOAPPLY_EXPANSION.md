# SPEC 10 — Deliberate auto-apply expansion (ULTRAPLAN P2.4)

**Repo:** /opt/opencode-control-surface. Scope: `server/insights/autoapplyPolicy.ts` + `autoapply.ts` (+ tests), `docs/AUTOAPPLY_PROMOTION_REVIEW.md` (NEW — the deliberate-review artifact), loop-stats baseline capture. NO schema changes. UI only if a stumble demands it.

## Goal
ULTRAPLAN 2.4: review the finding corpus; promote 3–5 more finding classes to auto tier WITH rollback evidence requirements; measure the auto-share delta in loop-stats.

## Corpus facts (orchestrator-verified, 2026-07-05)
Current auto tier = 3 entries: `start-job:model-health:all`, `start-job:infra:doctor-log-rotate` (SAFE_AUTO_ACTIONS), `mutate-policy:model:*:cooldown-clear` (normalized key). Guardrails already exist and stay untouched: maxAutoAppliesPerHour 10, circuit breaker 3/hr window, minAiConfidenceForAutoApply 0.75.
Actionable corpus by action family: `acknowledge:incident:*` 31, `reasoner-remediate:pass-timeout:*` 13, `start-job:model-health:all` 3 (already auto), `start-job:service:{vast-tunnel,mimule-overseer,mimule-orchestrator}` 1 each, `start-job:gateway:route-healthiest` 1, `start-job:doctor:scan` 1, `mutate-policy:{gateway-keys,budget}` 1 each, `escalate:incident:*` 1. NOTE: 623 findings (the two biggest classes, unregistered-ai-system + stuck-story) carry NO actionDescriptorId — they cannot be auto-applied at any tier; say so in the review doc.

## Promotion decisions (orchestrator-made — verify each against the action's real implementation, then implement; if verification contradicts a decision, DON'T promote it, report why)
**PROMOTE to auto (4):**
1. `reasoner-remediate:pass-timeout:*` (family — needs a normalized policy key via `policyKeyForAction`, like cooldown-clear): retrying a timed-out builder pass. Verify: the action is non-destructive (spawns a new pass; old records intact), respects the rate limit, and its audit row records the created run/pass ids. Rollback evidence: rollbackHint = cancel the retried run + the recorded ids.
2. `start-job:doctor:scan`: read-only scan. Verify: genuinely no mutation. Rollback: N/A-by-design — the review doc must state that read-only actions satisfy the rollback requirement vacuously, and the enforcement code must accept an explicit `readOnly` marker rather than a missing hint.
3. `start-job:service:mimule-overseer`: restart-if-down for a guardian service. Verify: the action captures before/after service state in its job output/audit (that IS the rollback evidence: it was down, restart cannot make it worse, state transitions recorded). If the implementation turns out to bypass job records or captures nothing — do not promote; report.
4. `start-job:service:mimule-orchestrator`: same reasoning and same verification bar as (3).

**REFUSED (must appear in the review doc with these reasons — the refusals are part of the deliverable):**
- `acknowledge:incident:*` (31 — biggest numeric win): auto-ack makes "acknowledged" stop meaning a human saw it; violates the honesty of the SLA/ack model. Never promote.
- `start-job:service:vast-tunnel`: the GPU/tunnel is off by explicit operator decision; auto-restart fights the operator.
- `start-job:gateway:route-healthiest`: mutates production routing and is reasonRequired; deliberate-eyes only (revisit under the T2 rules engine).
- `mutate-policy:budget` / `mutate-policy:gateway-keys`: governance-sensitive policy mutations. Never auto.
- The 623 no-action findings: nothing to promote — flagged as the real gap (actions coverage, ULTRAPLAN Phase 3), not an auto-apply problem.

## Rollback evidence requirement (structural, not prose)
In `autoapply.ts`, before an auto-tier action executes: resolve its rollback affordance — either (a) the action/audit path provides a rollbackHint + recorded target ids, or (b) the action is explicitly marked read-only. If neither → SKIP the auto-apply with a logged, audited reason (`autoapply.skipped-no-rollback`), leaving the insight for review. Implement as a small declarative map or descriptor field next to SAFE_AUTO_ACTIONS (same file, single source of truth), NOT scattered conditionals. Tests: an auto-tier action without rollback affordance is skipped + audited; each promoted action passes the check.

## Deliverables
1. Policy changes in `autoapplyPolicy.ts`: the 3 exact ids added to SAFE_AUTO_ACTIONS, the pass-timeout family normalization in `policyKeyForAction` + `defaultTierForAction` (mirroring cooldown-clear), with comments citing docs/AUTOAPPLY_PROMOTION_REVIEW.md.
2. Rollback-evidence enforcement in `autoapply.ts` (above) + tests.
3. `docs/AUTOAPPLY_PROMOTION_REVIEW.md`: the deliberate-review artifact — corpus table (class → count → action → decision → reasoning), the four promotions with their verified rollback affordances, the refusals with reasons, the 623-no-action gap, guardrails statement (rate limit/circuit breaker/confidence untouched), and the loop-stats measurement section (below).
4. **Loop-stats measurement**: locate the existing loop-stats/auto-share metric (remediation loop-stats tiles, commit 0f9e53d era). Record the BEFORE baseline (auto-applied count / share over its window) via a live read-only API call. Hermetic test proving the mechanism: an open insight with a promoted-family action auto-applies where it previously wouldn't. In the doc, state honestly that the live share delta accrues as findings recur — give the query/tile to check and what movement to expect; do NOT fabricate a delta number this session.
5. Tests: tier resolution for each promoted id/family (and that refused ids stay review), rollback-evidence skip path, existing guardrails still enforced (rate limit / circuit breaker / confidence tests still green).
6. Verification: `bun run check` clean; full `DASHBOARD_DB=1 bun test` 0 fail (baseline 987 — reconcile your new total); `bash e2e/fresh-host/gate.sh` exit 0 zero exceptions if any `app/` file changes OR server behavior observable by the gate changes (server/ changes → run it; paste tail).

## Hard rails
NO git commit/push, NO systemctl, NO pkill. Nothing written outside the repo. Never touch /opt/newsbites //opt/mimoun //opt/paperclip //opt/backups. Never echo secrets (token: `TOKEN=$(grep -E '^OPERATOR_TOKEN=' /etc/control-surface/secrets.env | cut -d= -f2-)`). Live :3000: read-only GETs only (the baseline capture); do NOT trigger live auto-applies or start live jobs — all apply-path proof is hermetic. Guardrail values (rate limit, circuit breaker, confidence) must NOT change. Verify synchronously; no monitor will notify you.

## Report back
Promotion verification results per candidate (what the action's implementation actually does, promoted or refused-with-reason), the rollback-enforcement design + its skip-path test output, loop-stats BEFORE baseline (raw numbers), test total reconciliation vs 987, gate tail (or the honest reason it wasn't required), changed-file list.
