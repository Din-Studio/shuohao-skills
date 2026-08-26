[中文](README.md) · **English**

# novel-creation

**Reference-sheet-to-video for AI short drama** — a sibling production line to `novel-storyboard`, not a replacement. The premise: **you already have character/scene/prop model sheets from `novel-characters` / `novel-art`**, and sometimes you don't need the frame-image layer in between — you just want to mount those sheets as references and order a video with one prompt. So the structure has **one fewer layer** than `novel-storyboard`:

```
segment ＝ one video-generation call, ≤ 15s (also within the video model's duration range once production
           parameters are mounted), never crosses a scene
 ├─ cut × 2–3 ＝ an edit inside the segment, 2–5s each (hard gate), each claims script beats
 ├─ reference mounts ＝ segment-level, referencing existing cast.json / art.json sheets directly (no new images)
 └─ general-purpose video prompt ＝ one per segment, identifies each reference then lists [Shot k] lines,
                                    not tied to any single model
```

- **Zero new image-generation calls** — from `seed` through submitting `videos`, no command in this skill ever calls `lingying image create`. References come only from sheet files `cast.json` / `art.json` already produced
- **The prompt is not an internalized H3 spec** — there is no keyframe to align, so there is no alignment line, no cut timestamps, no `<d>` tags. The writing convention is this skill's own methodology (`references/creation-prompt.md`), model-agnostic by design: `lingying model get` was checked live and both `MiniMax H3` and `seedance2.5`/`seedance2.0` expose a general `images: string[]` field at the top level — "references + prompt → video" is a cross-model capability, not an H3 exclusive
- **Segment-level mounts, no file copies** — the `images` array references `../characters/images/…` and `../art/images/…` by relative path; those sheets are shared across dozens of segments, so copying them would duplicate assets on disk many times over
- **Ordering logic lives in code** — a single `videos` command handles submit/poll/download/resume via `scripts/lib/lingying.mjs` (a port of the image-generation orchestration already used by `novel-art`/`novel-characters`), not a bash doc the model re-improvises each time

Produces `creation.json` + Markdown + a double-clickable `creation-report.html`.

## Choosing between novel-storyboard and novel-creation

| | novel-storyboard | novel-creation (this skill) |
| --- | --- | --- |
| Frame-image layer | Yes — one keyframe per cut, multi-image alignment, precise timestamps | **No** — segments mount existing sheets directly |
| Best for | Precise shot control, willing to spend one more generation layer on frames, formal deliverables | Fast, cheap, ordering straight off existing sheets |
| Output location | `<work dir>/storyboard/` | `<work dir>/creation/`, sibling to `storyboard/` |

Both lines share `production.json` and `cast.json`/`art.json`, and neither touches the other's code — pick per occasion, or mix them within the same episode.

## Quality gates: 16, all scripted

Three fewer than `novel-storyboard`'s 19 (drops H3-structure alignment, style-phrase, frame-aspect — there's no frame-image artifact), two new ones watch reference sheets:

| Gate | Rule |
| --- | --- |
| **Beat coverage** | Every script beat claimed by exactly one cut, in order, contiguous, never across scenes |
| Segment duration | 0 < Σcuts ≤ cap (also within the mounted video model's duration range) |
| Cut duration | 2–5s per cut — the short-drama rhythm is a hard gate |
| Dialogue fits | Claimed dialogue duration ≤ the cut's own seconds |
| Episode duration | Σsegments within ±15% of the script's target |
| Crowd cap | ≤ 3 characters on screen per cut; more requires a breakdown note |
| Segment IDs | `E01-01` format, sequential |
| Shot-size phrase | Must appear in this cut's own `[Shot k]` line (no separate frame-prompt field here) |
| Camera vocabulary | The shared vocabulary (H3's official list, used generically), must appear in its own `[Shot k]` line |
| **Dialogue verbatim** | Plain substring match inside `prompt`, no tag required — change one character and it's caught |
| Prompt language | Body language matches `promptLang`, checked both ways |
| No character names | Quoted dialogue is exempt; skipped (and said so) without `--outline`/`--cast` |
| Cross-references | Scenes/characters/props audited against the script |
| **Reference resolves to a file** | Every character/scene/prop appearing in a segment must resolve a name via `outline`/`art` and an existing `../characters\|art/images/<slug>-sheet.png` — missing files are named with their expected path |
| **Reference label count matches** | The number of `Picture k is …` identity lines at the top of the prompt must match the length of the `images` array |
| Shot recipe (optional mount) | Same judging as `novel-storyboard`, just checked against the matching `[Shot k]` line |

Every gate has a breaking test case in the self-test suite.

## What the report looks like

- **KPI band**: segments / cuts and average seconds / total time vs. target / dialogue segments
- **Cut rhythm strip**: one colored row per episode, thick separators mark segment boundaries, slice width = cut duration share, darker = closer shot size
- **Segment cards**: one card per segment — a **reference strip** (thumbnails when the file exists, a placeholder when it doesn't — no guessing), a two-column layout (cut list on the left, a copyable prompt panel on the right)
- **Reference sheet mounts**: a table listing which sheets each segment mounts and whether the files exist — check this before ordering
- **Audio alignment**: every line of dialogue mapped to its segment#cut
- Quality-gate panel, header badge, and a JSON export button; the UI defaults to Chinese, `render --lang en` renders a fully English UI

## Using it from the command line

```bash
node scripts/novel-creation.mjs seed script.json --eps 1
cd <stage dir>   # from here on, every command resolves reference paths and production params against cwd
node ../../scripts/novel-creation.mjs validate creation.json \
     --script ../script/script.json --outline ../outline/outline.json \
     --cast ../characters/cast.json --art ../art/art.json
node ../../scripts/novel-creation.mjs render creation.json --html \
     --script ../script/script.json --outline ../outline/outline.json --art ../art/art.json > creation-report.html
node ../../scripts/novel-creation.mjs export creation.json --script ../script/script.json \
     --outline ../outline/outline.json --art ../art/art.json --out .
node ../../scripts/novel-creation.mjs videos manifest.json --dry-run
```

`export` writes one folder per segment (`E01-01/`) with only a `prompt.md` (no frame images — the video prompt verbatim, headed by the mounted references' identities and relative paths), and a root `manifest.json` carrying the video parameters plus each segment's reference list and any missing files.

## Boundaries

- No script or dialogue writing, no asset-sheet generation, **no editing/compositing**; video generation is the optional last step through `lingying video create`, delivering one mp4 per segment
- **Zero new image-generation calls is a hard promise, not a preference** — references must come from existing files; a missing one is a gate failure, never a fallback that quietly generates a new image
- **No `.gates.jsonl`, no `stats` subcommand** — gate-failure accumulation is still an experiment scoped to `novel-storyboard` only (see the repo's `CLAUDE.md`)

## Files

```
SKILL.md                 the workflow for the agent to read
scripts/
  novel-creation.mjs     seed / validate / checkup / render / export / videos / slug
  lib/lingying.mjs       video-ordering orchestration: submitTask/pollTask/uploadAsset/runBatch…
  selftest.mjs           self-test, no model calls
references/
  schema.md              creation.json shape + the duration-constraint chain
  creation-prompt.md     video-prompt writing convention (this skill's own method, not an H3 port)
  shot-pass.md           cutting: segmentation rules, segment-level reference mounting, camera feel, common pitfalls
  video-order.md         behavioral description of the videos command
  report-style.md        the report's design conventions
examples/
  收书人.txt              the original sample story synopsis
  outline/ characters/ art/ script/ creation/   minimal compliant fixtures + real placeholder sheets
  production.json        sample production parameters
```

## Self-test

```bash
node scripts/selftest.mjs
```

No model calls, no spend, runs in about a second. Run this before anything else after touching the script.

**Only verified on macOS + Node 24.** Nothing in the code is platform-specific, so Linux and older Node versions should work in theory — just not verified.
