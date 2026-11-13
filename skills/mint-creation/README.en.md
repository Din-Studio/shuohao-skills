# mint-creation

Build reference-sheet-to-video plans from v3 scripts without intermediate storyboard images or upstream story rewriting. The main session orchestrates a writer workflow, deterministic prompts check and independent reviewer workflow, then applies, exports and hands off only approved segments.

- JSON stores segments, cuts, real beat coverage, and asset references. Stage goals and boundaries are in the local [guide](references/创作指南.md); dispatch and loop rules are in the [dispatch manual](references/dispatch.md).
- One worksheet per segment at `<segment>/prompt.md`: status header, cut structure, review comments, writer response and prompt body. Approval is bound both to the segment's content and to the inputs it relies on (the text of the beats it claims, reference image contents, model and parameters, the project brief). A change to either invalidates that segment's approval and leaves other segments alone; unapproved segments cannot be exported or planned for generation.
- Dispatch through `workflow({name:"mint_prompt",args:{role:"mint-video-prompt-writer",task:"<complete brief>"}})` or role mint-video-prompt-reviewer. Supply absolute packaged guide paths and workspace-relative inputs. Foreground isolated Pi sessions share host model/authentication and cannot delegate. The main session uses mint_skill between roles; stop after three unapproved submissions or two identical structural failures. workflow_control accepts status/cancel with runId; after interruption inspect worksheets and finish only the unfinished phase.
- Read opening/ending plans from the current outline or an independent script. Compute the end from actual script flow; never persist it. Optional openingBeat only mirrors an explicit upstream annotation.
- No strategy selection, hashes, or application step. A project has one natural-language creativeBrief.
- Preserve model duration limits, ordered reference identities, verbatim dialogue, and contiguous shot coverage. Suggested shot lengths are not universal hard limits.
- Chinese/English reports put storyboards first, then assets and current handoff relationships, timing, structural checks, and review status.
- Explicit v2 migration previews by default, retains original input and semantic review records, and refuses to overwrite output.

## Usage

See [SKILL.md](SKILL.md) for mint_skill calls and developer-only self-tests, [schema](references/schema.md) for data and [migration](references/migration.md) for old inputs. Deterministic scripts remain standard-library-only and self-contained. The products/mint-drama package supplies both roles and guides.

Production and unique upstream files are discovered locally; ambiguous, damaged or unreadable inputs fail, and missing upstream checks are skipped explicitly. Authorized generation uses the host canvas_cli with cost disclosure, saved input hashes and task/output identities; see [canvas handoff](references/media-handoff.md). Tests do not establish real cloud generation.

## Owned example

The Book Buyer has one episode, four segments, nine cuts, and ten script beats: a 30-second target and a 32-second shot plan. It ends with a personal connection to a missing sister, not a successful search. This revision only migrates representation; it does not rewrite the story, dialogue, or shots. Existing images are reused as fixtures, not claimed as newly generated. The example predates the review workflow and ships without worksheets, so it cannot be exported directly; the tests cover the full flow in a temporary directory. See [example migration notes](examples/MIGRATION.md).

Generated HTML is rebuildable and not versioned. Structural validity does not prove creative quality or generated-video continuity.
