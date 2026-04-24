# 节点系统

## 节点系统的单一真相源

当前节点系统最重要的两个文件是：

- `src/features/canvas/domain/canvasNodes.ts`
- `src/features/canvas/domain/nodeRegistry.ts`

其中：

- `canvasNodes.ts` 负责定义节点类型和数据结构
- `nodeRegistry.ts` 负责定义节点菜单、默认数据、连线能力、菜单可见性

如果要问“系统正式支持哪些节点”，先看这两处，而不是只看 `nodes/` 目录里有哪些组件。

## 当前正式节点类型

当前系统一共 11 种正式节点类型：

1. `uploadNode`
2. `imageNode`
3. `imageResultNode`
4. `exportImageNode`
5. `textAnnotationNode`
6. `groupNode`
7. `storyboardNode`
8. `storyboardGenNode`
9. `sceneComposerNode`
10. `videoGenNode`
11. `videoResultNode`

历史上出现过的 `scriptUploadNode` 和 `storyboardLlmNode` 已进入废弃列表，当前加载旧项目时会被识别为 discarded 类型，而不是正式可用节点。

## 当前节点分层理解

### 资产输入节点

- `uploadNode`
- `textAnnotationNode`

这些节点更接近“素材与说明”。

### 生成 / 处理节点

- `imageNode`
- `storyboardGenNode`
- `videoGenNode`
- `sceneComposerNode`

这些节点更接近“动作”或“变换”。

### 结果节点

- `imageResultNode`
- `videoResultNode`
- `storyboardNode`
- `exportImageNode`

这些节点更接近“产物承载器”。

### 结构节点

- `groupNode`

它更像组织和布局能力，而不是内容生成能力。

## 哪些节点可从菜单直接创建

`nodeRegistry.ts` 里通过 `visibleInMenu` 决定节点是否能被用户直接创建。

当前可以直接创建的，主要包括：

- `uploadNode`
- `imageNode`
- `textAnnotationNode`
- `storyboardGenNode`
- `sceneComposerNode`
- `videoGenNode`

默认不直接出现在菜单里的，包括：

- `imageResultNode`
- `videoResultNode`
- `storyboardNode`
- `exportImageNode`
- `groupNode`

这类节点通常是系统流程或结果派生出来的节点。

## 为什么 `imageNode` 和 `imageResultNode` 要分开

这是当前系统最容易被误解的一点。

- `imageNode` 负责参数编辑、提交生成、记录 batch 状态
- `imageResultNode` 负责承载生成出的多张结果图和当前选中项

这种拆分让系统能支持：

- 一次生成多个输出
- 从具体结果继续派生
- 保留生成参数与结果展示的边界

视频链路也是同样思路：

- `videoGenNode` 发起视频批任务
- `videoResultNode` 存放候选视频、选中项和结果信息

## 连线能力怎么定义

节点是否有输入输出，不应该在 UI 组件里手写，而由 `nodeRegistry.ts` 里的 `connectivity` 决定：

- `sourceHandle`
- `targetHandle`
- `manualConnectionSource`
- `connectMenu.fromSource`
- `connectMenu.fromTarget`

这套定义决定了：

- 节点能不能接收输入
- 节点能不能主动拉线
- 从某个方向拉线时，创建菜单里该出现哪些节点
- 拖线释放到节点本体时，应该落到哪个实际 handle

## 当前系统里的特殊节点

### `sceneComposerNode`

它是当前最特殊的节点之一，因为它不是纯文本 / 纯图片参数表单，而是一个嵌入式构图工具。它既会输出构图结果，也会在连线时接收上游图片快照。

### `videoGenNode`

它有多个语义化输入 / 输出 handle：首帧输入是 `image-first-frame`，尾帧输入是 `image-tail-frame`，结果输出是 `result-output`。因此不能把所有连接都简化成普通 `source` / `target`。

### `videoResultNode`

它是“批次结果节点”的代表，不只是展示一条视频 URL，而是承载一批候选结果、选中项和批次快照参数。

### `storyboardNode`

它不是普通图片节点，而是一个分镜网格结果节点，带有帧列表和导出配置。

### `imageResultNode`

它承载图片生成批次的 `variants` 和 `selectedVariantIndex`。资产库和下游派生通常读取当前选中 variant，而不是读取生成节点上的临时字段。

## 新增一个节点为什么不是“只写个组件”

通常至少要改这些地方：

1. `canvasNodes.ts` 增加类型和数据接口
2. `nodeRegistry.ts` 增加定义
3. `nodes/index.ts` 注册渲染组件
4. 新建节点组件
5. 如果参与数据流，再补 resolver / store / 结果创建逻辑
6. 如果要可持久化，确保数据结构能被项目保存和恢复

> **📌 PM 视角：** 节点需求通常至少是“中等复杂度”。因为一个节点不是一个卡片 UI，而是系统中的正式类型，必须同时被菜单、连线、历史、持久化、派生链路共同认识。
