# 实施计划:Web 端改写 + API 跑通 + 模型擂台 + 错误监控反馈(v1.0)

> 状态:待对齐
> 范围:**三条主线 + 一条配套**——把项目跑成 Web 应用、把 provider API 调用跑通、把模型擂台 UX 做出来,**配套**搭起错误监控 + 用户反馈通道(便于测试期收集问题)。
> 不在本计划:账号体系、计费、跨供应商动态路由(留给后续 PRD)。

---

## 一、当前形态确认

- 测试项目,目前以 Tauri 形态在跑,无线上用户、无历史包袱。本期目标就是把它转成 Web 形态测试。
- 前端已经引入运行时分流 `src/commands/platform.ts isTauriEnv()`,Web shim 起步(`src/commands/web/{image,dialog,llm,idb}.ts`)。
- AI 调用统一走 `canvasAiGateway`(`src/features/canvas/application/canvasServices.ts`),目前实现是 `infrastructure/tauriAiGateway.ts`,内部全是 Tauri `invoke(...)`。
- 视频生成擂台 `runModelArena`(VideoGenNode.tsx:323)已实现"同 batchId 多模型并发提交",所有 variants 自动合并到同一个 VideoResultNode 的 `variants[]`。**擂台主链路已通,缺的是 UX**。

---

## 二、目标

- **G1 Web 化跑通**:浏览器打开即用,不依赖 Tauri runtime;API 调用、文件、持久化、图像处理全部走 Web 实现。
- **G2 模型擂台可用**:用户提交一次 → 同提示词同参数自动跑所有可用模型 → 结果以**卡片堆叠**呈现,点击展开预览,可采纳。
- **G3 错误监控 + 用户反馈闭环**:任意 runtime 错误自动上报到监控看板;用户可在画布顶栏一键反馈;研发侧通过飞书机器人实时收到提醒,反馈条目落库可追踪状态。

---

## 三、任务一:Web 端改写

### 3.1 改造目标
- 同一份前端代码可在浏览器直接跑(去 Tauri 化)。
- 所有原本走 `invoke(...)` 的命令,**改成 HTTP 调用最小后端服务**(本期先用最小 BFF 跑通,不做完整 SaaS)。

### 3.2 最小后端(本期范围)
- **技术栈**:Node + TypeScript + Express/Fastify(可复用前端 provider 知识)。
- **职责仅有两类接口**:
  1. **AI 调用代理**:把前端原本的 Tauri invoke 命令一对一翻译成 HTTP `POST /api/ai/<command>`,服务端持有 provider API key 转发请求。
  2. **任务轮询**:对需要异步轮询的任务(Kling 视频、长任务图片),BFF 内部维护任务表,前端通过 `GET /api/jobs/:id` 拉状态(本期先用轮询,SSE 留到下个迭代)。
- **暂不做**:账号、项目持久化(本期项目数据先继续走 IndexedDB,与服务端无关)。

### 3.3 前端改造点

| 文件/模块 | 改动 |
| --- | --- |
| `src/commands/platform.ts` | **删除**(直接走 Web 实现,不再分流) |
| `src/commands/{image,llm,ai,projectState,system,update}.ts` | 内部 `invoke(...)` → `fetch('/api/...')`,对外签名不变 |
| `src/commands/web/*.ts` | 现有 shim 保留,Web 专属(图像处理走 Canvas API、文件对话框走 `<input>`)继续用 |
| `src/features/canvas/infrastructure/tauriAiGateway.ts` | 重命名 `httpAiGateway.ts`,内部全部 `invoke` 改 `fetch` |
| `src/features/canvas/application/canvasServices.ts` | 注入 `httpAiGateway`(替换原 `tauriAiGateway`) |
| `src-tauri/` | **整目录删除** |
| `src/components/TitleBar.tsx`、流量灯、自动更新模块 | 删除或换 Web 等价物 |
| `src/stores/projectStore.ts` 持久化通道 | 短期保留 IndexedDB 路径(本期不接服务端 DB) |
| `vite.config.ts`、`index.html` | 去 Tauri 入口配置 |

### 3.4 工作量估算
- 前端 1 人 · **5–6 工作日**(invoke→fetch 机械替换 + 删 Tauri 残留 + 联调)
- 后端 1 人 · **4–5 工作日**(最小 BFF + provider key 配置 + 轮询接口)
- 联调 1 人 · **2–3 工作日**

---

## 四、任务二:API 调用跑通

### 4.1 范围(本期需跑通的 capability)
- **图像生成/编辑**:nano-banana-2、gemini-flash-image 等 KIE 系
- **视频生成**:Kling
- **LLM 调用**:auto-select 模型用(`chooseVideoModel` 等)
- **图像本地处理**:已走前端 Canvas API(`commands/web/image.ts`),不需要 BFF

### 4.2 关键工作

| 步骤 | 说明 |
| --- | --- |
| 1. 把 Rust `src-tauri/src/providers/` 的逻辑移植到 BFF | 主要是 Kling 签名鉴权、KIE 调用、提交/查询/取消 |
| 2. BFF 提供与 Tauri 命令一一对应的 HTTP 端点 | 例如 `submit_video_batch` → `POST /api/ai/submit-video-batch` |
| 3. API key 管理 | 服务端环境变量持有,前端不再直传 |
| 4. 错误归一 | 把各家 provider 错误映射到统一 `{ code, message, retryable }` |
| 5. 联调 | 三类 capability 各跑一条主路径 + 一条失败路径 |

### 4.3 验收
- 前端代码不出现 `__TAURI__` 字样、不出现 `invoke(`。
- 三类 capability 在 Web 端可成功生成。
- API key 不出现在前端代码、不出现在浏览器 DevTools network 请求体里。

### 4.4 工作量估算
- 后端 1 人 · **5–7 工作日**(provider 移植是主要工作量)

---

## 五、任务三:模型擂台 UX 重做

### 5.1 现状问题
- 擂台主链路已经通(`runModelArena` + 同 batchId 自动汇总)。
- 但**结果展示**有两个硬伤:
  1. VideoResultNode 主区域只显示当前选中变体的缩略图;其他变体藏在右上角 `ChevronDown` 下拉里,用户感觉不到。
  2. 下拉网格每张卡只显示 `#1 #2`,**不显示是哪个模型出的**,擂台失去对比意义。

### 5.2 改造点(主要在 VideoResultNode)

**VideoResultNode.tsx**
- variants 数 ≥ 2 时,**主区域改为卡片网格**(替代单缩略图布局),每张卡:
  - 缩略图(沿用 `variant.thumbnailRef`)
  - **模型显示名**:`getVideoModel(variant.snapshotParams.modelId).displayName`
  - 时长徽标
  - 选中态(对应 `selectedVariantIndex`)用边框 + ✓ 标识
- 点击卡片 → 切换 `selectedVariantIndex` + 弹出 `isPlayerOpen` 大图/视频预览(已有逻辑)
- 卡片悬停出现「采纳」按钮 → `selectVariant(...)` + 删除同 batch 其他 variants(批量 `deleteVariant`)
- variants 数 = 1 时退化为现有单图布局
- 节点尺寸需要根据卡片数动态调整(现在固定 `VIDEO_RESULT_BASE_WIDTH`)

**VideoGenNode.tsx**(轻量改动)
- 自动选择按钮 `isAiModelChoiceEnabled`:开关只标记意图,**不再立即调 LLM**
- `submitTask` 开头若 flag 为真 → 先 `await chooseModelWithLlm()` 拿模型 id → 用返回值提交(避免读旧 `data.modelId`)
- 进行中的 batch 进度行可选地按 subTask 列出"模型名 → 状态",让擂台时用户看到每家进度

### 5.3 数据契约确认
- `VideoVariant.snapshotParams.modelId` 已存在,**无需 schema 改动**。
- `selectedVariantIndex / variants[]` 沿用,无需新增字段。
- 不需要后端改动,纯前端 UX。

### 5.4 验收
- 擂台模式提交后,出现可见的卡片网格(每模型一张卡)。
- 每张卡看得到模型名。
- 点击卡片可展开预览。
- 「采纳」按钮可一键确定一个并清掉其他。
- 单模型(非擂台)生成回退到现有单图布局,不破坏老体验。

### 5.5 工作量估算
- 前端 1 人 · **3–4 工作日**(主要在 VideoResultNode UX 重做 + VideoGenNode 自动选择按钮微调)

---

## 六、任务四:错误监控 + 用户反馈

### 6.1 现状问题
- 项目当前没有任何错误上报通道,Tauri 期所有运行时错误只在用户本地控制台,研发侧不知道线上(测试期)发生了什么。
- 用户遇到问题没有"反馈"入口,只能自己截图发群,易丢失、无追踪。
- Web 化后用户群可能扩散到内部多人,**必须在上线测试前把错误监控和反馈通道搭好**。

### 6.2 整体设计

```
┌────────── 浏览器(React) ──────────┐
│  全局错误捕获(window.onerror /    │
│  unhandledrejection / Sentry        │
│  ErrorBoundary / fetch 包装)       │
│            ↓                         │
│  Sentry SDK ── 自动上报 ─────────┐  │
│            ↓                      │  │
│  Toast「出错了 [反馈] [忽略]」     │  │
│            ↓ 用户点反馈            │  │
│  ┌──────────────┐                 │  │
│  │  顶栏 icon   │── 主动入口 ──┐  │  │
│  │ (TitleBar)   │              │  │  │
│  └──────────────┘              │  │  │
│            ↓                    ↓  │  │
│         FeedbackDialog          ↓  │  │
│            ↓                       │  │
│  feedbackTransport (双路并发)      │  │
│       │                            │  │
│       ├── Notion API ──┐           │  │
│       │   (反馈库 DB)   │           │  │
│       │                 │           │  │
│       └── 飞书 webhook ─┴── 群提醒 │  │
└─────────────────────────────────────┘  │
                                         │
              ┌── Sentry 看板 ←─────────┘
              │   告警 → 飞书 webhook
              └─────────────────────
```

### 6.3 技术选型(本期)

| 用途 | 选型 | 理由 |
| --- | --- | --- |
| 自动错误监控 | **Sentry 免费版**(5K 事件/月) | 行业标杆;5 行接入;自带去重 / source map / 飞书 webhook;后续可无缝换 GlitchTip 自托管 |
| 用户主动反馈库 | **Notion Database** | 自带状态机(新建/处理中/已修复);团队多角色友好;integration token 限定到这一个 DB,泄露影响可控 |
| 实时提醒 | **飞书自定义机器人** + 加签 | 国内最直接;消息卡片支持点击跳 Notion |
| 反馈对话框 | 自建 React 组件 | 收集错误上下文 + 用户描述 + 联系方式 |

### 6.4 前端改造点

| 文件/模块 | 改动 |
| --- | --- |
| `src/features/feedback/FeedbackDialog.tsx` | **新建**:统一反馈表单(自动入口和主动入口共用) |
| `src/features/feedback/FeedbackButton.tsx` | **新建**:顶栏小 icon 入口;有未发送反馈时红点 |
| `src/features/feedback/feedbackStore.ts` | **新建**:zustand 切片(对话框开关、当前 errorContext、待发送队列) |
| `src/features/feedback/feedbackTransport.ts` | **新建**:并发调 Notion + 飞书,失败入队重试 |
| `src/features/feedback/errorCapture.ts` | **新建**:`window.onerror` + `unhandledrejection` + Sentry 钩子 + 5 分钟去重指纹 |
| `src/features/feedback/notion/database.ts` | **新建**:`POST https://api.notion.com/v1/pages`,字段映射 |
| `src/features/feedback/lark/webhook.ts` | **新建**:HMAC-SHA256 加签 + interactive card 构造 |
| `src/components/TitleBar.tsx:147` 旁 | 插入 `<FeedbackButton />`,样式与语言切换按钮一致 |
| `src/App.tsx` | 顶层 `Sentry.init(...)` + `<Sentry.ErrorBoundary>`(替代手写 ErrorBoundary) |
| `src/i18n/locales/{zh,en}.json` | 新增 `feedback.*` 文案,中英同步 |
| `.env.example` | 加入 `VITE_SENTRY_DSN`、`VITE_NOTION_INTEGRATION_TOKEN`、`VITE_NOTION_FEEDBACK_DATABASE_ID`、`VITE_LARK_WEBHOOK_URL`、`VITE_LARK_WEBHOOK_SECRET` |

### 6.5 数据契约(发送 payload)

```ts
interface FeedbackPayload {
  source: 'manual' | 'auto-error' | 'node-failure';
  level: 'error' | 'warning' | 'info';
  summary: string;                  // 一句话描述(列表展示用)
  errorMessage?: string;
  errorStack?: string;              // 截断到 2000 字符,脱敏
  userDescription?: string;
  userContact?: string;
  context: {
    appVersion: string;             // 由 vite 注入
    projectId: string | null;
    projectName: string | null;
    selectedNodeId: string | null;
    selectedNodeType: string | null;
    userAgent: string;
    url: string;
    timestamp: string;              // ISO
    fingerprint: string;            // 错误去重指纹
    sentryEventId?: string;         // 已上报 Sentry 时回填,Notion 卡片可附跳转链接
  };
}
```

### 6.6 关键策略
- **去重**:同一指纹 5 分钟内只触发一次 toast,避免错误风暴刷屏。
- **限流**:同一会话每分钟最多 3 次反馈提交,防误点。
- **本地兜底**:提交前先写 IndexedDB,key `pending-feedback-<ts>`;Notion/飞书发送成功后清除,失败保留并在顶栏 icon 红点提示。
- **PII 脱敏**:堆栈中如出现路径、token、邮箱模式,提交前正则脱敏。
- **环境隔离**:`environment: import.meta.env.MODE`,Sentry 看板能区分 dev/staging/prod 数据。

### 6.7 安全要点
- Notion integration **权限严格限定到反馈 DB 的写入**,泄露最坏情况是被刷垃圾,删条目即可。
- 飞书机器人开启**签名校验**,前端计算 `HMAC-SHA256(timestamp + secret)`,即便 secret 暴露,接入安全也仅依赖签名时序。
- Sentry DSN 本身公开可见,**这是设计如此**(只能上报、不能读取),不视为机密。
- **以上限制都属于"前端直连模式"的妥协**:期 1 接受;BFF 上线后,所有 token 应迁到服务端 env,前端只调 `/api/feedback`。

### 6.8 验收
- 浏览器随便扔一个未捕获异常 → Sentry 看板内 5 秒内出现事件;飞书群同步收到一条提醒。
- 顶栏点击反馈 icon → 弹出对话框 → 提交后:
  - Notion DB 新增一行,字段完整、状态默认"新建"
  - 飞书群收到 interactive card,点击可跳 Notion 页面
  - 本地 IndexedDB 标记已发送
- 断网情况下提交 → 顶栏小红点;恢复后可手动重发。
- 同一错误 5 分钟内连续触发 3 次 → 只弹一次 toast、只上报一次 Sentry、只写一行 Notion。

### 6.9 工作量估算
- 前端 1 人 · **1 工作日**(Sentry 接入 0.5h,其余约 6h)
- 反馈 DB / 飞书机器人配置 0.5h(产品/项目侧准备,不算工程工时)

### 6.10 阻塞性前置
1. Sentry 账号(免费版即可),拿 DSN
2. Notion 反馈库 + integration token + database ID
3. 飞书自定义机器人(含签名校验) → webhook URL + signing secret

---

## 七、里程碑与排期

| # | 阶段 | 内容 | 周期 |
| --- | --- | --- | --- |
| M1 | BFF 骨架 | Express/Fastify + provider key 配置 + 一个空跑通的 `/api/health` | 1–2 天 |
| M2 | API 移植 | Kling + KIE + LLM 三类 capability 的 HTTP 端点 | 5–7 天 |
| M3 | 前端去 Tauri | 删 platform 分流 + invoke→fetch 全替换 + 删 src-tauri | 5–6 天(可与 M2 并行后半段) |
| M4 | 联调跑通 | Web 端图像/视频/LLM 三类主路径走通 | 2–3 天 |
| M5 | 模型擂台 UX | VideoResultNode 卡片堆叠 + VideoGenNode 自动选择按钮重做 | 3–4 天 |
| **M5.5** | **错误监控 + 反馈** | Sentry 接入、顶栏反馈入口、Notion + 飞书双路通道、本地兜底队列 | **1 天**(可与 M3/M5 并行) |
| M6 | 回归与上线 | 跨浏览器验证 + 简易部署 | 2–3 天 |

**总周期**:**3 周左右**(BFF 1 人 + 前端 1 人,关键路径在 M2 provider 移植;M5.5 不在关键路径)。

---

## 七、风险与权衡

- **provider 移植精度**:Rust → TS 重写时签名/鉴权细节容易出错,需要 Kling/KIE 各跑一组真实任务做基准对照。
- **API key 管理**:本期服务端环境变量持有;后续如果开放给多用户必须重做。
- **本期不做账号**:意味着 BFF 前置一个简单 IP 白名单或基础鉴权,避免被外部刷接口。
- **轮询不是 SSE**:本期前端继续 5s 轮询任务状态,与画布交互争抢主线程的问题保留;**这是已知不优,接受先跑通**,后续接 SSE 后再优化。
- **持久化继续走 IndexedDB**:意味着换浏览器项目就丢,本期测试阶段可接受。
- **反馈通道 token 暴露在前端**:Notion integration token / 飞书 webhook secret 都在 Vite env,被反编译可见;通过权限最小化 + 加签缓解,但严格安全要等 BFF。

---

## 八、待确认问题

1. BFF 部署在哪?(自有服务器 / 云函数 / Docker)
2. 服务端持有 provider key 的方式?(`.env` / 配置中心 / Vault)
3. 接口鉴权方案(本期):IP 白名单 / 简单 token / 完全开放(仅内网)?
4. 模型擂台是否所有 capability 都开,还是先视频跑通再扩到图像?
5. Sentry 用 SaaS 免费版还是直接自托管 GlitchTip?(本期建议 SaaS,事件量起来再迁)
6. Notion 反馈库由谁创建并维护字段?(产品 or 研发负责人)
7. 飞书机器人发到哪个群?是否需要按 severity 分群?

---

## 九、本计划与之前 PRD 的关系

之前的 `PRD_Web迁移与异步生成_v1.0.md` 描述的是**完整重写为 SaaS + 跨供应商动态路由**的目标态。本计划是**第一阶段最小可用版本**:
- 不做账号体系
- 不做服务端项目持久化
- 不做 SSE / 异步任务 SSOT
- 不做跨供应商路由

只做"Web 跑通 + API 通 + 擂台 UX 可用 + 错误监控反馈"这四件最直接的事。后续按 PRD 节奏迭代到完整 SaaS。
