# 分层架构详解

## 当前主链路

用一句话概括当前系统主链路：

`UI -> Store -> Application -> Command -> Tauri/Rust or Web fallback -> Persistence / Provider`

这个链路不是抽象口号，而是能在目录结构里直接对应出来：

- UI：`src/App.tsx`、`src/features/canvas/Canvas.tsx`、`src/features/canvas/nodes/*`
- Store：`src/stores/*`
- Application：`src/features/canvas/application/*`
- Command：`src/commands/*`
- Tauri/Rust：`src-tauri/src/*`
- 持久化与外部能力：SQLite / IndexedDB / 文件系统 / AI provider

## UI 层

职责：渲染画布、节点、工具条、弹窗、设置页，接收用户操作。

典型目录：

- `src/features/canvas/`
- `src/features/canvas/nodes/`
- `src/features/canvas/ui/`
- `src/components/`

它该做的事：

- 展示节点和结果
- 采集输入
- 触发 store action
- 维护必要的局部草稿态

它不该做的事：

- 直接写数据库
- 自己决定跨节点数据规则
- 把 provider 或图片处理逻辑塞进组件

## Store 层

职责：保存共享状态，协调项目运行时数据。

当前最重要的三个 store：

- `canvasStore`：节点、边、历史、结果节点、连线、副作用型图操作
- `projectStore`：项目列表、项目打开关闭、自动持久化、脚本内容、视口存储
- `settingsStore`：API key、Kling 设置、下载路径、价格显示、更新开关、边路由模式等

关键点不是“有几个 store”，而是它们职责不同：

- `canvasStore` 偏即时编辑态
- `projectStore` 偏项目生命周期与写盘协调
- `settingsStore` 偏用户偏好与全局运行配置

## Application 层

职责：放业务规则，不放 UI，不直接持有长期界面状态。

典型目录：`src/features/canvas/application/`

当前已经比较稳定的模块包括：

- `graphImageResolver.ts`
- `graphPromptResolver.ts`
- `toolProcessor.ts`
- `toolDialogWorkflow.ts`
- `nodeFactory.ts`
- `canvasServices.ts`

这层解决的是“业务怎么做”，例如：

- 如何沿边取上游图片 / prompt
- 工具执行后如何产出新节点
- 结果节点如何标准化创建
- 错误如何统一报告

## Command 层

职责：前端与运行时环境之间的桥。

典型文件：

- `src/commands/projectState.ts`
- `src/commands/ai.ts`
- `src/commands/image.ts`
- `src/commands/llm.ts`
- `src/commands/system.ts`
- `src/commands/update.ts`

它做的核心工作：

- 判断当前是不是 Tauri 环境
- 如果是，调用 `invoke(...)`
- 如果不是，走 `src/commands/web/*` 的浏览器替代实现

这层的价值是统一调用口，而不是承载产品规则。

## Tauri / Rust 层

职责：提供桌面端原生能力。

Rust 命令入口在 `src-tauri/src/lib.rs`，注册的能力包括：

- 项目持久化
- 图片读写、裁剪、分镜合图
- 图片生成与视频批任务
- LLM 能力
- 系统信息
- 更新检查

这层是“桌面能力后场”，不是一个抽象装饰层。

## Persistence / Provider 层

最终落点主要有四类：

- SQLite：桌面项目存储
- IndexedDB：Web fallback 项目存储
- 文件系统：本地图片与导出保存
- AI provider：图像、视频、LLM 外部模型能力

## 为什么这套分层对 PM 很重要

因为它直接决定需求成本判断：

- 只动 UI：通常低
- 进入 store：影响面上升
- 进入 application：说明开始定义业务规则
- 进入 command：说明要考虑双环境
- 进入 Rust / SQLite：通常已经不是“小改动”

> **📌 PM 视角：** 评估需求时，不要先问“这页要不要改”，先问“这次改动会下沉到哪一层”。只要跨过 command 或 Rust，复杂度通常就不是 UI 级别了。
