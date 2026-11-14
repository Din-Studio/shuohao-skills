# mint-video-prompt

Contract versions: script v4, outline v5, creation v3, production v3, cast/art v1; no other versions are accepted. Scene notes are non-speaking. `cuts.audioRefs` continues an earlier owned line occurrence across cuts, segments or scenes without replaying or recounting it. Continuation chains cannot skip cuts or reorder dialogue. Parsed source IDs must match the upstream versions. Approval hashes include explicit scene assets and local opening/ending intent; unrelated segments remain unaffected. Script C/S/P IDs are local; only explicit script.assetMappings connect them to authoritative cast/art assets. Same IDs or names never confirm a mapping. Source bytes/coordinates, semantic fidelity and production review are separate checks. See the self-contained [handoff contract](references/source-audio-handoff.md).

The **writer** for reference-image-to-video prompts. Given script beats, an asset table and the project brief, it splits one episode into segments and cuts, writes the prompt for each segment into a worksheet, and submits it for review.

- Output is one worksheet per segment at `<segment>/prompt.md`: a status header, the cut structure, a review section, a writer-response section, and the prompt body below the last separator. See [worksheet](references/worksheet.md).
- Use the unified five-part prose format ([creation-prompt](references/creation-prompt.md)). The video model decides camera cuts; JSON cuts retain internal beat coverage and timing only. Technical adaptation follows the [H3](references/h3-prompt.md) or [seedance](references/seedance2-prompt.md) guide.
- When the script-stage storyboard is supplied, segment IDs, scenes and beat ranges follow it exactly, and the prose realises its start/end states, rewrites and must-show information. Storyboard problems go back to the script stage; the writer never re-segments.
- It writes only. It never reviews its own work and never generates video.
- Usually invoked as a subagent by a dispatcher, but usable on its own. Node 18+, standard library only; the directory is self-contained.

See [SKILL.md](SKILL.md) for the full procedure. The bundled example is this skill's own story, [The Seventh Lamp](examples/第七盏灯/故事提案.md).

[Explicit identity handoff](references/asset-identity-handoff.md): cast/art own asset specifications, paths and evidence. Only actual cut/image dependencies need confirmed mappings. Unrelated assets do not revoke approval. Standalone use is not a completed project pipeline.
