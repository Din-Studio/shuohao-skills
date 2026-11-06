# v1 → v2 显式迁移

缺少 schemaVersion 或版本不是 2 时，新版拒绝。旧数据需使用旧版本工具查看，不能长期双读新旧语义。

```bash
node scripts/novel-outline.mjs migrate old-outline.json new-outline.json
```

命令先备份旧文件，拒绝原地输出和已有目标。只搬运材料、资产与非策略参数；生成不完整 v2 草稿及 new-outline.json.review.json。旧节点、分集、阈值保存在评审侧文件，不自动判定语义。侧文件仅供迁移工作，不是下游依赖。

1. 确立 story：premise/throughline/audiencePromise/ending/focusCharacterIds。不能把所有作品变成战胜对手。
2. 逐个判断旧节点为 event/pressure/turn/payoff，填写 position/outcome；稳定 ID 尽量保留，不能把旧爽点全部当 payoff。
3. 重新说明每集 opening 和实际 ending.mode/event，必要时建立 Q 及后续 resolves；旧 hook/suspense 不能机械改名。
4. 填入最终集 endingBeatId；可选 arcs 只支持有序、不重叠范围。
5. 删除 crowdPlan；reusePlan 改为可选；props.beatIds 可关联任意节点。
6. 显式确认四维 selection 并应用策略。maxBeatGap 不换算；旧阈值仅作为人工参考，不能进入运行时。所有注册规则完整存储，off 无残留阈值，questionResolveWithin 可为 null。
7. 重新进行 skeleton、beats、full 检查及内容评审。迁移成功不代表内容评审通过。
8. 已有剧本需要按 B ID 与真实文本重新认领，按大纲投影 opening/ending.mode/event，并重新核对目标时长。creation 重新应用本阶段策略，不继续沿用旧快剪硬门。
9. 重建报告，单独说明来源核验、项目对账、内容评审与未执行的下游检查。

切换策略不会改写旧 Q 截止集，也不能自动修复故事。相同版本来源漂移必须恢复文件或升级版本，不能更新摘要冒充已核验。
