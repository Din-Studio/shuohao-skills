# Video generation handoff

`export` writes a manifest referencing approved segment worksheets. `videos` checks those approvals against current creation and upstream inputs, validates assets and exports an offline plan. The main session hands it to the host's canvas_cli; read [canvas handoff](media-handoff.md).

```text
mint_skill({skill:"mint-creation",args:["videos","creation/manifest.json","--out","creation/video-plan.json"]})
mint_skill({skill:"mint-creation",args:["videos","creation/manifest.json","--only","E01-01","--dry-run"]})
```

Without canvas capability or generation authorization, deliver the creative work, pack and plan and state that videos were not generated. Editing, subtitles, stitching and music mixing are outside this skill.

## Parameters and references

- manifest.video.model selects the model; aspectRatio and resolution map to plan params.aspect_ratio and params.resolution. The canvas mapping then uses draft.modelId, draft.aspectRatio, draft.resolution and numeric draft.duration after checking the live catalog.
- Only the body below the last separator in prompt.md becomes the prompt. Missing state, missing approval, changed content or changed relevant beat/reference/model/requirement inputs fail. --only checks selected segments only. References retain manifest order and Picture identity; missing, empty or non-file references stop the handoff.
- Plans contain approval.manifest and approval.input. Regenerate videos --dry-run immediately before submission and compare input. Changes return affected work to writer/reviewer, apply and export.
- Resolved absolute plan paths must be verified inside the workspace and converted to workspace-relative canvas arguments. The plan is not a generic canvas request. Use observed nodes, supported connections and current model constraints; never assume all video models accept the same references.
- The expected output is each segment's video.mp4. Download the successful observed resource with canvas_cli's --out, verify the actual container and content, then render and report completion.

## Duration and costs

The self-contained historical caps provide offline validation; live catalog inputSchema/localConstraints must also pass before submission.

- Fractional seconds round upward; values below the snapshot minimum extend to that minimum with an explicit notice.
- Values above the maximum fail, including 15.04 against 15 seconds. Split the segment, validate and re-export; never truncate the story to submit.
- Non-numeric, non-finite, zero and negative durations fail; dry-run checks the same rules.
- Seedance prompts are checked again for forbidden numeric seconds, time ranges and timecodes. Editing an exported worksheet invalidates approval and requires review, apply and export again.
- Disclose final duration totals and current available cost information before spending. Historical snapshots are not prices. Content approval and autopilot do not grant additional spending authority.

## Recovery

Save plan-item/input-hash to node/task/resource/output-path mappings. Inspect canvas tasks and resources on interruption or uncertain submission; resume the original output's download and do not repeat completed generation. Retired --force, --timeout and --concurrency flags are not recovery controls. Preserve legacy .tasks.json for manual reconciliation without automatic conversion, deletion or resubmission. Quality retries are separately authorized tasks and must respect stopping limits.
