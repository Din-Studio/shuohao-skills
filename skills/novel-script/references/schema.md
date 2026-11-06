# script.json v2 数据契约

软件版本 2.0.0，数据必须显式 `schemaVersion: 2`。无版本与 v1 拒绝，参见 [迁移指南](migration.md)。

## 顶层与参数

```json
{
  "schemaVersion": 2,
  "source": "修伞簿",
  "params": {
    "charsPerSecond": 4.5,
    "actionSeconds": 2.5,
    "tolerance": 0.15,
    "rules": {
      "openingWindow": { "level": "off" },
      "lineLength": { "level": "off" }
    }
  },
  "episodes": []
}
```

示例空 episodes 只是结构说明，不是完整可交付文件。有效文件至少包含一集。params 不可省略，不在 validate/render 时补默认值。语速与动作秒数为有限正数，容差为 [0,1) 的有限数。语速算法沿用去除空白后的 JavaScript 字符串长度，标点计入。

规则必须全部显式存在，无未知字段：
- openingWindow：off 对象恰好为 `{"level":"off"}`；warn/error 必须附正整数 maxBeats。
- lineLength：off 同上；warn/error 必须附正整数 maxChars。
- 拒绝旧 params.hookWindow、params.maxLineChars。默认关闭不等于以超大阈值规避。
- 技术估时参数不是策略。profile 应用保留它们。

可选 lang 为 zh/en。creativeContext 只在显式应用后记录完整四维 selection 快照、本阶段四维 references 身份与摘要、完整规则路径 overridePaths。数值只在 params；来源不是另一份生效配置。详见 [profile-contract.md](profile-contract.md)。

## episode

| 字段 | 契约 |
| --- | --- |
| ep | 正整数，文件内唯一且递增；批次允许不从 1 开始 |
| targetSeconds | 有限正数；有 outline 时严格等于 minutesPerEpisode × 60，不能借容差放宽 |
| opening | 非空文本；有 outline 时逐字一致 |
| ending | 只允许 mode/event；mode 为 suspense/closure/open，event 非空；有 outline 时逐字一致 |
| openingBeat | 1 起始 [场次序号, 场内节拍序号]，完整阶段必须有效 |
| endBeat | 相同坐标，必须是本集最后一拍 |
| beatClaims | 每项只允许 beatId/start/end，数组可以为空但不可缺少 |
| scenes | 按表演顺序的非空场次数组 |
| seedNote | 可选参考说明，不参与投影，也不被下游依赖 |

ending 拒绝 question/questionId/dueByEp/resolves 以及其他额外字段。独立 suspense 不要求 question。剧本没有第二份 Q 计划，也不根据批次最后一集推断全剧末集身份。

旧 hook/hookBeat/cliff/closure/beatsClaimed 均拒绝。关闭 openingWindow 仍要求有效 openingBeat。

## beatClaims

```json
{"beatId":"B01","start":[1,3],"end":[2,2]}
```

B 加至少两位数字，整个文件不可重复。两个端点实际存在，范围包含两端，start 不晚于 end。后一核心段必须严格在前一核心段结束后。允许同集跨场次，也允许共同铺垫放在核心段之外。

有 outline：本集所有 event/pressure/turn/payoff 节点 ID 按大纲 beats 数组顺序逐个匹配，不按 type 合并。漏领、多领、错集、重复、倒序或重叠失败。同类型不同 ID 必须分别认领。

无 outline：仍检查 ID 格式、重复、有效范围、顺序与不重叠。只跳过未知 ID、错集、漏领与上游顺序对账，不猜测 payoff 分类。

## scene 与 flow

sceneId 为 S 加至少两位数字。characters 为无重复 C ID 数组，允许为空；props 为可选无重复 P ID 数组。lighting 提供时为非空字符串。有 art 时核对场景、光照状态和道具；有 outline 时核对人物。

flow 非空，每项二选一：
```json
{"action":"林禾将修伞簿合上。"}
```
```json
{"speaker":"C01","line":"我想先听你自己说。","delivery":"平实，留出回答的余地"}
```

action/line 为非空文本。台词 speaker 必须在本场 characters 中，或为 VO。delivery 可选非空文本。动作项不携带 speaker/delivery。台词写进 line，动作只描述表演与可见变化，不以动作字段隐藏台词。是否为真实有效表达属于内容评审。

flow 不要求严格交替，也不要求每场必有动作、第一拍必有运动或每隔几句插入动作。

## 骨架、独立与上游

seed 只投影本集 opening、ending.mode/event、按序 beatId、目标时长。start/end、openingBeat/endBeat 均为 null，scenes 为空。Q 不复制。neutral rules 不等于已经确认策略。

`--stage skeleton` 允许空 scenes 与 null 位置，估时和已启用表达规则跳过 stage-incomplete。默认 full 不接受这些空位置。skeleton 零退出码不代表可交付。

消费 outline 边界要求 schemaVersion 2、source、有限正 minutesPerEpisode、合法分集与 opening/ending、合法有序 beats 和 characters。有 production.creative 时，还要求大纲 creativeContext.selection 与项目四维选择一致；只更新剧本而留下旧大纲会失败。只比较身份，不比较跨阶段摘要，也不读取兄弟 references。不会 import outline，也不会重复执行完整 story/Q 校验。Q 提出、期限、唯一解决和终局完整性须由上游检查完成。

缺少上游为 skipped/missing-upstream。显式传入 null、损坏 JSON、错误版本或不可读取文件均失败。art/cast 消费既有无版本结构或显式 schemaVersion 1；其他声明版本拒绝。cast 提供时必须有 characters 数组；人物名称、可选 ID 和音色提示词检查类型。CLI 自动寻找祖先 production（最多 5 层），发现损坏文件或悬空链接也失败。`--no-production` 显式选择独立读取，不能与 `--production` 同时提供；该模式不能声称已核验项目选择。

## 唯一估算时间轴

beatSeconds 计算每拍；episodeTimeline 按正文顺序累计，不逐场舍入：
- 台词：lineChars(line) ÷ charsPerSecond。
- 动作：actionSeconds。
- 逐拍、openingBeat、beatClaims、endBeat 和分集估时读取同一累计轴。
- 无效节拍或参数返回不可用时间，不能将无效范围当作零秒。
- 展示才四舍五入至一位小数；容差判断使用未舍入值。
- 时长估算不是实际表演或成片效果，没有统一秒级兑现硬门。

## 检查接口与 CLI

`gateReport(doc, ctx)` 返回 checks 数组。每项含 id/category/level/status/messages，可附 reason，没有 ok。`checkup(doc,ctx)` 返回 gates/stats/blockingFailures/warnings/contentReview/scope。`validateScript` 返回阻断错误字符串数组。ctx 接受 outline/art/production/cast、stage、lang、docPath/productionPath，可选 skillRoot 用于隔离测试。

status 为 pass/fail/skipped。基础错误或 error 策略失败阻断；warn 失败显示提醒，不计通过；off 显示 skipped/policy-disabled。来源漂移属于 source 提醒，不阻断历史读取。内容评审始终单独声明未执行。CLI render 即使有阻断失败仍输出诊断报告，同时返回非零；损坏或不支持的数据版本则先拒绝读取。

```bash
node scripts/novel-script.mjs seed OUTLINE --eps 1-3
node scripts/novel-script.mjs validate SCRIPT --outline OUTLINE --art ART
node scripts/novel-script.mjs checkup SCRIPT --json
node scripts/novel-script.mjs render SCRIPT --html --lang en --cast CAST
node scripts/novel-script.mjs profiles
node scripts/novel-script.mjs profile --selection SELECTION
node scripts/novel-script.mjs apply-profile SCRIPT --selection SELECTION
node scripts/novel-script.mjs apply-profile SCRIPT --selection SELECTION --decisions DECISIONS --confirm
```

选择文件是四维 selection 对象，不是 creative 包装。项目模式以 --production 代替 --selection。decisions 的键为完整规则路径，值 keep/drop；overrides 文件同样按完整规则路径填写完整对象。未确认只预览。apply 确认后读取同项目各阶段目录中的唯一上游 JSON，重新检查剧本；多个候选时明确失败并要求单独指定 validate 输入。已知 creation JSON 执行本地可携带的接口检查：版本、选择、集号、开场／集尾投影与实际节拍覆盖。损坏或过期下游使应用后检查返回非零，但不会撤销已成功写入的参数，也不自动重写故事。模型能力、参考图和语义仍须 creation 完整校验与内容评审，不把局部接口通过称为全管线通过。
