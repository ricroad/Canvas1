# 数据流与节点流

## 为什么这个项目必须分清两种“流”

Infinite Canvas 里至少有两种完全不同的数据流：

1. **架构层单向流**：UI 如何一路走到持久化或 provider。
2. **画布内节点流**：一个节点如何把结果提供给另一个节点。

如果把这两种流混为一谈，需求讨论很容易失真。

## 第一种：架构层单向流

方向通常是：

`用户操作 -> UI -> Store -> Application / Command -> Tauri 或 Web fallback -> 存储 / 外部服务`

例如用户在 `imageNode` 点击生成：

1. 节点组件收集 prompt、模型、尺寸等参数。
2. `canvasStore` 更新节点状态，例如 `isGenerating`、`currentBatch`。
3. 通过 application / command 调到 `src/commands/ai.ts`。
4. 桌面端进入 Rust command，调用 provider；Web 端则直接报“图片生成功能暂不支持 Web 版本”。
5. 结果再回流到 `canvasStore`，并最终由 `projectStore` 触发持久化。

这条流强调的是分层和边界。

## 第二种：画布内节点流

方向是：

`上游节点 -> edge -> 下游节点`

这里传递的不只是图片，还可能是：

- 剧本文本
- 提示词
- 构图 prompt
- 结果节点的派生来源
- 首帧 / 尾帧视频输入

例如：

- `scriptUploadNode -> storyboardLlmNode`
- `uploadNode -> imageNode`
- `imageResultNode -> videoGenNode`
- `imageResultNode -> sceneComposerNode`

这条流强调的是上下游依赖和节点语义。

## live graph resolution

含义：下游节点每次需要输入时，都动态沿当前图结构回头查上游。

当前源码里的典型位置：

- `graphImageResolver.ts`
- `graphTextResolver.ts`
- `graphPromptResolver.ts`

适合这种语义的场景：

- 上游变了，下游下次就应该读到最新值
- 断线后，下游输入自然失效
- 输入来源不是一个单字段，而是一整套图结构推导

典型例子：

- `StoryboardLlmNode` 动态读取剧本文本
- `imageNode` / `storyboardGenNode` 动态读取上游图片或 prompt

## connection-time copy

含义：在连线那一刻，把上游值拷贝到下游节点自己的数据里。

当前最典型的例子在 `canvasStore.ts` 的 `onConnect`：

- 当目标节点是 `sceneComposerNode`，且上游有主图片时，会把图片写入目标节点的 `inputImageUrl`

这种方式更像“快照式注入”。

适合它的场景：

- 目标节点是特殊嵌入式能力
- 需要立刻把当前输入推给子系统
- 后续不要求对上游变化做持续追踪

## 为什么结果节点很重要

当前系统里，图片和视频都已经不是“生成后把字段塞回原节点”这么简单，而是：

- 生成节点负责发起任务和记录 batch
- 结果节点负责承载输出结果与用户选择
- 派生关系通过 `derivedFrom` 和 `generatedResultNodeIds` 继续往下传

这带来两个好处：

1. 生成行为和结果展示解耦了。
2. 用户能从某个具体结果继续派生下游节点，而不是只能绑定“最后一次生成”。

## 为什么这会影响需求成本

因为你提的“自动同步”“引用上游”“从结果再生成一次”这些需求，本质上是在定义：

- 是动态解析还是连接时拷贝
- 是跟生成节点绑定还是跟结果节点绑定
- 是一次性取值还是持续依赖

这些决定会打到 resolver、store、节点数据结构，甚至影响持久化恢复。

> **📌 PM 视角：** 很多看似 UI 的需求，真正昂贵的地方不在界面，而在“数据什么时候取、从哪里取、变化后要不要继续追踪”。只要这三个问题没说清，开发估时就不可能准。
