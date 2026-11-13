# 项目创作要求

production 必须包含 `schemaVersion: 3`。唯一创作要求是可选的非空自然语言 `creativeBrief`：

```json
{
  "schemaVersion": 3,
  "creativeBrief": "生活悬疑，表达克制。允许局部收束，不要求每集反转。最终澄清事实，但不强行和解。"
}
```

以上仅展示相关字段；完整生产文件仍须填写 style/image/video 等技术字段。

- 不解析为枚举、题材分支、兑现密度、集尾类型或模型参数。
- 没有要求就省略，不要求空字符串或占位口号。
- `init --creative-brief "正文"` 写入原文。`show` 展示原文，`resolve` 向三个媒体消费阶段返回同名字段。
- 不在 outline/script/creation 中复制项目要求。独立阶段可以有本地 creativeBrief；与非空项目要求同时存在时必须提示人工合并，不设置静默优先级。
- 独立产物接入项目时先合并到 production，再删除本地副本。
- 要求修改后，Agent 根据实际内容检查受影响阶段。结构检查通过不代表内容已重新评审。
- style 仍是唯一视觉正文；image/video 仍是媒体技术配置，创作要求不覆盖它们。
- genre 是题材描述，不自动转换为规则。creative 与阶段策略字段不属于 production 契约，校验直接拒绝。

检查使用 status/category/level。缺少可选要求不会产生警告；未知模型的能力检查仍明确跳过。工具不执行内容评审。
