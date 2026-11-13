**中文** · [English](README.en.md)

# mint-script 3.0

把故事写成场次与结构化台词。不分镜、不出图，不强制冷开场、短句、密集动作或悬念集尾。自然语言要求确定方向，本地 [创作指南](references/创作指南.md) 提供方法，不再维护策略配置框架。

## v3 重点

- schemaVersion:3。有大纲时从当前 outline 读取 opening/ending，不保存副本；独立时可选。
- 删除 endBeat，从最后一个 flow 项计算。openingBeat 可省略，报告诚实标明未标注。
- 有大纲时按 B ID 完整认领，包括未分类节点；范围合法、有序、不重叠。独立无规划节点可省略 beatClaims。
- targetSeconds 严格对齐大纲目标，粗略估时偏差只提醒。语速/动作秒数/容差默认 4.5/2.5/0.15，仅保存用户覆盖。
- lighting/delivery 可选；无台词人物仍保留在 characters。
- 项目与本地同时有 creativeBrief 时先人工合并，不能静默选择优先级。
- 结构检查、提醒、缺上游未检查、内容评审未执行分别报告。

## 命令入口

Scripts remain self-contained and standard-library-only. Cloud models use mint_skill and workspace read/write/edit/find/grep/ls, without shell execution. All paths below are workspace-relative; production.json stays at the root and screenplay artifacts in script/.

```text
mint_skill({skill:"mint-script",args:["seed","outline/作品-outline.json","--eps","1-3"]})
mint_skill({skill:"mint-script",args:["validate","script/作品-script.json","--outline","outline/作品-outline.json","--art","art/作品-art.json"]})
mint_skill({skill:"mint-script",args:["checkup","script/作品-script.json","--json"]})
mint_skill({skill:"mint-script",args:["render","script/作品-script.json","--html","--outline","outline/作品-outline.json","--art","art/作品-art.json","--cast","characters/作品-cast.json"]})
mint_skill({skill:"mint-script",args:["validate","script/作品-script.json","--production","production.json"]})
mint_skill({skill:"mint-script",args:["migrate-v3","script/OLD.json","--outline","outline/OUTLINE-v3.json"]})
mint_skill({skill:"mint-script",args:["migrate-v3","script/OLD.json","--outline","outline/OUTLINE-v3.json","--out","script/NEW.json","--confirm"]})
```

Save successful seed stdout with write to script/作品-script.json and render stdout to script/script-report.html; these operations have no --out. Use --md for Markdown or --lang en for English UI. --stage skeleton checks a skeleton, not full delivery. Standalone validation can use --no-production; omit unavailable upstream flags and report skipped checks.

CLI 自动发现唯一 outline/art/cast。显式文件优先，多候选需要人工指定，损坏或非法 UTF-8 输入失败。--no-production 与 --production 互斥，不禁止显式或唯一发现的大纲。项目配置要求 schemaVersion:3。

validate/checkup/render 同时检查已知 creation 的实际节拍覆盖与 v3 接口。模型硬限制、参考图与内容仍需制作阶段检查。迁移默认预览；待确认项不能静默删除。新输出、逐字节备份和工作记录使用独占创建，不覆盖原文件。详见 [迁移说明](references/migration.md)。

## 报告

离线中英 HTML/Markdown：正文优先，随后展示计划与节点落点、Q（若登记）、资产和台词本、估时与检查。无策略快照、摘要、覆盖路径或关闭规则空表。

支持窄屏、坐标锚点、复制、可选音色提示、打印与原始 JSON 导出。导出不写入默认值，不宣布内容质量通过。HTML 为派生文件，不进版本控制。

## 自有样例与测试

[《修伞簿》](examples/故事提案.md)：林禾发现与童年记忆相似的绕线方法，却选择自愿交流而非凭纹路认亲。3 集、6 场、30 句台词；每集目标 60 秒，估算约 61.1 / 62.2 / 65.1 秒。第二集省略开场落点以展示可选契约；前两集 closure，最终 open。

outline/art/cast/production fixture 全部本地自有。迁移专用旧输入在 scripts/fixtures/，不作为正式创作样例。旧截图不是 v3 验收证据。

Developer-only terminal self-tests from this skill directory; the cloud model does not execute these commands:

```sh
node scripts/selftest.mjs
node scripts/downstream-selftest.mjs
node scripts/migration-selftest.mjs
```

三个入口覆盖正文、估时统一入口、节点与资产、可选字段、计划单一来源、严格版本、损坏输入、真实 CLI、迁移备份、安全读取和隔离复制。无需付费调用。

工作流程见 [SKILL.md](SKILL.md)，接口见 [schema.md](references/schema.md)，界面约定见 [report-style.md](references/report-style.md)。
