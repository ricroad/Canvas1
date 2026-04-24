# LLM 集成 变更日志

### [2026-04-09] 新建 Rust 端 LLM 命令
- **文件**:
  - `src-tauri/src/commands/llm.rs` — chat_completion、generate_storyboard_prompts、read_text_file
  - `src-tauri/src/commands/mod.rs` — 注册 llm 模块
  - `src-tauri/src/lib.rs` — 注册 3 个命令
  - `src-tauri/Cargo.toml` — 新增 lopdf、zip 依赖（PDF/DOCX 解析）
- **操作**: 支持 OpenAI-compatible 和 Gemini 两种 API 格式，多轮对话
- **原因**: 为 Copilot 聊天和 StoryboardLlm 分镜生成提供后端
- **验证**: `cargo check` 通过

### [2026-04-09] 前端 LLM 命令适配
- **文件**:
  - `src/commands/llm.ts` — generateStoryboardPrompts、chatCompletion、readTextFile
  - `src/commands/web/llm.ts` — Web 端浏览器直接 fetch
- **操作**: Tauri 环境走 invoke，Web 环境走 fetch 直连 API
- **验证**: TypeScript 编译通过

### [2026-04-09] 更新 LLM 模型列表
- **文件**: `src/features/canvas/models/llm/index.ts`
- **操作**: 更新为稳定模型 ID（移除过期的日期后缀），包含 Gemini 3.1 Pro/Flash Lite、2.5 Pro/Flash/Flash Lite、2.0 Flash、DeepSeek V3/R1、Qwen3 235B
- **原因**: 用户遇到 Gemini API 404，原因是模型 ID `gemini-2.5-pro-preview-05-06` 已过期
