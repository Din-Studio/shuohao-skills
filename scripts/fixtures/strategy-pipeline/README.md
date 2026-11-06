# 三组合隔离联合测试

入口：`scripts/strategy-pipeline-selftest.mjs`。

```bash
node scripts/strategy-pipeline-selftest.mjs
node scripts/strategy-pipeline-selftest.mjs --keep /tmp/shuohao-three-combinations-new
```

`--keep` 目标必须不存在。该选项导出三份完整隔离项目，以及浏览器入口 `index.html`。默认运行自动删除临时目录；导出失败也会清理临时目录。不覆盖历史导出，不生成永久检查日志。

## 故事与数据

- 先确定 `故事提案.md`，再编写 `stories.mjs` 的故事、节点和动作。
- `assets.mjs` 提供对应的原创角色与美术文本，不读取任何 skill 正式样例。
- 《失物登记》：三集连续密集兑现，普通集悬念，阶段与终局大兑现。
- 《夜班温度》：三集渐进调查，真实无 payoff 分集，问题跨两集解决，最终开放，阶段不全覆盖。
- 《楼下早餐》：三集闭合生活小事，普通集收束，八秒固定观察；前两集周姨不在场，第三集回来。
- 每集二十四秒。动作估时分别为四、六、八秒，容差保持 15%。没有超大阈值，没有把普通事件改名为 payoff。

## 执行范围

真实 CLI 运行 setup 初始化与校验、outline 策略应用与校验、characters/art seed 与完整设计文本校验、script/creation seed 与策略应用、三个阶段中英 HTML/Markdown 渲染及同故事五面板合并报告。

当前 outline CLI 没有 seed 命令；测试使用自身原创大纲输入，不伪造调用。script seed 的空位置和节点 ID、creation seed 的 opening/ending 投影均先检查，再补齐正文。

负例覆盖节点认领、位置、上游时长、问题承诺、策略严重程度、当前参数契约、源漂移、恢复/升级、原子写入失败、手工覆盖决策、目录逃逸、消费矩阵、阶段摘要差异、切换后上游身份失效、制作时长与图挂载。

策略来源测试复制实际 skill 的 scripts/references 到临时目录，只修改副本。角色和美术也验证独立拷贝且无本地创作 profiles 时能够检查完整视觉文本。

## 验证边界

没有生成图片、视频或调用付费服务。函数级图挂载测试只接受隔离资产应有的具体路径，不使用全局恒真替身。真实 creation CLI 的唯一基线阻断必须是缺少设定图，不能把它宣称为可以投产。

角色和美术的文本校验不证明图片效果。内容评审与真实浏览器验收需要另行执行。脚本不自动执行浏览器检查。

生产实现若漏检，本测试保留失败断言并返回非零。终端中的通过组数不表示完整联合交付。具体生产缺口与本轮执行结果交接到 `/tmp/shuohao-pipeline-handoff.md`，不固化为永久失败历史。
