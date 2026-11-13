[中文](README.md) · **English**

> 👋 **Open to work / collaboration** — I'm between jobs right now, and this repo is what I build in that spare time.
> Happy to hear from anyone this resonates with. Besides **remote work**, I'm also open to a **half-collaboration**: a few thousand RMB a month for living costs plus a profit share. On-site trips are possible where the work genuinely needs them. What I'm really after is finding people on the same wavelength to build something in this AI wave.
> Email: **[eternityspring@gmail.com](mailto:eternityspring@gmail.com)** · Résumé: **[resume.79px.com](https://resume.79px.com)** · WeChat **`hao_dev`** (please mention `github` when you add me)
>
> These skills are free and open source, built and battle-tested on real AI short-drama production.
> If they save you an afternoon, consider [**buying me a coffee on Ko-fi**](https://ko-fi.com/eternityspring) ☕ — it keeps the updates coming.

# shuohao-skills

**Agent skills for AI short-drama production** — from a novel to shoot-ready material: production parameters, character bibles, adaptation outlines, scene & prop bibles, screenplays, shot planning, and reference-sheet-to-video ordering. Cloud execution is packaged in **products/mint-drama** for Mint's host-managed Pi runtime.

Here is the whole pipeline — **the production parameters lock the aspect and the models first; the outline converges the structure; script, scenes and characters iterate together; creation segments the script and mounts existing design sheets directly**:

<img src="assets/pipeline-en.svg" alt="AI short-drama production pipeline" width="680">

| Skill | What it does |
| --- | --- |
| [**mint-setup**](skills/mint-setup/README.en.md) | Locks asset-image and video models, resolution tiers and independent aspect ratios, plus art style, languages and autopilot. Writes `production.json` at the work-directory root for the five creative skills. Optional creative requirements are plain language and independent of aspect ratio |
| [**mint-outline**](skills/mint-outline/README.en.md) | Defines the audience promise, stable story beats, episode endings, optional arcs and assets. A local guide supports different creative goals without universal payoff or ending requirements |
| [**mint-characters**](skills/mint-characters/README.en.md) | Turns the cast the outline settled on into a character bible: profiles, design prompts, voice prompts, model sheets. Seeds the roster from outline.json; report language is configurable and the art style is copied whole from `production.json` |
| [**mint-art**](skills/mint-art/README.en.md) | Art bibles for AI production (scenes + narrative props): consistency anchors, lighting & state variants, scale references, no-people/no-hands white plates. Seeds from outline.json; base contracts and production parameters are checked |
| [**mint-script**](skills/mint-script/README.en.md) | Writes scenes and beat flow, claims outline beats by stable ID, locates openings and endings, and reconciles upstream target duration. Opening landings are optional, ending coordinates are computed, and estimated time is not measured performance |
| [**mint-creation**](skills/mint-creation/README.en.md) | Turns the script into segments and cuts, mounts existing character/scene/prop sheets without generating intermediate frames, and writes model-specific video prompts. `export` creates production packs; `videos` exports an offline plan; the host canvas_cli handles authorized generation, task inspection and downloads. Shot expression is reviewed against the guide; model limits remain deterministic checks |
| [**mint-video-prompt**](skills/mint-video-prompt/README.en.md) | The prompt writer: splits an episode into segments and cuts, writes each segment's prompt into a worksheet (`<segment>/prompt.md`) and submits it for review; revises and resubmits when changes are requested. Dispatched by mint-creation through the isolated mint_prompt workflow |
| [**mint-video-prompt-review**](skills/mint-video-prompt-review/README.en.md) | The prompt reviewer: independently checks worksheets against the script, assets, project brief and model conventions, records comments in the same worksheet and registers `approved`, `changes_requested` or `blocked`. It never rewrites the prompt |

**Every skill renders its report in English too** — reports default to a Chinese UI; pass `--lang en` to `render` for English interface labels (story content and raw diagnostics retain their original language). The UI language can also be settled once in `production.json`.

**To run the whole thing without interruptions**, switch on autopilot in `production.json` (`mint-setup init --autopilot`): reading `"autopilot": true`, each of the five creative skills runs its own stage end to end — no questions, no waiting for sign-off, deciding for itself and listing every decision in its final report. **It transfers approval, it does not remove checkpoints**: gates stay gates, money is still costed first, and loss limits still apply. Off by default.

## Creative guides and data versions

Outline, script and creation each carry a self-contained `references/创作指南.md`. Store optional project requirements as natural-language `production.json.creativeBrief`. There are no four-dimensional profile selections, guide versions, source hashes or policy-application commands. Visual prose remains in `production.json.style`; framing does not dictate pacing.

JSON stores story content and necessary handoff relationships. Adaptation notes, question tracking, arcs and beat categories are optional where appropriate. Stable beat claims, asset references, explicit promises and model limits remain checked. Duration estimates are advisory, not measured performance.

**Breaking data change:** production, outline, script and creation require `schemaVersion: 3`. Back up old projects, preview `migrate-v3`, review semantic merges, and write a new file following each skill's migration guide. Changing only the version number is not a migration. Guide edits do not invalidate existing artifacts. Structural checks and content review remain separate; missing upstream data prevents claims of joint verification.

## One page for the whole pipeline

The five stage reports can be merged into a single page with a left-hand nav — **you get a pane for every stage you actually have**:

Developer-only report rendering check from the repository root; the cloud model uses each stage's mint_skill render instead:

```sh
node scripts/report.mjs --from <demo-dir> --out report.html
```

`--from` discovers the five json files using the [working-directory layout](#working-directory-layout); you can also point at each one directly (`--outline` `--cast` `--art` `--script` `--creation`). Ran only the character pass? You get one pane. Ambiguous automatic discovery requires an explicit file path. Failed renderers are named in the report and cause a nonzero exit code.

It is an **assembler, not a separate skill**: it imports no skill code, it shells out to each skill's own `render --html` and stitches the results. The five creative skills provide their own renderers, still run standalone, and are still copyable on their own — and when a skill changes its rendering, this picks it up for free.

Merging solves three problems, **all of them inside the assembler, none inside the skills**:

- **Style bleed.** Reports reuse class names with different meanings (`.copy`, `.kpis`, `.badge`, `.chip`…), so every selector gets a scope prefix
- **Script bleed.** Each report's script does document-wide lookups like `document.querySelector('.expo')`. Merged, that only ever finds the first one — all five export buttons would break. Each script gets wrapped in a scoping proxy
- **Asset paths.** Each report's images are relative to its own json directory (`images/…`, `../art/images/…`) and get rebased against the output file

One pane shows at a time by default. "Show all" in the bottom-left expands every pane so Cmd+F reaches the whole document. Number keys `1`–`5` switch panes, and `#pane-script` deep-links straight to one.

Developer-only terminal self-tests from the repository root:

```sh
node scripts/report-selftest.mjs   # assembler unit tests
node scripts/pipeline-selftest.mjs # real rendering, interaction adapters, isolated install tests
```

The following screenshots show historical interfaces. Render the local samples for the current report UI:

**mint-outline · short-drama adaptation outline**

![Adaptation outline report](skills/mint-outline/assets/report.webp)

**mint-characters · character bible**

![Character bible report](skills/mint-characters/assets/report.webp)

**mint-art · art bible (scenes + props, sheets actually generated by the skill)**

![Art bible report](skills/mint-art/assets/report.webp)

**mint-script · screenplay (duration gauge + episode scripts + line book)**

![Screenplay report](skills/mint-script/assets/report.webp)

**mint-creation · video creation (segments, cuts, reference mounts, prompts and ordering)**

Includes its own example and offline report renderer. See [mint-creation](skills/mint-creation/README.en.md).

The main session seeds inputs, dispatches the isolated mint-video-prompt-writer workflow, runs deterministic prompts check, then dispatches mint-video-prompt-reviewer independently. Only valid approved worksheets can be applied, exported and handed off. Approval binds segment content and its beat/reference/model/requirement inputs; changes invalidate only affected segments. Stop after three submissions without approval, two consecutive structural failures for the same reason, or a blocked review. Resolve blockers with the user or upstream before continuing. Generation remains a separate authorized canvas phase.

## Mint cloud product

[products/mint-drama](products/mint-drama) assembles the eight canonical skills, prompt roles and workflow into a self-contained product package. Developers run the following in that directory with Node 24 and the package's pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm assemble
pnpm test
```

These are developer-only commands. The model does not invoke bash, install packages or execute scripts. It uses workspace read/write/edit/find/grep/ls and deterministic tool calls:

```text
mint_skill({skill:"mint-setup",args:["init","--aspect","9:16","--video-model","MiniMax H3","--video-resolution","768p"]})
```

Args preserve CLI operation/option tokens without node or a script path. All artifact paths are workspace-relative. Use supported --out flags for exports; for stdout-only init/seed/render operations, save successful stdout with write. There are no pipes, redirection, directory changes or shell globs. Deterministic scripts retain standard-library-only implementations and do not import sibling skills.

Writer and reviewer use `workflow({name:"mint_prompt",args:{role:"mint-video-prompt-writer",task:"<complete brief>"}})` and role mint-video-prompt-reviewer. Briefs supply absolute packaged guide paths and workspace-relative input/worksheet paths. These foreground isolated Pi sessions share host model/authentication and cannot delegate. The main session runs mint_skill prompts check between them. workflow_control accepts status or cancel with runId; after interruption inspect worksheets and resume only the unfinished phase with a new workflow call.

The host supplies canvas_cli, connection identity and credentials. Plans map to supported canvas nodes and ordered references, then authorized run, tasks/resources inspection and download to expected workspace outputs. Read each stage's media-handoff reference. Preserve content/input hashes and approvals; unsupported parameters block handoff. No --session, daemon pairing, CLI subprocess or personal credentials. Autopilot does not add spending authority, and uncertain/completed tasks are not resubmitted.

Local package and fake-transport tests do not establish real cloud approval, billing, browser delivery or generation quality; those checks belong to later Mint integration.

> **Note on output language.** These skills are Chinese-first. `mint-characters` produces Chinese character profiles even for an English source novel, and its validator actively rejects English in those fields. See that skill's README for what it would take to change.

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

Developer-only terminal self-test sweep from the repository root:

```sh
for f in skills/*/scripts/*selftest.mjs scripts/*-selftest.mjs; do node "$f" || exit; done
```

There is no CI. Run the local tests, including cross-stage integration, explicit migration and isolated-copy checks. The cloud product requires Node 24.22.1+. Some legacy suites require POSIX paths and file symlinks; use Linux for the complete sweep. See the [integration verification record](docs/mint-cloud-runtime-integration-plan.md#verification-record) for actual results and cloud checks still deferred.

## Working-directory layout

Running a novel through all five stages produces a pile of `*.json` / `*.md` / `*-report.html`. **Do not flatten them into the root.** Every skill except `mint-setup` writes into its own stage directory, one per pipeline stage:

```
<work-dir>/
├── production.json ← mint-setup's output: production parameters, **lives at the root**
├── outline/       ← mint-outline:    <drama>-outline.json / .md / outline-report.html
├── characters/    ← mint-characters: <drama>-cast.json / .md / report.html + images/
├── art/           ← mint-art:        <drama>-art.json / .md / art-report.html + images/
├── script/        ← mint-script:     <drama>-script.json / .md / script-report.html
├── creation/      ← mint-creation: <drama>-creation.json / .md / creation-report.html
│   ├── manifest.json  ← from `export` (each segment's mounted reference list, no sheet files copied)
│   └── E01-01/…       ← one folder per segment (prompt.md + video.mp4 once ordered, no frame images)
├── docs/          ← notes you write yourself, kept apart from generated output
└── scripts/       ← helper scripts for running the pipeline
```

Key points:

- **`production.json` stays at the root**, never inside a stage directory — the five downstream skills walk up to find it, and a subdirectory hides it from all but one of them.
- **One directory per skill.** New characters or scenes go into the matching stage directory; the root stays clean.
- **Video packs belong in `creation/`**: `manifest.json` sits beside `E01-0x/`. Reference sheets remain under `characters/images/` and `art/images/`, linked by relative paths rather than copied into frame images.
- **Every skill checks its own landing spot.** When `validate` finds `production.json` it also compares where the artifact sits, and names the right directory if it is wrong. A misplaced file costs no re-rendering, so this is a notice rather than a gate — but staying silent would be worse, since `--from` discovery finds nothing when the files are flattened. With no `production.json` there is no way to tell where the work-directory root is, and the check says so instead of guessing.
- **`mint-creation` is the video-creation stage after the screenplay.** It supports both the five-stage merged report and standalone `render --html`. Its renderer requires `--script`; supply `--outline`, `--art` and `--cast` for reference identities and richer display.
- **Report HTML can always be re-rendered** and images re-generated from the prompts — commit `json` / `md` / `docs` / `scripts` and gitignore the report HTML plus the `png` / `mp4` inside the segment folders.


## License

[Apache 2.0](LICENSE)
