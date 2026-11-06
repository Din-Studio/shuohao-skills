# 创作选择契约

`production.json.creative` 可选；写入时结构严格如下：

```json
{
  "version": 1,
  "selection": {
    "genre": { "id": "mystery", "version": "1.0.0" },
    "narrativeStyle": { "id": "restrained", "version": "1.0.0" },
    "structure": { "id": "serial", "version": "1.0.0" },
    "pacing": { "id": "gradual", "version": "1.0.0" }
  }
}
```

- creative 恰好包含 version 和 selection。selection 恰好包含四维；每维恰好 id 和 version，不接受额外字段、null、数组或省略维度。
- ID 使用小写字母、数字及中间连字符。版本为明确的语义版本，不接受 latest、范围、路径或空值。
- setup 只核对结构，不读取任何兄弟或本地 profile，不保证消费阶段已安装该版本，不生成摘要或 creativeContext。
- 没有选择时提出组合建议并确认。自动驾驶也要依据材料明确选择并汇报。不能从竖屏推导密集兑现，不能从题材或视觉风格推导其他维度。
- 已有项目缺少 creative 保持缺少，不偷偷套入新规则。`params.genre` 是作品描述，不与 profile ID 自动转换。
- `style` 仍是完整视觉正文；`image/video` 仍是制作约束。creative 不覆盖任何技术参数。

## CLI 与 API

`init --selection <selection.json>` 接收四维 selection 对象本身，不是 production 或 creative 包装对象。CLI 添加 `creative.version: 1`。API 为 `initProduction({ aspect, selection, ... })`。省略 selection 不生成 creative，CLI 明确提示尚未选择。

`show` 展示四维 ID 与版本，`validate/checkup` 检查合法性。`resolve --for characters|art` 返回临时展示字段 `creativeBackground`（仅 genre/narrativeStyle），不是产物写入字段。`resolve --for video` 返回完整 creative 选择，供视频阶段按自身矩阵消费。都不加载 profile。

## 检查状态

`gateReport` 返回 status=pass/fail/skipped、category=base、level=error，不输出 ok 布尔值。缺 creative 为 skipped/not-applicable，不计为通过；未知模型的能力检查也为 skipped/not-applicable。基础失败阻断 validate/checkup，其余制作与视觉检查保持。内容评审没有执行，不宣称故事成立。

## 样例

保留《回南天》和《雪线》，分别显式记录生活单元／舒缓组合、悬疑连续／渐进组合。这只是选择示范，不意味着 setup 已核验各阶段实现可用。
