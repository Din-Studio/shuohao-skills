**中文** · [English](README.en.md)

# novel-outline v2

将小说或原创提案组织为故事大纲。输出作品承诺、改编说明、人物资产、稳定 ID 剧情节点、分集梗概，以及计算生成的资产清单。

**流程稳定，表达策略可替换。** 四维选择为题材、叙事风格、结构、节奏。支持密集兑现连续剧、渐进悬疑和舒缓单元生活，不再强制每集悬念、爽点间隔或终局胜利。

## 主要能力

- 自包含：Node 18+ 标准库，本地策略和指南，无兄弟 skill 依赖。
- schemaVersion 2：中性 story、event/pressure/turn/payoff 节点、suspense/closure/open 集尾、可选阶段。
- 明确承诺始终检查：稳定 ID、资产引用、Q 的唯一后续解决、期限和终局引用不能由策略关闭。
- 规则 off/warn/error；基础、策略、来源、内容评审分开展示。提醒不是通过，缺上游不是完整联合通过。
- 显式策略应用、差异预览、覆盖确认、备份与原子写入；历史校验不偷偷重算模板。
- 保留角色分档、改编证据、资产预算、每批最多 10 集，以及最多 60 卷的长文本切分。
- Markdown/HTML 中英界面、节点时间轴/明细、分集展开、资产矩阵、原始 JSON 值导出，离线可查看。

## 命令

```bash
node scripts/novel-outline.mjs profiles
node scripts/novel-outline.mjs profile --selection selection.json
node scripts/novel-outline.mjs apply-profile outline.json --selection selection.json
# 预览后，明确处理旧覆盖；--confirm 才会写入
node scripts/novel-outline.mjs apply-profile outline.json --selection selection.json --decisions decisions.json --confirm
node scripts/novel-outline.mjs validate outline.json --stage skeleton
node scripts/novel-outline.mjs validate outline.json --stage beats
node scripts/novel-outline.mjs validate outline.json
node scripts/novel-outline.mjs checkup outline.json --json
node scripts/novel-outline.mjs render outline.json --html > outline-report.html
node scripts/novel-outline.mjs render outline.json --md --lang en > outline.en.md
node scripts/novel-outline.mjs assets outline.json
node scripts/novel-outline.mjs chunk book.txt outline/.work --per-volume 15
node scripts/selftest.mjs
```

项目模式将 --selection 改为 --production production.json。validate/render 会向上查找生产参数，也支持显式 --production。语言优先级为命令行、文档、项目、中文。产物位于工作目录 outline/，HTML 不进入版本控制。

策略切换重建本阶段规则，不改集数、时长、预算或故事。CLI 应用后重新检查本地产物及已知 script/creation JSON 的接口，损坏或过期下游返回非零。接口检查包括版本、选择、集号、时长及认领；完整下游检查和内容评审未执行时，应用流程仍未完成。来源同版本漂移须恢复文件或升级版本，不能直接接受新摘要。

## 故事与迁移

正式样例 [《旧站时刻》](examples/旧站时刻-outline.json) 为本 skill 原创。退休调度员与年轻站务员追查撤站前的漏报，最终公开旧归责错误。先有 [故事提案](examples/故事提案.md)，再有事件与分集；不生成分镜图片。

v1 缺版本数据不自动解释成 v2。迁移工具只搬运结构，不自动判断旧爽点是否兑现，见 [迁移指南](references/migration.md)。

- [工作流程](SKILL.md)
- [数据与 API](references/schema.md)
- [策略契约](references/profile-contract.md)
- [内容评审](references/review-core.md)
- [报告约定](references/report-style.md)

结构检查不证明故事精彩；资产估算不证明已经生成。浏览器与联合管线验证应按实际执行范围单独汇报。
