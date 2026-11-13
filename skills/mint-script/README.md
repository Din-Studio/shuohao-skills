**中文** · [English](README.en.md)

# mint-script 4.0

正式交付固定包含 `xxx.json`、`xxx-report.md`、`xxx-report.html` 三个文件。`xxx` 是同一份 JSON 去掉 `.json` 后的完整文件名；两份报告由该 JSON 渲染，并与它放在同一阶段目录。

解析已有剧本的执行正文，也保留独立创作能力。明确行动、台词、字幕、声音和非发声说明。不分镜、不出图，不强制冷开场、短句、密集动作或悬念集尾。自然语言要求确定方向，本地 [创作指南](references/创作指南.md) 提供方法，不再维护策略配置框架。

## v4 重点

- script 保持 schemaVersion:4，只消费 outline v5；production/creation 仍为 v3。有大纲时从当前 outline 读取 opening/ending，不保存副本；独立时可选。
- 删除 endBeat，从最后一个 flow 项计算。openingBeat 可省略，报告诚实标明未标注。
- 有大纲时按 B ID 完整认领，包括未分类节点；范围合法、有序、不重叠。独立无规划节点可省略 beatClaims。
- targetSeconds 是剧本逐集唯一目标，解析时可省略，制作前必须确认；不从大纲复制。粗略估时偏差只提醒。语速/动作秒数/容差默认 4.5/2.5/0.15，仅保存用户覆盖。
- provenance 记录原件版本和负责范围；sourceRefs 定位一基、包含端点的来源行。重叠读取取位置并集，不按文本去重。
- notes 不发声、不估时、不认领。flow 为 action/line/subtitle/sound 四选一，audio 明确画外、内心或旁白语义。
- 来源文件核验与正文忠实度审核分开；哈希和坐标合法不证明意义忠实。未授权候选只留在 .work。
- 下游 audioRefs 延续同一次台词播放，仍保持实际正文恰好一次归属与顺序。
- C/S/P 是 script 局部标记。人物资产权威来自 cast，地点和物品来自 art，正式版本仅接受 v1；不从 outline 读取资产，不按同 ID 或同名自动确认。
- 唯一映射保存在 script.assetMappings：confirmed/pending/conflict、非空依据、来源范围、规范资产摘要和来源版本快照。只有实际制作依赖要求 confirmed；其他待确认可保留。
- lighting/delivery 可选；无台词人物仍保留在 characters。
- 项目与本地同时有 creativeBrief 时先人工合并，不能静默选择优先级。
- 结构检查、提醒、缺上游未检查、内容评审未执行分别报告。

## 命令入口

Node 18+，仅标准库。以下命令从本 skill 目录执行。正式产物放入项目根 script/；examples 中的 production.fixture 仅是测试输入。

```bash
node scripts/mint-script.mjs seed examples/修伞簿-outline.fixture.json --eps 1-3 --output-path /tmp/script-seed.json > /tmp/script-seed.json
node scripts/mint-script.mjs verify-sources examples/夜班水尺-script.json --no-production
# 以下样例未确认制作目标，增加 --production-ready 应失败
node scripts/mint-script.mjs checkup examples/夜班水尺-script.json --verify-sources --no-production --json
node scripts/mint-script.mjs validate examples/修伞簿-script.json --no-production \
  --outline examples/修伞簿-outline.fixture.json --art examples/修伞簿-art.fixture.json
node scripts/mint-script.mjs checkup examples/修伞簿-script.json --no-production --json
node scripts/mint-script.mjs render examples/修伞簿-mapped-script.json --md --no-production \
  --outline examples/修伞簿-outline.fixture.json --art examples/修伞簿-art.fixture.json \
  --cast examples/修伞簿-cast.fixture.json > examples/修伞簿-mapped-script-report.md
node scripts/mint-script.mjs render examples/修伞簿-mapped-script.json --html --no-production \
  --outline examples/修伞簿-outline.fixture.json --art examples/修伞簿-art.fixture.json \
  --cast examples/修伞簿-cast.fixture.json > examples/修伞簿-mapped-script-report.html
# 生产依赖默认是全部正文局部引用；明确选择时使用数组 [{"kind":"character","localId":"C01"}]
node scripts/mint-script.mjs validate examples/修伞簿-mapped-script.json --no-production --production-ready \
  --outline examples/修伞簿-outline.fixture.json --art examples/修伞簿-art.fixture.json \
  --cast examples/修伞簿-cast.fixture.json
# --required-mappings DEPENDENCIES.json 可以明确选择实际制作依赖，不改变正文
# --md 输出 Markdown；--lang en 切换英文界面
node scripts/mint-script.mjs validate PROJECT/script/STORY.json --production PROJECT/production.json --production-ready
# 骨架增加 --stage skeleton，不等于完整交付
node scripts/mint-script.mjs migrate-v4 OLD-v3.json --no-production
node scripts/mint-script.mjs migrate-v4 OLD-v3.json --out PROJECT/script/.work/NEW.draft --confirm --no-production
# 只有确认原输入是独立创作时才使用 --independent；不可借此免除解析来源证据
# 历史 v2→v3 仍可先执行 migrate-v3，再显式 migrate-v4
```

完整流程必须依次完成 outline → characters → art → script → creation，每阶段交接完成后再进入下一阶段。项目级流程状态由流程组装器维护，不是本 skill 的运行依赖。单独执行本 CLI 不更新流程状态；--full-workflow 只额外要求三个上游输入，不证明交接顺序。独立入口无上游可继续，但联合对账 skipped。

CLI 自动发现唯一 outline/art/cast。显式文件优先，多候选需要人工指定，损坏或非法 UTF-8 输入失败。--no-production 与 --production 互斥，不禁止显式或唯一发现的大纲。项目配置要求 schemaVersion:3。

validate/checkup/render 同时检查已知 creation 的实际节拍覆盖与 v3 接口。模型硬限制、参考图与内容仍需制作阶段检查。迁移默认预览；待确认项不能静默删除。新输出、逐字节备份和工作记录使用独占创建，不覆盖原文件。详见 [迁移说明](references/migration.md)。

## 报告

离线中英 HTML/Markdown：正文优先，随后展示计划与节点落点、Q（若登记）、资产和台词本、估时与检查。展示原件出处、声音语义和必要非发声说明。名称和音色只来自有效显式映射，未映射时保留局部标记；映射状态、依据和摘要独立展示。不建立策略配置空表。

支持窄屏、坐标锚点、复制、可选音色提示、打印与原始 JSON 导出。导出不写入默认值，不宣布内容质量通过。HTML 为派生文件，不进版本控制。

## 自有样例与测试

[《修伞簿》](examples/故事提案.md)：林禾发现与童年记忆相似的绕线方法，却选择自愿交流而非凭纹路认亲。3 集、6 场、30 句台词；每集目标 60 秒，估算约 61.1 / 62.2 / 65.1 秒。第二集省略开场落点以展示可选契约；前两集 closure，最终 open。

[《夜班水尺》](examples/夜班水尺-story.md)：只提供第七集、第九集，保留缺集、长心理说明、无台词人物、不同位置重复台词、字幕和报警声；不预设制作目标。自有原件与解析正文可实际核验。

outline/art/cast/production fixture 全部本地自有。修伞簿-script.json 保持独立创作，无来源冒称或映射。修伞簿-mapped-script.json 是对本地自有原件的逐句解析，附完整来源与映射；目标 ID C11/S11/P11 等刻意不同于局部 C01/S01/P01。outline v5 消费夹具只有故事与来源，cast/art v1 夹具保存身份与出处；不冒称外部来源。迁移旧输入在 scripts/fixtures/，不作为正式样例。旧截图不是 v4 验收证据。

```bash
node scripts/selftest.mjs
node scripts/downstream-selftest.mjs
node scripts/migration-selftest.mjs
node scripts/fusion-selftest.mjs
node scripts/asset-mappings-selftest.mjs
```

五个入口覆盖来源字节与范围、非发声说明、声音延续、制作目标边界、正文、估时统一入口、节点与资产、可选字段、计划单一来源、严格版本、损坏输入、真实 CLI、迁移备份、安全读取和隔离复制。无需付费调用。

工作流程见 [SKILL.md](SKILL.md)，接口见 [schema.md](references/schema.md)，界面约定见 [report-style.md](references/report-style.md)。
