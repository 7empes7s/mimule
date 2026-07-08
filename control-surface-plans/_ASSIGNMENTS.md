# Per-page planning — session assignments

Output: one `pages/<slug>.plan.md` per route (10-section format from `_CONTEXT.md`).
Tool split: **codex** (gpt-5.5/high, memory-light → run several concurrently) takes more clusters;
**gemini** (pro, memory-heavy → 1–2 at a time) takes the rest. Together they cover the whole site once.

| ID | Tool | Cluster | Routes |
|----|------|---------|--------|
| CX1 | codex | admin-core | `/` `/insights` `/audit` `/admin`(new landing) |
| CX2 | codex | ops-infra | `/incidents` `/doctor` `/infra` `/jobs` |
| CX3 | codex | models-gateway-cost | `/models` `/gateway` `/litellm` `/cost` `/traces` `/feature-flags`(new) |
| CX4 | codex | agent-platform | `/builder` `/agents` `/agent-team` `/workflows` `/brainstorm` `/projects` `/marketplace` |
| CX5 | codex | admin-platform | `/settings` `/reports` `/channels` `/data-explorer`(new) `/about` `/install` `/status` `/ratings` |
| GM1 | gemini | access-security-compliance | `/governance` `/security` `/compliance` `/governance/risk`(new) |
| GM2 | gemini | editorial-pipeline | `/newsbites` `/autopipeline` `/scout` `/content-health` `/finance-intel` `/dossier` `/today` |
| GM3 | gemini | cli-sessions | `/opencode` `/codex` `/claude` `/gemini` |

Launch waves (memory-bounded): Wave 1 = CX1 CX2 CX3 + GM1 (+ Sonnet builder). Wave 2 = CX4 CX5 + GM2. Wave 3 = GM3.
</content>
