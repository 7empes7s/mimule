# Repo Notes

This repository intentionally excludes live secrets and runtime state.

Excluded from git:
- `.env`
- live `openclaw-config/openclaw.json`
- live `openclaw-config/workspace/MASTER_PLAN.md`
- runtime session logs
- device identity files
- local runtime state directories

Public redacted replacements:
- `docs/MASTER_PLAN_PUBLIC.md`
- `docs/OPENCLAW_PUBLIC.json`

Rule:
- if a live file contains tokens, API keys, cookies, or device secrets, commit a redacted public copy instead of the live file.
