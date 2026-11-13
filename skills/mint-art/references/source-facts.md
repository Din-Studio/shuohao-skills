# 来源事实与制作补定

## 原件与负责范围

原剧本直接输入本阶段。outline v5 是可选故事背景，不是资产权威；cast v1 是人物身份权威。缺少可选上游为 skipped；已经提供但损坏、旧版、身份或版本不匹配时失败。

provenance 必须声明 kind: script、scope: partial/complete、documents 和 coverage。documents 每项包含唯一 id、path、64 位小写原始字节 SHA256、正整数 lineCount。路径相对所属 JSON；也接受绝对路径。CLI seed、迁移和重定位输出绝对路径以防 stdout 落点改变路径含义。搬迁机器须显式更新路径并重新核验，不按同名文件猜测原件。

coverage/sourceRefs 每项为 documentId/startLine/endLine；一基行号、包含两端。LF、CRLF、裸 CR 都是换行；末尾换行不额外增加空行。严格 UTF-8 解码。相邻、重叠区间按位置并集检查；相同文本出现在不同位置不能合并位置。sourceRefs 必须处于文档和负责范围内；提供 quote 时回查实际原件行内文本。

seed 的 coverage 为空，不表示已读。人工或模型复读后才填负责范围。partial 不假称全剧，允许缺集和未知结局。complete 需要 totalEpisodes，并覆盖全部登记文档；美术不代替 outline/script 判断剧情全集结构。

## 核验边界

CLI validate/checkup/render/images 总是读取实际原件，核对字节摘要、行数、引用及范围；verify-sources 可单独运行。`--no-production` 只关闭制作参数读取，不关闭原件校验。显式提供缺失原件、错误版本或覆盖缺口必须失败。

内存 stageErrors/validateArt/gateReport 只做结构、摘要一致性和引用检查；调用 verifySources(doc,artifactPath) 才有实际文件核验。技术核验成功不是语义忠实度审核，也不是内容、图片或成片批准。

资产上保留的 sourceFacts.documents、notes、aliases、sourceRefs 属于活动证据，继续校验实际原件。顶层 provenance.documents 与全部资产 sourceFacts.documents 统一核对：相同 documentId 的 SHA256 和 lineCount 必须一致。不同路径的相同字节副本允许；两份各自合法但版本不同的原件不能共享当前文档身份。历史版本单独保存在 migration.original/fields 或关联材料，不作为当前出处；不能把当前资产上的 sourceFacts 当作免校验历史。正式 facts 与全部嵌套引用进入身份摘要。身份摘要不只取文件 SHA256，修改文档 ID、事实、引用坐标或相关范围同样不能沿用旧确认。

## 上游消费与来源对账

已提供的 outline 必须满足本阶段自包含的 v5 full 消费契约：必需故事摘要、节点数组、非空分集及 synopsis；来源、引用和全部嵌套说明处于负责范围；分集编号递增，节点和问题引用有效。complete 声明必须实际提供 1..totalEpisodes 连续全集，并完整覆盖登记原件。partial 可从 E4 开始，但不能冒称 complete。未知或退役字段失败，不导入 outline 脚本。

outline 来源路径遵循 v5 契约，必须相对 outline JSON 且唯一；美术产物自身仍接受相对或绝对原件路径。CLI 按各自 JSON 位置读取原件，不按工作目录猜测。

提供活动证据时，script/design 均核对共同 documentId 的版本、行数及美术引用的上游负责范围。修改 mode 并重新确认身份不能绕过冲突。有共同原件时，美术登记的来源和实际引用都必须能对账；无共同原件的独立设计只能标记 skipped，不能标记 pass。已提供的上游无论是否有共同原件，仍校验其契约和实际来源；skipped 不隐藏损坏输入。

## 语义与制作

- 独立识别地点和物品。场次边界、同名地点、提及名词都不是身份判定算法。
- 物件交接、受损、修复、隐藏和公开分别记录状态及来源；同一实物不因此重新分配 P ID。
- 同一个地点的早晚、闪回和清空通常保持同一地点；需要独立视觉变体时记录制作理由及 variantOf，不冒称场次就是新地点。
- notes 中的限制、人物说法、知情边界及未揭晓信息不能自动变成客观事实。
- 人物声音、同名或别名由 characters 判断；仅使用明确 C ID 关系，不按名称合并。未提供人物权威时可继续独立识别美术，但不批准实际依赖的人物映射。
- facts/sourceRefs 是事实依据；summary、锚点、主场景、材质、复用、变体与提示词是制作决定。来源未规定的左右位置或外观不能伪造成原文引句。
- 原创设计可使用 mode: design，不伪造 provenance。已有原剧本时不能通过删掉来源字段逃避核验。

## 变更与交接

增量读取既有 art。源文件改版只撤回关联文档范围及引用该文档资产的确认，保留设计与图片历史。同文档版本变化仍必须复读相关事实；其他文档的无关身份不自动失效。

逐图片任务 inputDigest 包括当前资产、其身份输入摘要及直接变体参考资产，不以全项目任意变化一概撤回所有任务。script 的局部映射仍由 script.assetMappings 保存；creation 按实际制作依赖核验 assetDigest、原件版本及范围。原件、身份、引用或素材变化后重新核验受影响映射、工作单和批准，不拿 ID 沿用当作旧审核仍有效。

## 方法来源

逐处读取、按来源坐标区分与状态事实提取的方法，内化自 script-parsing 的剧本读取、归并及交付调研；连续性约束来自本仓库长剧本连续性、视听表达调研。方法已在本文件落地，运行不依赖学习材料、第三方 skill 或兄弟代码。
