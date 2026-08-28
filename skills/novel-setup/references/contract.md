# 下游契约 · 六个 skill 怎么用这份参数

这份文档定义 `production.json` 与下游的关系。**下游不 import 本 skill 的任何代码**——每个 skill 都要能整个拷走单独跑，所以查找逻辑各自实现（十几行），读到的是同一份 JSON。

## 查找规则

从**自己的段目录**向上找 `production.json`，最多 5 层，找到第一份就用。

```
<工作目录>/
├── production.json      ← 住在这里
├── outline/
├── characters/          ← 从这里向上 1 层找到
├── art/
├── script/
└── storyboard/
    └── E01-01/          ← 从这里向上 2 层也找得到
```

5 层是算过的：`<工作目录>/<段目录>/<投产包目录>` 最深两层，留三层余量，又不至于爬到用户主目录去。

## 产物落点

上面那棵树不是建议，是**约定**：除 `novel-setup` 外，每个 skill 的全部产物——JSON、Markdown、报告 HTML、`images/`、分镜的 `manifest.json` 与 `E01-0x/` 投产包——都写进自己那一格，工作目录根只住 `production.json`。

| skill | 段目录 | 装什么 |
| --- | --- | --- |
| **novel-outline** | `outline/` | `<书名>-outline.json` / `.md` / `outline-report.html` |
| **novel-characters** | `characters/` | `<书名>-cast.json` / `.md` / `report.html` / `images/` |
| **novel-art** | `art/` | `<剧名>-art.json` / `.md` / `art-report.html` / `images/` |
| **novel-script** | `script/` | `<剧名>-script.json` / `.md` / `script-report.html` |
| **novel-storyboard** | `storyboard/` | `<剧名>-storyboard.json` / `.md` / `storyboard-report.html` / `manifest.json` / `E01-0x/` |
| **novel-creation** | `creation/` | `<剧名>-creation.json` / `.md` / `creation-report.html` / `manifest.json` / `E01-0x/` |

**为什么要固定**：合并报告（仓库根的 `scripts/report.mjs --from <工作目录>`）就是按段目录名去找那五份 JSON 的，产物平铺在根目录它一份也找不到。分镜还多一条——报告里的图走相对路径 `<段号>/f<切序>.png`，段文件夹与报告 HTML 必须同级，多套一层目录图会**静默**全变成占位。

**下游各自核对，是提示不是门**。落点写错不用重出图，按上面那条界线就不该设门；但也不能不说，所以 `validate` 找到 `production.json` 之后顺带比一下产物在不在自己那一格，不在就点名该去哪：

> ⚠️ 产物落在 `<工作目录>`，按工作目录约定该住在 `<工作目录>/art`——每个 skill 的产物归自己的段目录，放错了合并报告的 `--from` 自动发现找不到它

没有 `production.json` 就无从判断工作目录根在哪，那时明说跳过，不猜。

中间脚手架（`novel-outline` 的分卷摘要、`novel-characters` 的分块与角色卡）写进段目录下的 `.work/`，跑完可以整个删掉。

## 找不到怎么办

**明说跳过，不静默降级。** 老项目、单跑某一段的场合都可能没有这份文件，那时下游照旧用自己的内置默认值，但必须在校验输出和汇报里说清哪几道门跳过了。

> ⚠️ 未找到 production.json，2 道参数门（画风、画幅）与产物落点提示跳过。跑 `/novel-setup` 生成一份可以打开它们。

**画风是个例外：它没有内置默认值。**其余参数找不到就退回下游自己的内置默认（生图模型、档位、界面语言都有），画风不行——画风的正文本来就只住在这一份文件里，下游没有一份可退。所以画风那几道门只能跳过，跳过就要在汇报里说清楚：这一趟的画风没有任何东西在保证它不漂。

装作查过比没查更坏。

## 找到了就必须遵循

分两类，界线是**改了要不要重出图**：

### 会导致重出图的 —— 设门，不可绕过

| 参数 | 谁查 | 查什么 |
| --- | --- | --- |
| `style.character` | novel-characters | 角色卡的 `image.sheet` 与 `image.prompt` 必须原样含 `render` 那句，`image.negativePrompt` 必须把 `negative` 的每一条都带上（角色自己额外加的不受影响） |
| `style.scene` | novel-art | 场景与道具设定卡同上。反向词只对**场景**查全——道具参考图是纯白背景，画风里冲着「环境别太干净」去的那几条正好和白底自相矛盾 |
| `style.phrase` | novel-storyboard | 每条分镜图提示词里必须原样出现这句短语（大小写不敏感） |
| `image.frame.aspectRatio` | novel-storyboard | 每条分镜图提示词里的比例短语必须是这个值。写死 `16:9` 却要拍竖屏 = 一集三四十格全白出 |
| `image.asset.aspectRatio` | novel-characters / novel-art | 设定图版面的画幅短语必须是这个值 |
| `image.asset.resolution` / `image.frame.resolution` | 出图那一步 | 出图调用的 `--input_data` 必须带这个档位。它就是 lingying 的 `resolution` 枚举值，原样填，不折算 |

这几道门在下游是**自动开的**：只要找得到 `production.json` 就查，没有开关。

**画风只有一处产地。** 下游的产物 JSON（`cast.json` / `art.json` / `storyboard.json`）**顶层没有 `style` 字段**——画风正文住在 `production.json`，产物里再抄一份就是第二个来源，两个来源必然会漂。老产物里留着那个字段的，`novel-art` 的 `validate` 会点名让删掉。

画风那几道门有**两种跳过**，说法不一样，别混为一谈：

| 情况 | 门怎么说 |
| --- | --- |
| 没找到 `production.json` | 「未找到 production.json（向上 5 层），本门跳过——跑 `/novel-setup` 生成一份可以打开它」 |
| 找到了但画风那一块没填 | 「production.json 里的 `style.scene` 没填，本门跳过——回 `/novel-setup` 填满它」 |

第二种不是本 skill 的责任范围之外——`style-blocks` 门在 `novel-setup` 这一段就会拦住空骨架，走到下游还空着，说明这一段没跑完。

### 会改变跑法的 —— autopilot，读到就照做

`autopilot` 不改任何一个下给模型的值，它改的是下游遇到「该问用户」的地方怎么办：

| 值 | 下游怎么跑 |
| --- | --- |
| `false`（默认、字段缺失、写错类型） | 原来的样子：该问就问、该等拍板就等拍板 |
| `true` | 各自把自己那一段**一口气跑完**——不提问、不等拍板、不把选择题抛回去，该做的决定自己做，做过的决定全部写进最后的汇报 |

**转移的是审批权，不是取消检查点。**质量门照样是门（没过就修到过）；花钱前照样先算账（预估照样报出来，只是不等回应）；止损照样止损（同一段连着失败两次仍然跳过并记进汇报）。**不打断 ≠ 无限重试烧钱。**

**只认布尔真值**：`doc?.autopilot === true`。JSON 里写成字符串 `"false"` 在 JS 里是真值，那种写法会让一整条管线闷头跑完，比不写更坏——所以下游各自也严格比，别写成 `if (production.autopilot)`。

它对下游是**只读的口径**，不是门：开着不影响任何一道门的判定，只影响 skill 自己的流程要不要停下来。找得到 `production.json` 且开着，命令会在 stderr 打印一句：

```
↳ 自动驾驶：开——本段流程一口气跑完，不要停下来问用户
```

关着就不打印（那是原来的样子，没有新信息）。开工前先看一眼工作目录根的 `production.json` 顶层：Step 0 的那些提问在 `autopilot` 为 `true` 时全都不该发生，而 Step 0 一般跑在第一条 `validate` 之前，等命令打印那一句就晚了。

### 只影响阅读的 —— 继承，不设门

`lang`（报告界面语言）走继承，优先级：

```
--lang 命令行参数  >  产物 JSON 顶层的 lang 字段  >  production.json 的 lang  >  内置默认 zh
```

`promptLang` 同理（novel-storyboard 用）。改一次显示语言不该被拦下来——它不产生任何浪费。

## 每个 skill 读哪几个字段

| skill | 读 | 用在哪 |
| --- | --- | --- |
| **novel-outline** | `lang`、`autopilot` | `render` 的界面语言缺省值；开着就不等用户拍板快版骨架 |
| **novel-characters** | `style.label`、`style.character`、`lang`、`image.model`、`image.asset.*`、`autopilot` | 写角色卡时整块抄画风；校验画风整块用上与版面画幅一致；出角色设定图时的模型与档位；开着就不问选角人数、自己复核归并候选 |
| **novel-art** | `style.label`、`style.scene`、`lang`、`image.model`、`image.asset.*`、`autopilot` | 写设定卡时整块抄画风；校验画风整块用上与版面画幅一致；出场景与道具设定图时的模型与档位；开着就自己定输入与道具清单 |
| **novel-script** | `lang`、`autopilot` | `render` 的界面语言缺省值；开着就不问「要不要先跑 novel-outline」 |
| **novel-storyboard** | 全部 | 校验画风一致、分镜图比例一致；出分镜图时的模型与档位；`export` 把视频参数写进投产包；开着就自己验第一段的分镜图效果、下单前照样报出花费但不等回应 |
| **novel-creation** | `video.*`、`lang`、`promptLang`、`autopilot` | 段秒数落进模型时长区间、提示词按 `video.model` 分流；`export` 把视频参数写进投产包；开着就下单前照样报出花费但不等回应 |

`resolve` 命令把每个阶段要的东西一次给全：

```bash
node {baseDir}/scripts/novel-setup.mjs resolve --for storyboard
```

```json
{
  "stage": "storyboard",
  "what": "分镜图",
  "style": {
    "label": { "zh": "真人实拍", "en": "Photorealistic live-action" },
    "phrase": "cinematic film still"
  },
  "lang": "zh",
  "autopilot": false,
  "cli": "lingying",
  "model": "nanobanana2",
  "resolution": "2K",
  "aspectRatio": "9:16",
  "inputData": { "aspect_ratio": "9:16", "resolution": "2K" },
  "command": "lingying image create --model \"nanobanana2\" --input_data '<JSON>' --json"
}
```

`resolution` 与 `aspectRatio` 是原样的真源；**`inputData` 是拼好的 lingying 参数**——补一个 `prompt`（要参考图再补 `images`）就能提交。省得每个 skill 各拼各的，拼法一漂就又是一处不一致。

**`style` 只给这一段要的那一块**：`--for characters` 带 `style.character`、`--for art` 带 `style.scene`，`--for storyboard` 与 `--for video` 只有 `label` 与 `phrase`。整个画风对象摊开有六七十行，全倒出来会把有用的那几行埋掉，也容易让人抄错块。要看完整的一份就跑 `style <production.json>`。

## 出图调用怎么带上参数

**档位与比例是 lingying 的结构化字段，不是提示词的一部分。**直接把 `resolve` 给的 `inputData` 展开进 `--input_data`，补上 `prompt`：

```json
{
  "prompt": "<纯粹的图像描述，不写像素、不写调用指令>",
  "aspect_ratio": "9:16",
  "resolution": "2K",
  "negative_prompt": "<反向提示词，独立字段>",
  "images": ["<参考图 URL，由 lingying upload 换来>"]
}
```

三件事值得单独记住：

- **提示词里一个像素都不写。**以前档位要折成像素、再拼一句 `Render at 1152x2048 (9:16).` 塞进提示词末尾——那一层整个没有了，也就没有了「拼法漂了」这类问题。
- **反向提示词是一等字段**（`negative_prompt`），不要再塞回正向提示词。
- **参考图只收 URL**：本地设定图先 `lingying upload <路径>` 换成 URL。它按内容去重，同一张图整集复用同一个 URL。

档位或比例不在该模型的枚举里，网关会在提交那一刻拒绝（`input validation failed`）。所以 `novel-setup` 把这件事提前到定参数时查——`model-caps` 门。

## 视频参数怎么落地

`novel-storyboard` 的 `export` 把整个 `video` 对象（`model` / `aspectRatio` / `resolution`）写进两处：

- `manifest.json` 的顶层 `video` 字段
- 每段 `prompt.md` 的头部对照表

下单时参数就在投产包里，不用再回头翻配置。**有的模型还收自己特有的配置参数**——它不属于跨 skill 的生产参数，不在 `production.json` 里。能力表按那个参数的 default 值抄枚举，所以照表填的档位与比例，不传它也提交得出去。

段时长要折成整数秒再下单（模型收的是区间内的整数）：

```bash
node {baseDir}/scripts/novel-setup.mjs duration 12.5 --model "MiniMax H3"
```

下单的完整契约见 `novel-storyboard/references/video-order.md`。
