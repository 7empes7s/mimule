# Repository Guidelines

## Project Structure & Module Organization
This repository currently tracks operational and planning documents for the MIMULE / TechInsiderBytes stack. All versioned content lives at the top level as Markdown files:

- `CLAUDE.md` for workspace and service context
- `MIMULE.md` for platform notes
- `MIMULE_MASTER_PLAN*.md` for canonical continuation and progress tracking
- `NEWSBITES_LEVELING_PLAN_V1.md` for roadmap work

Runtime services under `/opt/*` are referenced by these docs but are not versioned here.

## Build, Test, and Development Commands
There is no application build or local dev server defined in this repository. Use lightweight validation commands before opening a PR:

```bash
git status
git diff --check
git log --oneline --decorate -5
```

`git diff --check` catches trailing whitespace and malformed patch output. If `markdownlint` is installed locally, run `markdownlint *.md` for an extra Markdown pass.

## Coding Style & Naming Conventions
Write in clear, factual Markdown with short sections and ATX headings (`##`). Keep lists flat, prefer fenced code blocks for commands, and use UTC dates when recording status updates. Preserve the existing filename pattern for canonical docs: uppercase names with underscore-separated versions, for example `MIMULE_MASTER_PLAN_V3.md`.

When updating long-lived planning files, append new progress entries instead of rewriting prior history unless the document explicitly calls for consolidation.

## Testing Guidelines
Testing is manual and document-focused. Verify file paths, service names, ports, URLs, and timestamps against the current system state before committing. For plan documents, confirm that new entries follow the existing log format and clearly distinguish facts from inference. No coverage target or automated test suite is configured here.

## Commit & Pull Request Guidelines
Follow the commit style already present in Git history: short imperative subjects, optionally scoped, for example `docs: update NewsBites roadmap` or `Initial commit: add CLAUDE.md project instructions`. Keep each commit focused on one document set or one operational change.

PRs should include a concise summary, list of documents touched, note any operational impact, and link the related issue or task when applicable. Screenshots are unnecessary unless formatting or rendered output is the point of review.

## Agent-Specific Notes
Read `CLAUDE.md` and the latest `MIMULE_MASTER_PLAN_V3.md` before making stack-level edits. If a statement is not directly verified, label it as an inference.
