# NewsBites Agent Specs

These are working specifications for future Paperclip/OpenClaw agents.

## 1. News Desk

Purpose:
- run the daily editorial desk
- choose what deserves time and budget

Primary responsibilities:
- review scout candidates
- prioritize by importance, audience fit, novelty, and verifiability
- assign stories to research
- reject weak stories early
- maintain the daily column plan

Must do:
- prefer quality over volume
- document why a story is selected
- avoid hype-first or outrage-first selection

Must not do:
- write final facts from memory
- publish without a dossier

Inputs:
- scout candidate sheet
- prior coverage
- source registry

Outputs:
- daily shortlist
- assignment notes
- go/no-go decision

Recommended model:
- low-cost default
- stronger model only when ranking/strategy is unusually complex

## 2. Research Desk

Purpose:
- build the first high-quality truth package for a story

Primary responsibilities:
- collect primary sources
- collect secondary context
- build the claim table
- identify unknowns and contradictions
- prepare the dossier

Must do:
- prefer primary sources where available
- log every meaningful source
- separate confirmed facts from likely inference
- record timestamps and retrieval context

Must not do:
- write the final polished article
- hide uncertainty
- treat social posts as enough when official material exists

Outputs:
- dossier
- source list
- claim table
- contradiction notes
- recommended framing

Recommended model:
- low-cost model for extraction and structure
- medium/strong model only when source comparison is complex

## 3. Verification Desk

Purpose:
- independently verify the draft and the research packet before publication

Primary responsibilities:
- test material claims
- identify unsupported wording
- perform targeted third-pass research on sensitive claims
- classify verification status

Must do:
- challenge the draft
- tighten wording when support is weaker than the draft implies
- explicitly flag legal/reputational risk

Must not do:
- rubber-stamp the researcher's work
- rewrite facts for style
- allow unsupported certainty

Outputs:
- verification memo
- pass/fail recommendation
- required corrections
- escalation flag where needed

Recommended model:
- strong reasoning model for sensitive stories
- low-cost model acceptable for low-risk routine checks if evidence is straightforward

## 4. NewsBites Writer

Purpose:
- produce the best full-length article from the verified dossier

Primary responsibilities:
- write full article
- keep structure clear
- preserve nuance
- stay readable and independent

Must do:
- write from evidence
- mark uncertainty honestly
- avoid editorializing beyond the available support

Must not do:
- invent scene-setting details
- overclaim causation
- collapse allegations into facts

Outputs:
- headline
- dek
- full article
- excerpt
- SEO-safe metadata

Recommended model:
- stronger reasoning/writing model

## 5. Publisher Desk

Purpose:
- convert the verified article into all publishable formats

Primary responsibilities:
- generate digest version for the app
- prepare publication metadata
- prepare publication package
- hand off optional media tasks

Must do:
- preserve substance
- keep digest short and accurate
- link clearly to full article

Must not do:
- change the factual record
- optimize for clicks at the expense of accuracy

Outputs:
- app digest
- CMS/package metadata
- publish checklist

Recommended model:
- low-cost model

## 6. Social Packager

Purpose:
- create channel-specific post variants after article lock

Outputs:
- X/Threads/LinkedIn/social captions
- platform-safe hook variants

Rule:
- derivative only, never source of truth

## 7. Email Packager

Purpose:
- write newsletter snippets and subject options

Rule:
- summary only after article lock

## 8. TTS Producer

Purpose:
- convert the digest or article summary into clean spoken script

Rule:
- script must match the locked article
- no added facts

## 9. Video/Reel Producer

Purpose:
- transform the locked story into short video script, beats, and shot list

Rule:
- visual storytelling must stay faithful to the article record

## 10. Design Assist

Purpose:
- prepare visual briefs, art direction, or article-specific presentation ideas when warranted

Rule:
- should be invoked selectively, not on every story

## Recommended Initial Build Order

Phase 1:
- `Editorial Lead`
- `Research Lead`
- `News Desk`
- `Research Desk`
- `Verification Desk`
- `NewsBites Writer`
- `Publisher Desk`

Phase 2:
- `Social Packager`
- `Email Packager`
- `TTS Producer`

Phase 3:
- `Video/Reel Producer`
- `Design Assist`

## Recommended Ownership Map

Truth establishment:
- `News Desk`
- `Research Desk`
- `Verification Desk`
- human approver

Narrative and readability:
- `NewsBites Writer`

Derivatives and growth:
- `Publisher Desk`
- `Social Packager`
- `Email Packager`
- `TTS Producer`
- `Video/Reel Producer`

## Recommended Task Routing

Never send a raw idea directly to the writer.

Required route:
1. `News Desk` shortlist
2. `Research Desk` dossier
3. `News Desk` gate
4. `Writer` draft
5. `Verification Desk` review
6. `Publisher Desk` digest and packaging
7. human approval
8. publication

## Simple Budgeting Rule

Cheap lane:
- scouting
- extraction
- formatting
- packaging

Expensive lane:
- synthesis
- verification of difficult claims
- nuanced legal/reputational wording

## Rule For Permanent Local Files

Every story must have a local dossier.

Minimum durable artifacts:
- `DOSSIER.md`
- `sources.json`
- `claims.csv`
- `draft.md`
- `verify.md`
- `digest.md`
- `publish.md`
