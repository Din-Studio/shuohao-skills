[中文](README.md) · **English**

# mint-art

Each formal delivery contains three files: `xxx.json`, `xxx-report.md`, and `xxx-report.html`. Use the complete JSON filename without `.json` as the same `xxx` in all three names. Render both reports from that JSON and save them alongside it in the stage directory.

Read the original script independently, decide which locations and objects need art identities, and design only what the task requires. **An identity does not require an image.**

Formal interfaces: **art v1** (`kind: mint-art`), optional **outline v5** story context, optional **cast v1** (`kind: mint-characters`) character authority, and **production v3** visual settings. Any other version is rejected.

```bash
node scripts/mint-art.mjs seed --source script.txt --title Title --out draft.json
node scripts/mint-art.mjs seed --source script.txt --title Title --existing previous.json --out next.json
node scripts/mint-art.mjs seed --design --title Original --out design.json
node scripts/mint-art.mjs register draft.json --kind scene --key permanent-key --name Location --out registered.json
node scripts/mint-art.mjs identity-inputs registered.json
node scripts/mint-art.mjs validate art.json --outline outline.json --cast cast.json
node scripts/mint-art.mjs reconcile candidate.json --previous previous.json --out reconciled.json
node scripts/mint-art.mjs render art.json --md > art-report.md
node scripts/mint-art.mjs render art.json --html > art-report.html
node scripts/mint-art.mjs images art.json --production production.json --out plan.json
```

Seed creates empty asset and coverage arrays. It computes source byte hashes and line counts; it does not understand the script or claim it has been read. A human/model supplies semantic identification, evidence, scope, decisions and explicit confirmation.

Scene headings are not location identities. Mentioned objects are not automatically props. Handover and damage usually describe states of the same object. Outline is story context, never asset authority. Character identity belongs to characters; art does not infer C IDs from names.

Stable S/P IDs and permanent keys live in the art registry. Incremental processing reads the previous artifact. Reordering does not reallocate IDs. Merge/split/correction/deletion require explicit mappings and evidence. Retired IDs are never reused. Explicit budgets live in art and block excess; reference limits only warn.

All CLI validation, rendering and image-plan paths verify actual originals, SHA256, line counts, coverage and nested references. Missing optional upstreams are skipped. Supplied broken, incompatible or mismatched inputs fail. In-memory APIs only check structure unless `verifySources` is called explicitly.

`designStatus: none` requires no visual fields or production file. Planned/ready designs retain existing visual checks (anchors, English, lighting/states, empty scenes, scale, no hands, white backgrounds). Only ready assets enter offline image plans. Plans do not generate or submit anything; per-job input digests cover the actual asset evidence and references.

```bash
node scripts/run-selftests.mjs
```

The full workflow is outline → characters → art → script → creation, controlled by the project caller. Independent runs do not certify earlier stages or joint mapping. Script-local IDs are not asset identity mappings; script.assetMappings is the mapping authority.

Examples belong to this skill. Read the Rain Canopy Messages story proposal before its script and assets. The identification example has two locations and two objects, no designs or images; a mentioned umbrella is intentionally not an asset. The independent design example preserves its visual variants. The outline v5 example is a local consumption projection, not a complete outline producer test fixture.

Reports support Chinese/English UI and preserve original JSON exports. HTML reports are generated, not version-controlled. Structural/source checks are not semantic fidelity, image approval or finished-film approval.

See [schema](references/schema.md), [interfaces and lifecycle](references/lifecycle.md), [sources](references/source-facts.md), and [SKILL.md](SKILL.md). Node 18+, standard library only; no sibling skill or external generation skill is required.
