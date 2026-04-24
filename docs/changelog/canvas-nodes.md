# 画布节点系统 变更日志

### [2026-04-09] 新增 ScriptUpload 和 StoryboardLlm 节点（由前一个 agent 添加）
- **文件**:
  - `src/features/canvas/nodes/ScriptUploadNode.tsx` — 剧本上传节点
  - `src/features/canvas/nodes/StoryboardLlmNode.tsx` — LLM 分镜生成节点
  - `src/features/canvas/application/graphTextResolver.ts` — 图遍历提取剧本文本
  - `src/features/canvas/models/llm/index.ts` — LLM 模型定义（Gemini 3.1/2.5、DeepSeek、Qwen3）
  - 更新 `canvasNodes.ts`、`nodeRegistry.ts`、`nodeDisplay.ts`、`nodes/index.ts`
  - 更新 `Canvas.tsx`（新增节点可作为连线源）
- **操作**: 完整的节点注册链路（类型 → 注册 → 渲染 → 翻译）
- **原因**: 支持剧本上传 → LLM 分镜生成 → AI 图片生成工作流
- **验证**: TypeScript 编译通过，代码审查确认注册完整。运行时功能待用户测试确认

### [2026-04-09] 代码审查确认：新节点注册完整
- **操作**: 逐层检查 ScriptUpload 和 StoryboardLlm 的注册链路
- **结论**:
  - `CANVAS_NODE_TYPES` 中注册 ✓
  - `canvasNodes.ts` 数据接口 + 类型守卫 ✓
  - `nodeRegistry.ts` 定义 + 连线能力 + connectMenu ✓
  - `nodeDisplay.ts` 默认显示名 ✓
  - `nodes/index.ts` 组件注册 ✓
  - `Canvas.tsx` 连线源白名单 ✓
  - Rust 后端命令注册（lib.rs + llm.rs）✓
  - 前端命令适配（commands/llm.ts）✓
- **影响**: 无需修改，保持现状

### [2026-04-11] Node typing and compile fixes
- **Files**:
  - `src/features/canvas/domain/canvasNodes.ts`
  - `src/features/canvas/domain/nodeRegistry.ts`
  - `src/features/canvas/scene-composer/SceneComposerNode.tsx`
- **Changes**:
  - Aligned `StoryboardLlmNodeData` fields with the fields actually used by the UI: `episode`, `scene`, and `styleHint`
  - Added `generatedPrompts: []` to `StoryboardLlm` default node data
  - Fixed a JSX closing-tag error in `SceneComposerNode.tsx`
- **Reason**: The previous type definitions and JSX structure caused front-end compilation failures
- **Impact**: `StoryboardLlm` and `SceneComposer` now compile cleanly with the current UI implementation
- **Verification**: `npm run build`

### [2026-04-11] Storyboard planning now feeds StoryboardGen directly
- **Files**:
  - `src/features/canvas/nodes/StoryboardLlmNode.tsx`
- **Changes**:
  - `StoryboardLlmNode` now prefers the current project's stored script text and falls back to upstream `ScriptUpload` content
  - LLM generation results are written back to the node itself through `generatedPrompts` and synced `shotCount`
  - The node now creates or updates a downstream `StoryboardGen` node instead of spawning multiple `ImageEdit` nodes
  - Generated prompts are mapped into ordered storyboard frames and the grid is resized to fit the returned shot count
- **Reason**: Align the node with the intended workflow of script analysis -> storyboard planning -> storyboard generation
- **Impact**: The storyboard LLM node now acts as a planning node inside the canvas flow instead of a batch image-node spawner
- **Verification**: `npx tsc --noEmit`, `npm run build`

### [2026-04-11] Added canvas selection mode and auto layout
- **Files**:
  - `src/features/canvas/Canvas.tsx`
  - `src/features/canvas/CanvasToolbar.tsx`
- **Changes**:
  - Added a real canvas toolbar with `select` and `hand` mode toggles
  - `select` mode now favors marquee selection on drag, while `hand` mode restores drag-to-pan behavior
  - Added an auto-layout action that arranges selected top-level nodes, or all top-level nodes when nothing is selected
  - Auto layout uses edge relationships to place nodes left-to-right by layer and then fits the viewport after rearranging
- **Reason**: Improve basic canvas operability before adding more advanced tools
- **Impact**: The canvas now has a clearer interaction model and a one-click cleanup action for demos and daily use
- **Verification**: `npx tsc --noEmit`, `npm run build`
# Canvas Nodes

## 2026-04-19

- **文件**:
  - `src/features/canvas/nodes/StoryboardLlmNode.tsx`
- **改动**:
  - 为 `StoryboardLlmNode` 增加内部内容容器，统一表单区、按钮区和错误区的盒模型。
  - 底部按钮区改为 `shrink-0`，并为错误提示增加固定收缩行为和行高约束。
- **原因**:
  - 修复分镜生成节点底部组件在节点边框外溢出的前端样式问题。
- **影响**:
  - 节点底部布局更稳定，按钮和错误提示不会再贴着容器边界向外撑出。
- **验证**:
  - `npm run build`
