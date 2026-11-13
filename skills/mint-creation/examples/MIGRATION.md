# 《收书人》夹具迁移说明

## 历史 v4 上游迁移

保留下面的历史 v2 → v3 及上游 v4 迁移记录。该次 script 升级为 v4，仍为独立创作执行稿，不伪造它来自早期梗概的逐句证据。新增《收书人-原剧本.txt》归档既有执行对白与动作；outline v4 引用这个明确版本，删除旧规划参数与 position，story 使用 summary，补齐来源身份与范围。原始《收书人.txt》不修改，图片与分镜不修改。

原剧本是本 skill 已有制作故事的归档，不代表早期梗概原本写有新增自语。来源字节测试不能替代这种语义差异的审阅。creation/production 保持 v3；跨镜声音独立验收故事见 references/test-fixtures/fusion/故事提案.md。

## 故事与基线

先有本目录《收书人》原文，后有分镜。陈叙从旧诗集和「致晚晚」确认与失散妹妹的关联，并没有找到妹妹。历史 v2 视听改编已经增加「晚晚，这是姐姐当年写给你的。」自语，本轮不再增删故事或镜头。

迁移前后均为一集、四段、九个镜头、十个节拍。目标 30 秒，镜头计划 32 秒。C01/C02、S01、P01、B01/B02/B03 和所有 E01 段号保持。动作、台词、提示词、参考图身份及数组顺序逐字保持。原文收书人.txt 和已有参考图不修改。

## 语义处理

- B01 覆盖第 1–3 拍收书开始，B02 覆盖第 4–6 拍辨认笔迹及双倍收书，B03 覆盖第 7–10 拍独处确认旧物。删除额外 type/kind 标签，不修改事件 ID、setup/outcome 或认领。
- stateChange 的“此前只有寻找习惯”“本夜获得线索但仍不知去向”合并到 synopsis，不丢失独有信息。
- opening/ending 仅保存在 outline。script/creation 删除计划副本。显式 openingBeat [1,1] 保留；endBeat 删除，实际末拍仍计算为 [1,10]。
- 删除 script 显式语速 4.5 和动作 2.5 默认值，工具提供同样估时；用户容差 0.3 保留。
- 删除「老板？书有问题吗？」的 delivery：原备注只是重复前拍沉默造成的开口动机。其余低声试探、轻声坚持和确认后停顿属于特殊表演，保留。动作与台词原文不变。
- 删除中性规则、默认关闭占位和策略身份。旧渐进时长建议不转成硬性创作要求，不机械把 mystery/restrained/serial/gradual 名称写成 brief。实际表达方法并入本地创作指南，故事要求仍由现有正文说明。
- production 增加 schemaVersion:3；style、video、语言及媒体协议保持。outline 补充 adaptMode=原创，人物 tier 的 supporting 正规化为 support，分集资产键改为 characterIds/sceneIds/propIds，并把既有道具叙事作用明确为 function。资产 ID、实际内容和引用关系不变，不伪造改编证据。

旧 creation 保存为 references/test-fixtures/migration-v2.json，仅供显式迁移回归，正式流程不双读。迁移命令与数据防护见 references/migration.md。

## 已知边界

outline/script 是本 skill 自有的隔离消费夹具，不借用兄弟样例，也不冒充完整上游阶段的全部预算、Q 与内容评审交付。consumer 校验不能替代作者对真实正文的审阅。

本轮没有生成图片或视频。未验证实际视频的汉字辨识、姐妹关系表达及跨段身份／道具连续性。字条汉字可能需要后期字幕；结构检查通过不表示这些效果已经验证。

## 故事与资产拆分

当前样例为 outline v5、script v4、creation/production v3；cast/art 为显式 v1 消费端夹具。资产规范与来源来自各自 cast/art，不再来自 outline。script.assetMappings 的每条 confirmed 记录由样例作者核对原剧本后明确填写，包含完整资产规范 SHA256、文档版本与非空依据；编号沿用不代表自动确认。这些最小夹具不冒充资产负责阶段的完整内容审核。样例审核与实际视频生成仍未执行。
