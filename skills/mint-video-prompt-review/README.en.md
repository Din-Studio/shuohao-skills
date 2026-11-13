# mint-video-prompt-review

The **reviewer** for reference-image-to-video prompts. It independently reviews the worksheets a writer submitted, records its comments in the same worksheet, and registers a verdict.

- It judges only against script beats, the asset table, the project brief and the video model's conventions. See the [review checklist](references/审核清单.md).
- Comments are `[必须修改]` (must fix), `[建议]` (suggestion) or `[阻塞]` (blocker the writer cannot resolve alone). No must-fix and no blocker means approval. Only the current round's comments are kept.
- Approval is bound to content and inputs: a later change to the cut structure or prompt body, or to the beats, reference images, model parameters or project brief this segment relies on, invalidates it.
- It reviews only. It never rewrites the cut structure or prompt body and never generates video. See [worksheet](references/worksheet.md) for the format.
- The orchestrator calls `workflow({name:"mint_prompt",args:{role:"mint-video-prompt-reviewer",task:"<complete brief>"}})` after a deterministic prompts check, with absolute packaged guide paths and workspace-relative inputs. The isolated foreground Pi session uses the host model/authentication, has no write tool and cannot delegate. Verdicts use mint_skill with role restrictions; scripts remain self-contained.

See [SKILL.md](SKILL.md) for the full procedure. The bundled example is this skill's own story, [The Return Slip](examples/回执/故事提案.md).
