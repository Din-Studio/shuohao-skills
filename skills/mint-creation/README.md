# mint-creation

Build reference-sheet-to-video plans from v3 scripts without intermediate storyboard images or upstream story rewriting. The main session orchestrates a writer workflow, deterministic prompts check and independent reviewer workflow, then applies, exports and hands off only approved segments.

- JSON 保存段、镜头、真实节拍认领和资产关系。阶段目标与边界见[创作指南](references/创作指南.md)，派发与循环规则见[调度手册](references/dispatch.md)。
- 每段一份工作单 `<段号>/prompt.md`：状态头、分镜结构、审核意见、编写回应和提示词正文。批准同时绑定这一段的内容与它依据的输入（认领节拍的原文、参考图内容、模型与参数、项目要求），任何一样变化，这一段的批准失效，别的段不受影响；未批准的段不能导出，也不能进入生成计划。
- Dispatch through `workflow({name:"mint_prompt",args:{role:"mint-video-prompt-writer",task:"<complete brief>"}})` or role mint-video-prompt-reviewer. Supply absolute packaged guide paths and workspace-relative inputs. Foreground isolated Pi sessions share host model/authentication and cannot delegate. The main session uses mint_skill between roles; stop after three unapproved submissions or two identical structural failures. workflow_control accepts status/cancel with runId; after interruption inspect worksheets and finish only the unfinished phase.
- opening/ending 读取当前大纲或独立剧本；结束坐标从实际正文计算，不持久化。可选 openingBeat 只保留上游显式标注，缺省不伪造映射。
- 不需要策略选择、摘要或应用流程。项目要求采用唯一的自然语言 creativeBrief。
- 保留模型时长硬限制、参考图身份与顺序、台词原文和镜头顺序覆盖检查。没有通用镜头建议时长硬门。
- 报告先展示分镜正文，再展示资产与当前交接、估时和结构检查状态。支持中文／英文。
- 显式 v2 → v3 迁移默认预览，保留输入和语义工作记录，拒绝覆盖目标。

## 使用

See [SKILL.md](SKILL.md) for mint_skill calls and developer-only self-tests, [schema](references/schema.md) for data and [migration](references/migration.md) for old inputs. Deterministic scripts remain standard-library-only and self-contained. The products/mint-drama package supplies both roles and guides.

Production and unique upstream files are discovered locally; ambiguous, damaged or unreadable inputs fail, and missing upstream checks are skipped explicitly. Authorized generation uses the host canvas_cli with cost disclosure, saved input hashes and task/output identities; see [canvas handoff](references/media-handoff.md). Tests do not establish real cloud generation.

## 自有样例

《收书人》先有故事，后有分镜。一集、四段、九个镜头、十个节拍；目标三十秒，镜头计划三十二秒。陈叙只获得妹妹的旧书线索，没有找到妹妹。本轮只迁移数据表达，没有重创故事、台词或分镜。沿用既有图片，不声称本轮生成。样例早于审核流程，没有附带工作单，不能直接导出；完整流程由自测在临时目录里覆盖。迁移决定及实际成片限制见 [MIGRATION.md](examples/MIGRATION.md)。

HTML 是可重建报告，不进入版本控制。结构有效不代表内容质量或成片效果通过。
