[中文](README.md) · **English**

> 👋 **Open to work / collaboration** — I'm between jobs right now, and this repo is what I build in that spare time.
> Happy to hear from anyone this resonates with. Besides **remote work**, I'm also open to a **half-collaboration**: a few thousand RMB a month for living costs plus a profit share. On-site trips are possible where the work genuinely needs them. What I'm really after is finding people on the same wavelength to build something in this AI wave.
> Email: **[eternityspring@gmail.com](mailto:eternityspring@gmail.com)** · Résumé: **[resume.79px.com](https://resume.79px.com)** · WeChat **`hao_dev`** (please mention `github` when you add me)
>
> These skills are free and open source, built and battle-tested on real AI short-drama production.
> If they save you an afternoon, consider [**buying me a coffee on Ko-fi**](https://ko-fi.com/eternityspring) ☕ — it keeps the updates coming.

# shuohao-skills

**Agent skills for AI short-drama production** — from a novel to shoot-ready material: production parameters, character bibles, adaptation outlines, scene & prop bibles, screenplays, storyboards. Built for AI coding agents, **runs in pi, Claude Code, and codex**.

Here is the whole pipeline — **the production parameters lock the aspect and the models first; the outline converges the structure; script, scenes and characters iterate together; the storyboard only outputs, it makes no new decisions**:

<img src="assets/pipeline-en.webp" alt="AI short-drama production pipeline" width="680">

| Skill | What it does |
| --- | --- |
| [**novel-setup**](skills/novel-setup/README.en.md) | Locks the production parameters: image model, asset and frame resolution tier and aspect, video model, video aspect_ratio and resolution, plus style and the two languages. Written once to `production.json` at the work-directory root; the four downstream skills walk up to it before generating images or placing video jobs. Resolution and aspect are lingying's own **enum values** (`2K`, `768p`, `16:9` …), passed into `--input_data` verbatim with no pixel conversion. 7 quality gates, the one that earns its keep being **frame aspect = video aspect** |
| [**novel-outline**](skills/novel-outline/README.en.md) | Adapts a novel into a five-piece short-drama outline: adaptation notes, cast, beats, per-episode synopses, asset list (including a narrative-prop table). All 14 quality gates are script-checked; includes a checkup mode for existing outlines |
| [**novel-characters**](skills/novel-characters/README.en.md) | Turns the cast the outline settled on into a character bible: profiles, design prompts, voice prompts, model sheets. Seeds the roster from outline.json; report language and image style are both configurable |
| [**novel-art**](skills/novel-art/README.en.md) | Art bibles for AI production (scenes + narrative props): consistency anchors, lighting & state variants, scale references, no-people/no-hands white plates. Seeds from outline.json; all 13 quality gates script-checked |
| [**novel-script**](skills/novel-script/README.en.md) | Screenwriting for AI short drama: scenes + beat flow (action beats alternating with dialogue lines), per-episode duration deterministically estimated from reading speed, a gated cold-open hook in the first 3 beats, a per-character line book with voice prompts that feeds straight into TTS. All 10 quality gates script-checked |
| [**novel-storyboard**](skills/novel-storyboard/README.en.md) | Storyboarding for AI short drama: segments (one generation, ≤15s) → cuts (2–5s hard gate) → keyframes (master pinned at 0.00s, sub-frames at their cut marks), with MiniMax H3 prompt alignment and cut times audited verbatim; frames actually generated with the design sheets as references, one-command production packs that carry the video parameters, and an optional `lingying video create` ordering step. All 19 quality gates script-checked |

**Every skill renders its report in English too** — reports default to a Chinese UI; pass `--lang en` to `render` for a fully English report (data content stays as authored). The UI language can also be settled once in `production.json`.

## One page for the whole pipeline

The five stage reports can be merged into a single page with a left-hand nav — **you get a pane for every stage you actually have**:

```bash
node scripts/report.mjs --from <demo-dir> --out report.html
```

`--from` discovers the five json files using the [working-directory layout](#working-directory-layout); you can also point at each one directly (`--outline` `--cast` `--art` `--script` `--storyboard`). Ran only the character pass? You get one pane, no error.

It is an **assembler, not a separate skill**: it imports no skill code, it shells out to each skill's own `render --html` and stitches the results. So the five creative skills stay untouched, still run standalone, and are still copyable on their own — and when a skill changes its rendering, this picks it up for free.

Merging solves three problems, **all of them inside the assembler, none inside the skills**:

- **Style bleed.** The five reports share 57 class names, 13 of which mean different things in different reports (`.copy`, `.kpis`, `.badge`, `.chip`…), so every selector gets a scope prefix
- **Script bleed.** Each report's script does document-wide lookups like `document.querySelector('.expo')`. Merged, that only ever finds the first one — all five export buttons would break. Each script gets wrapped in a scoping proxy
- **Asset paths.** Each report's images are relative to its own json directory (`images/…`, `E01-01/f1.png`) and get rebased against the output file

One pane shows at a time by default (the five together run to roughly 600k characters). "Show all" in the bottom-left expands every pane so Cmd+F reaches the whole document. Number keys `1`–`5` switch panes, and `#pane-script` deep-links straight to one.

```bash
node scripts/report-selftest.mjs   # 92 assertions, no browser needed
```

Point it at a novel and you get all five:

**novel-outline · short-drama adaptation outline**

![Adaptation outline report](skills/novel-outline/assets/report.webp)

**novel-characters · character bible**

![Character bible report](skills/novel-characters/assets/report.webp)

**novel-art · art bible (scenes + props, sheets actually generated by the skill)**

![Art bible report](skills/novel-art/assets/report.webp)

**novel-script · screenplay (duration gauge + episode scripts + line book)**

![Screenplay report](skills/novel-script/assets/report.webp)

**novel-storyboard · storyboard (cut rhythm strip + master/sub keyframes actually generated by the skill + H3 prompts)**

![Storyboard report](skills/novel-storyboard/assets/report.webp)

## Install

```bash
git clone https://github.com/eternityspring/shuohao-skills.git
cd shuohao-skills
./scripts/install.sh
```

It detects whether you have pi, Claude Code, or codex installed and **symlinks** every skill into place — so `git pull` takes effect immediately, with no reinstall.

```bash
./scripts/install.sh novel-characters   # just one skill
./scripts/install.sh --codex            # only into codex
./scripts/install.sh --pi               # only into pi
./scripts/install.sh --uninstall        # remove the symlinks
```

Prefer to do it by hand:

```bash
ln -s "$PWD/skills/novel-characters" ~/.claude/skills/novel-characters
ln -s "$PWD/skills/novel-characters" ~/.codex/skills/novel-characters
ln -s "$PWD/skills/novel-characters" ~/.pi/agent/skills/novel-characters
```

**pi has a second route**: install the whole repository as a pi package and all six skills come in at once, with `git pull` still taking effect immediately:

```bash
pi install /path/to/shuohao-skills                        # local directory
pi install git:github.com/eternityspring/shuohao-skills   # straight from GitHub
```

The repository's root `skills/` directory is pi's convention directory — **no `package.json` required**. Once installed, `pi config` toggles them individually.

## What differs between the three agents

The workflow, the scripts and the artifacts are identical across all three. Only two things differ — **neither changes the result, only how you type the command and how fast it runs**:

| | pi | Claude Code | codex |
| --- | --- | --- | --- |
| Skill command | `/skill:novel-outline` | `/novel-outline` | `/novel-outline` |
| Sub-agent concurrency | **None** — the core ships without sub-agents, built-in todos or background bash | Task | subagent |

Asking in plain words ("break this book down into characters", plus the path) works on all three and is equivalent to typing the command.

Every step in a SKILL.md that says "fan out to sub-agents if you have them" simply runs in sequence inside the current session on pi: breaking down an 800k-character novel takes several times longer, but the merge, the quality gates and the report come out word for word the same. **The "submit concurrently" in image and video generation has nothing to do with sub-agents** — that means firing off the requests without waiting and polling a list of task ids, which pi does exactly the same way.

## Requirements

| | Required? | Notes |
| --- | --- | --- |
| **Node** | Yes | ≥ 18. The skill scripts use only the standard library — **no npm dependencies, nothing to install** |
| **Model quota** | Yes | The writing stages use your current session's quota. **No API key needed** |
| **lingying CLI** | Optional | Needed for **image and video generation**. Put it on your PATH (or at `bin/lingying` in the work directory) and write the credentials into `~/.config/lingying/config.json` (`api_key`, plus `assethub_admin_token` for reference images). Without it, generation steps are skipped and everything else still runs |

> **Note on output language.** These skills are Chinese-first. `novel-characters` produces Chinese character profiles even for an English source novel, and its validator actively rejects English in those fields. See that skill's README for what it would take to change.

## Repository conventions

One directory per skill, **self-contained and copyable on its own**:

```
skills/<skill-name>/
├── SKILL.md          the workflow the agent reads (required)
├── README.md         the docs a human reads
├── scripts/
│   ├── <name>.mjs    deterministic helpers, zero dependencies
│   └── selftest.mjs  self-test, never calls a model (required)
├── references/       detailed instructions, loaded on demand
├── examples/         bundled samples that double as test fixtures
└── assets/           screenshots
```

One file lives outside that layout: **`production.json` sits at the work-directory root**, not inside any skill's output directory. It holds the technical parameters the whole drama shares, and the four downstream skills find it by walking **up to 5 levels up** from their own output directory. Put it in a subdirectory and the other skills stop finding it.

Two hard requirements:

- Every skill must have a `SKILL.md`
- Every skill must have a `scripts/selftest.mjs` that **calls no model and costs no quota**, covering all deterministic logic

Run every self-test before adding a skill:

```bash
for f in skills/*/scripts/selftest.mjs; do node "$f"; done
```

There is no CI — the self-tests run in about a second, so running them locally beats waiting on a pipeline. **Only tested on macOS with Node 24**; there is no platform-specific code, so Linux and older Node releases should be fine, but that is unverified.

## Working-directory layout

Running a novel through all five stages produces a pile of `*.json` / `*.md` / `*-report.html`. **Do not flatten them into the root.** Every skill except `novel-setup` writes into its own stage directory, one per pipeline stage:

```
<work-dir>/
├── production.json ← novel-setup's output: production parameters, **lives at the root**
├── outline/       ← novel-outline:    <drama>-outline.json / .md / outline-report.html
├── characters/    ← novel-characters: <drama>-cast.json / .md / report.html + images/
├── art/           ← novel-art:        <drama>-art.json / .md / art-report.html + images/
├── script/        ← novel-script:     <drama>-script.json / .md / script-report.html
├── storyboard/    ← novel-storyboard: <drama>-storyboard.json / .md / storyboard-report.html
│   ├── manifest.json  ← from `export`
│   ├── E01-01/        ← one folder per segment (prompt.md + f1..fN.png + video.mp4 once ordered)
│   ├── E01-02/
│   └── …
├── docs/          ← notes you write yourself, kept apart from generated output
└── scripts/       ← helper scripts for running the pipeline
```

Key points:

- **`production.json` stays at the root**, never inside a stage directory — the five downstream skills walk up to find it, and a subdirectory hides it from all but one of them.
- **One directory per skill.** New characters or scenes go into the matching stage directory; the root stays clean.
- **The storyboard's `manifest.json` and `E01-0x/` packs belong in `storyboard/`**, exactly as `export --out .` writes them. **Do not tuck the segment folders one level deeper** (say, into `segments/`): the report links its frames by the relative path `<segment>/f<n>.png`, so the HTML and the segment folders must be siblings. Nest them and every embedded frame **silently** turns into a "not generated" placeholder — no error.
- **Every skill checks its own landing spot.** When `validate` finds `production.json` it also compares where the artifact sits, and names the right directory if it is wrong. A misplaced file costs no re-rendering, so this is a notice rather than a gate — but staying silent would be worse, since `--from` discovery finds nothing when the files are flattened. With no `production.json` there is no way to tell where the work-directory root is, and the check says so instead of guessing.
- **Report HTML can always be re-rendered** and images re-generated from the prompts — commit `json` / `md` / `docs` / `scripts` and gitignore the report HTML plus the `png` / `mp4` inside the segment folders.


## License

[Apache 2.0](LICENSE)
