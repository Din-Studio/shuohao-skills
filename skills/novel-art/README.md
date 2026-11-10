**中文** · [English](README.en.md)

# novel-art

## v3 上游契约与迁移

seed 只接受显式 `outline.schemaVersion: 3`；production 同样要求 `schemaVersion: 3`。读取可选非空 `production.creativeBrief`，不解释策略配置。人物来源、弧光、节点分类与位置可以省略。缺 production 时仅跳过上游对账；提供损坏上游、旧配置或缺视觉正文的 production 必须失败。资产输出与媒体计划协议不变。

检查对象统一为 `status: pass/fail/skipped + category + level`，不再输出 ok 布尔值。跳过不计为通过。内容评审未执行时明确说明。开工前阅读 [契约](references/creative-background.md) 和 [迁移说明](references/migration.md)。

给 AI 短剧出**美术设定集**：场景 + 叙事道具。前提刻在骨子里：**这是 AI 生成，不是实拍**——没有堪景、搭景、置景采买，环境和道具都是要被生成几十次还得长一样的资产。交付物不是置景清单，是一致性方案。

**场景层**：

- **设计意图** — 这个空间为哪场戏存在，不是户型说明
- **一致性锚点**（每景 3–5 个） — 每次生成必现的可辨识特征（补丁船篷、断裂的第七块桥板）。观众靠它认场景，QC 靠它核对生成镜头有没有漂
- **光照时段变体** — AI 换时段是**重新生成不是重新打灯**，每个状态落成完整英文提示词
- **变体机制** — `variantOf` + `changes` 把衍生场景挂在母场景上，出图拿母场景成图当参考

**道具层**（只收**叙事道具**：有特写、跨集、承载剧情，通常 3–8 件）：

- **戏剧功能** — 留言板是代存的私人物件、铁盒用于核对纸条归属——先说它在剧里干什么
- **状态变体** — 合上/打开、藏着/摊开：道具有状态弧，每个状态一张参考图
- **尺度参照** — 手持级/桌面级/家具级，英文短语写死进提示词——AI 把手持道具画成家具尺寸是高频事故
- **白底无手** — 道具图要被贴进各种镜头，必须纯白可抠；拿着道具的手是最常见污染

场景陈设归场景锚点、一次性手部道具镜头级提示词解决——都不单独建资产。

产出 `art.json` + Markdown + 一个双击就能开的 `art-report.html`。报告界面默认中文；render 加 `--lang en` 输出全英文界面（或在 art.json 顶层写 `"lang": "en"`，`--lang` 优先）： 英文界面下质量门标签同样翻译（阈值原样），门的失败详情与数据内容保持原文。

报告截图尚未更新；当前报告请从《雨棚留言》样例重新渲染。

## 质量检查：代码执行，跳过单列

与仓库里另外五个 skill 同一主张：**checklist 交给模型自觉是靠不住的**。

| 检查项 | 规则 |
| --- | --- |
| 一致性锚点 | 3–5 个（场景与道具同规） |
| 光照状态 | 每景 ≥1 且落成英文提示词 |
| **无人** | 反向提示词禁人（场景与道具都查） |
| 提示词语言 | 全部英文 |
| 提示词不含角色名 | `validate --cast cast.json` 才查；不给就**明说跳过** |
| 变体引用完整 | `variantOf` 指向存在的场景且带 `changes` |
| **道具状态** | ≥1 且落成英文提示词 |
| **道具尺度** | scale 枚举对应的英文短语必须出现在提示词里 |
| **道具无手** | 反向提示词禁 hands/fingers |
| **道具白底** | 设定图必须 pure white background |
| **画风整块用上** | 工作目录根有 `production.json`（`novel-setup` 的产出）就查：`style.scene` 的渲染句原样进了 `sheet` 与 `prompt`、反向词一条不落地进了场景的反向词。找不到那份文件**明说跳过** |
| **设定图画幅与生产参数一致** | `image.sheet` 里的版面画幅必须是 `image.asset.aspectRatio`。**资产图和成片画幅是两件事**——成片竖屏，设定图仍然横构图，L 形版面靠横向铺开 |

自测里每道门都有**击穿用例**——证明它真的会拦。

## 跟另外几个 skill 的接力

```
novel-setup      → production.json （拿什么拍：模型、画幅、分辨率、画风）
novel-outline    → outline.json （什么：结构与分集）
novel-characters → cast.json    （谁：角色资产）
novel-art        → art.json     （哪里 + 手里拿的：美术资产）
```

- `seed <outline.json>` 确定性预填场景与道具两张清单，连出现集、关联剧情节点一起搬；大纲没有 `props` 时道具留空，模型按 `prop-pass.md` 从原文提取
- `validate --cast <cast.json>` 用角色表查提示词里有没有混进角色名
- 画风不内置：读 `production.json` 的 `style.scene`。它与 `style.character` 是同一个画风的两种落地——环境的真实感来自用旧的材质，不是皮肤毛孔

## 命令行直接用

```bash
node scripts/novel-art.mjs seed outline.json > art.json      # 从大纲预填场景骨架
node scripts/novel-art.mjs validate art.json --cast cast.json
node scripts/novel-art.mjs checkup art.json                  # 只跑质量门
node scripts/novel-art.mjs render art.json --html            # 出报告（界面默认中文）
node scripts/novel-art.mjs render art.json --html --lang en  # 英文界面报告
node scripts/novel-art.mjs style                             # 看这部剧的画风（场景那一块）
```

`render` 支持与 `validate/checkup` 相同的 `--cast cast.json`：未提供时明确跳过禁名检查；提供损坏或不可读文件时失败。自动挂图仅影响显示，导出 JSON 保持输入原值。

## 出图（可选）

```bash
node scripts/novel-art.mjs images art.json              # 仅导出离线计划
node scripts/novel-art.mjs images art.json --dry-run    # 只看要提交什么
node scripts/novel-art.mjs images art.json --out image-plan.json # 保存计划，不生成图片
```

走 **ly-image**（灵影网关）。场景和道具各一张设定图，版面都是**主视角大图 + 底部和右侧的 L 形细节边框**：场景细节格放锚点特写，道具细节格放锚点特写 + 其他状态 + 侧面。场景**无人**；道具另加**无手、纯白背景**。没有 ly-image 就只交提示词，其余照常。

本地命令只导出计划。阅读 [生成交接](references/media-handoff.md)，再使用独立安装的 ly-image 完成模型发现、预览、生成与任务恢复。下载核验后放到计划 output 路径再 render。独立创作、校验和导出计划不依赖外部 skill。

## 自动驾驶（autopilot）

工作目录根的 `production.json`（`novel-setup` 的产出）顶层写着 `"autopilot": true` 时，本 skill 的全部流程**一口气跑完**：不问用哪份输入，道具清单自己定，场景与道具设定图一次出全，做过的决定全部写进最后的汇报。

**转移的是审批权，不是取消检查点**：确定性检查照样要过、拿到图照样核对锚点（无人、无手、纯白背景）——只是不再等人点头。字段写着 `false`、整个没写、或者根本没有 `production.json`，就是原来的样子（该问就问）。跑 `validate` 时找到生产参数并且开着，会打印一句 `↳ 自动驾驶：开启`。

## 文件

```
SKILL.md                 给 agent 读的工作流
scripts/
  novel-art.mjs          seed / validate / checkup / images / render / style / slug
  lib/media-plan.mjs    离线交接计划，不调用网关
  selftest.mjs           278 项原功能断言与新增契约回归，不调模型、不发请求
references/
  schema.md              art.json 结构 + 硬规则
  scene-pass.md          怎么填场景设定（AI 短剧的思路）
  prop-pass.md           怎么选、怎么填叙事道具
  realism.md             真实感怎么落进提示词（写实档全套，其余画风只取通用那半边）
  sheet.md               设定图的版面与提示词（生成交给 ly-image）
  report-style.md        报告的设计约定
examples/
  雨棚留言-art.json           《雨棚留言》三场景 + 两件道具样例，全部质量门通过
assets/
  report.webp            报告截图
```

## 自测

```bash
node scripts/selftest.mjs
node scripts/v3-selftest.mjs
node scripts/upstream-selftest.mjs
```

离线自测覆盖创作契约、渲染和交接计划，包括参考依赖、提示词原文、文件检查和退役选项。不调用网关或模型。

**只在 macOS + Node 24 上实测过。** 代码没有平台相关调用，Linux 和更低版本 Node 理论上没问题，但**没验过**。

正式样例先阅读 `examples/雨棚留言-故事提案.md`（schema 阅读者从 skill 根目录定位）。独立水池场景不要求 reusePlan；节点关联包含 event 和 turn，不伪造 payoff。当前资产不含真实生成图片。

## 独立样例运行

以下输入全部属于《雨棚留言》。outline-v3 文件仅用于资产消费投影测试，不是完整大纲交付。

```bash
node scripts/novel-art.mjs validate examples/雨棚留言-art.json --production examples/雨棚留言-production.json --cast examples/雨棚留言-cast-names.json
node scripts/novel-art.mjs render examples/雨棚留言-art.json --production examples/雨棚留言-production.json --cast examples/雨棚留言-cast-names.json --html
```
无需安装其他 skill，也不需要真实图片。生成的 HTML 不进入版本控制。
