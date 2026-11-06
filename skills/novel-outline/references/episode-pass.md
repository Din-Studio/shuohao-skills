# 分集：边界清楚，顺序衔接

每批最多 10 集。输入已确认骨架、所选四维指南、当前有效参数、此前状态与未解决问题。默认串行；并发前明确跨批次输入/输出状态与承诺。不依赖上一批模型的隐含记忆。

每集填写 opening（实际开场处境）、synopsis（叙述体事件梗概）、ending（实际停在哪里）。写 opening 不等于必须冷开场；引号本身不构成脚本越界的确定性证据，是否写成完整台词由内容评审判断。

ending.mode 为 suspense/closure/open。suspense 必须提供 question；closure 禁止 question；open 可以有问题或只有余味。required 问题在完整交付内由后续唯一节点 resolves；optional 附 reason，不能有 dueByEp。最终集不声明无法履行的 required 问题。

新建 required 且未显式给期限时，才依据 defaults.questionResolveWithin 写入 min(提出集+默认值,总集数)。null 不填期限；optional 不套默认；旧问题与显式期限不改。最终集不可因此生成无效期限。可调用 newQuestion(question, ep, params)，校验和渲染绝不调用它。

stateChange 若提供必须有非空 before/after；是否强制以及相同文本是否失败，由 stateProgress 决定。语义推进仍要评审。

检查本集节点 setup/outcome 是否真正进入梗概，不把 ID 对齐当成表达成立。仅引用登记资产；人物在场不等于同框，不写 crowdPlan。制作难点写 warnings 供下游规划，不提前决定镜头。

批次合并后按 ep 连续排列，运行 full。核对已解决 Q、未解决 optional 的理由、跨批次角色状态和时间关系。
