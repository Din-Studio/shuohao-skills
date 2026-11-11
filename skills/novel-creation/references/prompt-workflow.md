# 主 session 调度与独立审核

## 角色

主 session 只收集输入、分派任务、协调阻塞、检查状态与调用视频工具，不代写正文、不代替审核者批准。默认每批最多三集，串行执行编写与审核；同一文档不并发写入。默认整批通过后生成，`--only` 也不绕过整批审核。

启动两个独立上下文的 subagent：`prompt-writer` 与 `prompt-reviewer`。使用运行环境提供的 subagent / Task 工具，不假定已安装固定名称的代理。给工具明确角色指令及以下任务包。没有独立子代理能力时停止自动循环并说明限制，不冒充已独立审核。

优先让编写代理读取已安装的“视频prompt编写”skill，审核代理读取“视频prompt审核”skill。安装路径由运行环境发现，不写死兄弟目录。没有单独安装时，将本 skill 的 schema.md、creation-prompt.md、有效模型指南、创作指南.md 及本文件作为完整本地角色规范传入，仍使用两个独立上下文；本 skill 可以单独拷走。

### 运行时启动约定

本仓库的 pi 角色定义位于 `.pi/agents/prompt-writer.md` 和 `.pi/agents/prompt-reviewer.md`。主 session 调用 `subagent` 时指定对应 `agent`，设置 `agentScope: "project"`（或 `"both"`），并通过任务包传入 skill 与输入的绝对路径。未固定模型，继承主 session 配置。单独复制本 skill 不会携带项目级角色定义，需由目标运行环境提供对应代理。

角色名是任务职责，不是假定机器已安装同名 agent。主 session 使用支持写文件的通用子代理执行角色任务；不得把只读 code-reviewer 当成编写代理。工具需要先注册 agent 时，按当前运行环境的代理配置方式由用户安装/确认，再启动循环；不能靠主 session 自己扮演第二角色替代。仓库不写入用户级代理配置，也不依赖特定 harness 的 SDK。

编写启动指令模板：

> 你是 prompt-writer。读取指定编写 skill（或本地编写规范）和全部任务包文件。只编辑获授权结构、prompt 正文与编写说明。首次 export 后以 Markdown 为正文源。结构自检后逐段提交 pending_review，返回路径、段号、状态与阻塞项。不得 approved，不得提交视频。

审核启动指令模板：

> 你是独立的 prompt-reviewer。读取指定审核 skill（或本地审核规范）和全部原始输入，不依赖编写者自述。只更新当前意见与审核状态，不改正文。每条阻断引用镜号及证据。由你执行 review 结论命令；全部检查具备证据且无阻断才能 approved，否则 changes_requested 或 blocked。返回段级状态与意见位置，不提交视频。

每轮由主 session 等待当前子代理完成，再依据实际 Markdown 状态启动下一角色。工具报错不算角色完成，口头返回 approved 不替代文件中的有效绑定。遇到 blocked 时协调所缺材料或用户决策后重新交给编写代理，不删除审核结论强行继续。

### 编写任务包

任务范围、集号与段号、输出目录；唯一 creativeBrief；完整相关剧本及节拍；当前大纲意图（缺失明确说明）；人物设定、场景道具设定及实际图片；有序图片映射；模型、语言、画幅、分辨率、时长限制；相邻段连续性；已有 Markdown 与最新审核意见；允许修改路径与禁止修改的上游路径。全部使用绝对路径，要求代理实际读取，不以主 session 摘要代替原始输入。

编写代理先确定故事依据，再安排分段分镜。首次在 creation.json 完成结构和提示词后 export；之后只在 prompt.md 正文区域编辑提示词，结构仍在 creation.json 编辑。不得擅改故事、台词、模型或上游文件。运行 validate/checkup，写本轮修改回应，再提交 pending_review。返回段号、文件路径、检查结果与阻塞事项。不能批准自己。

### 审核任务包

同一份原始输入、当前 Markdown、结构数据、检查结果和上一轮意见。审核代理独立核对全部依据及实际参考图；按创作指南逐项引用段号/镜号与原文证据，检查台词、人物、参考图编号、镜头可行性、表演时间及前后连续性。

只写审核意见和审核状态，不改提示词正文或上游。阻断意见必须明确位置、证据、问题、修改要求；非阻断建议单列。有任何未解决阻断不得 approved。缺失材料或必须修改上游时 blocked。结构通过不代表内容通过，也不代表真实视频质量通过。

## 文档与命令

每段 `<段号>/prompt.md` 包含唯一 review-meta JSON 区域、唯一 prompt 正文区域、编写说明和当前审核。只保留当前意见与本轮回应，不累计评分或门失败日志。元数据由命令维护，不手改批准标识。正文只允许在 `<!-- prompt:start -->` 与 `<!-- prompt:end -->` 之间。

以下命令在 creation 目录运行，CLI 使用本 skill 的绝对路径：

```bash
node <baseDir>/scripts/novel-creation.mjs export 作品-creation.json
# 编写完成（每段调用）
node <baseDir>/scripts/novel-creation.mjs review manifest.json --segment E01-01 --status pending_review
# 审核者先写当前意见到 UTF-8 临时文件，再由工具放入同一份 prompt.md
node <baseDir>/scripts/novel-creation.mjs review manifest.json --segment E01-01 --status changes_requested --reviewer prompt-reviewer --opinion /absolute/current-opinion.txt
# 编写代理修改、逐条回应，再次提交 pending_review，然后审核者批准
node <baseDir>/scripts/novel-creation.mjs review manifest.json --segment E01-01 --status approved --reviewer prompt-reviewer --opinion /absolute/current-opinion.txt
```

审核意见临时文件不是额外审核源，可以覆盖本轮临时文件；正式意见只以 prompt.md 为准。blocked 使用相同审核命令。角色限制由调度和工具权限执行，CLI 的 reviewer 字段用于归属，不是安全认证，不能防止拥有文件写权限的人伪造审核。

状态：draft → pending_review → approved / changes_requested / blocked。需要修改时继续编写—审核循环。上游冲突、缺图、重复分歧、预算不足或用户取消时暂停协调，不自动批准。审核过程中输入变化必须重新提交。

批准绑定整批正文、结构、上游内容、有序参考图文件内容、模型及参数。任一变化会使旧批准失效。保守采用整批失效，避免漏掉段间连续性影响。结构或上游变化先重新 export，再重新提交审核。图片或正文变化需整批重新提交审核。指南文字调整本身不自动使故事失效。

export 保留既有 Markdown，不覆盖意见或正文，并同步 JSON 的 prompt 兼容镜像；validate/checkup/render 读取 creation 文件同目录的 Markdown。使用 --out 的独立投产目录时，validate/checkup/render 必须用 --pack <投产目录> 指向同一 Markdown 编辑源；review/videos 从 manifest 自动定位结构源。JSON 镜像不是后续人工编辑源。

旧 Markdown 不自动批准，也不隐式覆盖。人工将旧文件另存备份后，显式重新 export 创建 draft 文档，再将旧正文搬入正文区域并完整审核。不要删除仍需恢复的视频任务回执。

## 生成

全部目标段 approved 后运行 videos。即使 dry-run 也执行审核检查。生成计划携带 approval.input；外部提交前重新运行 videos，比对 input，并确保请求正文、参考图顺序和参数与计划一致。实时 schema 要求改变内容/参数时返回编写与审核，不静默调整。

内容批准不等于付费授权。继续按 media-handoff.md 核对实时 schema、价格、最终时长与用户授权；没有工具或授权时交付计划并明确未生成。恢复已有任务，不因循环或等待超时重复提交。
