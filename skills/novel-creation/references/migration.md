# creation v2 迁移

本版拒绝旧平铺镜头阈值和旧剧本开场／集尾字段。没有新旧双读。先备份真实文件；不要覆盖唯一旧产物。

## 手工步骤

1. 核对原文、旧 outline、旧 script 和实际分镜。确认故事停在哪里，不能只把 hook 改名 opening、cliff 改名 ending。旧 hookBeat 只是候选位置。
2. 将 outline/script 更新为 schemaVersion:2。逐节点判断 event/pressure/turn/payoff；按 ID 和实际正文重建 beatClaims，禁止把类型名称自动映射成节点。大纲负责问题和解决计划。
3. 在 script 中确定 opening、ending.mode/event 和合法 openingBeat/endBeat。endBeat 必须最后一拍。creation 原样投影这四项；不复制问题字段，不从批次最后一集猜全剧结尾。
4. creation 写 schemaVersion:2。原 segment/cut、参考图和提示词保留，先检查它们是否仍表达新的上游意图，不自动改故事。
5. 确认生产文件中的四维选择，或提供独立 selection。旧 minCutSeconds/maxCutSeconds 只能作为这次确认的候选值，不能决定新 level。删除旧字段，显式填写中性规则 `params.rules.cutDuration={"level":"off"}`，保留 maxSegmentSeconds、maxOnScreen、tolerance。之后预览并显式 apply-profile；要保留旧范围，使用 --overrides 提供包含明确 level 的完整新规则对象。
6. 阅读所选本地创作指南和有效模型技术指南。未知模型能力不能假装已核实。创作规则不能放宽技术时长、节拍认领或参考图限制。
7. 重新 validate/checkup/render。重新核对项目选择、来源摘要、outline 时长与节点、script 位置与集尾、参考图挂载及投产包。应用成功不等于故事已经符合新规则。
8. 逐镜内容评审；需要重新生成的资产或视频只列失效范围，不擅自调用生成。报告单列内容未评审、来源不可核验和缺上游。

没有提供自动语义迁移命令。seed 只搬运已合法的 v2 剧本，不把旧内容补成可交付故事。本目录 examples/MIGRATION.md 展示《收书人》如何依据已有内容作出迁移判断。
