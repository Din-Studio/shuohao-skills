# 3.0.0 迁移

先备份 production.json。缺 creative 的既有项目保持原义，不强加策略。确认四维选择后，按 [creative-selection.md](creative-selection.md) 手动增加 creative.version=1 与完整 selection。禁止猜默认、把旧题材描述自动转成 ID，或只换画幅就套入密集兑现。

检查对象的 ok 布尔值已移除；消费者改读 status/category/level。只有 pass 计为通过，未知模型与未选择策略的 skipped 单列。show/resolve 展示选择，但不读取 profile、不伪造摘要、不保证其他阶段已安装实现。

原有 style/image/video/autopilot 参数保持。视觉正文和模型枚举检查仍有效。切换项目选择后，由需要应用策略的阶段显式处理；characters/art 只记录题材和叙事风格背景，不增加应用流程。
