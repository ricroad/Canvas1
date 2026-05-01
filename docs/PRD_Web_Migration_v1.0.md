# 无限画布 · Web 化迁移 PRD v1.0

> 目标：把当前 Tauri 桌面 demo 完整迁移到 **纯 Web 端 + Go 后端**，功能 100% 对齐，UI 保持现有视觉。
>
> 维护者：技术负责人
> 状态：**待用户确认 §3 的 3 个待决项 → 进入立项**
> 创建：2026-05-01

---

## 0. TL;DR

| 维度 | 现状 | 目标 |
|---|---|---|
| 客户端 | Tauri 2 桌面（macOS + Windows） | 纯浏览器 Web App（Chromium / Safari / Firefox） |
| 后端 | 嵌入式 Rust 命令 + 本地 SQLite | Go HTTP 服务 + Postgres |
| 文件存储 | `app_data_dir/assets/` | S3 兼容对象存储（MinIO 或 AWS S3） |
| 认证 | 无（单机单用户） | JWT 登录，多用户隔离 |
| 部署 | 客户端打包安装 | Docker compose 服务端部署 + 浏览器访问 |
| 路由 | HashRouter（Phase A 已上） | BrowserRouter |
| AI/LLM | Tauri Rust 命令转发 | Go HTTP handler 转发（必要时 SSE/WS） |

工程量估算见 §13。

---

## 1. 范围

### In Scope（必须迁移）

- 项目管理（剧 / 单集 / 资产三层导航，已实现）
- 画布完整功能（节点、连线、磁吸、撤销重做、历史、分镜、AI 图、AI 视频、Copilot、工具集、批量、导出）
- 资产库（剧级素材库 + 画布产出物）
- 设置 / 主题 / i18n / Skills
- 数据持久化（每用户每项目）
- 文件上传 / 下载 / 缩略图
- 多用户隔离

### Out of Scope（V1 不做）

- 实时协同编辑（多人同画布）
- 离线模式（PWA / Service Worker）
- 移动端响应式适配（窗口尺寸 ≥ 1280px）
- SSO / 第三方登录
- 计费 / 订阅 / 配额管理
- 系统更新自动推送（updater）
- 桌面壳保留（彻底舍弃 Tauri）

---

## 2. 关键决策 · **待用户确认**

> 这 3 项不定，整个 Phase 拆分会偏差 ±1 周。

| # | 决策点 | 候选 | 我的推荐 |
|---|---|---|---|
| 1 | **团队投入** | (a) 1 senior 全栈 / (b) 1 Go + 1 前端 / (c) 加 1 运维或 QA | (b) — 后端前端可并行，4-6 周可交付 |
| 2 | **AI/LLM 流式响应** | (a) 同步阻塞 returning full text / (b) SSE 流式 / (c) WebSocket | 看现状：调研当前 Tauri Rust 端是不是用了 event 推流；如果是，**(b) SSE**。如果不是，**(a) 同步先跑通**，V1.1 再加流式 |
| 3 | **认证范围** | (a) 单用户登录 / (b) 多用户但无组织 / (c) 多用户 + 组织 + 权限 | V1 用 **(b)**：邮箱密码注册 + JWT + 每用户隔离剧/集/资产。组织/权限留 V2 |

请回复 `1=b 2=? 3=b` 这种格式，我据此校准 Phase 拆分。

---

## 3. 整体架构

### 3.1 系统拓扑

```
┌─────────────────────────────────────────────────────┐
│ Browser (Chrome/Safari/Firefox)                     │
│   ┌────────────────────────────────────────────┐   │
│   │ React + TS + Vite (BrowserRouter)          │   │
│   │  src/api/client.ts → fetch + JWT           │   │
│   │  src/storage/index.ts → s3 presigned URLs  │   │
│   └────────────────────────────────────────────┘   │
└──────────┬──────────────────────────────────────────┘
           │ HTTPS
┌──────────▼──────────────────────────────────────────┐
│ Caddy / Nginx (反向代理 + SSL)                      │
└──────────┬──────────────────────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
┌───▼───────┐  ┌─▼─────────┐
│ Go API    │  │ MinIO /S3 │
│ (Gin/Chi) │  │           │
└───┬───────┘  └───────────┘
    │
┌───▼─────────┐
│ Postgres 16 │
└─────────────┘
```

### 3.2 技术栈选型

| 层 | 技术 | 理由 |
|---|---|---|
| 后端框架 | **Gin** (or Chi) | Go 生态主流，社区文档丰富 |
| ORM | **sqlc** + 原生 SQL | 类型安全，避免 GORM 黑魔法 |
| Migration | **golang-migrate** | 标准方案 |
| Auth | **golang-jwt/jwt v5** | RS256/HS256 都支持 |
| 对象存储客户端 | **minio-go SDK** | S3 兼容，本地 MinIO + 云端 AWS 都能跑 |
| 配置 | **viper** + `.env` | 标准 |
| 日志 | **zerolog** | 结构化 + 高性能 |
| 流式响应（如选 SSE） | **gin-contrib/sse** | |
| 数据库 | **Postgres 16** | JSONB 性能好 |
| 反向代理 | **Caddy 2** | 自动 HTTPS 比 Nginx 省事 |
| 容器编排 | **docker compose** V1 阶段够用 | K8s 等需要时再上 |

---

## 4. 数据模型

### 4.1 Schema 映射（SQLite → Postgres）

现有 SQLite schema（已 snake_case + UUID + 预留 user_id）几乎可以原样搬。差异：

| 字段类型 | SQLite | Postgres | 备注 |
|---|---|---|---|
| 主键 | TEXT (UUID) | UUID | 用 `pgcrypto` 的 `gen_random_uuid()` |
| JSON | TEXT | JSONB | nodes_json/edges_json/viewport_json/history_json/metadata_json |
| 时间戳 | INTEGER (ms epoch) | TIMESTAMPTZ | API 边界仍统一 ISO 8601 字符串 |
| 布尔 | INTEGER 0/1 | BOOLEAN | is_done 等 |

### 4.2 表清单

```sql
users (id, email UNIQUE, password_hash, created_at, updated_at)
shows (id, user_id FK, org_id, title, description, cover_url, created_at, updated_at)
episodes (id, show_id FK, user_id FK, title, episode_number, is_done, completed_at,
          nodes_json JSONB, edges_json JSONB, viewport_json JSONB, history_json JSONB,
          node_count, created_at, updated_at)
assets (id, show_id FK, user_id FK, category, name, storage_key, mime_type, size_bytes,
        thumbnail_key, metadata_json JSONB, created_at, updated_at)
episode_image_refs (episode_id FK, path, PRIMARY KEY(episode_id, path))
episode_video_refs (episode_id FK, path, PRIMARY KEY(episode_id, path))
```

所有表的 `user_id` 索引，所有查询带 `WHERE user_id = $auth_user`（强制租户隔离）。

### 4.3 数据迁移脚本（可选）

V1 默认**不迁移**桌面 demo 数据 —— 上线即"全新世界"，旧 demo 用户重新注册重新建剧。

如需保留：写一个一次性 Go CLI（`cmd/migrate-from-sqlite`），读 SQLite 写 Postgres。约 1 天工作量。

---

## 5. API 契约

完整端点清单：

```
# Auth
POST   /api/auth/register   { email, password } → { user, token }
POST   /api/auth/login      { email, password } → { user, token }
POST   /api/auth/refresh    Authorization → { token }
GET    /api/auth/me         Authorization → User

# Shows
GET    /api/shows                              { items, page, page_size, total }
POST   /api/shows                              { title, description? } → Show
GET    /api/shows/:id                          → Show
PATCH  /api/shows/:id                          { title?, description?, cover_url? } → Show
DELETE /api/shows/:id                          → 204

# Episodes
GET    /api/shows/:id/episodes                 → { items, page, page_size, total }
POST   /api/shows/:id/episodes                 { title, episode_number? } → Episode
GET    /api/episodes/:id                       → Episode (含 nodes/edges)
PATCH  /api/episodes/:id                       { title?, episode_number?, is_done? } → Episode
PATCH  /api/episodes/:id/canvas                { nodes_json, edges_json, history_json? } → 204
PATCH  /api/episodes/:id/viewport              { viewport_json } → 204
DELETE /api/episodes/:id                       → 204

# Assets
GET    /api/shows/:id/assets?category=&page=   → { items, page, page_size, total }
POST   /api/shows/:id/assets/presign           { mime, size } → { upload_url, storage_key }
POST   /api/shows/:id/assets                   { category, name, storage_key, mime_type, size_bytes } → Asset
PATCH  /api/assets/:id                         { name?, category? } → Asset
DELETE /api/assets/:id                         → 204

# Storage
POST   /api/storage/presign                    { kind: 'asset'|'cover', size, mime } → { upload_url, storage_key }
GET    /api/storage/url?key=...                → { url }   (短期签名 GET URL)

# AI / LLM (依赖决策 #2)
POST   /api/ai/chat            { messages, model } → 同步 / SSE 视决策
POST   /api/ai/image           { prompt, options } → 同步
POST   /api/ai/video           { prompt, options } → 同步（背后异步队列 + 轮询）
GET    /api/ai/jobs/:id        → { status, result_url? }

# Health
GET    /api/health             → { status: 'ok' }
```

字段全 snake_case，时间全 ISO 8601 字符串。所有非 auth 端点要 `Authorization: Bearer <jwt>`。

### 5.1 文件上传策略：预签名直传

- 前端调 `/api/storage/presign` 拿一次性 PUT URL
- 浏览器 PUT 直传 MinIO，不经过 Go 服务（省带宽）
- 上传完成调 `/api/shows/:id/assets` 写元数据
- 下载用 `getObjectUrl` 调 `/api/storage/url?key=...` 拿临时 GET URL

---

## 6. 前端改造清单

### 6.1 必改（业务断点）

| 文件 / 模块 | 改动 |
|---|---|
| `src/api/client.ts` | invoke → fetch + JWT 拦截器 + 401 自动刷新 / 跳登录 |
| `src/api/{shows,episodes,assets}.ts` | 命令名 → REST URL；request payload 形式调整 |
| `src/storage/index.ts` | 改用新的 `s3-adapter.ts`：putObject 走预签名 PUT，getObjectUrl 走 `/api/storage/url` |
| `src/storage/tauri-fs-adapter.ts` | **删除** |
| `src/router/index.tsx` | createHashRouter → createBrowserRouter |
| `src/components/TitleBar.tsx` | 删除窗口控制按钮（max/min/close）+ drag region；保留极薄的应用 chrome（左 logo + 标题 + 右用户/主题/设置） |
| **新增** `src/features/auth/` | LoginPage / RegisterPage / 路由守卫 / token 持久化（localStorage + memory） |
| `src/features/canvas/application/imageData.ts` | `convertFileSrc` → 直接用 https URL |
| `src/features/canvas/nodes/StoryboardNode.tsx` | 任何用了 Tauri path API 的地方改纯字符串处理 |
| `src/commands/*.ts` | **整个目录删除**，调用改走新的 api/ 层 |
| `src/App.tsx` | 删 Tauri event 监听 + isTauriEnv 分支；加 auth-required guard |

### 6.2 必删（Tauri-only 代码）

- `src-tauri/` 整个目录
- `package.json` 中 `@tauri-apps/*` deps + tauri 脚本
- `tauri.conf.json` / `Cargo.toml` / `Cargo.lock`
- `vite.config.ts` 里的 Tauri host 设置
- `src/commands/platform.ts` 的 isTauriEnv（或保留但永远返回 false）

### 6.3 不动（已经 Web 友好）

- 路由结构 / 页面组件 / 业务 store / 画布逻辑
- i18n / 主题 / 设置面板（除掉版本检查那块）
- ReelForce 设计 token / 组件视觉

---

## 7. 认证流程（V1 最小可用）

```
注册 → 登录 → 获 JWT (有效期 7 天) + refreshToken (30 天)
本地 localStorage 存 JWT，memory 存 refresh
401 → 用 refresh 换新 JWT；refresh 也过期 → 跳登录
退出 → 清 localStorage
```

### 7.1 路由守卫

- `/login` `/register` 公开
- 其它所有路由要求登录，未登录跳 `/login?redirect=<原路径>`

### 7.2 不做（V1）

- 邮箱验证
- 密码重置
- 第三方登录
- 双因子

---

## 8. 部署架构

### 8.1 单机 docker compose（开发 / 小规模生产）

```yaml
services:
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    env: { POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD }

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes: [minio:/data]
    env: { MINIO_ROOT_USER, MINIO_ROOT_PASSWORD }

  api:
    build: ./backend
    env: { DATABASE_URL, S3_ENDPOINT, JWT_SECRET, ... }
    depends_on: [postgres, minio]

  web:
    build: ./frontend  # vite build → 静态文件
    # 由 caddy 直接 serve

  caddy:
    image: caddy:2
    ports: [80, 443]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, caddy_data:/data]
```

### 8.2 域名 + HTTPS

Caddy 自动 ACME，配 1 个 A 记录就行。

---

## 9. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| AI 流式响应 Tauri 端用了 event，Go SSE 实现复杂 | 中 | 拖 1 周 | Phase 0 先做 spike，明确改造方案 |
| project_state 大 JSON 频繁更新拖慢 Postgres | 中 | 拖性能验证 | 用 JSONB + 限制 history_json 大小；考虑只写 viewport 和 nodes 分通道 |
| 前端打包后路由 / 资源路径相对/绝对不对劲 | 低 | 半天 | Vite 配置 `base` |
| 浏览器跨域 / cookie / CORS | 低 | 半天 | Go 端开 `gin-contrib/cors` |
| 第一次部署 SSL 证书失败 | 低 | 半天 | Caddy 自动重试，预留 5 分钟即可 |
| Tauri 删除后 dev 环境不会启动 | 低 | 半天 | 改 vite.config 即可 |
| 浏览器后退按钮触发 React Router 但 store 没清干净 | 中 | 1 天 bug | 路由 unmount 清 store（已经有这个习惯） |

---

## 10. Phase 拆分

> 假设决策 (1=b, 2=a 同步 + V1.1 再加流式, 3=b 多用户无组织)，**4-6 周**完成。

### W.0 · Spike + 立项（3 天）

- [ ] 调研当前 Tauri 端 AI/LLM 流式实现
- [ ] 起 Go 项目骨架（Gin + Postgres + 健康检查 + Dockerfile）
- [ ] 起 MinIO + Caddy 本地编排，跑通最小回环

**验收**：浏览器访问 `https://localhost/api/health` 返回 `ok`

### W.1 · 后端基础（5 天）

- [ ] golang-migrate 接入 + 全表 schema 创建脚本
- [ ] sqlc 生成查询代码
- [ ] JWT 登录注册（含 password hashing）
- [ ] CORS + 认证中间件 + 错误统一处理
- [ ] users / shows / episodes / assets / image-refs CRUD（无业务逻辑，纯 SQL 转发）
- [ ] storage presign 端点

**验收**：所有 §5 端点能用 Postman 跑通，认证生效

### W.2 · 前端 api 层切换（4 天）

- [ ] 新建 `src/api/http.ts` 替代 `client.ts`，fetch + JWT 拦截器 + 错误处理
- [ ] shows.ts / episodes.ts / assets.ts 改 URL（全部命令名改为 REST 路径）
- [ ] 新建 `src/storage/s3-adapter.ts`（presign upload + signed url get）
- [ ] 删 `tauri-fs-adapter.ts` + `src/commands/`
- [ ] HashRouter → BrowserRouter，vite base 配好
- [ ] auth 模块（LoginPage + RegisterPage + 路由守卫 + token store）

**验收**：单用户登录后能进 /shows，CRUD 全通

### W.3 · 画布持久化迁移（5 天）

- [ ] Go 端 `PATCH /api/episodes/:id/canvas` 接 nodes_json/edges_json 写 JSONB
- [ ] Go 端 viewport 独立通道（防抖优化迁移）
- [ ] 前端 projectStore / canvasStore 的 invoke 调用全部换 fetch
- [ ] image_pool / image_refs 逻辑：要么 Go 端原样实现，要么改用 storage_key 引用模型（推荐后者，更现代）
- [ ] 大画布性能压测（10000 节点）

**验收**：复杂画布画一笔、连一线、撤销重做、刷新恢复全部正常

### W.4 · AI / LLM 代理（4 天）

- [ ] Go 端 `/api/ai/chat` 转发到 Kimi / Gemini / 本地 LLM
- [ ] `/api/ai/image` 同上
- [ ] `/api/ai/video` 异步 job 模型（job 队列 + 轮询端点）
- [ ] 前端 `src/features/canvas/models/providers/*` 改成调 `/api/ai/*`
- [ ] 错误 / 重试 / 超时统一

**验收**：所有 AI 节点（图片生成、编辑、视频生成、Copilot 对话）端到端可用

### W.5 · UI 收尾（3 天）

- [ ] 删除 Tauri 相关 UI（窗口控制按钮、drag region）
- [ ] TitleBar 改为极薄 Web chrome（28-32px，logo + 标题 + 主题/设置/用户菜单）
- [ ] 视图过渡用 View Transitions API 加 200ms cross-fade
- [ ] 测试 Chrome / Safari / Firefox 三浏览器
- [ ] 路由刷新 / 后退 / 深链全场景验证

**验收**：UI 跟桌面期视觉一致，无 Tauri 残留

### W.6 · 部署与上线（4 天）

- [ ] Dockerfile（前后端分别）+ docker-compose.yml
- [ ] Caddyfile（域名 + 自动 HTTPS）
- [ ] 环境变量管理 + secrets
- [ ] CI/CD（GitHub Actions：push tag 触发 build + deploy）
- [ ] 基础监控（Caddy 日志 + Go 端 zerolog 输出 + 简单的 uptime 检查）
- [ ] 备份策略（Postgres pg_dump 定时 + MinIO 对象冷备）

**验收**：能从公网域名访问，注册 → 创建剧 → 上传素材 → 制作单集 → 标记完成 全流程跑完

### W.7 · 联调 / Bug 修 / 缓冲（2-4 天）

视前面 buffer 余量。

---

## 11. 验收标准（Definition of Done）

- [ ] 现有所有功能在浏览器里跑通：剧/集/资产 CRUD、画布编辑、AI 图/视频生成、Copilot、工具集、批量、导出
- [ ] 多用户隔离生效：A 用户看不到 B 用户的剧
- [ ] 前端代码里 0 个 `@tauri-apps/*` import；`grep -r "tauri" src/` 仅剩注释
- [ ] `src-tauri/` 目录已删
- [ ] 部署到一台云主机，公网可访问，HTTPS 生效
- [ ] 简单负载测试：5 并发用户编辑各自画布无显著卡顿
- [ ] 数据持久化：服务重启后所有用户数据完整
- [ ] 浏览器后退/前进/刷新 100% 正常

---

## 12. 待决项

- [ ] §2 的 3 个决策点
- [ ] AWS S3 还是自建 MinIO？V1 推荐自建 MinIO 省成本
- [ ] 域名是否已注册？提前 1-2 天准备好可避免上线日延期
- [ ] 是否要保留桌面 demo 数据迁移？默认否
- [ ] 监控 / 告警是否要接公司现有方案？V1 可只做日志即可

---

## 13. 关联文档

- 现有架构：[CLAUDE.md](../CLAUDE.md) / [AGENTS.md](../AGENTS.md)
- 设计语言：[DESIGN_REELFORCE.md](./DESIGN_REELFORCE.md)
- Web 化原则：内置在用户记忆 `project_target_platform.md` 与 `project_backend_stack.md`
