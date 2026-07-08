# /content-health — Product Plan
> One-line: what this page is and who it's for.

A tool for running on-demand health checks against published content to find issues like broken links or outdated information.

## 1. Today (verified, with file:line)
- **Frontend**: `app/routes/ContentHealthPage.tsx` (🟡 partial)
  - Fetches recent health check runs from `/api/content-health` (`ContentHealthPage.tsx:14`).
  - Displays a list of recent runs, showing when they were triggered and their status (`ContentHealthPage.tsx:43`).
  - Allows selecting a specific run to view its findings in a table (`ContentHealthPage.tsx:55`).
  - The findings table shows the article, the detected issue, and the severity (`ContentHealthPage.tsx:86`).
  - A "Run new check" button calls `POST /api/content-health/run` to start a new scan (`ContentHealthPage.tsx:32`).
- **Backend**:
  - `server/api/content-health.ts`:
    - `contentHealthHandler`: Fetches run history and findings from the `content_health_runs` and `content_health_findings` tables in `dashboard.db` (`content-health.ts:25`).
    - `contentHealthRunHandler`: Kicks off a new health check. It currently contains a `// TODO: Implement the actual content health check logic` comment, and returns mock data (`content-health.ts:10`).
- **Data Sources**:
  - `content_health_runs` and `content_health_findings` tables in `dashboard.db`.
- **Readiness**: 🔴 mock-broken. The core functionality of running a health check is not implemented. The page displays what appears to be historical data, but new checks do nothing.

## 2. Gaps, mock & broken parts
- **Core Logic is Mocked**: The `contentHealthRunHandler` in `server/api/content-health.ts:10` is a placeholder. It immediately returns a mock "run started" response without performing any actual work. The most critical part of this feature is missing.
- **No Actual Scanning**: Because the handler is a mock, no content is ever scanned, and no findings are ever generated. Any data visible on the page must be from a previous, now-defunct implementation or seeded mock data.
- **No Insight Integration**: When a content health issue is found, it should create an `insight` in the central inbox. This integration is completely missing. For example, a high-severity finding like "Article references a deprecated API" should be a findable, trackable issue in `/insights`.

## 3. Goal alignment (G1–G8)
- **G1 Usable & stable**: 🔴 The page appears stable but is fundamentally unusable as its primary action does nothing. This violates the user's trust.
- **G2 Controllable via GUI**: 🔴 The main control ("Run new check") is a dead button.
- **G3 Complete**: 🔴 The feature is entirely incomplete under the hood. It's a UI shell over mock logic.
- **G4 Detects everything**: 🔴 Detects nothing because the check logic is not implemented.
- **G5 Findable, readable, actionable**: 🔴 Findings are not generated, so they are not findable anywhere.
- **G7 AI reasoning BEFORE insights**: 🔴 No insights are generated to attach reasoning to.

## 4. Best-practice research
- **Automated Link Checkers**: Tools like `broken-link-checker` or commercial services (e.g., Ahrefs Site Audit) automatically crawl a site and report on broken links (404s), redirects, and other HTTP errors. This is a foundational content health check.
- **Content Freshness Audits**: SEO platforms often flag content that hasn't been updated in a long time, especially for fast-moving topics. They can also detect when content is "stale" (e.g., mentioning "last year" when it's now two years ago).
- **Policy & Guideline Checks**: More advanced systems use linters to check for compliance with editorial guidelines, such as use of deprecated terminology, presence of required disclaimers, or outdated product names. This can be implemented with custom rules or even LLM-based checks.

## 5. Target design
- **Implement the Backend Logic**: The first step is to replace the mock `contentHealthRunHandler` with a real implementation.
  - The handler should spawn a background job (using the existing `jobs` system) to perform the scan asynchronously.
  - The job should iterate through all published articles (`getAllArticles` from the newsbites adapter).
  - For each article, it should perform checks, starting with a simple one:
    1.  **Broken Link Check**: Parse the rendered HTML of the article, extract all `<a>` tags, and make a `HEAD` request to each external URL to check for non-2xx/3xx status codes.
- **From Findings to Insights**: Each finding from the scan should be converted into an `insight`.
  - A broken link would become a `low` severity insight with `sourceKey: 'content-health:broken-link:<article_slug>:<url>'`.
  - The insight summary should clearly state "Article X has a broken link to Y".
  - The deep link (`manualPageHref`) should point back to the `/content-health?run=<run_id>&finding=<finding_id>` page for context.
- **Rework Frontend**:
  - The page should not be a dead end. It should be a *view* into the insights system, filtered for `domain: 'content-health'`.
  - Remove the separate `content_health_findings` table and have the scanner write directly to the `insights` table. The page should then query `/api/insights?domain=content-health`.
  - This unifies the data model and makes content health issues visible in the main inbox. The "Run new check" button remains, but now it just triggers a job that populates the main insight store.

## 6. Features to add (prioritized)
- **MUST**:
  - Implement the `contentHealthRunHandler` to run a real scan in a background job.
  - Implement a broken link checker as the first and most fundamental check.
  - Ingest all findings as `insights` with a `domain: 'content-health'`.
  - Refactor the `ContentHealthPage` to display data from the `/api/insights` endpoint, effectively becoming a specialized view of the main inbox.
- **SHOULD**:
  - Add more check types:
    - **Stale Content Check**: Flag articles not updated in >1 year.
    - **Keyword Check**: Allow an operator to provide a list of deprecated terms and flag any articles that contain them.
- **EXTRA**:
  - Use an LLM to perform a "freshness" check. For an article about a specific technology, the LLM could be prompted to "read this article and identify any statements that are likely outdated as of [current date]". This would create higher-quality, AI-reasoned findings.

## 7. Sellable-in-parts
This is a classic "Site Audit" or "Content SEO Health" tool. It can be sold to any organization with a significant content footprint (blogs, documentation, marketing sites). The pitch is "An automated auditor that continuously monitors your content for broken links, stale information, and other quality issues, helping you protect your brand and maintain SEO rankings."

## 8. Backend work
- **Refactor `contentHealthRunHandler`**: Change it to create a new job in the `jobs` table and return the `jobId`.
- **Create a Job Worker**: A new background worker process that picks up 'content-health-scan' jobs.
- **Implement Scanners**:
  - `broken-link-scanner.ts`: A module that can take a URL or HTML content and find broken links.
  - The worker will use this scanner on each article.
- **Insight Integration**: The worker, upon finding an issue, will call `upsertInsight` to create a new `insight` record.
- **Schema**:
  - Remove the `content_health_findings` table.
  - The `content_health_runs` table might still be useful for tracking the history of *when* checks were run, but the findings themselves live in `insights`.

## 9. Build slices
1.  **Backend Job & Link Checker**: Implement the background job and the broken link checker logic. Make it so `contentHealthRunHandler` successfully kicks off a job that scans for broken links and logs them to the console.
2.  **Insight Ingestion**: Modify the job to `upsertInsight` for each broken link it finds. Verify these insights appear in the main `/insights` inbox.
3.  **Frontend Refactor**: Change `ContentHealthPage` to be a view over `/api/insights?domain=content-health` instead of its own custom endpoint.
4.  **Add Stale Content Check**: Implement the logic to flag articles older than a certain date.
5.  **Add Keyword Check**: Add the UI and backend logic for the deprecated keyword check.

## 10. Verification
- After the refactor, run a new check. Verify a job is created and that it populates the `/insights` page with findings.
- Verify the `ContentHealthPage` now shows the same findings as the main `/insights` page (just filtered).
- Manually add a broken link to an article, deploy, and run a check. Verify the broken link is detected and a corresponding insight is created.
- Verify the deep-link in the insight takes you back to the `ContentHealthPage` and highlights the specific finding.
- Verify the "Run new check" button correctly initiates a new scan.
