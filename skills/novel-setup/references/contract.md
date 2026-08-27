# 下游契约 · 五个 skill 怎么用这份参数

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

**为什么要固定**：合并报告（仓库根的 `scripts/report.mjs --from <工作目录>`）就是按段目录名去找那五份 JSON 的，产物平铺在根目录它一份也找不到。分镜还多一条——报告里的图走相对路径 `<段号>/f<切序>.png`，段文件夹与报告 HTML 必须同级，多套一层目录图会**静默**全变成占位。

**下游各自核对，是提示不是门**。落点写错不用重出图，按上面那条界线就不该设门；但也不能不说，所以 `validate` 找到 `production.json` 之后顺带比一下产物在不在自己那一格，不在就点名该去哪：

> ⚠️ 产物落在 `<工作目录>`，按工作目录约定该住在 `<工作目录>/art`——每个 skill 的产物归自己的段目录，放错了合并报告的 `--from` 自动发现找不到它

没有 `production.json` 就无从判断工作目录根在哪，那时明说跳过，不猜。

中间脚手架（`novel-outline` 的分卷摘要、`novel-characters` 的分块与角色卡）写进段目录下的 `.work/`，跑完可以整个删掉。

## 找不到怎么办

**明说跳过，不静默降级。** 老项目、单跑某一段的场合都可能没有这份文件，那时下游照旧用自己的内置默认值，但必须在校验输出和汇报里说清哪几道门跳过了。

> ⚠️ 未找到 production.json，2 道参数门（画风一致、画幅一致）与产物落点提示跳过。跑 `/novel-setup` 生成一份可以打开它们。

装作查过比没查更坏。

## 找到了就必须遵循

分两类，界线是**改了要不要重出图**：

### 会导致重出图的 —— 设门，不可绕过

| 参数 | 谁查 | 查什么 |
| --- | --- | --- |
| `style` | novel-characters / novel-art / novel-storyboard | 产物 JSON 的 `style` 必须与参数一致。画风漂了 = 角色是吉卜力、场景是实拍，合成没法看，整套设定图白出 |
| `image.frame.aspectRatio` | novel-storyboard | 每条分镜图提示词里的比例短语必须是这个值。写死 `16:9` 却要拍竖屏 = 一集三四十格全白出 |
| `image.asset.aspectRatio` | novel-characters / novel-art | 设定图版面的画幅短语必须是这个值 |
| `image.asset.resolution` / `image.frame.resolution` | 出图那一步 | 出图调用的 `--input_data` 必须带这个档位。它就是 lingying 的 `resolution` 枚举值，原样填，不折算 |

这几道门在下游是**自动开的**：只要找得到 `production.json` 就查，没有开关。

### 只影响阅读的 —— 继承，不设门

`lang`（报告界面语言）走继承，优先级：

```
--lang 命令行参数  >  产物 JSON 顶层的 lang 字段  >  production.json 的 lang  >  内置默认 zh
```

`promptLang` 同理（novel-storyboard 用）。改一次显示语言不该被拦下来——它不产生任何浪费。

## 每个 skill 读哪几个字段

| skill | 读 | 用在哪 |
| --- | --- | --- |
| **novel-outline** | `lang` | `render` 的界面语言缺省值 |
| **novel-characters** | `style`、`lang`、`image.model`、`image.asset.*` | 校验画风与版面画幅一致；出角色设定图时的模型与档位 |
| **novel-art** | `style`、`lang`、`image.model`、`image.asset.*` | 校验画风与版面画幅一致；出场景与道具设定图时的模型与档位 |
| **novel-script** | `lang` | `render` 的界面语言缺省值 |
| **novel-storyboard** | 全部 | 校验画风一致、分镜图比例一致；出分镜图时的模型与档位；`export` 把视频参数写进投产包 |

`resolve` 命令把每个阶段要的东西一次给全：

```bash
node {baseDir}/scripts/novel-setup.mjs resolve --for storyboard
```

```json
{
  "stage": "storyboard",
  "what": "分镜图",
  "style": "realistic",
  "lang": "zh",
  "cli": "lingying",
  "model": "nanobanana2",
  "resolution": "2K",
  "aspectRatio": "9:16",
  "inputData": { "aspect_ratio": "9:16", "resolution": "2K" },
  "command": "lingying image create --model \"nanobanana2\" --input_data '<JSON>' --json"
}
```

`resolution` 与 `aspectRatio` 是原样的真源；**`inputData` 是拼好的 lingying 参数**——补一个 `prompt`（要参考图再补 `images`）就能提交。省得每个 skill 各拼各的，拼法一漂就又是一处不一致。

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
