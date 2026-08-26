**中文** · [English](README.en.md)

# novel-setup

给 AI 短剧定**生产参数**——管线的第 0 段，在拆角色排大纲之前先跑。

它解决的问题只有一个：**技术参数散在每一次出图调用里，就必然会漂**。今天出的角色设定图是 16:9，明天出的分镜图还是 16:9，可片子要拍竖屏——这件事要等到把分镜图喂给视频模型、被裁掉两边才发现，那时一集三四十格已经出完了。

一次定死，落成工作目录根的一份 `production.json`，后面四个 skill 出图与下单前向上找到它照着做：

```json
{
  "source": "回南天",
  "style": "realistic",
  "lang": "zh",
  "promptLang": "en",
  "image": {
    "model": "nanobanana2",
    "asset": { "resolution": "2K", "aspectRatio": "16:9" },
    "frame": { "resolution": "2K", "aspectRatio": "9:16" }
  },
  "video": {
    "model": "MiniMax H3",
    "aspectRatio": "9:16",
    "resolution": "768p",
    "variant": "managed"
  }
}
```

| 参数 | 谁在用 |
| --- | --- |
| **生图模型** | novel-characters / novel-art / novel-storyboard 的出图调用 |
| **资产图分辨率 · 资产图比例** | 角色设定图、场景设定图、道具设定图 |
| **分镜图分辨率 · 分镜图比例** | 分镜图——它就是成片的一格 |
| **生视频模型** | novel-storyboard 的 `export` 投产包 |
| **视频 aspect_ratio · 视频 resolution · 变体** | 下单给视频模型时的三个参数 |
| **画风**（realistic / ghibli） | 三个出图 skill，漂了合成没法看 |
| **报告界面语言 · 提示词语言** | 五个 skill 的 `render` 与 H3 提示词 |

## 两个比例是两件事 ⚠️

最容易误解的一处，也是这个 skill 存在的主要理由：

- **资产图**（角色、场景、道具的设定图）是给参考图与人眼看的**设定表**。角色设定图的三区版面、场景与道具设定图的 L 形版面都靠横向铺开，竖过来三视图会被压扁。所以资产图默认 `16:9`，**成片拍竖屏也不改**。
- **分镜图**是喂给视频模型的关键帧，**它就是成片的一格**。比例和视频 `aspect_ratio` 差一点，参考图就会被裁切或拉伸，一整批分镜图白出。

两道门分别管这两件事，不会互相牵连。

## 出图与生视频走 lingying

两件事都交给 **lingying**（灵影网关）CLI：`image create` / `video create` 提交任务，`task get` 轮询，产物是 URL，自己落盘。

这带来一处实打实的简化：**`resolution` 与 `aspectRatio` 就是 lingying `input_schema` 里的枚举值**（`1K` / `2K` / `4K`、`768p`、`16:9` / `9:16` ……），原样填进 `--input_data` 就行——**不折算像素，提示词里也不写像素**。以前要把档位折成像素、再拼一句 `Render at 2048x1152 (16:9).` 塞进提示词末尾，那一层整个没有了。

因为枚举是本机可查的，模型能力表也就填得起了：

```bash
node scripts/novel-setup.mjs caps
```

```
生图：
  nanobanana2    档位 1K / 2K / 4K　比例 1:1 / 2:3 / 3:2 / 9:16 / 16:9
  image-2        档位 1K / 2K / 4K　比例 1:1 / 3:2 / 2:3 / 4:3 / 3:4 / 16:9 / 9:16
                 ↳ 4K 下只收 16:9 / 9:16

生视频：
  MiniMax H3 · managed         档位 768p / 2K　比例 16:9 / 21:9 / 4:3 / 1:1 / 3:4 / 9:16 / adaptive
  MiniMax H3 · open_source     档位 480p / 720p　比例 1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 9:16 / 16:9
                               ↳ duration 5~15 秒整数
  …
```

这张表以前视频侧是**有意留空**的，理由是「各家口径不同、版本之间还会变，凭记忆编一张比不查更坏」。改走 lingying 之后依据有了——`lingying model get <UUID>` 本机就能把 `input_schema` 打出来。所以表填上了，但**出处不许省**：每条都带取数命令与 UUID，过期了重跑一次就能对账。

它拦得住的是这类事：想拍 `4:3` 就不能选 `nanobanana2`（它不收这个比例）；`image-2` 出 `4K` 时只剩 `16:9` / `9:16` 两个比例可选（8.29MP 像素上限）；`MiniMax H3` 的 `managed` 变体档位是 `768p` / `2K`，**不是随手会写的 `720p` / `1080p`**。这些以前都要等到提交那一刻被网关拒绝才知道。

**表里没有的模型不是错误**：相关的门明说跳过，其余门照常。网关上新加了模型，跑一句 `lingying model list` 看口径，往表里加一条就自动开始查。

### adaptive 不进本管线 ⚠️

lingying 的视频模型都收 `aspect_ratio: "adaptive"`（按输入自动挑比例）。**本管线用不了**：分镜图要按同一个比例整批出，比例交给模型临场挑，一集三四十格就对不上了。`aspect-format` 门直接拦掉。

## 质量门：7 道，全是代码

与仓库里另外五个 skill 同一主张：**checklist 交给模型自觉是靠不住的**。

| 门 | 规则 |
| --- | --- |
| 字段齐全、枚举合法 | 少一个字段，下游读到 `undefined` 会静默用回默认值 |
| 比例都是 `W:H` 写法 | 写成 `9-16` 下游解析不出来 |
| **分镜图比例 = 视频比例** | 不一致 = 整批分镜图被裁或被拉，白出 |
| 资产图是横构图或方形 | 竖构图会把设定图的三视图压扁 |
| 三处分辨率档位都已填 | 没填就等于没定 |
| 视频模型与参数合法 | 模型、变体、档位、比例四者要对得上。`MiniMax H3 · managed` 配 `720p` 会被网关拒，那时整集分镜图已经出完了 |
| 档位与比例都被生图模型收 | 同上。`nanobanana2` 不收 `4:3`、`image-2` 的 `4K` 只收 `16:9` / `9:16` |

自测里每道门都有**击穿用例**——证明它真的会拦。

## 怎么用

```bash
# 0. 看一眼模型收什么档位与比例
node scripts/novel-setup.mjs caps

# 1. 生成参数文件（成片画幅没有默认值，必须显式给）
node scripts/novel-setup.mjs init --aspect 9:16 \
  --source 回南天 --video-model "MiniMax H3" --video-resolution 768p \
  > <工作目录>/production.json

# 2. 校验
node scripts/novel-setup.mjs validate <工作目录>/production.json

# 3. 看一张人读的参数表
node scripts/novel-setup.mjs show <工作目录>/production.json
```

**成片画幅没有默认值**——竖屏和横屏是两条不同的片子，猜错了后果是整批产物重出。这是唯一一个宁可让用户多打一个参数也不能默认的参数。

**不出 HTML 报告**：这是一份十来行的参数表，`show` 就够了，多一份要 render 的产物只是多一处会漂的东西。

## 下游怎么用它

完整契约见 `references/contract.md`。三句话版本：

- **下游向上找**：从自己的段目录向上最多 5 层找 `production.json`。**下游不 import 本 skill 的代码**——每个 skill 都要能整个拷走单独跑，查找逻辑各自实现十几行。
- **产物各归各的段目录**：`outline/`、`characters/`、`art/`、`script/`、`storyboard/`，根目录只住这份 `production.json`。下游找到它就顺带核对落点，放错了点名该去哪——是提示不是门。
- **找不到就明说跳过**，照旧用内置默认值，但要在校验输出里说清哪几道门跳过了。装作查过比没查更坏。
- **找到了就必须遵循**，界线是改了要不要重出图：画风、画幅**设门不可绕过**，出图档位必须带进调用；报告界面语言走继承，不设门。

一行拿到某一段要的全部参数：

```bash
node scripts/novel-setup.mjs resolve --for storyboard
```

```json
{
  "stage": "storyboard",
  "what": "分镜图",
  "style": "realistic",
  "cli": "lingying",
  "model": "nanobanana2",
  "resolution": "2K",
  "aspectRatio": "9:16",
  "inputData": { "aspect_ratio": "9:16", "resolution": "2K" }
}
```

`resolution` 与 `aspectRatio` 是原样的真源；**`inputData` 是拼好的 lingying 参数**——补一个 `prompt`（要参考图再补 `images`）就能提交。省得每个 skill 各拼各的，拼法一漂就又是一处不一致。

段时长也有一个折算命令——视频模型收的 `duration` 是整数秒且有区间（H3 是 5~15），分镜的段秒数不一定是：

```bash
node scripts/novel-setup.mjs duration 12.5 --model "MiniMax H3"
# → { "duration": 13, "note": "12.5 秒向上取整到 13 秒" }
```

## 六个 skill 的接力

```
novel-setup      → production.json （拿什么拍：模型、画幅、分辨率、画风）
novel-outline    → outline.json    （什么：结构与分集）
novel-characters → cast.json       （谁：角色设定图）
novel-art        → art.json        （哪里：场景与道具设定图）
novel-script     → script.json     （戏：场次、节拍、台词）
novel-storyboard → storyboard.json （怎么拍：镜头、分镜图、批次）
```

`novel-setup` 是唯一一个不产生创作内容的段，它产生的是**所有创作内容要落进的那个容器的形状**。

## 自带样例

- `examples/回南天-production.json`：**竖屏 9:16** 真人实拍、2K、英文提示词、`nanobanana2` + `MiniMax H3 · managed`——AI 短剧最常见的形态
- `examples/雪线-production.json`：**横屏 16:9** 吉卜力、4K、中文提示词、`image-2` + `seedance2.0`（没有变体）——另一头的极端

成片画幅两种、画风两档、档位两档、提示词语言两种、生图模型两个、视频模型两个各出现一次——因为这个 skill 交付的就是「参数可以怎么组合」本身。

## 自测

```bash
node scripts/selftest.mjs
```

195 项断言，不调模型、不碰网络、不花额度。

## 边界

- 不写故事、不出图、不下单给视频模型——只管技术参数。出图是三个出图 skill 的事，下单是 `novel-storyboard` 的事
- **不做档位到像素的换算**：lingying 收的就是档位本身，这一层不存在了
- 创作参数（多少集、多长、什么题材）是 `novel-outline` 的活
