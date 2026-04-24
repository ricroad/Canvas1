
<h1>无限画布 · Infinite Canvas</h1>
  <h3>基于节点画布的 AI 创作工作台 · 图像生成 / 编辑 / 分镜 / 视频一站式</h3>
</div>

<div align="center">
  <img src="./docs/imgs/readme/storyboard-copilot-homepage.webp" alt="无限画布首页" width="820" />
</div>

## 产品定位

**无限画布** 以「节点 + 连线」作为核心交互，把 AI 图像生成、图像编辑、剧本解析、分镜规划、分镜批图和视频生成串成一条可视化工作流。用户通过拖拽节点、连线构建从素材到成片的创作链路，所有中间产物在画布上并行留存，可追溯、可回退、可再编排。

### 核心能力

- **节点画布系统**：基于 `@xyflow/react` 的无限画布，支持拖拽、连线、分组、自动布局、历史回退
- **AI 图像生成 / 编辑**：多家模型提供商（fal、KIE、Grsai、PPIO），支持文生图、图生图、多图参考
- **剧本 → 分镜**：剧本上传 / Copilot 对话 → LLM 拆镜 → 批量分镜图生成 → 导出
- **视频生成**：`VideoGenNode` + `VideoResultNode`，支持模型选择、比例/时长设置、任务取消
- **场景构图**：内嵌 3D 场景构图器（Scene Composer），用构图结果驱动下游生成
- **Copilot 对话面板**：多轮上下文，支持剧本上传回写到当前项目
- **双端运行**：桌面端（Tauri 2 + SQLite）与 Web 端（IndexedDB）两套持久化通道
- **自动持久化**：项目级快照 + 视口独立通道，拖拽不写盘、结束即保存

---

## 技术栈

- **前端**：React 18 · TypeScript · Vite · Zustand · `@xyflow/react` · TailwindCSS · react-i18next
- **桌面容器**：Tauri 2（Rust）
- **持久化**：SQLite（`rusqlite`，WAL）/ IndexedDB（Web fallback）
- **图像处理**：Rust `image` crate · Konva · react-easy-crop
- **3D**：three.js（Scene Composer）

---

## 环境要求

- Node.js 20+ · npm 10+
- Rust stable（含 Cargo，仅桌面端需要）
- Tauri 平台依赖（Windows / macOS）

参考：[基础工具安装配置](./docs/development-guides/base-tools-installation.md)

---

## 快速开始

```bash
# 安装依赖
npm install

# 仅前端开发
npm run dev

# Tauri 桌面端联调（推荐）
npm run tauri dev

# Web 端构建
npm run build:web
```

---

## 项目架构

### 目录结构

```
src/
  App.tsx                    # 应用入口：主题、对话框、项目切换
  stores/
    projectStore.ts          # 项目生命周期 + 持久化协调
    canvasStore.ts           # 节点 / 边 / 视口 / 历史
    settingsStore.ts         # 设置与提供商配置
    copilotStore.ts          # Copilot 会话状态
    themeStore.ts            # 主题
  features/
    canvas/                  # 画布核心
      Canvas.tsx             # ReactFlow 封装
      domain/
        canvasNodes.ts       # 节点类型与数据结构（单一真相源）
        nodeRegistry.ts      # 注册表：capabilities / connectivity / defaults
        nodeDisplay.ts
      nodes/                 # 节点渲染组件
      ui/                    # 工具条、选中覆盖层、tool-editors
      tools/                 # 工具插件体系
      models/                # AI 模型注册（image/<provider>/*）
      application/           # 图文本解析、工具执行、图片数据
    project/                 # 项目管理页
    copilot/                 # Copilot 对话面板
    settings/                # 设置面板
    storyboard-skills/       # 分镜技能体系
  commands/                  # 命令边界（桌面 / Web 分流）
    projectState.ts ai.ts image.ts llm.ts platform.ts system.ts update.ts
    web/                     # Web 端安全实现
  components/                # 全局 UI
  i18n/                      # zh / en
src-tauri/
  src/
    lib.rs                   # Tauri 入口
    commands/                # project_state / ai / image / llm / system / update
    ai/providers/            # fal / kie / grsai / ppio
```

### 分层

```
UI (React)  →  Store (Zustand)  →  Application (解析/工具/服务)
           →  Command 桥接 (TS)  →  Tauri 命令 (Rust) / Web 适配
           →  SQLite / IndexedDB / 文件系统
```

**关键原则**

- 单向数据流，禁止跨层偷改状态
- Store 只做状态管理，业务下沉到 application/
- 节点注册 **单一真相源** 在 `domain/nodeRegistry.ts`
- 模型与工具通过注册表扩展，无需改核心

---

## 节点体系

| 节点         | 标识                   | 功能                 | 手动创建       |
| ------------ | ---------------------- | -------------------- | -------------- |
| 图片上传     | `uploadNode`         | 上传本地图片         | ✅             |
| AI 图像编辑  | `imageNode`          | 文生图 / 图生图      | ✅             |
| 图像结果     | `imageEditNode`      | 图像生成 / 编辑结果  | ✅             |
| 分镜切割结果 | `storyboardNode`     | 展示切割后的分镜帧   | ❌（工具创建） |
| 分镜批量生成 | `storyboardGenNode`  | 批量生成分镜图       | ✅             |
| 文本标注     | `textAnnotationNode` | 文字说明             | ✅             |
| 分组         | `groupNode`          | 节点分组容器         | ❌（自动创建） |
| 导出节点     | `exportImageNode`    | 图片导出结果         | ❌（工具创建） |
| 脚本上传     | `scriptUploadNode`   | 上传剧本文件         | ✅             |
| LLM 分镜     | `storyboardLlmNode`  | LLM 解析剧本生成分镜 | ✅             |
| 场景构图     | `sceneComposerNode`  | 3D 场景构图辅助      | ✅             |
| 视频生成     | `videoGenNode`       | 提交视频生成任务     | ✅             |
| 视频结果     | `videoResultNode`    | 视频任务结果与预览   | ❌（流程创建） |

---

## 主要节点链路

- `UploadNode → ImageEditNode`：标准图生图 / 图片辅助生成
- `ScriptUploadNode / Copilot → StoryboardLlmNode → StoryboardGenNode`：剧本 → 拆镜 → 批量生成
- `UploadNode / ImageNode → SceneComposerNode → ImageEditNode`：3D 构图驱动生成
- `ImageEditNode → VideoGenNode → VideoResultNode`：图像驱动视频生成

---

## 扩展开发

### 新增 AI 模型

1. 在 `src/features/canvas/models/image/<provider>/` 新建模型文件
2. 声明 `id`、`displayName`、`providerId`、分辨率 / 比例、`resolveRequest`
3. 在 `models/registry.ts` 注册

### 新增工具

1. `tools/types.ts` 声明能力
2. `tools/builtInTools.ts` 注册插件
3. `ui/tool-editors/` 新增编辑器
4. `application/toolProcessor.ts` 接入执行

### 新增节点

1. `domain/canvasNodes.ts` 增加类型与数据接口
2. `domain/nodeRegistry.ts` 注册（capabilities / connectivity / defaults）
3. `nodes/MyNode.tsx` 实现渲染
4. `nodes/index.ts` 注册组件
5. 如参与数据流，同步 resolver / store 变更

---

## 持久化

- **桌面端**：SQLite（`app_data_dir/projects.db`），图片文件 `app_data_dir/images/`
- **Web 端**：IndexedDB
- **双通道**：整项目 `upsert_project_record`（防抖 + idle）+ 视口 `update_project_viewport_record`（轻量独立）
- **图片去重**：`imagePool + __img_ref__` 编码，自动清理未引用图片
- **历史**：12 步快照栈，Ctrl+Z / Ctrl+Shift+Z

---

## 常用命令

```bash
# 类型检查
npx tsc --noEmit

# Rust 快速检查
cd src-tauri && cargo check

# 前端构建
npm run build

# Tauri 构建
npm run tauri build

# 一键发布（自动递增 patch，同步版本、打 tag、推送）
npm run release -- patch "更新说明"
```

---

## 设计规范

- Dark-first，Apple 风格
- 单一强调色：Apple Blue `#0071e3`
- 背景分层：`#1d1d1f` 主表面 · `#2a2a2d` elevated
- 圆角：6 / 10 / 16（微 / 标准 / 对话框）

详见 [docs/DESIGN.md](./docs/DESIGN.md)

---

## 文档导航

- [CLAUDE.md](./CLAUDE.md) · 代码协作与架构规范
- [docs/development-guides/](./docs/development-guides) · 环境、项目、模型扩展
- [docs/changelog/](./docs/changelog) · 模块变更记录
- [docs/releases/](./docs/releases) · 版本发布说明
- [docs/learning/](./docs/learning) · 新人学习路径
- [docs/api_docs/](./docs/api_docs) · 第三方 API 参考
- [docs/settings/provider-guide.md](./docs/settings/provider-guide.md) · 模型服务商接入指引

---

## 数据与日志位置

- SQLite：`app_data_dir/projects.db`
- 图片：`app_data_dir/images/`
- 日志：
  - macOS：`~/Library/Logs/storyboard-copilot/`
  - Windows：`%TEMP%/storyboard-copilot/logs/`

> 注：日志目录名沿用旧的 `storyboard-copilot`，以避免已安装用户的日志位置漂移。

---

## License

[MIT](./LICENSE)
