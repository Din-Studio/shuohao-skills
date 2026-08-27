[中文](README.md) · **English**

# novel-setup

Locks the **production parameters** for an AI short drama — stage zero of the pipeline, run before you break out characters or outline episodes.

It solves exactly one problem: **technical parameters scattered across every image call will drift**. Today's character sheet is 16:9, tomorrow's storyboard frame is 16:9 too — but the show ships vertical. You find out when the frames hit the video model and get cropped on both sides, and by then a full episode of thirty-odd frames is already generated.

Lock them once into a single `production.json` at the work-directory root; the four downstream skills walk up to it before generating images or placing video jobs:

```json
{
  "source": "回南天",
  "style": "realistic",
  "lang": "zh",
  "promptLang": "en",
  "image": {
    "model": "nanobanana2",
    "asset": { "resolution": "2K", "aspectRatio": "16:9" },
    "frame": { "resolution": "2K", "aspectRatio": "9:16" }
  },
  "video": {
    "model": "MiniMax H3",
    "aspectRatio": "9:16",
    "resolution": "768p"
  }
}
```

| Parameter | Who consumes it |
| --- | --- |
| **Image model** | the image calls in novel-characters / novel-art / novel-storyboard |
| **Asset resolution · asset aspect** | character sheets, scene sheets, prop sheets |
| **Frame resolution · frame aspect** | storyboard frames — each one *is* a frame of the finished show |
| **Video model** | novel-storyboard's `export` production package |
| **Video aspect_ratio · video resolution** | the two parameters you pass the video model |
| **Style** (realistic / ghibli) | the three image skills; drift here and the composite falls apart |
| **Report UI language · prompt language** | `render` across all five skills, plus the H3 prompts |

## Two aspects, two different things ⚠️

The most commonly confused point, and the main reason this skill exists:

- **Asset sheets** (character, scene, prop) are **reference tables** for the eye and for image conditioning. The character sheet's three-zone layout and the scene/prop L-shaped layout both spread horizontally; turn them vertical and the three-view figures get squashed. So asset sheets default to `16:9` **and stay there even when the show is vertical**.
- **Storyboard frames** are keyframes fed to the video model — **each one is a frame of the finished show**. Off by a little from the video `aspect_ratio` and the reference gets cropped or stretched, wasting the whole batch.

Two separate gates cover these two facts, and neither drags the other along.

## Image and video generation go through lingying

Both run on the **lingying** gateway CLI: `image create` / `video create` submit a task, `task get` polls it, and the result is a URL you download yourself.

That buys a real simplification: **`resolution` and `aspectRatio` are the enum values from lingying's own `input_schema`** (`1K` / `2K` / `4K`, `768p`, `16:9` / `9:16` …). They go into `--input_data` verbatim — **no pixel conversion, and no pixel sizes in the prompt**. The old path folded a tier into pixels and appended `Render at 2048x1152 (16:9).` to the prompt; that whole layer is gone.

Because the enums are checkable on the machine, the capability tables became worth filling:

```bash
node scripts/novel-setup.mjs caps
```

```
生图：
  nanobanana2    档位 1K / 2K / 4K　比例 1:1 / 2:3 / 3:2 / 9:16 / 16:9
  image-2        档位 1K / 2K / 4K　比例 1:1 / 3:2 / 2:3 / 4:3 / 3:4 / 16:9 / 9:16
                 ↳ 4K 下只收 16:9 / 9:16

生视频：
  MiniMax H3 · managed         档位 768p / 2K　比例 16:9 / 21:9 / 4:3 / 1:1 / 3:4 / 9:16 / adaptive
  MiniMax H3 · open_source     档位 480p / 720p　比例 1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 9:16 / 16:9
                               ↳ duration 5~15 秒整数
  …
```

The video side of this table used to be **deliberately empty**, on the grounds that vendor conventions differ, shift between versions, and inventing one from memory is worse than not checking. Under lingying the evidence exists — `lingying model get <UUID>` prints the `input_schema` locally. So the table is filled, but **the provenance is not optional**: every entry carries the command that produced it and the model UUID, so a stale row can be reconciled by re-running one command.

What it catches: shooting `4:3` rules out `nanobanana2` (it does not accept that ratio); `image-2` at `4K` is down to `16:9` / `9:16` only (the 8.29MP cap); `MiniMax H3` takes `768p` / `2K` — **not the `720p` / `1080p` you would reach for by reflex**. All of these used to surface only when the gateway rejected the submission.

**A model missing from the tables is not an error** — the relevant gates say they are skipping, and the rest run as usual. When the gateway adds a model, run `lingying model list`, confirm its wording, and add a row.

### adaptive stays out of this pipeline

Every lingying video model accepts `aspect_ratio: "adaptive"` (let the model pick from the input). **This pipeline cannot use it**: frames are generated as a batch at one fixed ratio, and a ratio chosen per call stops matching across thirty-odd frames in an episode. The `aspect-format` gate rejects it outright.

## Quality gates: 7, all in code

Same stance as the other five skills in this repo: **a checklist left to the model's good intentions does not hold**.

| Gate | Rule |
| --- | --- |
| Fields present, enums valid | one missing field and downstream reads `undefined`, silently falling back to a default |
| Aspects written as `W:H` | `9-16` will not parse downstream |
| **Frame aspect = video aspect** | mismatch means the whole batch of frames gets cropped or stretched |
| Asset sheets are landscape or square | portrait squashes the three-view figures |
| All three resolution tiers filled | blank means undecided |
| Video model and parameters valid | model, tier and aspect all have to line up. `MiniMax H3` with `720p` gets rejected by the gateway — by which point the episode's frames are already generated |
| Tier and aspect accepted by the image model | same reasoning. `nanobanana2` does not take `4:3`; `image-2` at `4K` takes only `16:9` / `9:16` |

Every gate has a **breaking test case** in the self-test — proof it actually stops something.

## Usage

```bash
# 0. See which tiers and aspects the models accept
node scripts/novel-setup.mjs caps

# 1. Generate the parameter file (the finished-show aspect has no default — you must state it)
node scripts/novel-setup.mjs init --aspect 9:16 \
  --source 回南天 --video-model "MiniMax H3" --video-resolution 768p \
  > <work-dir>/production.json

# 2. Validate
node scripts/novel-setup.mjs validate <work-dir>/production.json

# 3. Print a human-readable parameter table
node scripts/novel-setup.mjs show <work-dir>/production.json
```

**The finished-show aspect has no default** — vertical and horizontal are two different shows, and guessing wrong costs you every generated asset. It is the one parameter worth an extra flag rather than a default.

**No HTML report**: this is a dozen-line parameter table, `show` covers it, and one more rendered artifact is just one more thing that can drift.

## How downstream uses it

Full contract in `references/contract.md`. The three-sentence version:

- **Downstream walks up**: from its own output directory, up to 5 levels, looking for `production.json`. **Downstream does not import this skill's code** — every skill must survive being copied out on its own, so each implements the dozen-line lookup itself.
- **Not found means it says so and skips**, falling back to built-in defaults while stating which gates were skipped. Pretending to have checked is worse than not checking.
- **Found means it must be obeyed**, and the line is whether a change forces regeneration: style and aspect are **gates that cannot be bypassed**, and the resolution tier must be carried into the `--input_data` of the image call; report UI language is inherited, not gated.

Grab everything one stage needs in a single line:

```bash
node scripts/novel-setup.mjs resolve --for storyboard
```

```json
{
  "stage": "storyboard",
  "what": "分镜图",
  "style": "realistic",
  "cli": "lingying",
  "model": "nanobanana2",
  "resolution": "2K",
  "aspectRatio": "9:16",
  "inputData": { "aspect_ratio": "9:16", "resolution": "2K" }
}
```

`resolution` and `aspectRatio` are the source of truth, verbatim; **`inputData` is the assembled lingying payload** — add a `prompt` (and `images` for references) and it is ready to submit. No skill has to assemble its own wording, which is one more thing that would drift.

Segment duration has its own folding command — video models take an integer number of seconds within a range (5–15 for H3), and a storyboard segment's seconds are neither integer nor guaranteed to land inside it:

```bash
node scripts/novel-setup.mjs duration 12.5 --model "MiniMax H3"
# → { "duration": 13, "note": "12.5 秒向上取整到 13 秒" }
```

## Six skills in relay

```
novel-setup      → production.json （what you shoot with: model, aspect, resolution, style）
novel-outline    → outline.json    （what: structure and episodes）
novel-characters → cast.json       （who: character sheets）
novel-art        → art.json        （where: scene and prop sheets）
novel-script     → script.json     （the drama: scenes, beats, lines）
novel-storyboard → storyboard.json （how it's shot: cuts, frames, batches）
```

`novel-setup` is the one stage that produces no creative content — it produces **the shape of the container everything else has to fit into**.

## Bundled examples

- `examples/回南天-production.json`: **vertical 9:16**, photorealistic live-action, 2K, English prompts, `nanobanana2` + `MiniMax H3` — the most common AI short-drama shape
- `examples/雪线-production.json`: **horizontal 16:9**, Ghibli, 4K, Chinese prompts, `image-2` + `seedance2.0` — the other extreme

Two aspects, two styles, two tiers, two prompt languages, two image models, two video models, each appearing once — because what this skill delivers *is* the space of valid parameter combinations.

## Self-test

```bash
node scripts/selftest.mjs
```

184 assertions, no model calls, no network, no quota.

## Boundaries

- Does not write story, generate images, or place video jobs — technical parameters only
- **Does not convert tiers to pixels** — lingying takes the tier itself, so that layer no longer exists
- Creative parameters (episode count, runtime, genre) belong to `novel-outline`
