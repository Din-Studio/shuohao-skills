**中文** · [English](README.en.md)

# novel-script 2.0

把故事计划写成场次与结构化台词。不分镜、不出图。题材、叙事风格、结构和节奏通过本地策略显式选择，不默认冷开场、短台词、密集动作或悬念集尾。

## v2 核心契约

- `schemaVersion: 2`。旧数据明确拒绝，参见 [迁移指南](references/migration.md)。
- `opening/openingBeat/ending/endBeat` 替代旧 hook/cliff 结构。
- seed 严格投影上游 opening 与 ending.mode/event，不复制 Q。正文为空，位置为 null，不伪造落点。
- `beatClaims` 按 B ID 逐个认领，核心段按大纲顺序、两端包含、互不重叠。支持跨场次与共同铺垫。
- 提供 outline 时重新严格核对集号、开场、集尾与 `targetSeconds = minutesPerEpisode × 60`。估时容差不能放宽此等式。
- 台词、动作、开场、节点核心段与集尾共用未舍入累计估算轴。显示值才四舍五入，估算不等于表演时间。

## 策略与检查

本地 profile 扫描发现，不按题材 ID 编写条件分支。显式应用才改参数；validate/render 不重新套模板。四维全部加载本阶段 JSON 与指南，策略来源摘要仅用于识别漂移。

`params.rules.openingWindow` 和 `lineLength` 均支持 off/warn/error。关闭对象只能含 level。warn 未满足显示提醒，不计通过、不阻断；error 未满足阻断。基础引用、类型、位置和时长目标对账不能关闭。

检查对象使用 pass/fail/skipped，无 ok。缺上游、策略关闭、阶段未完成分别展示。来源不可核验不冒充匹配。内容评审单独说明，自动报告始终不宣称语义已通过。

## 命令

Node 18+，仅标准库，无 npm 依赖。

```bash
node scripts/novel-script.mjs profiles
node scripts/novel-script.mjs profile --selection examples/selection.json

node scripts/novel-script.mjs seed examples/修伞簿-outline.fixture.json --eps 1-3
node scripts/novel-script.mjs validate examples/修伞簿-script.json \
  --outline examples/修伞簿-outline.fixture.json --art examples/修伞簿-art.fixture.json
node scripts/novel-script.mjs checkup examples/修伞簿-script.json --json

node scripts/novel-script.mjs render examples/修伞簿-script.json --html \
  --outline examples/修伞簿-outline.fixture.json --art examples/修伞簿-art.fixture.json \
  --cast examples/修伞簿-cast.fixture.json > /tmp/script-report.html
# 增加 --lang en 切换英文界面
```

正式项目产物必须位于 `<工作目录>/script/`，production 位于项目根。examples 中的 production.fixture 是测试输入，不是已部署项目根。

```bash
node scripts/novel-script.mjs apply-profile <工作目录>/script/作品-script.json --production <工作目录>/production.json
node scripts/novel-script.mjs apply-profile <工作目录>/script/作品-script.json --production <工作目录>/production.json --decisions decisions.json --confirm
```

先审阅差异与未决项。decisions 以完整规则路径为键，值为 keep/drop；overrides 文件则填写完整规则对象。确认后备份并原子写入，再检查本阶段。故事不会自动修复，已知下游须另行重检。

独立应用以 `--selection selection.json` 代替 production。骨架检查增加 `--stage skeleton`，不代表完整交付。没有 outline/art 仍检查本地字段、位置、时长和策略；只有真正依赖上游的检查跳过。提供损坏文件必然失败。

## 报告

离线 HTML 与 Markdown 展示作品承诺、选择快照、有效参数、覆盖、来源、正文、逐拍估算轴、节点 setup/outcome 与核心段、上游 Q 回答落点、场次资产和台词本。

HTML 支持中英界面、窄屏单列、折叠正文、坐标锚点、台词复制、可选音色提示词与打印。诊断消息及故事正文保持原文。导出 JSON 与输入一致，不写入统计或默认值。派生 HTML 不进版本控制。

## 自有故事与独立测试

[《修伞簿》故事提案](examples/故事提案.md)：林禾发现旧伞的绕线方法与童年记忆相似，但选择当面询问，不凭纹路认亲。3 集、6 场、30 句台词；每集目标 60 秒，估算约 61.1 / 62.2 / 65.1 秒。前两集没有 payoff，非最终集 closure，最终 open。

所有 outline/art/cast/production fixture 均在 examples 本地编写。样例不读取兄弟目录。旧截图不作为 v2 验收证据。

```bash
node scripts/selftest.mjs
node scripts/profile-selftest.mjs
```

主自测覆盖严格 seed、认领击穿、开场集尾、时长对账、off/warn/error、独立模式、三组合应用、来源检查、中英渲染、导出、真实 CLI 退出码与隔离拷贝。无付费调用、无真实图片或视频生成。

工作流详见 [SKILL.md](SKILL.md)；数据详见 [schema.md](references/schema.md)；内容评审详见 [review-core.md](references/review-core.md)。
