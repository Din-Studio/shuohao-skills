[中文](README.md) · **English**

# novel-script 3.0

Write scenes, actions and structured dialogue. No shot lists, generation prompts or paid calls. Natural-language requirements and the local [writing guide](references/创作指南.md) replace the profile framework.

## Contract

- Explicit schemaVersion:3. With an outline, read current opening/ending plans upstream rather than storing copies. Standalone plans are optional.
- End coordinates are computed from the last flow item. openingBeat is optional; omission is never reported as a verified first-beat landing.
- Claim every upstream B ID, including unclassified events, in order with valid inclusive non-overlapping ranges. Standalone scripts without planned beats may omit claims.
- targetSeconds strictly matches the outline target. Approximate duration differences are warnings, not orders to remove valid performances.
- Neutral estimation defaults are 4.5 characters/second, 2.5 seconds/action and 0.15 tolerance. Persist only explicit overrides; rendering never inserts defaults.
- lighting and delivery are optional. Preserve silent characters in the scene cast.
- A project and local creativeBrief conflict requires manual merging, never implicit precedence.

## Commands and safety

Node 18+, standard library only. The authoritative command list, examples and all three test entrypoints are maintained in [README.md](README.md#命令入口), avoiding duplicate command documentation.

CLI commands: seed, validate, checkup, render, migrate-v3 and slug. Project artifacts belong under script/. Explicit upstream files take precedence; otherwise discover a unique outline/art/cast. Multiple candidates, corrupt files, unsupported versions, invalid UTF-8 and dangling links fail rather than being treated as missing.

Production requires schemaVersion:3. --no-production disables project configuration discovery, not explicitly supplied or uniquely discovered outlines. It is mutually exclusive with --production.

migrate-v3 INPUT previews by default. --out OUTPUT writes new files only; pending semantic decisions require --confirm. Source bytes remain unchanged, with an exact backup and migration work record. Existing output/backup/record paths are refused. Confirmation cannot bypass structural errors. See [migration](references/migration.md).

## Reports and delivery

Offline bilingual HTML and Markdown put authored text first, followed by event locations, plans, optional questions, assets, line books, estimated timing and structural checks. No selection snapshots, source hashes or empty configuration tables.

Responsive layout, coordinate links, copy controls, optional supplied voice prompts, print support and exact input JSON export remain available. Special delivery survives line-book export. Generated HTML is not versioned.

Missing upstream, warnings, incomplete skeletons and content-review-not-performed are distinct. Current JSON interface checks include known downstream creation v3 flow coverage and optional opening locations. Model limits, reference-image identity/order and content still require creation-stage validation.

## Own examples and tests

[The Umbrella Repair Ledger](examples/故事提案.md) retains its original story: three episodes, six scenes, thirty lines, with 60-second targets and estimates around 61.1 / 62.2 / 65.1 seconds. The second episode omits its optional opening landing. The first two endings close local tasks; the final ending stays open.

All fixtures are local to this skill. A historical v2 input is isolated under scripts/fixtures/ exclusively for migration tests. The retired screenshot is not v3 verification evidence.

Three test entrypoints cover contracts, timing, references, reports, real CLI behavior, downstream boundaries, migration and safe I/O. Isolated copying requires no sibling code or examples. No paid calls.

See [workflow](SKILL.md), [schema](references/schema.md), [writing guide](references/创作指南.md) and [report specification](references/report-style.md).
