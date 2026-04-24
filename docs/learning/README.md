# Infinite Canvas 学习材料

这套文档面向三类读者：产品经理、需求分析者、以及 NotebookLM / Claude Project 这类知识库工具。目标不是替代源码，而是把当前系统里最稳定、最关键的事实整理成一组可检索、可问答、可持续维护的中文材料。

这里的“当前系统”指仓库现在这条主干代码，而不是历史版本里的“分镜助手”旧形态。当前产品已经演进为一个更完整的 **Infinite Canvas 本地 AI 创作工作台**：既有图片上传、AI 图像生成/编辑、分镜规划、视频生成，也有结果节点、批次结果、Scene Composer、双端持久化与多 provider 适配。

## 使用原则

1. 每篇文档都尽量自包含，不依赖“上一章”才能理解。
2. 术语第一次出现时尽量给出中文解释，并落到具体源码目录。
3. 重点解释“为什么这样设计”，而不是只枚举文件名。
4. 每篇都会补一段 `> **📌 PM 视角：**`，把技术事实翻译成需求成本和风险边界。

## 推荐导入方式

把整个 `docs/learning/` 文件夹作为一个文档集导入。建议同时导入根目录的 `README.md`，这样 AI 工具能同时看到：

- 面向外部读者的产品说明
- 面向内部学习和拆需求的结构化材料

## 推荐阅读顺序

如果你只想先建立大图景，按这个顺序：

1. `00-overview.md`
2. `02-architecture-layers.md`
3. `03-data-flow.md`
4. `04-state-management.md`
5. `05-node-system.md`
6. `06-persistence.md`
7. `07-tauri-bridge.md`
8. `08-ai-provider-system.md`
9. `09-pm-cheatsheet.md`
10. `10-common-questions.md`
11. `01-tech-stack-glossary.md`

如果你是边看边问 AI，最先读 `00`、`03`、`05`、`09` 会最有效，因为这四篇最能帮助你快速判断：

- 一个需求改的是哪一层
- 是节点语义问题还是 UI 问题
- 是不是会打到持久化、结果节点或跨端桥接

## 推荐提问方式

- 用 PM 视角解释一下 `canvasStore`、`projectStore`、`settingsStore` 的边界。
- 为什么这个系统既有 `imageNode`，又有 `imageResultNode`？
- `SceneComposerNode` 为什么不像普通节点那样只靠 resolver 取值？
- Web 版为什么能做项目存储和 LLM，但图片生成仍然是 desktop-only？
- 新增一个节点类型时，为什么要同时改 `canvasNodes.ts`、`nodeRegistry.ts`、`nodes/index.ts`？
- 为什么图片和视频结果都做成 batch + result node，而不是把结果直接塞回生成节点？

## 文档维护原则

这套材料优先同步下面这些“稳定事实”：

- 当前产品定位和主要能力
- 当前节点体系与结果节点流转
- 当前 store / command / Tauri / persistence 结构
- 当前 provider / model / LLM / Web fallback 边界

不优先记录这些“高变细节”：

- 短期 UI 文案
- 一次性临时交互方案
- 还没进入主干的计划性设计

如果源码里的稳定结构变化了，例如新增正式节点类型、调整结果节点模型、改持久化通道、替换 provider 注册方式，就应该同步更新本目录。
