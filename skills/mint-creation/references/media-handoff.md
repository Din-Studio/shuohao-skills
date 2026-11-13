# Canvas video handoff

The self-contained creative scripts export plans. The application supplies the host `canvas_cli` tool and packaged scenemint-canvas guidance; read the model, node, reference, task and download sections. The host owns the chat connection and credentials. Do not add --session, pair a daemon, install a CLI, run a subprocess or request personal credentials. Without canvas capability or spending authorization, deliver the plan and report videos as not generated.

## Preserve approval and paths

```text
mint_skill({skill:"mint-creation",args:["videos","creation/manifest.json","--out","creation/video-plan.json"]})
```

Both normal and --dry-run modes are offline; --out refuses overwrite. Keep each item id, exact prompt body, model, typed params, ordered references, dependencies and output. Approval covers content and relevant upstream inputs. Immediately before submission regenerate the current plan with videos --dry-run and compare approval.input. A mismatch returns affected segments to writer/reviewer, apply and export. Plans without approval must be regenerated. Content approval is not spending authorization.

All tool file paths are workspace-relative. Plans may contain resolved absolute paths: verify containment in the trusted workspace and address the same files relatively in canvas calls. Reject paths outside the workspace; do not blindly strip prefixes. Re-export after moving a project. Manifest references themselves remain relative to the manifest.

Maintain a workspace record mapping plan item IDs and approval/input hashes to observed canvas node, task, resource/output identities and expected video.mp4 paths. Existing files alone do not prove identity. Inspect saved tasks and outputs first; completed generation must not be repeated after an interruption. Verify every referenced sheet before preparing its dependent video.

## Prepare the canvas

```text
canvas_cli({args:["status"]})
canvas_cli({args:["ls","/","--long"]})
canvas_cli({args:["models","--model-type","video"]})
canvas_cli({args:["read","<observed node ID>"]})
```

Follow pagination and match the exact plan model to an observed catalog ID. Inspect inputSchema and localConstraints, including duration and reference limits. Do not replace a model or truncate a story to meet limits.

Write a workspace batch, for example creation/.work/canvas-edit.json. This supported shape is illustrative; replace the model and all parameters with observed capabilities and the approved plan's values (duration remains a number):

```json
{"commands":[{"type":"add_node","kind":"gen","position":{"x":0,"y":0},"title":"E01-01","draft":{"mode":"video","modelId":"<observed catalog ID>","aspectRatio":"16:9","resolution":"768p","duration":6}}]}
```

Choose position from current canvas state. Map params.aspect_ratio to draft.aspectRatio, resolution to resolution and duration to duration. Other fields require an explicitly supported mapping from the packaged guidance and live catalog. Do not paste generic params/input_data into draft. Canvas does not send negativePrompt; unsupported plan fields block handoff until an explicit revision and renewed approval. Never silently drop them.

```text
canvas_cli({args:["apply","--file","creation/.work/canvas-edit.json"]})
```

Record returned node IDs. Reuse verified reference nodes or upload authorized workspace images, for example `canvas_cli({args:["upload","characters/images/<sheet>.png","--title","<reference title>"]})`. Connect observed IDs in manifest order in a separate apply batch:

```json
{"commands":[{"type":"connect","source":"<reference node ID>","target":"<video node ID>","targetHandle":"reference"}]}
```

After all reference outputs are ready, read the target's references, mentionCandidates and promptSha. Copy mention syntax only from that response, preserving Picture numbering and reference order. Use update_node with nodeId, draft.prompt and expect.promptSha, or apply's text-file form with the observed hash. Send only the approved prompt body, never worksheet state, reviewer comments or writer responses. If required mention syntax changes approved content or the ordered inputs cannot be represented, stop and return to writing/review; do not improvise an unapproved rewrite. Read back the node and verify prompt, model, parameters and reference order before running it.

## Authorization and completion

State nodes, model, final segment durations, total seconds and available current host cost information. Do not use historical caps as a price or invent an unavailable quote. Creative autopilot does not create spending authority. Only the main session submits within the authorized scope:

```text
canvas_cli({args:["run","<observed node ID>","--approved"]})
canvas_cli({args:["tasks","--node","<observed node ID>"]})
canvas_cli({args:["resources","<observed node ID>"]})
canvas_cli({args:["download","<observed node ID>","--resource","<observed resource ID>","--out","creation/E01-01/video.mp4"]})
```

--approved asserts authorization already obtained. An accepted command is not completed generation. Match successful task/output identities to the saved approval hash. On timeout, interrupted response or unknown outcome inspect status, tasks, node and resources; do not resubmit. A download failure resumes download of the same output. Old receipts may support reconciliation but must not be replayed or converted into new generation automatically.

Verify a nonempty file and actual video container, duration, aspect, movement, identity and audio. A renamed file is not a format conversion; report unsupported conversion rather than inventing a tool. Existing outputs require identity checks and authorization before replacement. New quality attempts require spending authorization and preserve stopping limits. Render only after the expected output is verified, and report actual task/file identities and remaining quality checks. Offline/fake transport checks do not establish real cloud billing, approval or video quality.
