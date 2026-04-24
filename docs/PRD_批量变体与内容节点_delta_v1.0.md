# PRD Delta:批量变体(outputCount)与内容节点(Result-as-Content)— v1.0

> **本文件定位**:针对 `PRD_视频节点与工作流模板_v1.2.md` 的**增补与改写**,不替换原 PRD。冲突项以本文件为准,未提及项沿用 v1.2。
>
> **适用交付物**:视频节点(Phase 1 收尾)+ 图片侧同构改造(ImageEditNode / StoryboardGenNode)。
>
> **交付轮次**:分 3 轮,详见 §9。每轮单独验收,未通过不进入下一轮。

---

## 0. 背景与核心变化

### 0.1 为什么要改

竞品(Lovart / MJ 类产品)已验证一套成熟模式:**一次生成 N 张候选 → 单节点 carousel → 用户 review 选主 → 删除无关变体**。我们现行 PRD v1.2 的策略是"多次点生成 → 铺开 N 个 ResultNode",会在 4~8 次迭代后画布崩溃。本 delta 修正这一架构偏差。

### 0.2 核心原则

1. **一次生成 = 一个 Result 槽**(下称"变体容器")。槽内持有 N 个变体,不在画布铺开。
2. **节点即内容**:Result 槽的节点尺寸 = 当前主显变体的宽高比。节点标题 / 元数据极简化,只保留必要"chrome"(左上角小字 + 右上角 `N ⌄`)。
3. **Handle hover 显形**:左右端口默认隐藏,光标靠近节点边缘时才出现。
4. **右侧 `+` 一键衍生**:点击 `+` 直接弹"创建下游节点"菜单,**连线与新节点一次完成**。
5. **失败静默丢弃**(已定):单次 N 张里失败的不进槽,槽只显示成功的变体,右上角 `M ⌄` 的 M 是实际成功数。
6. **切换主显不重跑下游**(已定):下游节点保持当初派生时的状态,节点上记录 `derivedFromVariantIndex` 用于溯源标注。

### 0.3 与 v1.2 的主要冲突点

| 章节 | v1.2 | 本 delta |
|---|---|---|
| §4.3.2 VideoGenNodeData | 无 `outputCount` | **新增** `outputCount: 1-4` |
| §4.4 VideoResultNode | 单一 video/thumbnail 字段 | **改为** `variants: VideoVariant[]` + `selectedVariantIndex` |
| §4.5 派生机制 | 单次成功派生 1 个 Result | **改为** 单次生成派生/更新 1 个 Result 槽,内含 N 个 variants |
| §4.3.2 currentTask | 单 taskId | **改为** `currentBatch: { subTasks: SubTaskState[] }` |
| §4.6 状态机 | 单任务 succeed / failed | **新增** batch 级 "部分成功"(partial_success)语义 |
| §4.11 submitVideoTask | 返回 `{ taskId }` | **改为** 返回 `{ batchId, taskIds: string[] }` |
| §4.4.1 Result UI | 标题 + 缩略图 + 元数据折叠 | **改为** 内容即节点,节点尺寸随主显比例 |

---

## 1. 新增数据类型

### 1.1 `VideoVariant`(结果变体)

```typescript
// canvasNodes.ts 新增
export interface VideoVariant {
  variantId: string;                    // 本地生成 UUID
  klingTaskId: string;
  klingVideoId?: string;
  videoRef: string;                     // __video_ref__:xxx
  thumbnailRef: string;                 // __img_ref__:yyy
  videoDurationSeconds: number;
  generatedAt: number;
  // 快照参数见 §1.2
}
```

### 1.2 `VideoResultNodeData`(改写 v1.2 §4.4.2)

```typescript
export interface VideoResultNodeData {
  sourceGenNodeId: string;
  batchId: string;                      // 一次生成批次的唯一 id
  batchCreatedAt: number;

  // 生成参数快照(冻结,对整批统一)
  snapshotParams: {
    modelId: string;
    prompt: string;
    negativePrompt?: string;
    duration: number;
    aspectRatio: string;
    mode: string;
    cfgScale?: number;
    firstFrameRef: string;
    tailFrameRef?: string;
  };

  // === 核心改动:变体数组 ===
  variants: VideoVariant[];             // 失败的不进数组,长度 = 实际成功数
  selectedVariantIndex: number;         // 主显与下游源,默认 0
}
```

**移除字段**(v1.2 §4.4.2 中):`videoRef` / `thumbnailRef` / `videoDurationSeconds` / `klingTaskId` / `klingVideoId` / `sequenceNumber`——这些下沉到每个 variant 里。

### 1.3 `VideoGenNodeData`(改写 v1.2 §4.3.2)

```typescript
export interface VideoGenNodeData {
  modelId: 'kling-v3' | 'kling-v3-omni';
  prompt: string;
  negativePrompt?: string;
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  mode: 'std' | 'pro';
  cfgScale?: number;
  useTailFrame: boolean;

  // === 新增 ===
  outputCount: number;                  // 1-4,默认 1

  // === 批次任务状态(替换 currentTask)===
  currentBatch?: {
    batchId: string;
    submittedAt: number;
    subTasks: Array<{
      subTaskId: string;                // 本地 UUID,对应未来的 variantId
      klingTaskId?: string;             // 提交成功后赋值
      status: 'pending' | 'submitted' | 'processing' | 'succeed' | 'failed' | 'abandoned';
      progress: number;                 // 0/10/50/100 映射
      errorMessage?: string;
      errorCode?: number;
    }>;
  };

  // 派生历史
  generatedResultNodeIds: string[];     // 指向 N 个 Result 槽(每批 1 个)
}
```

**UI 显示规则**(新增):
- 主按钮旁加输出数量选择器(`1 / 2 / 3 / 4`),默认 1
- 生成进行中时,进度区显示"**2/4 已完成**"(succeed+failed 记为"已完成")而非单一进度条
- 整批全部终态(无 pending/submitted/processing)后才触发派生

### 1.4 同构:`ImageVariant` / `ImageResultNodeData`

图片侧采用完全相同的结构,只是 media 类型不同:

```typescript
export interface ImageVariant {
  variantId: string;
  providerTaskId: string;
  imageRef: string;
  generatedAt: number;
}

export interface ImageResultNodeData {
  sourceGenNodeId: string;              // 可能是 imageEditNode / storyboardGenNode 等
  batchId: string;
  batchCreatedAt: number;
  snapshotParams: Record<string, unknown>;  // 各模型自定义参数
  variants: ImageVariant[];
  selectedVariantIndex: number;
}
```

**注意**:图片侧**新增一个独立 ImageResultNode 类型**承接变体容器,而不是改造 ImageEditNode——ImageEditNode 保留"配置型节点"角色,它的生成出口从"在下游生成新 ImageEditNode"改为"在下游派生 ImageResultNode"。

---

## 2. 派生机制改写(v1.2 §4.5)

### 2.1 新 action:`deriveOrUpdateResultBatch`

```typescript
// canvasStore.ts 新增,替代原 deriveVideoResultNode
deriveOrUpdateResultBatch(params: {
  sourceGenNodeId: string;
  batchId: string;
  kind: 'video' | 'image';
  snapshotParams: VideoResultNodeData['snapshotParams'] | ImageResultNodeData['snapshotParams'];
  successfulVariants: VideoVariant[] | ImageVariant[];    // 整批的成功变体,失败已过滤
}): string;  // 返回 Result 槽节点 id
```

**行为**:
1. 按 `batchId` 查找是否已有对应 Result 槽(用于 retry 场景)。没有则创建。
2. 填充 `variants` 数组,设 `selectedVariantIndex = 0`。
3. 创建 / 复用 Gen → Result 的 edge(每批一条,不是每个 variant 一条)。
4. 更新 Gen 节点:`currentBatch` 清空,`generatedResultNodeIds` 追加槽 id。
5. **全空(successfulVariants.length === 0)**:不创建 Result 槽,Gen 节点显示"本批全部失败"。

### 2.2 Result 槽位置

`y = GenNode.y + (generatedResultNodeIds.length - 1) * (ResultSlotHeight + 24)`
多批纵向堆叠,与 v1.2 逻辑一致,只是计数单位从"单 Result"变成"单批 Result 槽"。

### 2.3 新 action:`selectVariant`

```typescript
selectVariant(params: {
  resultNodeId: string;
  variantIndex: number;
}): void;
```

仅修改 `selectedVariantIndex`。**不触发**任何下游重算。已派生的下游节点保持不变。

### 2.4 新 action:`deleteVariant`

```typescript
deleteVariant(params: {
  resultNodeId: string;
  variantIndex: number;
}): void;
```

**行为**:
1. 从 `variants` 移除该项。
2. 若 `variants.length === 0`:删除整个 Result 槽 + 关联 edges,Gen 节点的 `generatedResultNodeIds` 移除此项。
3. 若被删除的是当前主显:`selectedVariantIndex = 0`。
4. 被删除变体的 `videoRef` / `imageRef` 解除 pool 引用(次日清理)。
5. **下游节点**:若存在下游节点的 `derivedFromVariantIndex === 被删 index`,不做自动处理,但下游节点显示"源变体已删除"标注(见 §4.2)。

---

## 3. 状态机(改写 v1.2 §4.6)

### 3.1 子任务状态(与 Kling 对齐,不变)

`pending` / `submitted` / `processing` / `succeed` / `failed` / `abandoned`

### 3.2 批次状态(新增,派生用)

```
in_progress   // 任意子任务仍在 pending/submitted/processing
all_succeed   // 全部 succeed
partial       // succeed + (failed | abandoned) 混合,至少 1 个 succeed
all_failed    // 0 个 succeed
```

**派生触发**:`in_progress` → `all_succeed | partial`(任一)时,执行 §2.1 派生逻辑。`all_failed` 不派生,Gen 节点 UI 显示错误。

### 3.3 Tauri Event 改动

**Event 名保持**:`video-task-progress`

**Payload 增补**:

```typescript
{
  batchId: string;                      // 新增
  subTaskId: string;                    // 新增,标识批次内第几个
  nodeId: string;
  status: 'submitted' | 'processing' | 'succeed' | 'failed';
  progress: number;
  // succeed 时:
  variantId?: string;                   // 新增,对应未来的 VideoVariant.variantId
  videoRef?: string;
  thumbnailRef?: string;
  videoDurationSeconds?: number;
  klingVideoId?: string;
  // failed 时:
  error?: string;
  errorCode?: number;
}
```

前端收到每个 subTask 的终态事件后,更新 Gen 节点 `currentBatch.subTasks[i]`。检测到整批终态后,收集 succeed 变体,调用 `deriveOrUpdateResultBatch`。

---

## 4. UI 设计

### 4.1 VideoGenNode / ImageGenNode(配置型)

**保留** v1.2 §4.3.1 的六区布局。仅以下调整:

- **参数区**新增"输出数量"选择器(`1 / 2 / 3 / 4`),紧邻模式选择
- **状态区**改为批次级进度显示:`2/4 已完成 · 1 处理中 · 1 等待中`
- **操作区**"放弃等待"作用于整批(停止所有子任务轮询)

### 4.2 VideoResultNode / ImageResultNode(内容型)—— 核心改造

**布局规则**(推翻 v1.2 §4.4.1 的六区布局):

```
┌─────────────────────────────────┐  ← 节点尺寸 = 主显变体宽高比
│ ◉ 视频 #1    (空白)    4 ⌄      │  ← 高度 28px,左上角小字 + 右上角翻页器
├─────────────────────────────────┤
│                                 │
│                                 │
│      (主显变体的画面本体)        │  ← 占据节点剩余空间
│                                 │
│                                 │
└─────────────────────────────────┘
  ← handle 左隐藏            handle 右隐藏 →
```

- **节点宽高**:由 `variants[selectedVariantIndex].aspectRatio`(或 `VideoVariant` 新增的 `width/height` 字段)计算,默认基础宽度 320px。切换主显时节点尺寸**跟随变化**(有过渡动画)。
- **左上角小字**:类型图标 + "视频" / "图片" + `#sequenceNumber`(该 Gen 的第几批)。字号 11px。
- **右上角翻页器** `N ⌄`:
  - 展示 `(selectedVariantIndex + 1) / N`(如 `1 / 4`)或简记 `4 ⌄`
  - 点击下拉,变体缩略图网格浮层,每项含:缩略图 + 勾选 + 删除按钮
  - 点击缩略图 → 切换主显(调用 `selectVariant`)
  - 点击勾选(仅 UI 多选态)→ 进入批量删除模式
- **无元数据区**:参数折叠面板取消,改为 hover 时顶部浮条出现"ⓘ 信息"按钮,点击弹 popover
- **hover 工具条**(悬停节点时浮出,距离节点顶部 -32px):
  - `⬇ 下载` / `⛶ 全屏预览` / `↩ 溯源`(高亮 Gen 节点)/ `ⓘ 信息`
- **视频 Result 特殊**:主显区域默认展示 `thumbnailRef`(首帧),悬停中央浮出大播放按钮,点击弹窗播放本地视频文件(与 v1.2 §4.4.1 一致)

### 4.3 Handle 可见性(新增)

**全局规则(影响所有节点)**:

- Handle 默认 `opacity: 0`
- 光标距节点边缘 ≤ 32px 时(进入节点 hitbox),Handle 渐显到 `opacity: 1`(150ms 过渡)
- 有连线连到该 handle 时,永远可见

**实现位置**:`src/features/canvas/ui/nodeControlStyles.ts` 里新增一组 CSS class,或 `src/features/canvas/nodes/` 下抽公共 Hook `useHandleVisibility`。

### 4.4 `+` 一键衍生(新增)

**触发**:Result 节点右上角的 `+` 圆形按钮(默认隐藏,hover 显形)。

**交互**:
1. 点击 `+` → 弹出"下游节点"菜单(复用 `NodeSelectionMenu`,但按"from Result"上下文过滤)
2. 用户选菜单项 → **同时创建新节点 + 连线**(一个 canvasStore action 原子操作)
3. 新节点位置:Result.x + Result.width + 80,y 对齐 Result 中心

**与原有 `ConnectMenu` 的关系**:原有拉线建节点逻辑保留,`+` 是更短路径的快捷方式。

### 4.5 下游节点的溯源标注(新增)

下游节点数据结构统一新增:

```typescript
interface DerivedFromMeta {
  sourceResultNodeId: string;
  derivedFromVariantIndex: number;      // 派生那一刻的 selectedVariantIndex
  derivedFromVariantId: string;         // 变体 id 快照,即便后续该变体被删也能显示"已删除"
  derivedAt: number;
}
```

下游节点(如下一个 VideoGenNode、ImageEditNode)的 data 里嵌 `derivedFrom?: DerivedFromMeta`。UI 上在节点左上角小字旁显示 `· 来自 #2`,点击跳转高亮。

**主显切换不改此字段**。变体被删除时 UI 显示 `· 来自 #2(已删除)`。

---

## 5. Command 层改动

### 5.1 前端 `src/commands/ai.ts`

```typescript
export async function submitVideoBatch(params: {
  nodeId: string;
  batchId: string;
  modelId: 'kling-v3' | 'kling-v3-omni';
  prompt: string;
  negativePrompt?: string;
  duration: number;
  aspectRatio: string;
  mode: string;
  cfgScale?: number;
  firstFrameRef: string;
  tailFrameRef?: string;
  outputCount: number;                  // 1-4
}): Promise<{
  batchId: string;
  subTasks: Array<{ subTaskId: string; klingTaskId: string }>;
}>;

export async function cancelVideoBatch(params: {
  nodeId: string;
  batchId: string;
}): Promise<void>;
```

**原 `submitVideoTask` / `cancelVideoTask` 删除**。迁移期:本项目 git 只有 2 个 commit,且视频代码全在初始提交里,无需兼容层。

### 5.2 后端 `src-tauri/src/commands/ai.rs`

`submit_video_batch`:
- 校验 outputCount ≤ 剩余并发槽位(`videoConcurrency.maxConcurrent - 当前活跃任务数`)
- 不足时返回错误 `NOT_ENOUGH_CONCURRENCY`,前端显示 Toast
- 够则**串行 fire-and-forget 提交 N 个 Kling 任务**(每个各占一个并发槽)
- 为每个子任务启动独立 tokio 轮询
- 返回 batchId 与 N 个 (subTaskId, klingTaskId)

`cancel_video_batch`:
- 遍历批次内所有 subTaskId,停止轮询
- 释放对应并发槽
- 不调 Kling(同 v1.2,Kling 无取消接口)

### 5.3 图片侧 Command 改动(Round 3)

现有图片生成 Command(按 provider 不同)统一包一层 batch:
- 改 `submitImageTask` → `submitImageBatch`,入参加 `outputCount`
- 内部:provider 支持 `n` 参数则一次请求;不支持则 fan-out N 个请求
- Event 命名沿用各 provider 现有事件,但 payload 增加 `batchId` / `subTaskId` / `variantId`

---

## 6. Settings 改动

**无**。复用 v1.2 §4.13 的 `videoConcurrency.maxConcurrent`。

新增一个**前端侧**的 UI 提示(非 settings 存储):当用户把 outputCount 设为大于剩余并发时,输入框旁显示"⚠ 超过剩余并发 X,将拒绝提交"。

---

## 7. 失败语义细则(对应 Q1 = A:静默丢弃)

**批次内单个子任务 failed**:
- 不进 variants 数组
- Gen 节点 `currentBatch.subTasks[i].status = 'failed'`,errorMessage 保留
- 前端**不弹 Toast**(避免一批 4 个失败 3 个时弹 3 条 Toast)
- 整批终态后,Gen 节点状态区显示汇总:`成功 2 / 失败 1 / 放弃 1`
- 用户点击状态区可展开详细失败原因列表

**整批全失败**:
- 不派生 Result 槽
- Gen 节点显示 banner:`本批 4 个任务全部失败 · 展开详情 · 重试`

**用户放弃整批**:
- 所有子任务 → abandoned
- 已 succeed 的部分**仍派生**(已经花费积分,结果不能丢)
- Gen 节点恢复 idle

---

## 8. 持久化改动

### 8.1 快照字段

- Gen 节点:`currentBatch`(同 v1.2 的 currentTask,一并不进模板)
- Result 节点:`variants` 数组、`selectedVariantIndex` 全部进快照
- 下游节点:`derivedFrom` 字段进快照

### 8.2 videoPool / imagePool 引用源

变更:原"单 videoRef 作为引用源" → 现"variants 数组内所有 videoRef/thumbnailRef 都是引用源"。

清理逻辑不变:无引用次日清理。

### 8.3 模板净化(更新 v1.2 §5.4)

| 节点类型 | 净化策略 |
|---|---|
| VideoGenNode | 清 `currentBatch`、`generatedResultNodeIds`,保留 `outputCount` 与其他参数 |
| **VideoResultNode** | 返回 null(不进模板)不变 |
| **ImageResultNode**(新) | 返回 null(不进模板) |
| ImageEditNode / StoryboardGenNode | 新增:清 `derivedFrom`,其余按 v1.2 §5.4 |

---

## 9. 分轮交付计划

### Round 1:数据模型与派生机制(纯骨架,无 UI 改造)

**范围**:
- 新增 `VideoVariant` / `ImageVariant` / `DerivedFromMeta` 类型
- 改写 `VideoGenNodeData` / `VideoResultNodeData` / 新增 `ImageResultNodeData`
- 改写 `deriveVideoResultNode` → `deriveOrUpdateResultBatch`(支持 video + image kind)
- 新增 `selectVariant` / `deleteVariant` action
- Rust `submit_video_batch` / `cancel_video_batch` Command 替换旧命令
- Event payload 增补 `batchId` / `subTaskId` / `variantId`
- `outputCount` 默认 1(UI 未改,等效单任务,保证向后行为)
- nodeRegistry 新增 ImageResult 注册 + purifyForTemplate 更新

**验收**:
- [ ] `npx tsc --noEmit` 通过
- [ ] `cd src-tauri && cargo check` 通过
- [ ] 手工测试:outputCount=1 时行为与 v1.2 完全一致(旧 happy path 不回归)
- [ ] 手工测试:outputCount=2 时能正确派生一个 Result 槽、槽内 2 个 variants

**禁止动的文件**:
- `src/features/canvas/ui/nodeControlStyles.ts`(UI 留给 Round 2)
- 任何 Node 组件的 UI 布局(只改数据层)

---

### Round 2:视频侧 UI 改造(内容节点 + carousel + hover)

**范围**:
- VideoResultNode 推翻重做:节点尺寸随变体比例、左上小字、右上翻页器、hover 工具条
- VideoGenNode 加"输出数量"选择器 + 批次进度显示
- 全局 Handle hover 显形机制(`useHandleVisibility` Hook + CSS class)
- Result 节点右上 `+` 按钮 → 下游菜单 → 一键创建新节点+连线
- 下游节点左上的 `来自 #N` 溯源小字
- 变体缩略图网格浮层 + 勾选 / 删除批量模式

**验收**:
- [ ] `npx tsc --noEmit` + `cargo check` 通过
- [ ] 真机录屏:生成 outputCount=4 的视频批次,验证槽内 carousel、翻页、删除单个变体、删除至空时槽消失
- [ ] 真机录屏:从 Result 槽点 `+` 一键创建下游节点并自动连线
- [ ] 真机录屏:切换主显时下游节点保持不变,但能看到溯源标注
- [ ] 真机录屏:hover 才显示 handle
- [ ] 批次中途网络断:整批终态汇总正确,部分成功变体仍派生

**禁止动的文件**:
- 图片侧任何节点(留给 Round 3)
- settings UI(本轮不涉及)

---

### Round 3:图片侧同构套用

**范围**:
- 新建 `ImageResultNode` 组件(复用 Round 2 的 Result 组件基础,把 video 元素换成 `<img>`)
- ImageEditNode / StoryboardGenNode 的生成出口改为"派生 ImageResultNode"(而不是直接在目标 ImageEditNode 填 imageRef)
- 各 image provider 的 Command 包装 `submitImageBatch`
- Event payload 同步增补

**验收**:
- [ ] `npx tsc --noEmit` + `cargo check` 通过
- [ ] 真机录屏:ImageEditNode outputCount=4,派生一个 ImageResultNode 槽,槽内 4 个变体
- [ ] 真机录屏:StoryboardGenNode 批量分镜生成,每个分镜派生一个 ImageResultNode 槽
- [ ] 真机录屏:视频 + 图片混合画布下 hover / carousel / 溯源表现一致

**禁止动的文件**:
- Round 2 已交付的视频节点(除非发现 Round 3 实现暴露了视频侧 bug)

---

## 10. 风险与边界

### 10.1 outputCount 与并发的交互

- 默认 videoConcurrency.maxConcurrent = 3,但用户可设 outputCount = 4
- **实现策略**:提交时严格校验 `outputCount ≤ maxConcurrent - 活跃任务数`。不够 reject,**不做内部排队**(一期简化)
- 这意味着用户想一次跑 4 个,必须先把 videoConcurrency 设到 ≥ 4。在设置里加 hint 说明

### 10.2 失败变体的积分"黑洞"

- Kling 即便内容审核失败也可能扣费。失败静默丢弃的策略下,用户不容易感知积分损失
- **缓解**:Gen 节点汇总行显示失败计数,点击展开可见错误码,便于用户追溯
- 不做自动积分核算(Kling 无账单 API V1 可用)

### 10.3 变体删除后的下游溯源

- 下游节点的 `derivedFromVariantId` 指向已删除的 variant → UI 显示"已删除"占位
- 用户可选择删除下游节点(手动),**系统不级联删除**
- 这是一个深思熟虑的选择:用户可能还想基于过期溯源的下游节点继续工作

### 10.4 节点尺寸动态变化的性能

- 切主显时节点尺寸变化会触发 React Flow 重新布局
- 实测若画布有 100+ 节点,切换可能卡顿
- Round 2 验收时专门测:画布 30 节点,连续切 10 次主显不卡

### 10.5 Round 1 与 Round 2 的行为兼容

- Round 1 结束后,outputCount UI 未做,默认值 1,等效单任务
- **但**数据结构已改为 variants[],意味着画布上已有 Result 节点要能正确显示单变体
- 若项目里已有 v1.2 时期生成的 Result 节点(本项目 git 状态来看无),需一次性迁移脚本

---

## 11. 给实施者(Codex)的特别说明

1. **本文件是 v1.2 的 delta**。Codex 开工前必须同时通读 v1.2 全文和本文件。遇冲突以本文件为准。
2. **分 3 轮交付,每轮独立 commit 序列**。单轮内按 `<type>(<scope>): <why>` 拆细(参照 AGENTS.md §12)。
3. **每轮结束必带**:
   - 通过的 `tsc --noEmit` 输出
   - 通过的 `cargo check` 输出
   - 真机 `npm run tauri dev` 录屏或连续截图(仅 Round 2/3 强制)
   - `git log --oneline` 本轮提交清单
4. **禁止自行扩展**:PRD 未明确的能力一律不做(例如"要不要支持 outputCount=8?"→ 不做,当前上限 4)。
5. **遇到不确定**:回来问,给出 2-3 个候选方案 + 推荐项,不要静默选择。

---

## 附录 A:字段命名对照表(v1.2 → delta)

| v1.2 | delta |
|---|---|
| `VideoGenNodeData.currentTask` | `currentBatch` |
| `VideoResultNodeData.videoRef` | `variants[i].videoRef` |
| `VideoResultNodeData.thumbnailRef` | `variants[i].thumbnailRef` |
| `VideoResultNodeData.klingTaskId` | `variants[i].klingTaskId` |
| `VideoResultNodeData.klingVideoId` | `variants[i].klingVideoId` |
| `VideoResultNodeData.videoDurationSeconds` | `variants[i].videoDurationSeconds` |
| `VideoResultNodeData.sequenceNumber` | (移除,槽内 variant index 代替) |
| `submitVideoTask` Command | `submitVideoBatch` |
| `cancelVideoTask` Command | `cancelVideoBatch` |
| `deriveVideoResultNode` action | `deriveOrUpdateResultBatch` |

---

## 附录 B:版本记录

| 版本 | 日期 | 变更 |
|---|---|---|
| delta v1.0 | 2026-04-23 | 初稿,批量变体 + 内容节点 + 3 轮交付计划 |

---

**文档结束**。实施前请确认:
1. 已通读 `PRD_视频节点与工作流模板_v1.2.md` 全文
2. 理解 §2.3 selectVariant 不触发下游重算的设计
3. 理解 §7 失败静默丢弃的用户意图
4. 已在 IDE 里打开 `VideoGenNode.tsx` / `VideoResultNode.tsx` / `canvasStore.ts:1422` 确认现有实现起点

不理解的任何一条都回来问,不要猜。
