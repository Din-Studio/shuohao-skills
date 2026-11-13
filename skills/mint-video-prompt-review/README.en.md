# mint-video-prompt-review

Contract versions: script v4, outline v5, creation v3, production v3, cast/art v1; no other versions are accepted. Scene notes are non-speaking. `cuts.audioRefs` continues an earlier owned line occurrence across cuts, segments or scenes without replaying or recounting it. Continuation chains cannot skip cuts or reorder dialogue. Parsed source IDs must match the upstream versions. Approval hashes include explicit scene assets and local opening/ending intent; unrelated segments remain unaffected. Script C/S/P IDs are local; only explicit script.assetMappings connect them to authoritative cast/art assets. Same IDs or names never confirm a mapping. Source bytes/coordinates, semantic fidelity and production review are separate checks. See the self-contained [handoff contract](references/source-audio-handoff.md).

The **reviewer** for reference-image-to-video prompts. It independently reviews the worksheets a writer submitted, records its comments in the same worksheet, and registers a verdict.

- It judges only against script beats, the asset table, the project brief and the video model's conventions. See the [review checklist](references/审核清单.md).
- Reviews contain a conclusion, revision requests and pending confirmations. 通过 / 需返修 / 待确认 map to approved / changes_requested / blocked. Confirmed errors take precedence; missing evidence is coordinated before another writing round. Only the current round is kept.
- Approval is bound to content and inputs: a later change to the cut structure or prompt body, or to the beats, reference images, model parameters or project brief this segment relies on, invalidates it.
- It reviews only. It never rewrites the cut structure or prompt body and never generates video. See [worksheet](references/worksheet.md) for the format.
- Usually invoked as a subagent by a dispatcher, but usable on its own. Node 18+, standard library only; the directory is self-contained.

See [SKILL.md](SKILL.md) for the full procedure. The bundled example is this skill's own story, [The Return Slip](examples/回执/故事提案.md).

[Explicit identity handoff](references/asset-identity-handoff.md): cast/art own asset specifications, paths and evidence. Only actual cut/image dependencies need confirmed mappings. Unrelated assets do not revoke approval. Standalone use is not a completed project pipeline.
