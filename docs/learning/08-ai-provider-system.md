# AI 模型、Provider 与结果批次

## 这一层解决的问题

Infinite Canvas 不是绑死一家模型服务，而是把“provider”和“model”分开建模。

可以粗略理解成：

- provider：渠道 / 接入方
- model：具体可选能力

前端在 `src/features/canvas/models/` 维护模型元数据和请求映射；桌面端通过 Rust command 执行真正的生成与任务管理。

## 当前前端模型注册机制

`src/features/canvas/models/registry.ts` 用 `import.meta.glob` 自动发现三类模块：

- `./providers/*.ts`
- `./image/**/*.ts`
- `./video/**/*.ts`

这意味着当前模型系统已经是“目录约定 + 自动注册”的结构，而不是中心化硬编码列表。

## 当前图片 provider

从目录结构看，当前图片 provider 主要包括：

- `fal`
- `kie`
- `grsai`
- `ppio`

默认图片模型是：

- `kie/nano-banana-2`

这说明 KIE 仍是当前图片主路径里的默认选项之一。

## 当前视频模型

当前视频模型单独注册在 `models/video/`，默认视频模型是：

- `kling-v3`

并且注册表里已经有按能力判断的函数，例如：

- 支持的时长
- 支持的比例
- 是否支持尾帧

这说明视频不是“顺手加一个下拉框”，而是单独的模型体系。

## 当前 LLM 模型

LLM 模型在 `src/features/canvas/models/llm/index.ts`，当前可见 provider 包括：

- `moonshot`
- `google`
- `ppio`

这条链路主要服务于：

- 剧本理解
- 分镜提示词生成
- 对话式文本能力

## `resolveRequest` 类能力为什么重要

不同模型对参数格式、模式切换、分辨率、参考图数量的要求不同。前端节点 UI 收集到的只是产品语义，不是 provider 真正想要的底层请求。

所以模型定义里会承担“翻译”作用：

- 把统一的前端字段映射到具体模型请求
- 根据参考图数量等上下文决定真正走哪个请求形态

这也是为什么“前端把模型加到下拉里了”并不代表系统真的已经支持。

## 当前系统为什么要做 batch + result node

不管是图片还是视频，当前系统都在往同一个模式收敛：

- 生成节点负责提交 batch
- `currentBatch` 记录运行态
- 结果节点承载 variants
- 用户从结果节点里选择一个候选继续派生

以图片为例：

- `imageNode` 里有 `outputCount`、`currentBatch`、`generatedResultNodeIds`
- `imageResultNode` 里有 `variants` 和 `selectedVariantIndex`

以视频为例：

- `videoGenNode` 里有 `outputCount`、`currentBatch`、`generatedResultNodeIds`
- `videoResultNode` 里有 `variants`、`selectedVariantIndex`、`snapshotParams`

## 为什么这比“把结果写回原节点”更好

因为结果节点模式更适合当前产品目标：

- 一次生成多个候选
- 明确保留批次语义
- 从具体候选结果继续派生
- 让生成参数编辑和结果浏览解耦

## 新增一个模型和新增一家 provider 的成本差异

### 新增现有 provider 下的新模型

通常要补：

- 一个模型定义文件
- 必要的请求映射
- 可能的 Rust 侧模型 alias 或适配

成本通常是中等。

### 新增一家 provider

通常要补：

- 前端 provider 定义
- 前端模型文件
- 设置链路和 API key 读取
- Rust provider 实现
- 请求 / 返回结构适配

成本通常比新增模型高一档。

> **📌 PM 视角：** 在这个项目里，“加模型”经常是局部扩展，“加 provider”往往是跨层任务。而“支持多结果批量输出并能从结果继续派生”又比单次生成要再高一个复杂度档位。
