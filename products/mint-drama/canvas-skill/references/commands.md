# Cloud canvas command reference

Adapted from mint-agent's canvas CLI 0.18.7 cloud build. This is a focused application reference; `canvas_cli({args:["help", COMMAND]})` reports the imported CLI's complete syntax. The vendored app-web contract remains authoritative.

Every example below is the `args` array of `canvas_cli`, not a shell command. No `--session` is supplied.

| Purpose | Args |
| --- | --- |
| Inspect connection | `["status"]` |
| List nodes | `["ls", "/", "--long"]` |
| Find a literal title | `["grep", "TITLE", "--fixed"]` |
| Read a node | `["read", "NODE-ID"]` |
| Current image models | `["models", "--model-type", "image"]` |
| Exact model schema | `["models", "--model-id", "MODEL-ID"]` |
| Apply prepared changes | `["apply", "--file", "canvas/batch.json"]` |
| Run an authorized node | `["run", "NODE-ID", "--approved"]` |
| Run an authorized set | `["run-batch", "--nodes", "ID-A,ID-B", "--approved"]` |
| Inspect original tasks | `["tasks", "--node", "NODE-ID"]` |
| Inspect outputs | `["resources", "NODE-ID"]` |
| Download current output | `["download", "NODE-ID", "--out", "characters/images/character.png"]` |
| Download a selected output | `["download", "NODE-ID", "--resource", "RESOURCE-ID", "--out", "creation/E01-01/video.mp4"]` |
| Project assets | `["assets", "--kind", "image", "--limit", "20"]` |
| Insert a known project asset | `["insert-asset", "ASSET-ID", "--kind", "image"]` |

Model results include `models`, `inputSchema`, `schemaStatus`, optional `localConstraints`, and pagination via `nextOffset`. A missing schema is a blocker, not permission to guess. Consult `help upload` for importing a workspace reference and inspect the actual returned identity before connecting it.

A batch file contains `{"commands":[...]}`. A generation node uses `add_node`, never `create_node`:

```json
{"commands":[{"type":"add_node","id":"NEW-UNIQUE-ID","kind":"gen","position":{"x":0,"y":0},"title":"Plan item name","draft":{"mode":"image","modelId":"EXACT-DISCOVERED-ID","prompt":"Approved prompt","aspectRatio":"16:9"}}]}
```

Use live model constraints and existing layout before choosing the draft and position. For each verified reference node, submit a separate connection batch in the plan's order:

```json
{"commands":[{"type":"connect","source":"REFERENCE-NODE-ID","target":"TARGET-NODE-ID","targetHandle":"reference"}]}
```

Then `read` the target, obtain `mentionCandidates`, `references`, and `promptSha`, and prepare any prompt edit in a later batch:

```json
{"commands":[{"type":"update_node","nodeId":"TARGET-NODE-ID","draft":{"prompt":"Reviewed prompt using the exact returned mention syntax"},"expect":{"promptSha":"HASH-FROM-READ"}}]}
```

Do not combine new connections and unresolved mentions in one batch. Copy mention syntax exactly. Do not put local filenames into URL fields. If binding the references requires changing an approved prompt, return that changed prompt to the review process before generation. Inspect the final resolved reference order; command order alone is not proof of browser input order.

The gateway schema and canvas draft are different contracts:

| Gateway plan field | Canvas draft field |
| --- | --- |
| `prompt` | `prompt` |
| `aspect_ratio` | `aspectRatio` |
| `resolution` | `resolution` |
| `duration` | `duration` |
| `metadata.quality` | `quality` |
| `metadata.output_format` | `outputFormat` |
| `metadata.background` | `background` |
| `metadata.generate_audio` | `generateAudio` |
| `metadata.return_last_frame` | `returnLastFrame` |
| `metadata.omni_reference_task_type` | `omniReferenceTaskType` |

The cloud runtime no longer sends negative prompts; do not silently drop a plan's negative_prompt constraint. Resolve that creative change and repeat affected approval before submission.

`run` success means submission, not generation completion. `run-batch` returns submitted/pending/skipped items and a batchId. Task statuses are queued, running, succeeded, failed, or cancelled. Recover by inspecting the existing node and original tasks. Never issue another run just because a response, polling call or download was lost.
