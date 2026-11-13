---
name: mint-characters
version: 4.0.0
description: |
  独立阅读原剧本，建立稳定 C ID、别名、同名人物、无台词人物、匿名声音、非人主体与提及人物的来源身份。
  人物角色整理完成后立即制作图片提示词并生成参考图；人物画像与音色按需制作，用户明确仅登记或仅要提示词时不生图。
  支持已有 cast 增量核验、预算阻断、来源摘要与覆盖核验。
  outline v5 仅为可选故事背景，不是人物权威。零 npm 依赖，Node 18+。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
triggers:
  - mint-characters
  - 拆角色
  - 小说角色
  - 人物画像
  - 角色卡
  - 人物设定图
  - 群像图
  - character sheet from novel
metadata:
  license: Apache-2.0
  requires:
    bins:
      - node
---

# mint-characters

`{baseDir}` 为本目录。仅依赖本目录脚本、指南、样例及用户输入。先阅读 [正式契约](references/schema.md)、[来源规则](references/source-facts.md)。本阶段只接受 cast v1、outline v5、production v3，其他版本一律失败。

## 职责与运行范围

本阶段独立判断人物身份。outline 的自然语言称呼不构成人物 ID、别名或分档结论。script 的局部 C 标记也不自动等于本阶段 C ID。

完整流程固定为 outline → characters → art → script → creation。完整流程由项目流程状态确认前序完成和当前交接范围；本 CLI 不推进项目状态，不声称完整流程或联合对账通过。独立运行时可缺少 outline，背景检查为 skipped。提供损坏、错误版本或来源不一致的 outline 必须失败。

所有交付写入 `<工作目录>/characters/`。原件路径相对记录它的 JSON；seed 生成绝对路径，reconcile 将来源路径转换为绝对路径，允许在其他目录执行。原件缺失、摘要或行数变化必须阻断，不回退到名称猜测。

正式交付固定包含 `cast.json`、`cast-report.md`、`cast-report.html` 三个文件。两份报告由 `cast.json` 渲染，三个文件均放在 `<工作目录>/characters/` 下。草稿和增量核验中间文件可使用其他名称，最终交付使用上述固定名称。

## 第一步：建立来源骨架

```bash
node {baseDir}/scripts/mint-characters.mjs seed \
  --source <原剧本.txt> --title <标题> --budget 30 \
  --out <characters/draft.json>
```

`--budget` 可选。它是明确角色身份数量上限，超额在本阶段阻断。不是出图人数，也不是提醒阈值；不得通过删除无台词或提及身份绕开预算。

可选 `--outline <outline.json>` 只核验和绑定故事背景，其他版本失败。缺省时不要求安装其他 skill。seed **不理解剧本、不抽人物、不标记已读**；它只写文件身份、原始字节 SHA256、行数与空数组。不要把骨架当成正式交接完成。

## 第二步：阅读和语义识别

阅读原剧本，按 [扫描指南](references/roster-pass.md) 登记所有本次范围内的人物。长文本可先运行 `chunk <原剧本.txt> <characters/.work>`；块边界是阅读辅助，不是身份边界。根据实际阅读填写 `provenance.coverage`，不是根据 seed 或 chunk 生成成功填写。

每个身份填写永久 `identityKey`，例如 `night-operator`。首次可以省略 `id`，由 reconcile 分配 C01 等。既有身份必须沿用其 identityKey 与 C ID；不按出现次序重编号。

- 同名不同人分别登记。别名必须有来源，不按名称或姓氏自动合并。
- 无台词人物、仅出声主体、仅被提及人物均保留身份及出现方式。
- 匿名人物以原文可支持的描述命名。未知说话者保留未知，不猜测为已知人物。
- 非人主体单独登记。多处声音尚不能证实同一身份时分别登记。
- 未知项写入 `unknowns`。制作补定写入设计字段，不冒充来源事实。
- partial 只代表已读范围。complete 必须逐文档覆盖全文，不要求虚构分集数量。

## 第三步：登记及增量核验

```bash
# 首次登记；不覆盖已有文件
node {baseDir}/scripts/mint-characters.mjs reconcile draft.json --out cast.json

# 已有产物作为不可覆盖的基线
node {baseDir}/scripts/mint-characters.mjs reconcile candidate.json \
  --previous cast.json --changes changes.json --out cast-next.json
node {baseDir}/scripts/mint-characters.mjs validate cast-next.json --previous cast.json
```

`changes.json` 为数组。没有合拆删纠正时可以省略。身份重排不改变 ID。新身份省略 ID，分配已登记最大编号之后的 ID。退役 ID 和 identityKey 均不复用。合并、拆分、删除、身份事实纠正必须有 from/to 映射及来源或用户决定。详情见[正式契约](references/schema.md)的生命周期一节。

新增剧集后重新阅读相关原件，更新摘要、引用与覆盖。来源改版保留身份 ID，但把实际依赖该来源的身份加入 `lifecycle.recheckIds`。此列表不是失败日志或统计；它只记录受影响引用须重新核验的身份。

reconcile 对新增或变化的身份及范围将语义审核恢复为 pending，纯重排仅沿用摘要仍有效的既有审核，不自动确认人物判定。完成语义复核后，可记录 `review.status: confirmed`、`by`、`note` 及 `inputHash`（validate 输出的 `reviewInputHash`），再将 status 设置为 identified。摘要失效必须重新复核。结构检查不能代替人工或模型语义审核。

## 第四步：整理完成后立即生图

人物角色整理完成并通过身份与来源核验后，立即为本次范围内需要视觉呈现的角色补齐 image 设计，导出计划并调用外部生成工具完成参考图，不停在角色清单、提示词或离线计划，也不等待用户再次发出生图指令。沿用会话中已确定的工具、制作参数与生成授权；缺少必要参数、工具或授权时，明确阻断项及“未生成”，补齐后继续。

persona、voice 仍按需制作，不强制三项设计同时存在。用户明确要求仅身份登记、仅提示词或暂不生图时，按其限定范围交付；身份契约仍允许没有设计字段。登记所有身份之后，再决定哪些身份需要视觉呈现，不能只留下画像选角。

- 画像与音色：阅读 [画像指南](references/profile-pass.md)、[设计字段](references/design-schema.md)。设计块直接写在 cast v1 的对应身份上，validate 的 optional-design 检查逐项核对。
- 图片：另读 [全局原则](references/principles.md)、[术语](references/glossary.md)、[设定图提示词](references/sheet-prompt.md)、[版式](references/sheet.md)、[画风](references/style.md)、[真实感](references/realism.md)；群演读 [群像图](references/crowd.md)；production.image.model 是 Midjourney 时另读 [Midjourney 写法](references/model-midjourney.md)；题材明确时查 `references/genres/` 中适用的题材文件（`general.md` 为通用基线），剧本事实与用户要求优先。production 为 v3，画风正文不设默认值。独立画像或身份登记不要求 production；已提供但损坏的 production 必须失败。
- 设定图版式：白底横图，左边严格正面的脸部特写，右边三格脖子以下的正面、侧面、背面，柔和均匀的正面光，中性站姿和表情，最后一段是纯净画质段；`entityType: group` 改出群像图。validate 按 entityType 核对版式短语和纯净画质段。cast v1 每个身份只有一个 image 块，本阶段只出基准图，不出人物变体图。
- 生成：`images cast.json` 只产生离线计划。只为存在 image 设计的角色建立任务；`--only C01,C02` 选择稳定 ID。正式路径为 `images/C01-sheet.png`，不会因改名或新增同名人物而漂移。
- 本地 CLI 保持离线；实际生图由 agent 接续外部生成工具。按 [媒体交接](references/media-handoff.md) 核验 schema、费用授权、回执及下载；已有授权覆盖本次生成时直接执行，不重复确认，不自动重复付费。下载并核验参考图后再生成最终报告。

身份、来源或设计变化后，必须重新核验实际受影响的参考图、工作单、提示词与审核材料。不得把 ID 沿用当成审核沿用。下游 script 只通过显式 `assetMappings` 引用 C ID；creation 的参考图使用 `images/<C ID>-sheet.png`。

## 第五步：校验及报告

```bash
node {baseDir}/scripts/mint-characters.mjs validate cast.json
node {baseDir}/scripts/mint-characters.mjs render cast.json --md > cast-report.md
node {baseDir}/scripts/mint-characters.mjs render cast.json --html > cast-report.html
node {baseDir}/scripts/mint-characters.mjs images cast.json --out image-plan.json
```

增量产物以上三个命令也必须带 `--previous`。可选 `--production path` 或自动从 cast 所在目录向上五层查找；`--no-production` 明确跳过配置对账，不提供生成默认值。`--lang` 仅覆盖报告界面语言；内容和提示词语言仍以 cast.lang 为准，机器提示词始终英文。

检查输出固定 `status: pass/fail/skipped + category + level`。报告展示身份、来源、范围、预算、可选设计、生命周期及审核状态；JSON 导出保持原输入。HTML 每次 render 可重建，不加入版本控制。

## 样例与测试

`examples/回声台.txt` 先定义故事，再提供独立身份登记 `回声台-cast.json`；不含分镜或生成图片。`examples/渡口.txt` 与 `渡口-cast.json` 展示带完整画像、声音和图片提示词设计块的 cast v1。

```bash
node {baseDir}/scripts/test-all.mjs
```

运行本阶段全部自测，均离线，不调用模型、不读取凭据、不执行付费生成。
