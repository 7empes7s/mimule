# /channels — Product Plan
> One-line: the notification routing, delivery audit, and operator communications console.

## 1. Today (verified, with file:line)
- Frontend route: `/channels` renders `ChannelsPage` (`app/App.tsx:187`-`app/App.tsx:189`); nav marks it advanced and experimental (`app/lib/navRegistry.ts:49`).
- Frontend data sources: the page loads `/api/channels?limit=250` and `/api/notifications/rules?limit=200` (`app/routes/ChannelsPage.tsx:165`-`app/routes/ChannelsPage.tsx:168`).
- UI supports brief preview/send, notification rule editing, adding rules, and filtered Telegram/alert/brief logs (`app/routes/ChannelsPage.tsx:337`-`app/routes/ChannelsPage.tsx:372`, `app/routes/ChannelsPage.tsx:374`-`app/routes/ChannelsPage.tsx:527`, `app/routes/ChannelsPage.tsx:529`-`app/routes/ChannelsPage.tsx:545`).
- Backend routes are registered for channel log reads, rule reads/writes, and brief preview/send (`server/api/router.ts:635`-`server/api/router.ts:642`, `server/api/router.ts:1030`-`server/api/router.ts:1049`).
- Backend storage is real: channel log reads use `readChannelLog`; notification rules use `readNotificationRules` and `upsertNotificationRule` (`server/api/channels.ts:107`-`server/api/channels.ts:139`, `server/api/channels.ts:141`-`server/api/channels.ts:177`).
- Brief actions call `/opt/mimoun/openclaw-config/scripts/newsbites-brief.sh` by default (`server/api/channels.ts:16`, `server/api/channels.ts:103`-`server/api/channels.ts:105`), audit preview/send, and write channel log rows (`server/api/channels.ts:179`-`server/api/channels.ts:231`).
- Schema exists for `notification_rules` and `channels_log` (`server/db/dashboard.ts:235`-`server/db/dashboard.ts:253`).
- Current readiness: 🟡 partial; logs/rules/brief actions work, but rule UX is raw JSON and channel routing is not yet the unified notification center.

## 2. Gaps, mock & broken parts
- Rule thresholds are edited as raw JSON textareas (`app/routes/ChannelsPage.tsx:237`-`app/routes/ChannelsPage.tsx:243`, `app/routes/ChannelsPage.tsx:440`-`app/routes/ChannelsPage.tsx:451`), which is error-prone and not an admin-center UX.
- There is no delete, test-recipient, quiet-hours, escalation, dedup preview, or per-severity routing control in the UI.
- Rule writes are not explicitly audited in `notificationRuleUpsertHandler`; it upserts and returns the rule (`server/api/channels.ts:161`-`server/api/channels.ts:177`) but does not write `action_audit`.
- Brief send is a direct shell script invocation (`server/api/channels.ts:212`-`server/api/channels.ts:231`); it is audited, but not job-backed, retryable, or correlated with delivery success.
- Logs are split into keyword-derived Telegram/Alert/Brief views in the browser (`app/routes/ChannelsPage.tsx:187`-`app/routes/ChannelsPage.tsx:206`), not server-side typed categories.
- Cross-page blocker to call out: if notification settings depend on `/settings`, the known system config persistence gap remains (`server/api/systemConfig.ts:92`, `server/api/systemConfig.ts:115`).

## 3. Goal alignment (G1–G8)
- G1: reliable delivery state, clear degraded DB/script errors, and no invalid JSON saves.
- G2: all notification rules, brief scheduling, escalation, and channel tests from GUI.
- G3: no simulated sends; every visible delivery row comes from `channels_log` or provider result.
- G4: channel failure, missing Telegram token, stale digest, and notification backlog become insights.
- G5: one notification policy page with severity-sorted rules and recent failed deliveries first.
- G6: safe digest sends can be automatic; risky/manual sends use one Send button and confirmation.
- G7: AI explains why a notification fired, who got it, and what action is recommended before raw payload.
- G8: sell as an "AI Ops Communications & Alert Routing" module.

## 4. Best-practice research
- Incident communication patterns from Microsoft admin/service health center favor visible health state, incident history, and current communications in one place: https://learn.microsoft.com/en-us/microsoft-365/enterprise/view-service-health
- OWASP logging guidance supports logging security-relevant events, failures, and enough event attributes for investigation: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- FinOps anomaly management emphasizes timely alerting and investigation workflows for unexpected cost events, which should route through channels: https://www.finops.org/framework/capabilities/anomaly-management/
- Grafana annotation/drilldown practices suggest linking notifications back to incident/finding context instead of sending isolated messages: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/annotate-visualizations/

## 5. Target design
- Layout: top delivery health row, failed/undelivered messages, active routing rules, scheduled digests, channel connectors, and delivery archive.
- Components: `NotificationRuleBuilder`, `ChannelConnectorStatus`, `DeliveryTimeline`, `EscalationPolicyEditor`, `MessagePreview`, `TestDeliveryModal`, and `FindingNotificationPreview`.
- Empty/loading/error: distinguish "no deliveries yet", "DB disabled", "connector missing token", and "script failed".
- Mobile parity: rule cards instead of editable tables; controls are 44px; JSON is hidden behind advanced view.
- AI reasoning appears on each notification: "why it fired", source finding/report, target audience, dedupe decision, and recommended next action.
- Actions: automatic delivery for safe severities/rules; one Send/Test/Retry button for manual operations; every send and rule change audited.

## 6. Features to add (prioritized)
- MUST: replace raw threshold JSON with typed rule forms for severity, domain, detector, quiet hours, destinations, dedupe window, and escalation.
- MUST: audit notification rule create/update/delete; acceptance: `action_audit` rows include before/after and actor.
- MUST: add test delivery per connector; acceptance: test writes `channels_log`, shows provider/script output, and links audit.
- MUST: add delivery failure insight detector; acceptance: failed sends create `/insights` rows and dedupe repeat failures.
- SHOULD: add digest schedule management tied to `/reports`; acceptance: daily/weekly digest rules can be enabled/disabled from `/channels`.
- SHOULD: add connector status for Telegram, webhook, email, and future Slack/Teams.
- EXTRA: message simulator that shows exactly who would receive a new critical finding and why.

## 7. Sellable-in-parts
- Standalone pitch: "Notification governance for AI operations: route, dedupe, audit, and explain every alert."
- Suite fit: it is the delivery layer for `/insights`, `/reports`, `/status`, `/incidents`, `/cost`, and `/security`.
- It should deep-link every message to the source finding/report and every rule change to `/audit`.

## 8. Backend work
- Extend `notification_rules` model or add a typed `notification_policies` view over it; preserve existing table where possible.
- Add `DELETE /api/notifications/rules/:id`, `POST /api/channels/test`, and `POST /api/channels/:id/retry`.
- Add audit writes inside `notificationRuleUpsertHandler` and future delete/test handlers.
- Convert brief send to a job-backed executor action for retry/cancel and output capture.
- Add channel detector in `server/insights/scanners/ops.ts` or new scanner for missing connector secrets, failed delivery rate, stale digest, and notification backlog.
- Add server-side filtering for `channels_log` by category, source insight/report id, status, and date range.

## 9. Build slices
- Slice 1: typed rule builder in `app/routes/ChannelsPage.tsx`; backend validation in `server/api/channels.ts`.
- Slice 2: audit and delete/test endpoints; tests in `server/api/channels.test.ts`.
- Slice 3: job-backed brief send and retry integration with `/reports`.
- Slice 4: channel health detector and insight deep-links.
- Validation: `bun run typecheck`, channel API tests, dry-run brief smoke, mobile Playwright for rule editing.
- Documentation to update: notification policy runbook, digest delivery docs, `/root/DASHBOARD_V5_PLAN.md` Phase 13 status.

## 10. Verification
- Creating/updating/deleting a rule changes DB state and writes an audit row.
- Invalid rule input is blocked before save without raw JSON errors.
- Brief preview/send still works, writes `channels_log`, and records action audit.
- Failed connector/script delivery creates a severity-sorted insight with AI explanation.
- `/reports` digest scheduling and `/channels` delivery policy stay consistent.
- Every sent message can be traced to source finding/report, actor/rule, and delivery result.
- Mobile view supports creating and testing a rule without horizontal scroll.
