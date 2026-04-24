# 样式/CSS 变更日志

### [2026-04-09] 恢复被删除的 Copilot/LeftStrip CSS 变量
- **文件**: `src/index.css`
- **操作**: 在 `:root` 和 `.dark` 中补回 40+ 个 `--copilot-*` 和 `--strip-*` CSS 变量，补回 `.copilot-panel-enter` 过渡动画
- **原因**: 之前的 agent 在修改 CSS 时误删了这些变量，导致 Copilot 面板和 LeftStrip 工具栏样式完全丢失
- **影响**: `CopilotPanel.tsx`、`LeftStrip.tsx` 的所有内联样式依赖这些变量
- **验证**: 浏览器预览确认 `getComputedStyle` 返回 `--copilot-text-primary: rgba(255, 255, 255, 0.9)`
