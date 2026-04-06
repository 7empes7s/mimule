# HEARTBEAT.md

Keep heartbeat work operational and cheap.

Checklist:
- Check gateway health with `curl -fsS http://127.0.0.1:18789/health`
- Check Paperclip health with `curl -fsS http://127.0.0.1:3100/api/health`
- Check whether any pending user-facing issue needs reporting
- If nothing needs attention, reply `HEARTBEAT_OK`

Do not generate long prose during heartbeat runs.
Do not rely on the `openclaw` shell command being present in PATH.
If a check fails, report the failing endpoint or command exactly.
Inside the OpenClaw runtime, prefer `sh /root/.openclaw/scripts/status-report.sh` over raw `curl` commands when available.
