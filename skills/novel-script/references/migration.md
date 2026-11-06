# 从剧本 v1 迁移到 v2

新版明确拒绝缺少 schemaVersion 或非 2 版本。没有长期新旧双读，也没有自动语义迁移。先备份真实旧 JSON，不直接覆盖唯一副本。

1. 保留旧 source、实际场次与 flow 作为待核对材料。写入 schemaVersion: 2。
2. 有大纲时先完成 outline v2 迁移。重新 seed 可作为投影参照，但不要覆盖已经创作的正文。
3. 重建 opening 与 ending.mode/event。旧 hook/cliff/closure 不直接机械重命名。根据真实结束事件选择 suspense/closure/open，不强制悬念。
4. 旧 hookBeat 仅是 openingBeat 候选，必须阅读真实正文。填写有效 endBeat，且指向最后一拍。删除 hook/hookBeat/cliff/closure。
5. 删除 beatsClaimed。旧类型字符串无法可靠区分同类型节点。按上游 B ID 重新逐个认领 start/end，核对核心段顺序、不重叠及实际内容。不得自动把旧爽点认作 payoff。
6. 明确本次四维策略。旧 maxLineChars/hookWindow 仅供人工参考；level 由本次确认决定，不自动转换为 error。显式应用新的 params.rules，然后删除旧平铺字段。
7. 保留并核对 charsPerSecond/actionSeconds/tolerance。全部有效参数显式保存。targetSeconds 严格等于提供的大纲 minutesPerEpisode × 60；估时容差不是上下游对账容差。
8. 不向剧本 ending 复制 question、dueByEp 或 resolves。Q 继续由大纲维护；报告通过上游和认领展示落点。
9. 备份后执行 apply-profile 预览，逐项决定已有覆盖，确认后整体写入。保留 source/目标时长/估时，不以应用参数冒充修订故事。
10. 运行 validate/checkup、通用与策略内容评审，重新生成中英报告。重新检查已知下游 creation 的剧本认领、结尾投影与策略选择。下游不能保留旧快剪默认。

```bash
node scripts/novel-script.mjs apply-profile script.json --selection selection.json
node scripts/novel-script.mjs apply-profile script.json --selection selection.json --decisions decisions.json --confirm
node scripts/novel-script.mjs validate script.json --outline outline-v2.json --art art.json
node scripts/novel-script.mjs render script.json --html --outline outline-v2.json > script-report.html
```

独立模式没有 outline 时仍可校验本地 ID、范围、类型、时长与策略。必须说明未知节点、全剧身份、Q 计划及上游意图尚未对账。迁移完成不等于内容评审通过。
