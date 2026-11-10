# novel-creation

Build reference-image video plans from v3 scripts. **No storyboard image generation or story rewriting.**

- JSON stores segments, cuts, real beat coverage, and asset references. Creative methods live in one local [guide](references/创作指南.md).
- Read opening/ending plans from the current outline or an independent script. Compute the end from actual script flow; never persist it. Optional openingBeat only mirrors an explicit upstream annotation.
- No strategy selection, hashes, or application step. A project has one natural-language creativeBrief.
- Preserve model duration limits, ordered reference identities, verbatim dialogue, and contiguous shot coverage. Suggested shot lengths are not universal hard limits.
- Chinese/English reports put storyboards first, then assets and current handoff relationships, timing, structural checks, and review status.
- Explicit v2 migration previews by default, retains original input and semantic review records, and refuses to overwrite output.

## Usage

[SKILL.md](SKILL.md) is the authoritative workflow and command reference, including all six local test entry points. See [schema](references/schema.md) and [migration](references/migration.md). Node 18+, standard library only. This directory works independently without sibling skill code or guides.

Production and unique upstream documents are discovered locally. Ambiguous, unreadable, or damaged inputs fail; missing upstream checks are honestly skipped. Media handoff protocols remain unchanged. Actual generation requires separate authorization and cost disclosure. Tests never call paid models.

## Owned example

The Book Buyer has one episode, four segments, nine cuts, and ten script beats: a 30-second target and a 32-second shot plan. It ends with a personal connection to a missing sister, not a successful search. This revision only migrates representation; it does not rewrite the story, dialogue, or shots. Existing images are reused as fixtures, not claimed as newly generated. See [example migration notes](examples/MIGRATION.md).

Generated HTML is rebuildable and not versioned. Structural validity does not prove creative quality or generated-video continuity.
