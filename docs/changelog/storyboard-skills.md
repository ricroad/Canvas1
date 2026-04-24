# Storyboard Skills

## 2026-04-19

- **文件**:
  - `src/features/storyboard-skills/domain/types.ts`
  - `src/features/storyboard-skills/infrastructure/registry.ts`
  - `src/features/storyboard-skills/application/generateStoryboardPromptsWithSkill.ts`
  - `src/features/storyboard-skills/index.ts`
  - `src/stores/settingsStore.ts`
  - `src/components/SettingsDialog.tsx`
  - `src/components/LeftStrip.tsx`
  - `src/features/canvas/nodes/StoryboardLlmNode.tsx`
  - `src/features/settings/settingsEvents.ts`
- **改动**:
  - 新增 `storyboard-skills` 模块，抽离分镜提示词生成前的 skill 策略层。
  - 内置 `storyboard.basic.v1`、`storyboard.cinematic.v1`、`storyboard.continuity.v1` 三个可切换 skill。
  - 在设置页增加独立 `Skills` 分类，并支持持久化当前默认 skill。
  - 在左侧悬浮工具条增加独立 skill icon，点击后直达设置页的 `Skills` 面板。
  - `StoryboardLlmNode` 改为通过 skill 服务生成分镜提示词，不再直接依赖固定提示词模板实现。
- **原因**:
  - 为后续替换分镜分析策略、提升模块内聚、降低节点组件与具体 prompt 实现的耦合度。
- **影响**:
  - 分镜 LLM 节点的规划策略可以通过设置切换。
  - 后续新增分镜 skill 时，只需要注册新 skill，无需改节点主流程。
- **验证**:
  - `npm run build`
