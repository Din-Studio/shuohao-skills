# novel-creation

从 v2 剧本制作参考图直出视频方案。**不生成分镜图，不改写上游故事。**

- 生成段受模型技术限制；镜头表达受当前创作规则控制。
- `params.rules.cutDuration` 支持 off/warn/error，不再统一要求二至五秒切镜。
- 接收 opening、ending、openingBeat、endBeat 和节点 ID 认领。开放结尾不会被改成追更悬念。
- 分别展示基础检查、策略提醒、来源状态、缺少上游和内容未评审。
- 保留参考图挂载、通用提示词、双语报告、原始 JSON 导出及 lingying 投产接口。

## 使用

完整流程和命令见 [SKILL.md](SKILL.md)，数据见 [schema](references/schema.md)，策略见 [profile-contract](references/profile-contract.md)，旧数据见 [迁移指南](references/migration.md)。Node 18+，零 npm 依赖；整个目录可单独拷走。

```bash
node scripts/novel-creation.mjs profiles
node scripts/novel-creation.mjs profile --production examples/production.json
node scripts/selftest.mjs
node scripts/strategy-selftest.mjs
node scripts/profile-selftest.mjs
node scripts/fixes-selftest.mjs
```

新建产物先 seed，再显式 apply-profile。应用前预览当前值、新组合和旧覆盖；确认才备份并写入。validate/render 不重新应用模板。视频模型指南与创作指南分别读取。实际视频生成需要授权和费用告知，本轮测试不调用模型。

## 自有样例

《收书人》先有故事，后有分镜。一集、四段、九个镜头、十个节拍；目标三十秒，镜头计划三十二秒。内容评审后以一句自语明确字条与姐妹的关系；角色寻找妹妹的行动只得到旧书线索，没有伪造寻人成功。v2 夹具迁移和内容限制见 [MIGRATION.md](examples/MIGRATION.md)。现有图片只作参考图测试，不宣称本轮生成。

报告 HTML 是可重新渲染的派生产物，不进入版本控制。不新增质量门失败累积日志或统计功能。
