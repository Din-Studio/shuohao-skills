# mint-video-prompt

The upstream contract is script/outline v4; creation/production stay v3. Scene notes are non-speaking. `cuts.audioRefs` continues an earlier owned line occurrence across cuts, segments or scenes without replaying or recounting it. Continuation chains cannot skip cuts or reorder dialogue. Parsed source IDs must match the upstream versions. Approval hashes include explicit scene assets and local opening/ending intent; unrelated segments remain unaffected. Stable C/S/P IDs disambiguate same-name image files without renaming the assets. Source bytes/coordinates, semantic fidelity and production review are separate checks. See the self-contained [handoff contract](references/source-audio-handoff.md).

The **writer** for reference-image-to-video prompts. Given script beats, an asset table and the project brief, it splits one episode into segments and cuts, writes the prompt for each segment into a worksheet, and submits it for review.

- Output is one worksheet per segment at `<segment>/prompt.md`: a status header, the cut structure, a review section, a writer-response section, and the prompt body below the last separator. See [worksheet](references/worksheet.md).
- The prompt skeleton is model-agnostic ([creation-prompt](references/creation-prompt.md)); model-specific filling follows the [H3](references/h3-prompt.md) or [seedance](references/seedance2-prompt.md) guide.
- It writes only. It never reviews its own work and never generates video.
- Usually invoked as a subagent by a dispatcher, but usable on its own. Node 18+, standard library only; the directory is self-contained.

See [SKILL.md](SKILL.md) for the full procedure. The bundled example is this skill's own story, [The Seventh Lamp](examples/第七盏灯/故事提案.md).
