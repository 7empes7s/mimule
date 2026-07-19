# SPEC 28 — ULTRAPLAN Catalog R, R4: compliance evidence pack export (signed zip)

## Context (read first)
ULTRAPLAN R4: *"Compliance evidence pack export — one click on /compliance: audit-chain
segment (with verification result), control statuses, model lifecycle records, incident
post-mortems for period, discovery inventory snapshot → signed zip. THE artifact a
customer's auditor asks for."* Work in `/opt/opencode-control-surface`. Do NOT
commit/push/restart; leave changes uncommitted.

Existing surface at HEAD `ea2a1ee` (verified — EXTEND, keep byte-identical):
- `server/compliance/evidencePack.ts`: `buildPackFromDb()` → redacted last-500 audit rows +
  chainSha256, access review (users + gateway keys), trust score, counts;
  `generateEvidencePack`/`readEvidencePackById`. `GET /api/compliance/evidence-bundle`
  (server/api/compliance.ts ~line 76) streams a JSON bundle; CompliancePage has the button.
  These MUST keep working unchanged.
- Audit chain verification: `server/db/audit/chain.ts` (used by the chain-verifier report
  template in server/reporting/index.ts) — REUSE for a real verification result.
- Post-mortems: `reasoner_incidents.post_mortem` TEXT column (see server/api/reasoner.ts
  ~407).
- Discovery inventory: `discovered_assets` table (server/api/discovery.ts has the columns).
- Control statuses: whatever the /compliance page's summary handler already computes
  (server/api/compliance.ts) — reuse that source, do not invent controls.
- Model lifecycle: check for an existing model-lifecycle source (P16 grounded-subset work,
  around models/gateway). If none exists, the section is `{configured:false}` with an
  honest label — never fake records.
- NO zip dependency exists in package.json and none may be added.

## Build this

### 1. Period-scoped pack sections (`server/compliance/evidencePack.ts` — additive)
New `buildEvidencePackV2(periodStart, periodEnd)` (existing builders untouched) returning
the existing pack fields PLUS `Configured<T>`-style sections (follow the reporting idiom):
- auditChainSegment: redacted audit rows with ts in period (cap 2000, note the cap in the
  section) + `chainVerification` — run the REAL chain verification from
  server/db/audit/chain.ts over the segment and include its honest result
  (ok/brokenAt/checked count), never a fabricated "verified".
- controlStatuses: from the existing /compliance summary source.
- modelLifecycle: from the existing source if present, else `{configured:false}`.
- postmortems: reasoner_incidents with non-null post_mortem AND (resolved_at OR last_seen)
  in period — {id, title, failureClass, resolvedAt, postMortem}.
- discoveryInventory: discovered_assets snapshot {id, kind, name, status, criticality,
  owner, lastSeen} + counts by status.

### 2. Signed zip (`server/compliance/zipPack.ts`, new — NO new dependencies)
- Minimal ZIP writer: STORE-only (no compression), correct local file headers + central
  directory + EOCD, CRC-32 (implement the standard table-based CRC-32), UTF-8 names.
  Deterministic entry order.
- Entries: `pack.json` (the V2 pack, pretty-printed), `manifest.json`
  ({generatedAt, period, entries: [{name, sha256, bytes}], scheme:
  "HMAC-SHA256(manifest_without_signature) with server signing key"}),
  `signature.txt` (hex HMAC-SHA256 of the canonical manifest JSON).
- Signing key: persistent random 32-byte key stored once in `operator_state`
  (key name `evidence_signing_key`), created on first use via crypto.randomBytes —
  NEVER logged, NEVER included in the zip. Include the key's sha256 fingerprint in the
  manifest so an auditor can match packs to a key they were given out-of-band.
- Export a `verifyEvidenceZip(buffer, key)` helper used by tests (parse entries, recompute
  hashes, verify HMAC) — proves the format round-trips.

### 3. API + UI
- `GET /api/compliance/evidence-pack.zip?from=<ms>&to=<ms>` (default trailing 30 days;
  validate numbers, 400 on garbage) — same auth as the existing evidence-bundle route;
  responds `application/zip`, `Content-Disposition: attachment;
  filename="evidence-pack-<tenant>-<YYYY-MM-DD>.zip"`. Audit `compliance.evidence-pack`
  (low, request: period) like the existing bundle route audits (follow its idiom; if it
  does not audit, add audits to the NEW route only).
- CompliancePage: "Export signed evidence pack (zip)" button next to the existing bundle
  button, with a small from/to period picker defaulting to last 30 days (existing date
  input idioms if any; otherwise a simple preset select: 7d/30d/90d).

### 4. Tests (`server/compliance/evidencePack.test.ts` extend or create; hermetic temp DB)
- Seeded: audit rows in+out of period → segment filtered, cap respected; chain
  verification result present and honest on a tampered row (flip a row's payload if the
  chain machinery allows constructing that in-test; otherwise assert the real verifier's
  output shape on clean data); postmortems only in-period non-null; discovery snapshot
  matches seeds; controlStatuses/modelLifecycle honest when sources empty.
- Zip: build → `verifyEvidenceZip` passes; corrupt one byte of pack.json inside the buffer
  → hash mismatch detected; wrong key → HMAC fails. CRC-32 of a known vector
  ("123456789" → 0xCBF43926) asserted.
- Route: 400 on bad params; happy path returns application/zip with nonzero body (temp
  DB); existing evidence-bundle route byte-identical (existing tests stay green).

## Hard rails
- NEVER touch `/etc/litellm/*`, `/opt/newsbites`, `/opt/mimoun`, `/opt/paperclip`, `/opt/backups`.
- No systemctl/docker/pkill; no commit/push; no restarts. NO new npm dependencies.
- Do NOT edit autoapplyPolicy.ts; never widen gate.sh; existing evidence-bundle JSON
  endpoint, digest/executive/remediation reports, and chain.ts byte-identical.
- Signing key: never logged, never in the zip, never in test snapshots committed to repo.
- Tests never write the live DB.
- Do NOT touch builder/runner/terminal/gateway/runbooks files.

## Verify before reporting (run yourself, paste output)
1. `bun run check` — clean (known Vite chunk warning OK).
2. `DASHBOARD_DB=1 bun test server/compliance/ server/api/compliance.test.ts --timeout 60000` — all pass (adjust to actual files).
3. `git status --short` — ONLY: evidencePack.ts(+test), zipPack.ts(+test if separate),
   compliance.ts (api), router.ts (if a new route line is needed), CompliancePage.tsx. NOT REPORT.*.
4. `git diff --check` — no whitespace errors.

## Report back
Files changed; the V2 section list with honest-empty behavior; the zip entry layout +
signing scheme; the verifyEvidenceZip test results (incl. corrupt-byte and wrong-key
cases + CRC vector); route smoke output; confirmation the existing JSON bundle is
byte-identical and no key material is logged or embedded.
