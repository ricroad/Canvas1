# 生成节点架构统一计划 v1.0
# (视频 + 图片节点 Provider-Agnostic 重构)

> **定位**：统一 VideoGenNode 与 ImageEditNode 的架构设计，解决 Kling 硬编码问题，为后续多模型接入建立可扩展基础。
> **不替换** PRD delta v1.0，与 Round 1-3 正交，可独立推进。
> **前置**：Round 1-3 已完成，`VideoResultNode`/`ImageResultNode` 内容节点已就绪。

---

## 1. 现状对比与核心差距

### 1.1 架构成熟度对比

| 能力 | ImageEditNode | VideoGenNode | 差距说明 |
|---|---|---|---|
| `extraParams: Record<string,unknown>` | ✅ 已有 | ❌ `mode`/`cfgScale` 写死在顶层 | 视频需补 |
| `modelId: string`（非 union 类型） | ✅ `model: string` | ❌ `'kling-v3' \| 'kling-v3-omni'` | 视频需改 |
| 动态参数控件（读 schema 渲染） | ✅ `ModelParamsControls` | ❌ 硬编码 4 个 `<select>` | 视频需借鉴 |
| `ImageModelDefinition.resolveRequest` | ✅ provider 抽象 | ❌ `klingModelName`/`klingEndpoint` 在公共接口 | 视频需重构 |
| `ExtraParamDefinition` schema | ✅ 已定义 | ❌ 无 | 视频复用图片侧 |
| 输出数量（batch） | ⚠️ `n: 1\|2\|4` 旧字段 | ✅ `outputCount`（Round 1 新增） | 图片需对齐 |
| Gen/Result 分离 | ⚠️ 结果仍在节点内（stack） | ✅ VideoResultNode 独立 | 图片需对齐 |
| Rust provider 路由 | ⚠️ 多 provider 但无统一路由 | ❌ 直连 Kling | 两侧都需要 |

**结论**：图片节点的参数层已经走对了，视频节点需要向图片对齐；两侧共同缺失的是 Gen/Result 完全分离（图片）和 Rust provider 路由（共同）。

---

## 2. 目标架构（统一后）

```
┌─────────────────────────────────────────────────────────┐
│                    Gen 节点（配置型）                     │
│  prompt + 动态 inputSlots + 动态 params + 生成按钮        │
│  读 ModelDefinition.inputSlots / params / extraParamSchema│
│  不显示任何生成结果                                       │
└───────────────────────┬─────────────────────────────────┘
                        │ deriveOrUpdateResultBatch
                        ▼
┌─────────────────────────────────────────────────────────┐
│               Result 节点（内容型，已完成）               │
│  variants[] + selectedVariantIndex + carousel UI         │
│  VideoResultNode ✅ / ImageResultNode ✅                   │
└─────────────────────────────────────────────────────────┘

ModelDefinition（provider-agnostic）
  inputSlots: SlotDef[]          ← 驱动 slot 渲染（视频新增）
  params / extraParamsSchema     ← 驱动参数控件（图片已有，视频复用）
  providerConfig: unknown        ← provider 专有，仅 Rust 读

submitBatch（前端 command）
  providerId: string             ← 统一入参，驱动 Rust 路由

Rust: submit_*_batch → providers/<providerId>/submit()
```

---

## 3. 分阶段实施

### Phase A：VideoGenNode UI 瘦身（纯 UI，最低风险）

**目标**：消灭空白占位块，节点 idle 高度从 430px 压到 ≤280px

**改动文件**：`VideoGenNode.tsx`、`nodeControlStyles.ts`

#### A1：删除 idle 占位块

删除以下 `!data.currentTask` 分支的整个 idle div（约 10 行）：
```tsx
// 删除
{!data.currentTask ? (
  <div className="flex min-h-[110px] items-center justify-center ...">
    <Clapperboard ... />
    <span>{t('node.videoGen.idleHint')}</span>
  </div>
) : ( ... )}
```

idle 状态下不渲染占位符，prompt 直接跟在 slot 后面。

#### A2：进度状态内联到 action 行

```tsx
// 删除独立状态 block，改为 action 行右侧一行文字
<div className="mt-auto flex items-center gap-2">
  <UiButton ...>生成视频</UiButton>
  {isBusy && <span className="text-[11px] text-text-muted">{batchSummary 的紧凑版}</span>}
  {isBusy && <UiButton ...>放弃</UiButton>}
</div>
```

#### A3：调整默认高度常量

```typescript
const VIDEO_GEN_NODE_DEFAULT_HEIGHT = 280;  // 430 → 280
const VIDEO_GEN_NODE_MIN_HEIGHT = 240;      // 360 → 240
```

**验收**：节点 idle 高度 ≤ 280px，无空白占位，tsc 通过，生成流程行为不变。

---

### Phase B：VideoGenNode 动态参数（向 ImageEditNode 对齐）

**目标**：参数栏从硬编码 4 个 `<select>` 改为读 `VideoModelDefinition` 渲染，复用 `ExtraParamDefinition`

**改动文件**：`models/types.ts`、`models/video/kling/*.ts`、`VideoGenNode.tsx`、`canvasNodes.ts`、`nodeRegistry.ts`

#### B1：VideoModelDefinition 添加 `params` + `inputSlots`

```typescript
// models/types.ts 扩展（不破坏现有字段，新增两个可选字段）
export interface VideoInputSlotDef {
  id: string;           // 'firstFrame' | 'tailFrame' | ...
  handleId: string;     // ReactFlow handle id
  labelKey: string;
  emptyLabelKey: string;
  required: boolean;
}

export interface VideoModelDefinition {
  // ... 现有字段保留 ...

  // 新增（有默认值，老代码不报错）
  inputSlots?: VideoInputSlotDef[];
  params?: ExtraParamDefinition[];    // 复用图片侧的 ExtraParamDefinition

  // 移除（迁移到 providerConfig）
  // klingModelName → providerConfig.klingModelName
  // klingEndpoint  → providerConfig.klingEndpoint
  providerConfig?: Record<string, unknown>;
}
```

#### B2：Kling model 文件迁移

```typescript
// klingV3.ts 改写
export const videoModel: VideoModelDefinition = {
  id: 'kling-v3',
  providerId: 'kling',
  // ...
  inputSlots: [
    { id: 'firstFrame', handleId: 'image-first-frame',
      labelKey: 'node.videoGen.firstFrameSlotLabel',
      emptyLabelKey: 'node.videoGen.firstFrameSlotEmpty', required: true },
    { id: 'tailFrame', handleId: 'image-tail-frame',
      labelKey: 'node.videoGen.tailFrameSlotLabel',
      emptyLabelKey: 'node.videoGen.tailFrameSlotEmpty', required: false },
  ],
  params: [
    { key: 'mode', type: 'enum', labelKey: 'node.videoGen.paramMode',
      options: [{ value: 'std', label: 'Std' }, { value: 'pro', label: 'Pro' }],
      defaultValue: 'pro' },
  ],
  providerConfig: {
    klingModelName: 'kling-v3',
    klingEndpoint: 'image2video',
  },
};
```

#### B3：VideoGenNodeData 简化

```typescript
// canvasNodes.ts
export interface VideoGenNodeData extends NodeDisplayData {
  modelId: string;           // string，不再是 union
  prompt: string;
  negativePrompt?: string;
  duration: number;
  aspectRatio: string;
  outputCount: number;
  extraParams: Record<string, unknown>;  // mode/cfgScale 下沉到此
  // 移除顶层: mode, cfgScale, useTailFrame
  currentBatch?: { ... };    // 不变
  derivedFrom?: DerivedFromMeta;
  generatedResultNodeIds: string[];
}
```

持久化兼容：读取时若 `extraParams` 不存在则从旧 `mode`/`cfgScale` 迁移。

#### B4：VideoGenNode 改为动态渲染

```tsx
// slots 区域
{(selectedModel.inputSlots ?? defaultKlingSlots).map((slot) => (
  <SlotCard key={slot.id} slot={slot} imageUrl={slotImages[slot.id]} />
))}

// 参数区复用 ModelParamsControls（图片侧已有）
<VideoParamsControls
  model={selectedModel}
  duration={data.duration}
  aspectRatio={data.aspectRatio}
  outputCount={data.outputCount}
  extraParams={data.extraParams}
  onDurationChange={...}
  onAspectRatioChange={...}
  onOutputCountChange={...}
  onExtraParamChange={...}
/>
```

或直接把图片的 `ModelParamsControls` 扩展为通用版。

**验收**：Kling 行为不变，tsc 通过，新建空 slots 的 adapter 文件后 VideoGenNode 自动渲染无 slot。

---

### Phase C：ImageEditNode 结果分离 + outputCount 对齐

**目标**：图片节点也完全遵循 Gen（配置）+ Result（内容）分离，移除节点内的旧 stack 展示

**改动文件**：`ImageEditNode.tsx`、`canvasNodes.ts`、`nodeRegistry.ts`

#### C1：`n` → `outputCount`，`stack` → `ImageResultNode`

```typescript
// canvasNodes.ts 改写 ImageEditNodeData
export interface ImageEditNodeData extends NodeDisplayData {
  prompt: string;
  model: string;
  size: ImageSize;
  requestAspectRatio?: string;
  extraParams?: Record<string, unknown>;
  outputCount: number;          // 替换 n: 1|2|4
  isGenerating?: boolean;
  generationStartedAt?: number | null;
  generationDurationMs?: number;
  generatedResultNodeIds: string[];  // 与 VideoGenNodeData 对齐
  derivedFrom?: DerivedFromMeta;
  // 移除: stack, activeIndex, pendingCandidates, candidateSelection
}
```

#### C2：生成出口改为 `deriveOrUpdateResultBatch(kind: 'image')`

已在 Round 3 部分实现，Phase C 完成收口：
- `handleGenerate` 成功回调调用 `deriveOrUpdateResultBatch`（已做），不再写入 `stack`
- 节点本体不渲染 `imageUrl`（结果由 `ImageResultNode` 承载）
- 节点 idle 状态和生成中状态与 VideoGenNode 对齐

#### C3：ImageEditNode UI 瘦身

图片节点 UI 本身已经是 prompt + 底部参数栏的紧凑布局，**不需要大改**。
主要变化：
- 移除节点内部的结果图展示区（`data.imageUrl` 相关渲染）
- 保留 prompt textarea + `ModelParamsControls` 底部栏

**验收**：图片生成流程出口走 `ImageResultNode`，`ImageEditNode` 本体不显示结果图，tsc 通过。

---

### Phase D：Rust Provider 路由（视频 + 图片统一）

**目标**：`submit_video_batch` / `submit_image_batch` 加 `providerId` 路由，新 provider 只需新建模块

**改动文件**：`src-tauri/src/commands/ai.rs`，新建 `src-tauri/src/providers/`

#### D1：目录结构

```
src-tauri/src/
├── commands/
│   └── ai.rs                ← 仅路由，不含 API 调用逻辑
└── providers/
    ├── mod.rs
    ├── kling/
    │   ├── submit.rs        ← 原 ai.rs 的 Kling 逻辑平移
    │   └── poll.rs
    └── (wan/ hailuo/ ...)   ← 未来新建
```

#### D2：统一入参结构

```rust
#[derive(Deserialize)]
pub struct SubmitVideoBatchParams {
    pub provider_id: String,
    pub node_id: String,
    pub batch_id: String,
    pub prompt: String,
    pub duration: u32,
    pub aspect_ratio: String,
    pub output_count: u8,
    pub slot_refs: HashMap<String, String>,   // { "firstFrame": "__img_ref__:xxx" }
    pub extra_params: serde_json::Value,
}

#[tauri::command]
pub async fn submit_video_batch(params: SubmitVideoBatchParams, ...) {
    match params.provider_id.as_str() {
        "kling" => providers::kling::submit_batch(params, state).await,
        id => Err(format!("Unknown provider: {id}")),
    }
}
```

#### D3：前端 command 同步

```typescript
// commands/ai.ts
export async function submitVideoBatch(params: {
  providerId: string;
  nodeId: string;
  batchId: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  outputCount: number;
  slotRefs: Record<string, string>;
  extraParams: Record<string, unknown>;
}): Promise<BatchSubmitResult>
```

**验收**：Kling 行为不变，新增 provider 不改任何现有文件，cargo check 通过。

---

## 4. 文件改动范围

| 文件 | Phase | 性质 |
|---|---|---|
| `nodes/VideoGenNode.tsx` | A + B | UI 瘦身 + 动态 slot/param |
| `models/types.ts` | B | VideoModelDefinition 扩展 |
| `models/video/kling/*.ts` | B | 迁移到新接口 |
| `domain/canvasNodes.ts` | B + C | VideoGenNodeData 简化，ImageEditNodeData 对齐 |
| `domain/nodeRegistry.ts` | B + C | 默认数据更新 |
| `nodes/ImageEditNode.tsx` | C | 移除结果渲染，移除 stack |
| `commands/ai.ts` | D | 加 providerId + slotRefs |
| `application/ports.ts` | D | 接口同步 |
| `infrastructure/tauriAiGateway.ts` | D | 调用同步 |
| `src-tauri/src/commands/ai.rs` | D | 加路由 |
| `src-tauri/src/providers/kling/` | D | 新建，承接 Kling 逻辑 |

**不改动**：VideoResultNode、ImageResultNode、canvasStore 的 batch/variant 逻辑。

---

## 5. 验收标准

### Phase A
- [ ] VideoGenNode idle 高度 ≤ 280px，无空白占位块
- [ ] `npx tsc --noEmit` 通过
- [ ] 手测：Kling 生成流程完整可用

### Phase B
- [ ] `npx tsc --noEmit` 通过
- [ ] Kling V3 / V3 Omni 行为与改前一致
- [ ] 新建无 inputSlots 的 adapter（文生视频）后 VideoGenNode 自动渲染无 slot

### Phase C
- [ ] `npx tsc --noEmit` 通过
- [ ] 图片生成结果进入 `ImageResultNode`，`ImageEditNode` 本体不显示结果图
- [ ] `stack`/`activeIndex` 相关代码清零

### Phase D
- [ ] `cargo check` 通过
- [ ] `npx tsc --noEmit` 通过
- [ ] Kling 视频 + 图片生成行为不变
- [ ] 新增 provider 只需新建文件，不改现有代码

---

## 6. 实施顺序建议

```
Phase A（1-2h）→ Phase B（3-4h）→ Phase C（2-3h）→ Phase D（3-4h）
```

- A 和 B 针对视频，C 和 D 可以并行
- Phase A 最低风险，建议立即交给 Codex
- Phase C 有一定迁移成本（旧 stack 数据需兼容处理），建议做前确认线上无遗留旧格式快照

---

## 7. 与竞品设计的关系

| 竞品（Seedance）| 我们的方案 | 说明 |
|---|---|---|
| 节点 = 纯内容，无配置 UI | Gen 节点（配置）+ Result 节点（内容）分离 | 两种路线，我们的更符合工作流 canvas 范式 |
| 浮动 prompt bar 在节点外 | prompt 仍在 Gen 节点内 | 符合 PRD delta 设计，不跟随 |
| 无 slot 概念（直接上传） | inputSlots 由 model 定义驱动 | 比竞品更灵活，支持 i2v / t2v 自动切换 |

---

## 附录：图片模型现有 ExtraParamDefinition 示例

```typescript
// 已在 ImageModelDefinition 中使用，视频侧直接复用
{
  key: 'enable_web_search',
  type: 'boolean',
  labelKey: 'modelParams.enableWebSearch',
  defaultValue: false,
}
```

视频侧的 `mode`/`cfgScale` 用同样格式声明在 `VideoModelDefinition.params` 里即可。

---

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-04-23 | 初稿，合并视频+图片统一重构方案 |
