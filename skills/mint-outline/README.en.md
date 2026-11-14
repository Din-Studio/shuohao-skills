# mint-outline v5

Each formal delivery contains three files: `xxx.json`, `xxx-report.md`, and `xxx-report.html`. Use the complete JSON filename without `.json` as the same `xxx` in all three names. Render both reports from that JSON and save them alongside it in the stage directory.

Parse existing scripts into story facts only: summary, ordered beats, episodes, questions/answers, provenance and necessary continuity. No character/location/prop identities, asset budgets or dispatch. Never invent missing endings.

- [Workflow and commands](SKILL.md) · [Contract](references/schema.md)
- [Parsing guide](references/创作指南.md) · [Chunked reading](references/volume-pass.md) · [Parallel episode dispatch](references/dispatch.md)
- [Consumer/handoff matrix](references/handoff.md)
- Own [script](examples/旧站时刻-script.txt) and [v5 example](examples/旧站时刻-outline.json)

Node 18+, standard library only, independently portable. All commands accept schemaVersion 5 only; any other version fails. There is no migration or dual reading.

All parsing and revisions require independent subagents. The main session never reads raw scripts; there is no small-input or same-session fallback. Each invocation may access raw text from at most 4 distinct episodes, including context, search hits and targeted rereads. Split inputs of 2 or more episodes into at least 2 concurrent batches. A single episode still uses an independent reader and subsequent independent reviewer. Global stitching primarily uses extracted results and may read scripts from specific episodes when needed, with the same cumulative 4-episode limit per invocation. Evidence needs beyond that limit go to separate agents.

For per-episode Markdown folders, first-time generation follows source-folder → plan-batches → parallel readers → merge → stitching → review → publish. plan-batches splits 60 episodes into 15 batches; merge rejects fragments exceeding 4 episodes. Existing outlines use parallel targeted revisions and review without renumbering B/Q IDs or rerunning merge. Multi-episode files use exact source line ranges. There is still one formal outline. See the dispatch guide for runtime discipline and the limits of CLI enforcement.

--verify-sources reads actual source bytes; otherwise source verification is skipped. Structural validation, semantic fidelity and production review are separate.

Run `node scripts/selftest.mjs` for all outline tests and isolated-copy regression. No paid models or generated HTML commits.
