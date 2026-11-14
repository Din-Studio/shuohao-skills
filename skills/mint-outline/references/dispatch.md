# 严格并行解析：派发指南

所有 outline 解析和修订都执行本指南，不按字数或集数回退到主会话阅读。阶段内部并行；完整流程仍是 outline → characters → art → script → creation，阶段之间不能并行。正式产物只有一份 outline v5，schema 不变。

## 一、不可放宽的读取上限

- **每个 subagent 在一次调用中累计最多接触 4 个不同集号的原文。** 完整阅读、前情、检索命中和定向回读全部计入。分块、多个工具调用、修复轮次或改换任务名称都不能重置该调用的累计上限。
- 每批 1–4 集，按来源集序连续分组（缺集不算断开）。对白密集、闪回多、单集过长时继续缩小，4 集是上限而非必须装满。
- 一个 subagent 调用只负责一个批次、一个串联任务或一个跨集证据任务；不得串接下一批。核验、返修和新增证据任务使用新的独立调用，不能在同一上下文累计读完全剧。
- **主会话只调度，不阅读原文正文。** 不以预检、人物盘点或独立复核等名义额外派发全剧阅读者。人物身份登记与归并归 characters，不在本阶段另做全剧人物清单。
- **全局串联者以提取结果为主，必要时按需求读取特定集数的剧本。** 每次调用累计最多接触 4 集原文；读取前明确集号、路径和行范围，不通读或全局检索全剧。超出累计上限的证据需求交给主会话另派任务。跨集汇总核验者只读取提取结果及独立证据，原文复核另派每个最多 4 集的证据核验者。
- 不给读取者附加上一集原文；前情通过带出处的交接记录传递。确需回读其他集时另派证据核验者。
- 没有 subagent 工具时通过独立进程派发。两者都不可用时停止，报告无法满足严格并行要求；禁止主会话代读或声称独立核验。

并行指有多个独立批次时同时派发，不是让提取、串联、核验互相越过依赖。至少 2 集时至少划分 2 批；默认同时运行 2–4 个任务，更多批次分波次派发。只有 1 集时仍由独立读取者和后续独立核验者执行，不虚构两个读取者重复提取来冒称并发。

## 二、输入登记与分批

先登记来源，再派发阅读，主会话不能先通读后分批。来源工具在进程内读取字节只为 SHA256、物理行数和标题检查，不把正文输出到会话；来源登记和生成分块都不能证明模型已读。

### 每集一份 Markdown

```bash
node {baseDir}/scripts/mint-outline.mjs source-folder 剧本目录 --out outline/.work/sources.json
node {baseDir}/scripts/mint-outline.mjs plan-batches outline/.work/sources.json
```

`plan-batches` 重新核验来源后只输出批号、集号、绝对路径、SHA256 和行数。每批最多 4 集；2–4 集也至少拆成 2 批，60 集生成 15 批。它不启动代理，不限制运行时的文件权限。主会话按计划派发，不能把多个批次交给同一个调用。`missingEpisodes` 非空时向用户列出。

### 单文件剧本或其他文件组织

读取上限同样适用，不回退到主会话阅读。通过只输出集标题与物理行号的确定性扫描登记集场边界，不把全文打印到主会话；每批给出至多 4 集的精确行范围。单集文件可以直接登记为一批。无法可靠确定集界或集号时先请用户确认，不猜测后读取整个文件。

读取者只按指定行范围阅读，不能通过无范围的 read、grep 或 bash 取回文件里的其他集。来源仍登记原件及原坐标，不把工作副本冒充原件。`chunk` 只供已限定负责范围的阅读辅助；它不隔离上下文，多集共用一个文件时不能读取包含批外正文的整份 chunk JSON。

现有 `source-folder` / `plan-batches` / `merge` 仅处理每集一份 Markdown 的目录，不扩充为多集单文件适配器。共享原件的 partial fragment 由主会话仅根据提取结果组装草稿，合并 coverage 并集及 B/Q 对照，不能调用要求整份文档唯一归属的 `merge`；组装后执行同样的结构、来源和独立核验。

## 三、首次生成流程

```text
登记来源 → 计划每批 1–4 集
  ▼
读取 subagent × N（按波次并发）→ fragments/batch-XX.json + batch-XX.handoff.md
  ▼
merge → draft.json（仅适用于每集一份 Markdown）
  ▼
串联 subagent（以提取结果为主，必要时按需求读取特定集数的剧本，累计最多 4 集）
  ↔ 证据核验 subagent × N（每个最多 4 集，独立任务可并发）
  ▼
validate draft.json --stage full --verify-sources --source-base outline
  ▼
按批核验 subagent × N（每个最多 4 集，并发）
＋ 跨集汇总核验（只读取提取结果，需要证据另派任务）
  ▼
publish → checkup --downstream → render 两份报告
```

```bash
node {baseDir}/scripts/mint-outline.mjs merge outline/.work/fragments/batch-*.json \
  --sources outline/.work/sources.json --out outline/.work/draft.json --publish-to outline/outline.json \
  --source 作品标题 --scope partial|complete [--total-episodes N]
node {baseDir}/scripts/mint-outline.mjs validate outline/.work/draft.json --stage full --verify-sources --source-base outline
node {baseDir}/scripts/mint-outline.mjs publish outline/.work/draft.json --to outline/outline.json
```

`{baseDir}` 是本 skill 目录。草稿来源 path 按正式目录计算。`merge` 与 `publish` 仍遇到已有正式文件就报错，不能删除正式文件绕过保护。它们不启动代理、不判断语义；`contentReview` 固定 `not-performed`。

### 已有 outline 的修订

强制并行同样适用，不重新 merge，也不全局重新编号 B/Q。主会话先复制当前 JSON 到新的 `.work` 草稿，保留正式文件；按本次涉及集号分批派发独立读取者，各自只写修订记录与证据，不直接修改草稿或正式文件。读取者最多读取本批 4 集和对应的已有提取结果，不借修订通读全剧。

主会话根据记录修改草稿，保持现有 ID，新增 B/Q 使用当前最大编号加一；然后派发独立按批核验和跨集汇总核验。核验通过后由唯一发布者针对正式文件执行精确修改，运行来源及下游检查并重新渲染。`publish` 不增加覆盖模式。下游认领因事实或范围变化失效时明确报告，不能重编号掩盖。

## 四、中间文件与写入权限

全部中间文件放在 `outline/.work/`，不进入版本控制，也不是第二种正式产物。

| 路径 | 写入者 | 内容 |
|---|---|---|
| `sources.json` | source-folder | 文档 ID、集号、路径、SHA256、物理行数、缺集 |
| `fragments/batch-XX.json` | 对应读取者 | 合法的 v5 partial outline；每批最多 4 集 |
| `fragments/batch-XX.handoff.md` | 对应读取者 | 交接记录 |
| `draft.json` | merge 或主会话创建，之后由唯一写者修改 | 现行 v5 草稿 |
| `review/batch-XX.md`、`review/cross.md` | 对应核验者 | 独立核验结论 |
| `review/evidence-XX.md` | 对应证据核验者 | 请求范围、原文证据与结论 |
| `fragments/batch-XX.revision.md` | 修订读取者 | 已有 outline 的定向修改建议与出处 |

批号按集序分配。读取者、证据核验者和核验者都不能修改 `draft.json` 或正式文件。串联 subagent 工作时是草稿唯一写者，结束后写者回到主会话。正式文件始终只有主会话这一位发布者。

**目录输入的 fragment 规则**（merge 检查失败时不写草稿）：

- 自身通过 `validate --stage full --verify-sources`。
- `provenance.scope=partial`，`source` 等于作品标题。
- 文档数和分集数均不超过 4；不写 `totalEpisodes`、`story.endingBeatId`、`lang`、`params`、`creativeBrief`。
- 文档 ID、SHA256、行数和文件与 `sources.json` 一致；每份文档 coverage 恰好为 `1..lineCount`，且只由一批负责。
- 每批集号在来源列表中连续；beats、episodes 及带 episode 的 notes 只引用本集文档。
- B/Q 采用本地顺序编号，`resolves` 只能指向本批 Q。跨批回答留到串联阶段。

**handoff 固定章节**（自由文本，代码不检查）。每条带本地 B/Q ID 或 `documentId:起止行`：

1. 本批提出的问题：本地 Q、提出位置、批内回答 B。
2. 疑似回答前文的事件：本地 B 和它可能回答的问题，不猜前批 Q ID。
3. 前情依赖请求：本批位置、缺少的信息、建议检索词。
4. 同名与未知说话者：本批自然语言称呼及出处，不做身份归并。
5. 批末状态：持有人、受损或恢复、伤势和知情状态。
6. 无法确定的事项：缺失、矛盾或不能理解之处。

## 五、角色与任务简报

### 主会话

- 阅读本 skill 的指南和项目配置，登记来源、分批、并发派发、执行确定性命令、判断修复循环、发布及汇报；不阅读原文正文。
- 每份简报必须列出**允许接触的集号（最多 4 个）**、绝对文件路径及允许行范围、输出路径、必读指南、禁止批外检索及累计上限。串联者简报须明确：必要时按需求读取特定集数的剧本，可根据来源元数据自行选定所需集号，读取前明确集号、绝对路径和行范围，累计最多 4 集。元数据与提取结果不计入原文集数。
- 读取者需要写入权限；不能给只读 scout 派发必须写 fragment 的任务。只读代理可用于核验，但结论由主会话保存到指定路径。
- subagent 只回报文件路径、一行状态和未决数量，不把原文或整份提取结果贴回主会话。
- 证据需求超过 4 集时拆成多个独立任务，收到带出处结论后再汇总。不得扩大某一任务的原文白名单。

### 读取者（每批一个独立调用）

必读文档：[创作指南.md](创作指南.md)、[schema.md](schema.md)、[volume-pass.md](volume-pass.md) 和本文。简报不得要求“独立阅读全部剧本”。

1. 完整阅读本批原文，长集按范围分段阅读，不接触批外原文。
2. 每份原件执行 `source-document 文件 --artifact 本批fragment路径 --id 指定ID` 登记来源；它只输出元数据，不代表已经阅读。
3. 首次生成写 fragment 和 handoff；已有 outline 写修订记录，不重新编号或直接修改已有数据。
4. fragment 执行 `validate --stage full --verify-sources`，自行修正结构问题；缺少前情写进交接记录，不私自扩大阅读范围。

### 串联者（一个，必要时按需求读取特定集数的剧本）

输入：draft、全部 handoff、来源元数据、merge ID 对照表；来源元数据提供原文路径与坐标，供按需定向读取，不要求通读全剧。

- 按交接记录匹配 Q 提出与回答候选、前情依赖、同名描述、跨集状态及揭晓顺序。
- 必要时按需求读取特定集数的剧本，核对问题回答、前情依赖或状态变化。读取前明确集号、绝对路径及行范围；检索限于所选集号与范围，每次调用累计最多接触 4 集原文。
- 所需集号超出本次累计上限时，将证据请求交给主会话，明确候选集号、行号或检索词；另派的证据核验者仅在各自白名单内检索和回读。
- 根据定向读取或独立证据设置 `resolves`、必要 notes 和全剧摘要；无法确认就保持未知，不补写。
- scope=complete 且真实结尾有证据时设置 `endingBeatId`。补 B 时保留已有 ID，新编号取当前最大值加一。
- 后文揭晓改变前文性质时，列出受影响批次，按需定向回读；超出累计上限的部分请求独立证据，不能自己逐集回读全剧。
- 执行 `validate draft.json --stage full --verify-sources --source-base outline`。提取结果仍随集数增长，若无法容纳就向主会话报告并缩小本次汇总输入，不能改为通读原文。

### 核验者

- **按批核验，每批一个全新调用。** 只读取本批最多 4 集原文、草稿对应集与相关 B/Q，按[创作指南](创作指南.md)的 8 项逐条核验。跨批证据另派任务。
- **跨集汇总核验。** 检查 Q 链、endingBeatId、summary、跨集 notes、揭晓顺序，只读取提取结果和独立证据；原文复核交给证据核验者，不自己读取全剧。
- **证据核验。** 每个新调用最多接触 4 集，只报告其白名单内有出处的证据与未知项；不能因为线索不足自行追到第 5 集。
- 核验者只写结论，不修改草稿，也不读取读取者或串联者的自我评价。每条结论注明 documentId、行号和 B/Q ID。
- 主会话修改后重新校验，只对改动涉及的批次派发全新核验调用；跨集对象改变时也重新做跨集核验。两轮仍未通过就停止并报告未解决项。不新增失败累积日志。

## 六、运行环境与保证范围

| 环境 | 派发方式 |
|---|---|
| Claude Code | Task/Agent 派发；独立批次放在同一条消息里并发 |
| pi | subagent 工具；不可用时通过 bash 并发启动独立 `pi -p` 进程 |
| 两者都不能 | 停止并报告无法满足严格并行要求，不在当前会话代做 |

不新增 agent 定义、调度服务、文件锁、数据库或失败统计。`plan-batches` 保证输出批次不超过 4 集，`merge` 拒绝超限 fragment；它们不能审计工具历史、证明模型读全或阻止运行时越界访问。实际阅读上限由简报白名单和执行纪律落实，结构自测不冒充真实多代理运行验收。
