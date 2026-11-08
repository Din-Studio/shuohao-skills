# novel-creation

Build reference-image video plans from v2 scripts. **No storyboard image generation; no story rewriting.**

- Model capabilities limit generation segments. Creative profiles guide shot expression separately.
- `params.rules.cutDuration` supports off/warn/error. There is no universal 2–5 second hard gate.
- Consume opening, ending, openingBeat, endBeat and outline beat IDs. Preserve closure and open endings.
- Report base failures, policy warnings, disabled checks, missing upstream and unperformed content review separately.
- Preserve reference mounts, model prompt contracts, bilingual reports, original JSON export and offline generation plans. Use the independently installed ly-video skill for actual generation; see [handoff](references/media-handoff.md).

See [SKILL.md](SKILL.md), [schema](references/schema.md), [profile contract](references/profile-contract.md), and [migration](references/migration.md). Node 18+, standard library only. Copy this skill independently; no sibling skill code or references are required.

```bash
node scripts/novel-creation.mjs profiles
node scripts/novel-creation.mjs profile --production examples/production.json
node scripts/selftest.mjs
node scripts/strategy-selftest.mjs
node scripts/profile-selftest.mjs
node scripts/fixes-selftest.mjs
```

Seed a document, then explicitly apply profiles. Preview changes and decide existing overrides before confirming a backed-up atomic write. Validation and rendering never reapply templates. Read model and creative guides separately. Actual generation requires authorization and cost disclosure; tests do not call models.

The original local sample, The Book Collector (收书人), has one episode, four segments, nine cuts and ten script beats. Its target is 30 seconds and its shot plan is 32 seconds. A spoken confirmation added after content review makes the sisters' connection audible. Its open ending confirms a book's connection to a missing sister, not a reunion. See [fixture migration notes](examples/MIGRATION.md). Existing reference images are test assets, not results generated during this change.

Rendered HTML is reproducible and excluded from version control. No cumulative gate-failure logging or statistics feature is added.
