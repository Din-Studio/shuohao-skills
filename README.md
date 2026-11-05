**中文** · [English](README.en.md)

> 👋 **找工作 / 合作** — 作者目前在空窗期，这个仓库就是业余的一点小探索。
> 有缘的朋友欢迎联系。**远程工作**之外，也接受**半合作**——每月几千块生活费 + 利润分成。如有必要，FED的话，也是可以考虑到场出差。希望在AI浪潮下，能找到同频朋友一起做点事情。
> 个人简历：**[resume.79px.com](https://resume.79px.com)**
> 
> 我建了一个 **AI 短剧交流群**（付费），聊 AI 短剧的工作流、工具和实操。
> 有兴趣的加我：**微信 `hao_dev`**，添加时**备注 `github`**。
>
> <img src="assets/wechat.png" alt="烁皓微信二维码" width="180">

# shuohao-skills

**AI 短剧制作的 skill 集合**：从一本小说到直接喂生成管线的制作素材——定生产参数、拆角色、排大纲、出场景与道具设定、写剧本、切分镜、参考图直出视频。给 AI 编码 agent 用，**pi、Claude Code、codex 都能跑**。

整条管线长这样——**生产参数先定死画幅与模型，改编大纲收敛结构，剧本、场景、角色三者同步迭代，视频创作按剧本分段切镜，直接挂载已有设定图**：

<img src="assets/pipeline.svg" alt="AI 短剧制作流程图" width="680">

| Skill | 做什么 |
| --- | --- |
| [**novel-setup**](skills/novel-setup) | 定生产参数：资产图模型、分辨率与比例，视频模型、画幅与档位，以及画风、语言与自动驾驶开关。写入工作目录根的 `production.json`，供五个创作 skill 读取。资产图与视频画幅独立，8 道质量门全部脚本检查 |
| [**novel-outline**](skills/novel-outline) | 把一本小说改编成短剧大纲五件套：改编说明、人物表、爽点表、分集梗概、资产清单（含叙事道具表）。14 道质量门全部脚本检查，支持已有大纲的体检模式 |
| [**novel-characters**](skills/novel-characters) | 把大纲定下的角色做成角色设定集：人物画像、形象提示词、音色提示词、角色设定图。吃 outline.json 预填角色表，报告语言可选，画风整块取自 `production.json`。**出图是一条 `images` 命令**——提交、轮询、落盘、断点续传全在脚本里，`--style-ref auto` 拿第一张压住画风漂移 |
| [**novel-art**](skills/novel-art) | 给 AI 短剧出美术设定集（场景 + 叙事道具）：一致性锚点、光照与状态变体、尺度参照、无人无手白底提示词。吃 outline.json 预填清单，12 道质量门全部脚本检查。**出图是一条 `images` 命令**——提交、轮询、落盘、断点续传全在脚本里，参数不经过 shell，不靠模型现拼 bash |
| [**novel-script**](skills/novel-script) | 给 AI 短剧写剧本：场次 + 节拍流（动作与台词交替），逐集时长按语速确定性折算，钩子前 3 拍冷开场兑现是门，台词本按角色聚合带音色提示词直接对接 TTS。10 道质量门全部脚本检查 |
| [**novel-creation**](skills/novel-creation) | 参考图直出视频：按剧本分段、切镜，直接挂载已有的角色、场景与道具设定图，不生成中间分镜图。视频提示词按模型选择结构，`export` 输出投产包，`videos` 编排下单、轮询与落盘。16 道质量门全部脚本检查 |

**五个创作 skill 的报告都支持中英双语界面**：默认中文，`render --lang en` 出全英文报告（数据内容保持原文）。界面语言也可以在 `production.json` 里一处定死。

**要一路跑到底不被打断**，就在 `production.json` 里打开自动驾驶（`novel-setup init --autopilot`）：五个创作 skill 读到 `"autopilot": true` 就各自把自己那一段一口气跑完——不提问、不等拍板，该做的决定自己做，做过的决定全部写进汇报。**转移的是审批权，不是取消检查点**：质量门照样是门、花钱前照样先算账、失败的止损照样止损。默认是关的。

## 合成一张单页

五段的报告可以合成一张单页，左侧导航切换——**有哪几段就出哪几个面板**：

```bash
node scripts/report.mjs --from <demo目录> --out report.html
```

`--from` 按下面的[工作目录约定](#工作目录约定)自动发现五份 json；也可以逐个指定（`--outline` `--cast` `--art` `--script` `--creation`）。只跑了角色那一段就只有一个面板，不报错。`production.json` 不参与合成——它是参数不是产物，`novel-setup show` 就够看。

它是**组装器，不是独立 skill**：不 import 任何 skill 的代码，而是调各自的 `render --html` 拿产物再拼装。五个创作 skill 各自提供渲染入口，仍然独立可跑、可以单独拷走；某个 skill 改了渲染，这边自动跟上。

合并时处理三件事——**这三件都在组装器里做，不侵入 skill**：

- **样式串味**。各报告存在同名不同定义的类（`.copy` `.kpis` `.badge` `.chip`……），所以给每份样式的每条选择器加作用域前缀
- **脚本串味**。各报告的脚本都是 `document.querySelector('.expo')` 这种全局查询，合成一页后只会命中第一个——五个导出按钮会全废。做法是给每份脚本套一层作用域代理
- **图片路径**。各报告的图相对自己那份 json 的目录（`images/…`、`../art/images/…`），合成后按输出文件的位置重算

默认一次显示一个面板。左下角「平铺全部」把所有面板同时展开，Cmd+F 恢复全局搜索。数字键 `1`–`5` 切面板，`#pane-script` 这样的深链可以直接分享到某一屏。

```bash
node scripts/report-selftest.mjs   # 合并器单元测试
node scripts/pipeline-selftest.mjs # 真实渲染、交互适配与隔离安装测试
```

丢一本小说进去，出这五套（技术参数由 `novel-setup` 先定死）：

**novel-outline · 短剧改编大纲**

![短剧改编大纲报告](skills/novel-outline/assets/report.webp)

**novel-characters · 角色设定集**

![角色设定集报告](skills/novel-characters/assets/report.webp)

**novel-art · 美术设定集（场景 + 道具，设定图为 skill 实际生成）**

![美术设定集报告](skills/novel-art/assets/report.webp)

**novel-script · 剧本（时长仪表 + 分集剧本 + 台词本）**

![剧本报告](skills/novel-script/assets/report.webp)

**novel-creation · 视频创作（分段切镜、参考图挂载、视频提示词与下单）**

自带《收书人》样例与离线报告渲染，详见 [novel-creation](skills/novel-creation)。

## 安装

```bash
git clone https://github.com/eternityspring/shuohao-skills.git
cd shuohao-skills
./scripts/install.sh
```

自动检测本机安装了 pi、Claude Code 还是 codex，把所有 skill **软链**过去——`git pull` 之后立刻生效，不需要重新安装。更新到本版本后，请执行一次安装脚本，清理指向本仓库的退役 skill 软链；真实目录与其他来源软链不会删除。

```bash
./scripts/install.sh novel-characters   # 只安装某一个
./scripts/install.sh --codex            # 只安装到 codex
./scripts/install.sh --pi               # 只安装到 pi
./scripts/install.sh --uninstall        # 取消软链
```

不想用脚本就自己链：

```bash
ln -s "$PWD/skills/novel-characters" ~/.claude/skills/novel-characters
ln -s "$PWD/skills/novel-characters" ~/.codex/skills/novel-characters
ln -s "$PWD/skills/novel-characters" ~/.pi/agent/skills/novel-characters
```

**pi 还有第二条路**：把整个仓库当成 pi 包安装，六个 skill 一次全进来，`git pull` 同样立刻生效：

```bash
pi install /path/to/shuohao-skills                        # 本地目录
pi install git:github.com/eternityspring/shuohao-skills   # 直接从 GitHub
```

仓库根的 `skills/` 就是 pi 的约定目录，**不需要 `package.json`**。安装完 `pi config` 里可以逐个开关。

## 三个 agent 的差别

工作流、脚本、产出三家完全一样，不同的只有两处——**都不影响结果，只影响怎么打命令和跑多快**：

| | pi | Claude Code | codex |
| --- | --- | --- | --- |
| skill 命令 | `/skill:novel-outline` | `/novel-outline` | `/novel-outline` |
| 子代理并发 | **没有**——内核不带子代理，也没有内置待办与后台 bash | Task | subagent |

直接用中文说「帮我拆一下这本书的角色」并给出路径，三家都能唤起，与打命令等价。

SKILL.md 里凡是写着「有子代理就并发」的步骤，在 pi 里就是当前会话顺着做一遍：80 万字的小说拆角色会慢好几倍，但归并、质量门、报告一个字都不差。**出图与生视频那种「并发提交」跟子代理无关**——那是提交完不等待、拿一串 task_id 统一轮询，pi 照样这么做。

## 前置条件

| | 必需？ | 说明 |
| --- | --- | --- |
| **Node** | 必需 | ≥ 18。skill 的脚本只用标准库，**没有 npm 依赖，不需要 install** |
| **模型额度** | 必需 | 写文本的部分用你当前会话的额度，**不需要任何 API key** |
| **lingying CLI** | 可选 | **出图与生视频**才用得上。安装在 PATH 里（或放在工作目录的 `bin/lingying`），凭证写进 `~/.config/lingying/config.json`（`api_key`；挂参考图还要 `assethub_admin_token`）。没有就跳过出图与下单，其余产出照常 |

## 仓库约定

每个 skill 一个目录，**自包含、可以单独拷走**：

```
skills/<skill-name>/
├── SKILL.md          给 agent 读的工作流（必需）
├── README.md         给人读的说明
├── scripts/
│   ├── <name>.mjs    确定性工具，零依赖
│   └── selftest.mjs  自测，不调模型（必需）
├── references/       按需加载的详细指令
├── examples/         自带样例，同时当测试夹具
└── assets/           截图
```

两条硬要求：

- 每个 skill 必须有 `SKILL.md`
- 每个 skill 必须有 `scripts/selftest.mjs`，**不调用模型、不花额度**，覆盖全部确定性逻辑

加新 skill 之前，先把全部自测跑一遍：

```bash
for f in skills/*/scripts/selftest.mjs scripts/*-selftest.mjs; do node "$f" || exit; done
```

没有配 CI——自测足够快（1 秒），本地跑一次比等 CI 更省事。**已在 macOS + Node 22/24 上验证**；代码没有平台相关调用，Linux 和更低版本 Node 理论上没问题，但没验。

## 工作目录约定

把一本小说从头跑完五段（大纲 → 角色 → 美术 → 剧本 → 视频创作），会产出大量 `*.json` / `*.md` / `*-report.html`。**不要平铺在根目录**，按五个 skill 各建一个目录归档，一眼对应流水线五段：

```
<demo>/
├── production.json ← novel-setup 产出：生产参数，**住在根目录**，下游向上找它
├── outline/       ← novel-outline 产出：<剧>-outline.json / .md / -report.html
├── characters/    ← novel-characters 产出：<剧>-cast.json / .md / -report.html
├── art/           ← novel-art 产出：<剧>-art.json / .md / -report.html
├── script/        ← novel-script 产出：<剧>-script.json / .md / -report.html
├── creation/      ← novel-creation 产出：<剧>-creation.json / .md / -report.html
│   ├── manifest.json  ← export 产出（每段的参考图挂载清单，不复制设定图文件）
│   └── E01-01/…       ← 每段一个文件夹（prompt.md + 下单后的 video.mp4，没有分镜图）
├── docs/          ← 自己写的使用说明、PR 草稿等（与机器产物解耦）
└── scripts/       ← 跑管线的辅助脚本（探索期脚本用 _ 前缀保留溯源）
```

约定要点：

- **`production.json` 住在根目录，不进子目录**——它是整部剧共用的技术参数，五个下游 skill 从自己的输出目录**向上最多 5 层**找它。放进某个子目录，别的 skill 就找不到了
- **每个 skill 一个目录**，装它自己的 `json` / `md` / `html` 三件套，加新角色/场景只往对应目录放，不污染根目录
- **视频投产包归 `creation/`**：`manifest.json` 与 `E01-0x/` 同级。参考图仍住在 `characters/images/` 与 `art/images/`，通过相对路径引用，不复制为分镜图。
- **报告 HTML 可由 `render` 重跑再生，图与视频可按提示词重出**——进版本控制时建议只提交 `json` / `md` / `docs` / `scripts`，报告 HTML 和段文件夹里的 `png` / `mp4` 用 `.gitignore` 排除，保持仓库轻量
- 用法类文档（如各报告的使用说明）放 `docs/`，与 skill 自动生成的产物分开，方便单独维护

**五个 skill 各自会核对落点**：`validate` 找到 `production.json` 就顺带比对产物在不在自己那一格，放错了点名该去哪。落点写错不用重出图，所以是提示不是门；但不说出来更坏——`--from` 自动发现按段目录名找 JSON，平铺在根目录它一份也找不到。没有 `production.json` 的老项目、单跑某一段的场合无从判断工作目录根在哪，那时明说跳过。

**`novel-creation` 是剧本之后的视频创作阶段**，接入五段合并报告，也支持独立 `render --html`。合并报告渲染这一阶段需要 `--script`；同时提供 `--outline`、`--art` 与 `--cast` 可补全参考图身份与展示。

> 这套结构来自《渡口》端到端 demo 的实际归档经验，demo 的工作目录在本仓库之外，这里固化成约定，并由五个 skill 各自核对。


## License

[Apache 2.0](LICENSE)
