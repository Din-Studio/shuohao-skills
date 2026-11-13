# 来源、非发声说明与跨镜声音交接

## 核验对象

outline/script 使用 v4；creation 与 production 仍使用 v3。解析与独立创作是不同入口。独立 script 不强行补造来源；解析 script 的实际正文与 notes 必须有 sourceRefs。进入制作前，每集 targetSeconds 必须是已确认的有限正数，不能从 outline 复制分钟数或虚构目标。

provenance 记录原剧本文档 ID、相对 JSON 的路径、原始文件字节 SHA256、行数与覆盖。sourceRefs 是一基、含两端的 documentId/startLine/endLine 坐标。相同文字发生在不同位置时是不同内容，不能按文本去重。重叠覆盖取并集；partial 可以缺集或不从第一集开始，complete 需要全部文档覆盖和已知 1..N 集。

解析 script 的每个来源文档 ID 必须存在于 outline，且 SHA256 与行数一致；新增 ID 不能绕过版本对账。路径分别相对各阶段 JSON，不以路径字符串相同作为身份条件。独立 script 没有 provenance 时保留独立入口。

调度方生成当前材料时重新读取原件，检查哈希和坐标。缺失、改版或不可读时停止，不跳过。结构校验不冒称读取过原件；哈希一致也不证明提取忠实。来源／正文核验必须独立对照原文，检查遗漏、越权转译和揭晓顺序。制作审核检查正式正文如何被分镜表达，不能代替来源核验，也不能代表成片通过。

## 正式材料

- flow 恰好一种：action、line、subtitle、sound。line 才是逐字发声台词，必须有 speaker；VO 不是匿名替代实际说话人的借口。
- line/sound 的 audio 可说明 mode（onscreen/offscreen/voiceover/inner）、audibleTo 和 subjective。画外对白、旁白与内心声音不能混同；谁能听见仍须内容审核。
- subtitle/sound 的 seconds 可选且必须为正数，省略时使用动作默认估时。notes 不计时、不朗读、不认领镜头。
- 场次 notes 包含 text、kind（performance/background/continuity/restriction）、sourceRefs。必须把当前场次完整说明交给编写与审核方，包括不提前揭晓、不能和解等限制。
- transformation 仅保存正式转译的 reason 与 authorization。权限未确认时，候选留在 .work，不进入执行正文。工具检查字段不等于判断授权有效。

## 同一次声音跨镜

cuts[].beats 仍为该场连续闭区间，每拍恰好拥有一次。可加 audioRefs:[[sceneIndex,beatIndex]]，只引用本集更早镜头已经拥有的 LINE；禁止当前镜头、向前引用、action 引用和单镜重复引用。跨段及跨场只能通过明确坐标延续。每个延续镜头仍须拥有自己的实际 flow，首版不接受纯声音空认领镜头。

audioRefs 表示同一次播放继续，不是再次播放。台词只估时一次；原文另一个位置真正重说，则另有 line、另有拥有者并再次估时。从拥有镜头到最后延续镜头，每个中间镜头都必须引用同一坐标，不能跳过没有 audioRefs 的镜头。按正文台词顺序，从最早允许镜头分配共享秒数；前一句结束后才能分配后一句，不能只检查总容量或调整台词顺序。这个容量检查仍不证明实际声音排演正确。

prompt.includes 只要求拥有台词的段包含原句；延续段描述“继续同一次播放”，不机械重复完整台词。编写方必须安排可执行的跨段声音衔接；审核方检查没有重播、偷换发声者或角色知情。视频模型无法独立实现时报告阻塞，不以计划批准冒充生成效果。

## 材料与批准

seedScenes 保留完整 notes、sourceRefs、audio、transformation，以及当前集所有场次正文，供跨场 audioRefs 回查。材料中的 provenance 是 script 来源身份；调度方在核验边界将文档路径解析为规范绝对路径，使 .work 中的材料仍能定位原件。资产和事件携带各自 sourceRefs/sourceDocuments，保留可回查的来源证据。同名资产不合并，始终使用稳定 C/S/P ID；唯一名称仍使用 name-sheet.png，同目录名称 slug 碰撞时使用 ID-name-sheet.png。场景与道具共同检查碰撞。旧角色名称查找只接受无歧义的唯一匹配。

inputHashOf 只绑定相关依赖：拥有正文、选中场次说明与来源、延续引用的正文及来源场说明、实际引用文档版本、重叠事件认领、相关场次及声音来源场的显式 characters/props、挂载资产证据与图片路径及摘要、模型参数、语言、目标时长、同框与单段限制、项目要求。修改声音方式、揭晓限制或来源引用会使相关段批准失效；跨段依赖同样失效。开场意图只绑定实际开场坐标所在段（未标注时使用第一拍），集尾意图只绑定实际最后一拍所在段。仅修改其中一项，不使其他段失效。无关场次、未引用文档不会连带失效。

status/apply/export/videos 会重新生成材料，核对批准。静态输入材料的本地摘要只能检查该快照，不能证明原件仍未改版。上游变化后先重新核验来源，再生成材料并提交审核，不能手工替换旧批准摘要。

## 学习来源与边界

本地规则内化自本仓库《剧本解析融合 outline 与 script 方案》的来源定位、受约束转译与选择性批准设计，以及《剧本读取与记录》《合并与正式交付》的按位置归并方法。运行只读取当前 skill 的文档与项目原件；不依赖其他 skill、临时学习材料或外部权限引擎。
