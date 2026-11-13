# 创作背景与上游契约

production 保持 schemaVersion 3。读取可选非空 creativeBrief 作为自然语言要求，不解释为策略参数。画风仅来自 style.character，模型、分辨率和画幅来自 image。没有 production 可以完成独立身份登记、画像和声音设计；图片生成计划必须有合法视觉正文和制作参数。提供损坏配置必须失败，不能伪装成缺失。

正式 seed 输入为原剧本文件。可选 outline 只接受 v5 故事背景，核对共同原件身份、SHA256 与范围。人物身份、别名、分档和是否设计由 characters 依据原剧本判断。冲突必须回查原文，不静默改写任一产物。

检查对象为 status=pass/fail/skipped、category、level、detail。缺少可选上游只跳过对应对账。提供但损坏的输入失败。结构通过不是语义审核或联合制作通过；完整流程顺序由项目状态管理，本阶段不能自行宣布已经完成其他阶段。

本 skill 可整体独立复制，不读取兄弟目录，不要求安装任何第三方 skill。
