# mint-video-prompt-review

交接契约：script v4、outline v5、creation v3、production v3、cast/art v1，只接受这些版本。完整规则见 [来源、非发声说明与跨镜声音交接](references/source-audio-handoff.md)。场次 notes 不发声，audioRefs 只延续同一次台词，不跳过镜头、不改变台词顺序。解析来源 ID 必须与上游版本对齐。摘要绑定显式场次资产与局部开场／集尾意图；来源、声音方式或相关限制改变后，仅相关段重新审核。script 的 C/S/P 是局部标记；仅以 script.assetMappings 显式连接 cast/art，名称或编号相同不代表确认。结构／字节核验不是来源忠实性或成片验收。

视频提示词**审核方**。独立审核编写方提交的工作单，把意见写进同一份工作单，并登记结论。

- 审核依据只有剧本节拍、资产表、项目要求和视频模型口径，不采信编写方的自我评价。六项质量标准与格式要求见[审核清单](references/审核清单.md)。
- 审核输出「审核结论、返修意见、待确认事项」。通过／需返修／待确认映射 approved／changes_requested／blocked。有明确错误优先返修；同时需要依据时先协调。意见只保留本轮，不做累积记录。
- 批准绑定内容与输入：批准之后分镜结构或提示词正文被改动，或者这一段依据的节拍原文、参考图内容、模型参数、项目要求发生变化，批准自动失效。
- 只审核，不改写分镜结构和提示词正文，不生成视频。工作单格式见 [worksheet](references/worksheet.md)。
- 通常由调度方以 subagent 方式调用，也可以单独使用。Node 18+，只有标准库依赖；整个目录可以单独复制。

完整步骤与命令见 [SKILL.md](SKILL.md)。

## 自有样例

[《回执》](examples/回执/故事提案.md)先有故事，后有分镜：同一段的两轮工作单，第一轮退回，第二轮批准，seedance2.0 中文提示词。样例只有文字材料与工作单，没有设定图，没有生成视频。

[资产身份与显式映射交接](references/asset-identity-handoff.md)：工作单引用 script 局部标记，身份、规范、图片路径与证据消费 cast/art；无关资产变化不撤销本段审核。
