# TELEGRAM_REPLY_TEMPLATES.md

Purpose:
- give Mimule a consistent Telegram-native response system
- keep replies beautiful on mobile
- preserve working inline keyboard behavior

Non-negotiable:
- use native Telegram inline buttons when available
- keep buttons short
- keep `callback_data` short, stable, and action-like
- default to 2-4 buttons total
- if a task requires typed or pasted text, still end with native buttons

## Core Layout Rules
- lead with the answer, not a preamble
- keep body text to 1-4 short lines unless the user asked for detail
- prefer one strong primary row and one lighter secondary row
- avoid more than 2 rows unless there is a strong reason
- do not flood Telegram with giant menus
- if there is a clear next action, make it button 1

## Callback Rules
Preferred callback style:
- `brief`
- `health`
- `projects`
- `paperclip_backlog`
- `articles`
- `costs`
- `approve`
- `edit`
- `reject`
- `fix_now`
- `details`
- `custom_reply`
- `back_home`

Avoid:
- long natural-language callback strings
- random one-off callback names for the same action
- fake text buttons in the message body
- keep Paperclip action callbacks stable:
  - `paperclip_tasks`
  - `paperclip_approvals`
  - `pc_issue:<uuid>`
  - `pc_appr:<uuid>`
  - `pc_appr_ok:<uuid>`
  - `pc_appr_rev:<uuid>`
  - `pc_appr_no:<uuid>`

## Template 1 - Fresh Start
Use after `/start` or `/new`.

Message:
`Ready.`

Buttons:
- Row 1: `Backlog` -> `paperclip_backlog`, `Morning brief` -> `morning_brief`
- Row 2: `Health` -> `health`, `Custom reply` -> `custom_reply`

## Template 2 - General Answer
Use for most normal DM replies.

Message shape:
- line 1: direct answer
- line 2: optional next-step hint

Buttons:
- Row 1: `Got it` -> `got_it`, `More detail` -> `more_detail`
- Row 2: `Custom reply` -> `custom_reply`

## Template 3 - Status Or Health
Use after `health`, `brief`, or other ops checks.

Message shape:
- line 1: health verdict
- line 2: key issue or "No urgent issues."
- line 3: one cost or runtime signal if available

Buttons:
- Row 1: `Fix now` -> `fix_now`, `Full report` -> `full_report`
- Row 2: `Projects` -> `projects`, `Custom reply` -> `custom_reply`

Example:
`System looks stable.\nPaperclip and gateway are up.\nOne warning: NewsBites deploy path still needs hardening.`

## Template 4 - Project Navigation
Use when the user asks "what next", "where are we", or "show projects".

Message shape:
- line 1: current top priority
- line 2: next concrete task

Buttons:
- Row 1: `NewsBites` -> `newsbites`, `Mimule` -> `mimule`
- Row 2: `Paperclip` -> `paperclip`, `Back home` -> `back_home`

## Template 5 - Approval
Use for decisions, review, publishing, or risky changes.

Message shape:
- line 1: what is ready
- line 2: what approval means

Buttons:
- Row 1: `Approve` -> `approve`, `Edit` -> `edit`
- Row 2: `Reject` -> `reject`, `Details` -> `details`

## Template 6 - Copy-Paste Required
Use only when the user truly needs text to copy.

Message shape:
- line 1: one sentence explaining what the snippet is for
- line 2+: a compact fenced code block or a short plain-text snippet
- final line: one sentence with the expected result

Buttons:
- Row 1: `Shorter` -> `shorter`, `Explain` -> `explain`
- Row 2: `Run check` -> `run_check`, `Custom reply` -> `custom_reply`

Rule:
- do not replace buttons with "copy this" text
- still end with native buttons

## Template 7 - Error Or Partial Failure
Use when something failed but the session should keep moving.

Message shape:
- line 1: what failed
- line 2: best known cause
- line 3: next safe move

Buttons:
- Row 1: `Retry` -> `retry`, `Inspect` -> `inspect`
- Row 2: `Fallback` -> `fallback`, `Custom reply` -> `custom_reply`

## Template 8 - Morning Brief
Use for the daily operator summary.

Message shape:
- line 1: overall status
- line 2: top priority
- line 3: top risk
- line 4: cost or service note

Buttons:
- Row 1: `Top task` -> `top_task`, `Articles` -> `articles`
- Row 2: `Health` -> `health`, `Costs` -> `costs`

## Template 9 - Paperclip Action Needed
Use for automatic Telegram alerts when Paperclip needs Marouane to act.

Issue message shape:
- line 1: `Paperclip task needs you.`
- line 2: issue identifier and title
- line 3: status

Issue buttons:
- Row 1: `Tasks` -> `paperclip_tasks`, `Details` -> `pc_issue:<uuid>`
- Row 2: `Custom reply` -> `custom_reply`

Approval message shape:
- line 1: `Paperclip approval needs you.`
- line 2: approval type
- line 3: linked issue context when available

Approval buttons:
- Row 1: `Approvals` -> `paperclip_approvals`, `Details` -> `pc_appr:<uuid>`
- Row 2: `Custom reply` -> `custom_reply`

## Template 10 - Paperclip Task List
Use when callback data is `paperclip_tasks`.

Execution rule:
- run `sh /root/.openclaw/scripts/paperclip.sh telegram paperclip_tasks`
- parse the stdout JSON
- call the Telegram `message` tool with the exact `message` and `buttons`
- return `NO_REPLY`

Message shape:
- line 1: how many tasks need Marouane
- line 2+: up to 3 compact items with identifier, title, and status

Exact style:
- write the count once only
- do not prepend another alert sentence like `Paperclip task needs you.`
- do not repeat the same list twice
- do not append any approval text unless the callback was `paperclip_approvals`

Buttons:
- Row 1: first two task details when available using `pc_issue:<uuid>`
- Row 2: `Approvals` -> `paperclip_approvals`, `Back home` -> `back_home`

If no tasks:
- line 1: `No Paperclip tasks need you right now.`
- Row 1: `Approvals` -> `paperclip_approvals`, `Back home` -> `back_home`

## Template 11 - Paperclip Approval List
Use when callback data is `paperclip_approvals`.

Execution rule:
- run `sh /root/.openclaw/scripts/paperclip.sh telegram paperclip_approvals`
- parse the stdout JSON
- call the Telegram `message` tool with the exact `message` and `buttons`
- return `NO_REPLY`

Message shape:
- line 1: how many approvals need Marouane
- line 2+: up to 3 compact items with approval type and status

Exact style:
- write the count once only
- do not prepend `Paperclip approval needs you.` again inside this callback view
- do not repeat the same approval line twice
- each item should be compact:
  `• hire_agent: NewsBites Editor (pending)`
- if a detail button label is derived from the approval payload, prefer the shortest useful label, for example `Editor`

Buttons:
- Row 1: first two approval details when available using `pc_appr:<uuid>`
- Row 2: `Tasks` -> `paperclip_tasks`, `Back home` -> `back_home`

If no approvals:
- line 1: `No Paperclip approvals need you right now.`
- Row 1: `Tasks` -> `paperclip_tasks`, `Back home` -> `back_home`

## Template 12 - Paperclip Detail
Use when callback data starts with `pc_issue:` or `pc_appr:`.

Execution rule:
- run `sh /root/.openclaw/scripts/paperclip.sh telegram <callback>`
- parse the stdout JSON
- call the Telegram `message` tool with the exact `message` and `buttons`
- return `NO_REPLY`

Issue detail message shape:
- line 1: identifier and title
- line 2: status and priority
- line 3: latest comment or approval count if available

Issue detail buttons:
- Row 1: `Tasks` -> `paperclip_tasks`, `Approvals` -> `paperclip_approvals`
- Row 2: `Custom reply` -> `custom_reply`

Approval detail message shape:
- line 1: approval type, target name, and status
- line 2: the most important execution note only
- line 3: one risk or flag only if it matters

Approval detail exact style:
- for hire approval details, prefer:
  `Approval: hire_agent - <agent name> (pending)`
  `Notes: adapter=<adapter>, heartbeat <mode>, budget $<x>/mo.`
  optional third line only for a real risk such as dangerous bypass flags
- do not append task-list fallback text like `No Paperclip tasks need you right now.`
- do not prepend a fresh notification sentence like `Paperclip approval needs you.`
- keep it to 2-3 lines total before buttons

Approval detail buttons:
- Row 1: `Approve` -> `pc_appr_ok:<uuid>`, `Changes` -> `pc_appr_rev:<uuid>`
- Row 2: `Reject` -> `pc_appr_no:<uuid>`, `Back to approvals` -> `paperclip_approvals`
- Row 3: `Back home` -> `back_home`, `Custom reply` -> `custom_reply`

Approval action result rule:
- `pc_appr_ok:<uuid>`, `pc_appr_rev:<uuid>`, and `pc_appr_no:<uuid>` must each render one confirmation screen after the Paperclip mutation
- that confirmation screen must also be sent through the Telegram `message` tool, then `NO_REPLY`

## Template 13 - Paperclip Backlog Home
Use when callback data is `paperclip_backlog`.

Execution rule:
- run `sh /root/.openclaw/scripts/paperclip.sh telegram paperclip_backlog`
- parse the stdout JSON
- call the Telegram `message` tool with the exact `message` and `buttons`
- return `NO_REPLY`

Message shape:
- line 1: one-line Paperclip queue summary
- line 2: task count
- line 3: approval count

Exact style:
- do not expand into full task or approval lists in this view
- this is a navigation screen only

Buttons:
- Row 1: `Tasks` -> `paperclip_tasks`, `Approvals` -> `paperclip_approvals`
- Row 2: `Back home` -> `back_home`, `Custom reply` -> `custom_reply`

## Style Rules
- concise, calm, sharp
- no corporate filler
- no "standing by", "ready for directives", or fake ceremony
- no giant markdown decoration
- use plain text unless a short code block materially helps

## Safe Default Menus
If unsure, use one of these:

General:
- Row 1: `Got it` / `More detail`
- Row 2: `Custom reply`

Ops:
- Row 1: `Fix now` / `Full report`
- Row 2: `Back home`

Approval:
- Row 1: `Approve` / `Edit`
- Row 2: `Reject` / `Details`
