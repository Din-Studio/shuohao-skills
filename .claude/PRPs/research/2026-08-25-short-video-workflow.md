---
date: 2026-08-25T08:39:58Z
git_commit: 0e5eb68
branch: main
repository: shuohao-skills
topic: "这套短视频工作流是如何工作的？"
tags: [research, codebase, short-video, workflow, novel-skills]
status: complete
last_updated: 2026-08-25
---

# Research：这套短视频工作流是如何工作的？

**Date**: 2026-08-25T08:39:58Z  
**Git Commit**: 0e5eb68  
**Branch**: main  
**Repository**: shuohao-skills

## Research Question

这套短视频工作流由哪些组件组成，一本小说如何逐步变成可交给视频生成模型的制作素材，各阶段又如何衔接？

## Summary

这套仓库不是一个常驻的“短视频生成应用”，而是五个供 Claude Code / Codex 读取并执行的自包含 skill。每个 skill 用 `SKILL.md` 和 `references/` 规定模型要完成的语义工作，用零依赖 Node CLI 完成切块、归并、seed、确定性校验、统计、渲染或导出；目录结构明确把这些职责分别放在工作流说明、确定性脚本、参考契约和测试夹具中（[README.md:107-126](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/README.md#L107-L126)）。运行只要求 Node ≥18；图像生成是可选步骤，使用 Codex 内置 imagegen（[README.md:99-105](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/README.md#L99-L105)）。

主数据链是 `outline.json → cast.json / art.json / script.json → storyboard.json → H3 投产包`。大纲固定结构、人物、场景、道具、爽点和分集事实；后续各 skill 的 seed 函数搬运这些已拍板事实，只把本阶段的设计字段留给模型填写（[novel-characters.mjs:470-516](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/scripts/novel-characters.mjs#L470-L516)，[novel-art.mjs:65-121](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-art/scripts/novel-art.mjs#L65-L121)，[novel-script.mjs:299-323](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/scripts/novel-script.mjs#L299-L323)）。分镜再从剧本确定性展开场次和逐拍秒数，由模型完成分段、切镜和提示词（[novel-storyboard.mjs:728-758](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/scripts/novel-storyboard.mjs#L728-L758)）。

最终边界停在角色/场景/道具设定图、分镜关键帧、H3 视频提示词、图片时点映射、配音对齐单和 `manifest.json`；仓库明确不执行视频生成与剪辑合成（[novel-storyboard/SKILL.md:58-60](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/SKILL.md#L58-L60)）。

## Architecture Documentation

```text
小说原文
   │
   ▼
outline.json ───────┬──────────────┬──────────────┐
结构/分集/C-S-P-B ID │              │              │
                    ▼              ▼              ▼
                cast.json       art.json       script.json
                角色与音色       场景与道具      场次/节拍/台词
                    └──────────────┴──────┬───────┘
                                         ▼
                                  storyboard.json
                                  段/切镜/关键帧/H3
                                         │
                                         ▼
                         E01-01/{f*.png,prompt.md} + manifest.json
```

仓库自己的流程描述是“大纲收敛结构，剧本、场景、角色同步迭代，分镜只做输出不做新决定”（[README.md:14-18](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/README.md#L14-L18)）。文件级流程也不是唯一的刚性顺序：角色 skill 有 `outline.json` 时从大纲 seed，没有时可以直接从原文拆角色（[novel-characters/SKILL.md:83-112](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/SKILL.md#L83-L112)）；反过来，outline 也能把此前独立生成的 `cast.json` 当人物原料（[novel-outline/SKILL.md:56-60](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/SKILL.md#L56-L60)）。

五段依靠稳定 ID 和 JSON 契约连接，而不是把名字直接散落到下游数据中。人物使用 `Cxx`，场景使用 `Sxx`，叙事道具使用 `Pxx`，爽点使用 `Bxx`；剧本内部保存 ID，渲染时再用上游 JSON 显示名字（[novel-outline/schema.md:40-84](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/references/schema.md#L40-L84)，[novel-script/schema.md:70-72](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/references/schema.md#L70-L72)）。

## Detailed Findings

### 1. `novel-outline`：先定“拍什么”

这一段输入小说、总集数、单集时长、题材、改编幅度和偏好；长篇先按章节分卷并让多个任务生成卷摘要，短篇或当前会话已经通读时跳过压缩（[novel-outline/SKILL.md:45-89](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/SKILL.md#L45-L89)）。

大纲先生成 `adaptation / characters / scenes / beats` 四块快版骨架，通过 `validate --stage beats` 后，把砍线、合人和 major 爆点落集交给用户确认；确认后才分批生成每批不超过 10 集的 `episodes`（[novel-outline/SKILL.md:91-110](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/SKILL.md#L91-L110)）。这是工作流内置的第一个人工拍板点。

`outline.json` 顶层保存改编说明、人物、场景、爽点和分集；每集通过 `sceneIds / characterIds / propIds` 引用资产（[novel-outline/schema.md:1-15](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/references/schema.md#L1-L15)）。第五件交付“资产清单”不是模型填写，而是 CLI 从所有分集引用自动汇总；SKILL 明确将整个产物定义为“四件模型写、一件脚本算”（[novel-outline/SKILL.md:35-41](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/SKILL.md#L35-L41)）。

完整交付前执行 14 道代码质量门，覆盖角色和主场景上限、叙事道具、爽点间隔、首集钩子、每集三栏、生成难点和引用完整性；失败后修正并重跑（[novel-outline/SKILL.md:111-119](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/SKILL.md#L111-L119)）。输出为 `outline.json`、Markdown 和 HTML 报告（[novel-outline/SKILL.md:121-142](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/SKILL.md#L121-L142)）。

### 2. `novel-characters`：把人物变成可复用角色资产

有大纲时，`seedFromOutline()` 原样搬运角色 ID、名称和人物弧，将 `tier` 映射为 `importance`，同时把别名、画像、图像提示词和音色提示词留空（[novel-characters.mjs:470-516](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/scripts/novel-characters.mjs#L470-L516)）。没有大纲时，小说会先被分块扫描成多个 roster，再按姓名和别名归并；包含关系只形成待复核候选，语义合并由任务复核后再确定性落地（[novel-characters/SKILL.md:114-158](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/SKILL.md#L114-L158)）。

第二趟按角色生成独立卡片，卡片存在即可断点续跑，再由 `assemble` 统一组装 `cast.json`（[novel-characters/SKILL.md:160-188](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/SKILL.md#L160-L188)）。角色卡包含人物画像、原文证据、英文图像提示词和英文 TTS 音色提示词；人读字段跟随报告语言，机器提示词保持英文（[novel-characters/schema.md:26-90](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/references/schema.md#L26-L90)）。

校验器检查结构、角色分档、原文引文逐字存在、提示词不含人名及语言分工（[novel-characters/SKILL.md:190-198](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/SKILL.md#L190-L198)）。可选出图为一人一张 16:9 角色设定图；已有图自动跳过，单人失败不阻断其他角色（[novel-characters/SKILL.md:200-223](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/SKILL.md#L200-L223)）。最终产出 `cast.json`、Markdown、报告和可选 `images/<slug>-sheet.png`（[novel-characters/SKILL.md:225-248](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/SKILL.md#L225-L248)）。

### 3. `novel-art`：把场景和叙事道具变成一致性资产

`seedFromOutline()` 将场景 ID、主场景标记、出现集、承载爽点和复用提示搬入骨架；道具则搬运戏剧功能、出现集和关联爽点，锚点、光照、状态、尺度和图像提示词留给本阶段设计（[novel-art.mjs:74-121](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-art/scripts/novel-art.mjs#L74-L121)）。

每个场景需要 3–5 个可辨识锚点、至少一个光照状态和无人空景提示词；每件叙事道具需要尺度、3–5 个锚点、至少一个状态变体及纯白背景、无人无手提示词（[novel-art/schema.md:39-72](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-art/references/schema.md#L39-L72)）。有 outline 道具表时只补美术字段，没有时才从原文提取有特写、跨集出现且承载剧情的道具（[novel-art/SKILL.md:83-95](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-art/SKILL.md#L83-L95)）。

11 道质量门检查锚点、光照、英文提示词、空景、角色禁名、变体和风格，以及道具状态、尺度、无手与白底（[novel-art/SKILL.md:96-104](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-art/SKILL.md#L96-L104)）。可选出图逐场景/逐道具调用 imagegen，变体场景引用母场景成图；单个失败不阻断（[novel-art/SKILL.md:106-114](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-art/SKILL.md#L106-L114)）。输出为 `art.json`、Markdown、报告和可选设定图（[novel-art/SKILL.md:115-136](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-art/SKILL.md#L115-L136)）。

### 4. `novel-script`：把分集梗概写成可计时、可对账的戏

`outline.json` 是直接上游，默认每批最多 3 集。seed 将单集分钟数换算为目标秒数，并搬运钩子、悬念、该集爽点、候选场景和人物；`scenes` 留空供模型写戏（[novel-script/SKILL.md:62-79](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/SKILL.md#L62-L79)，[novel-script.mjs:307-323](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/scripts/novel-script.mjs#L307-L323)）。

剧本不是散文，而是 `episode → scene → flow`：场次引用 `Sxx/Cxx/Pxx`，`flow` 中每一拍严格二选一——动作或带说话人、台词、语气的对白（[novel-script/schema.md:15-60](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/references/schema.md#L15-L60)）。这使脚本可以按台词字符数和动作拍数确定性估时：台词字符数除以语速，动作拍数乘固定动作秒数，再检查每集是否落在目标容差内（[novel-script/schema.md:62-68](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/references/schema.md#L62-L68)）。

写戏任务同时读取 art 的场景/光照和 cast 的人物性情与说话方式；前一集悬念也传给下一集开场（[novel-script/SKILL.md:81-90](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/SKILL.md#L81-L90)）。10 道质量门检查时长、单句长度、说话人、冷开场钩子、结尾悬念、动作拍、爽点，以及角色/场景/光照/道具对账（[novel-script/SKILL.md:94-103](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/SKILL.md#L94-L103)）。报告还会按角色聚合台词，并在提供 cast 时附带音色提示词，形成可直接接 TTS 的台词本（[novel-script/SKILL.md:105-127](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/SKILL.md#L105-L127)）。

### 5. `novel-storyboard`：把剧本节拍转换成视频生成单元

`script.json` 是硬前提。`seedFromScript()` 把每场的场景、光照、角色、道具和每一拍的类型、文本、说话人、秒数展开到 `seedScenes`，把 `segments` 留空（[novel-storyboard/SKILL.md:64-80](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/SKILL.md#L64-L80)，[novel-storyboard.mjs:732-758](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/scripts/novel-storyboard.mjs#L732-L758)）。

数据是“集 → 段 → 分镜”三层：段对应一次不超过 15 秒的视频生成且不跨场；段内每个 cut 为 2–5 秒，通过 `[起拍, 止拍]` 恰好认领剧本中的连续节拍，并携带景别、运镜、人物、道具和英文关键帧提示词（[novel-storyboard/schema.md:1-7](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/references/schema.md#L1-L7)，[novel-storyboard/schema.md:21-43](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/references/schema.md#L21-L43)）。

每段还有一条 H3 prompt。首行把 Picture 1..N 对齐到各 cut 的累计切点；每个 `[Shot k]` 带对应时刻；被认领的剧本台词逐字进入 `<d>`；声景和配乐在同一提示词内（[novel-storyboard/schema.md:47-69](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/references/schema.md#L47-L69)）。17 道质量门对节拍覆盖、段/切时长、台词容量、角色/道具、风格、运镜、H3 对齐指令、切点和逐字台词执行机械核验；镜头配方是可选的第 17 门（[novel-storyboard/SKILL.md:95-107](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/SKILL.md#L95-L107)）。

关键帧可选调用 imagegen，一切一张；输入参考图由该段场景设定图、画内角色设定图和涉及道具设定图组成，输出为 `<段号>/f<切序>.png`（[novel-storyboard/SKILL.md:109-117](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/SKILL.md#L109-L117)）。`exportPack()` 再为每段写 `prompt.md`，并在根部写 `manifest.json`，记录时长、切点、图片路径和缺图清单（[novel-storyboard.mjs:761-799](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/scripts/novel-storyboard.mjs#L761-L799)）。

### 6. 报告与工作目录

每段独立产生 JSON、Markdown 和 HTML。根目录的 `scripts/report.mjs` 只是组装器：它不 import skill 业务代码，而是逐个调用各 skill 的 `render --html`，再处理 CSS/脚本作用域和图片相对路径（[report.mjs:1-21](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/scripts/report.mjs#L1-L21)）。

组装器按 `outline / characters / art / script / storyboard` 五个目录自动发现 JSON，并把可用的上游路径传给对应 renderer；只存在部分阶段时只生成对应面板（[report.mjs:38-103](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/scripts/report.mjs#L38-L103)，[report.mjs:524-580](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/scripts/report.mjs#L524-L580)）。仓库约定每段产物归入自己的目录，分镜的段目录必须与 storyboard 报告同级，以保持相对图片路径有效（[README.md:136-160](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/README.md#L136-L160)）。

### 7. 安装与执行方式

`scripts/install.sh` 自动检测 `~/.claude` 和 `~/.codex`，把各 skill 目录软链到 agent 的 skills 目录；不指定名称时安装所有包含 `SKILL.md` 的目录，真实目录不会被覆盖（[install.sh:30-66](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/scripts/install.sh#L30-L66)）。因此 agent 在接到“改编大纲、角色设定、美术、剧本、分镜”等任务时读取相应 SKILL 并按步骤调用其 Node CLI。

## Model Work vs Deterministic Work

| 层 | 模型/Agent 完成 | Node CLI 完成 | 证据 |
|---|---|---|---|
| 大纲 | 改编取舍、人物/场景/爽点、分集梗概 | chunk、阶段校验、资产汇总、render | [SKILL.md:74-131](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-outline/SKILL.md#L74-L131) |
| 角色 | roster 语义扫描、合并复核、画像、图像/TTS prompt | chunk、精确归并、assemble、validate、render | [SKILL.md:114-198](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-characters/SKILL.md#L114-L198) |
| 美术 | 场景/道具设计字段与 prompt | outline seed、11 门、render | [SKILL.md:73-104](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-art/SKILL.md#L73-L104) |
| 剧本 | 场次、动作拍、台词 | outline seed、计时、10 门、统计/台词本、render | [SKILL.md:73-116](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-script/SKILL.md#L73-L116) |
| 分镜 | 分段、切镜、frame/H3 prompt | script seed、17 门、切点/批次/配音统计、export/render | [SKILL.md:74-129](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/SKILL.md#L74-L129) |

## Verification

本次在 commit `0e5eb68` 上只读执行了仓库约定的全部 `skills/*/scripts/selftest.mjs`，以及 `scripts/report-selftest.mjs`，全部通过。仓库将每个 skill 的无模型自测列为硬性目录要求，并给出统一执行方式（[README.md:123-132](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/README.md#L123-L132)）；合并报告自测入口记录于 README（[README.md:50-52](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/README.md#L50-L52)）。

## Code References

| File | Lines | Description |
|---|---:|---|
| `README.md` | 12-40, 99-160 | 总体定位、五段职责、环境与目录约定 |
| `skills/novel-outline/SKILL.md` | 45-142 | 大纲参数、两轮骨架、人工拍板、分集与交付 |
| `skills/novel-characters/scripts/novel-characters.mjs` | 470-516 | outline → cast 的确定性 seed |
| `skills/novel-art/scripts/novel-art.mjs` | 74-121 | outline → art 的确定性 seed |
| `skills/novel-script/scripts/novel-script.mjs` | 307-323 | outline → script 的确定性 seed |
| `skills/novel-storyboard/scripts/novel-storyboard.mjs` | 732-799 | script → storyboard seed 与投产包 export |
| `scripts/report.mjs` | 38-103, 524-598 | 五阶段报告发现、依赖注入与组装 |

## Open Questions

代码库范围内的五阶段输入、契约、校验与产物边界均可定位。视频生成、TTS 实际执行、音视频剪辑与成片交付属于本仓库之外的生成管线；本仓库只为这些环节准备提示词、关键帧和对齐清单（[novel-storyboard/SKILL.md:149-165](https://github.com/Din-Studio/shuohao-skills/blob/0e5eb68/skills/novel-storyboard/SKILL.md#L149-L165)）。
