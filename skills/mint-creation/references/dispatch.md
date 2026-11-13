# Prompt workflow dispatch

The main session orchestrates. Writing and review run in separate foreground, isolated Pi sessions through the packaged `mint_prompt` workflow. They use the host session's model and authentication. Neither role can delegate further or generate media.

## Prepare the brief

All artifact paths are relative to the workspace root; packaged guide paths are absolute and read-only. Resolve the actual packaged skill directories from the runtime's skill listing and verify they exist. Do not assume a developer checkout or user-level installation.

```text
mint_skill({skill:"mint-creation",args:["seed","script/作品-script.json","--eps","1-3"]})
```

Use `write` to save successful stdout to `creation/作品-creation.json`. Then prepare each episode:

```text
mint_skill({skill:"mint-creation",args:["prompts","brief","creation/作品-creation.json","--ep","1"]})
```

Use `write` to save successful stdout unchanged to `creation/.work/E01-inputs.json`. The brief contains source, episode and target seconds; current script beats and exact dialogue; prompt language and segment limits; project `creativeBrief`; current opening/ending intent; effective video model and parameters; and assets with paths, existence and `sheetHash`. Do not rewrite these inputs by hand. Regenerate after relevant upstream changes.

## Invoke the two roles

```text
workflow({name:"mint_prompt",args:{role:"mint-video-prompt-writer",task:"<complete writer brief>"}})
```

After the writer finishes, the main session runs the deterministic check:

```text
mint_skill({skill:"mint-creation",args:["prompts","check","creation/作品-creation.json"]})
```

On failure return the exact diagnostics to the writer; do not start review. On success:

```text
workflow({name:"mint_prompt",args:{role:"mint-video-prompt-reviewer",task:"<complete reviewer brief>"}})
```

The writer has `read, write, edit, grep, find, ls, mint_skill`. The reviewer has `read, edit, grep, find, ls, mint_skill`. The script tool restricts operations by role; it is not a way to regain general writes. Only the main session uses `workflow`, `workflow_control` and generation tools. If a role or workflow is unavailable, report the missing product resource and stop this phase.

Each call handles one episode. Keep calls sequential and never let two sessions edit the same worksheet. Each isolated session receives its complete brief, not the main conversation. It cannot ask the user questions; its final response reports results and blockers to the main session.

## Writer brief

Supply the actual values for every placeholder:

```text
You are the video prompt writer. Read <absolute packaged mint-video-prompt/SKILL.md path> completely and follow its referenced guides.
Task: write or revise episode <N> of <title>.
Inputs: creation/.work/E<NN>-inputs.json (workspace-relative).
Worksheet directory: creation/ (one <segment>/prompt.md per segment).
Effective video model: <model>.
Round: initial / revise <segment IDs> / unblock <segment IDs and resolution>.
Submission: mint_skill({skill:"mint-video-prompt",args:["submit",<explicit workspace-relative worksheet paths>]}) after lint.
Exact structural diagnostics, if any: <unmodified prompts check output>.
Read review comments from the worksheets. Edit only shot structure, prompt body and the current writer response; do not edit review comments or approve your work.
Report segment durations, cut counts, worksheet states, declined suggestions with reasons, and problems outside your authority. Do not delegate or generate media.
```

## Reviewer brief

```text
You are the independent video prompt reviewer. Read <absolute packaged mint-video-prompt-review/SKILL.md path> completely and follow its referenced guides.
Task: review episode <N> of <title>.
Inputs: creation/.work/E<NN>-inputs.json (use this exact file when approving).
Worksheets: <explicit workspace-relative paths for the entire episode>.
Record verdicts only for segments currently in_review: <segment IDs>.
Effective video model: <model>.
The main session's prompts check passed beat coverage, exact dialogue, duration, prompt structure and reference checks.
Edit only current review comments, then call mint_skill with skill mint-video-prompt-review and args beginning with verdict. Approval requires --inputs and the input path above.
Report each verdict, required changes, blockers, cross-segment continuity risks and checks that require actual video. Do not rewrite shot structure or prompt bodies, delegate, or generate media.
```

Never send the writer's report, self-evaluation or the main session's quality opinion to the reviewer. For a repeat review, provide the whole episode for continuity but record new verdicts only for `in_review` segments; unchanged approvals remain valid.

## State and stopping conditions

```text
mint_skill({skill:"mint-creation",args:["prompts","status","creation/作品-creation.json"]})
```

| State | Main-session action |
| --- | --- |
| Structural failure | Return the exact diagnostics to the writer; skip review. |
| Same structural failure twice consecutively | Stop and report to the user. |
| `changes_requested` | Dispatch the writer only for affected episodes and segments. |
| Three submissions without approval for a segment | Stop that segment and present reviewer comments and writer responses to the user. |
| `blocked` or a problem beyond the writer's authority | Stop affected work; resolve upstream or with the user, regenerate inputs, then ask the writer to respond and submit. |
| Approval invalidated by content or inputs | Regenerate inputs and dispatch only affected segments for submission and review. |
| Status exits zero | Apply, validate and export. |

Approval binds both shot structure/prompt content and the segment's claimed beat text, reference content hashes, model/parameters, prompt language, segment limits and project requirements. The main session does not edit any worksheet region or state header. Round counts come from the worksheet; do not create a second counter or permanent review history. `autopilot` preserves the three-round limit and blocking rules.

## Interrupted work

Use the returned `runId` with the control tool:

```text
workflow_control({action:"status",runId:"<returned runId>"})
workflow_control({action:"cancel",runId:"<returned runId>"})
```

There is no workflow resume action. Before a new invocation, inspect the existing worksheets, `prompts status`, and any active run. Resume only the unfinished phase with a new complete brief. Do not submit already submitted worksheets again merely because a response was interrupted; that increments the round. Do not repeat completed generation. The main session inspects saved canvas task/output identities before continuing the media handoff.

Report per-segment state and round, reviewer suggestions, unresolved disagreements and items requiring real video validation. Prompt approval permits the generation phase; it does not establish spending authorization or finished-video quality.
