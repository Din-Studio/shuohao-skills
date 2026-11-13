# Canvas media handoff

The creative script exports a self-contained offline plan. The application provides `canvas_cli` and packaged scenemint-canvas guidance; read its model, node, reference, task and download sections. The host owns connection and credentials. Do not add --session, pair a daemon, install a CLI, run a subprocess or request personal credentials. Without this capability or generation authorization, deliver the plan and state that images were not generated.

```text
mint_skill({skill:"mint-characters",args:["images","characters/作品-cast.json","--out","characters/image-plan.json"]})
```

Normal and --dry-run modes are offline; --out refuses overwrite. Items contain id, model, unchanged prompt, typed params, ordered references, dependsOn and output. This is not a canvas request. Tool paths are workspace-relative. If a plan contains resolved absolute paths, verify containment in the trusted workspace and convert the same files to workspace-relative tool arguments. Never accept an outside path or blindly strip a prefix. Re-export after moving a project; data references remain relative to their owning artifact.

Keep a workspace handoff record linking item IDs and current inputs/reference hashes to observed node, task, resource/output IDs and expected paths. Inspect existing tasks and outputs before any submission. Files alone do not prove input identity. Complete and verify dependencies before generating dependent sheets.

## Prepare nodes and references

```text
canvas_cli({args:["status"]})
canvas_cli({args:["ls","/","--long"]})
canvas_cli({args:["models","--model-type","image"]})
canvas_cli({args:["read","<observed node ID>"]})
```

Follow catalog pagination, select the exact configured model and inspect its current inputSchema/localConstraints. Historical caps do not prove current availability, limits or prices. Do not substitute a model or discard constraints.

Write a workspace batch such as characters/.work/canvas-edit.json with the supported node shape:

```json
{"commands":[{"type":"add_node","kind":"gen","position":{"x":0,"y":0},"title":"<plan item id>","draft":{"mode":"image","modelId":"<observed catalog ID>","prompt":"<exact plan prompt>","aspectRatio":"<approved aspect_ratio>","resolution":"<approved resolution>"}}]}
```

Choose position from current canvas state. Map params.aspect_ratio to draft.aspectRatio and resolution to resolution. Do not paste generic params/input_data or schemas into draft. The current canvas does not send negativePrompt: a plan requiring a negative prompt or another unsupported parameter is blocked until its creative plan is revised explicitly. Never silently omit the requirement.

```text
canvas_cli({args:["apply","--file","characters/.work/canvas-edit.json"]})
```

Save returned node IDs. Existing nodes use update_node with nodeId, partial draft and expect.promptSha from read for prompt changes. Re-read after stale before revising a payload.

Reuse verified reference nodes or upload authorized workspace files with `canvas_cli({args:["upload","characters/images/<reference>.png","--title","<reference title>"]})`. Connect observed source and target IDs in plan order using a separate apply batch:

```json
{"commands":[{"type":"connect","source":"<reference node ID>","target":"<generation node ID>","targetHandle":"reference"}]}
```

Once references have outputs, read the target's references and mentionCandidates. Copy mention syntax only from the response and preserve reference order and approved prompt content. If mention requirements alter content or reference order cannot be represented, revise and revalidate the creative plan first. Read back the prepared node to verify exact model, parameters, prompt and references.

## Submit once, inspect and download

Disclose model, node list, image count and current host cost information before spending. Report an unavailable quote as unknown, not a guessed price. Autopilot does not add spending authorization. Only the main session submits within the authorized scope:

```text
canvas_cli({args:["run","<observed node ID>","--approved"]})
canvas_cli({args:["tasks","--node","<observed node ID>"]})
canvas_cli({args:["resources","<observed node ID>"]})
canvas_cli({args:["download","<observed node ID>","--resource","<observed resource ID>","--out","characters/images/<expected-sheet>.png"]})
```

--approved asserts existing authorization; acceptance is not completion. Match successful task/output identities to saved inputs. On interrupted or uncertain submission inspect status, tasks, nodes and resources; never resubmit automatically. Resume a failed download against the same output. Preserve legacy receipts for reconciliation rather than replaying them.

Verify file presence, nonempty content and real format, then inspect face identity across both panels, equal full-body scale and details. A renamed JPEG is not a PNG; report a format mismatch or unavailable conversion. Replacements, optional cutouts and quality retries require appropriate authorization and are never automatic repeats. Verify the expected plan output before rendering reports with mint_skill and saving stdout through write. Report actual files/task IDs and unresolved quality checks.
