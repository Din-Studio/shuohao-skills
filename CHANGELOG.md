# Changelog

## 创作策略解耦与 v2 数据契约

**novel-setup 3.0.0 · novel-outline 2.0.0 · novel-script 2.0.0 · novel-characters 2.0.0 · novel-art 2.0.0 · novel-creation 2.0.0**

- 六个 skill 保持原有职责与产物目录。`production.json.creative` 记录题材、叙事风格、结构、节奏的明确版本选择，与视觉正文和模型参数分离。
- 大纲、剧本、视频创作各自携带本地 JSON profile、Markdown 指南、发现／查看／显式应用入口和测试。没有跨 skill 运行库，不执行 profile 代码。
- 应用从中性基线重建阶段规则。旧覆盖和手工差异必须逐项决定；确认后备份并原子写入。校验和渲染不重新合并模板。同版本来源漂移不能通过重新确认摘要接受，须恢复来源或明确升级。
- 首批组合包括密集兑现连续剧、渐进悬疑、舒缓生活单元。关闭规则不再靠超大阈值；策略不能放宽引用、实际位置、明确问题承诺和模型能力限制。
- 大纲与剧本要求 `schemaVersion: 2`。新增中性作品承诺、event/pressure/turn/payoff 节点、suspense/closure/open 集尾与可选阶段里程碑。剧本按稳定节点 ID 认领不重叠的核心表现段，并与上游开场、集尾及目标时长重新对账。
- 台词长度、开场窗口与切镜范围改为 off/warn/error 规则。语速、动作估时、容差与模型技术参数仍独立管理。视频创作不再无条件要求快速切镜或末尾悬念。
- 检查结果统一使用 pass/fail/skipped，区分基础契约、策略提醒、来源提醒、跳过原因和内容评审。字段齐全和估算时长不证明内容或成片效果。
- 各 skill 使用自己的故事与本地夹具。三组合联合测试使用独立原创 fixture；物理拷贝自测验证无兄弟依赖。合并报告补充失败面板提示、歧义文件拒绝及 ID 选择器作用域。
- 升级前备份旧产物。逐个判断旧节点、重建集尾计划并核对真实正文，不能仅重命名旧 hook／爽点字段。具体迁移说明随各 skill 携带。

以下版本记录保留历史事实，不代表当前仍采用旧字段或固定创作配方。

## 移除 storyboard 模式

**novel-setup 2.0.0**

- 删除 `novel-storyboard` 的 skill、脚本、参考文档、样例与截图。
- 视频制作统一由 `novel-creation` 执行，保留分段切镜、设定图挂载、模型专用提示词与下单。
- 合并报告最后一段改为 `creation`，命令行改为 `--creation`；旧 `--storyboard` 参数报错，不静默忽略。
- 生产参数删除 `image.frame`、`--frame-resolution`、`resolve --for storyboard` 与关键帧比例门，剩余 8 道质量门。旧 JSON 的 `image.frame` 被忽略，不自动迁移旧投产包。
- `style.phrase` 仍供 Seedance 提示词指南使用，保留；资产图画幅与视频画幅独立校验。
- 安装器清理指向本仓库的退役软链，不删除真实目录或其他来源的链接。
- 更新中英文说明与流程图。以下版本记录及固定提交研究保留历史描述，不代表当前可用功能。

## novel-creation 与 novel-storyboard 互相不再当参照物 — 借来的表述全部内化

**novel-creation 1.3.0 · novel-storyboard 1.10.0**

`novel-creation` 的文档与注释里有二十多处拿 `novel-storyboard` 当参照物：「比它少一层」
「与它同一套判定」「与它同一张表」「从它那边搬提示词最容易带过来的就是……」。手上只有这
一个 skill 的人读到这些句子，读到的是**指向不存在的东西的指针**——而 skill 必须自包含、
可以整个拷走，这是仓库的第一条规则。

这一版把它们全部改写成本 skill 自己说得清的表述：

| 原来 | 现在 |
| --- | --- |
| 「比 novel-storyboard 少一层」 | 「不出分镜图这一层中间产物」——直接说自己是什么形状 |
| `shot-recipe` 门「与 novel-storyboard 同一套判定」 | 三条判定逐条写进 `SKILL.md`：id 在卡库里、卡片的必备短语进对应 `[Shot k]` 行、多格配方连排够格数；建议景别与运镜只提示不设门 |
| README 的「跟 novel-storyboard 怎么选」对照表 | 换成「什么时候用它」：合适与不合适各自说清楚，不靠比较另一个 skill 来定义自己 |
| 「17 道门 ＝ 它的 18 道 − 4 ＋ 3」 | 直接列本 skill 的 17 道门，分四组写清 |
| 提示词文档的「跟那套 H3 骨架的边界」 | 「这份骨架刻意没有的四样」——对齐指令、切点时刻、`<d>` 标签、`(S1)` 编号，为什么没有各自写清 |
| 报告约定的「与 storyboard 同款」「替代 storyboard 的生成批次单」 | 按本 skill 自己的产物描述：段卡嵌的是既有设定图，挂载单回答的是「下单前参考图文件在不在」 |
| 代码注释的「与 novel-storyboard 逐字相同」「同一个机制」 | 把机制本身写出来：`[Shot k]` 切片由 `shots:` / `ambience:` 夹出来，计秒规则是台词按字数 ÷ 语速、动作按固定秒数 |

反方向的三处也一起改了。`novel-storyboard` 里有三句拿 `novel-creation` 解释自己的字段名
（「英文 token 与那条产线的骨架刻意取齐」），换成本 skill 自己站得住的说法：**两种语言的
token 一一对应，切 `promptLang` 只换字段名，切片机制与门的判定不变**——`references/schema.md`、
`references/seedance2-prompt.md`、`scripts/novel-storyboard.mjs` 的骨架注释各一处。

**行为一个字没变**：两个 skill 的门 id 与判定逻辑、提示词骨架、命令行接口全部照旧，
novel-creation 的 279 项、novel-storyboard 的 360 项自测原样通过。改的全是文档与注释里
那些「要去别处才读得懂」的话。

两条产线怎么选，仍然写在仓库根的 `README.md` 里——那是两个 skill 都在场的地方，比写进其中
一个 skill 里合适。

## novel-creation 补上 H3 填法指南 — 指南按 video.model 动态载入，不再默认某一个模型

**novel-creation 1.2.0**

`novel-creation` 的提示词骨架是跨模型通用的，填法按模型分流。但分流以前只做了一半：
挂 seedance 系列有一份 `seedance2-prompt.md`，挂 `MiniMax H3` 却是「照通用骨架写完就够了，
没有附加约束」。**H3 官方指南里有一大半跟有没有关键帧无关**，那半边一直没人搬过来。

新增 `references/h3-prompt.md`（官方 I2VA 指南的内化版，学习来源写在文首）。它**不是**
`novel-storyboard` 那份的副本——两条产线的前提不同，搬过来的东西也不同：

| H3 官方有的 | novel-creation 搬不搬 |
| --- | --- |
| 对齐指令、切点时刻、`<d>` 台词标签、`(S1)` 说话人编号 | **不搬**——参考图是整段共享的身份锚，不钉在某一秒 |
| 语言分工与禁人名、说话人第一次出现给足辨识信息、画外音的唇形闭合句、声景两个字段怎么收进一个 `ambience:`、运镜写成自然动作句 | **搬**——这些是 H3 对提示词本身的口径，与关键帧无关 |

同时把「读哪份指南」从写死改成**动态载入**：`creation-prompt.md` 现在只定骨架，开头一节
要求先读这部剧的 `video.model`、再决定读哪一份填法指南；**没收录的模型照通用骨架写，
不许拿另一族的指南顶上**（两族的语言默认、时刻能不能写、台词用什么符号全不一样）。

代码里新增 `promptGuideOf()`，它比 `promptFamilyOf()` 严一档：归族是「不是 seedance 就算
h3 族」，但**一个全新的模型不该被塞去读 MiniMax 的官方口径**——解不出指南就返回 `null`。
`validate` / `checkup` / `export` 找到生产参数会打印一行
`↳ 视频模型 … → 填法指南 references/…`，`prompt-model-fit` 门的详情也跟着报同一件事。

门的数量没变（17 道），逻辑也没变——**这一档没有确定性硬约束可查，门就明说没有**，
不假装查了什么。

## 画风交给用户 — 移除内置的 realistic / ghibli，改成 production.json 顶层的一块正文

**novel-setup 1.5.0 · novel-characters 1.18.0 · novel-art 1.9.0 · novel-storyboard 1.9.0**

以前画风是一个两档枚举（`realistic` / `ghibli`），正文分别写死在三个出图 skill 的代码里。
那样有两个问题，都不是能靠加一档预设解决的：

- **想拍第三种就得改代码。**水墨、黏土定格、80 年代胶片颗粒、赛璐璐——每加一档要动三个仓库文件、
  三份自测、三份文档。而画风本来就是用户的创作决定，不是这套工具该有主张的地方。
- **同一档画风的正文存了三份。**`novel-characters` 有角色版，`novel-art` 有环境版，`novel-storyboard`
  有一句短语，靠「同名对齐」这个口头约定维持一致。改一处漏两处，而漏了不会报错——它只是安静地漂。

现在画风**就是 `production.json` 顶层的 `style` 字段本身**，由用户在 `novel-setup` 那一段填：

```json
{
  "style": {
    "label": { "zh": "水墨", "en": "Ink wash" },
    "phrase": "ink wash film still",
    "character": { "render": "…", "surface": "…", "lighting": "…", "negative": "…", "tags": ["…"] },
    "scene":     { "render": "…", "surface": "…", "negative": "…", "tags": ["…"] }
  }
}
```

**写什么下游就查什么，不用改任何代码。**上面那个水墨的例子是真跑过的：填进去之后，
三个出图 skill 立刻开始按水墨那套查，还写着上一档渲染句的产物整批被拦。

### 一块画风为什么要分成 character 与 scene

它们是**同一个画风的两种落地**，不是同一段文字。写实的人要毛孔、皮下散射、根根分明的碎发；
写实的环境要斑驳、水渍、包浆、灰尘。把角色那套带进环境，出来就是四不像——
这条以前是靠两个 skill 各存一份预设隐式保证的，现在写进了 schema 与 `style-template` 的字段说明。

`scene` 比 `character` 少一块 `lighting`：场景的光照状态（晨雾/正午/夜）是 `novel-art`
逐个场景自己定的，一个场景可能有三档时段；角色设定图的光照是**版面级**的固定规则
（左栏方向光给体积、右侧平光好抠图），所以归在画风里。

### 那条写死的知识，改成了不认识任何画风的规则

以前 `novel-characters` 与 `novel-art` 里各有一条：「`realistic` 绝不能禁 `photorealistic`，
`ghibli` 必须禁」。画风交给用户之后那句话没法再写死——但**它背后的规则可以**：

> 同一个短语既写进 `render`/`surface`/`lighting`/`tags`，又写进 `negative`，就是自相矛盾。

这就是新的 `style-coherent` 门。它不认识任何一档具体画风，却正好复现了原来那两条，
而且对水墨、黏土定格同样成立。判定按**完整短语**（`negative` 按逗号分号拆成词条，逐条带词边界地找），
所以 `negative` 里的 `text` 不会被 `surface` 里的 `micro-texture` 命中——误报的门比没有门更坏。

### 门的变化

| skill | 变化 |
| --- | --- |
| **novel-setup** | 7 → **9 道**。新增 `style-blocks`（各块填全、`phrase` 是纯 ASCII）与 `style-coherent`（上面那条）。`fields` 里的 `style` 枚举检查改成「是个对象」 |
| **novel-characters** | 门数不变，但那两条从「核对标签同名」改成**查真东西**：`render` 原句进了 `image.sheet` 与 `image.prompt`，`negative` 的每一条进了 `image.negativePrompt` |
| **novel-art** | 13 → **12 道**。`production-style`（核对标签）删掉，`style-match` 改成查画风整块用上 |
| **novel-storyboard** | 19 → **18 道**。`production-style` 删掉——短语只有一处产地，无从不一致 |

**核对标签同名从来没查到过真问题。**标签对上而正文没跟着换，出来还是上一档画风——那才是画风漂的真实样子，
而旧的门恰恰查不到它。新的门查的就是这个。

### 下游产物不再有顶层 style

`cast.json` / `art.json` / `storyboard.json` 的顶层 `style` 字段**删掉了**。画风正文只有一处产地，
产物里再抄一份就是第二个来源，两个来源必然会漂。`novel-art` 的 `validate` 会点名让删掉老产物里留着的那个字段。

跟着删掉的还有 `--style` 参数（`novel-characters` 的 `assemble` / `validate`）与两个 `styles` 子命令。
两个 `styles` 换成了 `style`：**从 `production.json` 读，不是打印内置预设**。

```bash
node scripts/novel-characters.mjs style   # 打印这部剧的 style.character 那一块
node scripts/novel-art.mjs style          # 打印 style.scene 那一块
node scripts/novel-setup.mjs style-template   # 拿空骨架与逐字段说明
```

### 两种跳过，说法不一样

画风那几道门有两种跳过，混为一谈会让人以为是同一回事：

| 情况 | 门怎么说 |
| --- | --- |
| 没找到 `production.json` | 「未找到 production.json（向上 5 层），本门跳过——跑 `/novel-setup` 生成一份可以打开它」 |
| 找到了但画风那一块没填 | 「production.json 里的 `style.scene` 没填，本门跳过——回 `/novel-setup` 填满它」 |

**画风也是唯一一个没有内置默认值的参数。**其余参数找不到就退回下游自己的内置默认（生图模型、档位、界面语言都有），
画风没有——它的正文本来就只住在那一份文件里，下游没有一份可退。所以那几道门只能跳过，
而跳过就要在汇报里说清：这一趟没有任何东西在保证画风不漂。

### 反向词只对场景查全，道具不查

`novel-art` 上的一处例外，是照着自带样例发现的：道具参考图是**纯白背景**的抠图素材，
而画风里冲着「环境别太干净」去的那几条反向词（`sterile showroom cleanliness` 这类）
正好和白底自相矛盾。逐条要求道具也带上，拦的是对的做法。
道具那边的反向词另有三道门管着：禁人、禁手、纯白背景。

### 顺带

- `resolve --for <阶段>` 的 `style` **只给这一段要的那一块**：`characters` 给 `character`、`art` 给 `scene`、
  `storyboard` 与 `video` 只给 `label` 与 `phrase`。整个画风对象摊开有六七十行，全倒出来会把有用的几行埋掉，
  也容易让人抄错块
- `novel-characters/references/style-presets.md` 改名 `style.md`，内容从「两档预设是什么」改写成「画风从哪来」
- 两份自带样例 `回南天` / `雪线` 填上了完整的画风正文——它们现在是**样例不是选项**：
  演示一块写满的 `style` 该长什么样，不是「只能在这两个里挑」

## 自动驾驶 — production.json 多一个 autopilot，六个下游 skill 读它决定停不停

**novel-setup 1.4.0 · novel-outline 1.5.0 · novel-characters 1.17.0 · novel-art 1.8.0 ·
novel-script 1.5.0 · novel-storyboard 1.8.0 · novel-creation 1.1.0**

管线跑完整条要经过六个 skill，每一段都有几处「停下来问用户」：大纲问集数与题材、问完还要等快版骨架拍板；
角色问画风、问报告语言、归并候选要人复核；分镜出完第一段的图等确认效果；下单前报一次花费等回应。
一次一次都是对的——**除非用户根本不想被问**。「丢一本小说进去，回来收片子」这个场合下，
每一次提问都是一次中断，六段加起来能把一趟无人值守的跑动打断十几次。

`production.json` 因此多了一个顶层字段：

```json
{ "source": "雪线", "autopilot": true, "style": "ghibli", … }
```

`novel-setup init --autopilot` 打开，默认 `false`。它是这份文件里**唯一一个不管技术参数的字段**——
不改任何一个下给模型的值，只决定下游遇到「该问用户」时停不停。放进 `production.json` 而不是让用户
每段说一次，理由和画风、语言一样：**一段问一段不问，比全问还差**。

### 转移的是审批权，不是取消检查点

这条界线是整个功能的重点，六份 SKILL.md 与 README 里都写死了：

| 不受 autopilot 影响 | 为什么 |
| --- | --- |
| **质量门照样是门** | `validate` 没过就修到过。门拦的是「白出一整批」，跟问不问用户无关 |
| **花钱前照样先算账** | 出图与下单的预估花费照样算清楚、照样报出来（打印给用户看），只是不等回应 |
| **止损照样止损** | 同一段连着失败两次仍然跳过、记进汇报。**不打断不等于无限重试烧钱** |

检查点本身也保留，只是审批人从用户换成 agent：分镜仍然先出第一段的 3–5 张再往后补，只不过
画风与构图由 agent 自己看；角色设定图出完仍然要核对「左右两栏是不是同一个人」。
**替用户做的每一个决定都要写进最后的汇报**——这是审批权转移的对价。

### 只认布尔真值

JSON 里写成字符串 `"false"`，在 JavaScript 里是**真值**——那种写法会让一整条管线闷头跑完，
比不写更坏。所以六个下游各自的 `autopilotOf()` 都是严格比 `=== true`，`novel-setup` 的 `fields`
门查类型（写了就必须是布尔值）。**整个不写不算违规**：老项目的 `production.json` 里没有这个字段，
按 `false` 处理，行为与改动前一模一样。

### 落地方式：一句 stderr + 一节 SKILL.md

真正约束 agent 的是文档——所以每个 skill 的 SKILL.md 都加了一节 `Step 0.5 — 自动驾驶`，
用一张表逐条列出「原本要问什么 / 自动驾驶下怎么办」，不写泛泛的「不要打断」。
脚本这边只做一件事：找到生产参数且开着，就在 stderr 打印一句

```
↳ 自动驾驶：开——本段流程一口气跑完，不要停下来问用户；替用户做的决定全部写进最后的汇报
```

关着不打印（那是原来的样子，没有新信息）。这句话在每次 `validate` / `render` / `export` 都会复现，
是对文档那一节的持续提醒；但 Step 0 的提问跑在第一条命令之前，所以 SKILL.md 明确要求开工前
自己看一眼那个字段。

`novel-setup` 自己不受它约束——它是这个字段的产地，成片画幅照样必须问用户。

### 顺带

- `resolve --for <阶段>` 的输出多一个 `autopilot`，`show` 的参数表多一行「自动驾驶」
- 两份样例把两档各演示一次：《回南天》关、《雪线》开
- 六个 skill 的自测各加一组断言（含字符串 `"false"` 的击穿用例），六份 SKILL.md/README 里
  已经漂掉的断言数一并对齐真实值

## 新增 novel-creation — 参考图直出视频

**novel-creation 1.0.0**

唯一能把剧本变成视频的 skill 一直是 `novel-storyboard`：段 → 分镜 → 分镜图，每个分镜先出一张
关键帧图（MiniMax H3 的 I2VA 多图对齐模式），再连同专用提示词一起下单生视频。这条链路适合要
精确控镜的正式产出，但也意味着每一集要先出三四十张分镜图才能下单——多一道生成、多一次画风
对不上的风险、多一份等待和花费。用户往往已经有 `novel-characters` / `novel-art` 出好的角色、
场景、道具设定图，有些场合不需要分镜图这一层中间产物，想直接拿这些设定图当参考图、配一条
提示词就下单。

`novel-creation` 是新增的**并列产线**，不是替代：复制 `novel-storyboard` 的段/分镜数据模型与
质量门方法论（节拍认领 + 秒数硬门 + 提示词逐字对账，这套方法已经被 19 道门验证过），砍掉分镜
图这一整层，把参考图挂载点从「每个分镜一张新生成的关键帧」改成「每段直接引用 `cast.json` /
`art.json` 已经生成的设定图」。

### 两处没有跟着 novel-storyboard 现状走

1. **视频下单不抄 `novel-storyboard` 现在还停留的 bash 文档，直接用代码编排。** `novel-art` /
   `novel-characters` 已经把出图调用从「模型现场拼 bash」搬进了 `scripts/lib/lingying.mjs`
   （见上一节）；`novel-creation` 是全新代码，没有历史包袱，照最新验证过的模式起步：一条
   `videos` 命令，提交/轮询/落盘/断点续传全在代码里，参考图整批去重上传（视频任务之间没有
   互相依赖，去掉了出图那份的「母子波次」），超时与退避按视频比出图慢一个量级调大
   （15 分钟超时、轮询起步 10 秒）。
2. **提示词不沿用 H3 的 I2VA 多图对齐结构。** `<Picture k> aligns with the 0.00-second mark…`、
   `<d>` 标签是 H3 私有语法，专为「每个分镜都有一张精确钉住秒数的关键帧图」设计——没有关键帧图
   就没有对齐指令可写。现场查证（`lingying model get`）：`MiniMax H3` 与 `seedance2.5` /
   `seedance2.0` 的 `input_schema` 都在顶层暴露通用的 `images: string[]` 字段，「参考图 + 提示词
   → 视频」是跨模型的能力，不是 H3 独有。`novel-creation` 改用一条通用、任何视频模型都吃得下的
   自然语言提示词（`references/creation-prompt.md`）：开头逐张交代参考图身份、`[Shot k]` 逐镜
   描述带景别/运镜短语、认领台词打引号原文引用，不绑定任何一个模型。

### 16 道质量门（比 novel-storyboard 少 3、多 2）

去掉 H3 结构对齐、风格短语、分镜图画幅、分镜图英文卫生四道——没有分镜图这个产物，这些门无从
查起；`h3-dialogue` 改名 `dialogue-verbatim`（纯文本子串匹配，不要求 `<d>` 标签）；`h3-lang`
改名 `prompt-lang`（逻辑不变）。新增两道盯参考图：`refimage-coverage`（段内出现的每个人物/
场景/道具都要能从 `outline`/`art` 解出名字、拼出 `../characters|art/images/<slug>-sheet.png`，
文件不存在点名缺哪张 + 期望路径——这是 AC3 的硬要求，缺图不能等到下单提交失败才发现）、
`refimage-labeled`（提示词开头的身份说明句数量必须与 `images` 数组长度一致）。

### 原创样例，不借用《渡口》

`CLAUDE.md` 明确要求每个 skill 的样例数据是它自己的、且必须先有故事再有分镜。`novel-creation`
的样例是《收书人》：深夜旧书店老板陈叙靠翻开每一本卖来的旧书扉页寻找失散多年的妹妹，这一夜青年
周亦卖掉的一本诗集里，她认出了妹妹的笔迹，不动声色买下书，独自认出书里夹着的字条。1 集 4 段
9 切，30 秒，全部质量门通过，样例目录里带 4 张真实占位设定图（非纯 mock），`refimage-coverage`
门与 `export`/`videos --dry-run` 有真实文件可读。

### 边界

不改 `novel-storyboard` 一个字，两个 skill 并列存在、互不依赖。不接入 `scripts/report.mjs` 的
五段合并报告——`novel-creation` 有自己的 `render --html`。不新增 `.gates.jsonl` + `stats` 门
失败累积——那套机制目前只在 `novel-storyboard` 上试验，`CLAUDE.md` 明确要求先验证过再决定要不
要推广。

## 出图调用收进代码 — novel-art / novel-characters

**novel-art 1.7.0 · novel-characters 1.16.0**

出图这一步以前是 `references/sheet.md` 里一段可以复制的 bash：`image create` 提交、
`node -e` 从管道里抠 task_id、`while` 循环 `sleep 3` 轮询、`curl` 落盘。模型每跑一次
就重新拼一遍，于是同一个接口有无数种拼错的方式——提示词里的引号把 `--input_data`
拆成两半、内层单引号跟外层 shell 打架、轮询在整段 JSON 里搜 `success` 撞上恒为
success 的 `message`、`while` 循环没有出口所以一张卡住的图能等到天荒地老。

**这些不是模型能力问题，是职责放错了层。** 判据很简单：换个模型跑会不会得到不同
结果？会，交给模型；不会，交给代码。提交一个任务、等它跑完、把文件存下来，换谁做
都该一模一样。

### 一条命令

```bash
node scripts/novel-art.mjs images <剧名>-art.json [--dry-run] [--only S01] [--force] [--cutout]
```

新增 `scripts/lib/lingying.mjs`，七件事从此由代码保证：

| 保证 | 以前的崩法 |
| --- | --- |
| 参数不经过 shell（`execFile` 收数组，`JSON.stringify` 拼 input_data） | 提示词里的引号换行把命令行拆散 |
| 只读 `data.status`，读不到就报错 | 搜整段 JSON 撞上恒为 success 的 `message`，第一次轮询就假命中 |
| 单张超时 300 秒，退避 3→15 秒 | `while` 循环固定 `sleep 3`，没有出口 |
| 产物即状态：非空文件跳过，先写 `.part` 再改名 | 半截文件被当成成品，永远跳过那张坏图 |
| 断点续传：task_id 落 `images/.tasks.json` | 超时就等于白花钱，重跑从头再来 |
| 先母后子：变体等母场景落盘再挂参考图 | 次序靠模型记着 |
| 提交之前失败：提示词空、变体指错、文件名撞车、凭证缺失 | 提交到第七张才发现 api_key 过期 |

失败不阻断批次，但**有失败就 exit 1**——重跑跳过已有产物、接着轮询超时的任务。
stdout 是一行 JSON 汇总，agent 直接拿去汇报，不用自己数。

### 文档改成提示词契约

`references/sheet.md` 里的 bash 片段全部删掉，只留版面与提示词——**文档里存在可
复制的 bash，模型就一定会去改写它**。调用那一节缩成一条命令加选项表。

### 自测 193 → 255 项

出图编排用注入的假 CLI 与假时钟跑完全部路径（提交、轮询、超时、续传、变体波次、
抠图、凭证前置检查），**不 spawn 进程、不发一个请求**。三次突变验证确认用例真的
会拦：把轮询改回搜整段 `success`、去掉波次分层、去掉超时判断，各自都会红。

### novel-characters 跟上，多一件事：风格参考

角色 skill 的已知短板是**同一批角色各自独立出图，画风会漂**。以前压住的办法写在
文档里——「拿第一张成图 `upload` 成 URL 喂给后面几个」——同样是让模型每次重拼一遍
的编排。现在是一个开关：

```bash
node scripts/novel-characters.mjs images cast.json --style-ref auto
```

命令先出第一个角色，等它落盘后 upload 成 URL，把这张图挂给其余角色当参考图，并在
提示词后追加那句 `Match the art style, line weight, shading and colour treatment…`。
用的是与变体场景同一套「先母后子」波次机制。**默认不开**——只要几张草图的场合不该
被「第一张定全片基调」绑住；指名某个角色当基准也行（`--style-ref 沈知微`）。

`--only` 认角色名，选中的角色如果挂着风格参考，基准角色会自动跟着出——否则参考图
挂不上。自测 376 → 435 项。

### novel-storyboard 这次不动

分镜图与生视频下单**先不碰**——先在真实项目里跑一段时间，确认这套封装扛得住再说。
自包含的代价是复制一份代码而不是 import：`novel-art` 与 `novel-characters` 各带一份
逐字相同的 `lib/lingying.mjs`。但复制一份**有 selftest 守着的代码**，比复制一份只有
模型临场发挥守着的 **bash 文档**安全得多。


## 六个 skill 适配 pi — 2026-08-26

**novel-setup 1.3.0 · novel-outline 1.4.0 · novel-characters 1.15.0 · novel-art 1.6.0 · novel-script 1.4.0 · novel-storyboard 1.7.0**

上一次「安装脚本支持 pi」只解决了软链，SKILL.md 一个字没动——所以 pi 里读到的
仍然是一份写给 Claude Code 和 codex 的工作流：工具名是大写的 `Read` / `Write` / `Glob`，
并发那几步指着 Task 和 subagent，`runtimes` 里根本没有 pi。**跑得起来不等于说得对**，
这次把平台相关的三样东西全部对上。

### pi 没有子代理，这是最要紧的一条

pi 的内核[有意不带](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)子代理、
待办和后台 bash。原文这么写：

> 「当前环境支持子代理就并发（Claude Code 的 Task、codex 的 subagent）」

在 pi 里读起来像是在让它去调一个不存在的东西，而另外四个 skill 更省事，直接写
「每集一份任务，能并发就并发」——没有子代理时该怎么办，一句话都没有。现在六处全部
改成同一句式，**串行那条路写在明面上**：

> 「每集一份任务，有子代理就并发、没有（例如 pi）就在当前会话串行做，产出一致。」

六个 SKILL.md 的开头都补了一行**运行环境**，说清三家的差别与串行的代价：慢，但归并、
质量门、报告一个字都不差。

### 「并发提交」不是并发子代理

出图与生视频那四处「一批角色可以并发」「一整段可以并发」「整集并发提交」说的是
**提交完不等待、拿一串 task_id 统一轮询**，跟有没有子代理毫无关系。同一个词两种意思，
在一个没有子代理的运行环境里最容易被读成「这步做不了，跳过」。四份 reference
各加一句挑明，pi 照样这么做。

### frontmatter 三处

| 字段 | 改法 |
| --- | --- |
| `allowed-tools` | YAML 数组改成 [Agent Skills 标准](https://agentskills.io/specification)的空格分隔字符串，**两套工具名都列**：pi 认小写（`read` / `write` / `edit` / `bash` / `grep` / `find` / `ls`），Claude Code 认大写。pi 里没有 `Glob`，对应的是 `find` |
| `metadata.runtimes` | 加 `pi`，排在最前面，并注明它没有子代理 |
| `version` | 六个各升一个 minor |

用 pi 自己的 `loadSkillsFromDir` 复验：六个 skill 全部发现，**零诊断告警**，
description 最长的 novel-storyboard 是 612 字符，离 1024 上限还有余量。

### 两份 README 与安装脚本

- 新增一节「三个 agent 的差别」：skill 命令 pi 是 `/skill:novel-outline`、另外两家是
  `/novel-outline`；子代理 pi 没有。**用中文直接说也一样能唤起，三家等价**
- pi 多一条安装路径：`pi install <本地目录>` 或 `pi install git:github.com/...`，
  仓库根的 `skills/` 就是 pi 的约定目录，**不需要 `package.json`**
- `install.sh` 的帮助、自动检测顺序、找不到时的提示，都把 pi 排到前面

## 产物落点固定到段目录 — 2026-08-26

**novel-setup 1.2.0 · novel-outline 1.3.0 · novel-characters 1.14.0 · novel-art 1.5.0 · novel-script 1.3.0 · novel-storyboard 1.6.0**

除 `novel-setup` 外，每个 skill 的产物**只有一个去处**：自己那一格段目录。以前 SKILL.md
只写「输出目录：用户指定就用，没指定用原书同级目录」，五份产物平铺在同一层是默认结局；
工作目录约定虽然写在仓库 README 里，却没有任何一个 skill 读得到它——skill 要能整个拷走
单独跑，约定不进 SKILL.md 就等于不存在。

| skill | 段目录 | 装什么 |
| --- | --- | --- |
| **novel-outline** | `outline/` | `<书名>-outline.json` / `.md` / `outline-report.html` |
| **novel-characters** | `characters/` | `<书名>-cast.json` / `.md` / `report.html` / `images/` |
| **novel-art** | `art/` | `<剧名>-art.json` / `.md` / `art-report.html` / `images/` |
| **novel-script** | `script/` | `<剧名>-script.json` / `.md` / `script-report.html` |
| **novel-storyboard** | `storyboard/` | `<剧名>-storyboard.json` / `.md` / `storyboard-report.html` / `manifest.json` / `.gates.jsonl` / `E01-0x/` |

工作目录根仍然只住 `production.json`——下游是向上找它的。

### 中间脚手架进 `.work/`

`novel-outline` 的分卷摘要与分集片段、`novel-characters` 的分块 / roster / 角色卡，
以前都散在一个含义不清的 `<workdir>` 里，跑完没人知道哪些能删。现在统一写进
`<段目录>/.work/`，跑完整个删掉不影响任何交付物。

`novel-outline` 的骨架也不再先落一份 `<workdir>/outline.json` 再搬家——从 Step 3 起
就写在 `<段目录>/<书名>-outline.json`，后面几步在同一份文件上加东西。

### 落点由脚本核对，是提示不是门

五个脚本各加十几行 `stageDirNote()`（**有意重复，不 import 兄弟 skill 的代码**）：
`validate` 找到 `production.json` 就顺带比一下产物在不在自己那一格，不在就点名该去哪。

```
⚠️ 产物落在 /w，按工作目录约定该住在 /w/art——每个 skill 的产物归自己的段目录，
   放错了合并报告的 --from 自动发现找不到它
```

为什么是提示不是门：契约里那条界线是**改了要不要重出图**。落点写错一个 `mv` 就好，
不该按整批重出图的规格设门。但也不能不说——`scripts/report.mjs --from` 就是按段目录名
找那五份 JSON 的，平铺在根目录它一份也找不到，而且不报错。

没有 `production.json` 就无从判断工作目录根在哪，那时明说跳过，不猜。三个原本就
播报生产参数的 skill 把这句折进原来那行，`novel-outline` / `novel-script` 各加一行。

### 顺带修掉的

- `novel-storyboard` 的 SKILL.md 写着「`render` 自动去 `images/<镜号>-frame.png` 找首帧」——
  脚本从来找的是 `<段号>/f<切序>.png`。照着那句放图，报告里一张也嵌不上，还不报错
- `novel-storyboard` 的 SKILL.md 通篇没给过 `export` 的命令行，只说它会生成 `manifest.json`。
  补上，并写明 `--out .`：投产包与报告 HTML 必须同级
- `README.en.md` 的「working-directory convention」链接指向一个没有工作目录内容的章节。
  补一节 Working-directory layout，与中文 README 对齐

自测：261 / 376 / 193 / 166 / 304 项，各加 7 项落点断言。

## 安装脚本支持 pi — 2026-08-25

`scripts/install.sh` 增加 `--pi`，自动检测里也加上 `~/.pi/agent`——本机安装了 pi 就把六个 skill
软链到 `~/.pi/agent/skills/`。两份 README 的安装章节与手工软链示例同步。

pi（`@earendil-works/pi-coding-agent`）遵循 [Agent Skills 标准](https://agentskills.io/specification)，
SKILL.md 原样可读，不用改任何一个 skill；它的目录扫描对软链显式做 `statSync` 解析，所以和
Claude Code、codex 一样走软链，`git pull` 之后立刻生效。用 pi 自己的 `loadSkillsFromDir` 验证过：
六个 skill 全部发现，零诊断告警。

顺带修掉自动检测里的一处 `set -e` 隐患：三行 `[ -d ... ] && targets+=(...)` 中最后一行失配时，
整个脚本会静默退出，「没找到 ~/.claude、~/.codex 或 ~/.pi」那句提示永远打不出来。

## 出图与生视频全面改走 lingying — 2026-08-25

**novel-setup 1.1.0 · novel-characters 1.13.0 · novel-art 1.4.0 · novel-storyboard 1.5.0**

出图从 codex 内置 `$imagegen` 换成 **lingying（灵影网关）CLI**；生视频从「只出提示词包、
下单交给人」变成**可选的最后一步**——`lingying video create` 直接下单，产出到每段一个 mp4。

### 为什么换

codex 那条路的三个约束一次性都没了：

| codex `$imagegen` | lingying |
| --- | --- |
| 只有 `gpt-image-2` 一个模型 | `nanobanana2` / `image-2` 两个生图模型，`MiniMax H3` 与 seedance 全系五个视频模型 |
| 出图要折算像素，还要把 `Render at 2048x1152 (16:9).` 塞进提示词末尾 | `resolution` / `aspect_ratio` 是 `input_schema` 里的**枚举字段**，原样填 `--input_data`，**提示词里一个像素都不写** |
| 参考图走 `-i`，一次一张绝不批量（PNG 字节会撑爆 rollout） | 参考图 `upload` 换 URL（按内容去重，整集复用），任务异步，**整段整集可以并发提交再统一轮询** |
| 反向提示词只能塞进正向提示词 | `negative_prompt` 是一等字段 |
| 透明底要 chroma-key + 本地 Python 脚本 | 白底成图之上再走一次 `birefnet` 抠图任务（免费） |
| **视频只能出提示词包，下单是人的事** | `video create` 直接下单，H3 就在网关上 |

代价是**出图不再是零 API key**：要 `~/.config/lingying/config.json` 里的 `api_key`，
挂参考图还要 `assethub_admin_token`。写文本的部分照旧用当前会话额度。

### novel-setup：能力表从「有意留空」变成「有据可查」

视频模型能力表以前是**故意空着**的，理由写在代码注释里：「各家 `resolution` 口径不同、
版本之间还会变，凭记忆编一张比不查更坏」。改走 lingying 之后依据有了——`lingying model get <UUID>`
本机就能把 `input_schema` 打出来。所以两张表都填上了，但**出处不许省**：每条都带
`source`（取数命令）与 `modelId`（UUID），过期了重跑一次就能对账，自测里有断言盯着这两个字段。

```bash
node scripts/novel-setup.mjs caps
```

```
生图：
  nanobanana2    档位 1K / 2K / 4K　比例 1:1 / 2:3 / 3:2 / 9:16 / 16:9
  image-2        档位 1K / 2K / 4K　比例 1:1 / 3:2 / 2:3 / 4:3 / 3:4 / 16:9 / 9:16
                 ↳ 4K 下只收 16:9 / 9:16
生视频：
  MiniMax H3 · managed  档位 768p / 2K　比例 16:9 / 21:9 / 4:3 / 1:1 / 3:4 / 9:16 / adaptive
                        ↳ duration 5~15 秒整数
```

**多出来的第 7 道门 `model-caps`**：档位与比例都是枚举值，能在定参数时查死。它拦得住的是
这类事——想拍 `4:3` 就不能选 `nanobanana2`（它不收）；`image-2` 出 `4K` 时只剩 `16:9` / `9:16`
两个比例（8.29MP 像素上限）；`MiniMax H3` 的 `managed` 变体档位是 `768p` / `2K`，
**不是随手会写的 `720p` / `1080p`**。以前这些都要等到提交那一刻被网关拒绝才知道，
那时整集分镜图已经出完了。

**第 6 道门 `video-model` 也从「只查非空」升级成查枚举**，并新增 `video.variant` 字段——
`MiniMax H3` 的 `resolution` 与 `aspect_ratio` 是**条件枚举**，由 `metadata.h3_variant` 决定。
少填这个字段整集提交不出去。

**删掉的东西**：`sizes` 命令、`pixelHint` / `renderInstruction` / `legalSizes` /
`nearestLegalSize` / `sizeProblems` / `RESOLUTION_TIERS` 整套像素折算机制。lingying 收的就是
档位本身，这一层不存在了，也就没有了「拼法漂了」这类问题。
新增 `caps`（看模型收什么）与 `duration`（把段秒数折成模型能收的整数秒）两个命令。

### novel-storyboard：多了下单这一步

`export` 的投产包本来就是下单的全部材料，现在多了一份 `references/video-order.md` 把这一步写死：

- 参数全在 `manifest.json` 顶层的 `video` 里（`model` / `aspectRatio` / `resolution` / `variant`）
- `prompt` 取 `prompt.md` 分隔线以下的原文，一个字不改；`images` 按 Picture 序挂 `f1..fN.png`
- **`duration` 要折算**：模型收的是区间内的整数秒（H3 是 5~15），段秒数不一定是——
  `novel-setup duration <秒> --model <名>` 向上取整、夹进区间，动过就说清
- 按秒计费，**提交前把整集总秒数与预估花费报给用户**；同一段连着失败两次就停下来问，不烧钱重试

边界也跟着改了：以前写「不做视频生成与剪辑合成」，现在是「**不做剪辑合成**；视频生成是可选的
最后一步，产出到每段一个 mp4 为止」。拼接、转场、配乐、贴 TTS 音频仍然不在这里。

### 一处轮询陷阱 ⚠️

`task get --json` 的响应里 `"message": "success"` **恒为 success**（那是 HTTP 层的 message）。
在整段 JSON 里搜 `success` 会在第一次轮询就假命中，拿到一个还没有 `result.url` 的任务。
**必须读 `data.status`**（`pending` / `running` / `success` / `failed`），而且未完成时
退出码仍然是 0——只看退出码判断不了结束。三份出图契约和下单契约里都把这条标了 ⚠️。

### 实测

- 文生图 `nanobanana2` 1K 16:9：22 秒出图，产物 `.png`
- 图生图（挂参考图 + `negative_prompt`）：28 秒，`feature_type` 回 `image_to_image`；
  同一张图第二次 `upload` 命中内容去重，返回同一个 URL
- `MiniMax H3 · managed` 5 秒任务（两张参考图 + 完整 H3 对齐提示词 + `metadata.h3_variant`）：
  **196 秒出片**，`feature_type` 回 `image_to_video`，产物 `.mp4` 1344×768（`768p` 档的 16:9）、
  5.17 秒、带音轨——视频比出图慢一个量级，所以轮询间隔写的是 10 秒不是 3 秒

### 改到的文件

- `skills/novel-setup/`：`scripts/novel-setup.mjs`（能力层重写）、`scripts/selftest.mjs`（195 项）、
  `references/schema.md`、`references/contract.md`、`SKILL.md`、两份 README、两份 examples
- `skills/novel-characters/references/sheet.md`、`skills/novel-art/references/sheet.md`、
  `skills/novel-storyboard/references/frame.md`：三份出图契约全部重写
- `skills/novel-storyboard/references/video-order.md`：**新增**，下单生视频的调用契约
- 三个 skill 的 `SKILL.md` / README（中英）、根 README（中英）的前置条件表
- 三个 skill 自测里的 `production.json` 夹具统一换成 `nanobanana2` + `MiniMax H3 · managed`

全部自测通过：195 / 368 / 185 / 254 / 159 / 297 + 报告组装器 92。

## novel-setup 1.0.0 · 四个下游跟着改 — 2026-08-25

**新增 `skills/novel-setup`：技术参数一处定死，下游出图前照着做**

`/novel-setup` 产出工作目录根的一份 `production.json`，收八个技术参数外加三个
必须跨 skill 一致的口径：

```json
{
  "style": "realistic", "lang": "zh", "promptLang": "en",
  "image": {
    "model": "gpt-image-2",
    "asset": { "resolution": "2K", "aspectRatio": "16:9" },
    "frame": { "resolution": "2K", "aspectRatio": "9:16" }
  },
  "video": { "model": "MiniMax-Hailuo", "aspectRatio": "9:16", "resolution": "720p" }
}
```

**`resolution` 是档位不是像素。**折成多少像素由使用方的转换 CLI 决定——各家生图与
生视频接口的口径不一样，skill 层面只统一字段名与写法。

**为什么要有这个东西**：技术参数散在每一次出图调用里就必然会漂。今天出的角色
设定图是 16:9，明天出的分镜图还是 16:9，可片子要拍竖屏——这件事要等到把分镜图
喂给视频模型、被裁掉两边才发现，那时一集三四十格已经出完了。

### 两个比例是两件事 ⚠️

设计上最关键的一处切分，也是这个 skill 存在的主要理由：

- **资产图**（角色、场景、道具的设定图）是给参考图与人眼看的设定表。三区版面与
  L 形版面都靠横向铺开，竖过来三视图会被压扁。所以资产图默认 `16:9`，
  **成片拍竖屏也不改**
- **分镜图**是喂给视频模型的关键帧，**它就是成片的一格**。比例和视频
  `aspect_ratio` 差一点，参考图就被裁切或拉伸，一整批白出

两道门分别管这两件事，不会互相牵连。

### 档位、参考像素，与转换 CLI 的分工

档位是真源，像素由转换 CLI 算——但 skill 内置一张参考表，回答「这个档位配这个
比例，在这个模型上该取哪个像素」。答案出现在 `show` 的参数表、`checkup` 的门详情、
`resolve` 的 `pixelHint` 字段里，**是参考不是规定**。

它值钱的地方在于**会暴露对不齐的档位**：

```bash
node scripts/novel-setup.mjs sizes 16:9 --tier 1080p
# → 档位 1080p 的参考像素：1792x1008 —— 长边对不齐 1920，这是最近的合法尺寸
```

`gpt-image-2` 要求两边都是 16 的倍数，而 `1080 ÷ 16 = 67.5`——所以竖屏最顺手的
`1080x1920` 它根本出不来。四条约束（长边 ≤ 3840、两边都是 16 的倍数、长短边比
≤ 3:1、总像素 655,360–8,294,400）抄自 codex 自带 `imagegen` skill 的
`references/image-api.md`，一个字没改。

**分辨率档位只查非空，不拦人**：凭一张猜来的换算表去拦，拦错的比拦对的多。档位或
模型不在表里就明说给不出参考像素，不装算过。**视频模型能力表有意留空**——各家
`resolution` 口径不同且版本之间会变，凭记忆编一张比不查更坏。

**成片画幅没有默认值**，`init` 不给 `--aspect` 直接报错。竖屏和横屏是两条不同的
片子，猜错了后果是整批产物重出——这是唯一一个宁可让用户多打一个参数也不能默认的
参数。

### 下游怎么接：界线是「改了要不要重出图」

**下游不 import 本 skill 的代码**（每个 skill 都要能整个拷走单独跑），各自实现
十几行的向上查找：从自己的输出目录向上最多 5 层找 `production.json`。找不到
**明说跳过**，照旧用内置默认值——装作查过比没查更坏。

找到了就必须遵循，分两类：

- **会导致重出图的设门，不可绕过**——novel-storyboard 加了 `production-style`
  与 `frame-aspect`（17 → **19 道门**），novel-art 加了 `production-style` 与
  `sheet-aspect`（11 → **13 道门**），novel-characters 加了同样两条确定性检查。
  这三个 skill 的出图步骤也改成从 `image.model` + 对应的 `resolution` 档位取参数，
  提示词末尾固定加一句 `renderInstruction`（`resolve` 拼好，形如
  `Render at 1152x2048 (9:16).`）
- **只影响阅读的走继承，不设门**——报告界面语言的优先级变成
  `--lang` > 产物 JSON 顶层 > `production.json` > 中文。五个 skill 都吃这条，
  改一次显示语言不该被拦下来，它不产生任何浪费

`--no-production` 是给老项目临时绕过用的，用了会明说。

### export 带上视频参数

`novel-storyboard export` 把 `video.model` / `aspectRatio` / `resolution` 写进两处：
`manifest.json` 的顶层 `video` 字段，以及每段 `prompt.md` 的头部。下单给视频模型
时参数就在投产包里，不用回头翻配置。

**manifest.json 由裸数组变成对象**（`{ source, video, segments }`）——顶层要放
视频参数，段清单挪进 `segments`。每次 `export` 都重新生成，不影响已有产物。

### 详情收口

画幅这类「错了就是整批错」的门，34 个分镜逐条列会把详情刷成一堵墙。新门统一
走 `brief()`：前 6 条足够定位，后面只报个数（`……等 34 处`）。修的时候本来就是
整批一起改。

### 自测

novel-setup 146 项（6 道门每道都有击穿用例，含合法尺寸枚举、档位换算与对齐判定）；
novel-storyboard 254 → 296；novel-art 158 → 185；novel-characters 355 → 368；
novel-outline 249 → 254；novel-script 154 → 159。全部不调模型、不花额度。


## 五段报告合成一张单页 — 2026-08-19

**新增 `scripts/report.mjs`：左侧导航，有哪几段就出哪几个面板**

```bash
node scripts/report.mjs --from <demo目录> --out report.html
```

**它是组装器，不是第六个 skill。** 不 import 任何 skill 的代码，而是调各自的
`render --html` 拿产物再拼装。这样六个 skill 一行不改、各自仍然独立可跑、可以
单独拷走；各 skill 的加载逻辑（图存在才挂、ctx 组装、语言优先级）也只有一份，
不在组装器里重写一遍。

合并要解决三件事，**都在组装器里做，不侵入 skill**：

- **样式串味**。量下来五份报告共用 57 个类名，其中 13 个同名不同定义
  （`.copy` `.kpis` `.badge` `.chip`……）。做法是给每份样式的每条选择器加
  作用域前缀。顺带确认了一件事：五份报告的 CSS 里**没有任何 `#id` 选择器**，
  所以 id 冲突只影响脚本查询与页内锚点，不影响样式
- **脚本串味**。各报告的脚本都是 `document.querySelector('.expo')` 这种全局
  查询，合成一页后只会命中第一个——**五个导出按钮会全废**。做法是套一层
  Proxy 把 `document` 换掉：查询限制在自己的面板内，`getElementById` 顺手补
  id 前缀，所以脚本里的 id 字符串一个都不用改
- **图片路径**。各报告的图相对自己那份 json 的目录，合成后按输出文件的位置重算

**踩到又钉住的三个坑**（自测里各有一条断言）：

1. `<script type="application/json">` 是各报告内嵌源 JSON 给导出按钮读的**数据**，
   当成脚本抠出来执行，浏览器直接甩 `Unexpected token ':'`，五个面板一起废
2. 规则之间的 CSS 注释会粘进下一条选择器，而注释里的逗号会把选择器切断——
   实测让 18 条规则漏掉了作用域
3. 角色报告的缩略图走内联 `background-image:url(…)`，只查 `src` 属性会漏掉。
   表现是大图正常、缩略图 404，很难排查

**外壳自己的类名全部带 `rp-` 前缀**，理由同上：报告正文里 `.pane` `.on` `.main`
这些都很常见，撞上会让面板的显示与隐藏错乱——实测撞过一次。

默认一次显示一个面板（五份加起来将近六十万字符）。左下角「平铺全部」把所有面板
同时展开，Cmd+F 恢复全局——各报告「全部平铺可 Cmd+F」的设计主张不能因为分栏丢掉。
数字键 1–5 切面板，`#pane-script` 这样的深链能直接分享到某一屏。中英双语。

自测 92 项，纯字符串进出，不起浏览器、不跑各 skill 的 render。

## novel-outline 1.2.0 · novel-art 1.2.0 — 2026-08-19

**大纲补上道具表，novel-art 的 seed 跟着吃**

上一版给 `novel-characters` 补 `seed` 时顺带查出来的：`outline.json` 只有
scenes / characters / episodes 三块，道具从来不在里面——所以 `novel-art` 的
道具一直靠模型从原文自己提。**哪几件物件承载剧情，本来就是改编阶段该拍板的
事**，跟「哪些场景是主场景」同一个性质，不该留到美术层。

**novel-outline 新增可选的 `props`**（`id` / `name` / `function` / `beatIds`）
与 `episodes[].propIds`：

- **`function` 是这一层唯一要拍板的东西**：这件物件在戏里承载什么。填不出来
  说明它不是叙事道具，是场景陈设，那归 `novel-art` 的场景锚点管
- `beatIds` 记它托起哪几个爽点。`outline-pass.md` 把「收道具」排在「排爽点」
  之后，顺序是有理由的——**爽点没定就分不清哪件是道具、哪件只是陈设**
- 判据写死在 `outline-pass.md`：**它坏了、丢了、被换掉，剧情会不会塌**

**质量门 13 → 14 道**：新增「叙事道具 ≤ 8 件」，`refs` 门扩成也查道具
（propIds 指向存在、没有零集使用的道具、beatIds 指向真实爽点）。

**存量大纲一份都不会红。** `props` 是可选字段，没有它两道门都明说跳过而不是
判失败，门数仍然是 14——跳过不等于少一道门。自测有一整组断言钉住这件事。

**novel-art 的 `seedFromOutline` 现在搬道具**：大纲的 `function` 落成这边的
`summary`（两边都指「它在戏里干什么」，不是材质描述），`beatIds` 翻译成爽点
类型，出现集从 `propIds` 反查。留空的仍是美术层的活：尺度、锚点、状态变体、
白底提示词。大纲没有 `props` 就返回空数组，跟以前完全一样。

报告两处跟上：调度矩阵多一条道具分带（角色 / 场景 / 道具三段由深到浅，
调色板补了第三档铁锈红），资产量折算多一行道具。旧大纲整段不出，不留空标题。

自测 outline 220 → 249、art 146 → 158。

## novel-characters 1.11.0 — 2026-08-19

**大纲成了角色的真上游：`seed <outline.json>`**

上一版把管线顺序按流程图对齐了，但只改了文档——`novel-characters` 当时仍然
不认 `outline.json`，「大纲 → 角色」那根箭头背后没有数据。这一版补上，收敛层
三个 skill 的取数口径从此一致：**没有指定数据就从大纲来，指定了就用指定的**。

```bash
node scripts/novel-characters.mjs seed outline.json > seed.json
```

形状照抄 `novel-art` 与 `novel-script` 的 `seedFromOutline`：**搬事实、留设计、
附一条 seedNote 带上下文**。

- 搬过来的是大纲已经拍板的：角色码（`id` 原样保留，下游 script / storyboard
  用它引用角色）、名字、分档、人物线（`arc` 落进 `persona.arc`）
- 留空的是这一层才该做的：`aliases`（要读原文才知道，大纲里没有）、`oneLiner`、
  `persona` 其余各项、`image`、`voice`
- `role` 与 `from` 进 `seedNote`——定位（女主 / 反派）与「由原著的谁合并而来」，
  扫原文时知道该收哪几条线的戏

**分档映射与两条口径**：`lead` → protagonist、`support` → supporting、
`functional` → minor。大纲定的分档不在这一层推翻，觉得不对回去改大纲；
但主角组内部可以细分——`lead` 是「男女主 + 主反派」一整组，对应 protagonist
与 major 两档，seed 一律给 protagonist，照 `seedNote` 的定位把主角之外的
改成 major。

**没设任何门。** 有 `outline.json` 就用，没有照常从原文拆角色表，
`seed` 是可选的第一步不是前置条件。seed 出来的是骨架不是成品，直接跑
`validate` 会报一堆字段缺失——这跟 art / script 的 seed 行为一致，自测里
有一条断言专门钉住它。

顺带说明大纲里为什么没有道具：`outline.json` 只有 scenes / characters /
episodes 三块，道具从来不在里面。所以 `novel-art` 的道具仍然由模型从原文
提取，这是大纲本身的边界，不是缺口。

自测 330 → 355 项。

## 管线顺序对齐流程图 — 2026-08-18

**大纲挪到角色前面，文档跟流程图口径统一**

根 README 的流程图一直画的是 `小说原文 → 改编大纲 → 收敛层（剧本 / 场景 / 角色，
三者同步迭代，无先后）→ 分镜 → 批量生成`，README 正文那句话也是照这个写的。
**跟它打架的是它下面那张表**——表里 `novel-characters` 排在 `novel-outline`
前面，一路复制到各 skill 的对照表、demo 目录约定、截图排列，共 18 个文件。

这次以流程图为准，把文档拉回来。**流程图一个像素没动**，`assets/*.svg` 与
`*.webp` 全部原样。

- 根 README 中英两份：技能表行序、五张报告截图的排列、demo 工作目录树
- 各 skill 的「谁 / 什么 / 哪里」对照表 9 处（art / script / storyboard 的
  SKILL.md 与 README 中英）——大纲统一提到第一行
- `novel-outline` 三处方向写反的文案掉过来：人物表从原文拆，`characters` 块
  是**下游 novel-characters 的角色清单**；用户手上已经有 `cast.json` 降级成
  例外分支，不再是主路径
- `novel-characters` 补上上游说明（SKILL.md Step 1 + README 中英新增「上游」
  一节）：有 `outline.json` 就照它的角色清单做，`tier` → `importance`、
  `arc` 当画像依据；**大纲定的分档不要在这一层推翻**，觉得不对回去改大纲

**没有动任何 `.mjs`。** 代码里本来就不存在 characters → outline 这条依赖——
两个 skill 都不吃上游文件，旧顺序只活在文档里。同理也没给 `novel-characters`
加 `seed <outline.json>`：它照样能直接吃一本小说独立跑，两份 README 都写明了。

自测六个 skill 全绿，无变化。

## novel-characters 1.10.0 — 2026-08-18

**音色提示词：删掉会让人复制错的那一条，形状改成紧凑参数串**

生产反馈：用户拿 skill 生成的音色描述去跑 TTS，效果很差。查下来是两个问题。

**一、报告让人复制了错的那一条。** 音色那一组本来渲染两条——`promptLocal`
（中文对照）排在前、标签就叫「音色提示词」，`prompt`（英文，真正喂引擎的）
排在后、挂着「EN」后缀。中文用户扫一眼点了第一个，把中文散文喂进了 TTS。

- **删掉 `voice.promptLocal`**。它本来就冗余——`timbre` / `pitch` / `pace` /
  `accent` / `emotion` / `referenceHint` 六项都是必填的本地语言字段，人审看
  那六项比看一段散文更快。报告里音色只剩一条提示词，**想复制错都做不到**
- 出图那一组同样把主次摆正：机器字段排前面，两个标签都写明用途
  （「出图提示词 · 喂出图模型用这条」）
- **消除歧义优于解释歧义**——这次没有选择「把标签写清楚提醒用户别点错」

**二、提示词的形状不对。** 模型会写出文学比喻（「字与字之间像在秤上掂银子」）、
表演指导（「威胁时从不提高音量」）、条件分支（「公堂场合能切换成官话」）、
引号台词（「杀意藏在『规矩就是规矩』这类客套话里」）。音色设计是一个**静态的
声音身份**，这四类东西引擎都用不上，只会稀释真正的参数。

- **`voice.prompt` 上限 400 字符**。拿同一个角色实测对比 500 字英文散文与
  230 字英文参数串，**后者明显更好**。阈值是量出来的：改写后的样例 218–245，
  散文版 490–514
- **不许出现引号包起来的台词**——有些引擎会把引号里的字当成要朗读的内容
- 另外三类（文学比喻 / 表演指导 / 条件分支）**只写进 `profile-pass.md`，不设门**：
  关键词扫描会误伤正常描述（「说话时」「低音区」都含「时」「区」），
  **误拦的门比没有门更糟**
- `profile-pass.md` 第 7 条补上固定的参数顺序模板与四类反例
- 自带样例四个角色的音色提示词全部改写成紧凑形态

**顺带写清楚了这条提示词是给哪种引擎的**——这是这次查出来最有价值的一条：
只有「文字直接设计音色」那类引擎吃它（Qwen3-TTS Voice Design / ElevenLabs /
MiniMax speech）。**CosyVoice 的 instruct 与 IndexTTS 都不吃**——它们的音色只
来自参考音频，自然语言通道只能改情绪。用克隆系引擎时这条提示词帮不上忙，
不是它写得不好，是那类引擎没有这个入口。

顺带修 `novel-script` 一条脆弱断言：它硬编了样例音色提示词的开头，样例一改
就挂。改成从 cast 夹具里取，测的是「按钮带的是 cast 原文」这个不变量本身。

自测 characters 327 → 330 项、script 153 → 154 项。

## novel-storyboard 1.3.0 — 2026-08-17

**门的失败会累积了**

以前每次 `validate` 跑完，那些 detail 就消失了——于是「模型最常违反哪条
规则」只能靠印象。这是从 SkillOpt「skill 文档是冻结模型的可训练状态」
那套思路里拿的一条，但**只拿了能拿的那一半**。

- `validate` 与 `checkup` 每次把门的结果追加到**当前目录**的 `.gates.jsonl`：
  一条 `run`（跑了几道门、挂了几道）+ 每条失败一行（门 id、标签、detail）
- 新增 `stats` 子命令，回答三个问题：**哪道门最常响**（那条规则模型最常
  无视——该改的是规则的措辞）、**哪道门从没响过**（可能是死门，也可能规则
  已被模型内化）、**失败详情长什么样**（反复出现却没有对应门的那类问题，
  只能靠人看这些自由文本发现）
- 刻意做成**纯函数 + CLI 负责 IO**：`gateLogEntries` / `summarizeGateLog`
  不碰文件系统，自测不落盘也能验
- **日志不能挡住主流程**：写不进去静默跳过；`--no-log` 可关；
  `.gates.jsonl` 进 `.gitignore`

**没拿 SkillOpt 的另一半，也说清楚为什么**：它最硬的纪律是「改动只有在
验证分提高时才被接受」，那需要一套评测集（三五份不同题材的上游样本 +
跑批打分）。没有评测集的自动改文档就是瞎改，而且改坏了不会立刻发现。
所以这一版只做**证据累积**，改不改、怎么改仍然是人的判断。

自测 237 → 254 项。

## novel-characters 1.9.0 — 2026-08-17

**同批角色的提示词不许雷同 · 修 Windows 上的换行假失败**

两个外部 issue，一并修掉。

**issue #9：角色提示词大同小异**（@rocke）——用户反馈同一部小说里
每个女性角色的出图提示词几乎一样。

`profile-pass.md` 第 8 条早就写着「同一批角色之间要能区分开，别把长相和
声线做成一个样」，但**这条规则没有门**。而这正是本仓库反复强调的那件事：
checklist 交给模型自觉是靠不住的。

- `validateCast` 逐对计算 `image.prompt` 与 `voice.prompt` 的词级雷同度
  （Jaccard），**超过 75% 报错并点名那一对与具体百分比**
- **阈值是量出来的，不是拍的**：自带样例四个角色两两最高 39%，而「只改
  年龄与衣服颜色」的雷同用例是 98%，中间余量极大
- **`image.sheet` 刻意不查**：三分区排版规范是大段固定文本，真实角色之间
  本来就有 63% 重合，设门必然误拦——**误拦的门比没有门更糟**
- 词数少于 8 的提示词不参与判定，避免空字段之间互相假命中
- `profile-pass.md` 第 8 条写明这条现在有门，并点出**最容易踩的形态不是
  照抄而是偷懒**：个体描述写得短，剩下全是真实感样板与固定的构图光照尾巴，
  两个年龄性别接近的角色一这么写就是同一个人。区分度要落在个体描述那一段

**issue #8：Windows 上自测假失败**（@ezlove13144-ship-it）——报告得非常
准确，连根因和修法都给对了。

- `chunkText` 内部把 `\r\n` 规范成 `\n` 再切块，而自测拿**原始**文件内容
  当比对基准。Windows 上 git 默认 `core.autocrlf` 把 `.txt` 检出成 CRLF，
  于是「块内容来自原文」「覆盖全文」两条假失败；macOS/Linux 是 LF，所以一直绿
- 自测读入时先规范一次换行。本地把样例转成 CRLF 复现了报告里的失败，
  修完 **LF 与 CRLF 下都是 316 项全过**
- 新增 `.gitattributes`（`* text=auto eol=lf`）从根上防住这一类问题

自测 310 → 316 项，新增 5 条击穿用例（完全相同 / 只改几个词 / 音色雷同 /
sheet 相同不报错 / 极短提示词不参与判定）。

## novel-characters 1.8.0 — 2026-08-16

**同剧角色画风必须一致**（外部贡献，PR #7，作者 @Aibrother258）

实际使用发现的问题：第二趟出卡时模型按各角色的服装与年龄自由发挥写
`image.style`，四个角色写出四套（藏青低饱和 / 冷灰 / 大地色系 / 赭红暖色），
基底词都是「半写实厚涂插画」，但配色与光线各写各的——同框时像四个画师画的。

`style-presets.md` 开头就写着「换风格是整套换，不是只换一句画风」，
意图一直很明确；缺的是兜底的确定性检查——`validateCast` 原有的检查
**全部是单角色维度**，管不到剧内统一。

- `validateCast` 新增跨角色画风一致性检查：归一化后多于一种值就报错，
  **并点名哪几个角色用了哪一套**。单角色不触发，仅空白差异不误报
- 自带样例四个角色的画风对齐到剧级统一基线（冷调低饱和民国配色、晨雾柔光），
  英文提示词与 `sheet` 结尾的调色板词、`image.tags` 的配色项同步统一
- 自测 307 → 310 项，三条：统一后通过 / 改掉一个角色必须报错 / 仅空白差异不误报

## 新 skill：shot-recipes（镜头语汇卡库） — 2026-08-16

shot-recipes 1.0.0 · novel-storyboard 1.2.0

仓库的镜头知识本来散在两处，中间空着一层：`novel-storyboard` 那边是
**枚举层**（5 个景别 + 20 个 H3 官方运镜词，原子词汇，模型自由组合），
`storyboard-pass.md` 那边是**手感层**（导演运镜手感九条，标题上就写着
不设门）。缺的是中间的**配方层**——命名的、带意图和提示词模板的、
**可以被机器复核**的镜头语汇。

**两族卡，71 张**，`kind` 字段区分，类目表、正文六节、门都各是一套：

| 族 | 回答什么问题 | 类目 |
| --- | --- | --- |
| **配方卡** 17 张 | 这场戏这一刀该怎么切 | 对话 / 情绪 / 揭示 / 进场 / 反应 / 转场 / 强调 / 产品展示 / 口播 |
| **技法卡** 54 张 | 这个手段是什么、**什么时候用、什么时候别用** | 运镜 / 机位角度 / 景别 / 构图 / 焦段与景深 / 光线 / 特殊技巧 / 设备与复合 |

不合成一族的理由：合了之后类目就同时在说两件事（功能与手段），
画廊那张类目 × 能量矩阵立刻失去意义。两族各画各的图。

- **完整性是门，不是口号**：每个技法类目定一个域（运镜域直接就是 20 个
  H3 官方运镜词），每张技法卡用 `covers` 认领它讲掉的项，**域里少一项
  `lint` 就点名缺哪几个**（八个域共 61 项，全部铺满）。「这个库覆盖全了运镜」从此是查出来的，
  不是谁说的。画廊新增一张覆盖表，域逐项摊开，**灰掉画斜纹的就是
  还没有人讲的那一项**
- **技法卡的「适用场景」是独立一节，而且必须写「什么时候别用」**——
  这一段的标记 `lint` 逐字查，缺了直接红。理由很直接：只写什么时候用，
  读卡的人一定会滥用它。这一节排在提示词前面也是同一个理由——
  手段本身没有「什么时候用」就是废知识
- **运镜不是一个官方词一张卡**：`Truck Left/Right`、`Tilt Up/Down`、
  `Pedestal Up/Down`、`Zoom In/Out`、`Roll CW/CCW` 成对的词合成一张，
  因为重点是「横移和横摇有什么区别」而不是左右。13 张卡覆盖满 20 个词
- **技法卡不写成摄影教科书**：「低角度让人显得高大」是常识，写它没价值。
  卡片写的是这个手段**在 AI 生成里具体会崩在哪**、**提示词怎么写才钉得住**
- **配方卡 17 张 · 9 个类目**：对话、情绪、揭示、进场、反应、转场、
  强调、产品展示、口播。**短剧之外也能用**（产品宣传、口播、Vlog），
  题材维 `applies_to` 与类目正交，可筛可见
- **正文六节固定，两族各一套**：配方卡是 意图 / 提示词骨架 / 参数表 /
  **参考图约束**（生成式独有的一节）/ 已知坑 / 示例；技法卡是
  这是什么 / **适用场景** / 提示词怎么写 / 参数表 / 已知坑 / 示例。
  参数表四列（旋钮 / 默认 / 区间 / **调节手感**），旋钮全是生成式的——
  秒数、格数、幅度、占比、虚化强度、光比，**不写帧数、缓动曲线、
  光圈 f 值、ISO、灯位瓦数**，那些是程序化渲染与实拍的参数
- **必备短语是全库唯一被机器强制的东西**，六条硬约束逐条设门：≤3 条、
  全小写、含空格或连字符且长度 ≥6、**不许撞 20 个运镜词与 5 个景别短语**
  （那两类各有一道门在管，而且查的位置不同，同一个词两处判定极易一边过
  一边不过）、**必须原样单行落在本卡的提示词骨架里**（骨架是给人抄的，
  抄下来必须能直接过 `check`；换行截断肉眼看得见、机器判不出来，踩过）、
  **必须配一条中文释义**——短语本身永远不翻译（它要被原样复制进提示词，
  改一个字母门就不认了），但一整张索引表全是英文中文读者没法用，所以
  释义单独一列，一一对应，同一条短语在不同卡上的译法必须逐字相同
- **`check` 吃任意分镜 JSON**：深度遍历，收集同时带 `recipe` 与 `frame`
  的对象，JSON 路径当定位符——不绑定某个 skill。遇到中文提示词跳过并
  计数，不静默也不误报一片
- **画廊报告**（与另外五份同一套视觉语言）：类目 × 能量矩阵（配方卡的
  招牌图，**空格子画斜纹就是语汇缺口**）→ 配方卡墙 → **技法覆盖表**
  （技法卡的招牌图，域逐项摊开，右侧 `20 / 20` 的分数缺一项就变红）→
  技法卡墙 → 必备短语索引（撞车一眼可见），给了 `--check` 还会列出
  **从没被使用的卡**，不装繁荣。KPI 的类目那一格**不给分母**——两族
  加起来 16 个类目，拿配方卡的 9 当分母会读成「16 / 9」这句胡话（踩过）
- **10 张卡配了示例帧**（13 张），全部出自本 skill 自己的样片
  `examples/vocab-reel.json`——不借用任何别的 skill 的样例。**样片的故事
  尚未定稿**，画面文案与示例帧还会随故事重做；机器那一侧已经稳定
  （36 格引用、0 违规）
- 自测 244 项，**lint 每条规则都有击穿用例**（20 类检查）；零依赖、零 API key

卡片的**格式**学自开源项目 video-shotcraft（Remotion 程序化渲染方向），
**内容全部是本仓库自己的生成式实践**。方法论内化在本 skill 自带的
references 里，**不依赖任何外部 skill**。

**novel-storyboard 可选挂载这套卡库（16 → 17 道质量门）**：

- cut 上新增可选字段 `recipe`（卡片 id），`validate` / `checkup` / `render`
  新增 `--shots <卡片目录>`。**多格配方靠连续同 id 的分镜表达**，不引入新结构
- 新门 `shot-recipe` 查三条，detail 全部点名到 `段号#切序`：配方 id 在库里、
  卡片的必备短语进了该切的分镜图提示词、多格配方的连排长度够格数。
  **跳过条件是「没给 `--shots`」而不是「没有 cut 带 recipe」**——给了目录但
  全篇没引用也算通过，detail 写「本批分镜没有引用配方」，不静默
- **建议景别与运镜不设门**，只在报告的「配方」列上标 `≠` 并把建议值写进
  `title`。配方是语汇不是法条；可选挂载的东西一旦变严就没人挂——
  **误拦的门比没有门更糟，门的信用比数量重要**
- **两个 skill 各自独立**：storyboard 侧自己写了一份 25 行受限 frontmatter
  解析器只取机器字段，**不 import 卡库脚本**（先例：`expandScript`）。
  同一份合成分镜喂给两边，判定与措辞逐字一致，只有定位符不同
- **`exportPack` 一行没改**：配方是创作期语汇，H3 投产包里没有它的位置
- 顺带放宽了 `checkup` 与报告门面板的 detail 显示条件（原来只在门没过时显示），
  否则「本批分镜没有引用配方」就是静默的。副作用：`prompt-no-names` 在不给
  outline/cast 时也会把跳过说明打在门这一行上，与已有的 stderr 提示轻微重复
- 《渡口》夹具挂了两处真实引用（E01-06#1 手部代言、E01-09#1 插入重音）。
  挂之前先按现有画面文本反推能挂哪张卡，**没有为了挂卡去改画面**——
  这两处补进去的必备短语都是把画面里已经写着的东西再说一遍，与 H3
  提示词不冲突。自测 191 → 237 项

## 报告双语化 — 2026-08-15

novel-outline 1.1.0 · novel-art 1.1.0 · novel-script 1.2.0 · novel-storyboard 1.1.0

英文 README 引来的用户打开报告却是满屏中文——**五个 skill 的报告现在都内置
中英两套界面**（novel-characters 早就支持多语言，这次补齐其余四个）：

- 每个 skill 的界面文案表从单表改成 `I18N = { zh, en }` + `tOf(lang)`，
  渲染器里散落的硬编码中文（单位词、「第 N 集」「N 分 N 秒」、列表分隔符、
  连 HTML 内嵌的 CSS/JS 注释）全部收进表
- `render --lang zh|en`，优先级 `--lang` > JSON 顶层 `lang` 字段 > 中文；
  `<html lang>` 跟着走；非法语言直接报错不静默回落
- **质量门面板也翻译**：门标签按 id 映射英文，阈值由门自己算、原样填进去
  （`主场景 ≤ 5` → `Primary scenes ≤ 5`）。门逻辑与 CLI 诊断文案一行没动，
  失败详情与数据内容（人名、梗概、台词、提示词）保持原文
- 分镜的 `--lang`（界面）与 `promptLang`（H3 提示词语言）是两个独立开关
- 两份 README 都写明默认中文与 `--lang en` 用法；英文 README 给出完整命令

自测：outline 200 → 220、art 131 → 146、script 137 → 153、storyboard 165 → 185。

## novel-script 1.1.1 · novel-storyboard 1.0.1 — 2026-08-14

**冷开场要在运动中给**——报告人审时发现的问题：静物特写开场
（旧皮箱抱在怀里，指节掐白）是死画面，第一秒没有运动，竖屏观众
划走的就是这一秒。按三层约束落地：

- **写作规则**（判不死的进规则）：script-pass.md 硬规则 6 扩写——
  钩子的具象必须带主体运动（✗ 静物特写一闪 ✓ 抱着旧皮箱在雾里跑），
  静态细节特写留给第二落点兑现；常见病表加「开场死画面」。
  storyboard-pass.md 进场三件套改为第一切给运动主体
- **样例即规范**（最强的软约束）：《渡口》四处开场动起来——E01 改成
  雾中抱箱奔跑（分镜第 1 切同步改跟拍、主分镜图重生成、声景加跑步声），
  E02 船身晃手攥紧、E03 汽笛里猛按口袋、E05 收篙转头
- **门不动**：hookBeat 位置门照旧；「有没有运动」是语义判断，关键词
  扫描两头漏，误拦的门比没有门更糟——门的信用比数量重要

## novel-storyboard 1.0.0 — 2026-08-13

首个版本，管线最后一块：给 AI 短剧出**分镜**。前提刻在骨子里：
**镜头是生成出来的，多切一刀的成本几乎为零**，短剧观众的注意力
节奏是 3 秒左右一切。所以是三层结构：

- **段** = 一次视频生成调用，≤ 15 秒（按模型可调），不跨场次
- **分镜** = 段内 2–5 秒的剪切（**硬门**），各自认领剧本节拍、
  带景别和 H3 官方词表的运镜
- **分镜图** = 每切一张关键帧：主分镜图钉 0.00 秒，子分镜图钉各自
  切点。两人对话的正反打在一段里一次生成，每格构图由图控制

**H3 提示词一段一条，两处逐字对账**：多图对齐指令
（Picture k aligns with the X.XX-second mark）和 [Shot k] 切点时刻
全部由分镜秒数推导——改了秒数忘改提示词，validate 当场拦。
认领台词逐字进 `<d>[Chinese] …</d>` 块，声景配乐同条带上
（写法调用 MiniMax 官方 h3-prompt-writing skill）。

- **分镜图是资产合成不是凭空画**：出图挂场景/角色/道具设定图当
  参考图走 codex $imagegen——novel-art 和 novel-characters 的图
  在这一步真正被消费
- **生成批次单**：同场景 + 同光照的段归一批共用环境参考图
- **配音对齐单**：每句台词对到段号#切序，TTS 贴到哪一段第几切全自动
- **分镜节奏带**：粗分隔 = 段边界、片宽 = 分镜时长占比、颜色深浅 =
  景别远近，节奏一眼可读

**16 道质量门全是代码**：节拍全覆盖（分镜级）、段 ≤ 15 秒、
每切 2–5 秒、台词装得进分镜、每集总时长对齐剧本目标 ±15%、
同框 ≤ 3 人、段号连号（段号就是素材文件名）、景别短语、运镜词
在自己的 [Shot k] 段落、H3 对齐指令与切点时刻逐字对账、台词逐字
进 <d> 块（改一个标点都过不去）、台词之外全英文、风格短语统一
（style 预设与角色/场景 skill 同名对齐，同剧分镜图不许画风漂）、
分镜图提示词卫生、不含角色名（别名也拦，台词块除外）、场次/人物/
道具对账剧本。对账门缺上游时明说跳过。

**提示词按官方口径默认英文、逐镜换行**：每个镜头独立一行、切点
时刻开头；台词/歌词/画面文字按官方规定保留原文（<d>[Chinese]
逐字，门盯着）；英文模式禁角色名。promptLang=zh 可切整条中文
（对齐指令、字段名、[镜头 k] 标记都有中文版，人名放行）。骨架由
分镜结构按语言推导、逐字对账；语言门双向查：设定英文混进中文、
设定中文写成英文，都拦。写法规范学自 MiniMax 官方
h3-prompt-writing，**内化为 references/h3-prompt.md——skill
自包含，不依赖外部 skill**。报告段卡五五分栏：左列分镜行，右列
提示词面板一键复制。

**export 一键出 H3 投产包，投产结构固定**：每段一个文件夹
E01-01/——分镜图 f1..fN.png 和 prompt.md 同住（头部对照表明确
**f1.png 是首帧**、各图钉在第几秒，分隔线以下是 h3Prompt 原样），
根部 manifest.json 带图清单与缺图标注。一个段文件夹 = 一次 H3
生成的全部材料。

五个 skill 接力至此闭环：characters（谁）→ outline（什么）→
art（哪里）→ script（戏）→ storyboard（怎么拍）。

自带样例是《渡口》第 1 集完整分镜：10 段 34 切认领剧本全部 35 拍，
平均 3.5 秒一切，119 秒 / 目标 120 秒，2 个生成批次，每段的 H3
提示词全部对账通过。

自测 165 项。

## novel-characters 1.7.0 — 2026-08-13

**归并复核、cast.json 机器合成、更大的块**

跨块身份消解是全管线语义最难的一步，这版把校验预算往它身上挪：

- `merge` 输出改为 `{characters, mergeCandidates}`：精确匹配收敛不了的疑似同人
  （「陆」⊂「陆行远」这类名字包含关系）列成候选，模型复核后写 merges.json，
  用 `merge <workdir> --apply merges.json` 确定性落地。判断留给模型，
  落地回到脚本——谁擅长什么谁干什么
- 新增 `assemble` 命令：把 card-*.json + summary.txt（+ ui.json）合成 cast.json。
  这是纯机械活，之前留给模型手拼，手拼会丢字段、写错顶层键。
  坏卡逐个点名，只重跑坏的那个角色；同档角色按 merge 输出的
  戏份顺序排（`<workdir>/merged.json` 自动读，`--order` 可覆盖）
- 分块从 14k 字符提到 **4 万字符**：现在的模型读 4 万字符毫无压力，
  块数少三倍，跨块归并的接缝（也就是漏归并的机会）少三倍；
  单次上限从约 33 万字符提到约 93 万字符（净覆盖，已扣块间重叠）
- 断点续跑写进流程：`card-<slug>.json` 和 `images/<slug>-sheet.png`
  已存在就跳过，失败重来只补缺的

自测 274 → 307 项。

## novel-script 1.1.0 — 2026-08-13

**钩子必须是第一拍、动作只写常见动作、台词本配音色**

实际使用发现的问题：开场钩子的说明和第一场的开头内容衔接不上——
钩子说皮箱，开场拍了八拍雾。根因是钩子只有「说明」没有「认领」：

- 每集新增 `hookBeat: [场, 拍]` 认领钩子**具象**的位置；新质量门查它
  必须落在**全集前 3 拍内**（`params.hookWindow` 可调）。写法就是短剧
  的冷开场惯例：第 1 拍先给钩子的画面一闪。**说明给人读，认领给机器
  查**，衔接从此是门不是自觉。样例六集开场全部重写成冷开场
- 另一条实战经验进写作规则：**动作节拍只写常见动作**——「货担撞船帮、
  老周伸篙一挡」这种精确物理交互视频模型必崩，改写成「胡二爷挑着担子
  上船，老周搭手帮他把担子卸进舱里」。判据表进 script-pass.md，样例
  29 处精巧动作全部清洗，节拍与台词不动、时长不变
- `render --cast cast.json`：台词本每个角色组头带**音色提示词**按钮，
  台词和音色一页配齐直接跑 TTS

质量门 9 → 10，自测 125 → 137 项。

## novel-script 1.0.0 — 2026-08-12

首个版本。给 AI 短剧写**剧本**——前提刻在骨子里：**剧本管戏，分镜管拍**。
「爽不爽」和「怎么拍」是两种迭代节奏，台词要反复推翻重写，绑上镜头
分解每改一句都得重排镜头。所以这层只有集、场次、节拍流，没有镜号；
镜头、首帧提示词、生成批次都留给下一层分镜 skill。

守住的底线：**台词是结构化数据，不是散文**——每句台词独立条目
（说话人 + 台词 + 语气），动作一拍一件事。这是全部确定性检查的地基：

- **逐集时长预算**：台词按语速折算（默认 4.5 字/秒）、动作按节拍估时
  （默认 2.5 秒/拍），每集必须落在目标 ±15% 内。一集三分钟就是三分钟，
  写超写欠当场拦下，不流到生成环节才发现
- **台词本**：按角色聚合全部台词，整组复制——TTS 是按角色批量跑的，
  这页就是工作清单；`VO` 画外音单独成组
- **时长仪表**：每集一行条形图打在目标区间绿带上，超欠红字点名差几秒

**9 道质量门全是代码**：每集时长 ±15%、单句 ≤35 字、说话人在本场或标
VO、钩子悬念落纸、每场至少一个动作节拍（纯对白的场是广播剧）、动作
叙述体不混引号台词、爽点认领（大纲说这集有的爆点必须有戏扛）、角色
对账大纲、场景/光照/道具对账美术设定——剧本写了美术没登记的光照状态
当场报。对账门缺上游时明说跳过，不静默。

`seed` 吃 outline.json 确定性预填每集骨架（目标秒数、钩子、悬念、爽点
认领）。四个 skill 接力打通：characters（谁）→ outline（什么）→
art（哪里）→ script（戏）。

自带样例是《渡口》**全 6 集完整剧本**：9 场 123 句台词，每集都落在
120 秒 ±15% 内，对着大纲与美术设定样例全部质量门通过。

自测 122 项。

## novel-art 1.0.0 — 2026-08-11

首个版本。给 AI 短剧出**美术设定集（场景 + 叙事道具）**——前提刻在
骨子里：**环境和道具都是生成资产，不是实拍**。没有堪景搭景置景采买，
交付的是让同一个环境、同一件道具被生成几十次还长一样的一致性方案。

**每个场景的交付**

- 设计意图（这个空间为哪场戏存在）
- 一致性锚点 3–5 个：每次生成必现的可辨识特征，观众靠它认场景，
  QC 靠它核对生成镜头有没有漂
- 光照时段变体：换时段 = 重新生成不是重新打灯，每个状态落成英文提示词
- 空景出图提示词：环境和角色是两层资产，参考图混进人一致性全毁
- 变体机制：`variantOf` + `changes` 把衍生场景挂在母场景上，出图拿
  母场景成图当参考

**叙事道具层**（只收有特写、跨集、承载剧情的，3–8 件为宜）

- 戏剧功能优先：皮箱是全剧悬念、旧砚是爆点实体
- 状态变体：合上/打开是两张参考图——道具有状态弧，场景没有
- 尺度参照写死进提示词（手持级/桌面级/家具级）——AI 把手持道具
  画成家具尺寸是高频事故
- 白底无手：道具图要被贴进镜头，必须可抠；拿着道具的手是最常见污染
- 场景陈设归场景锚点、一次性手部道具镜头级解决，都不单独建资产

**11 道质量门全是代码**：锚点 3–5、光照 ≥1、无人（场景道具都查）、
提示词全英文、不含角色名（`--cast` 才查，不给就明说跳过）、变体引用
完整、风格与反向词匹配，道具另有状态 ≥1、尺度短语、禁手、纯白背景
四道。自测每道门都有击穿用例。

**三个 skill 接力**：`seed` 吃 novel-outline 的 outline.json 确定性
预填场景清单/出现集/承载爽点；`validate --cast` 吃 novel-characters
的 cast.json 查角色名；画风预设与角色 skill 同名对齐（realistic /
ghibli）但内容是环境版——真实感来自用旧的材质，不是皮肤毛孔。

**报告**：与另外两份同一套视觉语言。KPI 带、场景清单、场景设定卡、
道具清单、道具设定卡（一排两卡方便截图，图可点弹层放大）、质量门
面板、导出 JSON（下载的就是 art.json 原样）。

**自带样例**：《渡口》三场景（两主一变体）+ 两件道具（旧皮箱、
县衙旧砚），全部质量门通过，五张设定图已用 codex $imagegen 实际
生成验证（含变体拿母场景当参考图）。

自测 131 项。

## novel-outline 1.0.0 — 2026-08-10

首个版本。把一本小说改编成短剧大纲五件套：改编说明 / 人物表 / 爽点表 /
分集梗概 / 资产清单。

**核心主张：checklist 交给模型自觉是靠不住的**

- 模型只填 outline.json，Markdown 和 report.html 由 `render` 渲染，
  资产清单由脚本从分集数据自动汇总——**四件模型写、一件算出来**
- 13 道质量门全部是 `validate` 里的确定性代码：角色分档上限、主场景上限
  **随集数动态**（4 + ⌈集数/10⌉ 夹在 5–15，60 集 → 10，显式给了就用给的。
  按 AI 短剧定的数——场景是生成的没有搭景钱，放宽换观赏性，上限守的是
  跨集一致性资产和空间认知）、
  一次性场景有规避方案、爽点间隔 ≤ 3 集无真空、第 1 集有钩子、大爆点
  不压最后一集、每集三栏齐全、三人同框有拆解、生成难点进预警、
  引用完整（无失业角色/空转场景/悬空 ID）、叙述体无对白
- **角色按资产量分档**，不做一刀切上限：主角组 1–5（全套设定图 + 逐镜
  一致性核对）、重要配角 ≤ 10（半身参考图）、功能性角色 ≤ 10（占脸不占名，
  提示词直出），无名背景人不进表不限量。资产清单按档自动折算工作量
- 阈值参数化（`params.thresholds`）——爽点间隔在不同平台不是一个数
- 自测里 13 道门**每一道都有击穿用例**，证明它真的会拦

**流程门**

- 三档 stage：skeleton（骨架拍板前）→ beats（**写分集之前必须过**）→ full。
  「快版拍板再细化」靠 stage 变成可执行的，不是口头约定
- 分集每批 ≤ 10 集，60 集一口气写后半段必崩
- 长文本按章节分卷（每卷 15 章，上限 60 卷），超限明确报 `truncated`
- 关键取舍必须附原文逐字 evidence——禁止凭书名脑补

**报告：业内评审用的单页文档（1600 宽，全部平铺可 Cmd+F）**

- KPI 带六张统计卡开门见山；**关键决策**区块把拍板三件事落进纸面：
  砍了哪条线（带 cutNote 结论句）、合了哪些人（角色位统计与主角组名单
  算出来）、大爆点落在第几集（从爽点表自动列，首末带标记）
- 爽点节奏是**剧情时间轴**：大爆点实心、常规浅色、标签上下交替防撞，
  **空档直接标在轴上**、超阈值变铁锈红；超过 20 集自动折行。
  配色跑过 dataviz 验证器（#8a3324 / #c56a4e 六项全过）
- **每集调度矩阵**：角色 + 场景同一张网格，一列竖着读就是那一集的
  需求单；**场景概览**每景一卡——右上浅灰剧集编号（连续合写 1–6）、
  出现集微条、承载爽点、出场角色或复用方案
- 质量门：页眉徽章 + 未过时的病灶横幅 + 文末完整清单，✓/✗ 由脚本
  算好烘进页面；体检模式 = 贴现成大纲只跑诊断
- 导出 JSON 下载的就是 outline.json 原样，改完直接喂回 render/validate
- 全部图形内联 SVG/CSS，不引任何库，离线双击能开

**自带样例**：《渡口》6 集微型大纲，全部质量门通过，兼自测夹具。

自测 200 项。

## novel-characters 1.6.0 — 2026-08-09

**报告可以导出 JSON**

- 顶栏新增「导出 JSON」，下载的**就是 `cast.json` 本身的形状**
  （`source` / `lang` / `style` / `summary` / `ui` / `characters`），
  不另立一套导出格式
- 所以外部工具改完可以**直接喂回 `render` 重新出报告**，也能过 `validate`。
  自测里有一条断言就是拿导出的数据跑 `validateCast`，必须通过
- 角色卡里的 `sheetImage` 一并带出，外部工具知道哪张图对应哪个人
- 数据以 `<script type="application/json">` 内嵌，点导出只是把它包成 Blob 下载，
  **不发任何网络请求**，报告仍然是离线单文件
- `renderHtml()` 补上第 6 个参数 `style`——之前顶层的画风没传进渲染层，
  导出时会漏掉这个字段

**两个坑**

- 正文里出现 `</script` 会把内嵌数据块提前截断。JSON 里 `<` 只可能在字符串值里，
  整体转成 `<` 就安全了，自测里拿 `</script><script>alert(1)</script>` 当夹具
- `URL.revokeObjectURL` **不能跟在 `a.click()` 后面立刻调用**——Safari 会抢在
  下载读完之前撤掉 blob，存出来是空文件

自测 259 → 274 项。

## novel-characters 1.5.0 — 2026-08-09

**默认拆 30 个角色，每个都出图**

- 选角默认从 10 位提到 **30 位**
- 出图**不再按 `importance` 筛**，选中的角色全都出。一个角色一次调用，
  30 个就是 30 次——这是整条管线最慢的一步，开始前要跟用户报张数
- 新增第 4 条硬规则：**族裔、年代、地域必须从原文推断，并明确写进
  `image.prompt` 和 `image.sheet`**。不写死的话图像模型默认画当代西方白人，
  民国的老船夫会出成穿工装的美国老头
- 这条**不跟报告语言走**——`lang` 管的是谁来读，不是故事发生在哪。
  报告出成日文，不该把民国船夫画成日本人

**关系图谱**

- 报告新增一个全景视图，左栏顶部进入，跟角色详情互斥
- 数据直接来自 `persona.relationships`，不用模型再跑一趟
- 按**名字 + 别名**建索引连边——老周的关系里写「老伯」也要连到同一个节点，
  只按 `name` 匹配会漏掉一半
- 同一对人的两条单向记述合并成一条边，两个方向的说法都留着
- 圆环布局 + 向心贝塞尔，位置在 Node 里算好写进内联 SVG。**不引任何库**，
  报告仍然是离线双击能开的单文件
- 弦上标关系文字：取较短的那种说法截到 6 字，全文进 `<title>`。
  边 ≤ 14 条默认标出来，再多默认收起，顶部有开关
- 悬停节点亮出他的全部关系、悬停关系表某行只亮那一条弦、点节点或点行
  跳到对应角色。节点带 74px 透明命中区——圆点本身才十来像素，压不准

**报告细节**

- 故事摘要默认三行 + 底部渐隐，点一下展开；本来就不到三行的不显示入口
- 主区右侧信息卡从 340px 加宽到 500px

**踩到的两个坑**（都写进注释了）

- 命中区圆和可见圆都用 `circle` 时，`.lead` 的填色会把命中区一起染成大红块。
  各给一个类才隔得开
- 正对面两个角色之间，弦的中点正好是圆心，标签会摞在一起。改成标签沿弦
  按序号错位，弦本身不动

自测 220 → 259 项。

## novel-characters 1.4.0 — 2026-08-08

**出图风格可选**

- 新增顶层 `style` 字段，默认 `realistic`（半写实厚涂），另有 `ghibli`
  （吉卜力式手绘赛璐璐）
- **换风格是整套换**：每个预设自带 render / surface / lighting / negative /
  tags 五块，整块取用不混搭。见 `references/style-presets.md`
- **两个预设的反向提示词几乎是相反的**：`realistic` 绝不能禁
  `photorealistic`，`ghibli` 必须禁。`validate` 会拦这个搞反
- 表面处理同理：写实要毛孔、皮下散射、根根碎发、布料织纹；吉卜力明确
  要无毛孔、成簇发丝、平涂无织纹
- 光照也不同：写实分区打光（左栏方向光、右侧平光），吉卜力全图平光——
  平光本来就是那个风格的一部分
- **版面规则不随风格变**：16:9 三区、比例协调、细节让位，两个风格都一样
- `novel-characters.mjs styles [id]` 打印预设完整内容

**报告交互**

- 点图弹层查看大图，点背景或 Esc 关闭
- 图片右下角一键**复制图片本身**到剪贴板（不是路径）；非 PNG 先过 canvas
  转码，因为 Safari 只认 `image/png`
- 左栏缩略图加圆角

已用《渡口》端到端验证：日文 + 吉卜力跑通（界面日文、引文保持中文原文、
出图确实是赛璐璐质感），再切回中文 + 默认风格。

自测 197 → 220 项。

## novel-characters 1.3.0 — 2026-08-08

**提示词转向半写实，人物更逼真**

- 反向提示词里**删掉 `photorealistic` / `3d render`**——一边要真实感一边
  禁真实感是自相矛盾的。改禁真正该禁的「假」：塑料蜡质皮肤、过度磨皮、
  无毛孔娃娃脸、完全对称的脸、没有高光的死眼、头盔状头发、无织纹布料
- 画风从「扁平矢量卡通」换成**半写实厚涂**。原来那句跟写实拧巴，实测
  同一批角色有的出成动画、有的出成写实，画风飘
- 真实感靠不完美而不是细节量：可见毛孔、肤色不匀、眼睛湿润高光与虹膜
  纤维、**眼睑眉毛左右不对称**、碎发破开轮廓；老年角色的皱纹**顺表情肌走**
- 布料写织纹、肘部袖口的磨损光泽、垂坠重量、褶皱自阴影
- **分区光照**：左栏半身像给柔和方向主光 + 环境遮蔽（要体积），右侧三视图
  和细节条保持平光正交（要抠图和量比例）。设定表和写实的矛盾在这里化解

**报告**

- 主区最大宽度 1500px
- 左栏缩略图改用精灵图切片：设定图固定 16:9、左栏约 34%，按 294% 放大
  左上对齐，裁出来正好是半身像，不用另存缩略图

自测 174 → 192 项。

## novel-characters 1.2.0 — 2026-08-08

**报告改成三栏工作台**

- 顶栏：书名 + 搜索框（按名字、别名、身份、特质找人）+ 元信息
- 左栏：故事摘要 + 角色列表，每条带缩略图、序号、重要度、性别年龄、
  一句话、特质标签；缩略图自动取设定图左半边，正好是半身像
- 主区：**一次只看一个角色**，左栏点谁显示谁。图 + 两栏文字 + 原文依据，
  右侧四张信息卡（基本信息 / 关系 / 声音 / 画风），底部两组可折叠提示词
- 打印时自动展开全部角色和全部提示词——屏幕上一次一个，纸上要完整
- 配色和双字域排版不变，换的是结构

**设定图改成 16:9 三区版面**

- 画布写死 **16:9**
- 左约 34% 半身像（面部基准）／右上全身三视图／**右下新增细节条**
  （4–5 个关键细节的小特写），三区之间细线分隔
- 细节放不下就沿右缘往下延伸，**但永远是细节让位，不是人物让位**
- 强调比例：三视等高、头身比一致、脚踩同一地平线，**禁止为了腾地方
  拉伸或压扁人物**——这是这个版面最容易崩的地方

自测 132 → 174 项。

## novel-characters 1.1.0 — 2026-08-08

**多语言**

- 调用时加 `--lang <code>` 指定报告语言，默认中文
- 内置 **中文 / English / 日本語** 三套界面文案
- **其他任何语言也支持**：skill 现场把界面文案翻译成目标语言，存进 `cast.json` 的 `ui` 字段，渲染时合并。用 `ui-template <lang>` 生成待翻译骨架
- 不给 `ui` 又用了内置表没有的语言，`validate` 会直接报错——避免「内容是法语、界面是英文」的半吊子报告
- 分工：人类可读字段跟随 `lang`；出图和 TTS 提示词**永远英文**，那些引擎吃英文最稳
- 校验的语言规则跟着 `lang` 走，能自动判别 zh / en / ja，其他语言不猜

**出图改成左右分栏的单张设定图**

- `image.face` + `image.turnaround` 合并为 **`image.sheet`**，一个角色一张图
- 一张横构图内部分两栏：**左栏约 38%** 是证件照式半身像（面部设计基准），
  **右栏约 62%** 是全身三视图（正/侧/背）
- 左栏尺寸大、五官画得细，可以直接拿去做表情设计；右栏管剪影、比例、服装，
  脸照左栏画
- 比例必须写死在提示词里，说反了整张图就废
- 最容易出的问题是**一张图里两个长相**，提示词里明确要求两边一致
- 左栏还要显式禁掉两个默认行为：**裁掉两侧肩膀**、**底边圆角渐隐**。
  不写就一定会出，看着很别扭

**破坏性变更**

- `image.promptZh` / `voice.promptZh` 更名为 `promptLocal`——多语言下 `Zh` 这个名字不成立
- `image.turnaround` 更名为 `image.sheet`，内容从「三视图」变成「半身像 + 三视图」
- `cast.json` 顶层新增必填 `lang`
- 出图落盘从 `<slug>-turnaround.png` 改为 `<slug>-sheet.png`
- `references/turnaround.md` 更名 `references/sheet.md`

自测 73 → 132 项。

## novel-characters 1.0.0 — 2026-08-06

首个版本。

**管线**

- 两趟：分块扫描角色 → 别名归并 → 逐角色出完整设定
- 输出人物画像、卡通形象提示词（中英）、音色提示词（中英）
- 三视图出图，走 codex 内置 `$imagegen`，零 API key；没有 codex 就跳过，其余照常
- 三视图一律**纯白背景**，方便抠图

**产出**

- `cast.json` + Markdown + 自包含 `report.html`
- report.html 的设计约定见 `references/report-style.md`：
  双字域排版（宋体＝原文 / 黑体＝分析 / 等宽＝提示词）、不藏内容可 Cmd+F、
  「（推断）」自动高亮、冷灰印张配铁锈红印记
- 每段提示词各自一个复制按钮，每个角色 8 个

**校验**

确定性检查，不靠模型自觉：逐字引文、出图提示词不含人名、字段语言分工、结构与枚举。

**自测**

62 项断言覆盖分块 / 归并 / 校验 / 渲染，不调模型、1 秒跑完。
