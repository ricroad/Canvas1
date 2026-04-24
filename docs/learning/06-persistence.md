# 持久化

## 当前持久化策略

Infinite Canvas 不是“退出即丢”的临时工具，而是项目制工具。当前持久化有两个明确特点：

1. **自动保存**，不是依赖手动点击保存。
2. **双通道写入**，整项目快照和视口快照分开处理。

## `projectStore` 是持久化协调中心

真正做保存调度的核心在 `src/stores/projectStore.ts`。

它负责把运行时项目整理成可存储结构，包括：

- `nodes`
- `edges`
- `viewport`
- `history`
- `scriptMd`
- `scriptSourceFileName`
- `scriptImportedAt`
- `scriptAnalysisJson`

## 为什么要分整项目和视口两个通道

当前系统里有两个不同的保存动作：

- `saveCurrentProject(...)`
- `saveCurrentProjectViewport(...)`

原因很实际：

- 节点、边、历史变化属于“重写入”
- 视口平移缩放属于“高频轻写入”

如果用户只是拖动画布，就没必要每次都重写整项目快照。

## 当前序列化里的一个关键设计：媒体池化

`projectStore.ts` 里已经有：

- `imagePool`
- `videoPool`
- `__img_ref__`
- `__video_ref__`

意思是：图片和视频引用不会在节点和历史里无脑重复展开，而是通过池化引用来编码和解码。

这个设计解决两个问题：

1. 降低项目 JSON 体积
2. 避免历史快照里重复存一大堆相同媒体引用

## 历史为什么只持久化一部分

当前代码里：

- 运行时历史上限比持久化保留数更大
- 持久化时只保留最近 `12` 步历史

这说明系统区分了：

- 编辑体验所需的运行时历史
- 项目恢复所需的可接受快照体积

这不是妥协，而是典型的桌面创作工具权衡。

## 桌面端持久化

桌面端通过 `src/commands/projectState.ts` 进入 Rust command，最终写到 SQLite。

当前主要命令包括：

- `list_project_summaries`
- `get_project_record`
- `upsert_project_record`
- `update_project_viewport_record`
- `update_project_script_md`
- `rename_project_record`
- `delete_project_record`

桌面端的特点是：

- 项目能力完整
- 能结合本地文件和图片资源
- 更适合大体量创作资产

## Web fallback 持久化

Web 模式下会走 `src/commands/web/idb.ts`，用 IndexedDB 保存项目。

它保存的核心字段与桌面端保持相似：

- `nodesJson`
- `edgesJson`
- `viewportJson`
- `historyJson`
- `scriptMd`
- `scriptAnalysisJson`

也就是说，Web 模式不是完全没有项目保存，只是能力边界更弱。

## 什么需求一定会打到持久化

下面这些需求几乎都不是“只改前端”：

- 新增节点字段且要求重启后恢复
- 新增结果节点元数据
- 新增项目级脚本分析信息
- 新增图片 / 视频引用字段
- 修改历史恢复语义

## 什么需求可能不用改持久化

- 纯视觉改动
- 局部输入草稿
- 纯临时交互反馈
- 只依赖运行时、不要求重启保留的短命状态

> **📌 PM 视角：** 只要你说出“下次打开项目还要在”，那你就已经把需求从 UI 层推到了持久化层。此时成本里必须计入：编码、恢复、兼容旧项目、以及性能影响。
