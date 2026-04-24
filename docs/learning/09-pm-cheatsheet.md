# PM 速查表

## 需求类型 / 典型改动范围 / 粗略成本

| 需求类型 | 典型改动范围 | 粗略成本 |
|---|---|---|
| 改节点文案、按钮文案、局部样式 | 节点组件、i18n | 低 |
| 调整某节点默认值 | `nodeRegistry.ts`，有时补 UI | 低到中 |
| 新增一个正式节点类型 | `canvasNodes.ts`、`nodeRegistry.ts`、节点组件、`nodes/index.ts`、可能补 resolver/store | 中 |
| 让节点结果变成“可派生结果节点” | 节点数据结构、store、结果节点、持久化 | 中到高 |
| 让上游字段实时影响下游 | resolver / store / 节点逻辑 | 中到高 |
| 只在连线时拷贝一次上游值 | `onConnect` / 节点字段 | 中 |
| 新增一种图片工具 | `tools/types.ts`、`builtInTools.ts`、editor、processor | 中 |
| 新增现有 provider 下的新模型 | 前端 model + 后端适配 | 中 |
| 新接一家 provider | 前端 provider / model + 设置 + Rust provider | 高 |
| 增加新导出格式或本地保存能力 | UI + command + Rust image/file handling | 中高 |
| 补齐 Web 与桌面完全等价 | command + web fallback + 产品降级策略 | 高 |
| 改自动保存或历史恢复语义 | `projectStore` + persistence + 恢复兼容 | 高 |

## 工程师说 X，通常是什么意思 Y

- “这个要进 registry”
  意味着：它不是局部组件，而是系统正式节点类型。

- “这个会打到 result node”
  意味着：不只是生成逻辑，要重新定义结果承载和派生方式。

- “这得区分 live resolve 和 copy”
  意味着：你提的不是字段传递，而是在定义上下游同步语义。

- “这个要进 projectStore”
  意味着：它可能要持久化、恢复、跨会话存在。

- “这要走 command 层”
  意味着：功能跨过纯前端边界，要考虑 Tauri 与 Web fallback。

- “Web 版现在不等价”
  意味着：产品要接受差异，或为补齐差异支付额外成本。

- “这会影响 history”
  意味着：撤销重做、序列化体积和恢复逻辑都可能受影响。

## 和工程师对齐需求时最该问的 10 个问题

1. 这是节点语义改动，还是纯 UI 改动？
2. 新状态归 `canvasStore`、`projectStore` 还是 `settingsStore`？
3. 它要不要跟着项目一起保存？
4. 它是生成节点字段，还是结果节点字段？
5. 上游变化后，下游要实时感知还是连线时拷贝一次？
6. Web 版是否必须支持？
7. 这个需求是否会影响撤销重做？
8. 它要不要进入 `nodeRegistry.ts` 或模型注册表？
9. 前端注册完后，Rust / provider 侧是否也要补？
10. 最容易漏掉的恢复或回归测试点是什么？

## 最常见的 6 种误判

1. “这不就是改个字段吗”
   实际可能会打到 store、持久化和结果恢复。

2. “节点连着了就应该一直同步”
   实际系统里存在 live resolve 和 connection-time copy 两种语义。

3. “先把前端做出来，后端以后再补”
   对图片、视频、文件、SQLite 相关功能很容易返工。

4. “Web 都能跑了，桌面肯定也一样”
   当前往往是桌面更强，Web 是降级实现。

5. “生成节点里直接放结果就行”
   当前系统已经明显往 batch + result node 模式演进。

6. “加个 provider 应该跟加模型差不多”
   实际一般更贵，因为它跨前后端和设置链路。

## 快速判断法

一个需求如果同时满足下面三项，通常就不再是小需求：

- 改节点数据结构
- 改上下游语义
- 要求持久化恢复

如果再叠加任意一项，优先按高复杂度看待：

- 要进 Rust / command
- 要补 Web fallback
- 要支持批量结果或结果派生

> **📌 PM 视角：** 真正能帮助你控成本的，不是把需求说得“简单一点”，而是尽早把它归类到正确的工程层级和数据语义里。
