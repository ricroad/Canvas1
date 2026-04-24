# AGENTS.md

## 1. 项目目标与技术栈

- 产品目标：基于节点画布进行图片上传、AI 生成/编辑、工具处理（裁剪/标注/分镜）。
- 前端：React + TypeScript + Zustand + @xyflow/react + TailwindCSS。
- 后端：Tauri 2 + Rust（命令式接口）+ SQLite（rusqlite，WAL）。
- 关键原则：解耦、可扩展、可回归验证、自动持久化、交互性能优先。

## 2. 代码库浏览顺序

建议按以下顺序理解项目：

1. 入口与全局状态
- `src/App.tsx`
- `src/stores/projectStore.ts`
- `src/stores/canvasStore.ts`

2. 画布主流程
- `src/features/canvas/Canvas.tsx`
- `src/features/canvas/domain/canvasNodes.ts`
- `src/features/canvas/domain/nodeRegistry.ts`
- `src/features/canvas/NodeSelectionMenu.tsx`

3. 节点与覆盖层
- `src/features/canvas/nodes/*.tsx`
- `src/features/canvas/nodes/ImageEditNode.tsx`
- `src/features/canvas/nodes/GroupNode.tsx`
- `src/features/canvas/ui/SelectedNodeOverlay.tsx`
- `src/features/canvas/ui/NodeActionToolbar.tsx`
- `src/features/canvas/ui/NodeToolDialog.tsx`
- `src/features/canvas/ui/nodeControlStyles.ts`
- `src/features/canvas/ui/nodeToolbarConfig.ts`

4. 工具体系（重点）
- `src/features/canvas/tools/types.ts`
- `src/features/canvas/tools/builtInTools.ts`
- `src/features/canvas/ui/tool-editors/*`
- `src/features/canvas/application/toolProcessor.ts`

5. 模型与供应商适配
- `src/features/canvas/models/types.ts`
- `src/features/canvas/models/registry.ts`
- `src/features/canvas/models/image/*`
- `src/features/canvas/models/providers/*`

6. Tauri 命令与持久化
- `src/commands/*.ts`
- `src/commands/projectState.ts`
- `src-tauri/src/commands/*.rs`
- `src-tauri/src/commands/project_state.rs`
- `src-tauri/src/lib.rs`

## 3. 开发工作流

1. 明确变更范围
- 先界定是 UI 变更、节点行为变更、工具逻辑变更、模型适配变更，还是持久化/性能变更。

2. 沿着数据流改动
- UI 输入 -> Store -> 应用服务 -> 基础设施（命令/API）-> 持久化。
- 禁止跨层“偷改”状态；尽量只在对应层处理对应职责。

3. 小步提交与即时验证
- 每次改动后做轻量检查（见第 6 节），通过后再继续。

4. 最后做一次完整构建
- 在功能收尾或大改合并前运行完整构建。

5. 发布快捷口令
- 当用户明确说“推送更新”时，默认执行一次补丁版本发布：基于上一个 release/tag 自动递增 patch 版本号，汇总代码变动生成 Markdown 更新日志，完成版本同步、发布提交、annotated tag 与远端推送；如用户额外指定 minor/major 或自定义说明，则按用户要求覆盖默认行为。
- 自动生成的更新日志正文只保留 `## 新增`、`## 优化`、`## 修复` 等二级标题分组与对应列表项；不要额外输出 `# vx.y.z` 标题、`基于某个 tag 之后的若干提交整理` 说明或 `## 完整提交` 区块，空分组可省略。

## 4. 架构与解耦标准

### 4.1 依赖与边界

- 模块间优先依赖接口/类型，不直接依赖具体实现细节。
- 跨模块通信优先使用事件总线或明确的 service/port。
- 展示层（UI）不直接耦合基础设施层（Tauri/API 调用）；通过应用层中转。

### 4.2 单一职责

- 一个文件只做一个业务概念；无法用三句话说清职责就应拆分。
- 工具 UI、工具数据结构、工具执行逻辑应分离（已采用：editor / annotation codec / processor）。

### 4.3 文件规模控制

- 舒适区：类 <= 400 行，脚本 <= 300 行。
- 警戒线：800 行，必须评估拆分。
- 强制拆分：1000 行（纯数据定义除外）。

### 4.4 层间通信

- 使用 DTO/纯数据对象，避免双向引用。
- Store 不应直接承担重业务逻辑；业务逻辑放应用层。

### 4.6 文档边界

- 本文档定位为“技术开发规范文档”，优先记录稳定的架构约束、分层规则、扩展流程、验证标准。
- 不记录易变的具体 UI 操作步骤、临时交互文案或产品走查细节（这些应放在需求文档/设计稿/任务说明中）。
- 当实现变化仅影响交互细节而不影响技术约束时，可不更新本文档。

### 4.5 节点注册单一真相源

- 节点类型、默认数据、菜单展示、连线能力统一在 `domain/nodeRegistry.ts` 声明，不在 `Canvas.tsx` / `canvasStore.ts` 重复硬编码。
- `connectivity` 为连线能力配置源：
  - `sourceHandle` / `targetHandle`：是否具备输入输出端口。
  - `connectMenu.fromSource` / `connectMenu.fromTarget`：从输出端或输入端拉线时，是否允许出现在“创建节点菜单”。
- 菜单候选节点必须由注册表函数统一推导（如 `getConnectMenuNodeTypes`），禁止在 UI 层手写类型白名单。
- 内部衍生节点（如切割结果 `storyboardSplit`、导出节点）默认 `connectMenu` 关闭，只能由应用流程自动创建。

## 5. UI/交互规范

- 复用统一 UI 组件：`src/components/ui/primitives.tsx`。
- 风格统一使用设计变量和 token（`index.css`），避免散落硬编码样式。
- 输入框、工具条、弹窗保持与节点对齐，交互动画保持一致。
- 节点底部控制条（模型/比例/生成/导出等）尺寸样式统一从 `src/features/canvas/ui/nodeControlStyles.ts` 引用，禁止在各节点散落硬编码一套新尺寸。
- 节点工具条（NodeToolbar）位置、对齐、偏移统一从 `src/features/canvas/ui/nodeToolbarConfig.ts` 引用；禁止通过 `left/translate` 等绝对定位覆盖跟随逻辑。
- 选中覆盖层 `SelectedNodeOverlay` 只承载轻量通用覆盖能力（如工具条），节点核心业务输入区应内聚到节点组件本体（例如 `ImageEditNode`）。
- 对话框支持“打开/关闭”过渡，避免突兀闪烁。
- 明暗主题要可读，避免高饱和蓝色抢占焦点（导航图已优化为灰黑系）。
- 快捷键应避开输入态（`input/textarea/contentEditable`）避免误触。

## 6. 命令与验证

### 6.1 常用开发命令

```bash
# 前端开发
npm run dev

# Tauri 联调
npm run tauri dev

# 自动发布（默认建议配合 docs/releases/vx.y.z.md 使用）
npm run release -- patch --notes-file docs/releases/v0.1.12.md
```

### 6.2 快速检查（优先执行）

```bash
# TS 类型检查
npx tsc --noEmit

# Rust 快速检查
cd src-tauri && cargo check
```

### 6.3 收尾检查

```bash
# 前端完整构建
npm run build

# 触发一次正式发布（会同步版本、提交、打 tag、推送）
npm run release -- patch --notes-file docs/releases/v0.1.12.md
```

说明：
- 日常迭代不要求每次都完整打包，先走 `tsc --noEmit` + 关键路径手测。
- 影响打包、依赖、入口、持久化、Tauri 命令时，再执行完整构建。
- 发布说明优先落到 `docs/releases/vx.y.z.md`，再通过 `npm run release` 或“推送更新”口令触发发布。
- `docs/releases/vx.y.z.md` 的默认格式同样只保留二级标题分组和列表正文，不写额外总标题、范围说明和完整提交清单。

## 7. 性能实践

- 禁止在拖拽每一帧执行重持久化或重计算。
- 节点拖拽中不要写盘；拖拽结束再保存（项目已按该策略优化）。
- 大图片场景避免重复 `dataURL` 转换；节点渲染优先使用 `previewImageUrl`，模型/工具处理使用原图 `imageUrl`。
- 项目整量持久化（nodes/edges/history）使用防抖 + 空闲调度（idle callback）队列，避免与交互争用主线程。
- viewport 持久化走独立轻量队列与独立命令（`update_project_viewport_record`），不要回退到整项目 upsert。
- 视口更新要做归一化与阈值比较（epsilon），过滤微小抖动写入。
- 优先使用 `useMemo/useCallback` 控制重渲染；避免把大对象直接塞进依赖导致抖动。
- 画布交互优先“流畅”而非“实时全量持久化”，可使用短延迟合并保存。

## 8. 模型与工具扩展规范

### 8.1 新模型接入

- 一模型一文件，放到 `src/features/canvas/models/image/<provider>/`。
- 在模型定义中声明：
  - `displayName`
  - `providerId`
  - 支持分辨率/比例
  - 默认参数
  - 请求映射函数 `resolveRequest`

### 8.2 新工具接入

1. 在 `tools/types.ts` 声明能力（如 editor kind）。
2. 在 `tools/builtInTools.ts` 注册插件。
3. 在 `ui/tool-editors/` 新增对应编辑器。
4. 在 `application/toolProcessor.ts` 接入执行逻辑。
5. 保证产物仍走“处理后生成新节点”链路，不覆盖原节点。

### 8.3 新节点接入

1. 在 `domain/canvasNodes.ts` 增加类型与数据结构（必要时增加类型守卫）。
2. 在 `domain/nodeRegistry.ts` 注册定义：`createDefaultData`、`capabilities`、`connectivity`。
3. 在 `nodes/index.ts` 注册渲染组件。
4. 明确手动创建策略：
   - 可手动创建：配置 `connectMenu.fromSource/fromTarget`。
   - 仅流程创建：关闭 `connectMenu`，由工具/应用服务触发。
5. 如新增分组/父子节点行为，必须同步验证删除、解组、连线清理与历史快照。
6. 节点内控制条优先复用 `nodeControlStyles.ts` 里的统一尺寸 token；若需特化，基于统一 token 小幅覆盖，不新建一整套尺寸体系。
7. 节点工具条必须复用 `nodeToolbarConfig.ts`，并验证两点：
   - 拖拽节点时工具条随节点同步移动。
   - 多种节点尺寸下工具条仍保持相对居中（不出现固定在画布某处的情况）。

## 9. 持久化规范

- 项目数据通过 `projectStore` 自动持久化，不要求手动保存。
- 重启默认进入项目页；进入项目时恢复上次 viewport。
- 当前持久化后端为 SQLite，库文件位于 Tauri `app_data_dir/projects.db`。
- `projects` 表核心字段：`nodes_json`、`edges_json`、`viewport_json`、`history_json`、`node_count`。
- 前端持久化采用双通道：
  - 整项目快照：`upsert_project_record`（防抖 + idle 调度）。
  - 视口快照：`update_project_viewport_record`（轻量更新、独立防抖）。
- 图片字段通过 `imagePool + __img_ref__` 做去重编码；新增图片字段（如 `previewImageUrl`）需同步编码/解码映射。
- 变更 SQLite 表结构时：
  - 必须在 `ensure_projects_table` 中做自愈（`PRAGMA table_info` + `ALTER TABLE`）。
  - 开发阶段可不兼容旧的临时草稿格式，但不能破坏当前 `projects.db` 的基本可读性。

## 10. 提交前检查清单

- 功能路径可用（至少手测 1 条主路径 + 1 条异常路径）。
- 无明显性能回退（拖拽、缩放、输入响应）。
- 轻量检查通过：`npx tsc --noEmit`，Rust 改动则 `cargo check`。
- 大改或发布前：`npm run build`。
- 如为正式发布，确认 `docs/releases/vx.y.z.md` 已更新，并与本次 tag/版本号一致。
- 新增约束/行为变化需同步更新文档。

## 11. i18n 规范

- i18n 入口：`src/i18n/index.ts`
- 语言文件：`src/i18n/locales/zh.json`、`src/i18n/locales/en.json`
- 组件中统一使用 `useTranslation()` + `t('key.path')`，避免硬编码中英文文案。

### 11.1 Key 命名

- 使用模块化层级命名：`project.title`、`node.menu.uploadImage`、`common.save`。
- 避免把中文句子直接作为 key；key 必须稳定、可复用、可检索。
- 通用文案优先放 `common.*`，页面专属文案放对应模块前缀。

### 11.2 新增文案流程

1. 先在 `zh.json` 增加新 key。
2. 同步在 `en.json` 增加相同 key（不要缺语言键）。
3. 代码里只引用 key，不写 fallback 字面量。

### 11.3 动态值与复数

- 动态值用插值：`t('xxx', { count, name })`。
- 数量相关场景使用 i18next 复数规则，不手写字符串拼接。
- 数字/时间等先格式化，再传给 `t`。

### 11.4 最低验证

- 切换中英文后，不出现未翻译 key 泄露（例如直接显示 `project.title`）。
- 新增 key 在中英语言包均存在。
- 关键按钮、提示、错误文案在两种语言下都可读不截断。

## 12. Git 作为检错与可追溯性的单一真相源

本项目将 **Git commit 历史** 作为变更记录与问题定位的权威来源；`docs/changelog/` 仅作为"模块叙事层"辅助阅读，不承担精确定位职责。**所有 AI 编程 CLI（Claude Code、Codex 等）必须遵守本节规则。**

### 12.1 Commit 规范（Conventional Commits 简化版）

每个 commit 标题格式：

```
<type>(<scope>): <why in one line>
```

- `type`：`feat` | `fix` | `refactor` | `perf` | `docs` | `test` | `chore` | `style` | `build`
- `scope`：受影响的模块，**SSOT 清单**：
  - `canvas` · `nodes` · `video` · `storyboard` · `copilot` · `llm`
  - `persistence` · `tauri` · `web` · `i18n` · `settings` · `release`
- 标题写 **why**（动机），不要写 "update xxx" / "fix bug"

**强制约束：**

- **一个 commit 只做一件事**。AI 修改多个无关点时，必须拆成多个 commit。
- **颗粒度**：完成一个可解释的小目标就提交，不要攒成巨型 commit。
- **禁止** `--no-verify`、`--amend` 已推送的 commit、`reset --hard` 有未备份改动。
- 用户明确说"推送更新"才发版；日常编辑只提 commit，不打 tag、不推送，除非用户要求。

#### 12.1.1 `fix` 类型必带 Trailer（检错 SSOT）

**本项目的 bug 记录 SSOT = `fix` commit 的 message 本身**。不再另建 debug-log 文件。`fix` 类型 commit 的 body 必须包含以下 Trailer，缺一不可：

```
fix(<scope>): <一句话 why>

Symptom: <用户可观察到的一句话现象>
Trigger: <复现路径 / 上游节点 / 输入特征>
Root-Cause: <一句话，解释"为什么会这样"，不是"改了什么">
Fix: <一句话方案，不贴代码>
Affects: <path/a.ts, path/b.rs>
Verify: <最小重现步骤 / 观察点>
Related: <可选，相关老 commit 短 hash，多个用空格分隔>
```

- 字段值单行，不要换行段落
- `Related:` 仅在本次修复借鉴 / 回归了历史 commit 时填写
- 非 `fix` 类型（feat/refactor/chore...）不需要这些 Trailer

#### 12.1.2 其他类型的正文

`feat` / `refactor` / `perf` 可选地写一段正文说明实现要点、影响面、验证方式，不强制 Trailer。

### 12.2 改动收尾流程（每次 AI 编辑完成时执行）

完成一轮编辑后、告知用户任务结束前，按顺序：

1. `git status` 查看改动
2. 按逻辑单元分别 `git add <files>` + `git commit -m "<type>(<scope>): <why>"`
3. 将 commit hash 与一句话变更摘要告知用户
4. **不要自动 push**

### 12.3 检错标准流程（命中历史 commit 必须做三步验证）

**第一步：按症状搜索历史 fix**（这一步永远先做，比读任何文档优先）：

```bash
# 按症状关键词跨模块搜（最常用）
git log --all --grep="<keyword>" --format="%h %s" | head -20

# 按模块过滤 fix 历史
git log --grep="^fix(<scope>):" --format="%h %s" -20

# 精确匹配 Trailer 字段（配合 -E / -P）
git log --grep="Symptom:.*<关键词>" --format="%h %s" | head -20
```

**第二步：命中后的强制验证三步**（防止盲目照抄老 fix）：

1. `git show <old-hash>` —— 看当年的 Trailer（Symptom/Root-Cause/Fix）与 diff
2. `git log <old-hash>..HEAD -- <affected-files>` —— 看历史到现在代码改过什么
3. **读当前代码，验证老 Root-Cause 是否仍成立**：
   - 成立 → 很可能是回归，参考老 Fix 思路改，新 commit Trailer 带 `Related: <old-hash>`
   - 不成立 → 当作新 bug 处理，**不得照搬老 fix**；命中仅帮助定位到出事区域

**第三步：未命中时回落常规有界查询**：

| 场景 | 命令 | 输出量 |
|---|---|---|
| 某行为何这么写 | `git blame -L <start>,<end> <file>` | 很小 |
| 某文件最近改动概览 | `git log --oneline -20 <file>` | 20 行 |
| 某 commit 改了啥 | `git show <hash> --stat` → `git show <hash> -- <file>` | 可控 |
| 找引入/删除某符号的 commit | `git log --oneline -S "<symbol>" -- <path>` | 几行 |
| 定位回归 commit | `git bisect start` + 判定脚本 `git bisect run <script>` | 仅测试输出 |
| 文件被重命名后追溯 | `git log --follow --oneline <file>` | 可控 |

### 12.4 Token 控制（反模式清单）

**禁止：**

- ❌ `git log -p`（不加文件与范围，会 dump 全量 diff）
- ❌ `git blame <file>` 不加 `-L` 行范围
- ❌ 为了"了解历史"批量读取 `docs/changelog/*.md` 全文
- ❌ 让 AI "看看最近都改过什么" 这种无界查询
- ❌ 命中历史 commit 就直接照搬老 fix（必须走 §12.3 第二步的验证三步）

**推荐：**

- ✅ `git log --grep` 优先于任何其他检错动作
- ✅ 先 `--stat` / `--oneline` 看骨架，再精准拉 diff
- ✅ 多文件历史用 `git log --oneline -20 -- <dir>`
- ✅ 必要时 `| head -n 50` 主动截断

### 12.5 changelog 的定位调整

- `docs/changelog/<模块>.md` 仍然保留，但**不要求每次改动都手写**。
- 发版时通过 `npm run release` 聚合生成；日常模块演变由 git 历史承载。
- 手写 changelog 条目时必须带 **commit hash 或 PR 号**，否则无检错价值。

### 12.6 适用范围与冲突处理

- 本节规则对 Claude Code、Codex CLI、以及任何后续接入的 AI 编程 CLI 同等生效。
- 与上文章节冲突时，以本节（§12）为准。
- 与用户当次明确要求冲突时，以用户要求为准。

### 12.7 文档分工总览

| 用途 | 位置 | 谁写 |
|---|---|---|
| 代码级真相 / bug 症状索引 / 根因与修复 | **git commit（`fix` 类型必带 Trailer）** | AI 提交时写 |
| 模块演变叙事（供人阅读，非必需） | `docs/changelog/<module>.md` | 可选，由发版脚本聚合 |
| 版本发布说明 | `docs/releases/vx.y.z.md` | 发版时 |
| 规范与流程 SSOT | `AGENTS.md` / `CLAUDE.md` | 约定变化时 |

**不再维护独立的 debug-log 文件**。commit 本身即索引，`git log --grep` 即查询接口。

---

如与用户明确要求冲突，以用户要求优先；如与运行时安全冲突，以安全优先。
