# mint-video-prompt

视频提示词**编写方**。根据剧本节拍、资产表和项目要求，完成一集的分段、分镜与参考图直出视频提示词，写入每段一份的工作单，并提交审核。

- 产物是 `<段号>/prompt.md` 工作单：状态头、分镜结构、审核意见区、编写回应区，以及最后一条分隔线之下的提示词正文。格式见 [worksheet](references/worksheet.md)。
- 提示词骨架跨模型通用，见 [creation-prompt](references/creation-prompt.md)；填法按视频模型读取 [H3](references/h3-prompt.md) 或 [seedance](references/seedance2-prompt.md) 指南。分段与停留的判断见[分镜指南](references/分镜指南.md)。
- 只编写，不审核自己的产物，不生成视频。审核由独立的审核方完成。
- The orchestrator calls `workflow({name:"mint_prompt",args:{role:"mint-video-prompt-writer",task:"<complete brief>"}})` with absolute packaged guide paths and workspace-relative inputs. This foreground isolated Pi session uses the host model/authentication and cannot delegate. Deterministic commands use mint_skill; scripts remain self-contained.

完整步骤与命令见 [SKILL.md](SKILL.md)。

## 自有样例

[《第七盏灯》](examples/第七盏灯/故事提案.md)先有故事，后有分镜：一场、六个节拍、两段、四个分镜，MiniMax H3 英文提示词。样例只有文字材料与已提交审核的工作单，没有设定图，没有生成视频。
