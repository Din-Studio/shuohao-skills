# 美术阶段 2.0.0 迁移

1. 先备份真实旧产物。已有 art.json 字段不作自动语义转换。
2. 旧 outline 缺版本或版本不是 2，seed 拒绝。按原文重新确认角色、资产与节点类型；不能只补 schemaVersion 就声称迁移完成。本阶段仅检查消费投影，不替大纲做内容迁移。
3. production 可以省略 creative；缺少选择不会获得新策略。若填写，creative.version 必须为 1，selection 恰好四维，每维恰好 id/version，版本不得是 latest 或范围。资产阶段只记录 genre/narrativeStyle，不加载 profile、不写 creativeContext、不伪造摘要。
4. 提供了 production 却缺 style.scene 或 image 参数，以前可能跳过，现在失败。历史报告缺 production 可独立读取；生成资产前必须补齐视觉正文与制作参数。
5. 检查消费者把 ok 布尔值改为 status/category/level；只统计 pass 为通过，skipped 单独显示。基础 fail 返回非零。批次出图结果与成功计数仍保持原生成接口。
6. 重新校验、渲染并核对参考图；本轮不自动出图、不做付费调用、不记录失败累计日志。
7. 正式样例改为《雨棚留言》。先读 examples/雨棚留言-故事提案.md，再读资产。旧的 examples/渡口-art.json 已移除，不再借用兄弟故事；需要读取旧产物时使用升级前备份或旧提交。上游 fixture 为本地自有消费投影，不宣称是完整大纲。

详见 [creative-background.md](creative-background.md)。
