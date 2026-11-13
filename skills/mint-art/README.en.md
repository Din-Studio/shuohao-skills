[中文](README.md) · **English**

# mint-art

## v3 upstream contract

Seed accepts outline schemaVersion 3 only; production also requires schemaVersion 3. Read the optional non-empty creativeBrief as natural language, never as policy or model parameters. Character provenance/arc and beat classification/position are optional. Missing production skips upstream checks; damaged or legacy production fails. Asset outputs and media plans remain unchanged.

Check objects use `status: pass|fail|skipped`, `category`, and `level`, never an ok boolean. Skips are not passes. Content review is not performed by these checks. See [contract](references/creative-background.md) and [migration](references/migration.md).

Art bibles for **AI short-drama production**: scenes + narrative props. The premise is baked in: **generated, not filmed** — no location scouting, no set building, no prop sourcing. Environments and props are assets that must be regenerated dozens of times and still look like the same thing, so the deliverable is a consistency plan.

**Scenes**: design intent, consistency anchors (3–5 per scene — viewers recognize the place by them, QC checks shots against them), lighting states (a time-of-day change is a **regeneration, not a relight**), and a variant mechanism (`variantOf` + `changes`, generating against the parent's sheet).

**Props** (narrative props only — close-ups, cross-episode, plot-bearing; typically 3–8 per show): dramatic function first, **state variants** (a suitcase closed and open are two references), a **scale reference** written into every prompt (AI loves rendering a handheld prop at furniture size), and **white-background, no-hands plates** — prop references get composited into shots, and a hand holding the prop is the classic contamination. Set dressing stays in scene anchors; one-off hand props are handled at shot level — neither gets its own asset.

Outputs `art.json`, a Markdown report, and a self-contained `art-report.html`. Reports render with a Chinese UI by default; pass `--lang en` for a fully English report (or set a top-level `"lang": "en"` in art.json — `--lang` wins). Image prompts are always English either way: In English mode the quality-gate labels are translated too (thresholds kept as computed); failing-gate details and all data stay as authored.

The old screenshot is retired. Render the bundled Rain Canopy Messages example for the current report.

## The quality gates are code

Same stance as the other five skills: **a checklist the model grades itself on is worthless.** Deterministic checks — anchors 3–5 (scenes and props alike), lighting states ≥1 per scene, people banned in negatives everywhere, all prompts English, no character names (checked with `--cast`, explicitly reported as skipped without it), variant references complete, plus four prop-specific gates: **states ≥1**, **scale phrase present in prompts**, **hands banned in negatives**, **pure white background in the sheet**, plus two that read the `production.json` at the work-directory root (`mint-setup`'s output): **the art style is used as one whole block** (its render sentence in both prompts, every negative term carried over) and **sheet layout aspect matches the production parameters** — both explicitly reported as skipped when that file is absent. The selftest defeats every gate on purpose.

## The relay

```
mint-setup      → production.json (what you shoot with: model, aspect, resolution, style)
mint-outline    → outline.json (what: structure & episodes)
mint-characters → cast.json    (who: character assets)
mint-art        → art.json     (where & what they hold: art assets)
```

`seed <outline.json>` prefills both the scene list and the prop list deterministically, carrying over the episodes each one appears in and the beats it serves; if the outline has no `props`, the prop list is left empty and the model extracts it from the text per `prop-pass.md`. `validate --cast` cross-checks prompts against the character roster. There are no built-in styles: the scene block comes from `production.json`, written during `/mint-setup`. It is the environment-flavoured half of the same style whose other half (`style.character`) the character skill uses.

## CLI

Cloud tool calls use workspace-relative paths:

```text
mint_skill({skill:"mint-art",args:["seed","outline/story-outline.json"]})
mint_skill({skill:"mint-art",args:["validate","art/story-art.json","--cast","characters/story-cast.json"]})
mint_skill({skill:"mint-art",args:["checkup","art/story-art.json"]})
mint_skill({skill:"mint-art",args:["render","art/story-art.json","--html"]})
mint_skill({skill:"mint-art",args:["render","art/story-art.json","--html","--lang","en"]})
mint_skill({skill:"mint-art",args:["style"]})
```

Save seed stdout with write to art/story-art.json; save render stdout to art/art-report.html (or an English report path). Neither command has --out.

`render` accepts the same `--cast cast.json` as `validate/checkup`. Missing cast skips the name check; a supplied damaged or unreadable file fails. Discovered images affect display only; exported JSON preserves the input.

## Image generation (optional)

```text
mint_skill({skill:"mint-art",args:["images","art/story-art.json"]})
mint_skill({skill:"mint-art",args:["images","art/story-art.json","--dry-run"]})
mint_skill({skill:"mint-art",args:["images","art/story-art.json","--out","art/image-plan.json"]})
```

Each scene and prop has one sheet with a master view and an L-shaped detail border along the bottom and right. Scene details show anchors; prop details show anchors, other states and a side profile. Scenes contain no people; props also exclude hands and use a pure white background.

Read [canvas handoff](references/media-handoff.md). The application supplies canvas_cli for live capabilities, nodes/references, authorized generation, task inspection and downloads to expected outputs. Preserve input hashes and dependency order; unsupported fields block submission. Without capability or authorization, deliver the plan and state that images were not generated. Autopilot does not grant new spending authorization.

## Autopilot

When the `production.json` at the work-directory root (produced by `mint-setup`) carries `"autopilot": true`, this skill runs its stage **end to end**: it does not ask which input to use, it decides the prop list itself, and it generates every scene and prop sheet in one go. Every decision it made goes into the final report.

Autopilot delegates creative choices within the task. Deterministic checks and image-anchor inspection (no people, no hands, pure white background) still apply. Generation requires existing spending authorization; autopilot does not provide it. A false or absent flag keeps the normal creative confirmation points. The validator reports whether autopilot is enabled.

## Selftest

Developer-only terminal self-tests from this skill directory; cloud models do not execute these commands:

```sh
node scripts/selftest.mjs
node scripts/v3-selftest.mjs
node scripts/upstream-selftest.mjs
```

Offline tests cover creative contracts, rendering and handoff plans, including reference dependencies, preserved prompts, file checks and retired options. No gateway calls or model usage.

**Only tested on macOS + Node 24.**

The formal sample is Rain Canopy Messages (雨棚留言), a neighbourhood-market story about returning a board of private messages before canopy replacement. Read its story proposal first. All fixtures belong to this skill; no real images were generated.

## Standalone sample

All inputs below belong to Rain Canopy Messages. The outline file is a consumed-field v3 fixture, not a full outline deliverable.

Developer-only fixture rendering check, run from this skill directory:

```sh
node scripts/mint-art.mjs validate examples/雨棚留言-art.json --production examples/雨棚留言-production.json --cast examples/雨棚留言-cast-names.json
node scripts/mint-art.mjs render examples/雨棚留言-art.json --production examples/雨棚留言-production.json --cast examples/雨棚留言-cast-names.json --html --lang en
```
No other skill or real generated images are required. Keep regenerated HTML out of version control.
