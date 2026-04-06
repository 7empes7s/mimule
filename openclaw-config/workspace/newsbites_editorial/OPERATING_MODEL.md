# NewsBites Operating Model

## Goal

Run a quality-first, cost-effective digital newsroom where:
- the main site behaves like a normal editorial publication
- the app delivers highly digestible summaries with a clear path to the full article
- every published story has a durable evidence file on disk
- AI accelerates research, writing, packaging, and publishing without becoming an unaccountable black box

## Core Position

Do not build a flat swarm of equal agents.

Build a controlled desk:
- `Editorial Desk`
- `Research Desk`
- `Verification Desk`
- `Writer`
- `Publisher`

Trigger specialists only when needed:
- `Social Packager`
- `Email Packager`
- `TTS Producer`
- `Video/Reel Producer`
- `Design Assist`

## Why This Shape Wins

Advantages:
- cheaper than many always-on agents
- cleaner ownership at each stage
- better auditability
- easier to debug when an article is wrong
- easier to impose press-law and corrections discipline

Failure mode avoided:
- when too many agents work in parallel too early, you get redundant research, weak accountability, and expensive noise

## Product Logic

### Main Site
- standard news homepage
- category navigation
- article pages
- editorial presentation

### App
- a short-form digest layer
- each item should explain the news in a few sentences
- each item must link to the full article
- the app summary should be generated after the full article is verified, not before

## Publishing Flow

### Stage 0 - Source Registry

Maintain a durable source registry for each beat:
- official institutions
- regulators
- company IR/newsrooms
- court filings
- public statements
- reputable reporters/publications
- domain trust notes

Output:
- beat-specific source lists on disk

### Stage 1 - Scout Run

Cadence:
- periodic, lightweight

Inputs:
- RSS
- trusted publications
- official sites
- company blogs
- regulatory feeds
- economic calendars where relevant

Output:
- a ranked candidate sheet by vertical

Rules:
- prefer breadth and signal extraction
- do not draft articles here
- kill obviously weak or unverifiable items immediately

### Stage 2 - Assignment Desk

The desk selects the shortlist.

Selection score:
- importance
- relevance to audience
- novelty
- verifiability
- time sensitivity
- legal/reputational risk
- production cost

Decision:
- `kill`
- `watch`
- `research now`

### Stage 3 - Research Dossier v1

Owner:
- `Research Desk`

Requirements:
- primary sources first
- secondary context second
- no unsupported synthesis

Deliverables:
- story angle
- source list
- claim table
- unresolved questions
- contradiction notes
- recommended framing

Storage:
- create one dossier folder per story
- use the dossier template in this directory

### Stage 4 - Editorial Review Gate

The editor decides:
- whether the evidence is sufficient
- whether the angle is fair
- whether the story is worth full drafting

No draft proceeds without this gate.

### Stage 5 - Full Article Draft

Owner:
- `Writer`

Rules:
- write only from the dossier
- mark uncertainty explicitly
- do not add colorful unsupported claims
- keep the tone clean, independent, and intelligible

Deliverables:
- headline
- dek
- full article
- excerpt
- metadata

### Stage 6 - Verification Pass

Owner:
- `Verification Desk`

Method:
- independently test material claims against the dossier and fresh sources
- run a third-pass spot check on the most sensitive claims

Result labels:
- `verified`
- `supported but cautiously worded`
- `unsupported`
- `contradicted`
- `needs escalation`

This is where your idea of a third research pass belongs:
- not as a duplicate full researcher every day
- as a verifier escalation on stories that survived drafting

### Stage 7 - Lock The Record

After verification:
- the full article becomes the canonical record
- the digest, socials, email, TTS, and video scripts derive from that locked record

This prevents version drift.

### Stage 8 - Derivative Packaging

Outputs:
- digest card copy for the app
- social post variants
- email summary
- TTS script
- optional short video/reel script
- optional art direction or visual brief

Rule:
- derivative outputs may simplify
- derivative outputs may not change the verified substance

### Stage 9 - Human Approval

For the first operating phase:
- human approval required on every story

Later:
- move low-risk stories to spot-check approval only after enough high-quality repetitions

### Stage 10 - Publish, Archive, Correct

After publication:
- archive dossier
- archive published copy
- track corrections
- log follow-up opportunities

## Recommended Cadence

Daily:
- scout
- shortlist
- research 2 to 5 viable items
- publish 1 to 2 strong pieces

Do not start with volume goals that force weak verification.

## Recommended Local File Structure

Suggested durable editorial structure:

```text
/opt/mimoun/openclaw-config/workspace/newsbites_editorial/
  source_registry/
  dossiers/
    YYYY-MM-DD/
      <slug>/
        DOSSIER.md
        sources.json
        claims.csv
        notes.md
        draft.md
        verify.md
        digest.md
        publish.md
  policies/
  prompts/
```

## Approval Strategy

For the first 20 articles:
- human approves every article
- keep all dossiers
- note what changed in approval

For the next 20:
- human approves only after verification lock
- begin measuring where agents are still weak

Only after this:
- consider partial automation for low-risk stories

## Cost Model

Default philosophy:
- cheap models for collection, extraction, formatting, transforms
- stronger models for synthesis and tricky wording

Strong recommendation:
- keep one persistent orchestrator
- do not keep many idle premium agents alive
- trigger specialists per story package only when required

## Recommended Initial Roster

Persistent:
- `News Desk`
- `Research Desk`
- `Verification Desk`
- `NewsBites Writer`
- `Publisher Desk`

On-demand:
- `Social Packager`
- `Email Packager`
- `TTS Producer`
- `Video/Reel Producer`
- `Design Assist`

## Recommended Escalation Rules

High-risk stories require extra review if they involve:
- crime or alleged misconduct
- fraud or corruption claims
- health or medical advice
- minors
- markets/financial claims that could be construed as advice
- private individuals
- breaking news with unclear provenance

If a story hits one of these:
- require stronger source support
- require tighter wording
- require human review before publication

## Recommendation On Your Proposed Workflow

Your concept is directionally correct.

What I would change:
- merge the early reviewer, marketing, and board layer into one `Editorial Desk` before publication
- keep marketing/social/design after verification, not before
- use the fact-checker as the independent second pass plus targeted third-pass research, instead of running two broad research agents by default
- keep permanent local evidence files mandatory
- treat digest generation as a downstream packaging step, not a parallel editorial truth source

That preserves quality and significantly reduces waste.
