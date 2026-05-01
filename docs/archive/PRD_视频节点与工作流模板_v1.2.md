# PRD:视频节点与工作流模板(V0.x)— v1.2

> **文档定位**:本文档为 AI Coding 工具(Codex / Claude Code / Cursor)编写,用于指导代码实现。细节密集、边界清晰、不留歧义。
>
> **项目锚点**:基于《分镜助手(Storyboard Copilot)》现有架构扩展。**严禁重构现有架构**,所有新增能力通过"追加注册"的方式进入系统。
>
> **v1.2 相对 v1.1 的变化**:
> - 附录 A(Kling API 规范)完全按**真实官方文档**校准:域名、JWT 鉴权、请求/响应字段、错误码、异步机制、并发规则
> - 模型支持扩展:V1 接入 `kling-v3` 和 `kling-v3-omni` 两个模型,模型注册表支持"能力矩阵"动态配置
> - 视频节点新增**首尾帧模式**支持(可选)
> - 取消机制澄清:Kling 无服务端取消接口,本项目实现"本地放弃"并向用户明确告知
> - 并发控制改为"用户可配 + 撞 429 自动退避"双保险机制
> - 增加 Kling 认证(AccessKey + SecretKey)的 settings 管理方案

---

## 0. 前置阅读清单(AI 必读)

动手前必读文件:

1. `/README.md`
2. `/src/features/canvas/domain/canvasNodes.ts` — 节点数据类型 SSOT
3. `/src/features/canvas/domain/nodeRegistry.ts` — 节点行为注册 SSOT
4. `/src/features/canvas/nodes/index.ts` — React Flow 组件映射
5. `/src/features/canvas/nodes/StoryboardGenNode.tsx` — **VideoGenNode 的主要参照物**
6. `/src/features/canvas/nodes/StoryboardNode.tsx` — **VideoResultNode 的主要参照物**
7. `/src/features/canvas/nodes/ImageEditNode.tsx` — 端口 Handle 实现参照
8. `/src/features/canvas/models/registry.ts` + `/src/features/canvas/models/image/` — 模型注册表模式
9. `/src/stores/canvasStore.ts` — 画布状态、历史、**派生相关 action**
10. `/src/stores/projectStore.ts` — 项目生命周期、持久化协调
11. `/src/stores/settingsStore.ts` — 设置存储(新增 Kling 鉴权字段)
12. `/src/commands/ai.ts` + `/src-tauri/src/commands/ai.rs` — Command 层模式
13. `/src-tauri/src/ai/` — 各提供商 Rust 实现

**读完后必须能回答**:节点新增的 4 步流程、节点派生模式、Command 跨境机制、imagePool 机制、Tauri Event 推送机制。答不出就继续读,不要开工。

---

## 1. 背景与目标

### 1.1 产品当前状态

《分镜助手》基于节点画布的 AI 分镜创作桌面工具,已实现图片上传、AI 图像生成/编辑(4 家提供商)、分镜切割、场景构图、剧本解析、LLM 分镜生成等。技术栈:React 18 + TypeScript + Zustand + @xyflow/react + Tauri 2 + Rust + SQLite。

### 1.2 本版要解决的痛点

- **痛点 A**:画布只能生成静态图片,短剧产出要的是视频片段,必须跳出到外部工具
- **痛点 B**:好用的节点链路无法复用,每次新项目从零搭建

### 1.3 成功指标

**视频节点**:
- 用户配置 VideoGenNode → 连接首帧图片 → 点击生成 → 成功后自动在下游派生 VideoResultNode
- 支持首尾帧模式,提高生成可控性
- 单画布支持用户配置的并发上限(默认 3)并行视频任务
- App 崩溃/重启后,已完成的视频节点完整恢复,中断任务降级为 failed
- VideoResultNode 预留 `video-output` 端口,为未来下游节点(视频延长、对口型等)留接口

**工作流模板**:
- 10 秒内把当前画布保存为模板
- 5 秒内一键加载模板
- 模板不含生成结果,只含结构和参数

---

## 2. Scope

### 2.1 In Scope

**视频节点(双节点)**:
- `VideoGenNode`:请求节点,可手动创建
- `VideoResultNode`:结果节点,由 Gen 派生,不可手动创建
- 派生机制(canvasStore 一等公民 action)
- Kling V1 接入两个模型:`kling-v3` 和 `kling-v3-omni`
- 首帧 + 首尾帧模式(首尾帧可选)
- JWT 鉴权 + Token 生命周期管理
- 异步任务:Rust 侧轮询 + Tauri Event 推送进度
- 本地放弃机制(明确告知用户积分仍扣除)
- 并发控制:用户可配 + 429 自动退避
- `videos/` 本地存储 + videoPool 引用计数
- 重启恢复(展示用,不恢复执行)

**模板系统**:
- 保存、加载、列表、删除
- 所有节点的 `purifyForTemplate` 实现
- VideoResultNode 不进模板(purifyForTemplate 返回 null)

### 2.2 Out of Scope(显式不做,AI 不要自扩)

- 文生视频(必须有上游图片)
- Omni 的 `<<image_N>>` / `<<element_N>>` 引用语法(V1 不暴露,但 Omni 模型的 prompt 字段保留支持)
- Kling 其他能力:多图参考、动作控制、视频延长、对口型、数字人、视频特效、主体管理
- 第二家视频提供商
- 视频编辑、剪辑、拼接、转码
- 模板跨成员共享
- 任务跨机恢复
- 视觉美化
- `callback_url` 机制(V1 只用轮询,callback 留接口但不实现)
- `kling-v2-6` 音频、`kling-v2-5-turbo`、`kling-video-o1`(模型注册表支持扩展,V1 不启用)

### 2.3 已知后续方向

- Omni 引用语法(V2):让用户能在 prompt 里用 `<<image_1>>` 混合多图/主体
- 主体管理(V3):跨视频角色一致性
- 视频延长/对口型节点(V3+):作为 VideoResultNode 的下游消费者
- Web 协作版(D 需求):独立立项

---

## 3. 术语表

| 术语 | 定义 |
|---|---|
| **VideoGenNode** | 视频生成请求节点 |
| **VideoResultNode** | 视频结果节点,由 Gen 派生 |
| **派生(derive)** | Gen 生成成功时自动创建 Result 并连线的过程 |
| **视频任务(video task)** | 一次具体的视频生成请求,Kling 返回 task_id |
| **JWT Token** | HS256 算法签名的鉴权令牌,30 分钟过期 |
| **本地放弃(local abandon)** | 用户取消视频任务时,前端停止监听、Rust 停止轮询,但 Kling 服务端继续执行并扣费 |
| **imagePool / videoPool** | 按内容哈希去重的素材池 |
| **能力矩阵** | 每个 Kling 模型支持的 duration / aspect_ratio / mode 的集合 |

---

## 4. 视频节点(双节点架构)

### 4.1 用户故事

作为短剧创作者,我希望在画布上把关键帧图片变成视频片段。生成后的视频应作为独立节点保留,同一个生成节点可以多次尝试,派生多个结果节点供我对比选择。我希望对每个镜头明确指定首帧(必须)和可选的尾帧,用于控制镜头的起止画面。

### 4.2 节点架构

```
[UploadNode(首帧)] ─┐
                    ├──→ [VideoGenNode] ──派生──→ [VideoResultNode]
[UploadNode(尾帧)] ─┘         │                          │
                        (用户配置+触发)              (展示、播放、
                                                    可作为下游输入)
```

### 4.3 VideoGenNode 详细设计

#### 4.3.1 外观与结构

**节点类型**:`videoGenNode`
**可手动创建**:是
**视觉参照**:`StoryboardGenNode`(最接近的"异步批量生成"模式)

**布局(从上到下)**:

1. **标题区**:视频图标 + "视频生成" + 模型选择下拉(kling-v3 / kling-v3-omni)
2. **预览区**(仅 idle 时):占位图标 + 引导文字"连接首帧图片后填写提示词"
3. **状态区**(仅有 currentTask 时):进度条 + 状态文字 + 已派生计数("已生成 2 个视频片段")
4. **参数区**:
   - Prompt 多行输入框(上限 2500 字符,显示字数)
   - 时长选择(动态:根据所选模型从能力矩阵取)
   - 比例选择(动态)
   - 模式选择(std / pro)
   - 负向提示词(可折叠,默认折叠)
   - **"启用尾帧"开关**(关闭时节点只有一个图片输入口;打开时展开第二个图片输入口)
5. **操作区**:
   - 主按钮"生成视频"
   - "放弃等待"按钮(仅 currentTask 活跃时显示,见 §4.6.5)
6. **端口**:
   - **左侧(输入)**:
     - `image-input`:首帧图片(必需)
     - `image-tail-input`:尾帧图片(可选,开关关闭时此端口隐藏)
   - **右侧(输出)**:
     - `result-output`:自动连线到派生的 Result,**不允许用户手动拖拽**

**端口视觉规范**:严格参照 `ImageEditNode`。Handle 圆点在节点边缘,**不在节点内部显示文字标签**。必要的提示用 tooltip。

**设计限制**:不允许自创样式、颜色、间距。所有视觉 token 复用现有节点。

#### 4.3.2 数据类型

在 `canvasNodes.ts` 新增:

```typescript
export interface VideoGenNodeData {
  // === 参数(用户可编辑)===
  modelId: 'kling-v3' | 'kling-v3-omni';
  prompt: string;                       // 最多 2500 字符
  negativePrompt?: string;              // 最多 2500 字符
  duration: 5 | 10 | number;            // 取决于模型能力,具体值见能力矩阵
  aspectRatio: '16:9' | '9:16' | '1:1';
  mode: 'std' | 'pro';
  cfgScale?: number;                    // 0.0 - 1.0,可选,不填则用 Kling 默认

  // === 首尾帧控制 ===
  useTailFrame: boolean;                // 开关,默认 false

  // === 任务状态(不进模板)===
  currentTask?: {
    taskId: string;
    status: 'pending' | 'submitted' | 'processing' | 'succeed' | 'failed' | 'abandoned';
    progress: number;                   // 0-100,Kling 不返回精确进度,用状态映射:submitted=10, processing=50, succeed=100
    errorMessage?: string;
    errorCode?: number;                 // Kling 业务错误码
    submittedAt: number;                // 本地时间戳
  };

  // === 派生历史(不进模板)===
  generatedResultNodeIds: string[];
}
```

**状态命名特别说明**:本项目沿用 Kling 的状态枚举值(`submitted`/`processing`/`succeed`/`failed`),不使用 v1.1 里的自定义 `polling` 等中间态。这样 Rust 和前端状态能 1:1 映射到 Kling 响应,减少翻译错误。新增 `pending`(前端提交前)和 `abandoned`(用户放弃)用于本地状态。

#### 4.3.3 nodeRegistry 注册

```typescript
[CANVAS_NODE_TYPES.videoGen]: {
  type: CANVAS_NODE_TYPES.videoGen,
  displayName: '视频生成',
  menuVisible: true,
  manualCreatable: true,
  capabilities: {
    hasToolbar: true,
    hasPromptInput: true,
    hasModelSelector: true,
    supportsDelete: true,
  },
  connectivity: {
    inputs: [
      { id: 'image-input', label: '首帧', accept: ['image'], required: true },
      { id: 'image-tail-input', label: '尾帧', accept: ['image'], required: false, conditionalVisible: (data) => data.useTailFrame },
    ],
    outputs: [
      { id: 'result-output', label: '结果', produces: 'video-result', autoConnected: true },
    ],
  },
  createDefaultData: (): VideoGenNodeData => ({
    modelId: 'kling-v3',
    prompt: '',
    duration: 5,
    aspectRatio: '16:9',
    mode: 'pro',
    useTailFrame: false,
    generatedResultNodeIds: [],
  }),
  purifyForTemplate: (data) => ({
    modelId: data.modelId,
    prompt: data.prompt,
    negativePrompt: data.negativePrompt,
    duration: data.duration,
    aspectRatio: data.aspectRatio,
    mode: data.mode,
    cfgScale: data.cfgScale,
    useTailFrame: data.useTailFrame,
    generatedResultNodeIds: [],
    // currentTask 不保留
  }),
}
```

### 4.4 VideoResultNode 详细设计

#### 4.4.1 外观与结构

**节点类型**:`videoResultNode`
**可手动创建**:否(只能派生)
**视觉参照**:`StoryboardNode`

**布局**:

1. **标题区**:播放图标 + "视频片段 #{sequenceNumber}"
2. **视频缩略图区**:首帧缩略图 + 悬停显示大播放按钮
3. **元数据区**(可折叠,默认折叠):
   - 模型 / 时长 / 比例 / 模式
   - Prompt 截断显示(悬停显示全文)
   - 生成时间
4. **操作区**:
   - "播放"按钮(弹窗)
   - "下载"按钮(保存到用户指定路径)
   - "溯源"按钮(在画布上高亮源 Gen 节点)
5. **端口**:
   - **左侧**:`gen-input`(隐藏,接受派生连线)
   - **右侧**:`video-output`(显示,预留下游)

#### 4.4.2 数据类型

```typescript
export interface VideoResultNodeData {
  // === 溯源 ===
  sourceGenNodeId: string;
  sequenceNumber: number;               // 同 Gen 的第几次生成
  generatedAt: number;

  // === 生成参数快照(冻结)===
  snapshotParams: {
    modelId: string;
    prompt: string;
    negativePrompt?: string;
    duration: number;
    aspectRatio: string;
    mode: string;
    cfgScale?: number;
    firstFrameRef: string;              // __img_ref__:xxx
    tailFrameRef?: string;              // 如果用了首尾帧
  };

  // === 结果资源 ===
  videoRef: string;                     // __video_ref__:xxx
  thumbnailRef: string;                 // __img_ref__:yyy
  videoDurationSeconds: number;         // 实际时长(Kling 响应中的 duration 字段)

  // === Kling 任务元信息(记录用)===
  klingTaskId: string;
  klingVideoId?: string;                // Kling 响应 data.task_result.videos[0].id
  // 注意:Kling 视频 URL 30 天过期,我们下载后不保存原始 URL
}
```

#### 4.4.3 nodeRegistry 注册

```typescript
[CANVAS_NODE_TYPES.videoResult]: {
  type: CANVAS_NODE_TYPES.videoResult,
  displayName: '视频片段',
  menuVisible: false,
  manualCreatable: false,
  capabilities: {
    hasToolbar: true,
    hasPromptInput: false,
    hasModelSelector: false,
    supportsDelete: true,
  },
  connectivity: {
    inputs: [
      { id: 'gen-input', label: '来源', accept: ['video-result'], hidden: true, autoConnected: true },
    ],
    outputs: [
      { id: 'video-output', label: '视频', produces: 'video' },
    ],
  },
  createDefaultData: () => {
    throw new Error('VideoResultNode 不能手动创建,只能通过 VideoGenNode 派生');
  },
  purifyForTemplate: () => null,  // 不进模板
}
```

### 4.5 派生机制

在 `canvasStore.ts` 新增 action:

```typescript
deriveVideoResultNode(params: {
  sourceGenNodeId: string;
  snapshotParams: VideoResultNodeData['snapshotParams'];
  videoRef: string;
  thumbnailRef: string;
  videoDurationSeconds: number;
  klingTaskId: string;
  klingVideoId?: string;
}): string {
  // 原子操作,整体作为一次 undo snapshot:
  // 1. 查 sourceGenNodeId 的 generatedResultNodeIds.length + 1 得到 sequenceNumber
  // 2. 计算 position:Gen 节点右侧 + 纵向按 sequenceNumber 错开
  // 3. 创建 VideoResultNode
  // 4. 创建 Edge(Gen.result-output → Result.gen-input)
  // 5. 更新 Gen 节点的 generatedResultNodeIds 追加
  // 6. 清除 Gen 节点的 currentTask(回到 idle)
  // 7. 触发持久化
  // 返回新 ResultNode id
}
```

**派生位置**:
- x = Gen.x + Gen.width + 80
- y = Gen.y + (sequenceNumber - 1) × (ResultNode.height + 24)

### 4.6 视频任务状态机

#### 4.6.1 状态定义(与 Kling 响应对齐)

| 状态 | 含义 | UI 表现 | 允许操作 |
|---|---|---|---|
| (无 currentTask) | idle | 参数可编辑,显示"生成"按钮 | 点击生成 |
| `pending` | 前端本地校验和 JWT 准备中 | Loading 圈 | 无(短暂态) |
| `submitted` | Kling 已接收任务,进入队列 | 进度条 10% | 放弃等待 |
| `processing` | Kling 正在生成 | 进度条 50% | 放弃等待 |
| `succeed` | **瞬时态**,立即派生 Result 并清除 | - | - |
| `failed` | 失败 | 错误提示 + 重试按钮 | 重试 / 改参数重试 |
| `abandoned` | 用户本地放弃 | 显示"已放弃等待(Kling 仍在后台执行)" | 再次生成(清除此状态) |

**关键**:`succeed` 是瞬时态。Rust 检测到 Kling 返回 succeed 后,先下载视频、提取首帧,再通过 Event 通知前端。前端收到 event 后调用 `deriveVideoResultNode`,Gen 节点的 currentTask 清除回到 idle——**用户看不到 Gen 节点停留在 succeed 状态**。

#### 4.6.2 状态转移图

```
idle
  │
  │ 点击生成 + 卫语句通过
  ↓
pending
  │
  │ submit 成功,Kling 返回 task_id
  ↓
submitted
  │
  │ 首次轮询返回 processing
  ↓
processing
  │
  ├─ 返回 succeed → 派生 Result + 清除 task → idle
  ├─ 返回 failed → failed(可重试)
  └─ 用户点"放弃" → abandoned
```

#### 4.6.3 轮询策略(Rust 侧)

- **不使用 callback**,V1 用轮询
- **间隔**:指数退避 5s → 8s → 13s → 20s → 30s(上限)
- **超时**:提交起 10 分钟未 succeed 自动 failed(Kling 文档说视频生成"通常 1-5 分钟",10 分钟余量充足)
- **429 处理**:如果轮询过程中撞到 429(并发超限,错误码 1303),不停止轮询,只是**延长当前请求的退避**
- **轮询发起方**:Rust 端,用 tokio task 独立跑,通过 Tauri Event 推送状态

#### 4.6.4 Tauri Event

**Event 名**:`video-task-progress`

**Payload**:
```typescript
{
  taskId: string;                       // Kling task_id
  nodeId: string;                       // Gen 节点 id
  status: 'submitted' | 'processing' | 'succeed' | 'failed';
  progress: number;                     // 映射值,见下
  // 仅 succeed 时:
  videoRef?: string;
  thumbnailRef?: string;
  videoDurationSeconds?: number;
  klingVideoId?: string;
  // 仅 failed 时:
  error?: string;
  errorCode?: number;
}
```

**Progress 映射**(Kling 不给精确进度,前端显示用):
- `submitted` → 10
- `processing` → 50
- `succeed` → 100
- `failed` → 显示错误图标,不显示进度

#### 4.6.5 本地放弃("取消"的真实含义)

**Kling API 没有取消接口**。点击"放弃等待"后:

1. **前端**:
   - 弹 Dialog:"Kling 暂不支持取消已提交的任务。放弃等待后,Kling 后台仍会执行并扣除积分,你将无法获得生成结果。是否继续?"
   - 按钮:[继续等待] [确认放弃]
2. **用户确认后**:
   - 前端设置 Gen 节点 `currentTask.status = 'abandoned'`
   - 调用 `cancel_video_task` Command
3. **Rust**:
   - 停止轮询该 taskId 的循环
   - 释放本地并发槽
   - **不调用 Kling 取消接口**(没有)
4. **用户视角**:Gen 节点显示"已放弃等待",可以再次生成

**按钮文案**:用"**放弃等待**"而非"取消",避免误导。

#### 4.6.6 重启恢复

App 启动时,Rust 扫描所有项目的 VideoGenNode,对处于 `submitted` / `processing` 状态的节点:

- 将 `currentTask.status` 改写为 `failed`
- `errorMessage` = "App 重启,任务已中断"
- 不主动查询 Kling(因为任务可能已完成,下次打开可能拿不回了)

**注意**:Kling `task_id` 24 小时过期,超期查询返回 UNKNOWN。本版"不恢复执行"的设计正好规避这个问题。未来如果做恢复,必须考虑 24 小时窗口。

### 4.7 首尾帧模式

#### 4.7.1 UI 行为

- `useTailFrame` 开关默认 OFF
- OFF 时:节点左侧只显示 `image-input` 端口;UI 无尾帧相关元素
- ON 时:节点左侧显示两个端口(`image-input` 和 `image-tail-input`);UI 上给出尾帧连接提示

#### 4.7.2 Service 层行为

生成时:
- `useTailFrame=false` → 按图生视频(仅首帧)调用
- `useTailFrame=true` 且 `image-tail-input` 已连接 → 按图生视频(首尾帧)调用
- `useTailFrame=true` 但 `image-tail-input` 未连接 → 卫语句拦截:Toast "启用尾帧后必须连接尾帧图片"

#### 4.7.3 模型限制

根据 Kling 文档能力矩阵,`kling-video-o1` 系列**仅支持首帧**(见附录 A §A.7)。V1 只启用 `kling-v3` 和 `kling-v3-omni`,**两者都支持首尾帧**,所以 V1 的模型切换不受此限制。未来扩展其他模型时,要在能力矩阵里标注 `supportsTailFrame`,UI 相应处理。

### 4.8 完整交互流程(Happy Path)

```
1. 用户从菜单创建 VideoGenNode
2. 从 UploadNode 连线到 image-input
3. (可选)切换"启用尾帧"开关 → 从另一 UploadNode 连到 image-tail-input
4. 在 VideoGenNode 输入 prompt、选模型、时长、比例、模式
5. 点击"生成视频"

6. [Service 卫语句按顺序执行]
   a. 首帧图片上游存在? → graphImageResolver.resolve(nodeId, 'image-input')
   b. useTailFrame && 尾帧上游存在?
   c. prompt 非空且 ≤ 2500 字符?
   d. modelId 合法且支持当前参数组合?(duration/aspectRatio/mode 在模型能力矩阵内)
   e. Kling AccessKey + SecretKey 已配置?(settingsStore)
   f. 当前并发 < 用户设置的最大并发(默认 3)?

7. 设 currentTask = { status: 'pending', submittedAt: now, progress: 0 }

8. 前端 invoke('submit_video_task', {
     nodeId, modelId, prompt, negativePrompt, duration, aspectRatio, mode, cfgScale,
     firstFrameRef, tailFrameRef?  // 从 imagePool 取 Base64 或上传临时 URL
   })

9. [Rust submit_video_task]
   a. 从 settingsStore 读 AK/SK
   b. 生成或复用 JWT Token(见 §A.2)
   c. 从 imagePool 读取图片,转成 Kling 要求的格式(URL 或 Base64,§A.6)
   d. 构造 request body(按 §A.6 或 §A.8 映射)
   e. POST 到对应 endpoint(§A.5)
   f. 拿到 task_id,返回前端 { taskId }
   g. 启动 tokio task 开始轮询

10. 前端更新 currentTask.status = 'submitted', taskId = xxx

11. [Rust 轮询循环]
    loop {
      sleep(interval);
      resp = GET /v1/videos/{action}/{taskId}  (§A.9)
      match resp.data.task_status {
        'submitted' | 'processing' => {
          emit('video-task-progress', {...});
          interval = min(interval * 1.6, 30s);
        }
        'succeed' => {
          videoUrl = resp.data.task_result.videos[0].url;
          download(videoUrl) → videos/<hash>.mp4
          extractFirstFrame() → images/<hash>.jpg
          emit('video-task-progress', { status: 'succeed', videoRef, thumbnailRef, ... });
          break;
        }
        'failed' => {
          emit('video-task-progress', { status: 'failed', error: resp.data.task_status_msg });
          break;
        }
      }
      if elapsed > 10min { emit failed; break; }
    }

12. [前端收到 succeed event]
    canvasStore.deriveVideoResultNode({...})
    → 新建 VideoResultNode + 自动连线
    → Gen.generatedResultNodeIds 追加
    → 清除 Gen.currentTask(回到 idle)
    Toast "视频生成完成"

13. 用户点击 ResultNode 缩略图 → 弹窗播放本地视频文件
```

### 4.9 Error Path

所有错误必须**显式反馈用户**,不允许静默失败。

**VideoGenNode**:

| 异常场景 | 检测位置 | 反馈方式 | Gen 节点状态 |
|---|---|---|---|
| 首帧上游无图 | Service 卫语句 | Toast | idle |
| 启用尾帧但尾帧上游无图 | Service 卫语句 | Toast | idle |
| Prompt 为空或 > 2500 字符 | Service 卫语句 | Toast | idle |
| AK/SK 未配置 | Service 卫语句 | Dialog + 跳转设置 | idle |
| 并发已达用户上限 | Service 卫语句 | Toast | idle |
| 模型参数组合非法 | Service 卫语句 | Toast(说明哪个参数不被当前模型支持) | idle |
| JWT Token 生成失败 | Rust | Toast | failed |
| HTTP 401 / 业务码 1000/1001 | Rust | Dialog "鉴权失败,请检查 AK/SK" | failed |
| HTTP 429 / 业务码 1303 | Rust 轮询内部自动退避 | 轮询期间不报错 | 维持当前状态 |
| HTTP 429 / 业务码 1303(submit 阶段) | Rust | Toast "Kling 并发已满,请稍后重试" | failed |
| 网络错误 | Rust | Toast + 重试建议 | failed |
| 内容审核失败 | Rust | Toast 显示 Kling 错误信息 | failed |
| 生成超时(10 分钟) | Rust 轮询 | Toast | failed |
| 视频下载失败 | Rust | Toast | failed |
| 视频 URL 过期(理论 30 天,本版无触发) | - | - | - |
| 磁盘空间不足 | Rust | Dialog | failed |
| 用户放弃等待 | 前端 | Dialog 二次确认 | abandoned |
| App 重启中断 | Rust 启动扫描 | 节点显示 failed | failed |

**VideoResultNode**:

| 异常 | 处理 |
|---|---|
| 视频文件丢失 | 节点显示"视频文件缺失"占位 + 建议删除节点 |
| 缩略图丢失 | 用默认占位图 + 视频本体仍可尝试播放 |
| 播放失败 | 弹窗显示错误 + 提供"用外部播放器打开"按钮 |
| 源 Gen 节点已删除 | ResultNode **保留**,但溯源按钮失效,显示"源节点已删除" |

### 4.10 持久化

#### 4.10.1 视频文件存储

- **路径**:`app_data_dir/videos/`
- **命名**:SHA-256 内容哈希
- **引用**:`__video_ref__:<hash>`
- **videoPool**:Rust 侧实现引用计数 + 未引用清理,参照 imagePool

#### 4.10.2 Store 快照

- VideoGenNode:全字段(currentTask 和 generatedResultNodeIds 也进)
- VideoResultNode:全字段

#### 4.10.3 videoPool 引用来源

所有 VideoResultNode 的 `videoRef` 字段即为引用源。项目快照被删除时,该项目内所有 ResultNode 的 videoRef 解除引用。无引用视频次日清理。

### 4.11 Command 层

**前端 `src/commands/ai.ts`**:

```typescript
export async function submitVideoTask(params: {
  nodeId: string;
  modelId: 'kling-v3' | 'kling-v3-omni';
  prompt: string;
  negativePrompt?: string;
  duration: number;
  aspectRatio: string;
  mode: string;
  cfgScale?: number;
  firstFrameRef: string;
  tailFrameRef?: string;
}): Promise<{ taskId: string }>;

export async function cancelVideoTask(params: {
  nodeId: string;
  taskId: string;
}): Promise<void>;  // 本地放弃,不调用 Kling API
```

**后端 `src-tauri/src/commands/ai.rs`**:

对应 `#[tauri::command]` 实现。

**Event**:`video-task-progress`

### 4.12 模型注册表

新增 `src/features/canvas/models/video/kling/` 目录:

```typescript
// src/features/canvas/models/video/types.ts
export interface VideoModelDefinition {
  id: string;
  displayName: string;
  providerId: 'kling';
  klingModelName: string;              // 传给 Kling API 的 model_name
  klingEndpoint: 'text2video' | 'image2video' | 'omni-video';
  supportedDurations: number[];         // 用户可选的时长
  supportedAspectRatios: string[];
  supportedModes: ('std' | 'pro')[];
  supportsTailFrame: boolean;
  maxPromptLength: number;
  creditsPerSecond: number;             // 估算用,V1 填预估值,V2 从 Kling 账单接口拉
}
```

```typescript
// src/features/canvas/models/video/kling/klingV3.ts
export const klingV3: VideoModelDefinition = {
  id: 'kling-v3',
  displayName: 'Kling V3',
  providerId: 'kling',
  klingModelName: 'kling-v3',
  klingEndpoint: 'image2video',
  supportedDurations: [5, 10],
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  supportedModes: ['std', 'pro'],
  supportsTailFrame: true,
  maxPromptLength: 2500,
  creditsPerSecond: 10,  // 预估,最终以 Kling 账单为准
};

// src/features/canvas/models/video/kling/klingV3Omni.ts
export const klingV3Omni: VideoModelDefinition = {
  id: 'kling-v3-omni',
  displayName: 'Kling V3 Omni',
  providerId: 'kling',
  klingModelName: 'kling-v3-omni',
  klingEndpoint: 'image2video',  // V1 仅用图生视频入口,不用 omni 引用语法
  supportedDurations: [3, 5, 10, 15],
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  supportedModes: ['std', 'pro'],
  supportsTailFrame: true,
  maxPromptLength: 2500,
  creditsPerSecond: 15,
};
```

**在 `models/registry.ts` 扩展**:
- 新增 `videoModels` 分支
- 暴露 `getVideoModelById(id)` / `getAllVideoModels()` / `canModelHandle(modelId, params)` 辅助函数

### 4.13 Settings 改动

**`settingsStore` 新增字段**(都要持久化):

```typescript
// Kling 鉴权
kling: {
  accessKey?: string;
  secretKey?: string;
  enabled: boolean;
};

// 视频并发控制
videoConcurrency: {
  maxConcurrent: number;  // 默认 3,用户可改,取值 1-10
};
```

**设置页 UI 新增**:

1. "视频提供商"分组
2. Kling 子节:
   - AccessKey 输入框
   - SecretKey 输入框(type=password,支持显隐切换)
   - "测试连接"按钮(点击生成一次 JWT 并调 `GET /v1/videos/text2video?pageNum=1&pageSize=1` 验证)
   - 启用开关
3. "视频生成并发"子节:
   - 数字输入框(1-10),默认 3
   - 说明文字:"同时进行的视频任务数量上限。超过此数量时,新任务会排队等待。建议根据 Kling 账号资源包调整。"

### 4.14 验收标准(Phase 1 MVP)

**必须全部通过**:

- [ ] 可从菜单创建 VideoGenNode,视觉与 StoryboardGenNode 一致
- [ ] i18n 所有 key 正确翻译,中英文均测试
- [ ] 六个布局区域完整
- [ ] 首帧 / 尾帧端口行为正确(开关控制可见性)
- [ ] 端口 Handle 位置严格参照 ImageEditNode,节点内部无端口文字标签
- [ ] 设置页 Kling 鉴权配置,"测试连接"能真实验证
- [ ] 点击"生成"真实调用 Kling API(非 mock)
- [ ] Rust 侧 JWT Token 能正确生成 + 30 分钟内复用 + 过期自动重新生成
- [ ] 轮询通过 Tauri Event 推进度,前端不自己轮询
- [ ] 成功后自动派生 VideoResultNode 并连线
- [ ] 再次生成派生第 2/3/N 个 ResultNode
- [ ] 并发控制生效(达到上限时拦截)
- [ ] 429 错误的退避重试生效
- [ ] 放弃等待的二次确认 Dialog 文案正确,Rust 端真的停止轮询
- [ ] 视频文件存在 `videos/` 目录
- [ ] 缩略图首帧提取正常
- [ ] 点击缩略图弹窗播放
- [ ] 下载按钮工作
- [ ] 溯源按钮高亮源 Gen 节点
- [ ] App 重启:已成功 Result 恢复;submitted/processing 的 Gen 降级 failed
- [ ] 首尾帧模式功能正常
- [ ] `npm exec tsc --noEmit` 通过
- [ ] `cd src-tauri && cargo check` 通过(必须跑完)
- [ ] 提供 `npm run tauri dev` 真实桌面端录屏或连续截图,展示完整 Happy Path

---

## 5. 工作流模板

### 5.1 本质

**模板包含**:节点类型、位置、连线、**静态参数**
**模板不包含**:生成结果、任务状态、派生关系、上传素材、VideoResultNode 这类结果节点(整个被过滤)

### 5.2 保存流程

见 v1.1,保持不变。关键点:
- 调用每个节点的 `purifyForTemplate`
- 返回 null 的节点(VideoResultNode)过滤掉
- 涉及被过滤节点的 edge 一并过滤

### 5.3 加载流程

见 v1.1,保持不变。关键点:
- 为每个节点生成新 id
- 清空所有运行态、结果态
- 连线按新 id 重建

### 5.4 所有节点净化规则

| 节点类型 | 净化策略 |
|---|---|
| UploadNode | 清 imageRef 和 uploadedAt |
| ImageEditNode | 清 imageRef、status、taskId、generatedAt、errorMessage,保留 prompt/modelId/参数 |
| StoryboardNode | 清 frames,保留切割参数 |
| StoryboardGenNode | 清所有生成结果,保留 prompt 模板和批量参数 |
| TextAnnotationNode | 保留全部 |
| GroupNode | 保留结构和 layout |
| ScriptUploadNode | 清 scriptContent 和 scriptFile |
| StoryboardLlmNode | 清 llmOutput 和 taskId,保留 prompt 模板和 model |
| SceneComposerNode | 清生成结果,保留场景配置 |
| **VideoGenNode** | 清 currentTask 和 generatedResultNodeIds,保留所有参数 |
| **VideoResultNode** | **返回 null,整节点不进模板** |

### 5.5 其他

Command 层、SQLite 表、封面图机制、Error Path、验收标准:沿用 v1.1。

---

## 6. 技术架构影响

### 6.1 SSOT 扩展清单

**新增**:
- 两种节点类型常量、数据类型、注册项、渲染组件映射
- `videoModels` 模型注册分支
- `settingsStore` 的 Kling 配置字段 + videoConcurrency 字段

**扩展现有**:
- `nodeRegistry` 所有已有节点补 `purifyForTemplate`,支持返回 null

**新增 action**:`deriveVideoResultNode`

### 6.2 新增 Commands

- `submit_video_task`
- `cancel_video_task`(本地放弃)
- `test_kling_connection`(设置页测试按钮用)
- 模板相关 5 个:`save_template` / `list_templates` / `get_template` / `delete_template` / `update_template`

### 6.3 新增 Event

- `video-task-progress`

### 6.4 新增表

- SQLite 新增 `templates` 表

### 6.5 新增目录

- `app_data_dir/videos/`
- `app_data_dir/templates/covers/`

### 6.6 兼容性

所有新字段可选,老数据打开正常。

---

## 7. 分阶段交付

### Phase 1:视频节点 MVP

- 双节点 UI + 派生机制
- 设置页 Kling 鉴权
- Rust 侧完整 Kling 真实接入(submit + 轮询 + 下载 + JWT 管理)
- Happy Path + 主要 Error Path
- 首尾帧模式
- videoPool 持久化
- 重启恢复

### Phase 2:完善

- 所有 Error Path 细节
- 放弃机制 + 并发控制精细化
- 溯源、下载、元数据折叠等 ResultNode 交互
- 录屏验收

### Phase 3:模板

- purifyForTemplate 全节点
- 模板 SQLite + Command + UI

---

## 8. 自检清单

- [ ] 文件规模符合项目约束
- [ ] i18n 完整且实测生效(不止加 key,要实测翻译出现)
- [ ] 所有新节点/模型/命令在对应 SSOT 注册
- [ ] 无硬编码颜色/尺寸
- [ ] 无跨层调用
- [ ] tsc --noEmit 通过
- [ ] **cargo check 必须跑完,不接受超时**
- [ ] `npm run build` 成功
- [ ] `docs/testing/` 下有手工测试脚本
- [ ] **`npm run tauri dev` 真实桌面端截图/录屏证明视觉和交互正确**
- [ ] 派生的 ResultNode 视觉上确实出现在 Gen 节点下游且有连线

---

## 9. 给实施者的特别提醒

1. **不自作主张改架构**。有改进建议记录到 PRD 的"改进建议"附录,不要自己动手。
2. **参照物严格**:VideoGenNode 参照 StoryboardGenNode,VideoResultNode 参照 StoryboardNode,Handle 参照 ImageEditNode。不要凭空发明。
3. **派生机制是一等公民**,作为 canvasStore 的 action 实现,不是组件里临时拼凑。要支持 undo 原子性。
4. **状态机严格按 §4.6**,不要加自定义中间态。
5. **Tauri Event 用官方标准**,不自己发明。
6. **Kling API 字段严格按附录 A**。附录 A 是从真实官方文档提取的。**任何 LLM 推荐的"变体字段名"都要拒绝**,以附录 A 为准。
7. **JWT Token 要做生命周期管理**,不要每次请求都生成,也不要永不过期。30 分钟内复用。
8. **视频 URL 30 天过期**,必须本地下载,不保存原始 URL 给用户使用。
9. **Kling 没有取消接口**,"放弃等待"只是本地放弃。二次确认文案必须明确告知"积分仍扣"。
10. **完成 = 带录屏/截图 + 跑完 cargo check + 跑完 tsc**。不接受"理论上能跑"的交付。

---

## 附录 A:可灵 Kling API 对接规范(基于真实官方文档)

### A.1 基础信息

- **域名**:`https://api-beijing.klingai.com`(新域名,不是旧的 `api.klingai.com`)
- **Content-Type**:`application/json`
- **鉴权**:JWT Bearer Token(HS256 签名)
- **任务模式**:全异步(提交 → 轮询)

### A.2 JWT 鉴权

**生成逻辑**(Rust 侧实现):

```
Payload:
{
  "iss": <AccessKey>,
  "exp": <current_timestamp + 1800>,    // 30 分钟后过期
  "nbf": <current_timestamp - 5>        // 5 秒前开始生效(容忍时钟偏差)
}

Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Secret: <SecretKey>

Authorization: Bearer <生成的 JWT Token>  // 注意 Bearer 后一个空格
```

**Rust 实现建议**:用 `jsonwebtoken` crate。

**Token 管理**:
- 应用内维护一个 `KlingAuthManager` struct
- 每次请求前检查 Token 剩余有效期 < 5 分钟则重新生成
- Token 生成失败立即返回错误,不重试(配置问题不会自己修好)

### A.3 通用响应格式

```json
{
  "code": 0,                   // 业务码,0 成功,非 0 失败
  "message": "string",
  "request_id": "string",      // 跟踪用
  "data": { ... }              // 业务数据
}
```

### A.4 错误码映射

| HTTP | 业务码 | 含义 | Rust 处理 |
|---|---|---|---|
| 200 | 0 | 成功 | 正常 |
| 401 | 1000 | 鉴权失败 | Toast "AK/SK 无效",不重试 |
| 401 | 1001 | Authorization 为空 | 内部错误,日志记录并 failed |
| 429 | 1303 | 并发超限 | **指数退避重试**,不算失败 |
| 其他 4xx | 参数错误 | Toast 显示 message 字段 | failed |
| 5xx | 服务端错 | 重试 3 次后 failed | |

### A.5 V1 使用的 Endpoints

| 功能 | Method | URL |
|---|---|---|
| 提交图生视频任务 | POST | `/v1/videos/image2video` |
| 查询图生视频任务 | GET | `/v1/videos/image2video/{task_id}` |

**V1 仅用这两个端点**。未来扩展时参考文档其他章节。

### A.6 图生视频请求参数

```json
{
  "model_name": "kling-v3",
  "image": "<URL 或 Base64>",
  "image_tail": "<URL 或 Base64>",   // 首尾帧模式时提供
  "prompt": "...",                    // ≤ 2500 字符
  "negative_prompt": "",              // ≤ 2500 字符,可选
  "duration": "5",                    // 字符串!不是数字!"5" 或 "10"
  "mode": "pro",                      // "std" 或 "pro"
  "aspect_ratio": "16:9",             // "16:9" / "9:16" / "1:1"
  "cfg_scale": 0.5,                   // 0.0-1.0,可选
  "callback_url": "",                 // V1 不用,留空
  "external_task_id": ""              // V1 不用,留空
}
```

**关键陷阱**:
- `duration` 是**字符串**(`"5"` / `"10"`),不是数字。**AI 实施时最容易踩的坑**
- `image` 和 `image_tail` 支持 URL 或 Base64,**Base64 不加 `data:image/png;base64,` 前缀**
- 图片要求:`.jpg/.jpeg/.png`,≤10MB,宽高 ≥300px,宽高比介于 1:2.5 ~ 2.5:1

**图片传输建议**(Rust 侧):
- 小于 2MB 的图片:用 Base64 内嵌
- 大于 2MB:需要另外有 URL 可访问的图床(V1 本地桌面无公网 URL,因此**强制限制首尾帧 ≤2MB**,超过提示用户压缩)
- 未来做 Web 协作版时可以用云端 OSS URL

### A.7 模型能力矩阵(从文档第 7 页提取)

| 模型 | 时长 | 支持首尾帧 | 单/多镜头 |
|---|---|---|---|
| kling-video-o1 std | 3-10s | 仅首帧 | 单 |
| kling-video-o1 pro | 3-10s | 仅首帧 | 单 |
| kling-v3-omni std | 3-15s | 支持 | 单/多 |
| kling-v3-omni pro | 3-15s | 支持 | 单/多 |
| kling-v3(文档暗示) | 5-10s | 支持 | 单 |

V1 用 `kling-v3` 和 `kling-v3-omni`,均支持首尾帧。

### A.8 多镜头模式(V1 不启用但注册表预留)

Omni 模型支持 `multi_shot: true`,可以用 `multi_prompt` 数组分段定义每个镜头。V1 不暴露此能力,但数据类型 `VideoGenNodeData` 不设计冲突字段,V2 可以无缝加入。

### A.9 查询任务响应

**请求**:`GET /v1/videos/image2video/{task_id}`

**响应**:
```json
{
  "code": 0,
  "message": "SUCCEED",
  "request_id": "...",
  "data": {
    "task_id": "...",
    "task_status": "succeed",
    "task_status_msg": "",
    "created_at": 1722769557708,
    "updated_at": 1722769557708,
    "task_result": {
      "videos": [
        {
          "id": "...",                    // 记为 klingVideoId
          "url": "https://.../video.mp4",  // 30 天有效!立即下载!
          "duration": "5"                  // 字符串
        }
      ]
    }
  }
}
```

**任务状态枚举**:`submitted` / `processing` / `succeed` / `failed`

**task_id 有效期**:24 小时。超期查询返回 UNKNOWN,本版通过"不恢复执行"规避。

### A.10 视频 URL 处理(关键!)

**视频 URL 有效期 30 天**。Rust 侧流程:

1. 轮询拿到 `task_status: 'succeed'`
2. 立即 GET 下载 `task_result.videos[0].url` 到本地
3. 计算 SHA-256,存到 `videos/<hash>.mp4`
4. 用 ffmpeg 或 Rust video 库提取首帧,存到 `images/<hash>.jpg`(作为 thumbnailRef)
5. 通过 Event 把 `__video_ref__:<hash>` 和 `__img_ref__:<thumbhash>` 推给前端
6. **原始 URL 不保留**(30 天过期后无意义)

### A.11 限速和并发

- 并发限制按 Kling 账号资源包
- 超限返回 429 + 业务码 1303
- 建议指数退避,初始 ≥ 1 秒
- **任务创建占用并发,查询不占用**

### A.12 测试连接实现

设置页"测试连接"按钮点击时:

```
1. 前端 invoke('test_kling_connection', { accessKey, secretKey })
2. Rust:
   a. 用传入的 AK/SK 生成 JWT
   b. 调 GET /v1/videos/image2video?pageNum=1&pageSize=1
   c. 200 + code=0 → 返回成功
   d. 401 → 返回 "AK/SK 无效"
   e. 网络错误 → 返回 "网络不可达"
3. 前端显示结果
```

---

## 附录 B:参考文件索引

| 能力 | 参照文件 |
|---|---|
| 异步批量生成节点 | `nodes/StoryboardGenNode.tsx` |
| 工具派生结果节点 | `nodes/StoryboardNode.tsx` |
| 端口 Handle 实现 | `nodes/ImageEditNode.tsx` |
| 模型注册 | `models/image/kie/nanoBananaPro.ts` |
| Rust Command | `src-tauri/src/commands/ai.rs` |
| Tauri Event | Tauri 官方文档 |
| 图片存储 | `src-tauri/src/ai/` 的 imagePool |

---

## 附录 C:版本变更

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-04-21 | 初稿,单节点 |
| v1.1 | 2026-04-21 | 改为双节点架构 |
| v1.2 | 2026-04-22 | 真实 Kling API 文档校准;新增首尾帧、并发配置、本地放弃、JWT 管理;模型扩展到 v3 + v3-omni |

---

**文档结束**。实施前请确认:
1. 已通读附录 A
2. 理解状态机 §4.6
3. 理解派生机制 §4.5
4. 理解本地放弃 vs Kling 真取消的差别(§4.6.5)
5. 理解 30 天视频 URL 和 24 小时 task_id 两个时间窗口的影响

不理解的任何一条都回来问,不要猜。
