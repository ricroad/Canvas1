# 构图修正 (SceneComposer) 变更日志

### [2026-04-09] 清理坏掉的 SceneComposer 空壳实现
- **文件**: 删除 `src/features/canvas/scene-composer/` 整个目录（SceneComposerNode.tsx、SceneComposerEditor.tsx、ScenePreview2D.tsx、useFlipTransition.ts、cameraLabels.ts、types.ts）
- **操作**: 移除注册（canvasNodes.ts、nodeRegistry.ts、nodeDisplay.ts、nodes/index.ts）、翻译键（zh.json、en.json）
- **原因**: 之前 agent 实现的版本只是占位：2D 俯视图 + 空白 3D 面板，完全没有用到原始 scene_composer_v11.html 的 Three.js 渲染和布局引擎
- **影响**: 画布菜单中暂时移除"构图修正"选项
- **验证**: `npx tsc --noEmit` 通过，无残留引用

### [2026-04-09] 重建 SceneComposer — iframe 嵌入 v11 完整实现
- **文件**:
  - 新建 `src/features/canvas/scene-composer/SceneComposerNode.tsx`
  - 复制 `scene_composer_v11.html` → `public/scene_composer_v11.html`
  - 更新 `canvasNodes.ts`（类型 + SceneComposerNodeData 接口）
  - 更新 `nodeRegistry.ts`（节点定义 + 注册）
  - 更新 `nodeDisplay.ts`（默认显示名）
  - 更新 `nodes/index.ts`（组件注册）
  - 更新 `zh.json` / `en.json`（翻译键）
- **操作**: 用 iframe 嵌入完整的 scene_composer_v11.html，节点尺寸 800x560，`nodrag nowheel` 防止 ReactFlow 捕获鼠标事件
- **原因**: iframe 方案最稳定 — v11 是完整自包含 HTML（Three.js + CSS + 布局引擎），无需拆分重写
- **影响**: 画布菜单恢复"构图修正"选项，用户可在画布内直接操作 3D 场景
- **验证**: `npx tsc --noEmit` 通过，dev server 无控制台错误

### [2026-04-09] 实现 postMessage 数据流 — iframe ↔ React 节点通信
- **文件**:
  - `src/features/canvas/scene-composer/SceneComposerNode.tsx` — useEffect 监听 `sceneforge:export` 消息
  - `src/features/canvas/domain/canvasNodes.ts` — SceneComposerNodeData 新增 compositionImageUrl、sceneJson、compositionPrompt
  - `src/features/canvas/domain/nodeRegistry.ts` — createDefaultData 补充新字段
  - `public/scene_composer_v11.html` — 新增 `notifyParent()`、`buildSceneData()`、`buildPromptText()`，在 copyToClipboard 末尾调用
- **协议**: iframe 通过 `window.parent.postMessage({ type: 'sceneforge:export', imageDataUrl, sceneJson, prompt })` 发送数据
- **数据流**: 用户点击"复制构图参考" → iframe 渲染高清图 → postMessage 发送图片 dataURL + 场景 JSON + 文字提示词 → React 节点接收存入 nodeData → 下游节点通过 edge 读取
- **验证**: `npx tsc --noEmit` 通过

### [2026-04-09] 重构为小卡片 + 全屏展开模式
- **文件**:
  - `src/features/canvas/scene-composer/SceneComposerNode.tsx` — 重写为 320x220 小卡片 + Portal 全屏覆盖层
  - `src/index.css` — 新增 `@keyframes fadeIn` 和 `@keyframes scaleIn` 动画
- **操作**:
  - 节点卡片只展示结果：站位图预览 + 场景信息徽标（相机描述、物体数量、画幅比）
  - 未导出时显示相机图标 + 提示文案
  - 右上角展开按钮 → `createPortal(overlay, document.body)` 全屏覆盖编辑器
  - 全屏覆盖：黑色遮罩 85% + 毛玻璃 + 圆角编辑器容器 + 标题栏 + iframe
  - 展开动画：fadeIn 200ms (遮罩) + scaleIn 250ms (编辑器容器)
  - 关闭：点击 X 按钮或遮罩层
- **原因**: 用户明确需求 — 节点只呈现产物（站位图），详细操作在全屏工具页完成；原 800x560 iframe 嵌入无法完整显示编辑器内容
- **技术要点**: 必须用 React Portal 挂载到 body，因为 ReactFlow 节点在 transform 上下文中，`position: fixed` 会被缩放影响
- **验证**: `npx tsc --noEmit` 通过，浏览器测试展开/关闭流程正常，全屏编辑器完整可见

### [2026-04-10] 展开/关闭动画改为 iPhone 风格 CSS transition
- **文件**: `src/features/canvas/scene-composer/SceneComposerNode.tsx`
- **操作**:
  - 删除 `@keyframes fadeIn/scaleIn`，改用 inline `transition` 属性
  - 用 `mounted` + `visible` 双状态管理生命周期：mounted 控制 DOM 挂载，visible 控制 CSS transition 目标态
  - 打开：`scale(0.88) opacity(0)` → `scale(1) opacity(1)`，`cubic-bezier(0.2,0.9,0.3,1)` 缓动
  - 关闭：反向过渡 260ms 后卸载 DOM
  - `willChange: transform, opacity` 走 GPU 合成层
- **清理**: 从 `src/index.css` 移除不再需要的 `@keyframes fadeIn` 和 `@keyframes scaleIn`

### [2026-04-10] 修复实时预览（PiP）黑屏 — 双 renderer GL 状态污染
- **文件**: `public/scene_composer_v11.html`、`scene_composer_v11.html`（根目录源文件同步）
- **问题**: 右上角实时预览 canvas 始终全黑，主 3D 视口正常
- **根因**: Three.js r128 双 WebGLRenderer（`rMain` + `rPip`）共享同一 Scene 时，`rMain.render()` 更新材质 version 标记后，`rPip` 的内部缓存认为材质"已上传"但实际从未向 context B 上传 GPU 数据
- **排除过程**:
  1. `clearAlpha=0` → 修复为 `setClearColor(0x000000,1)`，仍然黑屏
  2. 改用 `WebGLRenderTarget` + `readRenderTargetPixels` → WebView2 中像素读取不可靠
  3. 改用 `setSize` + `drawImage` 每帧切换 → 破坏主画布渲染
- **最终修复**: 保留原始双 renderer 架构，在 `rPip.render()` 前遍历 scene 强制所有材质 `needsUpdate=true`
  ```js
  scene.traverse(function(o){
    if(o.material){
      if(Array.isArray(o.material)) o.material.forEach(function(m){m.needsUpdate=true});
      else o.material.needsUpdate=true;
    }
  });
  rPip.render(scene, filmCam);
  ```
- **同时修复**: `rPip.setClearColor(0x000000,1)` 确保清除时 alpha=1（不透明）
- **验证**: 待 Tauri 环境确认
