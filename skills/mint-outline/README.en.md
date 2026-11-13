# mint-outline v5

Each formal delivery contains three files: `xxx.json`, `xxx-report.md`, and `xxx-report.html`. Use the complete JSON filename without `.json` as the same `xxx` in all three names. Render both reports from that JSON and save them alongside it in the stage directory.

Parse existing scripts into story facts only: summary, ordered beats, episodes, questions/answers, provenance and necessary continuity. No character/location/prop identities, asset budgets or dispatch. Never invent missing endings.

- [Workflow and commands](SKILL.md) · [Contract](references/schema.md)
- [Parsing guide](references/创作指南.md) · [Chunked reading](references/volume-pass.md)
- [Consumer/handoff matrix](references/handoff.md)
- Own [script](examples/旧站时刻-script.txt) and [v5 example](examples/旧站时刻-outline.json)

Node 18+, standard library only, independently portable. All commands accept schemaVersion 5 only; any other version fails. There is no migration or dual reading.

--verify-sources reads actual source bytes; otherwise source verification is skipped. Structural validation, semantic fidelity and production review are separate.

Run `node scripts/selftest.mjs` for all outline tests and isolated-copy regression. No paid models or generated HTML commits.
