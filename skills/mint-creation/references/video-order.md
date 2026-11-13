# 视频生成交接

`export` 产出根部 manifest.json，引用每段已批准的工作单 prompt.md。`videos` 读取这个投产包，按 manifest 记录的 creation.json 与当前上游核对每段工作单的批准仍然有效，校验素材并导出离线计划。生成交给独立安装的 **ly-video**；先阅读 [交接与恢复流程](media-handoff.md)。

```bash
node <baseDir>/scripts/mint-creation.mjs videos manifest.json --out video-plan.json
# 仅预览指定段，不上传、不提交
node <baseDir>/scripts/mint-creation.mjs videos manifest.json --only E01-01 --dry-run
```

没有 ly-video 也能独立交付创作、投产包和计划。报告必须明确未生成视频。剪辑、字幕、拼接和配乐合成不在本 skill 内。

## 参数与参考图

- manifest.video.model 指定模型；aspectRatio、resolution 映射为计划 params.aspect_ratio、params.resolution。
- 每段 prompt.md 最后一条分隔线以下的正文原样进入 prompt；状态头、分镜结构与审核区不会进入。没有状态头、尚未批准、批准后内容被改动，或者这一段依据的输入（节拍原文、参考图内容、模型与参数、项目要求）发生变化的工作单直接失败；`--only` 只核对选中的段。参考图按 manifest 顺序输出绝对路径，保持 @图片N 编号；文件缺失、为空或不是普通文件时停止。
- 计划带有 `approval.manifest` 与 `approval.input`。提交之前重新运行 `videos` 并比对 `input`；不一致说明计划生成之后内容或输入又变了，回到编写与审核，不提交。
- 计划不指定上传字段。ly-video 必须发现实时 schema 后绑定 inputs；不能假设每个视频模型都接受 images。
- 每段目标路径为该段目录的 video.mp4。外部下载后核验内容和容器，再放入目标路径；render 之后才汇报实际完成。

## 时长检查

videos 使用自包含的离线能力快照做检查；不依赖其他 skill 的代码。实时约束由 ly-video 再核对。

- 非整数向上取整；短于快照下限时补到下限，并明确提示。
- 长于上限直接失败，包括 15.04 秒超过 15 秒。重新拆段、校验并导出，不能截短故事后提交。
- 非数值、非有限值、零与负数直接失败。预览执行相同检查。
- seedance 提示词在下单前再次检查时刻禁令；除逐字匹配的完整固定镜头参考首行外，拒绝数字秒数、秒数区间和时间码。导出后修改工作单会使批准失效，需要重新审核、回写并导出。
- 提交前按最终 duration 计算总秒数，按实时价格告知费用。快照不能作为价格依据。

## 恢复

本地命令不支持 --force、--timeout、--concurrency，不要重跑本地命令试图恢复远端任务。通过 ly-video 的原 task ID / 回执查询和下载，详见交接文档。

每段保存一个外部回执。提交结果不确定时先核对网关；等待到期不算失败。质量不满意或真正失败的新生成必须在授权范围内，不能无限重试。
