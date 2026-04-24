# Copilot 面板 变更日志

### [2026-04-09] 接通 LLM API 作为聊天机器人
- **文件**:
  - `src/features/copilot/CopilotPanel.tsx` — handleSend 重写，调用 chatCompletion()
  - `src/stores/copilotStore.ts` — 聊天状态管理
  - `src/commands/llm.ts` — chatCompletion 命令适配（Tauri/Web 双通道）
  - `src/commands/web/llm.ts` — Web 端直接 fetch LLM API
  - `src-tauri/src/commands/llm.rs` — Rust 端 chat_completion 命令
- **操作**: Copilot 从静态欢迎界面升级为可对话的聊天机器人，支持多轮对话（最近 20 条消息作为上下文）
- **原因**: 用户要求先做聊天功能，后续再接入工作流
- **验证**: 需配置 API Key 后测试实际对话

### [2026-04-09] CSS 变量恢复 — Copilot 样式修复
- **文件**: `src/index.css`
- **操作**: 见 [styles.md](styles.md) 2026-04-09 条目
- **验证**: `--copilot-text-primary` 等变量已在运行时确认生效

### [2026-04-11] Copilot script upload now persists to the current project
- **Files**:
  - `src/features/copilot/CopilotPanel.tsx`
- **Changes**:
  - After a script is uploaded in Copilot, its extracted text is now also written into the current project's `scriptMd`
  - This keeps Copilot-uploaded scripts available to canvas nodes without requiring a separate `ScriptUpload` step
- **Reason**: Support the intended workflow where the script is uploaded once in Copilot and then consumed by `StoryboardLlm`
- **Impact**: Storyboard planning nodes can reuse the latest project script directly
- **Verification**: `npx tsc --noEmit`, `npm run build`

### [2026-04-11] Script uploads now preserve the raw script as an immutable project document
- **Files**:
  - `src/features/copilot/CopilotPanel.tsx`
  - `src/stores/projectStore.ts`
  - `src/commands/projectState.ts`
  - `src/commands/web/idb.ts`
  - `src-tauri/src/commands/project_state.rs`
- **Changes**:
  - Copilot uploads now save both the raw script text and the source file name into the current project
  - Project persistence now has separate fields for raw script content, source file name, import time, and derived analysis JSON
  - Future parsing and scene extraction logic can write to `scriptAnalysisJson` without mutating the original script text
- **Reason**: Keep the uploaded screenplay content unchanged while still allowing later structural analysis and LLM planning
- **Impact**: The project model now supports a safe raw-document workflow for future script parsing skills
- **Verification**: `npx tsc --noEmit`
