---
name: mint-creation
version: 3.1.0
description: |
  Convert a v3 screenplay into reference-sheet-to-video segments, cuts, approved prompt worksheets and production packs.
  The main session prepares inputs and deterministic checks; isolated writer and reviewer workflows handle prompt content.
  No intermediate storyboard images. Video generation is optional and requires authorization.
  Use when asked to 直出视频、参考图生视频、不出分镜图、跳过分镜图 for AI drama.
allowed-tools: read write edit grep find ls mint_skill workflow workflow_control canvas_cli
triggers:
  - mint-creation
  - 直出视频
  - 参考图生视频
metadata:
  license: Apache-2.0
  runtimes: [mint-cloud]
---

# mint-creation

`{baseDir}` is this packaged skill directory. Deterministic scripts remain self-contained and standard-library-only. The model invokes `mint_skill` with command tokens, never a script path or shell. All artifact paths are relative to the workspace root. Use read/write/edit/find/grep/ls for workspace files; resolve packaged guides through the runtime's skill listing.

The main session orchestrates: it does not write cuts or prompts, review content, or edit worksheet regions. Writer and reviewer work in separate foreground isolated Pi sessions, using the host model and authentication, and collaborate only through each segment's `prompt.md`. Neither role delegates further. Read [dispatch](references/dispatch.md) for complete briefs and interruption handling.

```text
seed -> writer workflow -> prompts check -> reviewer workflow -> prompts status
          ^ structural errors                 | changes_requested
          +-----------------------------------+
all approved -> prompts apply -> validate -> export -> authorized canvas generation
```

## 1. Confirm inputs

Read [schema](references/schema.md) and [dispatch](references/dispatch.md). Script, outline, creation and production require `schemaVersion:3`; use explicit `migrate-v3` for old data as described in [migration](references/migration.md). Formal validation/rendering does not read old formats.

Natural-language `creativeBrief` is the project requirement, not an enum or generated rule. Standalone creation may hold a brief; if both project and stage briefs exist, stop for a human merge into production. Commands search up to five levels from the artifact for production.json and discover unique upstream files in script/outline/art/characters. Explicit paths win. Missing upstream is reported as skipped; damaged, unreadable or ambiguous input fails. A standalone screenplay does not need a fabricated outline.

Verify that the packaged mint-video-prompt and mint-video-prompt-review guides and roles exist. Missing workflow resources block this phase; report the missing path.

## 2. Prepare the skeleton

```text
mint_skill({skill:"mint-creation",args:["seed","script/作品-script.json","--eps","1-3"]})
```

Save successful stdout with `write` to `creation/作品-creation.json`. Seed fills only the `seedScenes` beat draft; segments remain empty. Work in batches of at most three episodes by default. Creation does not store opening, ending or endBeat: current plans come from outline, or the standalone script. Optional openingBeat copies only explicit script annotations and is reconciled exactly; ending coordinates come from actual flow.

```text
mint_skill({skill:"mint-creation",args:["prompts","brief","creation/作品-creation.json","--ep","1"]})
```

Save successful stdout unchanged with `write` to `creation/.work/E01-inputs.json`. It includes beats, assets, requirements, effective model and opening/ending intent. Each worksheet lives at `creation/<segment>/prompt.md`. For an existing creation with segments but no worksheets, use `prompts init` through mint_skill to create drafts without overwriting existing worksheets.

## 3. Writer and reviewer loop

1. Invoke `workflow({name:"mint_prompt",args:{role:"mint-video-prompt-writer",task:"<complete brief with absolute packaged guide paths and workspace-relative inputs and worksheets>"}})`. Include the effective video model and, for revisions, the affected segments and exact structural diagnostics.
2. Run the deterministic check in the main session:

   ```text
   mint_skill({skill:"mint-creation",args:["prompts","check","creation/作品-creation.json"]})
   ```

   It assembles worksheets in memory and checks beat coverage, verbatim dialogue, duration, model limits, prompt structure and references without changing files or requiring approval. Return failures unchanged to the writer; do not start review.
3. Invoke `workflow({name:"mint_prompt",args:{role:"mint-video-prompt-reviewer",task:"<complete independent brief with absolute packaged guide paths and workspace-relative inputs and worksheets>"}})`. Supply the same inputs and all episode worksheets, but never the writer's report or self-evaluation. Approval must bind the supplied input file.
4. Inspect state:

   ```text
   mint_skill({skill:"mint-creation",args:["prompts","status","creation/作品-creation.json"]})
   ```

   Exit zero means every segment has valid approval. For changes_requested, dispatch only affected episodes. For blocked, stop the affected segments, resolve upstream issues or obtain a user decision, regenerate inputs, then ask the writer to respond and submit.

Stop a segment after three submissions without approval; present the reviewer/writer disagreement to the user. Stop after two consecutive structural failures with the same cause. `production.autopilot === true` preserves these limits.

Approval binds both the segment's shot structure/body and the inputs it relies on: claimed beat text, reference content, model and parameters, prompt language, segment limits and project requirements. A change invalidates only affected segments. Status identifies the change; regenerate inputs and repeat writing/review for those segments. Do not manually repair state headers.

For an interrupted workflow, inspect `workflow_control({action:"status",runId:"<returned runId>"})`; cancel an active run with action cancel when needed. There is no resume action. Inspect worksheets and status before a new workflow call and finish only the unfinished phase. Never repeat completed generation.

## 4. Apply, validate and render

```text
mint_skill({skill:"mint-creation",args:["prompts","apply","creation/作品-creation.json"]})
mint_skill({skill:"mint-creation",args:["validate","creation/作品-creation.json"]})
mint_skill({skill:"mint-creation",args:["checkup","creation/作品-creation.json"]})
mint_skill({skill:"mint-creation",args:["render","creation/作品-creation.json","--md"]})
mint_skill({skill:"mint-creation",args:["render","creation/作品-creation.json","--html","--lang","zh"]})
```

Save the two render stdout values with `write` to `creation/作品-creation.md` and `creation/creation-report.html`. Render has no `--out`. If discovery is ambiguous, pass explicit workspace-relative `--script`, `--outline`, `--art` and `--cast` paths.

Apply requires valid approvals and a passing structural check, writes cuts/prompts into creation.json, and removes seedScenes. Creation remains the machine data source; worksheets are the collaboration files and the source of order prompts. Checks retain unique identity, ordered beat coverage, beat claims, asset references, reference identity/order, prompts, duration and model constraints. Optional local recipe cards use `--shots <workspace-relative directory>`. Reference existence does not prove image quality.

Report pass/fail/skipped separately; failed errors block. Missing upstream is missing-upstream, not a pass. Report structural checks, reminders, missing checks and content review separately, including each segment's state/round, suggestions and checks requiring actual video. The report presents content before upstream handoffs, assets, estimates and check states. Report language zh/en is independent of promptLang. HTML is reproducible and not versioned.

## 5. Export the production pack

```text
mint_skill({skill:"mint-creation",args:["export","creation/作品-creation.json","--out","creation"]})
```

Export requires the actual screenplay and an approved, current worksheet matching creation.json for every segment. It writes manifest.json referencing existing worksheets and creation.json; it neither rewrites worksheets nor copies images. Manifest paths are relative to the manifest, and `--dir` can explicitly select another workspace worksheet directory. An exported pack is not generated media.

## 6. Optional authorized generation

Read [video order](references/video-order.md) and [canvas handoff](references/media-handoff.md). `videos` exports an offline plan even without --dry-run; --out saves a new plan and refuses overwrite. It rechecks approval against current upstream, exported parameters and prompt content, then takes only the prompt body below the last separator. Before submission regenerate the plan and compare `approval.input`; a mismatch returns affected work to writing/review.

The main session uses the host's `canvas_cli` for current model capabilities, node/reference preparation, authorized generation, task inspection and downloads. Disclose final durations and available current cost information before spending. Never substitute a model, omit an unsupported parameter, truncate the story or resubmit an uncertain task. Verify downloads before reporting completion. Without the canvas capability or spending authorization, deliver the plan and state that media was not generated.

Autopilot does not grant new spending authorization or bypass costs, technical checks, review or stopping limits. Do not introduce permanent scoring or failure accumulation; worksheets retain only the current review comments.

## Examples and developer-only self-tests

The skill's own 《收书人》 example has one episode, four segments, nine cuts and ten beats: target thirty seconds, planned cuts thirty-two seconds. Its creation predates worksheets, so cannot be exported directly; self-tests create and approve temporary worksheets. See examples/MIGRATION.md.

Developer-only terminal commands; the cloud model does not execute them:

```sh
node {baseDir}/scripts/selftest.mjs
node {baseDir}/scripts/strategy-selftest.mjs
node {baseDir}/scripts/fixes-selftest.mjs
node {baseDir}/scripts/discovery-selftest.mjs
node {baseDir}/scripts/media-plan-selftest.mjs
node {baseDir}/scripts/migration-selftest.mjs
node {baseDir}/scripts/worksheet-selftest.mjs
```

These deterministic checks do not call models or a gateway.
