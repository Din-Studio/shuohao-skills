[中文](README.md) · **English**

# novel-script 2.0

Turn story plans into scenes and structured dialogue. No shot lists, images or generation prompts. Genre, narrative style, structure and pacing are explicit local profile choices, not universal cold-open or cliffhanger requirements.

## v2 contract

- Explicit `schemaVersion: 2`. Legacy data is rejected; follow the local [migration guide](references/migration.md).
- Neutral `opening/openingBeat/ending/endBeat`.
- Seed copies opening and ending.mode/event exactly. It never copies Q plans. Scenes stay empty and all unwritten positions stay null.
- `beatClaims` identifies every upstream B ID, in outline order, with inclusive, valid, non-overlapping core ranges. Cross-scene ranges and shared setup outside the ranges are supported.
- With an outline, episode identity, projected intent and `targetSeconds = minutesPerEpisode × 60` are reconciled again. Timing tolerance cannot relax that equality.
- Every beat, opening, claim and ending uses one unrounded cumulative estimate. Display rounding does not affect validation. Estimates are not measured performances.

## Profiles and checks

Local JSON/Markdown profiles are discovered by scanning. No genre-ID branches. Only explicit application changes effective parameters; validation and rendering never reapply templates.

`params.rules.openingWindow` and `lineLength` support off/warn/error. Off objects contain only level. A warning is a failed policy check, not a pass, but does not block. Base contract failures and error-level policy failures block. Profiles cannot disable identity, reference, coordinate or upstream-target checks.

Checks expose pass/fail/skipped, not ok. Missing upstream, disabled policies and incomplete stages stay distinct. Historical source drift is reported without rewriting parameters or hashes. Content review is separate and never fabricated by the renderer.

## CLI

Node 18+, standard library only.

```bash
node scripts/novel-script.mjs profiles
node scripts/novel-script.mjs profile --selection examples/selection.json
node scripts/novel-script.mjs seed examples/修伞簿-outline.fixture.json --eps 1-3
node scripts/novel-script.mjs validate examples/修伞簿-script.json \
  --outline examples/修伞簿-outline.fixture.json --art examples/修伞簿-art.fixture.json
node scripts/novel-script.mjs checkup examples/修伞簿-script.json --json
node scripts/novel-script.mjs render examples/修伞簿-script.json --html --lang en \
  --outline examples/修伞簿-outline.fixture.json --art examples/修伞簿-art.fixture.json \
  --cast examples/修伞簿-cast.fixture.json > /tmp/script-report.html
```

Production artifacts belong in `<workdir>/script/`, with production.json at the project root. The bundled production fixture is test input, not a deployed project root.

```bash
node scripts/novel-script.mjs apply-profile <workdir>/script/story-script.json --production <workdir>/production.json
node scripts/novel-script.mjs apply-profile <workdir>/script/story-script.json --production <workdir>/production.json --decisions decisions.json --confirm
```

Review differences and unresolved decisions first. Decisions use full rule paths and keep/drop values. Overrides contain full rule objects. Confirmation backs up and atomically writes the artifact, then checks the current script. It does not rewrite the story. Recheck known downstream creation artifacts separately.

Standalone application uses `--selection selection.json` instead of production. Skeleton checks use `--stage skeleton`; success is not full delivery. Missing outline/art skips only dependent reconciliation. Supplied corrupt or unreadable files fail.

## Reports

Offline HTML and Markdown show the audience promise, selection snapshot, effective parameters, overrides, sources, actual script, per-beat estimated timeline, upstream setup/outcome beside claimed text, Q answer locations, assets and line books.

HTML includes Chinese/English UI, responsive layout, collapsible scripts, coordinate links, copy buttons, optional supplied voice prompts and print support. Authored content and diagnostics keep their original language. JSON export preserves the input without inserting defaults or review claims. Generated HTML is not versioned.

## Own story and tests

[The Umbrella Repair Ledger](examples/故事提案.md) follows a repairer who recognizes a familiar knot but chooses consent-based conversation rather than claiming kinship from a pattern. Three episodes, six scenes, thirty lines. Targets are 60 seconds each; estimates are approximately 61.1 / 62.2 / 65.1 seconds. The first two episodes have no payoff beats and close their local tasks; the final ending stays open.

All outline/art/cast/production fixtures are authored locally. No sibling samples or runtime imports. The old screenshot is not v2 verification evidence.

```bash
node scripts/selftest.mjs
node scripts/profile-selftest.mjs
```

Tests cover strict projection, claim failures, opening/ending coordinates, exact target reconciliation, rule severity, standalone mode, three profile combinations, source inspection, bilingual reports, export safety, real CLI exit codes and isolated copying. No paid calls or real image/video generation.

See [SKILL.md](SKILL.md), [schema](references/schema.md) and [content review](references/review-core.md).
