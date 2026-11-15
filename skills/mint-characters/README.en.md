[中文](README.md) · **English**

# mint-characters

Each formal delivery uses three fixed filenames: `cast.json`, `cast-report.md`, and `cast-report.html`. Render both reports from `cast.json` and save all three files in the project's `characters/` directory.

Independently read an original script and maintain character identities. The formal artifact is **cast v1** (`schemaVersion: 1`, `kind: mint-characters`). Optional **outline v5** supplies story background, never character authority. Optional production configuration is v3. Any other version, unversioned object or bare array fails.

Copy this entire directory into your agent's skills directory. Node 18+, standard library only. No other skill is required.

```bash
node scripts/mint-characters.mjs seed --source book.txt --title Title --budget 30 --out draft.json
# Independent subagents extract batches in parallel; one assembler unifies the draft; new reviewers check batches in parallel.
node scripts/mint-characters.mjs reconcile draft.json --out cast.json
node scripts/mint-characters.mjs validate cast.json
node scripts/mint-characters.mjs render cast.json --md > cast-report.md
node scripts/mint-characters.mjs render cast.json --html > cast-report.html
```

Seed creates a skeleton, not semantic extraction or read coverage. Same-name people, aliases, silent characters, anonymous voices, unknown speakers, nonhuman subjects and mentioned people remain distinct when evidence does not establish sameness. Profiles, voice designs and image designs are independently optional. Explicit character budgets block this stage when exceeded.

A folder of per-episode Markdown scripts can be registered directly. Document IDs are `D` plus the episode number, matching outline:

```bash
node scripts/mint-characters.mjs seed --source-dir episodes/ --title Title --out characters/.work/draft-00.json
node scripts/mint-characters.mjs apply-designs cast.json .work/designs/*.json
```

For all source identification and incremental revisions, follow the [dispatch guide](references/dispatch.md): independent subagents extract batches in parallel, one assembler unifies the draft, and independent reviewers check complete batches in parallel. The main session does not read source text. Each call may access at most 4 source episodes in total, including searches, backstory and targeted rereads. Two or more episodes require at least two batches; a single episode uses parallel focus areas. Stop if independent dispatch is unavailable; never fall back to a shared reading context. The assembler primarily reads extracted results and rereads only specific evidence within the same limit. Design groups run independently in parallel and `apply-designs` validates and writes them together. The CLI neither launches agents nor audits tool history; structural coverage is not semantic approval.

Incremental updates use the existing artifact:

```bash
node scripts/mint-characters.mjs reconcile candidate.json --previous cast.json --changes changes.json --out next-cast.json
node scripts/mint-characters.mjs validate next-cast.json --previous cast.json
```

Reordering preserves IDs. Merge/split/delete/correction require explicit mappings and reasons. Retired IDs and identity keys are never reused. Source revisions invalidate affected identities, not unrelated ones. Changed identity or scope resets semantic review to pending. Pure reordering can retain an already-bound review. Structural validation never grants content review or joint handoff approval.

`--outline file` accepts only v5. Missing optional background is skipped; supplied corrupt, incompatible or mismatched background fails. Source paths are relative to the containing artifact; source bytes, SHA256, physical lines and coverage are checked. Missing originals fail.

Profile, voice and image designs live on the matching cast v1 identities and are each optional. A character sheet is one white-background landscape image: a strictly frontal close-up of the face on the left, three neck-down panels (front, side, back) on the right, soft even frontal lighting, ending with a fixed clean-image-quality paragraph; crowds (`entityType: group`) get a lineup sheet instead. Only base sheets are produced; cast v1 has no slot for character variants. See [sheet prompts](references/sheet-prompt.md), [layout](references/sheet.md) and [crowds](references/crowd.md); genre guidance lives in `references/genres/`. `images` exports offline plans only; formal jobs use C IDs and `images/C01-sheet.png`. Generation is optional and requires explicit production configuration plus a separately authorized execution tool. It is not an installation dependency.

```bash
node scripts/test-all.mjs
```

See [workflow](SKILL.md), [formal schema](references/schema.md), [design fields](references/design-schema.md), and [report conventions](references/report-style.md). Owned examples: Echo Station (`回声台`) for identities; Ferry (`渡口`) for a cast v1 with full designs; `examples/回声台-分集/` for the per-episode folder. All stage tests are offline. Generated HTML is not version-controlled. Standalone execution does not claim completion of the ordered five-stage workflow.
