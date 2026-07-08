# /autopipeline/dossier/:date/:slug — Product Plan
> One-line: the Dossier Inspector for reviewing story evidence, drafts, verification output, agent runs, and injecting editorial corrections back into the pipeline.

## 1. Today (verified, with file:line)
- Frontend component/readiness: the Dossier Inspector is imported and registered at `/autopipeline/dossier/:date/:slug`, nested under the Autopipeline route family (`app/App.tsx:32`, `app/App.tsx:128`, `app/App.tsx:129`). Readiness: 🟡 partial.
- The page reads `date` and `slug` route params, fetches `/api/dossier/${date}/${slug}`, and has loading/error/null guards (`app/routes/DossierInspectorPage.tsx:58`, `app/routes/DossierInspectorPage.tsx:59`, `app/routes/DossierInspectorPage.tsx:60`, `app/routes/DossierInspectorPage.tsx:61`, `app/routes/DossierInspectorPage.tsx:64`, `app/routes/DossierInspectorPage.tsx:67`, `app/routes/DossierInspectorPage.tsx:68`, `app/routes/DossierInspectorPage.tsx:69`).
- The inspector has tabs for Header, Sources, Claims, Draft, Verify, Agent Runs, and Inject (`app/routes/DossierInspectorPage.tsx:28`, `app/routes/DossierInspectorPage.tsx:29`, `app/routes/DossierInspectorPage.tsx:30`, `app/routes/DossierInspectorPage.tsx:31`, `app/routes/DossierInspectorPage.tsx:32`, `app/routes/DossierInspectorPage.tsx:33`, `app/routes/DossierInspectorPage.tsx:34`, `app/routes/DossierInspectorPage.tsx:35`).
- Header UI links back to `/autopipeline`, shows date, headline, vertical, status, and a Refresh button (`app/routes/DossierInspectorPage.tsx:86`, `app/routes/DossierInspectorPage.tsx:90`, `app/routes/DossierInspectorPage.tsx:92`, `app/routes/DossierInspectorPage.tsx:94`, `app/routes/DossierInspectorPage.tsx:98`, `app/routes/DossierInspectorPage.tsx:99`, `app/routes/DossierInspectorPage.tsx:100`).
- Header tab shows Story Identity and Editorial Brief fields, Sources uses `SourcesTable`, Claims uses `ClaimsTable`, Draft/Verify show preformatted content/empty messages, Agent Runs uses `AgentRunList`, and Inject uses `DossierInjectPanel` (`app/routes/DossierInspectorPage.tsx:113`, `app/routes/DossierInspectorPage.tsx:121`, `app/routes/DossierInspectorPage.tsx:136`, `app/routes/DossierInspectorPage.tsx:140`, `app/routes/DossierInspectorPage.tsx:150`, `app/routes/DossierInspectorPage.tsx:153`, `app/routes/DossierInspectorPage.tsx:157`, `app/routes/DossierInspectorPage.tsx:160`, `app/routes/DossierInspectorPage.tsx:164`, `app/routes/DossierInspectorPage.tsx:168`, `app/routes/DossierInspectorPage.tsx:174`, `app/routes/DossierInspectorPage.tsx:176`).
- Inject posts notes/stage/requeue to `/api/dossier/:date/:slug/inject` and refreshes on success (`app/routes/DossierInspectorPage.tsx:73`, `app/routes/DossierInspectorPage.tsx:74`, `app/routes/DossierInspectorPage.tsx:77`, `app/routes/DossierInspectorPage.tsx:79`, `app/routes/DossierInspectorPage.tsx:83`).
- Backend hardcodes dossier root to the MIMULE editorial workspace and checks `DOSSIERS_ROOT/date/slug` exists (`server/api/dossier.ts:6`, `server/api/dossier.ts:7`, `server/api/dossier.ts:99`, `server/api/dossier.ts:100`, `server/api/dossier.ts:102`, `server/api/dossier.ts:105`, `server/api/dossier.ts:108`).
- Backend reads `DOSSIER.md`, `sources.json`, `draft.md`, `verify.md`, `publish.md`, and `notes.md` concurrently (`server/api/dossier.ts:114`, `server/api/dossier.ts:115`, `server/api/dossier.ts:123`, `server/api/dossier.ts:124`, `server/api/dossier.ts:125`, `server/api/dossier.ts:126`, `server/api/dossier.ts:127`, `server/api/dossier.ts:128`).
- Backend parses `DOSSIER.md` into header fields and a claims table, and parses `sources.json` as sources (`server/api/dossier.ts:131`, `server/api/dossier.ts:135`, `server/api/dossier.ts:136`, `server/api/dossier.ts:141`, `server/api/dossier.ts:143`, `server/api/dossier.ts:149`, `server/api/dossier.ts:157`, `server/api/dossier.ts:158`, `server/api/dossier.ts:160`, `server/api/dossier.ts:164`, `server/api/dossier.ts:168`).
- Backend reads `agent_runs` directories and parses `metadata.json` and `response.json`, deriving stage from the directory suffix (`server/api/dossier.ts:174`, `server/api/dossier.ts:177`, `server/api/dossier.ts:180`, `server/api/dossier.ts:185`, `server/api/dossier.ts:190`, `server/api/dossier.ts:191`, `server/api/dossier.ts:197`, `server/api/dossier.ts:205`, `server/api/dossier.ts:213`, `server/api/dossier.ts:217`).
- Inject appends notes to `notes.md`; if `requeue` and `stage` are present, it POSTs `cmd: "inject"` with `dossierDir` and `stage` to `http://127.0.0.1:3200/command` (`server/api/dossier.ts:257`, `server/api/dossier.ts:258`, `server/api/dossier.ts:260`, `server/api/dossier.ts:270`, `server/api/dossier.ts:288`, `server/api/dossier.ts:296`, `server/api/dossier.ts:299`, `server/api/dossier.ts:301`, `server/api/dossier.ts:304`, `server/api/dossier.ts:305`, `server/api/dossier.ts:309`, `server/api/dossier.ts:310`, `server/api/dossier.ts:311`).
- Router mounts GET dossier and mutation-gated POST inject (`server/api/router.ts:854`, `server/api/router.ts:855`, `server/api/router.ts:856`, `server/api/router.ts:857`, `server/api/router.ts:858`, `server/api/router.ts:859`, `server/api/router.ts:861`).
- Tests only assert a real dossier returns 200 shape or missing dossier returns 404, and inject returns 404 for a non-existent dossier (`server/api/dossier.test.ts:18`, `server/api/dossier.test.ts:23`, `server/api/dossier.test.ts:31`, `server/api/dossier.test.ts:34`, `server/api/dossier.test.ts:43`, `server/api/dossier.test.ts:50`, `server/api/dossier.test.ts:56`, `server/api/dossier.test.ts:67`).

## 2. Gaps, mock & broken parts
- Zero-config gap: the inspector assumes one dossier root and one autopipeline command URL; it cannot discover dossier stores in another install or register an editorial pipeline asset (`server/api/dossier.ts:7`, `server/api/dossier.ts:102`, `server/api/dossier.ts:304`, `server/api/router.ts:855`).
- Fresh environments or missing dossiers produce a generic fetch error page from the frontend rather than a route-specific “dossier not found / pipeline not registered / search dossiers” state (`server/api/dossier.ts:108`, `server/api/dossier.test.ts:31`, `app/routes/DossierInspectorPage.tsx:67`, `app/routes/DossierInspectorPage.tsx:68`).
- Inject writes notes and may requeue without writing an action audit row inside the handler; the router mutation-gates it, but the side effect itself is not auditable from `action_audit` (`server/api/router.ts:858`, `server/api/router.ts:859`, `server/api/dossier.ts:296`, `server/api/dossier.ts:299`, `server/api/dossier.ts:304`, `server/api/dossier.ts:305`, `server/db/writer.ts:260`).
- Requeue failure is swallowed with a warning and the request can still return success, so the operator may believe the pipeline was requeued when only notes were written (`server/api/dossier.ts:301`, `server/api/dossier.ts:304`, `server/api/dossier.ts:314`, `server/api/dossier.ts:315`, `server/api/dossier.ts:316`, `server/api/dossier.ts:320`).
- The inspector shows raw draft/verify content and tables, but does not show AI reasoning before evidence, claim risk, source reliability, or recommended next stage (`app/routes/DossierInspectorPage.tsx:150`, `app/routes/DossierInspectorPage.tsx:157`, `app/routes/DossierInspectorPage.tsx:164`, `app/routes/DossierInspectorPage.tsx:168`, `server/insights/ai.ts:95`, `server/insights/ai.ts:109`).
- Agent run duration is explicitly `null`, so the Agent Runs tab cannot support performance or stuck-stage analysis from this handler (`server/api/dossier.ts:217`, `server/api/dossier.ts:220`, `server/api/dossier.ts:221`, `app/routes/DossierInspectorPage.tsx:174`).
- There is no connection to shared insights for dossier-level findings such as weak source set, unverified claims, failed verify stage, or unregistered AI agent/model used in agent runs (`server/api/dossier.ts:217`, `server/api/dossier.ts:222`, `server/api/dossier.ts:223`, `server/insights/scanners/registry.ts:114`, `server/insights/scanners/registry.ts:146`, `server/insights/scheduler.ts:38`).

## 3. Goal alignment (G1–G8)
- G1/G3: missing/malformed artifacts should degrade per tab, not break the page.
- G2/G6: notes injection/requeue should be a single audited Apply, with partial-success transparency.
- G4/G9: discover dossier roots, pipeline APIs, agent runs, AI CLIs/agents, and model endpoints used by the dossier.
- G5/G7: place an AI editorial/veracity summary before raw artifacts.
- G8: make this the sellable evidence/audit workbench for AI editorial pipelines.

## 4. Best-practice research
- Research basis: NIST AI RMF supports traceable AI lifecycle evidence; Google SRE monitoring supports stage/API/file freshness signals; Microsoft HAX supports showing AI uncertainty and correction affordances; OWASP LLM Top 10 supports controls for prompt/tool traces, agent outputs, exposed endpoints, and autonomous requeue actions (https://www.nist.gov/itl/ai-risk-management-framework, https://sre.google/sre-book/monitoring-distributed-systems/, https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/, https://owasp.org/www-project-top-10-for-large-language-model-applications/).
- Use investigation-workbench IA: summary, risk, evidence, claims, sources, drafts, run lineage, actions.
- Use provenance-first design: every claim/source/draft version links to artifact, agent run, model, and timestamp.
- Use partial-failure transparency: notes written vs requeue accepted vs pipeline failed are separate statuses.
- Use verifier UX: high-risk claims are extracted and scored before the operator reads the draft.

## 5. Target design
- Header: dossier identity, registered pipeline, current stage, artifact completeness, source/claim risk, open insights.
- Main: AI dossier assessment first; then tabs for sources/claims/draft/verify/agent runs/inject.
- Empty/fresh state: not found, unregistered pipeline, missing artifact, and malformed JSON each have explicit states.
- Discovery: register dossier roots from pipeline discovery; scan agent_runs for model/CLI/system fingerprints and feed unknowns to AI inventory.
- G6: inject notes is review-tier Apply; requeue reports a separate audited pipeline command result.

## 6. Features to add (prioritized)
- MUST: Audit inject and requeue separately. Acceptance: notes write and command proxy each produce action audit rows and UI result state.
- MUST: AI dossier assessment. Acceptance: summary/root cause/recommended next action appears before tabs.
- MUST: Artifact health model. Acceptance: missing/malformed sources, claims, verify, agent runs show per-tab warnings.
- MUST: Discovery-backed dossier root. Acceptance: route works from registered pipeline config, not a hardcoded path.
- SHOULD: Agent run lineage with model/log/timing/cost.
- SHOULD: Claim risk queue with “needs verification” actions.
- EXTRA: Side-by-side draft vs verify notes with suggested edits.

## 7. Sellable-in-parts
- Standalone pitch: “AI editorial dossier inspector: evidence, claims, drafts, verification, lineage, and audited corrections.”
- Suite fit: connects Autopipeline, Scout, NewsBites, Content Health, Models/Gateway, Insights, Audit, and Reports.

## 8. Backend work
- Parameterize dossier root by registered pipeline asset.
- Add `dossier_artifact_health` mapping and insight emission.
- Add audited executor action for `dossier.notes.inject` and `pipeline.dossier.requeue`.
- Preserve requeue response and partial failure in API response.
- Extend agent run parsing with timing/model/cost and discovered AI asset fingerprints.

## 9. Build slices
- Slice 1: not-found/malformed/partial artifact states.
- Slice 2: audited inject/requeue result contract.
- Slice 3: AI dossier assessment and claim/source risk.
- Slice 4: discovery-backed root and agent AI inventory hooks.
- Documentation to update during implementation: this plan, `/root/DASHBOARD_V5_PLAN.md`, `README.md` dossier workflow docs, and `/root/CLAUDE.md` if dossier artifact schema changes.

## 10. Verification
- Missing dossier shows useful not-found state.
- Inject notes without requeue writes audit success.
- Inject with requeue reports notes status and command status separately.
- Agent run unknown model/CLI produces discovery finding.
- AI assessment appears before raw draft/verify text.
