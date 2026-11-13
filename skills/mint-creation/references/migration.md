# creation v2 → v3 迁移

## 安全边界

先迁移 production、outline、script，再迁移 creation。本工具只处理 creation，不批量修改项目或兄弟阶段。creation 正式 validate/render 仍接受 v3，但挂载的 script/outline 必须先完成各自 v4 显式迁移。迁移缺少的来源证据只能由作者回查补齐；本消费端不补造 provenance 或 targetSeconds。迁移不调用媒体模型。

```bash
node scripts/mint-creation.mjs migrate-v3 old-creation.json
node scripts/mint-creation.mjs migrate-v3 old-creation.json --script new-script.json --outline new-outline.json --out new-creation.json --confirm
```

默认仅预览。存在 pending 时退出非零，不写文件；--confirm 明确接受迁移记录中的处理建议，仍不能跳过损坏数据或计划冲突。写入新文件，拒绝覆盖任何已有目标和符号链接。输入始终不变，是可恢复的原始备份。

同时生成 OUTPUT.review，记录原字段、旧规则、手工覆盖身份、待确认项和输入位置。两个输出不是跨文件事务；失败时检查实际文件状态。迁移工作记录不参与上游自动发现。新旧正式 JSON 同目录会形成多候选，联合检查时显式指定新路径；确认后由作者把旧文件移到备份目录，不由工具自动整理项目。没有隐式替换模式。预览后未确认不会产生半更新文件。

## 字段去向

- schemaVersion 改为 3。集号、段号、分镜、台词提示词、秒数、资产及参考图顺序原样保留。
- creation 的 opening/ending/endBeat 删除，显式 openingBeat 保留并对账。当前计划与开场坐标来自 outline 或独立 script，结束坐标来自 script 实际正文。提供上游时，旧计划或坐标不同会失败，先人工合并；不能借迁移覆盖不同的故事。
- 没有上游时，旧计划进入 pending 和迁移工作记录。确认只表示接受归档，不代表已验证新上游；之后必须联合检查，不能直接宣称可投产。
- creativeContext、摘要和版本身份只留原文件及工作记录，不进入 v3。历史 profile 名称不机械拼成新要求。
- rules/defaults 和手工覆盖逐项进入预览。作者明确决定是否将其含义合并进唯一 creativeBrief；--confirm 表示接受不再作为机器规则，并保留完整记录。技术参数 maxSegmentSeconds/maxOnScreen/tolerance 不删除。
- preferences 的非空文本在确认后合并到 creativeBrief；无法确定的对象停止并要求人工整理。接入项目前，再把本地要求合并到 production 并删除副本。
- seedNote 等创作信息保存在迁移工作记录，不无声丢弃。

非法版本、破损结构、不合法秒数、无效旧坐标或旧规则不能被修饰成合法 v3。迁移只完成数据结构及已提供计划的对账；参考图存在、提示词、完整正文覆盖和模型硬限制仍需 validate。内容评审必须单独执行。
