# production v3 显式迁移

旧 production 没有版本号；迁移也接受显式 schemaVersion: 2。正式入口只接受 schemaVersion: 3，不双读旧 creative。

```bash
node scripts/mint-setup.mjs migrate-v3 old-production.json
node scripts/mint-setup.mjs migrate-v3 old-production.json --out production-v3.json
# 预览存在语义待确认项时，审阅后才添加：
node scripts/mint-setup.mjs migrate-v3 old-production.json --out production-v3.json --confirm
node scripts/mint-setup.mjs validate production-v3.json
```

默认仅输出 JSON 预览（status、pending、candidate），不修改文件。目标存在、目标是原文件、软链接目标或损坏输入均拒绝。只写入新文件，不自动扫描或操作用户项目。原文件逐字保持，作为可恢复的原始副本；需要恢复时删除新文件或复制原文件到另一个工作位置。本工具没有原地替换模式，也不宣称多文件事务。

## 信息去向

- style/image/video/autopilot、作品 source、语言、扩展字段原样保留。历史 genre 保持作品描述，不作为规则选择器。
- creative 的选择和版本只进入 pending 说明，并保留在原文件。工具没有历史策略库，不声称知道模板的全部约束；请人工检查旧项目使用的指南及覆盖项，把真实要求补充进 creativeBrief。不能把策略名称机械拼成要求。
- params.preferences 的非空文本逐字合并到 creativeBrief。数组依原顺序保留；对象保留键名和文本。预览列出待确认项，须检查冲突后 --confirm。无法理解的非文本值停止迁移，不强制字符串化。
- 旧 production 本不包含阶段 rules/defaults、creativeContext 或手工 overrides。发现这些字段时停止自动迁移，要求逐项人工处理。默认创作约束列入审阅，真实手工覆盖不能当作模板删除；明确预算与模型限制留在相应技术结构。
- 不将哈希、策略版本或身份快照写入 v3。

## 顺序与状态

先迁移 production 配置，再按 outline → characters → art → script → creation 顺序迁移与核对；outline 正式契约为 v5，仅保存剧情。人物身份由 characters 判定，美术身份由 art 判定，script 保存显式映射。独立阶段的本地要求与项目要求必须人工合并。中途版本可能不匹配，不可宣称项目可交付。

--confirm 只确认本次预览的去向，不代表内容评审完成。工具仍检查模型参数和视觉正文，不修饰损坏旧输入，不执行图片或视频生成。

离线回归：`node scripts/migration-selftest.mjs`。测试覆盖预览只读、语义确认、技术字段与原文保真、原文件恢复、防覆盖及非法旧输入。
