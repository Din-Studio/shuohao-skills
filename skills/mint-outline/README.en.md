# mint-outline v4

Parse existing scripts only. Novels, outlines and original-authoring requests are not accepted. Preserve source versions, line ranges, coverage, object identities, important events and necessary continuity facts. Do not invent an ending or production duration.

- [Workflow and commands](SKILL.md) · [Parsing guide](references/创作指南.md)
- [Data contract](references/schema.md) · [Chunked reading](references/volume-pass.md) · [Explicit migration](references/migration.md)
- Own [script](examples/旧站时刻-script.txt) and [parsed example](examples/旧站时刻-outline.json)

Node 18+, standard library only, independently portable. Schema version 4 permits partial sources and unanswered questions. --verify-sources reads actual source bytes; default validation checks in-memory structure only. Source identity verification, semantic fidelity review and production review are separate. Explicit budgets block; reference values only warn.

Run scripts/selftest.mjs with node (includes other tests and isolated-copy regression), or run scripts/fixes-selftest.mjs, scripts/migration-selftest.mjs and scripts/fusion-selftest.mjs separately. No paid models or generated HTML commits.
