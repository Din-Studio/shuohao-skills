# art.json 结构

## v3 上游契约与迁移

seed 只接受显式 `outline.schemaVersion: 3`；production 同样要求 `schemaVersion: 3`。读取可选非空 `production.creativeBrief`，不解释策略配置。人物来源、弧光、节点分类与位置可以省略。缺 production 时仅跳过上游对账；提供损坏上游、旧配置或缺视觉正文的 production 必须失败。资产输出与媒体计划协议不变。

检查对象统一为 `status: pass/fail/skipped + category + level`，不再输出 ok 布尔值。跳过不计为通过。内容评审未执行时明确说明。开工前阅读 [契约](creative-background.md) 和 [迁移说明](migration.md)。

美术设定集（场景 + 叙事道具）的载体。**模型只填设计字段**，场景与道具的出现集、关联剧情节点都由 `seed` 从 outline.json 搬运；大纲没有 `props` 时道具表留空，由模型按 `prop-pass.md` 从原文提取。Markdown 和报告由 `render` 渲染。

```json
{
  "source": "雨棚留言",
  "scenes": [{
    "id": "S01", "name": "菜摊雨棚", "primary": true,
    "summary": "设计意图：这个空间讲什么故事……",
    "anchors": [{ "name": "棚沿水痕", "desc": "……" }],
    "lighting": [{ "state": "晨雾", "prompt": "dense white morning fog ..." }],
    "image": { "prompt": "…", "negativePrompt": "…", "sheet": "…", "tags": [] },
    "usage": { "episodes": [1, 3], "beats": ["清理"] }
  }],
  "props": [{
    "id": "P01", "name": "旧留言板", "scale": "手持级",
    "summary": "戏剧功能：代存的私人物件归还……",
    "anchors": [{ "name": "绿色边框", "desc": "……" }],
    "states": [{ "state": "合上", "prompt": "the message board with paper slips ..." }],
    "relatedScenes": ["S01"], "carriedBy": ["许桂兰"],
    "image": { "prompt": "…", "negativePrompt": "…", "sheet": "…", "tags": [] },
    "usage": { "episodes": [1, 3], "beats": ["清理"] }
  }]
}
```

## 顶层

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `source` | 是 | 剧名/书名 |
| `scenes` | 是 | 场景数组 |
| `props` | 否 | **叙事道具**数组——只收有特写、跨集、承载剧情的（3–8 件为宜），场景陈设归场景锚点。选法见 `prop-pass.md` |

**顶层没有 `style` 字段。**画风住在工作目录根的 `production.json`，`art.json` 里再抄一份就是第二个来源，两个来源必然会漂。跑 `node scripts/novel-art.mjs style` 取这部剧的 `style.scene` 那一块。老产物里还留着这个字段的，`validate` 会点名让删掉。

## 单个场景（以校验器为准）

| 字段 | 必填 | 语言 | 说明 |
| --- | --- | --- | --- |
| `id` | 是 | — | `S01` 格式，全局唯一。用 seed 时沿用 outline 的场景 id |
| `name` | 是 | 中文 | 场景名 |
| `primary` | 是 | — | 是不是主场景 |
| `summary` | 是 | 中文 | **设计意图**：这个空间讲什么故事、要什么感觉，不是户型说明 |
| `anchors` | 3–5 个 | 中文 | **一致性锚点** `{name, desc}`：每次生成都必须出现的可辨识特征。认场景靠它，QC 生成镜头也靠它 |
| `lighting` | ≥1 个 | state 中文 / prompt 英文 | **光照状态**：AI 换时段是重新生成不是重新打灯，每个状态必须落成完整提示词 |
| `image.prompt` | 是 | **英文** | 主视角单图提示词，**必须写明空景无人** |
| `image.negativePrompt` | 是 | **英文** | **必须禁人**（people/figure/…），这是空景的硬保证 |
| `image.sheet` | 是 | **英文** | 环境设定图完整版面指令（见 `sheet.md`），必须整段包含当前风格的渲染句 |
| `image.tags` | 是 | 英文 | 风格标签数组 |
| `variantOf` | 否 | — | 变体的母场景 id。AI 生成一个新景很便宜，但**变体复用母场景资产更一致**——outline 里带 reusePlan 的场景优先做成变体 |
| `changes` | variantOf 时必填 | 中文 | 相对母场景改了什么（换时段/换天气/换前景/删道具） |
| `usage` | 否 | — | `{episodes, beats, beatIds?}`（beatIds 保留稳定节点引用；beats 仅展示类型），seed 自动填，手写也行 |

## 单件道具（以校验器为准）

| 字段 | 必填 | 语言 | 说明 |
| --- | --- | --- | --- |
| `id` | 是 | — | `P01` 格式，全局唯一 |
| `name` | 是 | 中文 | 道具名 |
| `scale` | 是 | 枚举 | `手持级` / `桌面级` / `家具级`，对应英文短语必须出现在提示词里 |
| `summary` | 是 | 中文 | **戏剧功能**：这件道具承载什么剧情 |
| `anchors` | 3–5 个 | 中文 | 经得起特写的细节特征（铜扣的新划痕、墨池的月牙磨痕） |
| `states` | ≥1 个 | state 中文 / prompt 英文 | **状态变体**：合上/打开、藏着/摊开——每个状态一张参考 |
| `relatedScenes` | 否 | — | 主要出现的场景 id，必须存在 |
| `carriedBy` | 否 | 中文 | 谁带着它，自由文本 |
| `image.prompt` | 是 | **英文** | 白底主视角，**必须带尺度短语、无人无手** |
| `image.negativePrompt` | 是 | **英文** | **必须禁人且禁手**（hands/fingers） |
| `image.sheet` | 是 | **英文** | 设定图版面指令，**必须写明 pure white background** + 当前风格渲染句 |
| `usage` | 否 | — | `{episodes, beats, beatIds?}`（beatIds 保留稳定节点引用；beats 仅展示类型） |

## 硬规则（确定性检查，全是代码）

1. 锚点 3–5 个——少了认不出，多了核对不过来
2. 光照状态 ≥1 且都有英文提示词
3. **空景**：反向提示词必须禁人。环境和角色是两层资产，混在一张图里一致性全毁
4. 出图提示词（主图/反向/设定图/光照）全部英文
5. 提示词不含角色名（`validate --cast cast.json` 才查，不给就明说跳过）
6. 变体引用完整：`variantOf` 指向存在的场景且带 `changes`
7. 画风整块用上：`production.json` 的 `style.scene` 里，`render` 那句原样进 `sheet` 与 `prompt`，`negative` 的每一条进 `negativePrompt`（**场景查全，道具不查**——道具是纯白背景，画风里「环境别太干净」那几条和白底自相矛盾）

道具专属四道：

8. 状态 ≥1 且都有英文提示词
9. 尺度参照写进提示词（scale 枚举对应的英文短语）
10. 反向提示词禁手——拿着道具的手是最常见污染
11. 设定图纯白背景可抠

## 校验

```bash
node scripts/novel-art.mjs validate art.json --cast cast.json
node scripts/novel-art.mjs checkup art.json               # 只打印 检查状态 pass/fail/skipped
```

正式样例先阅读 `examples/雨棚留言-故事提案.md`（schema 阅读者从 skill 根目录定位）。独立水池场景不要求 reusePlan；节点关联包含 event 和 turn，不伪造 payoff。当前资产不含真实生成图片。
