# 创作要求与消费边界

production 必须为 v3。可选 creativeBrief 为非空自然语言正文，不解析成策略、分类或模型参数。缺省时不推断默认要求，不在 art 复制创作要求。画风唯一来自 production.style.scene，图片技术参数来自 production.image。拒绝不属于 production v3 的 creative/creativeContext、selection/decisions/overrides、params.rules/defaults/preferences。

art 正式产物为 v1、kind: mint-art。已有剧本从原件独立识别；独立原创设计保持 mode: design。身份登记不要求画像、提示词或参考图。

outline 正式消费只接受 v5 故事投影：标题、来源、story.summary、beats、episodes、sourceRefs；拒绝人物/地点/道具表及资产预算。检查所消费的结构、节点顺序及来源，不冒称全功能大纲语义或问题回收审核。

characters 正式消费只接受 cast v1、kind: mint-characters，状态 identified、review confirmed，以及逐角色稳定 C ID、identityKey、名字/别名、引用和 lifecycle.registry 身份摘要。消费投影不要求 persona、设计、音色或图片。人物身份变化回交 characters，不在 art 自行改名归并。

缺少可选上游标记 skipped。提供损坏、版本错误、原件版本不同或相关事实超出负责范围时失败。完整流程由项目调用方按 outline → characters → art → script → creation 推进；可选输入在独立入口省略不意味着完整流程可以跳过。

检查状态为 pass/fail/skipped、category、level。明确预算是 error，参考值是 warn；skipped 不算通过。所有本地检查均不代替内容、媒体和成片审核。详见 [schema](schema.md)、[来源](source-facts.md) 和 [接口与生命周期](lifecycle.md)。
