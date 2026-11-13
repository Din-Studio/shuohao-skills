# Canvas media handoff

The creative script produces an offline plan and remains self-contained. The application supplies the host `canvas_cli` tool and packaged scenemint-canvas guidance. Read that guidance's model, node, reference, task and download sections before execution. The host owns the connection and credentials: do not add --session, pair a daemon, install a CLI, launch a subprocess or request personal credentials. If the canvas capability or authorization is unavailable, deliver the plan and report media as not generated.

## Plan and identity

Use `mint_skill({skill:"mint-art",args:["images","art/作品-art.json","--out","art/image-plan.json"]})`. Both normal and --dry-run modes are offline; --out refuses to overwrite an existing plan. The plan carries model, item id, unchanged prompt, typed params, ordered references, dependsOn and output. It is not a canvas apply payload.

Tool arguments and workspace file operations use workspace-relative paths. A deterministic plan may contain resolved absolute paths: verify each is inside the trusted workspace, then express that same file relative to the workspace for canvas operations. Do not strip an arbitrary prefix or use paths outside the workspace. Re-export after moving a project. Preserve references relative to their owning manifest/artifact when editing data.

Maintain a workspace handoff record mapping each item and its current inputs/reference hashes to the observed canvas node, task, output/resource identities and expected output path. Existing files alone do not prove input identity. Inspect existing tasks and outputs before new generation; process dependencies first and verify their downloads before dependent items.

## Supported canvas operations

These are tool calls, not terminal commands. Replace placeholders with observed IDs and approved plan values:

```text
canvas_cli({args:["status"]})
canvas_cli({args:["ls","/","--long"]})
canvas_cli({args:["models","--model-type","image"]})
canvas_cli({args:["read","<observed node ID>"]})
```

Follow catalog pagination and match the exact model ID; inspect inputSchema and localConstraints where present. Never substitute a model or infer current capabilities/prices from the skill's historical snapshot.

Use `write` to prepare `art/.work/canvas-edit.json` containing a supported apply batch. A minimal image node shape is:

```json
{"commands":[{"type":"add_node","kind":"gen","position":{"x":0,"y":0},"title":"<plan item id>","draft":{"mode":"image","modelId":"<observed catalog ID>","prompt":"<exact plan prompt>","aspectRatio":"<approved aspect_ratio>","resolution":"<approved resolution>"}}]}
```

Select position from current canvas state. Map only supported fields: params.aspect_ratio to draft.aspectRatio, resolution to resolution, and video duration to duration when applicable. Do not pass generic params/input_data or copy an inputSchema into draft. The current canvas does not send negativePrompt. If the plan requires a negative prompt or another unrepresentable field, stop and report the constraint; obtain a revised creative plan before generation rather than dropping it.

```text
canvas_cli({args:["apply","--file","art/.work/canvas-edit.json"]})
```

Record returned node IDs. For an existing node use update_node with nodeId, partial draft and the observed expect.promptSha for a prompt write. Re-read on stale; never overwrite a human edit using an old hash.

Reuse a verified existing reference node, or, when upload is authorized, call `canvas_cli({args:["upload","art/images/<reference>.png","--title","<reference title>"]})` and record its returned ID. In a separate apply batch connect references in plan order:

```json
{"commands":[{"type":"connect","source":"<observed reference node ID>","target":"<observed generation node ID>","targetHandle":"reference"}]}
```

Read the target's references and mentionCandidates after connections and ready reference outputs. Copy mention syntax only from that response; never guess labels or reorder Picture identities. Preserve approved prompt content. If canvas mention syntax requires a substantive prompt change or the ordered references cannot be represented, revise and revalidate the plan first. Read back the prepared node and verify prompt, model, parameters and reference order before submission.

## Authorization, recovery and delivery

State the node list, model, image count or final video seconds, and current cost information available through the host. If no current quote is available, report that unknown instead of inventing a price. Creative autopilot does not extend spending authorization. Only the main session submits within the authorized scope:

```text
canvas_cli({args:["run","<observed node ID>","--approved"]})
canvas_cli({args:["tasks","--node","<observed node ID>"]})
canvas_cli({args:["resources","<observed node ID>"]})
canvas_cli({args:["download","<observed node ID>","--resource","<observed resource ID>","--out","art/images/<expected-sheet>.png"]})
```

--approved asserts existing authorization. An accepted run is not finished media. Inspect tasks and resource identities, and download the successful output that matches the saved inputs. On interruption, timeout or unknown submission outcome, inspect status, tasks, node and resources; do not resubmit. A download failure resumes download of the same output. Existing legacy receipts may help manual reconciliation but are not permission to rerun old tasks.

Verify that the file exists, is nonempty and has the expected real media format. Check image composition, identity, consistency anchors, no people/hands and prop scale; for video check duration, motion, aspect and audio. A renamed JPEG is not a PNG. Report format mismatch or unsupported conversion; do not invent a conversion tool. Do not overwrite existing output without verifying identity and authorization. Optional cutouts or quality retries are separate authorized work, never automatic repeats.

Only then render the stage report with mint_skill, save returned stdout with write, and report verified files and task identities. Do not claim cloud approval, billing or media quality from an offline plan alone.
