# 下游契约 · 五个创作阶段

`production.json` 是跨阶段参数的唯一来源。下游直接读取 JSON，不 import 本 skill 的脚本；每个 skill 必须可以单独拷走。

## 查找与产物落点

从自己的产物目录向上最多 5 层查找，找到第一份 `production.json` 即停止。

```
<工作目录>/
├── production.json
├── outline/
├── characters/
│   └── images/
├── art/
│   └── images/
├── script/
└── creation/
    ├── manifest.json
    └── E01-01/
        ├── prompt.md
        └── video.mp4
```

| 阶段 | 产物 |
| --- | --- |
| mint-outline | `outline/<剧名>-outline.json`、Markdown、报告 |
| mint-characters | `characters/<剧名>-cast.json`、Markdown、报告、设定图 |
| mint-art | `art/<剧名>-art.json`、Markdown、报告、设定图 |
| mint-script | `script/<剧名>-script.json`、Markdown、报告 |
| mint-creation | `creation/<剧名>-creation.json`、Markdown、报告、投产包与视频 |

报告组装器按这五个目录发现 JSON。creation 报告直接引用 `../characters/images/` 和 `../art/images/`，不复制设定图作为关键帧。移动目录时必须保持这些相对关系。

下游 `validate` 找到生产参数后核对产物落点，放错时指出正确目录。这是提示，不是质量门。没有生产参数时无法判断工作目录根，明确跳过，不猜。

临时分卷摘要与候选角色卡放各阶段自己的 `.work/`。报告 HTML 可以重新渲染，不进入版本控制。

## 创作要求

先读 [creative-brief.md](creative-brief.md)。production 的 creativeBrief 是唯一项目创作要求。各阶段读取原文，不建立选择、版本或摘要快照。独立 outline/script/creation 可以有本地 creativeBrief；接入项目时与项目要求同时存在必须提示人工合并，再删除阶段副本。要求变化后由 Agent 重新评审受影响内容，结构检查通过不表示内容已重新评审。

## 参数消费者

| 阶段 | 读取内容 | 行为 |
| --- | --- | --- |
| mint-outline | `lang`、`autopilot` | 报告语言与流程审批 |
| mint-characters | `style.label`、`style.character`、`image.model`、`image.asset.*`、`lang`、`autopilot` | 角色设定图风格、版面与生成参数 |
| mint-art | `style.label`、`style.scene`、`image.model`、`image.asset.*`、`lang`、`autopilot` | 场景与道具设定图风格、版面与生成参数 |
| mint-script | `lang`、`autopilot` | 报告语言与流程审批 |
| mint-creation | `style.phrase`（提示词指南）、`video.*`、`lang`、`promptLang`、`autopilot` | 视频模型、段时长边界、提示词结构、投产包与下单 |

**画风只在生产参数中维护**。角色与环境使用各自正文；视频画风由参考图继承；Seedance 提示词指南还要求按 `style.phrase` 补充收尾段风格约束。它不是关键帧配置，也不是额外质量门。

### 需要重出图的参数

- 角色卡的 `image.sheet` 与 `image.prompt` 必须含 `style.character.render` 原句，反向提示词带全该块的 `negative` 词条。
- 美术卡遵循 `style.scene`。反向词完整性只对场景检查；道具的白底要求与部分环境反向词冲突，不能照搬。
- 资产图版面画幅必须遵循 `image.asset.aspectRatio`。
- 生成调用必须带上 `image.model`、`image.asset.resolution` 和资产图比例。
- 视频画幅独立读取 `video.aspectRatio`，不得拿它限制资产图模型。

找不到参数文件可跳过历史上游对账；找到文件但画风块未填必须失败。下游没有默认画风可回退。空画风应先返回本阶段补齐，不能把“跳过检查”称为“校验通过”。

### 自动驾驶

`autopilot` 只认 `doc?.autopilot === true`。省略按关闭处理，字符串 `"true"` 不算开启；本阶段 `fields` 门会拒绝非布尔值。

开启后，五个创作阶段各自完成整段流程，不等待逐步拍板，并在汇报中记录决定。但以下三条不变：

1. 质量门不通过必须修正。
2. 付费调用前仍要预估并报告花费。
3. 同段连续失败两次仍要停止该段、记录结果，不能无限重试。

开工前读取参数，不要等第一次 `validate` 才发现自动驾驶已经开启。`mint-setup` 自身仍需确认画幅、视频模型和画风。

### 语言

报告语言优先级：`--lang` > 产物 JSON 的 `lang` > `production.json` 的 `lang` > `zh`。

`promptLang` 是提示词语言配置，视频创作阶段按模型规则继承与解析，不等同于报告语言。

## resolve 参数输出

```bash
node scripts/mint-setup.mjs resolve --for characters
node scripts/mint-setup.mjs resolve --for art
node scripts/mint-setup.mjs resolve --for video
```

可加 `--from <目录>` 指定查找起点。阶段只有 `characters`、`art`、`video`。

- 角色阶段返回 `style.label`、`style.phrase` 与 `style.character`，另返回 `creativeBrief` 原文（提供时）。
- 美术阶段返回 `style.label`、`style.phrase` 与 `style.scene`，背景范围同角色阶段。
- 视频阶段返回画风名称与短语及 `creativeBrief` 原文（提供时），不返回角色或环境正文。
- `resolution` 与 `aspectRatio` 保留配置原值，`inputData.resolution` 规范化为已知枚举的大小写。
- 视频返回 `durationRange`；逐段 `duration` 不在这里固定。

`inputData` 是结构化参数，不是提示词。出图调用补充 `prompt`、独立的 `negative_prompt`，需要参考图时补充 `images` URL 数组。本地图片先上传得到 URL；不要把像素尺寸或调用指令塞进提示词。

## 视频投产包

视频创作阶段把有效视频模型、比例与分辨率写入 `manifest.json`，并写入每段 `prompt.md` 的参数表。提示词描述镜头；挂载清单标识已有角色、场景和道具设定图。

视频模型接收整数秒且有范围：

```bash
node scripts/mint-setup.mjs duration 12.5 --model "MiniMax H3"
# { "duration": 13, "note": "12.5 秒向上取整到 13 秒" }
```

向上取整、限制到模型区间、发生调整时说明原因。超长段应先重新拆分，不能用截短生成时长代替剧情覆盖。

模型专属字段不进入通用生产参数。能力表按模型 schema 的默认配置记录；下单时另行核对专属字段。

## 旧参数

旧文件中的 `image.frame` 不再参与校验、解析或展示。可以删除该冗余字段；无需重出已有设定图，也不自动转换旧投产包。新文件只生成当前契约字段。
