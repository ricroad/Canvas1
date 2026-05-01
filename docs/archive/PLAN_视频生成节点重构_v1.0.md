# 视频生成节点重构计划 v1.0

> **定位**：针对 VideoGenNode 的前端架构问题与后续 API 扩展性的系统性修复方案。
> **不替换** PRD delta v1.0，与 Round 1-3 交付结果正交，可独立推进。

---

## 1. 问题诊断

### 1.1 UI 层

| 问题 | 具体表现 | 影响 |
|---|---|---|
| 空白占位块 | idle 状态下 `min-h-[110px]` 的"先连接首帧…"提示块，占节点约 25% 高度 | 节点视觉臃肿，与竞品差距明显 |
| 高度失控 | 默认高度 430px，加上 outputCount 后 4 列参数栏更拥挤 | 画布空间浪费 |
| 固定 slot 数量 | `image-first-frame` / `image-tail-frame` 两个 slot 硬编码在组件 | 文生视频模型（无 firstFrame）或多参考图模型无法复用 |
| 参数栏写死 | `mode: 'std' | 'pro'`、`cfgScale` 是 Kling 概念，直接写死在 UI 渲染逻辑 | 接入新模型要改组件本体 |

### 1.2 数据模型层

```typescript
// 当前 VideoGenNodeData —— Kling 字段直接暴露
interface VideoGenNodeData {
  modelId: 'kling-v3' | 'kling-v3-omni';  // 硬编码 Kling model id
  mode: 'std' | 'pro';                     // Kling 专有概念
  cfgScale?: number;                       // Kling 专有参数
  useTailFrame: boolean;                   // 应由 slot 定义驱动，不应存储
  ...
}
```

新模型（Wan2.1 文生视频、Hailuo、Sora）的 params 完全不同，无法沿用此结构。

### 1.3 VideoModelDefinition 层

```typescript
// 当前 —— provider 专有字段泄漏进公共接口
interface VideoModelDefinition {
  klingModelName: string;        // Kling 专有
  klingEndpoint: 'text2video' | 'image2video' | 'omni-video';  // Kling 专有
  supportsTailFrame: boolean;    // 应由 inputSlots 驱动
  ...
}
```

每接一个新 provider，都要往这个公共接口加字段，或者新建一个平行接口，最终走向 union 地狱。

### 1.4 Rust 命令层

`submit_video_batch` 直接调 Kling API，无 provider 路由。接 Wan/Hailuo 需要新增 `submit_wan_video_batch`，无法复用批次管理、并发槽位、事件 payload 等通用逻辑。

---

## 2. 目标架构

```
VideoGenNode (UI)
  ↓ 读 VideoModelDefinition.inputSlots / params
  ↓ 渲染动态 slot + 动态参数控件
  ↓ 提交时构造 VideoTaskRequest

VideoModelDefinition (纯数据，provider-agnostic)
  inputSlots: SlotDef[]          ← 驱动 slot 渲染
  params: VideoParamDef[]        ← 驱动参数控件渲染
  providerConfig: unknown        ← opaque，仅 Rust 侧读取

VideoGenNodeData (store)
  modelId: string                ← 不再限制 union
  extraParams: Record<string, unknown>  ← mode/cfgScale 等下沉到这里
  slotRefs 在运行时从 edges 派生，不存储

submitVideoBatch (前端 command)
  providerId: string             ← 新增，驱动 Rust 路由

Rust: submit_video_batch → providers/<providerId>/submit()
```

---

## 3. 分阶段实施

### Phase A：UI 瘦身（纯 UI，不改逻辑，可独立交付）

**改动文件**：`VideoGenNode.tsx`、`nodeControlStyles.ts`

#### A1：删除空白占位块

删除以下代码段（约 15 行）：
```tsx
// 删除这整个 idle 占位块
{!data.currentTask ? (
  <div className="flex min-h-[110px] items-center justify-center ...">
    <div className="flex flex-col items-center gap-2 ...">
      <Clapperboard className="h-8 w-8 opacity-70" />
      <span>{t('node.videoGen.idleHint')}</span>
    </div>
  </div>
) : ( ... )}
```

idle 状态下不渲染任何占位符，prompt textarea 直接跟在 slot 下面。

#### A2：状态行内联到 action 行

生成进度不再是独立的 block，改为 action 行左侧的一行文字：

```
[⚡ 生成视频]  [放弃]   2/4 已完成 · 1 处理中
```

删除单独的状态 `<div>` block，省出 ~60px。

#### A3：节点默认尺寸缩小

```typescript
// 修改常量
const VIDEO_GEN_NODE_DEFAULT_WIDTH = 420;   // 460 → 420
const VIDEO_GEN_NODE_DEFAULT_HEIGHT = 280;  // 430 → 280
const VIDEO_GEN_NODE_MIN_HEIGHT = 240;      // 360 → 240
```

#### A4：prompt 字符计数移入 placeholder

```tsx
// 删除独立的计数行，改为 placeholder 右下角叠加
<div className="relative">
  <textarea ... rows={3} />
  <span className="absolute bottom-1 right-2 text-[10px] text-text-muted/50 pointer-events-none">
    {data.prompt.length}/2500
  </span>
</div>
```

**Phase A 验收**：节点 idle 高度 ≤ 280px，无空白占位块，tsc 通过。

---

### Phase B：数据模型与 VideoModelDefinition 抽象

**改动文件**：`models/types.ts`、`models/video/kling/*.ts`、`canvasNodes.ts`、`nodeRegistry.ts`

#### B1：VideoModelDefinition 重构

```typescript
// models/types.ts 新增

export interface VideoInputSlotDef {
  id: string;           // 'firstFrame' | 'tailFrame' | 'referenceImage' | ...
  handleId: string;     // ReactFlow handle id，如 'image-first-frame'
  labelKey: string;     // i18n key
  emptyLabelKey: string;
  required: boolean;
  mediaType: 'image' | 'video';
}

export interface VideoParamDef {
  key: string;                     // 对应 extraParams 里的 key，如 'mode'、'cfgScale'
  type: 'select' | 'number' | 'boolean';
  labelKey: string;
  options?: Array<{ value: string; labelKey: string }>;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: string | number | boolean;
}

// 重构 VideoModelDefinition —— 移除所有 kling* 字段
export interface VideoModelDefinition {
  id: string;
  mediaType: 'video';
  displayName: string;
  providerId: string;          // 'kling' | 'wan' | 'hailuo' | ...
  description: string;
  eta: string;
  expectedDurationMs?: number;

  // 驱动 UI
  inputSlots: VideoInputSlotDef[];
  params: VideoParamDef[];
  maxOutputCount: number;           // 默认 4
  supportedAspectRatios: string[];
  supportedDurations: number[];
  maxPromptLength: number;

  // provider 专有配置，对 UI 层 opaque，由 Rust 侧读取
  providerConfig: Record<string, unknown>;

  pricing?: ModelPricingDefinition;
}
```

#### B2：Kling 模型文件迁移

```typescript
// models/video/kling/klingV3.ts 改写
export const videoModel: VideoModelDefinition = {
  id: 'kling-v3',
  mediaType: 'video',
  displayName: 'Kling V3',
  providerId: 'kling',
  description: 'Image-to-video generation.',
  eta: '2-10min',
  expectedDurationMs: 180_000,

  inputSlots: [
    {
      id: 'firstFrame',
      handleId: 'image-first-frame',
      labelKey: 'node.videoGen.firstFrameSlotLabel',
      emptyLabelKey: 'node.videoGen.firstFrameSlotEmpty',
      required: true,
      mediaType: 'image',
    },
    {
      id: 'tailFrame',
      handleId: 'image-tail-frame',
      labelKey: 'node.videoGen.tailFrameSlotLabel',
      emptyLabelKey: 'node.videoGen.tailFrameSlotEmpty',
      required: false,
      mediaType: 'image',
    },
  ],
  params: [
    {
      key: 'mode',
      type: 'select',
      labelKey: 'node.videoGen.paramMode',
      options: [
        { value: 'std', labelKey: 'node.videoGen.paramModeStd' },
        { value: 'pro', labelKey: 'node.videoGen.paramModePro' },
      ],
      defaultValue: 'pro',
    },
  ],
  maxOutputCount: 4,
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  supportedDurations: [5, 10],
  maxPromptLength: 2500,

  // Kling 专有，仅 Rust 侧读
  providerConfig: {
    klingModelName: 'kling-v3',
    klingEndpoint: 'image2video',
    creditsPerSecond: 10,
  },
};
```

文生视频模型示例（未来接入）：
```typescript
// models/video/wan/wan21T2V.ts
export const videoModel: VideoModelDefinition = {
  id: 'wan-2.1-t2v',
  providerId: 'wan',
  inputSlots: [],           // 无 slot，文生视频
  params: [
    { key: 'resolution', type: 'select', ... },
  ],
  providerConfig: { endpoint: '...', ... },
  ...
};
```

#### B3：VideoGenNodeData 简化

```typescript
// canvasNodes.ts
export interface VideoGenNodeData extends NodeDisplayData {
  modelId: string;          // 不再是 union 类型
  prompt: string;
  negativePrompt?: string;
  duration: number;
  aspectRatio: string;
  outputCount: number;
  extraParams: Record<string, unknown>;   // mode/cfgScale 等下沉到这里
  // 移除: mode, cfgScale, useTailFrame（运行时派生）
  currentBatch?: { ... };  // 不变
  derivedFrom?: DerivedFromMeta;
  generatedResultNodeIds: string[];
}
```

nodeRegistry 默认数据同步更新：
```typescript
createDefaultData: (): VideoGenNodeData => ({
  modelId: DEFAULT_VIDEO_MODEL_ID,
  prompt: '',
  duration: 5,
  aspectRatio: '16:9',
  outputCount: 1,
  extraParams: { mode: 'pro' },
  generatedResultNodeIds: [],
}),
```

#### B4：VideoGenNode 改为动态渲染

```tsx
// slot 区域改为读 model.inputSlots
{model.inputSlots.map((slot) => (
  <SlotCard key={slot.id} slot={slot} imageUrl={slotImages[slot.id]} nodeId={id} />
))}

// 参数栏改为读 model.params + 固定的 duration/aspectRatio/outputCount
{model.params.map((param) => (
  <ParamControl key={param.key} param={param} value={data.extraParams[param.key]} onChange={...} />
))}
```

**Phase B 验收**：Kling 行为与改前完全一致，tsc 通过，新建 `wan-2.1-t2v` adapter 文件后 VideoGenNode 自动渲染无 slot、不同 params。

---

### Phase C：Rust provider 路由

**改动文件**：`src-tauri/src/commands/ai.rs`、新增 `src-tauri/src/providers/`

#### C1：provider 模块目录

```
src-tauri/src/
├── commands/
│   └── ai.rs          ← 只做参数解析 + provider 路由，不含 API 逻辑
└── providers/
    ├── mod.rs
    ├── kling/
    │   ├── mod.rs
    │   ├── submit.rs  ← 原 ai.rs 里的 Kling 调用逻辑
    │   └── poll.rs
    └── wan/           ← 未来接入时新建
        └── mod.rs
```

#### C2：submit_video_batch 加 provider_id

```rust
// commands/ai.rs
#[derive(Deserialize)]
pub struct SubmitVideoBatchParams {
    pub provider_id: String,    // 新增
    pub node_id: String,
    pub batch_id: String,
    pub prompt: String,
    pub duration: u32,
    pub aspect_ratio: String,
    pub output_count: u8,
    pub slot_refs: HashMap<String, String>,   // { "firstFrame": "__img_ref__:xxx" }
    pub extra_params: serde_json::Value,      // mode/cfgScale 等 provider 专有
}

#[tauri::command]
pub async fn submit_video_batch(
    params: SubmitVideoBatchParams,
    state: State<'_, AppState>,
) -> Result<BatchSubmitResult, String> {
    match params.provider_id.as_str() {
        "kling" => providers::kling::submit_batch(params, state).await,
        id => Err(format!("Unknown video provider: {id}")),
    }
}
```

#### C3：前端 command 同步更新

```typescript
// commands/ai.ts
export async function submitVideoBatch(params: {
  providerId: string;     // 新增
  nodeId: string;
  batchId: string;
  modelId: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  outputCount: number;
  slotRefs: Record<string, string>;      // { firstFrame: '__img_ref__:xxx' }
  extraParams: Record<string, unknown>;  // { mode: 'pro', cfgScale: 0.5 }
}): Promise<BatchSubmitResult>
```

**Phase C 验收**：接入 Wan2.1 只需新建 `providers/wan/` 模块 + `models/video/wan/` adapter，不改任何现有文件。

---

## 4. 文件改动范围总览

| 文件 | Phase | 改动性质 |
|---|---|---|
| `nodes/VideoGenNode.tsx` | A + B | UI 瘦身 + 动态 slot/param 渲染 |
| `ui/nodeControlStyles.ts` | A | 常量调整 |
| `models/types.ts` | B | 重构 VideoModelDefinition |
| `models/video/kling/klingV3.ts` | B | 迁移到新接口 |
| `models/video/kling/klingV3Omni.ts` | B | 迁移到新接口 |
| `domain/canvasNodes.ts` | B | VideoGenNodeData 简化 |
| `domain/nodeRegistry.ts` | B | 默认数据更新 |
| `commands/ai.ts` | C | 加 providerId + slotRefs + extraParams |
| `application/ports.ts` | C | 同步接口更新 |
| `infrastructure/tauriAiGateway.ts` | C | 同步调用更新 |
| `src-tauri/src/commands/ai.rs` | C | 加路由，迁移 Kling 逻辑 |
| `src-tauri/src/providers/kling/` | C | 新建，承接迁入的 Kling 逻辑 |
| `App.tsx` | C | 调用参数更新 |

**不改动**：VideoResultNode、ImageResultNode、canvasStore 的 batch/variant 逻辑、Round 1-3 所有 commit。

---

## 5. 验收标准

### Phase A
- [ ] VideoGenNode idle 高度 ≤ 280px
- [ ] 无空白占位块
- [ ] `npx tsc --noEmit` 通过
- [ ] 手测：生成流程（提交→进度→结果）行为与改前一致

### Phase B
- [ ] `npx tsc --noEmit` 通过
- [ ] Kling V3 / V3 Omni 行为与改前完全一致
- [ ] 新建 `wan-2.1-t2v.ts` adapter（inputSlots 为空），VideoGenNode 自动渲染无 slot

### Phase C
- [ ] `cargo check` 通过
- [ ] `npx tsc --noEmit` 通过
- [ ] Kling 提交/取消/事件接收行为与改前一致
- [ ] 新增 provider 不改任何现有文件

---

## 6. 给实施者的说明

1. **三个 Phase 可独立交付**，Phase A 纯 UI 风险最低，建议优先；Phase B/C 可并行或顺序。
2. **Phase A 绝对不改数据层**，slot 仍从 edges 派生，modelId 仍是 union——只动 UI。
3. **Phase B 的迁移核心**：`mode`/`cfgScale` 从 `VideoGenNodeData` 顶层移到 `extraParams`，需要做一次持久化兼容（读取时若 `extraParams` 为空则从旧字段迁移）。
4. **Phase C 的 Kling 逻辑搬迁**不是重写，是移动文件——保持现有 Kling 调用逻辑不变，只是挪到 `providers/kling/submit.rs`。
5. 每个 Phase 结束按 `feat/refactor(<scope>): <why>` 格式单独 commit。

---

## 附录：竞品设计要点

Seedance 截图关键观察：
- 节点本体 = 纯内容区（视频画面），零配置 UI
- 浮动 prompt bar 在节点下方，包含 model 选择 + 参数
- 左右 `+` 按钮用于快速连线，不在节点内部

我们的选择（与竞品不同）：
- 保留 Gen 节点（配置型）+ Result 节点（内容型）的分离架构（已在 Round 2 落地）
- Gen 节点仍然内嵌 prompt 和参数（符合 PRD delta 的设计）
- **差距只在节点高度和 idle 空白块**，Phase A 就能对齐

---

**文档结束**

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-04-23 | 初稿 |
