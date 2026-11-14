# 分集并行解析：派发指南

适用输入：一个文件夹，内含多份 Markdown，每份是一集剧本。并行只发生在 outline 阶段内部；完整流程仍是 outline → characters → art → script → creation，阶段之间不能并行。

本指南只描述执行方式，不改变正式契约：正式产物仍只有一份 outline v5，由唯一发布者写入。代码只检查覆盖、归属、编号和结构，`contentReview` 固定 `not-performed`。

## 一、何时使用

- **只用于首次生成。** 正式 outline 已经存在时不走并行流程，改用 [SKILL.md](../SKILL.md) 的串行流程。merge 会全局重新编号 B/Q，而 script 下游按顺序认领 B ID，重新合并会让已有认领失效；`merge --publish-to` 和 `publish` 遇到已有正式文件都直接报错。
- **体量足够大才并行。** 以下是初始经验值，需要按实际模型校准，不能用来证明读全：
  - 原文总量约在 3 万字以内且不超过 10 集：串行。
  - 超过时：并行。每批以整集为单位，是一段连续集号，约 1 万到 1.5 万字。
  - 并发先从 3–4 个开始。
  - 对白密集、频繁闪回、身份转换多的集，缩小批次。

## 二、流程

```
source-folder：登记全部集文件 → outline/.work/sources.json（集号只从文件名解析）
  ▼
读取 subagent × N（同一条消息内并发）→ .work/fragments/batch-XX.json + batch-XX.handoff.md
  ▼
merge → outline/.work/draft.json（草稿）
  ▼
串联 subagent（同一时刻只有它写 draft.json）
  ▼
validate draft.json --stage full --verify-sources --source-base outline
  ▼
核验 subagent × N（按批）＋ 1 个跨集核验 → .work/review/*.md
  ▼
publish：draft.json → outline/outline.json；checkup --downstream；render 两份报告
```

命令：

```bash
node {baseDir}/scripts/mint-outline.mjs source-folder 剧本目录 --out outline/.work/sources.json
node {baseDir}/scripts/mint-outline.mjs merge outline/.work/fragments/batch-*.json \
  --sources outline/.work/sources.json --out outline/.work/draft.json --publish-to outline/outline.json \
  --source 作品标题 --scope partial|complete [--total-episodes N]
node {baseDir}/scripts/mint-outline.mjs validate outline/.work/draft.json --stage full --verify-sources --source-base outline
node {baseDir}/scripts/mint-outline.mjs publish outline/.work/draft.json --to outline/outline.json
```

`{baseDir}` 是本 skill 目录。草稿里的来源 `path` 按正式目录计算，所以校验草稿要带 `--source-base`；publish 原样写入，内容不用改写。

**单一写者：**

- 读取者、串联者、核验者都不写 `outline/outline.json`。正式文件只由 `publish` 创建。
- merge 只负责创建 `draft.json`。
- 串联 subagent 运行期间，它是 `draft.json` 的唯一写者；结束后写者是主会话。
- 任意时刻只有一个写者。

## 三、中间文件

全部放在 `outline/.work/`，不进入版本控制，也不是正式产物。

| 路径 | 写入者 | 内容 |
|---|---|---|
| `sources.json` | source-folder | 每集的文档 ID、集号、相对路径、SHA256、物理行数，以及 `missingEpisodes` |
| `fragments/batch-XX.json` | 对应读取者 | 合法的 v5 partial outline |
| `fragments/batch-XX.handoff.md` | 对应读取者 | 交接记录，固定章节见下 |
| `draft.json` | merge 创建，之后串联者或主会话修改 | 合并后的 v5 草稿，`publish` 后成为正式 outline |
| `review/batch-XX.md`、`review/cross.md` | 对应核验者 | 核验结论 |

`batch-XX` 中的 `XX` 是两位批次号，由主会话按集序分配，每批是一段连续集号（缺集不算断开）。

**fragment 规则**（merge 逐项检查，任何一项失败都不写出草稿）：

- 自身通过 `validate --stage full --verify-sources`。
- `provenance.scope` 为 `partial`；`source` 等于作品标题。
- 不写 `totalEpisodes`、`story.endingBeatId`、`lang`、`params`、`creativeBrief`。
- 文档 ID、SHA256、行数和实际文件都与 `sources.json` 一致；每份文档 coverage 恰好为 `1..lineCount`。
- `episodes[].ep` 等于所含文档的集号；beats、episodes 以及带 `episode` 字段的 notes 只引用本集文档。
- B 和 Q 使用批内本地编号：beats 依次为 `B01`、`B02`…，集尾问题按集序依次为 `Q01`、`Q02`…。`resolves` 只能指向本批的 Q。

**handoff 固定章节**（自由文本，代码不检查）。每条都要带本批本地 B/Q ID，或者 `documentId:起止行`：

1. **本批提出的问题**：本地 Q ID 和提出位置。批内已回答的写明由哪个本地 B 回答。
2. **疑似回答前文的事件**：本地 B ID，以及它回答的是什么样的问题（用自然语言描述，不猜前文的 Q ID）。
3. **前情依赖请求**：本批某处没有解释、却依赖更早信息的内容。写明本批位置、需要什么信息、建议的检索词（人名、称谓、物件、原句片段）。
4. **同名与未知说话者**：本批采用的称呼及出处。
5. **批末状态**：物品持有人、损坏或恢复、伤势、知情状态，每项带出处。
6. **无法确定的事项**：原文缺失、互相矛盾、看不懂的地方。

## 四、角色

### 主会话（调度方与最终发布者）

- 执行确定性命令，分批，派发 subagent，判断循环是否结束，向用户汇报。
- 开始前检查正式 outline 是否已经存在；存在时不走并行流程。
- `missingEpisodes` 非空时在汇报中列出。
- **不细读原文，不替读取者补写提取结果。** 修改核验意见时只做定向回读。
- subagent 只回报文件路径、一行状态和未决数量，不把正文贴回会话。

### 读取者（每批一个）

**简报内容：** 本批负责的集号和文件绝对路径；上一集文件路径（可选，只用于理解，不能引用）；输出路径；必读文档的绝对路径：[创作指南.md](创作指南.md)、[schema.md](schema.md)、[volume-pass.md](volume-pass.md)，以及本文「读取者」一节。

**步骤：**

1. 逐份完整阅读本批原件；长集可以先执行 `chunk 文件 本批工作目录 --kind script --id 文档ID`，再分段阅读。
2. 对每份文件执行 `source-document 文件 --artifact 本批fragment路径 --id 指定ID`，生成 documents 条目。
3. 写出 fragment 和 handoff。
4. 执行 `validate fragment --stage full --verify-sources`，失败就自行修改，直到通过。

**禁止：** 写本批以外的路径；引用上下文文件；猜测前文的 Q ID 或前情（不知道的写进 handoff 第 3、6 节）；写 `totalEpisodes`、`endingBeatId`、`lang`、`params`、`creativeBrief`。

### 串联者（一个）

**输入：** `outline/.work/draft.json`、全部 handoff、`sources.json`、merge 打印的 ID 对照表（批次加本地 ID → 全局 ID）。

**任务：**

1. **跨批 Q 回答：** 先按 handoff 第 1、2 节和未回答 Q 列表找候选，再定向回读提出位置和回答位置的原文。确认后写入 `resolves`；确认不了就保持未回答。
2. **前情依赖请求：** 先在各集原文里检索建议的关键词（Grep 或 rg），再按命中的行范围定向回读。确认后在对应集补 notes；必要时补 beat，新 beat 插在本集叙事位置，**不重排已有 ID**，使用当前最大编号加一，以免 handoff 和核验记录里的引用失效。查不到就在当前集写一条 epistemic 为 uncertain 的 notes，或保持未知，不补写。
3. **全剧摘要与结尾：** 把 merge 拼接的分批摘要改写成全剧摘要。scope 为 complete 且末集结尾确实可以识别时，设置 `endingBeatId`。
4. **统一同名描述：** 统一同名不同人和未知说话者的描述，不建立身份 ID。
5. **跨集禁区：** 补跨集的 restriction / continuity notes，比如「此时某人尚不知情」。
6. **揭晓影响：** 如果后文揭晓改变了多批前文说法的性质（例如某人一直在说谎），定向回读受影响的原文，直接修改草稿中的相关 notes 或 epistemic，并在回报中列出改动涉及的批次，供核验阶段复核。
7. 执行 `validate draft.json --stage full --verify-sources --source-base outline`，直到通过。

**原则：** 不通读全剧。检索命中太多、无法定向回读时，缩小检索词或者报告给主会话，不改成整体阅读。

### 核验者

- **按批核验，每批一个。** 输入本批原件和 draft.json 中本批的集、beats、本批提出或回答的 Q。按[创作指南](创作指南.md)「来源／正文核验」的 8 项逐条检查，结论写入 `review/batch-XX.md`。每条结论都要给出 documentId、行号和 B/Q ID。
- **跨集核验，一个。** 检查 Q 链、`endingBeatId`、summary、跨集 notes、揭晓顺序。沿链条定向回读原文，结论写入 `review/cross.md`。
- 核验者只写结论，不修改 draft.json，也不读取读取者或串联者的自我评价。
- **修复循环：** 主会话修改后重新校验，只对内容改动涉及的批次复核；如果跨集对象变了，同时复核跨集。两轮仍未通过就停下，向用户报告未解决项。不新增失败累积日志。

全部核验通过后，主会话执行 `publish`，再执行 `checkup --verify-sources --downstream` 和 `render` 生成两份报告。publish 只做结构校验和写入，不代表核验已经通过。

## 五、运行环境

| 环境 | 派发方式 |
|---|---|
| Claude Code | 使用 Task/Agent 派发通用 subagent，同一批次的调用放在同一条消息里并发 |
| pi | 有子代理扩展时使用 `subagent` 工具；没有时通过 bash 启动独立的 `pi -p` 进程 |
| 两者都不能 | 在当前会话按同样的文件约定依次完成，汇报中注明「提取、串联与核验在同一会话完成，核验不独立」 |

不新增 agent 定义文件。简报直接给出本文的绝对路径。

## 六、不做的事

- 不把一集拆给多个读取者。超长集由读取者在自己的批次内部分段阅读。
- 不设单独的修订角色和揭晓包、修订提案文件。
- 不对 handoff 和核验结论做代码格式检查。
- 不新增调度脚本、状态服务、文件锁、数据库、失败累积日志或统计。
- 不宣称并行结果已经通过语义核验。
