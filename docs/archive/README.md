# 归档说明

本目录保留已落地、已废弃或已被新方向取代的历史 PRD / PLAN / 一次性产物。**不作为当前开发依据**,仅供回溯。

| 文件 | 原版本 | 归档原因 | 被谁取代 |
| --- | --- | --- | --- |
| [PRD_Canvas创作平台_v2.0.md](./PRD_Canvas创作平台_v2.0.md) | 2026-04-24 | Tauri 桌面期总愿景 PRD,产品定位已被"完全重写为 Web SaaS"取代 | [PRD_Web迁移与异步生成_v1.0](../PRD_Web迁移与异步生成_v1.0.md) |
| [PRD_AIGC团队高效制作台_v2.0.md](./PRD_AIGC团队高效制作台_v2.0.md) | 2026-04-24 | 团队场景 PRD,与 Canvas 平台 PRD 同期、同方向,统一被 Web 迁移 PRD 收口 | [PRD_Web迁移与异步生成_v1.0](../PRD_Web迁移与异步生成_v1.0.md) |
| [PRD_视频节点与工作流模板_v1.2.md](./PRD_视频节点与工作流模板_v1.2.md) | 2026-04-22 | 视频节点 v0.x spec,主体已落地 | — |
| [PRD_批量变体与内容节点_delta_v1.0.md](./PRD_批量变体与内容节点_delta_v1.0.md) | 2026-04-23 | v1.2 的 delta(outputCount + Result-as-Content),已落地 | — |
| [PRD_连接点磁吸交互_v1.0.md](./PRD_连接点磁吸交互_v1.0.md) | 2026-04-23 | 磁吸交互 spec,已落地为 `MagneticHandle` 组件 | — |
| [PLAN_视频生成节点重构_v1.0.md](./PLAN_视频生成节点重构_v1.0.md) | 2026-04-23 | 视频节点重构计划,已落地 | — |
| [PLAN_生成节点架构统一_v1.0.md](./PLAN_生成节点架构统一_v1.0.md) | 2026-04-23 | 视频/图片节点统一架构(provider-agnostic),已落地 | — |
| [CODEX_PROMPT_magnetic_handle.md](./CODEX_PROMPT_magnetic_handle.md) | 2026-04-23 | 一次性发给 Codex 实现磁吸交互的 prompt,已完成使命 | — |

## 何时再翻这个目录?

- 排查"某行代码当年为什么这么写"——优先 `git log --grep`,翻 PRD 是次选
- 写新 PRD 想避免重复造词时,可参考既有概念命名
- 复盘老需求决策(尤其是被 Web 迁移取代的产品定位)

## 不该做的事

- ❌ 把归档 PRD 当作开发依据(它们已经被新方向取代)
- ❌ 在归档 PRD 里继续累加新内容(写新版本就开新文件)
- ❌ 删除归档文件(保留可追溯性)
