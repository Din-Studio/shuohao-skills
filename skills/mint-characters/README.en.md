[中文](README.md) · **English**

# mint-characters

Each formal delivery uses three fixed filenames: `cast.json`, `cast-report.md`, and `cast-report.html`. Render both reports from `cast.json` and save all three files in the project's `characters/` directory.

Independently read an original script and maintain character identities. The formal artifact is **cast v1** (`schemaVersion: 1`, `kind: mint-characters`). Optional **outline v5** supplies story background, never character authority. Optional production configuration remains v3.

Copy this entire directory into your agent's skills directory. Node 18+, standard library only. No other skill is required.

```bash
node scripts/mint-characters.mjs seed --source book.txt --title Title --budget 30 --out draft.json
# Human/model reads the source and fills identities, sourceRefs and actual coverage.
node scripts/mint-characters.mjs reconcile draft.json --out cast.json
node scripts/mint-characters.mjs validate cast.json
node scripts/mint-characters.mjs render cast.json --md > cast-report.md
node scripts/mint-characters.mjs render cast.json --html > cast-report.html
```

Seed creates a skeleton, not semantic extraction or read coverage. Same-name people, aliases, silent characters, anonymous voices, unknown speakers, nonhuman subjects and mentioned people remain distinct when evidence does not establish sameness. Profiles, voice designs and image designs are independently optional. Explicit character budgets block this stage when exceeded.

Incremental updates use the existing artifact:

```bash
node scripts/mint-characters.mjs reconcile candidate.json --previous cast.json --changes changes.json --out next-cast.json
node scripts/mint-characters.mjs validate next-cast.json --previous cast.json
```

Reordering preserves IDs. Merge/split/delete/correction require explicit mappings and reasons. Retired IDs and identity keys are never reused. Source revisions invalidate affected identities, not unrelated ones. Changed identity or scope resets semantic review to pending. Pure reordering can retain an already-bound review. Structural validation never grants content review or joint handoff approval.

`--outline file` accepts only v5. Missing optional background is skipped; supplied corrupt, incompatible or mismatched background fails. Source paths are relative to the containing artifact; source bytes, SHA256, physical lines and coverage are checked. Missing originals fail.

Historical standalone profiles, voice/image prompts, assembly and reports remain available. `images` exports offline plans only; formal jobs use C IDs and `images/C01-sheet.png`. Generation is optional and requires explicit production configuration plus a separately authorized execution tool. It is not an installation dependency.

```bash
node scripts/mint-characters.mjs migrate-outline old-v4.json --out pending.json
node scripts/mint-characters.mjs migrate-cast unversioned-cast.json --out pending-cast.json
node scripts/test-all.mjs
```

Migration preserves original snapshots, every field path/value, old IDs, media designs, relations and budgets as pending material, not approved assets. No overwrite or implicit version upgrade. Legacy projection requires explicit `seed old-outline.json --legacy`.

See [workflow](SKILL.md), [formal schema](references/schema.md), [design fields](references/design-schema.md), and [migration/interface matrix](references/migration.md). Owned examples: Echo Station (`回声台`) for identities; Ferry (`渡口`) for legacy designs. All stage tests are offline. Generated HTML is not version-controlled. Standalone execution does not claim completion of the ordered five-stage workflow.
