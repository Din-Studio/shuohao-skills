[中文](README.md) · **English**

# mint-setup

## v3 production contract

Production requires schemaVersion 3. Collect an optional non-empty natural-language creativeBrief with --creative-brief. No strategy selection or default rules. show displays the brief; resolve returns it unchanged.

Check objects use `status: pass|fail|skipped`, `category`, and `level`, never an ok boolean. Skips are not passes. Content review is not performed by these checks. See [contract](references/creative-brief.md).

Locks asset-image and video models, resolution tiers, independent aspect ratios, art style, languages and autopilot in one `production.json` at the work-directory root.

**Asset sheets and video frames have different purposes.** Character, scene and prop sheets use landscape or square layouts. The finished video can be vertical. Video creation mounts those sheets directly without generating intermediate keyframes.

## Usage

```bash
node scripts/mint-setup.mjs caps
node scripts/mint-setup.mjs init --aspect 9:16 \
  --source Example --video-model "seedance2.0" --video-resolution 720p \
  > <work-dir>/production.json
node scripts/mint-setup.mjs style-template
# Fill production.json's style block before validating
node scripts/mint-setup.mjs validate <work-dir>/production.json
node scripts/mint-setup.mjs show <work-dir>/production.json
```

- The finished-video aspect has no default. `--aspect` sets only the video ratio.
- Offer Seedance 2.5, Seedance 2.0, and Wan 3.0 for video; offer `image-2` and NanoBanana for images. Check live model IDs and capabilities; confirm the NanoBanana version if there are multiple versions.
- Script asset defaults: `nanobanana2`, `2K`, `16:9`. Confirm the image model interactively and set `--image-model`, `--asset-resolution` and `--asset-aspect` as needed.
- Art style has no default or built-in types. Fill the empty skeleton or load `--style <style.json>`.
- Keep `style.phrase` as the English style summary used by the Seedance prompt guide. Write separate `style.character` and `style.scene` blocks. Replace the whole style together; positive and negative requirements must not contradict each other.
- Set report language with `--lang`, prompt language with `--prompt-lang`. Video creation applies its model-specific prompt rules.
- Node 18+, standard library only. This skill makes no model calls and produces no HTML report.

## Nine checks, including the v3 document contract

| Gate | Checks |
| --- | --- |
| document-contract | schemaVersion 3, optional non-empty creativeBrief, no retired configuration |
| fields | Required fields, language enums, boolean autopilot |
| aspect-format | Fixed `W:H` asset and video ratios; no `adaptive` |
| asset-landscape | Landscape or square asset layout |
| resolution-filled | Resolution is specified |
| video-model | Video model, tier and ratio compatibility |
| model-caps | Asset-image model, tier and ratio compatibility |
| style-blocks | Style label and both style blocks are complete |
| style-coherent | Positive and negative requirements agree |

Model tables retain historical source metadata and UUIDs for offline checks. Unknown models explicitly skip capability checks. Before generation, use the independently installed ly-image / ly-video skills to discover live schemas. Resolution and aspect are service tiers, not pixel dimensions.

A video ratio does not constrain the asset-image model. For example, `nanobanana2` sheets can remain at `16:9` while a compatible video model produces `4:3`. The `image-2` model at `4K` accepts only `16:9` or `9:16` images.

See [references/schema.md](references/schema.md) for the full schema and [references/contract.md](references/contract.md) for downstream contracts.

## Downstream stages

```text
mint-setup      → production.json
mint-outline    → outline/
mint-characters → characters/
mint-art        → art/
mint-script     → script/
mint-creation   → creation/
```

The five creative skills search upward from their output directory, at most five levels. They read JSON without importing this skill's code. Missing configuration must be reported; there is no fallback art style.

`init --autopilot` enables uninterrupted downstream execution. It transfers approval, not checkpoints: validation, cost estimates and loss limits remain. Only JSON boolean `true` enables it. Setup still requires the user's aspect, video model and art-style decisions.

```bash
node scripts/mint-setup.mjs resolve --for characters
node scripts/mint-setup.mjs resolve --for art
node scripts/mint-setup.mjs resolve --for video
node scripts/mint-setup.mjs duration 12.5 --model "MiniMax H3"
```

`resolve` returns model parameters and assembled `inputData`; video also includes its duration range. The caller adds prompts, reference URLs and per-segment duration. Image stages receive their respective style block; video receives the style label and phrase.

## Examples and tests

- `examples/回南天-production.json`: vertical, live-action style, 2K sheets, English prompts, autopilot off.
- `examples/雪线-production.json`: horizontal, hand-painted animation, 4K sheets, Chinese prompts, autopilot on.

These are examples, not a style menu. They also serve as independent test fixtures.

```bash
node scripts/selftest.mjs
node scripts/upstream-selftest.mjs
```

No model calls, network access or quota. `style.phrase` remains available to model-specific video prompt guides.
