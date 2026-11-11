# 调度手册：编写与审核 subagent

主会话只调度。本文件规定派发时传什么、不传什么，以及循环怎样结束。两个 subagent 分别承担编写方与审核方；它们的写作方法与审核标准写在各自的指南里，这里不重复。

## 派发前准备

在 `<工作目录>/creation/` 下：

1. `seed` 生成本批的 creation.json 骨架（含 seedScenes）。
2. 为每一集生成一份输入材料（`.work/` 不进入版本控制）：

   ```bash
   mkdir -p .work
   node {baseDir}/scripts/novel-creation.mjs prompts brief 作品-creation.json --ep 1 > .work/E01-输入材料.json
   ```

   内容全部由命令从现有上游原样摘出，调度方不手工改写：

| 字段 | 来源 |
| --- | --- |
| `source`、`ep`、`targetSeconds` | script |
| `seedScenes` | 从当前 script 展开的这一集节拍底稿：场景、在场人物、道具、逐拍原文与估时 |
| `promptLang` | creation 或 production 的显式值，否则按模型默认 |
| `maxSegmentSeconds`、`maxOnScreen` | creation.params 的有效值 |
| `creativeBrief` | production 或独立 creation；没有就省略 |
| `intent` | 当前 outline（或独立 script）这一集的开场与集尾计划、显式标注的开场节拍、实际结束坐标 |
| `video` | 有效视频模型，以及 production 与 creation 里的画幅、分辨率等参数 |
| `assets` | 人物取 outline.characters，场景与道具取 art；附设定图相对路径、文件是否存在与内容摘要 `sheetHash` |

剧本、设定图、项目要求、模型或视频参数发生变化后重新生成输入材料，再派发。审核方批准时带着这份文件登记结论，批准因此绑定它：之后调度方的 `status`、`apply`、`export`、`videos` 都按当前上游重新生成同样的材料来核对，这一段依据的部分有变化，批准就失效。

## 派发哪一种 subagent

| 运行环境 | 编写方 | 审核方 |
| --- | --- | --- |
| Claude Code，已安装 subagent 定义 | `novel-video-prompt-writer` | `novel-video-prompt-reviewer` |
| pi，已安装子代理扩展，项目里有 `.pi/agents/` 角色定义 | `novel-video-prompt-writer` | `novel-video-prompt-reviewer` |
| 其他支持子代理的环境，或没有角色定义 | 通用 subagent | 通用 subagent |

Claude Code 的定义预载对应的 skill 并限定工具，位于本仓库 `agents/`，由 `install.sh --claude` 链接到 `~/.claude/agents/`。pi 的定义位于本仓库 `.pi/agents/`，是项目级角色：调用子代理工具时指定对应角色并把范围设为项目，指南路径由任务简报给出。角色定义只是便利，不是必需品；单独拷走本 skill 不会带上它们，此时派发通用 subagent。通用 subagent 必须能够写文件，不要把只读的评审代理当作编写方。

**简报里始终写明指南的绝对路径**，不只写 skill 名称：subagent 看不到主会话已经加载的内容，按名称加载在不同环境里不一定成功。派发前确认文件存在。

## 指南与命令的两处来源

| | 兄弟 skill 已安装 | 本地来源（没有安装兄弟 skill） |
| --- | --- | --- |
| 编写方读取 | `novel-video-prompt` 的 SKILL.md | 本 skill 的 `references/分镜指南.md`、`worksheet.md`、`creation-prompt.md` 与有效模型的填法指南 |
| 审核方读取 | `novel-video-prompt-review` 的 SKILL.md | 本 skill 的 `references/审核清单.md`、`worksheet.md` |
| 新建工作单 | 编写方脚本 `new <段号> --out <目录>` | `prompts new <creation.json> <段号> --scene N` |
| 提交审核 | 编写方脚本 `submit <prompt.md>...` | `prompts submit <creation.json> [段号...]` |
| 登记结论 | 审核方脚本 `verdict <结论> [--inputs <输入材料.json>] <prompt.md>...` | `prompts verdict <creation.json> <结论> <段号>...` |

兄弟 skill 的安装位置由运行环境发现（已加载的 skill 清单，或 `install.sh` 链接的目录），不假定它与本 skill 同级。本地来源的指南与兄弟 skill 的指南逐字一致；`prompts submit` 以完整结构检查代替编写方的本地自查，`prompts verdict` 从当前上游生成输入材料来绑定批准。两种来源都使用两个独立上下文的 subagent，审核仍然独立。使用本地来源时，把下面简报里的「SKILL.md 绝对路径」换成上表的指南路径，并写明要使用的命令。

## 编写 subagent 的任务简报

```text
你是视频提示词编写方。完整读取 <编写方 SKILL.md 或指南的绝对路径> 并严格按它执行（已预载时不必重读）。

任务：为《<作品>》第 <N> 集编写分段、分镜与视频提示词。
输入材料：<creation 目录>/.work/E<NN>-输入材料.json
工作单目录：<creation 目录>（每段一份 <段号>/prompt.md）
有效视频模型：<模型>

本轮类型：首轮编写 ／ 修改被退回的段：<段号列表> ／ 阻塞已协调，回应并重新提交：<段号列表与协调结果>
提交命令：<编写方脚本的 submit，或 prompts submit>
结构检查输出（有则原样附上）：
<prompts check 的错误输出>

完成后提交审核（submit），并回报：各段秒数与分镜数量、各工作单状态、没有采纳的建议及理由、
你发现但无权解决的问题。不要修改审核意见区，不要把状态改为 approved。
```

修改轮不需要转述审核意见——意见就在工作单里。结构检查的输出必须原样附上，不要概括。

## 审核 subagent 的任务简报

```text
你是视频提示词审核方。完整读取 <审核方 SKILL.md 或指南的绝对路径> 并严格按它执行（已预载时不必重读）。

任务：审核《<作品>》第 <N> 集的视频提示词工作单。
输入材料：<creation 目录>/.work/E<NN>-输入材料.json（批准时带着它登记结论）
结论登记命令：<审核方脚本的 verdict，或 prompts verdict>
待审核工作单：<段号列表与路径>（状态为 in_review）
有效视频模型：<模型>
结构检查：已通过 prompts check（节拍覆盖、台词逐字、时长、骨架短语、参考图）。

把意见写进各工作单的「审核意见（仅本轮）」，逐段登记结论（verdict），并回报：每段结论、
必须修改的摘要、登记为阻塞的问题、跨段连续性风险、需要实际视频验证的事项。
不要修改分镜结构和提示词正文。
```

**不传给审核方的内容**：编写 subagent 的回报、它对自己产物的评价、主会话对质量的看法。审核方只应当看到工作单和输入材料，这样它的判断才不被编写方的解释带着走。

复审时整集的工作单都交给审核方阅读（段间连续性需要整集视角），但只要求它对 `in_review` 的段登记结论；已经批准且没有改动的段不重新审核。

## 循环与结束条件

| 情况 | 调度方的动作 |
| --- | --- |
| `prompts check` 失败 | 输出原样交还编写 subagent，不启动审核 |
| `prompts check` 连续两次以同一原因失败 | 停止，向用户汇报 |
| 审核后存在 `changes_requested` | 只对被退回的集再次派发编写 |
| `prompts status` 提示某段已满三轮 | 停止这一段，把审核意见与编写回应原样交给用户决定 |
| 已批准的段显示内容被修改 | 有人在批准后改动了分镜结构或正文；重新派发编写方提交，再审核 |
| 已批准的段显示输入发生变化 | 这一段依据的节拍原文、参考图、模型参数或项目要求变了；重新生成输入材料，只对这些段重新派发编写方检查并提交，再审核 |
| 审核方登记了 `blocked` | 停止相关段，向用户汇报（剧本台词、缺少设定图、目标时长）；协调完成后重新生成输入材料，派发编写方写明回应并提交 |
| 编写方回报了超出权限的问题 | 停止相关段，向用户汇报 |
| `prompts status` 退出码为零 | 结束循环，进入 apply |

轮次以工作单状态头的 `round` 为准，调度方不另外记账，也不保存历史意见。

## 并发

多集可以并发：每一集一个编写 subagent，所有调用放在同一条消息里；审核同理。同一集的编写与审核必须先后进行。不要让两个 subagent 同时写同一份工作单。

## 没有子代理时

在当前会话先按编写方指南完成编写与提交，运行 `prompts check`，再按审核方指南完成审核。命令、工作单格式与结束条件完全相同。向用户汇报时注明审核与编写在同一会话完成，审核不独立。

## 向用户汇报

循环结束后汇报：每段的审核状态与轮次、审核方留下的建议、需要实际视频验证的事项、因止损而交给用户的分歧。批准只表示提示词可以进入生成；成片效果需要实际视频验证。
