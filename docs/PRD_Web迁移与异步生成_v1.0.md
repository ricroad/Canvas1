# PRD：Web 平台化重写 & 跨供应商动态路由（v1.0）

> 状态：草案 · 待评审
> 范围：放弃 Tauri 桌面形态，将本项目**完全重写为 Web 平台**；建立 BFF 与跨供应商路由层，将生成调用移出前端阻塞路径，且任意单一 provider 排队/限流时自动被其他 provider 接管。
> 北极星：**阶段式异步生成：用户操作不中断，阶段产物可等待**；且**单一供应商峰值不影响出图成功率与 P95 时延**。

---

## 1. 背景与重定位

### 1.1 重定位
- 桌面端形态（Tauri + Rust + 本地 SQLite + 本地 API key）废弃，不再做"双形态共存"。
- 新形态是面向团队的 SaaS：浏览器即用，账号体系，服务端代付/计费，多端协同基础。
- 前端复用现有 React + Zustand + @xyflow/react 画布、节点、工具体系——**业务层不变，运行时与基础设施层全换**。

### 1.2 必须解决的两件事

**(A) 桌面到 Web 的完整迁移**
- 持久化从 SQLite → 服务端 DB + IndexedDB 离线缓存。
- 文件 IO、API key、provider 直连、本地图像处理全部从 Rust 端剥离到前端 / BFF。
- Tauri 专属能力（自动更新、原生菜单、系统托盘）删除或用 Web 等价物替代。

**(B) 阶段式异步生成与供应商不稳定性**
- Provider API 本身耗时（5–60s 量级）不可消除，且关键素材仍是用户进入下一创作阶段的决策前置。
- 本期目标不是让用户完全不等待结果，而是让等待不锁死画布操作，并通过跨供应商路由缩短、稳定每个阶段的产出等待。
- 关键认知：**单 provider 不可靠**——会限流、会排队、会偶发失败。解决方案不是"优化等待 UI"，而是 **建立跨供应商路由**：
  - 同一能力（如"快速图像编辑""分镜生成""文生视频"）由多家 provider 等价供给；
  - BFF 实时观测各 provider 的 **队列深度 / 当前 RPS / 近 N 分钟错误率 / 近 N 分钟 P95 时延 / 配额余量**；
  - 路由器根据评分挑选最优 provider 投递；超阈值或失败立即降级到下一家；
  - 用户只声明"我要做什么"（capability），不指定"用谁做"（provider），除非显式 pin。

---

## 2. 目标与非目标

### 2.1 目标
- **G1**：项目以 Web SaaS 形态上线；同一账号在任意浏览器登录可继续工作。
- **G2**：所有生成调用经 BFF 路由层；前端不知道也不关心实际由哪家 provider 出图。
- **G3**：路由层在任意一家供应商出现峰值/限流/故障时，**自动切换到等价供应商**，对用户透明。
- **G4**：用户提交生成 → 拿到 `taskId` 并恢复画布操作的延迟 ≤ 50 ms；依赖该素材的下一阶段在结果产出后解锁，任务结果通过推送回填，无前端轮询。
- **G5**：路由决策可观测、可回放、可灰度。

### 2.2 非目标（本期不做）
- 多人实时协作（共享白板、光标）。
- 用户自带 API key 模式（v1 一律服务端代付；v2 再讨论高级用户接入自己的 key）。
- 将 BFF 拆成多个微服务（v1 单体 BFF）。
- Tauri 端继续维护（停止维护，老用户引导到 Web）。

---

## 3. 整体架构

```
┌────────────────── 浏览器 (React, Web only) ──────────────────┐
│  Canvas / Nodes / Stores  (业务层不变)                       │
│        │                                                     │
│        ▼                                                     │
│  TaskClient   ←—— SSE 任务事件流 ——┐                          │
│        │                            │                          │
└────────┼────────────────────────────┼──────────────────────────┘
         │ HTTPS (REST + SSE)         │
         ▼                            │
┌────────────────────────── BFF (单体) ──────────────────────────┐
│  Auth / Project API        TaskAPI (POST /api/jobs, SSE)      │
│         │                          │                           │
│         ▼                          ▼                           │
│   Postgres + 对象存储       ┌── ProviderRouter ───┐            │
│                             │  Capability Registry │            │
│                             │  Health Tracker      │            │
│                             │  Scoring & Failover  │            │
│                             └────────┬─────────────┘            │
│                                      ▼                          │
│                ┌──────── Provider Adapter Pool ───────┐        │
│                │  Kling │ Kie │ ProviderC │ ProviderD │ ...    │
│                └────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────┘
                                      │
                          各家 provider HTTPS API
```

### 3.1 分层职责
- **前端**：渲染、画布交互、提交意图（capability + 参数）、订阅任务状态。不持有 API key、不知道具体 provider。
- **BFF**：账号、项目持久化、任务编排、路由决策、provider 适配、推送通道。**所有 provider 知识在这一层**。
- **Provider 适配器**：把 BFF 内部统一的"任务请求"翻译成各 provider 的具体调用，把回调/轮询结果归一回"任务事件"。

### 3.2 关键原则
- **能力优先于供应商**：前端节点声明 `capability: "image.edit.fast"`，不声明 `providerId`。
- **任务即真相源**：节点 `data` 只存 `taskId`，所有进度/结果由 TaskClient 单向推回。
- **路由可旁路**：用户高级选项可 pin 具体 provider/model；路由器仅在未 pin 时介入。
- **薄前端**：前端不重试、不切换 provider、不处理 provider 鉴权。

---

## 4. 跨供应商动态路由（核心）

### 4.1 概念模型

**Capability（能力）**：业务侧的最小可路由单位。例：

| Capability ID | 含义 | 当前已有 provider 候选（举例） |
| --- | --- | --- |
| `image.edit.fast` | 快速图像编辑/重绘（5–15s 级） | nano-banana-2, gemini-flash-image, ... |
| `image.gen.high` | 高质量文生图（15–40s 级） | seedream, midjourney-proxy, ... |
| `video.gen.short` | 短视频生成 | kling, runway, ... |
| `storyboard.split` | 分镜切分（本地或远程） | 本地算法 + 远端兜底 |

**Equivalence Group（等价组）**：同一 capability 下的一组可互相替代的 provider+model 组合。等价不是绝对相等，而是**业务可接受的近似替代**——美术风格、分辨率、最大边长、是否支持参考图等约束需在适配器内归一。

**Provider Adapter（供应商适配器）**：每家一个，负责：
1. 把统一请求翻译成具体调用；
2. 上报本次调用的耗时、是否成功、是否被限流；
3. 提供 `cancel`、`getJob`（如需）、`probeHealth`。

### 4.2 路由决策

每次任务提交，路由器在该 capability 的等价组中给每个候选打分：

```
score = w1 * available_capacity_norm
      + w2 * (1 - recent_error_rate)
      + w3 * (1 / p95_latency_norm)
      - w4 * unit_cost_norm
      - w5 * queue_depth_norm
      - w6 * recent_failover_penalty
```

- `available_capacity_norm`：该 provider 当前 RPS 距离配额上限还有多少（越多越好）。
- `recent_error_rate`：滑窗 5min 错误率。
- `p95_latency_norm`：滑窗 5min 完成任务 P95 延迟。
- `unit_cost_norm`：单次调用估算成本（来自 provider 价目）。
- `queue_depth_norm`：当前已经投在该 provider 但未完成的任务数 / 软上限。
- `recent_failover_penalty`：最近 60s 内该 provider 投递失败次数衰减惩罚，避免立刻再选中。

权重 `w1..w6` 配置在 BFF，可热更新；初始值由灰度数据回归。

**软上限触发分流**：每个 provider 都有 `soft_max_inflight`。当 `queue_depth >= soft_max_inflight`，该 provider 在评分中被乘 0.1 衰减，几乎一定被其他家接管，但不立即拉黑——避免雪崩误判。

**硬上限熔断**：连续 N 次失败或错误率超阈值，进入"熔断 30s"，期间不参与评分；熔断结束后用 1% 探针流量恢复。

### 4.3 失败转移（Failover）

- 任务投递失败（HTTP 5xx / provider 业务错误码白名单 / 超时）：路由器在等价组里挑次优投递，**用户侧不感知**。
- 投递成功但执行中失败：默认不自动转移（可能已经计费），节点显示"失败 - 重试"，重试时再次走路由。
- 投递成功但执行超时（超出该 capability 的 SLO 上限，例如 fast 类 60s）：BFF 主动取消并改投，记录"长尾改投"事件用于复盘。
- 单任务最大失败转移次数 = 3，避免无限循环。

### 4.4 健康追踪（Health Tracker）

BFF 内存 + Redis 维护：

| 指标 | 采集方式 | 用途 |
| --- | --- | --- |
| 当前 inflight | 提交/完成事件计数 | 评分 / 软上限 |
| 5min 错误率 | 滑窗计数 | 评分 / 熔断 |
| 5min P95 延迟 | 滑窗直方图 | 评分 |
| 配额余量 | provider 接口或本地配额表 | 评分 / 限流 |
| 探针成功率 | 后台定时探针（轻量调用） | 熔断恢复 |

所有指标按 `(provider_id, model_id)` 维度，不按 capability 聚合（capability 维度由路由器在评分时实时聚合）。

### 4.5 路由可观测性

- 每个任务的 BFF 侧记录：`requested_capability`、`candidates_considered`、`scores`、`chosen`、`failover_chain`、`final_status`。
- 暴露 `/admin/router/stats` 看板：分 provider 的成功率、P95、熔断状态、灰度命中率。
- 路由策略变更走配置项 + 灰度，不需发版。

### 4.6 用户侧表现
- 节点上不显示 provider 名（除非用户 pin）。
- 节点上显示 capability 与"预计耗时"（来自该 capability 历史 P50）。
- 失败转移过程对用户透明；用户唯一感知是"阶段产出等待更稳定、更可预期"。

---

## 5. 阶段式异步生成与推送

> 路由解决"投给谁"，本节解决"等待如何不阻塞画布操作"，以及"阶段产物完成后如何驱动用户进入下一步决策"。

### 5.1 任务状态机
```
pending ──submit ok──► submitted ──ack──► running
   │                                         │
   │                                         ├─ progress 推送
   ▼                                         ▼
canceled ◄── cancel       succeeded / failed
                            │
                            └─ retry → pending（重新走路由）
```

### 5.2 提交链路
```
节点 onSubmit
  → TaskClient.submit({ capability, payload, idempotencyKey })  // 50ms 内返回 taskId
  → 节点 data.taskId = taskId（仅此一字段写画布），节点进入"等待阶段产物"状态
  → POST /api/jobs                                              // BFF 入队
       → ProviderRouter 评分挑选
       → ProviderAdapter 调用 provider
       → 返回 {taskId, status: submitted}
  → SSE 多路复用流推送 progress / completed / failed
  → TaskClient 收到事件，按 taskId 分发到节点 selector
  → 节点静默更新（无 isGenerating 字段，无 generationJobId 字段）
  → 阶段产物完成后，解锁依赖该结果的下一步操作（选择 / 微调 / 采纳 / 继续生成）
```

### 5.3 推送通道
- 单连接 SSE：`GET /api/jobs/stream?projectId=...`，BFF 把该项目所有进行中任务的事件多路复用到这一条流。
- 自动断线重连，事件带递增 `eventId`，重连时 `Last-Event-ID` 续传。
- 国内网络降级：连接稳定性差时退化为 5s 长轮询 `/api/jobs/poll?since=...`。

### 5.4 用户操作不中断保证
- 提交即返回 taskId（< 50ms，仅本地状态切换 + 一次 fetch 不阻塞）；这不等于结果 50ms 产出。
- 依赖本次产物的下一阶段操作保持等待态，产物完成后再允许用户选择 / 微调 / 采纳 / 继续生成。
- 节点订阅细粒度 selector，单任务进度变化只重渲染该节点本身。
- 任务进度写回 store 走 200ms 批合并，避免 60fps 推送穿透到画布持久化。
- 拖拽节点时不被任何 polling/任务事件阻塞主线程（任务事件处理在 worker / 微任务批次中完成）。

### 5.5 任务恢复
- 项目打开 → 列出所有节点 `taskId` → BFF 返回当前状态快照 → SSE 接续。
- 跨设备：用户在另一设备打开同一项目同样能看到进行中任务（任务挂在项目而非客户端）。

---

## 6. 数据契约

### 6.1 节点 data 字段（破坏性变更）

| 字段 | 旧 | 新 |
| --- | --- | --- |
| `isGenerating` | boolean | **删除** |
| `generationJobId` / `providerTaskId` | string | **删除** |
| `currentBatch.subTasks[].providerTaskId` | string | **删除**（移入 BFF 任务表） |
| `taskId` | — | **新增** `string \| null` |
| `taskCapability` | — | **新增** `string`（路由用） |
| `pinnedProviderId?` | — | **可选**（高级选项） |

### 6.2 项目模型（服务端）

```
Project {
  id, ownerId, name, viewport_json,
  nodes_json, edges_json, history_json,
  pending_task_ids: string[],          // 任务恢复用
  updated_at
}

Job {
  id, project_id, node_id, capability,
  status, progress,
  candidates_considered_json,           // 路由审计
  failover_chain_json,
  chosen_provider, chosen_model,
  request_payload_json, result_ref,
  submitted_at, finished_at, last_error
}
```

### 6.3 老项目处理
- 桌面端老项目（SQLite 导出）提供"一键导入到 Web"工具：转换节点 schema，删除旧 `isGenerating / generationJobId`，未完成的生成任务一律置失败并提示重做。

---

## 7. 里程碑

| # | 模块 | 验收点 |
| --- | --- | --- |
| M1 | BFF 骨架（Auth / Project CRUD / Postgres / 对象存储） | 浏览器登录、新建项目、读写画布快照 |
| M2 | TaskClient + 单条 SSE 多路复用 + Web 端节点改造（先接一个简单 capability） | 端到端跑通一类生成任务 |
| M3 | ProviderRouter v0：等价组 + 评分 + 软上限分流 | 同一 capability 跨 2 家 provider 自动分流 |
| M4 | Health Tracker + 熔断 + 探针 | 注入故障可看到自动熔断与恢复 |
| M5 | Failover 链 + 长尾改投 | 单家 provider 限流时成功率不降 |
| M6 | 路由观测看板 + 配置热更新 + 灰度 | 路由策略可在线调整 |
| M7 | 老项目导入工具 + 引导 Tauri 用户迁移 | 老用户平滑过渡 |
| M8 | 上线灰度 → 全量 | SLO：P95 任务时延 ≤ provider 单家中位数 + 20%；可用性 ≥ 99% |

每个里程碑独立 commit / 独立可回滚。

---

## 8. 风险与权衡

- **等价性偏差**：不同 provider 出图风格差异不可忽视。需在等价组层做"风格一致性测试集"，差异过大的不进同一组。可能导致某些 capability 实际只有 1 家可用 → 此时路由退化为单点 + 熔断只能拒绝。
- **计费一致性**：不同 provider 单价差异 2–5 倍。路由权重必须包含成本，否则会无脑调最贵的最稳家。需要财务对账系统配套。
- **冷启动数据不足**：刚上线时滑窗指标不稳，前 X 天用静态权重 + 人工权重。
- **provider 不允许并发探测**：探针流量需走真实任务，不能凭空 ping；初期可能误判健康。
- **跨设备一致性**：同一任务多端订阅，状态需以 BFF 为唯一真相源；前端乐观更新只在本地 50ms 内有效。
- **删除 Tauri 是单向门**：老用户社群需提前沟通；本地 API key 用户群可能流失，需准备话术。

---

## 9. 验收清单

- [ ] 浏览器即用，无需安装。
- [ ] 提交生成 → 拿到 `taskId` 且画布可操作的延迟 ≤ 50ms（performance.mark 量化）。
- [ ] 依赖生成结果的下一阶段操作在素材完成前保持等待态，完成后自动解锁。
- [ ] 拖拽节点同时跑 ≥3 个生成任务，帧率 ≥ 50 fps。
- [ ] 注入"单 provider 全部限流" → 成功率不降，P95 上升 ≤ 30%。
- [ ] 注入"单 provider 熔断" → 30s 后探针恢复，无人工介入。
- [ ] 关网 5s 再恢复，SSE 自动接续，任务不丢。
- [ ] 跨设备打开同项目，能看到进行中任务并最终拿到结果。
- [ ] 路由决策可在 admin 看板审计任意一笔任务的 `candidates / scores / failover_chain`。

---

## 10. 待确认问题

1. 等价组初版包含哪几家 provider？需要业务/法务确认每家可商用条款。
2. 计费模型：用户按生成次数 / 按订阅 / 按 token？影响路由权重里 `unit_cost` 是否生效。
3. 老 Tauri 用户的迁移截止时间与公告策略。
4. BFF 技术栈选型（Node + TS / Rust axum / Go）。倾向 Node + TS 以便复用前端 provider 适配代码。
5. 对象存储与 CDN 选型（国内 + 海外双端？）。
6. 路由灰度按用户维度还是任务维度？前者稳，后者快。

> 上述问题决议后进入 v1.1，并据此细化 BFF 接口契约、provider 适配清单、评分权重初值。
