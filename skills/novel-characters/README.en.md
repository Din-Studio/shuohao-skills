[中文](README.md) · **English**

# novel-characters

## 2.0.0: creative contract

Accept only explicit outline schemaVersion 2 in seed. Read genre/narrativeStyle from production as background only; do not load profiles, apply policy, write creativeContext or fabricate hashes. Missing local profiles do not affect this asset stage. Visual text and image production parameters remain mandatory for generation. Missing production may skip historical upstream checks; a supplied but damaged production fails.

Check objects use `status: pass|fail|skipped`, `category`, and `level`, never an ok boolean. Skips are not passes. Content review is not performed by these checks. See [contract](references/creative-background.md) and [migration](references/migration.md).

Feed it a novel or a short story, and get a complete design bible for every character:

- **Cast list** — who appears, how central they are, with every name a character is called by folded into one person
- **Profile** — gender, age, standing, appearance, temperament, motivation, arc, relationships, each backed by **verbatim quotes from the source**
- **Design prompts** — art direction copied verbatim from the show's style block, bilingual image prompt + negative prompt + style tags; negative prompts are preserved in the plan and checked against the live model schema
- **Voice prompts** — timbre, pitch, pace, accent, emotion, plus a voice-design prompt for Qwen3-TTS / ElevenLabs Voice Design
- **A character model sheet** — **one per character**: an image using `production.image.asset.aspectRatio`, divided into three zones: an ID-photo-style bust on the left (~34%, the reference for the face design), a full-body turnaround top-right, and a strip of key-detail close-ups bottom-right. White background for clean cut-out; `images` exports a plan; ly-image performs generation
- **Relationship map** — a whole-cast view inside the report: who is tied to whom, and how. Hover a character to light up every link they are part of, click to jump to their profile

Outputs `cast.json`, a Markdown report, and a self-contained `report.html` you can just double-click.

**Any output language**, Chinese by default:

```
/novel-characters ./book.txt --lang en
/novel-characters ./book.txt --lang ja
```

Chinese, English and Japanese UI strings ship built in. **Other languages work too** — the skill translates the UI labels on the fly into the target language and stores them in `cast.json` under `ui`, so French, Korean or Spanish reports come out fully localized rather than half-English.

![report.html](assets/report.webp)

A character model sheet (Shen Zhiwei, from the bundled sample story):

![model sheet](assets/sheet.jpg)

## Upstream

In the pipeline the **outline sits upstream of the character bible**:

```
novel-setup      → production.json (what you shoot with: model, aspect, resolution, style)
novel-outline    → outline.json (what: structure & episodes, who is in)
novel-characters → cast.json    (who: character assets)
```

If you have an `outline.json`, start with `seed` — its `characters` block already settles the roster:

```bash
node scripts/novel-characters.mjs seed outline.json > seed.json
```

What comes across is what the outline already decided (character id, name, tier, arc, which source characters were merged into this one); what is left blank is the work this layer owes (aliases, profile, design prompt, voice prompt). `tier` maps onto `importance`: `lead` → protagonist, `support` → supporting, `functional` → minor.

**Do not overturn the outline's tiers here**; if a tier looks wrong, go fix the outline. Splitting *within* the lead group is fine — `lead` covers leads plus the main antagonist, so `seed` assigns protagonist to all of them and you demote the non-leads to major using the `role` recorded in `seedNote`.

**It runs fine without one** — this skill does not depend on it. Skip `seed`, feed it a raw novel, and it builds the roster from the text itself.

## Use

Copy this entire directory to your agent's skills directory, such as `~/.pi/agent/skills/novel-characters`, `~/.claude/skills/novel-characters` or `~/.codex/skills/novel-characters`. A symlink to this directory also works. Scripts need Node 18+ and no third-party dependencies. Then:

```
/novel-characters ./your-novel.txt          # Claude Code, codex
/skill:novel-characters ./your-novel.txt    # pi (skill commands take a skill: prefix; arguments are identical)
```

Or just say "break this book down into characters" and give it the path — same on all three.

**pi has no sub-agents**: both passes (chunked roster extraction, then one card per character) run in sequence inside the current session there. Several times slower, byte-for-byte the same output.

### Report language

Chinese by default. Use `--lang`, or just ask in words:

```
/novel-characters ./book.txt --lang en
/novel-characters ./book.txt --lang ja
```

Chinese, English and Japanese UI strings ship built in. **Any other language works too** — the skill translates the UI labels into the target language on the fly and stores them in `cast.json` under `ui`, so French, Korean or Spanish reports come out fully localized rather than half-English.

`render --lang en` changes only the UI. Both HTML and Markdown validate content using the input `cast.json.lang`, independently of the display language.

Two things never follow the language: **image and TTS prompts stay English** (those engines work best that way), and **source quotes stay in the original language** (translate them and they stop being evidence).

### Art style

**This skill ships no built-in styles and has no default one.** The style lives at the top level of `production.json` in the work-directory root, written by the user during `/novel-setup` — photorealistic live-action, Ghibli-like hand-painting, ink wash, claymation, 1980s film grain, whatever. **No code changes.**

```bash
node scripts/novel-characters.mjs style     # dump this show's style.character block
```

The block carries five things, copied **verbatim** into every character card:

| Block | Goes into |
| --- | --- |
| `render` | `image.sheet` *and* `image.prompt` (both — copying only one produces two different looks) |
| `surface` | same |
| `lighting` | `image.sheet` |
| `negative` | `image.negativePrompt`, **every term of it**; per-character bans go on top |
| `tags` | `image.tags` |

`validate` checks this automatically once `production.json` is found — there is no switch.

**Switching style swaps the whole set**, not just one line — five blocks together, no mixing. See [`references/style.md`](references/style.md).

## What the report looks like

A three-column workbench: search on top, synopsis plus a prominence-ordered cast list on the left, one character at a time in the main area.

The **relationship map** sits at the top of the left rail and takes over the main area. Its edges come straight from each character's `relationships` — no extra model pass:

- Edges resolve by **name *and* alias**, so a relationship written as "老伯" still lands on 老周's node
- Two one-directional accounts of the same pair collapse into one edge, keeping both wordings
- Each chord carries a short label (6 characters, full text in the tooltip and the side list). Labels get noisy on a large cast, so they are on by default up to 14 edges and off above that, with a toggle in the header
- Hover a character to light up every link they are part of, hover a row to isolate one link, click either to open that character

The circular layout is computed in Node and written straight into inline SVG — **no libraries**, so report.html stays a single file you can open offline.

### Export JSON

The **Export JSON** button in the top bar downloads exactly the `cast.json` shape — not some separate export format:

```json
{ "source": "…", "lang": "zh", "summary": "…", "characters": [ … ] }
```

So an external tool can edit it and **feed it straight back into `render`**, and it still passes `validate`. Existing input `sheetImage` values are preserved. Automatically discovered images affect display only; they do not add or overwrite exported fields.

The data is embedded as `<script type="application/json">`; exporting just wraps it in a Blob and downloads it — **no network request**.

## How it works

Feeding a long text into one context window loses characters, so it runs in two passes:

**Pass 1 — scan** (cheap model)
The text is split on paragraph boundaries into overlapping 40k-character chunks. Each chunk is scanned in parallel for character names, aliases, concrete description, and verbatim quotes. The overlap is what keeps a character introduced right at a chunk seam visible to both sides.

**Merge**
Names and aliases are indexed together, so different forms of address across chunks converge onto one person. Where exact matching cannot reach (「陆」 and 「陆行远」 share no key), the script lists containment-based `mergeCandidates` for the model to review; confirmed merges are applied deterministically from a merges.json. Characters are ranked by how many chunks mention them — that ranking is the proxy for screen time.

**Pass 2 — profile**
Only the top N characters (**30 by default**) get a full sheet, built from every observation merged for them. Each one is told the names of its siblings in the same cast, so their looks and voices don't collapse into each other. Ethnicity, era and region are inferred from the source and written explicitly into the image prompts — **they do not follow `--lang`**. Rendering the report in Japanese does not turn a Republican-era Chinese ferryman into a Japanese man.

**Validate** (never skipped)
Four hard rules, all checked deterministically by a script rather than trusted to the model:

| Rule | Why |
| --- | --- |
| `evidence` must be a **verbatim, contiguous** span of the source | Stops invention. Dialogue split by a narration beat may not be stitched back together |
| Image prompts must **not contain character names** | Image models bias hard on names and will draw the character they remember instead of yours |
| **Language split** per field | Human-readable fields follow `--lang`, image and TTS prompts are always English — the model drifts otherwise |
| **Art style used as one whole block** | the render sentence from `production.json` made it into both prompts and every negative term came along. One missing term is style drift already (skipped, and said so, if the file is not found) |
| Structure and enums | `importance` is one of exactly four values |

None of these were written up front. Each one exists because real model output violated it and the validator caught it.

## Use the scripts directly

The helpers run fine without an agent — only the two model passes need one:

```bash
node scripts/novel-characters.mjs seed outline.json              # seed the roster from an outline, if you have one
node scripts/novel-characters.mjs chunk book.txt /tmp/wk        # split
node scripts/novel-characters.mjs merge /tmp/wk                 # merge roster-*.json, with merge candidates
node scripts/novel-characters.mjs merge /tmp/wk --apply m.json   # apply reviewed merges
node scripts/novel-characters.mjs assemble /tmp/wk --source Book # combine card-*.json into cast.json, prominence-ordered
node scripts/novel-characters.mjs validate cast.json book.txt   # validate
node scripts/novel-characters.mjs images cast.json               # export offline plan only
node scripts/novel-characters.mjs images cast.json --dry-run     # print what would be submitted
node scripts/novel-characters.mjs images cast.json --style-ref auto  # pin the style to the first sheet
node scripts/novel-characters.mjs render cast.json --html       # build report.html
node scripts/novel-characters.mjs slug "胡二爷"                  # filesystem-safe name
```

## Autopilot

When the `production.json` at the work-directory root (produced by `novel-setup`) carries `"autopilot": true`, this skill runs its stage **end to end**: it does not ask about report language or how many characters to sheet; it reviews the merge candidates itself (when unsure, it leaves them separate) and generates every selected character's sheet in one go. Every decision it made goes into the final report.

**It transfers approval, it does not remove checkpoints**: validation still has to pass, the image step still prints how many sheets it is about to generate, and the results still get checked — it just does not wait for a nod. Written as `false`, left out, or with no `production.json` at all, nothing changes. When `validate` finds the file with the flag on, it prints `↳ 自动驾驶：开启`.

## Limits

- Caps at 24 chunks (~930k characters net of overlap) per run. Beyond that it reports `truncated` explicitly — it does **not** silently drop the tail
- Human-readable fields follow `--lang`; image and TTS prompts are **always English**, since those engines work best that way regardless of report language
- Every selected character has a handoff job. Use `--only` to limit the plan; `--style-ref auto` includes the anchor dependency. Actual generation and costs belong to ly-image.
- **Art style can still vary across a cast**, since each character is generated independently. It used to drift badly under the old "flat vector cartoon" wording — one run produced anime-ish, semi-realistic and ink-wash results side by side. Copying the whole style block from `production.json` verbatim into every prompt fixed most of that, but not all of it. Passing `--style-ref auto` feeds the first sheet back as a reference for the rest, which helps; see `references/sheet.md`

> Actual generation uses the independently installed [ly-image skill](https://github.com/Din-Studio/skills). It requires Node 22.20+ and can reuse private `~/.config/ly/config.json`. Read [handoff and recovery](references/media-handoff.md); never store secrets in requests or the repository. Missing tools or authorization means prompts/plans only, not generated images.

## Files

```
SKILL.md                 the workflow the agent reads
scripts/
  novel-characters.mjs   chunk / merge / assemble / validate / images / render / slug
  lib/media-plan.mjs    offline handoff plan; no gateway calls
  selftest.mjs           439 assertions, never calls a model or the network
references/
  roster-pass.md         pass 1: scanning for characters
  profile-pass.md        pass 2: building a character sheet (8 hard rules)
  realism.md             writing realism into the prompts (full recipe for the photoreal style; other styles take only the universal half)
  schema.md              sheet structure and which language each field takes
  sheet.md               model-sheet layout and prompt rules (the call itself is the images subcommand)
  report-style.md        design conventions for report.html
  style.md               where the art style comes from (not built in — read from production.json)
examples/
  渡口.txt                bundled short story, 4 characters
  渡口-cast.json          its output, doubling as the validation fixture
  渡口-cast.md            rendered result, a quality baseline
```

In `examples/渡口.txt` the peddler is only ever referred to by a nickname and the ferryman is addressed once as "old uncle" — the story exists specifically to exercise alias merging.

## Self-test

```bash
node scripts/selftest.mjs
```

Offline tests cover creative contracts, rendering and handoff plans, including reference dependencies, preserved prompts, file checks and retired options. No gateway calls or model usage.

**Only tested on macOS with Node 24.** There is no platform-specific code, so Linux and older Node releases should be fine, but that is **unverified**.
