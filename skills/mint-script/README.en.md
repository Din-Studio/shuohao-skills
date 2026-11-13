[中文](README.md) · **English**

# mint-script 4.0

Each formal delivery contains three files: `xxx.json`, `xxx-report.md`, and `xxx-report.html`. Use the complete JSON filename without `.json` as the same `xxx` in all three names. Render both reports from that JSON and save them alongside it in the stage directory.

Parse an existing script into execution text, while retaining independent authoring. Distinguish action, spoken lines, subtitles, sound and non-speaking notes. No shot lists, generation prompts or paid calls. Natural-language requirements and the local [writing guide](references/创作指南.md) replace the profile framework.

## Contract

- Script uses schemaVersion:4 and consumes outline v5 only; production and creation use v3. With an outline, read current opening/ending plans upstream rather than storing copies. Standalone plans are optional.
- End coordinates are computed from the last flow item. openingBeat is optional; omission is never reported as a verified first-beat landing.
- Claim every upstream B ID, including unclassified events, in order with valid inclusive non-overlapping ranges. Standalone scripts without planned beats may omit claims.
- targetSeconds is optional during parsing, positive when present, and mandatory before production. Never infer it from outline. Approximate duration differences are warnings, not orders to remove valid performances.
- Parsed scripts carry provenance (raw-byte SHA256, relative source paths, owned inclusive line coverage) and exact sourceRefs on every flow item and note. Overlapping reads are unioned by position, never deduplicated by text.
- notes do not speak, estimate time or own beats. Flow has exactly one action/line/subtitle/sound. Audio semantics distinguish onscreen, offscreen, voiceover and inner speech.
- Explicit source verification reads original bytes; structural validation alone reports not-performed. Hashes and coordinates cannot prove semantic fidelity. Unapproved transformation candidates stay in .work.
- Neutral estimation defaults are 4.5 characters/second, 2.5 seconds/action and 0.15 tolerance. Persist only explicit overrides; rendering never inserts defaults.
- C/S/P strings are script-local references, never project identities. Only cast.characters and art.scenes/props own assets (explicit schemaVersion 1); outline owns story, B/Q nodes and evidence only.
- script.assetMappings is the sole mapping authority. Each record includes kind/localId/assetId/status/sourceRefs/basis/assetDigest/documentVersions. No same-name or same-ID fallback. Evidence must fit script coverage, target asset evidence and authority coverage; source snapshots must match. Only production dependencies require confirmed mappings. Other pending/conflict records stay visible.
- lighting and delivery are optional. Preserve silent characters in the scene cast.
- A project and local creativeBrief conflict requires manual merging, never implicit precedence.

## Commands and safety

Node 18+, standard library only. The authoritative command list, examples and all four test entrypoints are maintained in [README.md](README.md#命令入口), avoiding duplicate command documentation.

CLI commands: seed, validate, checkup, render, verify-sources and slug. --production-ready requires targets, verifies sources and requires explicit confirmed mappings for all current local references. --required-mappings FILE selects actual dependencies as [{kind,localId}]. Missing optional stages are skipped; supplied invalid stages fail. --verify-sources verifies bytes without requiring targets. CLI seed verifies outline sources; use --output-path to rebase provenance when saving stdout in a different directory. Project artifacts belong under script/. Explicit upstream files take precedence; otherwise discover a unique outline/art/cast. Multiple candidates, corrupt files, unsupported versions, invalid UTF-8 and dangling links fail rather than being treated as missing.

Production requires schemaVersion:3. --no-production disables project configuration discovery, not explicitly supplied or uniquely discovered outlines. It is mutually exclusive with --production.

Full workflow order is outline → characters → art → script → creation, with completed scoped handoffs before advancing. Project-level flow state is external orchestration, not a standalone skill dependency. --full-workflow requires the three upstream inputs but does not prove handoff order. Standalone runs remain supported and never claim full joint delivery.

## Reports and delivery

Offline bilingual HTML and Markdown put authored text first, followed by event locations, plans, optional questions, assets, line books, estimated timing and structural checks. Source references, provenance hashes, notes and audio semantics are visible; no empty policy configuration tables.

Responsive layout, coordinate links, copy controls, optional supplied voice prompts, print support and exact input JSON export remain available. Special delivery survives line-book export. Names and voice prompts require valid explicit mappings; unmapped references remain local IDs. Mapping status, evidence and digests are visible. Generated HTML is not versioned.

Missing upstream, warnings, incomplete skeletons and content-review-not-performed are distinct. Current JSON interface checks include known downstream creation v3 exact-once ordered flow ownership and optional opening locations. cuts[].audioRefs may continue a line owned by an earlier cut in the same episode, including across segments and scenes. They cannot replay, double-count, replace ownership, reference actions or refer forward. Every intervening cut from the owner through the last continuation must reference that occurrence; a gap cannot silently resume playback. Model limits, reference-image identity/order and content still require creation-stage validation.

## Own examples and tests

[The Umbrella Repair Ledger](examples/故事提案.md) retains its original story: three episodes, six scenes, thirty lines, with 60-second targets and estimates around 61.1 / 62.2 / 65.1 seconds. The second episode omits its optional opening landing. The first two endings close local tasks; the final ending stays open.

All fixtures are local to this skill. 修伞簿-script.json preserves independent authoring. 修伞簿-mapped-script.json separately extracts our own source with exact lines and mappings to intentionally different asset IDs. The outline fixture is story-only v5; cast/art fixtures are v1, with incompatible versions rejected. The screenshot is illustrative, not verification evidence. The separate [Night-shift Gauge](examples/夜班水尺-story.md) fixture supplies only episodes 7 and 9, silent cast, long non-speaking psychology, repeated actual dialogue, audio, sound and subtitles. It intentionally has no production targets and includes its own verifiable source file.

Four test entrypoints cover contracts, timing, references, reports, real CLI behavior, downstream boundaries and safe I/O. Isolated copying requires no sibling code or examples. No paid calls.

See [workflow](SKILL.md), [schema](references/schema.md), [writing guide](references/创作指南.md) and [report specification](references/report-style.md).
