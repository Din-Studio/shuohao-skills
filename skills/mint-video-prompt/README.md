# mint-video-prompt

交接契约：script v4、outline v5、creation v3、production v3、cast/art v1，只接受这些版本。完整规则见 [来源、非发声说明与跨镜声音交接](references/source-audio-handoff.md)。场次 notes 不发声，audioRefs 只延续同一次台词，不跳过镜头、不改变台词顺序。解析来源 ID 必须与上游版本对齐。摘要绑定显式场次资产与局部开场／集尾意图；来源、声音方式或相关限制改变后，仅相关段重新审核。script 的 C/S/P 是局部标记；仅以 script.assetMappings 显式连接 cast/art，名称或编号相同不代表确认。结构／字节核验不是来源忠实性或成片验收。

视频提示词**编写方**。根据剧本节拍、资产表和项目要求，完成一集的分段、分镜与参考图直出视频提示词，写入每段一份的工作单，并提交审核。

- 产物是 `<段号>/prompt.md` 工作单：状态头、分镜结构、审核意见区、编写回应区，以及最后一条分隔线之下的提示词正文。格式见 [worksheet](references/worksheet.md)。
- 提示词统一采用七栏全局、参考素材、散文正文、画风与固定结尾、负面提示词五部分；实际切镜由视频模型决定。内部 cuts 继续承担节拍认领和估时。完整写法，见 [creation-prompt](references/creation-prompt.md)；技术适配按视频模型读取 [H3](references/h3-prompt.md) 或 [seedance](references/seedance2-prompt.md) 指南。分段与停留的判断见[分镜指南](references/分镜指南.md)。
- 只编写，不审核自己的产物，不生成视频。审核由独立的审核方完成。
- 通常由调度方以 subagent 方式调用，也可以单独使用。Node 18+，只有标准库依赖；整个目录可以单独复制。

完整步骤与命令见 [SKILL.md](SKILL.md)。

## 自有样例

[《第七盏灯》](examples/第七盏灯/故事提案.md)先有故事，后有分镜：一场、六个节拍、两段、四个分镜，MiniMax H3 中文五部分提示词。样例只有文字材料与已提交审核的工作单，没有设定图，没有生成视频。

[资产身份与显式映射交接](references/asset-identity-handoff.md)：工作单引用 script 局部标记，身份、规范、图片路径与证据消费 cast/art；无关资产变化不撤销本段审核。
