# novel-creation

Build reference-image video plans from v3 scripts. **No storyboard image generation or story rewriting.** The main session only dispatches: a writer subagent produces cuts and prompts, a reviewer subagent reviews them, and the loop runs until every segment is approved before anything is written back, exported or handed off.

- JSON stores segments, cuts, real beat coverage, and asset references. Stage goals and boundaries are in the local [guide](references/创作指南.md); dispatch and loop rules are in the [dispatch manual](references/dispatch.md).
- One worksheet per segment at `<segment>/prompt.md`: status header, cut structure, review comments, writer response and prompt body. Approval is bound to a content hash and is invalidated by any later edit; unapproved segments cannot be exported or planned for generation.
- Prompt writing and review are delegated to the separately installed `novel-video-prompt` and `novel-video-prompt-review`. This skill keeps no copy of their guides.
- Read opening/ending plans from the current outline or an independent script. Compute the end from actual script flow; never persist it. Optional openingBeat only mirrors an explicit upstream annotation.
- No strategy selection, hashes, or application step. A project has one natural-language creativeBrief.
- Preserve model duration limits, ordered reference identities, verbatim dialogue, and contiguous shot coverage. Suggested shot lengths are not universal hard limits.
- Chinese/English reports put storyboards first, then assets and current handoff relationships, timing, structural checks, and review status.
- Explicit v2 migration previews by default, retains original input and semantic review records, and refuses to overwrite output.

## Usage

[SKILL.md](SKILL.md) is the authoritative workflow and command reference, including all seven local test entry points. See [schema](references/schema.md) and [migration](references/migration.md). Node 18+, standard library only. Structural checks, reports, export and handoff plans work from this directory alone; writing and review require the two sibling skills above, and the workflow stops with an install hint when they are missing.

Production and unique upstream documents are discovered locally. Ambiguous, unreadable, or damaged inputs fail; missing upstream checks are honestly skipped. Media handoff protocols remain unchanged. Actual generation requires separate authorization and cost disclosure. Tests never call paid models.

## Owned example

The Book Buyer has one episode, four segments, nine cuts, and ten script beats: a 30-second target and a 32-second shot plan. It ends with a personal connection to a missing sister, not a successful search. This revision only migrates representation; it does not rewrite the story, dialogue, or shots. Existing images are reused as fixtures, not claimed as newly generated. The example predates the review workflow and ships without worksheets, so it cannot be exported directly; the tests cover the full flow in a temporary directory. See [example migration notes](examples/MIGRATION.md).

Generated HTML is rebuildable and not versioned. Structural validity does not prove creative quality or generated-video continuity.
