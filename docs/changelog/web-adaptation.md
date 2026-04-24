# Web 适配 变更日志

### [2026-04-09] 全面适配浏览器运行环境
- **文件**:
  - `src/commands/platform.ts` — 新建，`isTauriEnv()` 集中检测
  - `src/commands/web/idb.ts` — 新建，IndexedDB 持久化（替代 SQLite）
  - `src/commands/web/llm.ts` — 新建，浏览器端直接 fetch LLM API
  - `src/commands/web/image.ts` — 新建，Canvas API 图片处理（替代 Rust）
  - `src/commands/web/dialog.ts` — 新建，Web 安全对话框/文件选择器
  - `src/commands/projectState.ts` — 重写，isTauriEnv() 适配
  - `src/commands/llm.ts` — 重写，双通道适配
  - `src/commands/ai.ts` — 修改，图片生成在 Web 端提示不支持
  - `src/commands/image.ts` — 重写，16 个图片命令全量适配
  - `src/commands/system.ts` — 重写
  - `src/commands/update.ts` — 重写
  - `src/components/TitleBar.tsx` — appWindow 改为 useMemo nullable
  - `src/components/SettingsDialog.tsx` — 动态导入 Tauri 插件
  - `src/stores/settingsStore.ts` — queueMicrotask 修复循环引用
  - `package.json` — 新增 `build:web` 脚本
- **操作**: 为所有 Tauri invoke 调用创建 Web 端降级实现，通过 `isTauriEnv()` 分支
- **原因**: 用户需要将项目部署到公司内网，通过浏览器访问
- **影响**: 前端可在无 Tauri 的纯浏览器环境运行（图片生成功能除外）
- **验证**: `npm run build` 通过，dev server 页面可加载

### [2026-04-09] settingsStore 循环引用修复
- **文件**: `src/stores/settingsStore.ts`
- **操作**: 将 `useSettingsStore.setState({ isHydrated: true })` 包裹在 `queueMicrotask()` 中
- **原因**: 在 store 创建过程中直接调用 setState 触发 `ReferenceError: Cannot access 'useSettingsStore' before initialization`
- **影响**: 修复 Web 端黑屏问题

### [2026-04-11] IndexedDB summary typing fix
- **File**: `src/commands/web/idb.ts`
- **Changes**: Added `IdbProjectSummaryRecord` and used it as the return type of `idbListProjectSummaries()`
- **Reason**: The previous return type incorrectly required `scriptMd` for summary records, which caused a TypeScript build error
- **Impact**: Web project summary persistence types now match the actual IndexedDB payload shape
- **Verification**: `npm run build`
