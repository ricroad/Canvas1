# 设置页 变更日志

### [2026-04-09] 移除原作者自动更新系统
- **文件**:
  - `src/App.tsx` — 移除 UpdateAvailableDialog、checkForUpdate 导入及所有更新相关状态/效果/回调
  - `src/components/SettingsDialog.tsx` — 关于页面精简为仅显示 app 图标、名称、版本、作者
- **操作**: 清除自动更新逻辑，后续由团队自行管理更新
- **原因**: 用户明确要求："请你抹除，后续我们将完全由自己完成更新"
- **影响**: App.tsx 不再弹出更新对话框，设置页关于栏简化
- **验证**: 编译通过，无残留导入
- **注意**: SettingsDialog 中仍保留 `onCheckUpdate` prop 和相关本地状态变量，待后续清理

### [2026-04-09] 关于页添加作者名
- **文件**: `src/components/SettingsDialog.tsx`、`src/i18n/locales/zh.json`、`src/i18n/locales/en.json`
- **操作**: 在版本号下方添加 `作者: He Yanzu`，新增 i18n key `settings.aboutAuthorLabel`
- **原因**: 用户要求在关于栏添加自己的名字
