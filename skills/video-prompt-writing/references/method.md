# 视频提示词方法

## 学习来源

内化自本仓库 novel-creation 的通用提示词规范与视频表达指南。模型技术来源见本地 h3-prompt.md 和 seedance2-prompt.md。运行时不读取来源目录；来源说明不是依赖。

## 故事与结构

先确定故事，再安排分镜。大纲拥有事件意图，剧本拥有动作、台词与节拍，提示词不能新增事实。每段对应一次视频生成且不跨场。镜头按顺序认领同场连续节拍，全集正文恰好覆盖一次。时长既要容纳台词与动作，也要满足有效模型的技术区间，不硬套二至五秒剪切频率。不能通过删掉证据、人物选择或结果压缩时长。

## 通用正文

开头按挂载顺序写 Picture 1 is … / 图 1 是……，逐张说明身份。随后是 shots: / 镜头描述：，每镜一行 [Shot k] / [镜头 k]，包含景别、运镜、位置状态、可观察动作和原文台词。以 ambience: / 环境声与配乐：收尾。实际发送内容只有正文，不含审核意见。

参考图是整段身份/环境锚点，不是按秒对齐的关键帧。不使用 Picture aligns、精确切点、多图关键帧对齐或 H3 私有 <d> 标签作为通用结构。H3 与 Seedance 的填法必须分别读取本地模型指南。模型改变后重新编写和审核，不静默沿用旧填法。

景别包括 extreme-wide / wide / medium / close / extreme-close。通用运镜词包括 Static Shot、Push In、Pull Out、Zoom In、Zoom Out、Pan Left、Pan Right、Truck Left、Truck Right、Tilt Up、Tilt Down、Pedestal Up、Pedestal Down、Arc Shot、Tracking Shot、Shake Slightly、Shake Strongly、POV、Roll Clockwise、Roll Counterclockwise。逐镜写出对应短语，不能放到另一镜代替。中文采用相应明确中文术语。

## 审核依据

每条结论引用具体镜号和正文证据。核对人物行为的可见原因、观众是否能辨认关键材料、每次切换增加的信息、开场与结束是否符合上游、台词动作时间、段间人物位置/手持物/服装/光线/声音连续性。文字辨识和复杂交互的真实生成风险需要明示，不能只写“情绪复杂”。

人物与道具身份依赖实际参考图，文件存在不证明图中内容正确。结构检查通过不等于内容审核通过；内容审核通过不等于视频质量通过。没有真实媒体时不得报告已核验运动、口型或文字效果。
