# novel-creation

Build reference-image video plans from v3 scripts. **No storyboard image generation or story rewriting.** The main session only dispatches: a writer subagent produces cuts and prompts, a reviewer subagent reviews them, and the loop runs until every segment is approved before anything is written back, exported or handed off.

- JSON stores segments, cuts, real beat coverage, and asset references. Stage goals and boundaries are in the local [guide](references/创作指南.md); dispatch and loop rules are in the [dispatch manual](references/dispatch.md).
- One worksheet per segment at `<segment>/prompt.md`: status header, cut structure, review comments, writer response and prompt body. Approval is bound both to the segment's content and to the inputs it relies on (the text of the beats it claims, reference image contents, model and parameters, the project brief). A change to either invalidates that segment's approval and leaves other segments alone; unapproved segments cannot be exported or planned for generation.
- The writer and the reviewer each work in a subagent with its own context. They load `novel-video-prompt` and `novel-video-prompt-review` when those are installed; otherwise they read the byte-identical guide copies in this directory's `references/` and use `prompts new|submit|verdict`.
- Read opening/ending plans from the current outline or an independent script. Compute the end from actual script flow; never persist it. Optional openingBeat only mirrors an explicit upstream annotation.
- No strategy selection, hashes, or application step. A project has one natural-language creativeBrief.
- Preserve model duration limits, ordered reference identities, verbatim dialogue, and contiguous shot coverage. Suggested shot lengths are not universal hard limits.
- Chinese/English reports put storyboards first, then assets and current handoff relationships, timing, structural checks, and review status.
- Explicit v2 migration previews by default, retains original input and semantic review records, and refuses to overwrite output.

## Usage

[SKILL.md](SKILL.md) is the authoritative workflow and command reference, including all seven local test entry points. See [schema](references/schema.md) and [migration](references/migration.md). Node 18+, standard library only. This directory works on its own, without sibling skills.

Production and unique upstream documents are discovered locally. Ambiguous, unreadable, or damaged inputs fail; missing upstream checks are honestly skipped. Media handoff protocols remain unchanged. Actual generation requires separate authorization and cost disclosure. Tests never call paid models.

## Owned example

The Book Buyer has one episode, four segments, nine cuts, and ten script beats: a 30-second target and a 32-second shot plan. It ends with a personal connection to a missing sister, not a successful search. This revision only migrates representation; it does not rewrite the story, dialogue, or shots. Existing images are reused as fixtures, not claimed as newly generated. The example predates the review workflow and ships without worksheets, so it cannot be exported directly; the tests cover the full flow in a temporary directory. See [example migration notes](examples/MIGRATION.md).

Generated HTML is rebuildable and not versioned. Structural validity does not prove creative quality or generated-video continuity.
