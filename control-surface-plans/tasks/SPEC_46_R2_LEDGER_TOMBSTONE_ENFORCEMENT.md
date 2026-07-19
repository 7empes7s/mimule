# SPEC 46 — R2 ledger tombstones: enforcement and recovery contract

**Plan:** `REPAIR_PLAN_MODEL_ROUTING.md` R2a/R2b · **Date:** 2026-07-18 UTC · **Status:** planning contract only; enforcement is not authorized

**Depends on:** `/opt/mimoun@ae0959c` and `SPEC_45_CLASSIFY_ERROR_AND_R6_ACCEPTANCE.md`

**Future implementation scope:** preferably only `scripts/model-fallback-reprobe.py` and `scripts/tests/test_model_fallback-reprobe.py` in `/opt/mimoun`. A small pure helper module is acceptable only if it makes state validation independently testable. Any unit, timer, verifier-receipt, or operator-command change needed to prove scheduled provenance is a separate reviewed implementation file in that future slice; this document does not make one now.

## 1. Authority boundary

This document closes the design gap identified by SPEC 45. It does **not** authorize an implementation, a mode change, an enforcement apply, a recovery clear, a timer or service change, a config write, a probe, journal tailing, or an editorial/builder real-work run.

In particular:

- `/opt/mimoun@ae0959c` remains `LEDGER_MODE = "shadow"`.
- `would_prune`, `would_quarantine`, and `would_limit_tail` remain observations, not routing actions.
- No operator or agent may enable enforcement by changing the mode constant alone. Initial activation and every later route addition are separate, explicit, one-shot operator actions. Ordinary scheduled runs can collect evidence and, only after the unresolved recovery choice is approved, execute a previously requested release under section 10; they can never add destructive scope.
- A later implementation slice needs review, passing hermetic tests, three qualifying shadow observations, the unresolved operator choices in section 15, and separate explicit authorization for the activation window.
- This specification creates no daemon, API, background watcher, timer, systemd unit, config migration, live probe, or acceptance workload.

A future implementation must separate **capability** from **activation**. Shipping code that understands `enforce-prune` may enable a capability gate, but effective destructive mode is true only when a valid `ledger_enforcement.mode="enforce-prune"` block was created by the explicit activation action. With no block, ordinary execution is shadow. A block present in incapable code or an invalid block fails closed; neither silently falls back to shadow. Thus a constant/environment edit by itself has no destructive effect.

## 2. Current facts and observation clock

Commit `ae0959c` added conservative, read-only ledger reconciliation to the existing reprobe. It reports an unearned route as `would_prune` only after at least 20 trusted calls with zero successes. Rate-limit-only evidence must span at least 48 hours. Earned routes are reported separately as `would_quarantine`. Shadow mode cannot change either rendered routing layer.

The current live shadow candidate is `zen-deepseek-v4-flash-free`, based on 0/45 trusted calls over approximately 124.9 hours, all rate-limited, with no earned success history. This fact is evidence for observation, not permission to prune.

There were **zero qualifying scheduled shadow cycles before the 2026-07-18 15:17 UTC opportunity**. Earlier `--ledger-report` output and network dry runs were manual evidence and count as 0/3.

The first eligible scheduled cycle then completed from `2026-07-18 15:17:22 UTC` through `15:17:47 UTC` with status 0. It recorded `changed=false`, pool size 39, the same pool and config hashes, no LiteLLM restart, `would_prune=["zen-deepseek-v4-flash-free"]`, and `enforced=false`. The activation clock is therefore **1/3**, not 3/3. The next scheduled opportunities are approximately 18:17 and 21:17 UTC; they do not count until their successful evidence is captured and validated.

Initial activation requires three **distinct, successful, scheduled** cycles that all have:

- an advancing `state_ts` and distinct systemd invocation ID;
- policy version 1, shadow mode, and `enforced=false`;
- a successful ledger read;
- the same canonical `would_prune` set and decision hash;
- a successful service result;
- `changed=false`, the same pool hash, unchanged config hashes, and no LiteLLM restart.

A manual run, dry run, report-only run, failed or aborted invocation, missing ledger, repeated state timestamp, missing invocation ID, policy-version change, or differing decision set resets or does not advance the qualifying sequence. Observations are never backfilled or inferred. After activation, each previously untombstoned raw ledger identity has its own consecutive three-cycle candidate window. Reaching 3/3 only makes that route eligible for a later explicit one-shot extension; it never creates a tombstone during the scheduled run.

## 3. Safety invariants

The future implementation must preserve all of these invariants:

1. The probe classifier and its category-based R1 hysteresis remain unchanged.
2. Ledger pruning acts only on `would_prune`; earned `would_quarantine` and R2b `would_limit_tail` remain non-destructive.
3. An active tombstone vetoes a route after probe hysteresis and before `build_pool()`.
4. A transient ledger error, an empty current decision set, or evidence aging out never clears an active tombstone.
5. A tombstone is released only after an explicit operator request and the complete recovery rule in section 10.
6. Exact route identity is proven before a ledger decision can touch a logical pool member.
7. Invalid enforcement state aborts before any probe, state mutation, config render, config write, or restart.
8. Both raw-live and final-pool `MIN_LIVE` guards remain hard stops.
9. State is serialized under one exclusive lock and committed atomically.
10. One scheduled invocation produces at most one LiteLLM config apply and at most one LiteLLM restart.
11. No scheduled invocation creates an initial tombstone or extends enforcement to a new route; it can only collect a candidate window or release a previously requested recovery after completed scheduled receipts prove it.
12. A durable apply transaction precedes every config replace. An unresolved transaction blocks new probes, ledger decisions, candidate advancement, release, and any second routing transaction.

## 4. Single-writer lock and atomic state

### 4.1 Lock

Use a stable lock file adjacent to, but distinct from, the replaceable state file:

```text
/var/lib/mimule/model-fallback-reprobe.json.lock
```

Acquire an exclusive, non-blocking `fcntl.flock(LOCK_EX | LOCK_NB)` before reading the state. Hold it through state validation, probe-result reconciliation, ledger reconciliation, rendering, state commit, config apply, and any single restart. Locking the JSON file itself is invalid because `os.replace()` changes its inode.

If the lock is held, exit non-zero before loading credentials, probing, reading the ledger, changing state, rendering config, or touching a service. A recovery-request writer must take the same lock. Direct state-file edits are unsupported.

### 4.2 Atomic JSON commit

All non-dry state writes, in shadow and enforcement modes, use this sequence:

1. Serialize the complete next state to a unique temporary file in `/var/lib/mimule`, the same filesystem as the destination.
2. Flush and `fsync()` the temporary file.
3. Set the intended restrictive file mode.
4. Replace the destination with `os.replace(temp, STATE_FILE)`.
5. Open and `fsync()` the parent directory.
6. On an exception before replace, remove only the known temporary file and leave the prior state byte-for-byte intact.

Do not truncate `STATE_FILE` in place. Do not silently turn malformed enforcement state into `{}`. The existing best-effort legacy fallback is permissible only while `LEDGER_MODE == "shadow"` and no `ledger_enforcement` block exists.

### 4.3 Durable apply transaction

Every non-dry config mutation while an enforcement block exists uses one recoverable transaction. This applies to initial activation, a one-shot route extension, a release, and an ordinary R1 render. Before changing state or either destination:

1. Render and validate both complete candidate configs in memory.
2. Create a unique mode-0700 staging directory under `/var/lib/mimule/model-fallback-reprobe.apply/`.
3. Write the exact desired LiteLLM and gateway bytes and the exact two preimage bytes into that directory with mode 0600, file `fsync()`, and directory `fsync()`.
4. Record SHA-256 for all four files, the active-tombstone-set hash, the validated raw-live and final-pool counts, `MIN_LIVE`, the preapply LiteLLM systemd invocation ID for audit, and whether each destination changes.
5. Atomically commit a `pending_apply` object in the state with phase `prepared`. The same state commit contains the tombstone or release transition that caused an R2 render, or the ordinary R1 pool/history mutation that caused an R1-only render.

The exact transaction shape is:

```json
{
  "generation_id": "apply-example-1",
  "action_id": "activation-example-1",
  "kind": "activation",
  "phase": "prepared",
  "prepared_at": 1784387900,
  "prepared_by_invocation_id": "operator-example-1",
  "active_tombstones_sha256": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "staging_dir": "/var/lib/mimule/model-fallback-reprobe.apply/apply-example-1",
  "configs": {
    "litellm": {
      "destination": "/etc/litellm/config.yaml",
      "preimage_path": "/var/lib/mimule/model-fallback-reprobe.apply/apply-example-1/litellm.preimage",
      "preimage_sha256": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      "desired_path": "/var/lib/mimule/model-fallback-reprobe.apply/apply-example-1/litellm.desired",
      "desired_sha256": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "changed": true
    },
    "gateway": {
      "destination": "/etc/tib-builder/gateway.yaml",
      "preimage_path": "/var/lib/mimule/model-fallback-reprobe.apply/apply-example-1/gateway.preimage",
      "preimage_sha256": "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      "desired_path": "/var/lib/mimule/model-fallback-reprobe.apply/apply-example-1/gateway.desired",
      "desired_sha256": "sha256:9999999999999999999999999999999999999999999999999999999999999999",
      "changed": true
    }
  },
  "floor": {
    "source": "accepted-manifest",
    "min_live": 6,
    "raw_live_count": 10,
    "final_pool_count": 38,
    "evidence_state_ts": 1784387842,
    "evidence_receipt_sha256": "sha256:8888888888888888888888888888888888888888888888888888888888888888"
  },
  "service": {
    "preapply_invocation_id": "litellm-before-example",
    "restart_required": true,
    "restart_baseline_invocation_id": null,
    "restart_attempted": false,
    "restart_attempted_by": null,
    "restart_attempted_at": null,
    "restart_observed_invocation_id": null
  }
}
```

`kind` is exactly `activation`, `extension`, `release`, `r1-render`, or `rollback`. `action_id` is the matching activation/extension/request/rollback ID; an R1 render uses a unique `r1:<invocation-id>` action ID. Action/generation IDs and staging paths are unique, bounded, and cannot escape their fixed root. Config keys/destinations are exact and cannot be caller-selected. Phase `prepared` has no restart baseline or attempt; `configs-installed` has the post-install baseline when restart is required; `restart-intent` and `restart-uncertain` have a complete durable attempt tuple. A successful terminal transaction is removed from `pending_apply` only while appending its exact action/generation/hashes/restart result to `apply_receipts` in the same atomic state write.

`floor.source` is exactly `accepted-manifest`, `current-invocation`, or `rollback-manifest`. Activation/extension use an accepted-manifest receipt; rollback uses its captured manifest. A release or R1 render produced inside the current scheduled invocation uses `current-invocation` and sets `evidence_receipt_sha256=null`, because a running invocation cannot own its terminal receipt. That null never counts as candidate or recovery provenance; the verifier may link the completed transaction afterward. All other sources require a valid receipt hash.

Only then may config application begin. Copy a staged desired file to a unique temporary file in that config's **destination directory**, preserve the required ownership/mode, flush and `fsync()` it, `os.replace()` the destination, and `fsync()` that destination directory. Never truncate a live config. Each destination is independently atomic; `pending_apply` is the durable bridge across the unavoidable two-file boundary.

After both destination hashes equal the desired hashes, read the **current** LiteLLM service invocation ID and atomically advance the phase to `configs-installed` with that value as `restart_baseline_invocation_id`. This baseline is deliberately captured after config installation; a service change that happened before the desired bytes landed cannot be mistaken for a restart that loaded them. If LiteLLM bytes did not change, verify both hashes, append one completed apply receipt, clear `pending_apply`, and perform no restart. If LiteLLM bytes changed, use the restart protocol in section 4.4. Staging files are removed only after a completed apply or a separately authorized rollback has durably recorded its result.

### 4.4 Restart intent and crash recovery

An unresolved `pending_apply` is reconciled immediately after lock and strict state validation, **before** credentials, probes, a ledger read, candidate-window advancement, release evaluation, or a new render:

- Re-hash the four staged files and both destinations. A staged hash mismatch or a destination hash that is neither its recorded preimage nor its recorded desired hash is an external-conflict hard stop. Do not guess, overwrite the unknown bytes, or start a second transaction.
- In phase `prepared`, roll forward only destinations still equal to their recorded preimage. A destination already equal to its desired hash is accepted. Revalidate both installed configs, require both desired hashes, and advance to `configs-installed`.
- The transaction's recorded floor proof is the authority for this bounded crash roll-forward; do not mix a later partial probe snapshot into the already committed transaction. No new tombstone or release can join it.
- In `configs-installed`, if the current LiteLLM service invocation ID already differs from `restart_baseline_invocation_id`, both destination hashes are desired, and the service health check succeeds, record the observed ID and complete without another restart.

Before the first and only restart request, atomically advance to `restart-intent` and record `restart_attempted=true`, the current reprobe invocation ID, attempt time, and the post-install `restart_baseline_invocation_id`. Persist that intent **before** calling `systemctl restart litellm.service`. After the call, immediate completion requires return code 0, desired config hashes, a healthy service, and a nonempty LiteLLM invocation ID different from that baseline.

A crash after `restart-intent`, a non-zero restart result, a missing/unchanged service invocation ID, or an inconclusive health check leaves phase `restart-uncertain`. No scheduled or manual run retries it automatically. A later locked run may only observe that the restart did occur and complete the transaction; otherwise a separately reviewed and explicitly authorized retry-or-rollback action is required. This deliberately chooses at-most-once automatic restart semantics over a duplicate restart after an ambiguous crash. Each reprobe invocation ID may appear in at most one restart intent.

Any invocation that finds and reconciles a pre-existing `pending_apply` exits after reporting that reconciliation, even when it completes successfully; it never continues into fresh probes or a second transaction. If the transaction remains incomplete, exit non-zero. Such an invocation cannot advance a 3-cycle window, count as recovery evidence, mutate probe history, start another apply, or claim a new routing decision. This preserves one apply/restart domain per invocation.

### 4.5 Write-ahead invariant

The committed state always contains the active tombstone set and `pending_apply` before the first config replace. A crash may leave one destination at its preimage and one at its desired hash, or may leave a restart uncertain, but it must never leave an applied ledger prune without the durable tombstone and exact staged bytes that caused it. Successful acceptance requires `pending_apply=null`, both destination hashes at their desired values, the runtime restart proof when required, and rendered-chain agreement.

## 5. Enforcement state schema

The existing top-level reprobe fields remain. Activation adds exactly one `ledger_enforcement` object with this shape:

```json
{
  "ledger_enforcement": {
    "schema_version": 1,
    "policy_version": 1,
    "mode": "enforce-prune",
    "activation_id": "activation-example-1",
    "activated_at": 1784387900,
    "activated_by": "root",
    "activation_reason": "three agreeing scheduled shadow cycles",
    "identity_snapshot": {
      "path": "/var/lib/mimule/model-health.json",
      "sha256": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "checked_at": 1784387890
    },
    "shadow_observations": [
      {
        "state_ts": 1784366242,
        "invocation_id": "example-invocation-1",
        "scheduled_opportunity": "model-fallback-reprobe.timer@2026-07-18T09:17:00Z",
        "receipt_sha256": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        "decision_hash": "sha256:6ba0f641db8804194067e78e69a903e0a1eddda83e0b0521dcfcb1f4ccf50bfa",
        "would_prune_raw": ["example-ledger-identity"]
      },
      {
        "state_ts": 1784377042,
        "invocation_id": "example-invocation-2",
        "scheduled_opportunity": "model-fallback-reprobe.timer@2026-07-18T12:17:00Z",
        "receipt_sha256": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        "decision_hash": "sha256:6ba0f641db8804194067e78e69a903e0a1eddda83e0b0521dcfcb1f4ccf50bfa",
        "would_prune_raw": ["example-ledger-identity"]
      },
      {
        "state_ts": 1784387842,
        "invocation_id": "example-invocation-3",
        "scheduled_opportunity": "model-fallback-reprobe.timer@2026-07-18T15:17:00Z",
        "receipt_sha256": "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        "decision_hash": "sha256:6ba0f641db8804194067e78e69a903e0a1eddda83e0b0521dcfcb1f4ccf50bfa",
        "would_prune_raw": ["example-ledger-identity"]
      }
    ],
    "last_ledger_read": {
      "at": 1784387900,
      "ok": true,
      "error": null
    },
    "candidate_windows": {},
    "tombstones": {
      "example-logical-route": {
        "active": true,
        "logical_route": "example-logical-route",
        "ledger_identity": "example-ledger-identity",
        "route_identity": "provider/example-model",
        "identity_source": "modelId",
        "identity_snapshot_sha256": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "active_since": 1784387900,
        "last_confirmed_at": 1784387900,
        "reason": "never earned a working record; 0/20 trusted calls in 7d",
        "evidence": {
          "recentCalls": 20,
          "recentSuccesses": 0,
          "recentFirstTs": 1783775200000,
          "recentLastTs": 1784207200000,
          "recentSpanHours": 120.0,
          "rateLimitFailures": 20,
          "authFailures": 0,
          "timeoutFailures": 0,
          "unavailableFailures": 0,
          "allTimeCalls": 20,
          "allTimeSuccesses": 0,
          "allTimeSuccessRate": 0.0
        },
        "release_requests": [],
        "recovery_receipts": [],
        "transitions": [
          {
            "at": 1784387900,
            "kind": "enforced",
            "actor": "root",
            "reason": "validated policy-version-1 ledger decision",
            "action_id": "activation-example-1"
          }
        ]
      }
    },
    "pending_apply": null,
    "apply_receipts": []
  }
}
```

The values above are illustrative. They are not activation evidence and must never be copied into live state.

### 5.1 Strict validation

Whenever a `ledger_enforcement` block exists, or an activation/extension/release/rollback action is requested, the complete applicable state is validated before any network or config work. Effective enforcement requires both enforcement-capable code and a valid block created by the one-shot activation path. Reject the entire run if any rule fails:

- Objects contain only the documented keys. Required keys cannot be omitted.
- `schema_version` and `policy_version` are integers, not booleans, and must both equal 1.
- `mode` must be exactly `enforce-prune` and the running code must advertise enforcement capability. A legacy `LEDGER_MODE` value or environment variable is not activation authority.
- Epoch-second fields are positive integers, not floats or booleans. Ledger evidence timestamps are non-negative epoch milliseconds.
- `activation_id` is a nonempty, bounded, single-use identifier. `activated_by` is exactly the approved activation actor; the initial contract records `root`.
- `activation_reason` is exactly `three agreeing scheduled shadow cycles`.
- `identity_snapshot.path` is exactly `/var/lib/mimule/model-health.json`; its digest is a valid lowercase SHA-256; `checked_at` is a positive epoch second not later than activation.
- `shadow_observations` contains exactly three entries with strictly increasing `state_ts`, three nonempty and consecutive scheduled-opportunity IDs, three nonempty and distinct invocation IDs, three distinct valid receipt hashes, identical decision hashes, and identical sorted, duplicate-free `would_prune_raw` arrays.
- `activated_at` is not earlier than the final shadow observation.
- Each decision hash has a `sha256:` prefix and matches a recomputation over the canonical decision payload in section 6.
- `last_ledger_read.ok=true` requires `error=null`. `ok=false` requires a nonempty, sanitized exception-class string with no path, query text, credential, or token.
- Every `candidate_windows` key is the exact raw ledger identity. Its value has exactly `logical_route`, `route_identity`, `identity_source`, and `observations`; the observations obey section 6.2, contain at most three items, and never overlap an active tombstone for the same logical route or raw identity.
- Tombstone object keys and all route identities are nonempty bounded strings with no control characters.
- Each tombstone key equals its `logical_route`. `ledger_identity` is the exact unmodified `gateway_calls.resolved_model` string, `route_identity` is the selected model-health identity, and `identity_source` is exactly `resolvedModel`, `modelId`, or `logicalName`. The stored mapping must satisfy section 7.
- `active` is a boolean. An active record has a nonempty reason, a valid evidence object, `active_since >= activated_at`, and `last_confirmed_at >= active_since`.
- Counts are non-negative integers; success counts do not exceed call counts; rates are finite numbers in `[0,1]`; the evidence is internally consistent with policy version 1.
- `release_requests` and `recovery_receipts` are append-only arrays with the exact shapes and lifecycle in section 10. At most one request is `pending`; every closed request has a closure time; and every recovery receipt refers to a request that was pending when that receipt was admitted, even if that request later closed.
- `transitions` is a nonempty append-only array. Each item is exactly `{ "at": epoch_seconds, "kind": enum, "actor": string, "reason": string, "action_id": string }`. Allowed kinds are `enforced`, `reactivated`, `release-requested`, `release-expired`, `release-cancelled`, `released`, and `rolled-back`.
- Transition times are nondecreasing. The first transition is `enforced`. Each transition carries its single-use activation, extension, request, or rollback action ID; all transitions in one request lifecycle carry that request ID. An inactive released record ends in `released`; a rolled-back activation ends in `rolled-back`.
- `pending_apply` is null or the exact transaction object in sections 4.3–4.4. Its generation ID is unique, its phase is `prepared`, `configs-installed`, `restart-intent`, or `restart-uncertain`, all staged/preimage/desired hashes and paths are internally consistent, recorded floor counts meet section 11, and restart fields agree with the phase.
- `apply_receipts` is append-only and contains unique generation IDs, terminal desired hashes, completion time, and the observed LiteLLM invocation ID or null when no restart was required. A generation cannot be both pending and completed.
- Unknown schema or policy versions fail closed. There is no permissive forward-compatibility cast.

Never repair, drop, or default an invalid enforcement block automatically. Log a sanitized validation reason and exit non-zero with existing routing untouched.

## 6. Activation evidence and decision hash

The only accepted activation provenance is a timestamped evidence manifest produced and accepted by the SPEC 45 verifier. The activation mechanism consumes that reviewed manifest; it must not scrape free-form logs, trust a CLI `--scheduled` flag, or infer cycles from the latest state alone.

For each qualifying observation, keep the raw strings from `gateway_calls.resolved_model` and canonicalize this payload with sorted keys, compact JSON separators, UTF-8 encoding, and a lexically sorted, duplicate-free array:

```json
{"policy_version":1,"would_prune_raw":["example-ledger-identity"]}
```

Store `sha256:` followed by the lowercase hexadecimal SHA-256 digest. The activation set is valid only when all three recomputed hashes and arrays agree and the current successful ledger read still produces the same set under policy version 1.

The three manifest observations are copied into `shadow_observations`; they are immutable activation provenance. Raw ledger identity is not relabeled as a logical route in this hash. Resolution happens once, explicitly, against the pinned model-health snapshot in section 7, and the resulting pair is stored on each tombstone.

### 6.1 Initial one-shot activation

The future activation interface is a dedicated one-shot operator action equivalent to:

```text
model-fallback-reprobe.py --activate-ledger-prune \
  --manifest /reviewed/spec45-evidence.json \
  --activation-id <single-use-id> --actor root
```

The spelling is contractual intent, not an implemented or authorized command. It runs under the lock, rejects an existing enforcement block or pending apply, validates the three completed receipts, re-reads the ledger successfully, requires the raw current set to equal the manifest set, resolves a one-to-one identity mapping, evaluates both floor guards from the final qualifying scheduled snapshot, and prepares the transaction in section 4. Merely changing `LEDGER_MODE`, starting the service, or running an ordinary scheduled cycle cannot enter enforcement.

The action is all-or-nothing for the exact initial set. It creates the block and initial tombstones once. Reusing an activation ID, invoking activation when a block already exists, omitting the reviewed manifest, or presenting 0/3, 1/3, or 2/3 evidence aborts before state/config mutation. The completed 15:17 cycle remains honestly recorded as the first observation, so the live initial clock described in section 2 is still 1/3.

### 6.2 Per-new-route candidate windows and extension

After activation, successful scheduled reconciliation maintains a route-specific window for each raw `would_prune` identity that is not already represented by an active tombstone. A window value is exactly:

```json
{
  "logical_route": "example-logical-route",
  "route_identity": "provider/example-model",
  "identity_source": "modelId",
  "observations": [
    {
      "state_ts": 1784398642,
      "invocation_id": "example-invocation-4",
      "scheduled_opportunity": "model-fallback-reprobe.timer@2026-07-18T18:17:00Z",
      "receipt_sha256": "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      "identity_snapshot_sha256": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "pool_sha256": "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      "litellm_sha256": "sha256:7777777777777777777777777777777777777777777777777777777777777777",
      "gateway_sha256": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "route_decision_hash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  ]
}
```

The route decision hash covers policy version, the exact raw ledger identity, its logical route, selected raw route identity, and identity source. The model-health file may be atomically refreshed between cycles, so its byte hash may differ; the exact resolved triple must not. Each observation must come from a completed receipt under section 6.3, have a successful ledger read, reproduce the same mapping, pin its own source-file hash, report `changed=false`/zero restart, preserve the window's pool/config hashes, and be from the next qualifying scheduled opportunity. A successful scheduled read where the raw identity is absent, a failed scheduled invocation, a missing scheduled receipt, a ledger error, an identity change/ambiguity, a policy change, a pool/config hash change, a config apply/restart, or an unresolved apply resets that route's consecutive window to empty. Manual, dry-run, and report-only runs neither advance a window nor fill a missing scheduled opportunity.

Keep only the latest consecutive zero-to-three observations. At 3/3 the window is merely `ready`; the scheduled process does **not** create or activate a tombstone. Adding exactly one new tombstone requires a separate, explicit, one-shot operator action equivalent to:

```text
model-fallback-reprobe.py --extend-ledger-prune <raw-ledger-identity> \
  --manifest /reviewed/spec45-route-evidence.json \
  --extension-id <single-use-id> --actor root
```

That future action rejects a reused extension ID, consumes exactly the same three stored completed observations, successfully revalidates the current ledger decision and exact identity mapping, proves both floor guards, and creates one transaction. It cannot batch a convenient subset, silently include other ready routes, or reuse another route's cycles. Scheduled evidence collected after activation therefore never expands destructive scope by itself.

### 6.3 Scheduled trigger and completed receipt

Scheduled provenance has two parts. A root-owned, single-use **trigger receipt** binds the expected timer unit/opportunity to the service invocation ID and is readable at process start; it proves that the current process was timer-triggered but says nothing about success. The fixed future spool is `/var/lib/mimule/model-fallback-reprobe.triggers/{pending,consumed}/`, mode 0700 with mode-0600 receipts. Under the same lock, the matching invocation atomically renames its exact receipt from `pending` to `consumed` and fsyncs both directories before using it; a failed run does not make the opportunity replayable. A consumed receipt remains until its completion/failure evidence is durably accepted. A post-run **completion receipt** proves from structured systemd/journal metadata the same opportunity/invocation binding, start/end times, `Result=success`, `ExecMainStatus=0`, normal mode, no dry-run/report flag, the committed state timestamp/hash, successful ledger status/raw decisions, config hashes, restart count, and probe-code snapshot. The completion receipt is created only after the service invocation is terminal and is content-hashed into the accepted manifest. A running invocation can use its claimed trigger receipt to enter the release evaluator, but can never certify or count its own completion.

Initial shadow activation receipts deliberately hash raw ledger decisions and do not require a historical identity mapping; activation resolves the agreed raw set against one current pinned snapshot. This preserves the already captured 15:17 observation as 1/3 without inventing a historical model-health hash. Every post-activation candidate-window or recovery receipt additionally proves the exact raw/logical/route mapping and model-health byte hash from that invocation. No missing core scheduled provenance—timer opportunity, invocation ID, terminal success, or state/config evidence—may be backfilled for either kind.

If existing systemd metadata cannot distinguish the timer-triggered job from a manual `systemctl start`, the future implementation must first add this trigger receipt at the unit/timer boundary and review that change separately. It must not approximate provenance from wall-clock proximity, an environment flag supplied by the caller, or a bare invocation ID. A consumed trigger token cannot be replayed by another invocation. This document authorizes neither that unit change nor journal access.

## 7. Exact route identity resolution

There are three deliberately distinct terms:

- **Ledger identity:** the exact raw JSON string selected from `gateway_calls.resolved_model` by the trusted query.
- **Logical route:** the exact LiteLLM `model_name` used by `pool_status`, history, and fallback chains.
- **Route identity:** the exact provider/model string selected from the model-health row for that logical route.

The authoritative identity source is the raw, atomically read `/var/lib/mimule/model-health.json` artifact, which is also the artifact read by the Control Surface model adapter. It is not the Control Surface HTTP response and is never reconstructed from UI labels. Read through one descriptor with pre/post `fstat()` (or an equivalently tested stable-read helper), reject an inode/size/mtime change, hash the exact bytes before parsing, and pin that hash in activation/extension evidence. The file must be a valid object with a `models` array; duplicate `logicalName` rows, wrong types, control characters, or a non-atomic/truncated read invalidate destructive identity work.

Build the eligible roster from the exact, duplicate-free LiteLLM `model_name` values that the reprobe would normally probe after its documented exclusions. For each eligible logical route:

1. Find the model-health row whose `logicalName` exactly equals it. If present, select one route identity by strict precedence: nonempty string `resolvedModel`, otherwise nonempty string `modelId`, otherwise the logical route. Record the selected source field.
2. If the row is absent, the only permitted identity is the logical route itself with source `logicalName`; no provider alias is inferred.
3. Add two exact pairs to a union index: `(logical route, logical route)` and `(selected route identity, logical route)`. Identical pairs collapse; identities do not.
4. For a ledger identity, collect the set of logical routes from the union index. Resolution succeeds only when that set has exactly one element.

This union rule handles a ledger that records either a logical name or a provider/model identity without conflating them. If a selected route identity is also another route's logical name, the set has two members and is ambiguous. Preserve exact decoded string contents: do not lowercase, trim, normalize Unicode, remove provider prefixes, replace slash/hyphen characters, or use prefix, suffix, substring, or fuzzy matching.

On activation or extension, store all five facts: tombstone key/logical route, raw ledger identity, selected route identity, selected source field, and source-file hash. The raw activation decision hash remains raw; the identity mapping is a separately pinned proof. Two different raw ledger identities may not create two tombstones for one logical route in the same or successive action.

Zero matches, multiple matches, missing/malformed source data needed for an alias, and a changed mapping are non-enforceable identity errors. They are visible in structured evidence and cannot create, refresh, advance, or release a tombstone. If an active tombstone's raw ledger identity no longer resolves to the same logical route and selected route identity, preserve the record and existing config, then abort new render/config work. Crash recovery of an already prepared transaction uses its pinned staged bytes and mapping under section 4; it does not consult a later snapshot midway.

The active **logical route**—not an opportunistically normalized raw identity—is removed from every managed fallback chain and supplied to filtered unmanaged chains. A raw ledger identity is removed only when it is itself the proven logical route. `would_quarantine` is never transformed into a prune by identity resolution.

## 8. Exact-code probe history

R1 deliberately groups 200, 429, 500, and 503 as the `routable` category. Its `streak` and `since` fields cannot prove continuous 200 recovery or continuous 429 decay.

Add three independent fields to every newly persisted probe history record:

```json
{
  "code": 200,
  "category": "routable",
  "streak": 7,
  "since": 1784300000,
  "ms": 120,
  "exact_code": 200,
  "exact_streak": 3,
  "exact_since": 1784321600
}
```

Rules:

- Category `streak` and `since` retain their current semantics and code paths.
- If the prior record has valid `exact_code`, `exact_streak`, and `exact_since`, and the new raw code equals `exact_code`, increment `exact_streak` and retain `exact_since`.
- Otherwise set `exact_code` to the new raw code, `exact_streak=1`, and `exact_since=observed_at`.
- A legacy row without all three valid exact fields seeds at 1. Never copy its category streak or category since into exact history.
- A 200→429 observation keeps the category streak but resets exact history to 429/1. A 429→200 observation likewise resets exact history to 200/1.
- Bool-as-int, non-finite, negative, missing, or internally inconsistent exact fields are invalid for release evidence and seed at 1 in shadow mode. They invalidate an enforcement-state release decision rather than granting recovery.
- Manual dry runs and report-only runs never write or advance exact history. A manual non-dry run may not satisfy a release even if it writes ordinary diagnostic history.
- `exact_code`, `exact_streak`, and `exact_since` remain useful diagnostic/R2b fields, but they are **not sufficient scheduled provenance**. Tombstone release uses the append-only completed `recovery_receipts` in section 10; the aggregate exact fields must agree with the receipt suffix but can never replace it.
- The current running scheduled invocation may update ordinary history only at its normal state-commit point. It is not appended as a recovery receipt until a later verifier has proven that invocation terminal and successful under section 6.3.

This change supplies future R2b with an exact 429 clock but does not decide or activate R2b tail/prune behavior.

## 9. Fail-stable ledger reconciliation

The future enforcement path has two inputs: current trusted ledger decisions and durable tombstones. Tombstones are authoritative vetoes; the current database result can add or confirm them but cannot silently remove them.

On a successful, validated read:

- Resolve every current `would_prune` identity exactly.
- For an existing active tombstone whose exact raw/logical/route mapping still agrees, update `last_confirmed_at`, reason, and evidence.
- Ingest any newly accepted **prior completed** receipts and advance/reset only their route-specific candidate windows under section 6.2. The current run records its raw decision and mapping for later verification but cannot append its own nonterminal observation. A scheduled reconciliation never creates an active tombstone.
- Do not append a transition for routine reconfirmation; transitions record state changes, not every poll.
- Preserve active tombstones absent from the current set. Absence may mean evidence aged out and is not recovery.
- Ingest only already completed scheduled receipts, expire stale release requests, and evaluate a pending release only with the complete conjunctive rule in section 10.
- Record `last_ledger_read={at, ok:true, error:null}`.

On `OSError`, SQLite error, timeout, malformed row, or schema mismatch:

- Create no tombstone from uncertain evidence.
- Confirm no tombstone from uncertain evidence.
- Release no tombstone.
- Break every in-progress candidate window for that scheduled opportunity; a database failure cannot be skipped to manufacture consecutiveness.
- Preserve every existing active tombstone and apply its veto after probe hysteresis.
- Record a sanitized `last_ledger_read={at, ok:false, error:"ExceptionClass"}` atomically.
- Continue only if the previously persisted enforcement block was fully valid and the post-veto `MIN_LIVE` guard passes.

Identity failure for a new candidate only invalidates and clears that candidate's window. Identity failure for an existing active tombstone is stronger: preserve its state and the already installed configs, then abort before any new render, config write, release, or restart. A pending transaction is reconciled first under section 4 and never reinterpreted as a fresh ledger decision.

Do not substitute `_empty_ledger_decisions()` and then interpret the empty set as recovery. Do not make a stale database snapshot look current. Do not treat legacy `unknown`, pre-fix `server_error`, `gateway_unreachable`, `cli-direct`, or out-of-tenant rows as destructive evidence.

All window, receipt, request-expiry, `last_ledger_read`, confirmation, and history changes described here are prospective state. They commit only after the invocation passes both section 11 floor guards and reaches its normal atomic state/apply point. If the run aborts on a floor or validation failure, the prior operational state remains unchanged; the external verifier receipt/log may still record the failed opportunity so the next successful reconciliation can break consecutiveness honestly.

## 10. Explicit recovery request and release

### 10.1 Request

Recovery starts with a local, explicit operator request written under the same lock and atomic state writer. `RELEASE_REQUEST_TTL_SECONDS` is fixed at 86,400 seconds for policy version 1. Append exactly:

```json
{
  "request_id": "release-example-1",
  "actor": "root",
  "reason": "credential or provider access repaired",
  "requested_at": 1784402000,
  "expires_at": 1784488400,
  "status": "pending",
  "closed_at": null
}
```

The request ID is nonempty, bounded, and never reused for that tombstone. Actor and reason are nonempty bounded strings; timestamps are integer epoch seconds; `expires_at` must equal `requested_at + 86400`; and `requested_at >= active_since`. The request operation appends a matching `release-requested` transition. It does not clear the tombstone, add the model to a pool, edit either config, invoke a probe, or restart a service.

At most one request is pending. Replaying the exact same request ID and payload is an idempotent no-op; a different request while one is pending is rejected. An explicit cancel action changes its status to `cancelled`, sets `closed_at`, and appends `release-cancelled`; cancellation never releases the route. A new request is allowed only after the old one is `expired`, `cancelled`, or `released`.

At `now >= expires_at`, the request is ineligible even if the state has not yet been rewritten. The next locked state-mutating reconciliation or request operation marks it `expired`, sets `closed_at`, and appends `release-expired`, while preserving the active tombstone. A new explicit request may close that stale request and append its own record in the same atomic state commit. It discards no audit entries. Recovery observations from an expired/cancelled/released request can never be reused by a later request.

### 10.2 Completed recovery receipts

For the lifetime of a pending request, ingest each newly accepted completed scheduled receipt from section 6.3 into the tombstone's append-only `recovery_receipts` as exactly:

```json
{
  "request_id": "release-example-1",
  "state_ts": 1784409442,
  "observed_at": 1784409442,
  "invocation_id": "example-recovery-invocation-1",
  "scheduled_opportunity": "model-fallback-reprobe.timer@2026-07-18T21:17:00Z",
  "receipt_sha256": "sha256:5555555555555555555555555555555555555555555555555555555555555555",
  "code": 200
}
```

Receipt invocation IDs/hashes/opportunity IDs are unique, times strictly increase per request, and the probe code is the exact integer result for the tombstone's logical route. The accepted manifest defines the ordered timer opportunities and must prove the invocation was the next completed scheduled opportunity; a missing opportunity, failed service, unresolved apply, missing route result, or malformed receipt breaks the consecutive suffix and cannot be skipped. A later receipt whose opportunity ID is not the immediate accepted successor proves a gap. The append-only array retains non-200 and broken-sequence evidence; the evaluator selects only the suffix after the most recent break.

Only receipts with `observed_at >= max(active_since, requested_at)`, `observed_at < expires_at`, distinct scheduled invocation IDs, terminal service success, and exact code 200 can form the recovery suffix. Manual, dry-run, report-only, current-running, pre-request, expired-request, or another request's observations never count. Aggregate `exact_streak` must agree with the suffix but is not its provenance.

### 10.3 Scheduled release gate

A timer-triggered reconciliation may set the record inactive and append `released` only when **all** conditions are true in the same locked run:

1. The current process proves that, under the same lock, this invocation successfully claimed and consumed a previously unconsumed root-owned trigger receipt for its exact timer opportunity/invocation; exactly one request is `pending`; `now < expires_at`; and there is no pending apply.
2. The current ledger read succeeded and passed schema and exact identity validation.
3. The tombstone's exact raw `ledger_identity` is absent from the current validated raw `would_prune` set.
4. The `recovery_receipts` suffix for this request contains at least three consecutive, distinct, completed scheduled receipts with exact code 200 and no missing scheduled opportunity between them.
5. All three receipt observations occurred on or after both `active_since` and `requested_at`, and before `expires_at`.
6. The current run's raw probe for the logical route is also exact 200. It is a regression guard and does not count as one of the already completed three.
7. The diagnostic history has `exact_code == 200`, `exact_streak >= 3`, and `exact_since >= max(active_since, requested_at)`; disagreement with receipts blocks rather than repairs state.
8. The current run passes the raw-live floor, and rebuilding after all eligible releases and no unapproved additions passes the final-pool floor and both config validators.
9. The unresolved canary choice in section 15 has been decided and, if required, its separately authorized receipt is present.

A 429, 500, or 503 is routable for R1 but is not recovery for tombstone release. Category streak is never accepted in place of exact streak. A successful ledger read with no recent eligible evidence does not satisfy the exact-200 requirements by itself.

The release transition, request status `released`/`closed_at`, inactive tombstone, and `pending_apply` are one atomic state commit before config replacement. After completion, preserve the tombstone record, all requests, receipts, evidence, and transitions for audit. A later raw dead-route decision starts a fresh route-specific 0/3 window; only a new explicit one-shot extension can append `reactivated`, set a new `active_since`/`last_confirmed_at`, and replace current decision evidence while preserving prior transitions, requests, and receipts. It cannot reuse the released request's evidence.

Whether these three scheduled synthetic 200 responses are sufficient by themselves or must be followed by a real canary is an unresolved operator choice in section 15. Until that choice is made, no recovery clear is authorized.

## 11. Pool construction and `MIN_LIVE`

`MIN_LIVE` means the single existing integer constant read once for the run. There are exactly two different counts; neither substitutes for the other:

- `raw_live_count`: the number of duplicate-free eligible reprobe roster entries whose current raw probe code is exactly 200. Held timeouts, 429, 500, 503, excluded local/special entries, and aliases do not count.
- `final_pool_count`: `len(build_pool(prospective_pool_status))` after R1 hysteresis and the complete prospective active-tombstone veto. This count uses the existing `build_pool()`/`KEEP_CODES` semantics, so routable non-200 codes may be members even though they did not count toward `raw_live_count`.

For an ordinary scheduled reconciliation/release, the order is mandatory:

```text
lock + strict state validation
  -> finish or stop on any pending_apply
  -> complete raw probe snapshot
  -> raw_live_count >= MIN_LIVE
  -> existing R1 category hysteresis
  -> current ledger read + exact identity resolution
  -> determine eligible releases (never unapproved additions)
  -> prospective active tombstones = active minus eligible releases
  -> veto the complete prospective active set
  -> build_pool()
  -> final_pool_count >= MIN_LIVE
  -> render and validate both routing layers
  -> atomic state/apply transaction
```

If either inequality fails, the run performs no release, candidate-window advancement, ordinary history/state commit, new transaction, config write, or restart. It leaves the prior tombstones and installed configs unchanged and exits non-zero with structured counts. The already consumed trigger receipt remains an immutable audit fact and is not reset. A previously prepared transaction is the sole routing exception: section 4 reconciles its already validated bytes before any new floor evaluation.

Initial activation and one-route extension do not treat a manual action as a fourth synthetic probe. For policy version 1, `ACTION_SNAPSHOT_MAX_AGE_SECONDS` is 900. They use the final completed scheduled snapshot in the accepted manifest, require `0 <= action_time - state_ts <= 900`, require that it is the latest scheduled opportunity with no later failed/missing opportunity, require its recorded `raw_live_count >= MIN_LIVE`, revalidate unchanged current config/state hashes and the current ledger/identity mapping, then compute the prospective final pool. Initial activation applies the exact agreed set all-or-nothing. An extension applies exactly its one approved ready route. If the snapshot is stale or `final_pool_count < MIN_LIVE`, the action creates no tombstone or transaction. The stored extension window remains audit evidence but is not actionable until a new qualifying receipt refreshes its latest-three suffix and a fresh one-shot action revalidates it.

Never partially enforce an initial set, pick a convenient subset, lower the constant, count aliases twice, or clear an existing tombstone to make room. A floor failure does not mean an active veto is lifted: existing tombstones remain durable and the last accepted configs remain untouched. If existing active tombstones plus new R1 results yield a final pool below the floor, stop; do not relax the veto automatically. Releases may increase the prospective pool, but they still require the raw guard and the complete section 10 contract.

After a completed transaction (`pending_apply=null`), every active logical-route tombstone must be absent from all managed LiteLLM fallbacks, unmanaged LiteLLM fallbacks processed by the script, and both managed gateway fallback chains. During a recoverable transaction, only the explicitly recorded preimage/desired split in section 4 is permitted. A model released from a tombstone still passes ordinary R1 non-incumbent promotion hysteresis; release is permission to recover, not forced promotion.

## 12. Hermetic test contract

Add deterministic tests without accessing `/var/lib`, `/etc`, a live database, network, journald, systemd, or public endpoints.

### 12.1 State and lock

- Valid schema version 1 round-trips without changing canonical meaning.
- Every missing required key, unknown key, wrong type, bool-as-int, non-finite rate, invalid timestamp, invalid transition/request/receipt/candidate/apply phase, and unknown version is rejected.
- Three observation entries must have consecutive scheduled-opportunity IDs, distinct invocation/receipt IDs, ordered timestamps, valid hashes, and identical decision content.
- A truncated or malformed enforcement state aborts; it never becomes an empty tombstone set.
- Fault injection before `os.replace()` leaves the old state byte-for-byte intact.
- Fault injection after replace proves the new complete JSON is readable.
- A second concurrent writer cannot acquire the lock and performs zero reads beyond the lock, zero probes, zero writes, and zero restart calls.
- Recovery-request writes use the same lock and atomic helper.
- Desired and preimage config bytes are staged, mode-restricted, file/directory-fsynced, and hash-verified before `pending_apply=prepared` becomes visible.
- Unknown apply kind/phase, path traversal, caller-selected destination, duplicate generation/action ID, and phase/restart-field mismatch are rejected.
- Floor-source/receipt combinations are strict: accepted/rollback manifests require a hash, current-invocation requires null, and that null can never certify a candidate or recovery cycle.
- Fault injection at every config temp-write, file-fsync, replace, directory-fsync, state-phase, and between-destination boundary leaves each destination at exactly its recorded preimage or desired hash and leaves a recoverable transaction.
- Recovery rolls a preimage/desired split forward to two desired hashes; an unknown destination hash or damaged staged file stops without overwrite.
- An invocation that finds a prior transaction exits after reconciliation, complete or not; no probe, ledger read, candidate/release mutation, or second transaction occurs in it.
- Restart baseline is captured only after both desired configs are installed; an unrelated service change before installation cannot falsely complete the transaction.
- Restart intent is durable before the mocked restart seam. A changed service invocation ID plus desired hashes/health completes; an unchanged/missing ID or crash at the intent/call boundary becomes `restart-uncertain` and never auto-retries.
- Each reprobe invocation requests at most one restart, a no-LiteLLM-change transaction requests zero, and a completed generation cannot be replayed.

### 12.2 Shadow activation

- Zero, one, or two qualifying observations cannot activate.
- The current 15:17 checkpoint is represented as 1/3, not retroactively 3/3; its raw initial receipt needs no invented historical model-health hash.
- Three agreeing successful scheduled observations pass eligibility.
- A manual, dry-run, failed, ledger-error, duplicate-timestamp, duplicate-invocation, changed-config, restarted, or decision-mismatch observation does not count.
- A bare invocation ID, caller-provided scheduled flag, wall-clock-near-timer run, current-running invocation, and nonterminal service result are rejected; only a valid post-run scheduled receipt counts.
- A valid one-shot trigger receipt admits the current release evaluator but never counts as a completed observation; reuse, wrong invocation/opportunity, or a manual `systemctl start` without it is rejected.
- Trigger-receipt claim is an atomic pending-to-consumed move in a temporary spool; a crash or later floor failure cannot make the token replayable.
- A tampered manifest or recomputed hash mismatch aborts activation.
- The current decision set must still equal the agreed three-cycle set at activation time.
- Merely setting `LEDGER_MODE` to `enforce-prune` without the explicit one-shot action and valid block aborts before probe and config seams.
- Capable code with no block stays shadow; a block in incapable code and an invalid block in capable code both fail closed rather than silently running shadow.
- A reused activation ID or activation against an existing block aborts without mutation.
- After activation, two cycles for a new route leave no tombstone; the third only marks that route's window ready; an ordinary fourth scheduled run still does not enforce it.
- Post-activation candidate/recovery receipts without their exact identity mapping and model-health hash are rejected.
- Route absence, failed/missing scheduled opportunity, ledger error, policy/mapping change, pool/config hash change, config apply, or restart resets only that route's consecutive window.
- A one-shot extension consumes exactly one ready route and its own three receipts. Reused extension IDs, cross-route evidence, implicit batching, and an extension whose current ledger/mapping changed are rejected.
- Action snapshot ages 899 and 900 seconds are accepted; 901 seconds, a future timestamp, or a later failed/missing opportunity is rejected without a tombstone.

### 12.3 Identity and policy

- Exact logical-name identity maps correctly.
- Exact `resolvedModel` and fallback `modelId` aliases map to the intended logical route using the documented precedence.
- The raw model-health file bytes are hashed and parsed directly; an HTTP/UI-shaped substitute, duplicate logical row, malformed file, or wrong path is rejected for destructive work.
- A missing health row permits only exact logical-name resolution and never invents a provider alias.
- A raw route identity that collides with another logical name is ambiguous even though each string alone looks valid.
- Unmatched and ambiguous ledger identities cannot create a tombstone.
- Prefix, suffix, case, slash, and hyphen near-matches do not map.
- An existing tombstone whose raw/logical/selected-route mapping changes aborts without clearing it or rendering a new config.
- Tombstones remove the proven logical route; an unrelated raw provider identity is never blindly removed from chains.
- `would_quarantine` and `would_limit_tail` remain non-destructive.
- The n=19/n=20 boundary, earned-history shield, trusted failure allowlist, tenant scope, 48-hour rate-limit-only floor, and mixed-throttle deferral remain pinned from `ae0959c`.

### 12.4 Exact history and release

- Legacy records seed exact streak 1 while preserving existing category behavior.
- 200→200→200 produces exact streak 3.
- 200→429 preserves routable category continuity but resets exact history to 429/1.
- 429→200 resets exact history to 200/1.
- 200→500→200 never qualifies as three exact 200s.
- Aggregate exact streak 3 without three completed scheduled receipts does not qualify.
- Request IDs are single-use; exact replay is idempotent; replacement while pending is rejected; explicit cancellation closes without release.
- At exactly `requested_at + 86400` the request is expired. Expiry preserves the veto/audit; a request operation may atomically close the stale request and append a fresh one; the fresh request cannot reuse old receipts.
- Pre-request, post-expiry, manual, dry-run, report-only, current-running, failed-service, duplicate invocation/opportunity, non-successor opportunity, missing-opportunity, and another request's receipts are independently ineligible.
- 200/200/200 completed receipts after the request qualify only when consecutive; 200/429/200/200/200 qualifies only on the final suffix.
- A missing/currently replayed trigger receipt, missing request, failed ledger read, present raw `would_prune`, current raw non-200, receipt suffix below 3, diagnostic disagreement, or sequence predating activation/request independently blocks release.
- All release predicates together set `active=false`, append exactly one `released` transition, retain the audit record, and do not force pool promotion.
- Evidence aging alone and a transient database failure preserve the active tombstone and its pool veto.
- A later dead decision starts at 0/3; only a fresh three-cycle window plus explicit extension reactivates and preserves earlier transitions.

### 12.5 Pool, apply, and rollback seams

- Tombstones apply after R1 hysteresis and before `build_pool()`.
- Raw-live counts only unique eligible exact-200 probes; 429/500/503, held timeouts, aliases, and excluded routes do not inflate it.
- Final-pool count is measured only after the complete prospective veto with normal `build_pool()` semantics.
- Raw live below `MIN_LIVE` aborts with prior enforcement/history/candidate/config bytes unchanged.
- Post-veto pool below `MIN_LIVE` aborts with no partial initial set, no extension transaction, and no automatic tombstone release; a rejected extension retains audit evidence but needs a fresh latest-three suffix/action before enforcement.
- Existing tombstones that contribute to a below-floor prospective pool remain durable and are never selectively cleared to satisfy the floor.
- Active tombstones are absent from every rendered managed and filtered unmanaged chain.
- A write-ahead state and exact staged desired/preimage files exist before the mocked config apply seam.
- An unchanged render causes no config write or restart.
- One changed LiteLLM render causes exactly one restart request; a failure never loops.
- A crash-recovery roll-forward uses its recorded accepted floor counts and cannot absorb a new candidate or later partial probe snapshot.
- Rollback restores the exact captured preactivation config and state snapshot and requests at most one rollback restart.

Retain all existing R1 and R2 shadow tests. Test helpers use temporary directories and temporary SQLite fixtures only.

## 13. Future one-restart rollout gate

This section is a gate for a separately authorized future window, not permission to execute it now.

Before activation:

- Review a SPEC 45 evidence manifest containing the three qualifying observations.
- Resolve the section 15 choices in writing.
- Pass the complete hermetic suite and Python syntax check at the candidate commit.
- Capture exact preactivation state, exact config bytes/hashes, and the LiteLLM invocation ID in rollback evidence.
- Prove the currently rendered pool is stable and the only intended membership delta is the agreed tombstone set.
- Prove the post-veto pool remains at or above `MIN_LIVE`.
- Confirm no unrelated routing or service work shares the window.

During a future authorized activation, the explicit one-shot mechanism acquires the lock, revalidates the manifest/current ledger/identity/floors, stages the exact preimages and desired bytes, commits `pending_apply`, atomically replaces both destinations, and permits at most one LiteLLM restart intent. The gateway retains its existing reload behavior; this contract does not add a gateway restart. Acceptance waits for the transaction to complete; `restart-uncertain` is not success.

Every future extension window repeats the same gates for exactly one ready route and needs its own explicit authorization. The standing timer never inherits authority to expand the tombstone set.

Do not retry a failed restart in a loop. A failed health or chain-agreement check stops the window and moves to the separately authorized rollback decision.

## 14. Rollback contract

Rollback evidence must contain the exact preactivation state/config hashes and the failed activation manifest. A future authorized rollback:

1. Takes the same exclusive lock.
2. Saves the failed activation state as immutable evidence.
3. Stages and validates the exact captured preactivation config bytes; it never reconstructs chains from memory.
4. Commits a rollback `pending_apply` in the still-valid enforcement state before replacing either config, then uses the same atomic destination and crash-recovery protocol as section 4.
5. Persists restart intent before requesting at most one LiteLLM restart if and only if the LiteLLM bytes changed. Ambiguity becomes `restart-uncertain`, never an automatic retry.
6. Only after both restored hashes and any required new service invocation are proven does it atomically restore the captured shadow-mode state contract and record the immutable rollback receipt outside the replaceable operational state.

Rollback is not implemented by clearing tombstones while leaving enforcement mode active. It does not retry repeatedly or oscillate between candidate and backup. If the rollback restart fails, stop and escalate; do not manufacture a successful result.

The activation manifest and failed enforcement state remain evidence even if the operational state returns to shadow. Rollback does not erase the audit trail.

## 15. Unresolved operator choices

These choices block implementation activation:

1. **Recovery proof.** Decide whether an explicit request plus three successful scheduled exact-200 probes is sufficient, or whether a bounded real canary success is an additional mandatory release gate. This contract requires the request and three exact 200s in either case; it does not authorize a real canary.
2. **R2b decay and tail policy.** Decide the final continuous-429 decay window, whether a route is first moved to chain tail or directly tombstoned, how long tail residence lasts, and how mixed rate-limit/auth/timeout/unavailable evidence behaves. Category `since` is not acceptable evidence. Until decided, `would_limit_tail` and mixed-throttle cases remain shadow-only.

Activation provenance is no longer an open design choice in this contract: only the accepted SPEC 45 manifest and completed scheduled receipts in section 6 qualify. If the installed units cannot prove timer origin, the exact unit-boundary receipt implementation must be designed and reviewed before code work; weakening provenance is not an option.

No other policy may be smuggled into the implementation slice. Earned-route quarantine remains non-destructive until it receives its own approved recovery and placement contract.

## 16. Acceptance boundary

SPEC 46 is complete as a design contract when:

- the 0/3-before-15:17 and current 1/3 observation facts are preserved honestly;
- initial activation requires three agreeing successful scheduled cycles and an explicit one-shot action, while each later route requires its own 3/3 window and explicit one-shot extension;
- atomic state/config transactions, restart-intent recovery, exclusive locking, strict schema, raw/logical identity, an exact model-health source, fail-stable database behavior, completed scheduled receipts, bounded release requests, exact-code history, explicit recovery, unambiguous two-stage `MIN_LIVE`, hermetic tests, and one-restart rollout/rollback are all specified;
- unresolved operator choices remain visibly blocking; and
- no enforcement or live operational action has occurred because of this document.

Completing this document does not complete R2, R6, or the repair arc. Enforcement remains pending explicit operator authorization after all gates pass.

## 17. Additive observation correction — 2026-07-18 18:50 UTC

The scheduled 18:18:57–18:19:19 UTC invocation exited 0 and recorded `changed=false`, pool size 39, `mode="shadow"`, `enforced=false`, no routing-layer change, no LiteLLM restart, and the same raw proposal `would_prune=["zen-deepseek-v4-flash-free"]`. The candidate remains 0/45 recent trusted calls, all rate-limited across approximately 124.9 hours. The legacy operational observation clock is therefore 2/3, superseding the earlier 1/3 status note. The next timer opportunity is approximately 21:19:51 UTC.

This correction does not create activation evidence. Control Surface verifier `8dbe183` deliberately reports zero strict scheduled observations because no timer-bound trigger/completion receipt producer exists. The existing 15:17 and 18:18 journal/systemd observations are operational facts, but they cannot be transformed into the causal receipts required by section 6.3. If the 21:19 opportunity agrees, the legacy operational clock may read 3/3 while the strict activation clock remains 0/3.

No tombstone capability, activation block, recovery evaluator, exact-code persisted clock, unit wrapper, config mutation, or enforcement action was implemented. `LEDGER_MODE` remains shadow. The unresolved choices in section 15 and a separate explicit one-shot activation authorization remain blocking.
