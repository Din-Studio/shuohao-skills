# 三种故事的隔离联合测试

入口：`scripts/v3-pipeline-selftest.mjs`。

```bash
node scripts/v3-pipeline-selftest.mjs
node scripts/v3-pipeline-selftest.mjs --keep /tmp/shuohao-v3-projects-new
```

目录名称为历史路径，不代表仍使用策略系统。`stories.mjs` 保留原始故事及旧字段构造器，供显式历史迁移测试使用。正式联合测试使用 outline v5、cast/art v1、script v4 和 creation/production v3。selection 仅作为历史迁移输入，不加载 profile，不参与正式创作。

`--keep` 导出三份隔离项目及浏览器入口 `index.html`，目标必须不存在。默认删除本轮临时目录，不覆盖历史文件，不生成永久检查日志。

## 故事与数据

先确定 `故事提案.md`，再编写故事、节点和动作。`assets.mjs` 提供本测试自己的角色与美术文本，不读取兄弟 skill 正式样例。

- 《失物登记》：三集连续追回捐款，普通集悬念。
- 《夜班温度》：渐进调查，真实无 payoff 分集，最终开放，阶段不全覆盖。
- 《楼下早餐》：闭合生活小事，八秒观察；前两集摊主不在场，第三集回来。

每集二十四秒，动作估时分别为四、六、八秒。不同故事不依赖配置枚举才能成立。

## 执行范围

真实 CLI 覆盖 production 初始化、各阶段 seed/validate、中文与英文 HTML/Markdown、同故事五面板合并报告。大纲直接从故事事实构造剧情数据，不生成资产。characters/art 独立从原剧本 seed，再登记本阶段身份及来源。script.assetMappings 显式保存唯一映射，资产摘要递归排序对象键。大纲 v4 资产构造器只参与显式迁移测试。

真正按 outline → characters → art → script → creation 顺序推进的项目流程见 `scripts/ordered-pipeline-selftest.mjs`。它使用根目录自有《井口双签》故事，实际调用 pipeline 的 init/begin/run/complete，不注入 validator。

负例覆盖节点认领、坐标、上游目标时长、Q 承诺、引用、明确预算、损坏与多候选输入、镜头顺序覆盖、模型时长及参考图身份。精简回归覆盖可选分类、无 Q 悬念、估时默认值、正文计算结束位置、唯一项目要求、指南修改不使产物失效、旧字段拒绝及显式迁移安全。

迁移测试检查预览、待确认项、原件字节保持、禁止覆盖、符号链接与非法编码。历史配置只存在于这些显式旧格式测试输入中。

## 验证边界

没有生成图片或视频，没有调用付费服务。函数级媒体测试只认可夹具实际声明的图片路径，不使用恒真替身。三份完整设计样例实际请求参考图，真实 CLI 缺少这些图片时必须阻断。身份骨架和未请求媒体的制作计划另有正例；没有设计或出图不等于身份交接失败。

结构检查不证明故事质量、图像效果或满足修改后的创作要求。浏览器验收另外执行，不由本脚本冒称通过。失败断言必须保留并修复产品或错误夹具，不能通过删掉检查来过关。
