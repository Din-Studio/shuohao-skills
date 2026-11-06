[中文](README.md) · **English**

# novel-outline v2

Turn a novel or an original proposal into a story promise, adaptation decisions, cast and assets, stable-ID beats, episode synopses, and computed asset inventories.

A stable workflow supports replaceable genre, narrative-style, structure and pacing references. Dense-payoff serials, gradual mysteries and measured episodic stories use the same schema and validator. Suspense endings, frequent payoffs and a triumphant finale are not universal requirements.

## Features

- Self-contained Node 18+ tools and local guides; no sibling-skill imports or example dependencies.
- Explicit schemaVersion 2; event/pressure/turn/payoff beats, suspense/closure/open endings and optional non-overlapping arcs.
- IDs, references, explicit question deadlines and unique later resolutions remain mandatory regardless of policy.
- off/warn/error policy levels; separate base, policy, source and content-review results.
- Explicit profile previews and application, complete-object overrides, backups and atomic writes. Validation and rendering never reapply templates.
- Retained adaptation evidence, cast tiers, configurable asset budgets, batches of at most 10 episodes and chapter/text chunking capped at 60 volumes.
- Offline Chinese/English HTML and Markdown, beat timeline/table, expandable episodes, dispatch matrix, and unchanged input JSON values for export.

## Commands

```bash
node scripts/novel-outline.mjs profiles
node scripts/novel-outline.mjs profile --selection selection.json
node scripts/novel-outline.mjs apply-profile outline.json --selection selection.json
node scripts/novel-outline.mjs apply-profile outline.json --selection selection.json --decisions decisions.json --confirm
node scripts/novel-outline.mjs validate outline.json --stage skeleton
node scripts/novel-outline.mjs validate outline.json --stage beats
node scripts/novel-outline.mjs validate outline.json
node scripts/novel-outline.mjs checkup outline.json --json
node scripts/novel-outline.mjs render outline.json --html --lang en > outline-report.html
node scripts/novel-outline.mjs render outline.json --md > outline.md
node scripts/novel-outline.mjs assets outline.json
node scripts/novel-outline.mjs chunk book.txt outline/.work --per-volume 15
node scripts/selftest.mjs
```

Use --production production.json instead of --selection in project mode. Validation and rendering discover production.json upwards or accept an explicit path. Language priority: CLI, document, project, Chinese. Deliverables belong under outline/; generated HTML is not versioned.

A policy switch rebuilds registered parameters without changing story, episode count, duration or budgets. The CLI rechecks the local document and known script/creation JSON interfaces: versions, selections, episodes, durations and claims. Invalid or stale downstream data causes a nonzero exit after application. Full downstream validation and semantic review remain unperformed; the application workflow is still incomplete. Same-version source drift requires restoration or a version upgrade, not acceptance of a new digest.

## Original example and migration

[Old Station Timetable](examples/旧站时刻-outline.json) is this skill's own story: a retiring station uncovers a missing arrival record and an older false attribution. Its [story proposal](examples/故事提案.md) precedes the beats. It includes no-payoff episodes, a non-final closure, a non-payoff final beat and a justified optional question.

Unversioned v1 input is rejected. The migration helper carries structure only; it does not infer beat semantics or mechanically rename old hooks. See [migration](references/migration.md), [schema/API](references/schema.md), [profile contract](references/profile-contract.md), [workflow](SKILL.md) and [review](references/review-core.md).

Warnings are not passes. Independent success is not joint delivery. Structural checks do not prove story quality, and asset estimates are not generated production results.
