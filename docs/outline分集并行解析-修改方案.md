# outline 分集并行解析：修改方案

状态：**已实施**（mint-outline 5.1.0，本 skill 自测与仓库独立复制测试全部通过；第十三节的真实分集文件夹人工演示验收尚未执行）。分析基线 `0d6538c`。只涉及 mint-outline，outline schemaVersion 保持 5，不改变正式契约。

> 本文落实「并行提取 → 单点合并 → 串联 → 并行核验」路线。暂不包含串联索引（`index` 命令）与分层串联，见第十一节。

## 一、背景与目标

输入前提：一个文件夹，内含多份 md，**每份一集剧本**。

现状是单个 agent 读完全部剧本，再写一份 outline.json。集数多的时候会遇到三个问题：

- 上下文持续累积，压缩后会丢失细节。
- 前后集的注意力不均。
- 「读全」只能由同一会话自己声明。

目标：

1. 逐集细读交给多个读取 subagent 并行完成，每个只读取自己负责的集。
2. 跨集判断（Q 回答、全剧摘要、结尾、揭晓禁区）交给单点串联，**串联只读取提取结果与定向回读的原文范围，不通读全剧**。
3. 由确定性工具检查覆盖是否完整：每份原件恰好由一个读取者负责，并且读到最后一行。不依赖某个节点「读过全部」。
4. 正式产物仍然只有一份 outline.json，由唯一发布者写入，现有 validate/checkup/render 原样复用。合并、串联、核验都在 `.work` 草稿上进行，全部通过后才发布到正式位置，中途中断不会留下看似完整的半成品。
5. 小体量剧本继续使用现有串行流程，并行只是一条执行路线。
6. 并行流程只用于**首次生成**。正式 outline 已经存在时不走并行流程，见第十节。

## 二、现状（基线 `0d6538c`）

| 项目 | 现状 | 位置 |
|---|---|---|
| 执行方式 | 单 agent 串行。`allowed-tools` 含 `Task`，但没有任何派发说明；「独立上下文核对」没有落实到流程 | `SKILL.md` 执行流程第 1–7 步 |
| 多文档契约 | 已经支持：`provenance.documents[]`、`coverage[]` 按 `documentId` 记录；script 和 art 下游按文档 ID 匹配 | `lib/source.mjs` `provenanceErrors`；`mint-script.mjs` 248–257、294–295 行 |
| 来源登记 | 只有逐个文件的 `source-document --id` 命令，没有按文件夹登记，也不记录集号和文件的对应 | `mint-outline.mjs` `source-document` |
| 分块 | `chunk` 不能指定 `documentId`：`chunkScript` 支持 `documentId` 参数，CLI 没有接出，固定为 `D01`。输出文件名固定为 `source-chunks.json` 且独占创建，同一目录切第二个文件会失败 | `mint-outline.mjs` 122–128 行；`lib/source.mjs` `chunkScript` |
| 分界识别 | 正则 `^\s*(?:第.+[集场]|…)` 不匹配 md 标题 `## 第3场`，会退回按行数硬切 | `lib/source.mjs` `chunkScript` |
| 合并 | `volume-pass.md` 第 5 步要求「统一发布者合并」，但没有合并命令，全靠手工 | `references/volume-pass.md` |

## 三、适用性判断

v5 的产物按「能否只看本集完成」划分：

| v5 产物 | 能否按集独立完成 | 处理位置 |
|---|---|---|
| documents / coverage | 能 | 读取者，merge 汇总 |
| episodes[].synopsis / opening / ending | 能 | 读取者 |
| beats（setup/outcome/sourceRefs） | 能，但需要全局编号 | 读取者写本地编号，merge 重新编号 |
| ending.question（Q 的提出） | 能 | 读取者 |
| beats[].resolves（Q 的回答） | 批内能，跨批不能 | 批内由读取者完成，跨批由串联完成 |
| story.summary / endingBeatId | 不能 | 串联 |
| restriction / continuity notes | 部分能 | 读取者写本集事实，串联补跨集部分 |
| 同名不同人描述的统一 | 部分能 | 读取者登记，串联统一 |

v5 已经取消人物、地点、道具的身份归并，跨集依赖只剩上表三行，量小且集中。因此适合并行。

**不适合并行的情况：**

- 体量小，比如样例《旧站时刻》只有 6 集、不到 3KB。派发与合并的开销大于收益。
- 非线性结构极强，几乎每集都和多集互相依赖，同时总量又能放进一个上下文。

这两种情况继续使用串行流程。

## 四、总体流程

```
原件文件夹（只读，不覆盖）
  │ source-folder：登记全部集文件 → outline/.work/sources.json；集号只从文件名解析
  ▼
主会话分流：正式 outline 已存在或体量小 → 现有串行流程；首次生成且体量大 → 下列并行流程
  │ 主会话按原文体量分批：整集为单位，每批是连续的集号区间
  ▼
读取 subagent × N（同一条消息内并发）
  │ 每个只负责本批的集，可以把上一集文件作为只读上下文
  │ 产出 .work/fragments/batch-XX.json（合法的 v5 partial outline）
  │      .work/fragments/batch-XX.handoff.md（交接记录）
  │ 自行执行 validate --stage full --verify-sources，直到通过
  ▼
merge：确定性合并 → outline/.work/draft.json（草稿，独占创建）
  ▼
串联 subagent（同一时刻只有它写 draft.json）
  │ 读取：draft.json + 全部 handoff + sources.json；不通读原文
  │ 处理：跨批 Q 回答、前情依赖请求（检索 + 定向回读）、summary、endingBeatId、
  │       同名描述统一、跨集 restriction/continuity notes
  │       后文揭晓影响前文说法时，定向回读并直接修改受影响的内容
  ▼
validate draft.json --stage full --verify-sources --source-base outline
  ▼
核验 subagent × N（按批）＋ 1 个跨集核验 subagent → .work/review/*.md（只写结论）
  │ 发布者修改 → 重新校验 → 只复核受影响的批次；两轮仍未通过，停下向用户报告
  ▼
publish：draft.json → outline/outline.json（唯一正式文件，独占创建）
  ▼
render 报告（xxx-report.md / xxx-report.html）
```

**单一写者规则：**

- 读取者、串联者、核验者都**不写** `outline/outline.json`。正式文件只由 `publish` 创建。
- merge 只负责创建 `draft.json`。
- 串联 subagent 运行期间，它是 `draft.json` 的唯一写者；结束后写者是主会话。
- 任意时刻只有一个写者。

**阶段关系不变：** 完整流程仍然是 outline → characters → art → script → creation，不能跨阶段并行。本方案的并行只发生在 outline 阶段内部。

## 五、确定性工具改动

全部改动位于 `skills/mint-outline/scripts/`：只使用 Node 标准库，不引入兄弟 skill 的代码。

### 5.1 新增 `source-folder`

```bash
node {baseDir}/scripts/mint-outline.mjs source-folder 剧本目录 --out outline/.work/sources.json
```

**处理规则：**

1. 只读取目录第一层的 `*.md` 普通文件，不递归，忽略隐藏文件。符号链接解析后的实际文件不能重复（复用 `verifySources` 的重复判定思路）。
2. **只从文件名解析集号**，依次尝试下列写法：
   - `第N集`，N 可以是阿拉伯数字，也可以是中文数字「一」到「九十九」，以及「一百」到「九百九十九」。
   - `ep N` 或 `E N`，不区分大小写，可带分隔符。
   - 文件名开头的数字。

   任何文件解析不出集号，或者两份文件解析出同一集号，直接报错，并列出全部文件及解析结果。**不按内容猜测集号。**
3. **正文一致性检查：** 扫描每份文件里匹配 `^\s*(?:#{1,6}\s*)?第(.+?)集` 的行。只要有一行解析出的集号和文件名不一致就报错，用来发现一个文件里装了两集，或者文件名写错。正文里没有集标题时不报错。
4. 每份文件复用 `sourceDocument` 计算 SHA256 和物理行数，空文件报错。
5. 文档 ID 由集号决定：`D` 加集号，补零到至少两位，也补齐到最大集号的位数（例如 `D07`、`D112`）。同一集重新登记时 ID 不变。
6. 集号可以不从 1 开始，也可以有缺口。缺口不报错，写进输出的 `missingEpisodes`，主会话在汇报中列出。
7. 输出独占创建（`wx`），已有文件时报错，和 `chunk` 一致。

**`sources.json` 的格式**（`.work` 中间文件，不是正式产物，不设 schemaVersion；merge 读取时按封闭字段检查）：

```json
{
  "kind": "script-folder",
  "documents": [
    {"id": "D01", "ep": 1, "path": "../../剧本/第01集.md", "sha256": "…", "lineCount": 37}
  ],
  "missingEpisodes": []
}
```

`path` 相对 `sources.json` 自身所在目录，和 provenance 的「相对所在文件」规则一致。

### 5.2 修改 `chunk`

- 增加 `--id ID`，传给 `chunkScript` 的 `documentId`，默认 `D01`。
- 输出文件名改为 `source-chunks-<documentId>.json`，同一工作目录可以分别切多份文件，仍然独占创建。按照「不允许多版本共存」，不保留旧文件名分支，同时修改文档和测试。
- 分界正则改为 `^\s*(?:#{1,6}\s*)?(?:第.+[集场]|(?:EPISODE|SCENE|INT\.|EXT\.)\b)`，允许 md 标题前缀。

分集文件通常不需要再切块。只有某一集长到读取者需要分段阅读时，读取者才在自己的批目录里执行 `chunk --id`。

### 5.3 新增 `merge`

```bash
node {baseDir}/scripts/mint-outline.mjs merge outline/.work/fragments/batch-*.json \
  --sources outline/.work/sources.json --out outline/.work/draft.json --publish-to outline/outline.json \
  --source 作品标题 --scope partial|complete [--total-episodes N]
```

`--out` 是草稿位置，`--publish-to` 是将来的正式位置。草稿里的来源 `path` 按 `--publish-to` 所在目录计算，发布时文件内容不用改写。`--publish-to` 已经存在时直接报错（只支持首次生成）。

**fragment 自身规则：** 先对每份 fragment 执行 `checkup(frag,{stage:'full',verifySources:true,artifactPath:frag})`，必须通过；然后检查以下各项：

- `provenance.scope` 为 `partial`。不写 `totalEpisodes`、`story.endingBeatId`、`lang`、`params`、`creativeBrief`，这些都需要全局视角或属于项目配置。
- `source` 必须等于 `--source`。
- `provenance.documents` 的每一项，都要在 `sources.json` 里找到 id、sha256、lineCount 和解析后的实际文件都相同的条目。
- 每份文档的 coverage 恰好为 `1..lineCount`，即**整集负责**，一集不拆给两个读取者。
- fragment 的 `episodes[].ep` 集合，等于它所含文档在 `sources.json` 里对应的集号集合。
- `beats[]`、`episodes[]` 以及带 `episode` 字段的 notes，其 `sourceRefs` 只能指向本集对应的文档。`story` 和顶层 notes 可以引用本批任一文档。
- B 和 Q 采用批内本地编号，从 `B01`、`Q01` 起。批内 `resolves` 指向本批的 Q。
- fragment 的集号必须是 `sources.json` 里的一段连续区间（缺集不算断开），例如第 1–3 集。

**跨 fragment 检查：**

- `sources.json` 里的每份文档恰好被一个 fragment 负责，既不能没有人负责，也不能重复负责。
- 各 fragment 的集号区间互不交叉。现有校验要求 beats 按集号不递减排列（`outline-core.mjs` beats 门），区间交叉时按批拼接会违反这一点，因此 merge 先显式检查，报错写明是哪两批。
- 以上任意一项失败都直接报错，并给出 fragment 路径和具体项，**不写出文件**。

**合并规则（确定性）：**

1. fragment 按所含最小集号排序。
2. `provenance.documents`：按 `sources.json` 的顺序排列，`path` 改为相对 `--publish-to` 所在目录。`coverage` 每份文档一条 `1..lineCount`。`scope` 和 `totalEpisodes` 只取命令参数，不推断；`complete` 必须带 `--total-episodes`，其余条件交给现有 `provenanceErrors` 判断。
3. `beats`：按 fragment 顺序拼接，全局重新编号为 `B01…`，位数自然扩展（`B100` 符合 `B\d{2,}`）。
4. Q：按集序全局重新编号为 `Q01…`，批内 `resolves` 按每批各自的对照表改写。
5. `episodes`、顶层 `notes`、`story.notes`：按顺序拼接，引用坐标不变（文档 ID 本来就是全局的）。
6. `story.summary`：把各批摘要按「第 a–b 集：…」前缀和空行拼起来，作为合法草稿。`story.sourceRefs` 取各批的并集。串联阶段再改写成全剧摘要。这份拼接摘要能通过结构校验，所以草稿必须留在 `.work`，不能直接当作正式产物。
7. 在内存中执行 `checkup(…,{stage:'full',verifySources:true,baseDir:dirname(--publish-to)})`。通过后才独占写出 `--out`；失败不写，并打印门结果。
8. 标准输出打印 JSON 摘要，只给事实：fragment 数量、文档数、beat 数、Q 数、未回答的 Q 列表（新 ID）、B 和 Q 的新旧 ID 对照表（批次加本地 ID → 全局 ID），供串联核对 handoff 里的本地编号。

### 5.4 validate / checkup 增加 `--source-base`

```bash
node {baseDir}/scripts/mint-outline.mjs validate outline/.work/draft.json --stage full --verify-sources --source-base outline
```

草稿不在正式位置，来源 `path` 要按正式目录解析。`--source-base DIR` 直接传给现有 `verifySources` 的 `baseDir` 参数（API 已经支持，只是 CLI 没有接出）。只在带 `--verify-sources` 时有效，否则报错。

### 5.5 新增 `publish`

```bash
node {baseDir}/scripts/mint-outline.mjs publish outline/.work/draft.json --to outline/outline.json
```

1. `--to` 已经存在时报错，不覆盖（只支持首次生成）。
2. 执行 `checkup(draft,{stage:'full',verifySources:true,artifactPath:--to})`，失败不写。
3. 通过后把草稿原样独占写到 `--to`（`wx`），再由主会话执行 `checkup --downstream` 和 `render`。

publish 只做结构校验和写入，不代表核验已经通过；是否发布由主会话依据 `review/*.md` 的结论决定。

导出 `sourceFolder(dir,{out})`、`mergeFragments(fragments,{sources,out,publishTo,source,scope,totalEpisodes})` 和 `publishDraft(draft,{to})`，`schema.md` 的公共 API 列表同步更新。

## 六、中间文件约定

全部放在 `outline/.work/`，不进入版本控制，也不是正式产物。

| 路径 | 写入者 | 内容 |
|---|---|---|
| `sources.json` | source-folder | 见 5.1 |
| `fragments/batch-XX.json` | 对应读取者 | 合法的 v5 partial outline，规则见 5.3 |
| `draft.json` | merge 创建，之后串联者或主会话修改 | 合并后的 v5 草稿，`publish` 后成为正式 outline |
| `fragments/batch-XX.handoff.md` | 对应读取者 | 交接记录，格式见下 |
| `review/batch-XX.md`、`review/cross.md` | 对应核验者 | 核验结论 |

`batch-XX` 中的 `XX` 是两位批次号，由主会话按集序分配，每批是一段连续集号。

**handoff 固定章节**（自由文本，代码不检查；固定标题方便串联者查找）。每条都要带本批本地 B/Q ID，或者 `documentId:起止行`：

1. **本批提出的问题**：本地 Q ID 和提出位置。批内已回答的写明由哪个本地 B 回答。
2. **疑似回答前文的事件**：本地 B ID，以及它回答的是什么样的问题（用自然语言描述，不猜前文的 Q ID）。
3. **前情依赖请求**：本批某处没有解释、却依赖更早信息的内容。写明本批位置、需要什么信息、建议的检索词（人名、称谓、物件、原句片段）。
4. **同名与未知说话者**：本批采用的称呼及出处。
5. **批末状态**：物品持有人、损坏或恢复、伤势、知情状态，每项带出处。
6. **无法确定的事项**：原文缺失、互相矛盾、看不懂的地方。

## 七、角色与派发

新增 `skills/mint-outline/references/dispatch.md`，按本 skill 的情况编写，不引用 mint-creation 的派发文档。

### 7.1 主会话（调度方与最终发布者）

- 执行确定性命令，分批，派发 subagent，判断循环是否结束，向用户汇报。
- 开始前检查正式 outline 是否已经存在；存在时不走并行流程。
- **不细读原文，不替读取者补写提取结果。** 修改核验意见时只做定向回读。
- **分流规则**，以下数值是初始经验值，需要按实际模型校准，不能用来证明读全：
  - 原文总量约在 3 万字以内且不超过 10 集：串行。
  - 超过时：并行。每批以整集为单位，是一段连续集号，约 1 万到 1.5 万字。
  - 并发先从 3–4 个开始。
  - 对白密集、频繁闪回、身份转换多的集，缩小批次。
- subagent 只回报文件路径、一行状态和未决数量。主会话不让 subagent 把正文贴回会话。

### 7.2 读取者（每批一个）

**简报内容：**

- 本批负责的集号和文件绝对路径。
- 上一集文件路径（可选）：只用于理解，不能引用。
- 输出路径。
- 必读文档的绝对路径：`创作指南.md`、`schema.md`、`volume-pass.md`，以及 `dispatch.md` 的读取者一节。

**步骤：**

1. 逐份完整阅读本批原件；长集可以先执行 `chunk --id`，再分段阅读。
2. 对每份文件执行 `source-document 文件 --artifact 本批fragment路径 --id 指定ID`，生成 documents 条目。
3. 写出 fragment 和 handoff。
4. 执行 `validate fragment --stage full --verify-sources`，失败就自行修改，直到通过。

**禁止：**

- 写本批以外的路径。
- 引用上下文文件。
- 猜测前文的 Q ID 或前情。不知道的写进 handoff 第 3、6 节。
- 写 `totalEpisodes`、`endingBeatId`、`lang`、`params`、`creativeBrief`。

### 7.3 串联者（一个）

**输入：** `outline/.work/draft.json`、全部 handoff、`sources.json`、merge 打印的 ID 对照表。

**任务：**

1. **跨批 Q 回答：** 先按 handoff 第 1、2 节和 Q 列表找候选，再定向回读提出位置和回答位置的原文。确认后写入 `resolves`。确认不了就保持未回答。
2. **前情依赖请求：** 先在各集原文里检索建议的关键词（Grep 或 rg），再按命中的行范围定向回读。确认后在对应集补 notes；必要时补 beat，新 beat 使用当前最大编号加一，**不重排已有 ID**，以免 handoff 和核验记录里的引用失效。查不到就在当前集写一条 epistemic 为 uncertain 的 notes，或保持未知，不补写。
3. **全剧摘要与结尾：** 改写 `story.summary`。scope 为 complete 且末集结尾确实可以识别时，设置 `endingBeatId`。
4. **统一同名描述：** 统一同名不同人和未知说话者的描述，不建立身份 ID。
5. **跨集禁区：** 补跨集的 restriction / continuity notes，比如「此时某人尚不知情」。
6. **揭晓影响：** 如果后文揭晓改变了多批前文说法的性质（例如某人一直在说谎），串联者定向回读受影响的原文，直接修改 draft.json 中的相关 notes 或 epistemic，并在回报中列出改动涉及的批次，供核验阶段复核。
7. 执行 `validate draft.json --stage full --verify-sources --source-base outline`，直到通过。

**原则：** 不通读全剧。检索命中太多、无法定向回读时，缩小检索词或者报告给主会话，不改成整体阅读。

### 7.4 核验者

- **按批核验，每批一个。** 输入本批原件和 draft.json 中本批的集、beats、本批提出或回答的 Q。按 `创作指南.md`「来源／正文核验」的 8 项逐条检查，结论写入 `review/batch-XX.md`。每条结论都要给出 documentId、行号和 B/Q ID。
- **跨集核验，一个。** 检查 Q 链、`endingBeatId`、summary、跨集 notes、揭晓顺序。沿链条定向回读原文，结论写入 `review/cross.md`。
- 核验者只写结论，不修改 draft.json，也不读取读取者或串联者的自我评价。
- **修复循环：** 发布者修改后重新校验，只对内容改动涉及的批次复核；如果跨集对象变了，同时复核跨集。两轮仍未通过就停下，向用户报告未解决项。不新增失败累积日志。

### 7.5 运行环境

| 环境 | 派发方式 |
|---|---|
| Claude Code | 使用 Task/Agent 派发通用 subagent，同一批次的调用放在同一条消息里并发 |
| pi | 有子代理扩展时使用 `subagent` 工具；没有时通过 bash 启动独立的 `pi -p` 进程 |
| 两者都不能 | 在当前会话按同样的文件约定依次完成，汇报中注明「提取、串联与核验在同一会话完成，核验不独立」 |

不新增 agent 定义文件。简报直接给出 `dispatch.md` 的绝对路径。`SKILL.md` 的 `allowed-tools` 增加 `subagent`，与 mint-creation 的写法一致。

## 八、文档改动清单

| 文件 | 改动 |
|---|---|
| `SKILL.md` | 执行流程第 3 步加入分流规则，并行时按 `dispatch.md` 执行。说明阶段之间不能并行，阶段内部可以并行提取。正式命令增加 `source-folder`、`merge`、`publish`、`chunk --id`，`validate`/`checkup` 增加 `--source-base`。说明并行流程只用于首次生成。version 升到 5.1.0（schemaVersion 不变） |
| `references/dispatch.md` | 新增，内容见第七节 |
| `references/volume-pass.md` | 操作第 3 步改为新的分块文件名；第 4、5 步改为引用 fragment 和 merge；增加「分集文件夹输入」一小节 |
| `references/schema.md` | 公共 API 增加 `sourceFolder`、`mergeFragments`、`publishDraft`；说明 fragment 和 draft 是 `.work` 中间件，不是第二种正式格式 |
| `references/创作指南.md` | 「来源／正文核验」一节补充按批核验和跨集核验的分工 |
| `README.md`、`README.en.md` | 命令列表和流程简介同步更新 |
| 仓库 `CHANGELOG.md` | 新增条目 |

## 九、样例与测试

### 9.1 样例（outline 自有，不借用兄弟 skill 的样例）

故事已经定好：沿用《旧站时刻》，不新增故事。

- **`examples/旧站时刻-分集/`**：把 `旧站时刻-script.txt` 按集拆成 6 份 md。
  - 每份第一行写成 `# 第一集 旧站值班室 日` 这类 md 标题，用来测试 md 标题识别。
  - 文件名混合使用 `第01集.md`、`第二集.md` 等写法，用来测试集号解析。
  - 正文和原稿逐字一致，不改写。
- **`scripts/fixtures/parallel/`**：
  - `batch-01.json`（第 1–3 集）、`batch-02.json`（第 4–6 集），以及对应的 handoff.md。
  - 第 1 集的 Q 由第 2 集回答，属于批内；第 3 集的 Q 由第 5 集回答，属于跨批，用来演示串联。第 6 集的问题保持未回答。
- **`scripts/fixtures/parallel/stitched.json`**：merge 生成草稿后再完成串联的期望结果，内容是跨批 resolves、全剧 summary、`endingBeatId`。它是测试夹具，不是第二份正式样例。

### 9.2 测试

新增 `scripts/parallel-selftest.mjs`，加入 `selftest.mjs` 的子测试列表。只使用临时目录，不调用模型。

**source-folder：**

- 6 份样例文件按集号排序，ID 为 `D01…D06`。
- 两种中文数字写法和阿拉伯数字写法都能解析。
- 下列情况报错，且不写出文件：
  - 文件名解析不出集号。
  - 两份文件解析出同一集号。
  - 正文集标题与文件名不一致。
  - 空文件。
  - 符号链接重复。
  - 输出文件已经存在。
- 缺集时 `missingEpisodes` 正确，不报错。
- `path` 相对 `sources.json`，并且能通过重新计算 sha 的核验。

**chunk：**

- `--id D03` 写入 `source-chunks-D03.json`，所有 owned 范围的 `documentId` 都是 `D03`。
- 同一目录可以连续切两份不同的文件；再切同一份文件时报错。
- md 标题 `## 第3场` 能作为分界。

**merge：**

- 两份样例 fragment 合并后，草稿通过 `validate --stage full --verify-sources --source-base` 正式目录。B 和 Q 全局连号，批内 `resolves` 已经改写。未回答 Q 列表包含跨批的那个 Q 和第 6 集的 Q。
- 把夹具串联修改（跨批 resolves、summary、`endingBeatId`）应用到合并结果后，和 `stitched.json` 逐字段一致，并通过 full 校验。
- 下列情况都失败，并且不写出文件：
  - 遗漏一个 fragment，导致某份文档无人负责。
  - 两份 fragment 负责同一份文档。
  - fragment 只覆盖了一份文档的部分行。
  - fragment 的集号和 `sources.json` 不对应。
  - fragment 的集号不是连续区间，或者两份 fragment 的集号区间交叉。
  - beat 引用了其他集的文档。
  - fragment 写了 `totalEpisodes`、`endingBeatId`、`lang`、`params` 或 `creativeBrief`。
  - fragment 的 `source` 不一致。
  - fragment 文档的 sha 和 `sources.json` 不一致。
  - fragment 本身不能通过 full 校验。
  - `--scope complete` 却没有提供 `--total-episodes`。
  - 草稿文件已经存在。
  - `--publish-to` 指向的正式文件已经存在。
- 草稿的 `path` 相对 `--publish-to`，换一个正式目录仍然能通过来源核验；不带 `--source-base` 校验草稿时来源核验失败。

**validate / checkup `--source-base`：**

- 不带 `--verify-sources` 时使用 `--source-base` 报错。

**publish：**

- 已通过串联的草稿发布后，正式文件与草稿逐字节一致，并通过 `validate --stage full --verify-sources`。
- 下列情况失败，并且不写出文件：
  - 正式文件已经存在。
  - 草稿不能通过 full 校验。
  - 草稿的来源 `path` 按正式目录解析不到原件。
- 只接受 schemaVersion 5 的 fragment，其他版本直接报错，不提示迁移。

**现有回归：**

- `selftest.mjs` 的独立复制测试同时执行新子测试。
- 文档本地链接检查覆盖 `dispatch.md`。

## 十、不做的事

- 不改变 outline schemaVersion 5 的正式契约，不新增正式产物格式，不写迁移或兼容分支。
- 不新增状态服务、文件锁、数据库、失败累积日志或统计。
- 不新增调度脚本，派发仍由主会话按指南执行。
- 不新增 agent 定义文件。
- 不把一集拆给多个读取者。超长集由读取者在自己的批次内部分段阅读。
- 不对 handoff 和核验结论做代码格式检查，它们都是自由文本工作记录。
- 不支持用并行流程更新已有的正式 outline。merge 会全局重新编号 B/Q，而 script 下游按顺序认领 B ID（`outline-downstream.mjs`），重新合并会让已有认领失效。正式 outline 已存在时，`merge --publish-to` 和 `publish` 都直接报错，主会话改走现有串行流程。
- 不设单独的修订角色和揭晓包、修订提案文件。揭晓影响由串联者定向回读后直接修改草稿，再由核验阶段复核。
- 不宣称并行结果已经通过语义核验。`contentReview` 仍然固定为 `not-performed`。

## 十一、暂不包含

- **串联索引（`index` 命令）**：从 draft.json 抽取精简索引（Q 列表、每个 beat 的一行摘要、handoff 中的疑似回答和依赖请求），降低串联者的输入量。
- **分层串联**：先按剧情段落串联，再串联段落之间的部分。

- **修订者角色**：揭晓影响面很大、串联者一个上下文改不过来时，按受影响的批次派发修订者写提案。
- **更新已有正式 outline**：需要已有 B/Q 编号保护和下游重新认领的方案。

前两项针对超长剧集里「串联者输入过大」的问题，后两项等实际运行中出现需求，再另外出方案。

## 十二、风险

| 风险 | 应对 |
|---|---|
| 跨集质量集中在串联这一步 | 设置跨集核验；串联只做定向回读，结论都带坐标 |
| 后文揭晓让前文细节变重要，但读取者当时没有记录 | handoff 的前情依赖请求，加上串联者检索和定向回读 |
| 大反转改变多批前文说法的性质 | 串联者定向回读并修改，回报改动涉及的批次，只复核这些批次 |
| 读取者看不懂前情时自行补全 | 简报明确「不知道就写进 handoff」；核验第 7 项检查是否补写 |
| 分批经验值不适合实际使用的模型 | 文档标明是初始值，需要校准；批次大小从不作为读全的证明 |
| 工具白名单不是沙箱，subagent 可能写出界 | 每个读取者只有自己的输出路径；merge 只信任 `sources.json` 并重新核验；正式文件只由 publish 独占创建 |
| 流程中断，留下摘要只是拼接、跨批 Q 未回答的半成品 | 合并、串联都在 `.work/draft.json` 进行，核验通过前正式位置没有文件 |

## 十三、实施顺序与验收

1. `lib/source.mjs`：实现 `sourceFolder`、中文数字解析、chunk 正则；CLI 增加 `source-folder` 和 `chunk --id`；补对应测试。
2. 拆分样例分集文件，编写两份 fragment、handoff 和 stitched 夹具。
3. 新增 `lib/merge.mjs`，实现 `mergeFragments` 和 `publishDraft`；CLI 增加 `merge`、`publish`，`validate`/`checkup` 增加 `--source-base`；补对应测试。
4. 新增 `dispatch.md`，修改 SKILL.md、volume-pass.md、schema.md、创作指南.md、两份 README。
5. 写 CHANGELOG，把 skill version 升到 5.1.0。
6. 运行 `node skills/mint-outline/scripts/selftest.mjs` 和仓库级 `scripts/self-contained-selftest.mjs`，全部通过。

**验收：**

- 第 6 步的测试全部通过。
- 在一个真实的分集文件夹上，完整执行一遍「source-folder → 并行读取 → merge → 串联 → 核验 → publish → render」，记录批次划分、各角色回报和核验结论。这一项属于人工演示验收，不由自测代替；在实施验收文档里单独写明是否执行。
