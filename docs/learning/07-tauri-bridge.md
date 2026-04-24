# Tauri 桥接与运行时边界

## 为什么这个项目不能被理解成“纯前端”

因为当前桌面端主能力明显依赖 Tauri + Rust。前端看到的是 React 界面，但很多关键能力来自 `invoke(...)` 调到的 Rust command。

当前 Rust 入口在 `src-tauri/src/lib.rs`，里面注册的命令已经覆盖：

- 项目持久化
- 图片处理
- 图片生成
- 视频批任务
- LLM
- 系统信息
- 更新检查

## `src/commands/` 这一层是做什么的

它是前端统一桥接层，不是业务主逻辑层。

当前主要文件：

- `projectState.ts`
- `ai.ts`
- `image.ts`
- `llm.ts`
- `system.ts`
- `update.ts`

这些文件做的事情很一致：

1. 定义前端可调用接口
2. 判断当前是不是 Tauri 环境
3. 决定走 Rust command 还是 Web fallback

## 当前已注册的 Rust command 大类

从 `src-tauri/src/lib.rs` 看，当前桌面端至少暴露了这些大类能力：

- `project_state::*`
- `image::*`
- `ai::*`
- `llm::*`
- `system::*`
- `update::*`

更具体地说，已经能看到这些典型命令：

- `upsert_project_record`
- `update_project_viewport_record`
- `generate_image`
- `submit_generate_image_job`
- `submit_video_batch`
- `cancel_video_batch`
- `split_image`
- `merge_storyboard_images`
- `get_runtime_system_info`
- `check_latest_release_tag`

## Web fallback 现在能做什么

Web 模式不是全空白。当前已知能跑的方向包括：

- 项目存储：IndexedDB
- 部分 LLM 请求
- 部分图片基础能力
- 文件选择和打开链接等浏览器级能力

但它不是桌面端等价镜像。

## Web fallback 明确不能等价的地方

从 `src/commands/ai.ts` 可以直接看到：

- 图片生成功能在 Web 端会直接报错，提示“请使用桌面客户端”
- 视频生成也明确是 desktop-only

这意味着当前产品语义是：

- Web 版可用于一部分编辑、存储和文本能力
- 核心生成链路仍以桌面端为主

## 为什么图片和视频这类能力更适合走 Rust

因为它们往往同时涉及：

- 本地文件
- 图片二进制
- 长任务 / 异步轮询
- 更稳定的本地执行环境

浏览器能做一部分，但很难在当前产品目标下完全替代。

## 这会如何影响需求拆分

评估新需求时，可以先问：

1. 这件事要不要碰本地文件或系统目录？
2. 要不要做 SQLite、图片处理、导出保存或任务轮询？
3. Web 是否必须等价支持？

如果前两项有一项是“要”，基本就已经跨过纯前端边界。

> **📌 PM 视角：** “这只是个弹窗/按钮”这种表述在这里经常会误导。因为很多看似前端动作，真正有成本的是它背后要不要新增 command、要不要做 Web fallback、要不要让 Rust 侧显式暴露能力。
