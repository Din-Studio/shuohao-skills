**中文** · [English](README.en.md)

# mint-setup

## v3 创作契约与迁移

production 使用 `schemaVersion: 3`。通过 `init --creative-brief "正文"` 收集可选的自然语言创作要求。提供时必须非空，不解析为枚举、规则或模型参数。show 展示要求，resolve 原样返回 creativeBrief；不要求选择策略。

检查对象统一为 `status: pass/fail/skipped + category + level`，不再输出 ok 布尔值。跳过不计为通过。内容评审未执行时明确说明。开工前阅读 [契约](references/creative-brief.md) 和 [迁移说明](references/migration.md)。

给 AI 短剧统一生产参数：资产图模型、分辨率与比例，视频模型、画幅与档位，以及画风、语言和自动驾驶。参数写入工作目录根的 `production.json`，五个创作阶段分别读取。

**资产图与视频画幅独立**。角色、场景和道具设定图是横构图或方形的参考表；成片可以是竖屏。视频创作直接挂载已有设定图，不生成中间关键帧。

## 使用

```bash
node scripts/mint-setup.mjs caps
node scripts/mint-setup.mjs init --aspect 9:16 \
  --source 回南天 --video-model "MiniMax H3" --video-resolution 768p \
  > <工作目录>/production.json
node scripts/mint-setup.mjs style-template
# 按用户要求填满 production.json 的 style，再校验
node scripts/mint-setup.mjs validate <工作目录>/production.json
node scripts/mint-setup.mjs show <工作目录>/production.json
```

- **成片画幅没有默认值**，必须显式传入 `--aspect`。它只设置视频比例。
- 资产图默认 `nanobanana2`、`2K`、`16:9`。可通过 `--image-model`、`--asset-resolution`、`--asset-aspect` 调整。
- **画风没有默认值或预设类型**。`init` 留下空骨架；使用 `--style <style.json>` 可以载入已写好的画风。
- 画风短语 `style.phrase` 供 Seedance 等模型指南使用。角色与环境画风分别存入 `style.character` 和 `style.scene`。更换画风时整套更换，正向要求不能同时写进反向词。
- 报告语言默认中文，`--lang en` 可设为英文。提示词语言通过 `--prompt-lang` 设置，视频阶段按模型规则处理。
- 本 skill 不生成 HTML 报告，不调用模型。Node 18+，无 npm 依赖。

## 参数与质量门

完整结构见 [references/schema.md](references/schema.md)。**9 道检查（含 v3 契约）全部由代码执行**：

| 检查项 | 内容 |
| --- | --- |
| document-contract | schemaVersion=3、可选非空 creativeBrief、拒绝废弃配置 |
| fields | 字段齐全、语言枚举合法、自动驾驶是布尔值 |
| aspect-format | 资产图与视频比例均为固定 `W:H`，不接受 `adaptive` |
| asset-landscape | 资产图横构图或方形 |
| resolution-filled | 分辨率档位已填 |
| video-model | 视频模型、档位与比例兼容 |
| model-caps | 资产图模型、档位与比例兼容 |
| style-blocks | 画风名称及角色、环境正文完整 |
| style-coherent | 正反向要求不矛盾 |

模型能力表保留历史采集来源与 UUID，只做离线检查。表外模型明确跳过能力检查。生成前通过已安装 ly-image / ly-video 的 models --model 查询实时 schema，不把快照当成当前能力。

**视频画幅不限制资产图模型**：`nanobanana2` 不收 `4:3` 资产图，但仍可搭配支持 `4:3` 的视频模型。`image-2` 的 `4K` 资产图只收 `16:9` / `9:16`。

## 下游与自动驾驶

详细交接见 [references/contract.md](references/contract.md)。

```text
mint-setup      → production.json
mint-outline    → outline/
mint-characters → characters/
mint-art        → art/
mint-script     → script/
mint-creation   → creation/
```

下游从产物目录向上最多 5 层查找参数。各 skill 不 import 本 skill 的代码，可以单独拷走。找不到生产参数时必须说明跳过的检查，画风没有默认值可回退。

`init --autopilot` 开启自动驾驶，默认关闭。开启后五个创作阶段各自跑完整段、不等待逐步审批，但质量门、费用预估和失败止损不变。只认 JSON 布尔值 `true`。本阶段仍要确认画幅、视频模型与画风。

```bash
node scripts/mint-setup.mjs resolve --for characters
node scripts/mint-setup.mjs resolve --for art
node scripts/mint-setup.mjs resolve --for video
node scripts/mint-setup.mjs duration 12.5 --model "MiniMax H3"
```

`resolve` 输出模型、比例、档位与结构化 `inputData`；视频还返回时长范围。调用方补充提示词、参考图 URL 和逐段时长。角色与美术只返回各自需要的画风块，视频返回名称与画风短语。

## 样例与自测

- `examples/回南天-production.json`：竖屏、真人实拍、2K 资产图、英文提示词、自动驾驶关闭。
- `examples/雪线-production.json`：横屏、手绘动画、4K 资产图、中文提示词、自动驾驶开启。

两套画风是样例，不是可选范围。样例也是自测夹具，不依赖其他 skill 的数据。

```bash
node scripts/selftest.mjs
node scripts/migration-selftest.mjs
node scripts/upstream-selftest.mjs
```

自测不调用模型、不访问网络、不花额度。旧配置中的 `image.frame` 不再读取，新配置不再生成该字段。`style.phrase` 保留供视频提示词指南使用。
