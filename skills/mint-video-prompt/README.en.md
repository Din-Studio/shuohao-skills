# mint-video-prompt

The **writer** for reference-image-to-video prompts. Given script beats, an asset table and the project brief, it splits one episode into segments and cuts, writes the prompt for each segment into a worksheet, and submits it for review.

- Output is one worksheet per segment at `<segment>/prompt.md`: a status header, the cut structure, a review section, a writer-response section, and the prompt body below the last separator. See [worksheet](references/worksheet.md).
- The prompt skeleton is model-agnostic ([creation-prompt](references/creation-prompt.md)); model-specific filling follows the [H3](references/h3-prompt.md) or [seedance](references/seedance2-prompt.md) guide.
- It writes only. It never reviews its own work and never generates video.
- The orchestrator calls `workflow({name:"mint_prompt",args:{role:"mint-video-prompt-writer",task:"<complete brief>"}})` with absolute packaged guide paths and workspace-relative inputs. This foreground isolated Pi session uses the host model/authentication and cannot delegate. Deterministic commands use mint_skill; scripts remain self-contained.

See [SKILL.md](SKILL.md) for the full procedure. The bundled example is this skill's own story, [The Seventh Lamp](examples/第七盏灯/故事提案.md).
