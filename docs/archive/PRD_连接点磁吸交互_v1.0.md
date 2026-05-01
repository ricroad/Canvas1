# PRD: 连接点磁吸交互(Magnetic Handle) — v1.0

> **文档定位**: 本文档为 AI Coding 工具(Codex / Claude Code / Cursor)编写,用于指导代码实现。目标不是讨论“要不要做”,而是把交互目标、工程边界、参数、状态机与验收标准写清楚,让第一版实现能直接落地。
>
> **项目锚点**: 基于当前 Infinite Canvas 代码结构追加实现,**严禁为做交互而重构节点系统**。所有变更必须贴着现有 `Canvas.tsx`、节点组件 `Handle`、`canvasStore` 连线语义与 React Flow 能力扩展。
>
> **本版灵魂**: 不是“机械位移”,而是“意图预判”。连接点要表现出四阶段物理感: **嗅探 -> 吸附 -> 释放 -> 激活**。

---

## 0. 前置阅读清单(AI 必读)

动手前必读文件:

1. `/src/features/canvas/Canvas.tsx` — 画布层 React Flow 入口
2. `/src/features/canvas/domain/nodeRegistry.ts` — 节点是否具备 source / target handle 的 SSOT
3. `/src/stores/canvasStore.ts` — `onConnect`、手动连线、`SceneComposer` 连线副作用
4. `/src/features/canvas/nodes/ImageEditNode.tsx` — 标准左右 Handle 参照
5. `/src/features/canvas/nodes/UploadNode.tsx`
6. `/src/features/canvas/nodes/StoryboardGenNode.tsx`
7. `/src/features/canvas/nodes/StoryboardNode.tsx`
8. `/src/features/canvas/nodes/VideoGenNode.tsx`
9. `/src/features/canvas/nodes/VideoResultNode.tsx`
10. `/src/features/canvas/nodes/ImageResultNode.tsx`
11. `/src/features/canvas/scene-composer/SceneComposerNode.tsx`
12. `/src/features/canvas/hooks/useHandleVisibility.ts`

**读完后必须能回答**:

- 现有节点的 `Handle` 分布在哪些文件
- 哪些节点拥有 source / target handle
- `Canvas.tsx` 现在如何接入 React Flow 连接生命周期
- `canvasStore.onConnect` 里哪些节点有特殊副作用

答不出就继续读,不要开工。

---

## 1. 背景与目标

### 1.1 现状问题

当前节点连接点基本还是 React Flow 默认交互语义:

- 连接点是静态小圆点
- 接近目标节点时缺少“被感知”的预热信号
- 位移反馈若只做线性跟随,会像“机器人平移”
- 松开后若只 `ease-out` 回位,会平滑但没灵气
- 激活态更多依赖 React Flow 默认的 `connectingto`,缺少“节点主动迎上去咬住线”的感觉

### 1.2 本版目标

把连接体验升级为带“意图预判”的磁吸交互:

1. 用户拖线靠近节点前,目标连接点先进入嗅探预热
2. 用户继续靠近时,连接点非线性跟随鼠标,表现出阻尼感
3. 用户移开时,连接点用带过冲的弹性回弹回原位
4. 用户命中时,连接点明确“咬住”连接,并给出合法 / 非法视觉反馈

### 1.3 成功标准

- 用户无需精确瞄准 8px 小圆点,把线拖到节点边缘附近也能感知到目标连接点
- 跟随态无明显滞后感,不能出现“鼠标已经过去,圆点慢慢追”的拖泥带水
- 释放态有轻微果冻回弹,但不拖沓
- 合法连接与非法连接一眼可分
- 第一版实现完成后,核心参数都能在单一配置处调节

---

## 2. Scope

### 2.1 In Scope

- 连接点磁吸交互基础骨架
- 画布级连线状态透传
- 节点边缘感知区(edge sensor)
- 每个连接点的四阶段状态机
- 跟随期非线性阻尼位移
- 释放期 spring / 过冲回弹
- 合法 / 非法连接视觉反馈
- 单一配置对象 `MAGNETIC_CONFIG`
- 为后续真机调参留足参数入口与中文注释

### 2.2 Out of Scope

- 改写现有连线规则本身
- 重构节点注册系统
- 重新设计边样式或连接线算法
- 批量做所有节点的差异化美术定制
- 引入庞大动画体系,超出本次 Handle 交互范围

### 2.3 第一版策略

第一版优先做“能跑的骨架”,不追求一次调到最佳手感。重点是把这些基础打牢:

- 统一组件形态
- 统一状态机
- 统一参数
- 统一画布级输入来源

---

## 3. 设计原则

### 3.1 意图预判优先于精确瞄准

交互目标不是逼用户把鼠标对准小点,而是系统先表达“我知道你想连这里”。

### 3.2 跟随要紧,回弹要轻

跟随期强调即时响应,不能靠 CSS transition 拖出延迟。回弹期才允许显式动画感。

### 3.3 物理感来自非线性与弹簧,不是纯位移

决定手感上限的不是“会不会动”,而是:

- 跟随是否有阻尼衰减
- 回位是否带轻微过冲

### 3.4 节点主动迎线,不是被动等命中

感知范围不能只落在小圆点本身,而应扩展到节点边缘条带,降低命中门槛。

---

## 4. 用户体验分期模型

每个连接点(dot)都必须实现四阶段状态:

| 阶段 | 含义 | 用户感受 |
|---|---|---|
| `idle` | 普通待机 | 一个安静的小连接点 |
| `sensing` | 鼠标进入感知范围 | “它感觉到我靠近了” |
| `locked` | 鼠标逼近中心并可吸附 | “它主动迎上来准备接住线” |
| `releasing` | 鼠标离开感知范围 | “它弹性回到原位” |

**注意**: `locked` 不是是否真正完成连接,而是“视觉锁定态”。真正连接仍由 React Flow / `isValidConnection` / `onConnect` 决定。

---

## 5. 核心交互规格

### 5.1 基础组件

新增统一基础组件:

- 推荐名: `MagneticHandle`

推荐目录:

- `/src/features/canvas/ui/MagneticHandle.tsx`

职责:

- 封装 React Flow `Handle`
- 承载内部视觉 dot
- 根据画布级鼠标位置和连接状态计算当前 phase
- 接收当前 handle 的几何中心、合法性、左右侧信息

**点击热区**:

- 外层热区建议 `28x28px`
- 内层视觉 dot 默认 `8px`

### 5.2 画布级连线状态

在 `Canvas.tsx` 顶层统一管理:

- 当前是否正在连线
- 当前鼠标位置
- 当前连接起点信息
- 当前正在靠近哪个潜在目标 handle / 哪个节点边缘

推荐做法:

1. 用 React Flow 连接生命周期拿到 `inProgress`
2. 用 `useReactFlow().screenToFlowPosition(...)` 把鼠标转换到画布坐标系
3. 给 `<ReactFlow>` 容器加 `.connecting` class 或等价 data 属性

### 5.3 节点边缘感知器(edge sensor)

每个带左右 Handle 的节点都应允许插入两个边缘感知条:

- `edge-sensor-left`
- `edge-sensor-right`

推荐尺寸:

- 总宽 `40px`
- 节点外 `20px`
- 节点内 `20px`

仅在连线中启用感知能力:

- 非连线中: 不参与感知
- 连线中: 允许目标侧进入嗅探态

### 5.4 四阶段状态机

每个 dot 独立维护阶段:

| 阶段 | 触发条件 | 视觉 | 位移 |
|---|---|---|---|
| `idle` | 未连线,或鼠标远离 | 8px 蓝点 | `0,0` |
| `sensing` | 鼠标进入 `TRIGGER_RADIUS` 或节点边缘感知区 | 14px 白底蓝边 + 光晕 | easeOutQuad 阻尼跟随 |
| `locked` | 鼠标距 dot 中心 `< LOCK_RADIUS` | 20px 强反馈态 | 跟随 |
| `releasing` | 从 sensing / locked 退出 | 回到默认样式 | spring / 过冲回位 |

### 5.5 合法 / 非法连接反馈

进入 `locked` 态后,需要结合 React Flow 连接校验表达合法性:

- 合法: 绿色
- 非法: 红色 + 轻微 shake

推荐颜色:

- 合法 `#10b981`
- 非法 `#ef4444`

---

## 6. 位移与物理模型

### 6.1 跟随期: 非线性阻尼

**禁止** 在跟随期依赖 CSS transition。跟随期的丝滑感必须来自每帧 transform 更新,而不是缓慢补间。

推荐参数:

```ts
export const MAGNETIC_CONFIG = {
  TRIGGER_RADIUS: 60,
  LOCK_RADIUS: 15,
  MAX_OFFSET: 14,
  FOLLOW_RATIO: 0.35,
  EDGE_SENSOR_WIDTH: 40,
  SPRING_STIFFNESS: 400,
  SPRING_DAMPING: 18,
  RELEASE_DURATION: 450,
  ACTIVE_NODE_RADIUS: 200,
} as const;
```

推荐计算:

```ts
const TRIGGER_RADIUS = 60;
const MAX_OFFSET = 14;
const FOLLOW_RATIO = 0.35;

function calculateMagneticOffset(mouseX: number, mouseY: number, centerX: number, centerY: number) {
  const dx = mouseX - centerX;
  const dy = mouseY - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > TRIGGER_RADIUS) {
    return { x: 0, y: 0 };
  }

  const normalized = distance / TRIGGER_RADIUS;
  const eased = 1 - Math.pow(1 - normalized, 2);
  const scale = FOLLOW_RATIO * (1 - eased * 0.5);

  return {
    x: Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx * scale)),
    y: Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dy * scale)),
  };
}
```

设计意图:

- 鼠标刚进入触发区时,连接点只微弱响应
- 越靠近中心,吸附感越明显
- 位移总量始终受 `MAX_OFFSET` 限制,避免飞太远

### 6.2 释放期: 弹簧回弹

优先方案:

- Framer Motion `useSpring`

备选方案:

- CSS `cubic-bezier(0.34, 1.56, 0.64, 1)`

如果引入 Framer Motion:

```tsx
const x = useMotionValue(0);
const y = useMotionValue(0);
const springX = useSpring(x, { stiffness: 400, damping: 18 });
const springY = useSpring(y, { stiffness: 400, damping: 18 });
```

如果不用 Framer Motion:

```css
.handle-dot.following {
  transition: none;
}

.handle-dot.releasing {
  transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: translate3d(0, 0, 0) !important;
}
```

### 6.3 锁定态预热与完全命中

建议至少区分两个视觉层级:

- `sensing`: 预热,白底蓝边
- `locked`: 明确命中,绿色或红色高亮

推荐:

```ts
if (distance < LOCK_RADIUS) {
  // locked
} else if (distance < TRIGGER_RADIUS) {
  // sensing
} else {
  // idle
}
```

---

## 7. 工程落点建议

### 7.1 新增文件(推荐)

- `/src/features/canvas/ui/MagneticHandle.tsx`
- `/src/features/canvas/ui/magneticHandle.css` 或并入现有样式文件
- `/src/features/canvas/hooks/useCanvasConnectionState.ts`
- `/src/features/canvas/hooks/useCanvasMousePosition.ts`
- `/src/features/canvas/ui/magneticConfig.ts`

### 7.2 第一批改造节点

优先改那些已经明确有左右 Handle 的节点:

- `UploadNode.tsx`
- `ImageEditNode.tsx`
- `StoryboardGenNode.tsx`
- `StoryboardNode.tsx`
- `ImageResultNode.tsx`
- `VideoGenNode.tsx`
- `VideoResultNode.tsx`
- `SceneComposerNode.tsx`

第二批再补:

- `ScriptUploadNode.tsx`
- `StoryboardLlmNode.tsx`

### 7.3 与现有系统的边界

必须遵守:

1. 不改 `canvasStore` 的连接业务语义
2. 不改 `nodeRegistry.ts` 的 handle 能力定义方式
3. 不把交互状态塞进项目持久化
4. 不让磁吸交互影响现有 `Handle id`
5. 不让 edge sensor 干扰节点内部表单交互

---

## 8. 性能要求

### 8.1 基本策略

- 鼠标移动更新必须走 `requestAnimationFrame`
- 位移必须用 `transform: translate3d(...)`
- 禁止用 `left/top` 驱动动画

### 8.2 空间剪枝

同一时刻不要让所有节点都做位移计算。只对距离鼠标足够近的节点启用磁吸计算。

推荐阈值:

- `ACTIVE_NODE_RADIUS = 200`

也就是:

- 鼠标 200px 外的节点保持 `idle`
- 只对局部候选节点算 dot 中心和偏移

### 8.3 避免的错误实现

以下方案会直接毁掉手感:

- 跟随期加 CSS transition
- 每个 dot 自己全局监听鼠标
- 不做空间剪枝,全图所有节点都算吸附
- 用 React 高频 setState 触发大范围重渲染

---

## 9. 验收标准

### 9.1 视觉验收

- 拖线接近节点时,目标连接点会先预热,而不是突然变大
- 跟随位移明显带阻尼感,不像线性平移
- 松手或离开时会轻微过冲回位,不是死板 ease-out
- 合法 / 非法连接态清晰区分

### 9.2 交互验收

- 用户把线拖到节点边缘附近就能触发目标侧响应
- 不需要精确瞄准 8px 点
- 连线过程中不影响已有节点内部输入操作
- `SceneComposer` 这类特殊节点的连接行为不被破坏

### 9.3 性能验收

- 连线拖动时无明显掉帧
- 节点数量增多后不会出现全图同步抖动
- 在低配置机器上也不出现明显“鼠标已停, dot 还在追”的滞后

---

## 10. 调参说明(必须保留为中文注释)

`MAGNETIC_CONFIG` 必须集中在一个文件中,并为每个参数写中文注释,解释其调节方向。

示例:

```ts
export const MAGNETIC_CONFIG = {
  TRIGGER_RADIUS: 60, // 嗅探区半径; 越大越容易预热, 但节点密集时容易互相抢焦点
  LOCK_RADIUS: 15, // 锁定区半径; 越大越容易进入 locked, 但会削弱精准命中感
  MAX_OFFSET: 14, // dot 最大位移; 太小感觉不到吸附, 太大容易浮夸
  FOLLOW_RATIO: 0.35, // 跟随强度; 越大越积极, 推荐 0.25-0.45
  EDGE_SENSOR_WIDTH: 40, // 节点边缘感知条宽度; 越大越容易被感知, 但也更容易误触
  SPRING_STIFFNESS: 400, // 回弹刚性; 越大回弹越快
  SPRING_DAMPING: 18, // 回弹阻尼; 越大越稳, 越小越弹; 推荐 12-25
  RELEASE_DURATION: 450, // 仅 CSS 备用方案使用; 超过 500ms 会显拖沓
  ACTIVE_NODE_RADIUS: 200, // 空间剪枝半径; 只让鼠标附近节点参与磁吸计算
} as const;
```

### 10.1 重点调参经验

- `FOLLOW_RATIO` 推荐 `0.25 ~ 0.45`
- `SPRING_DAMPING` 推荐 `15 ~ 22`
- `TRIGGER_RADIUS` 推荐 `50 ~ 80`

**调参原则**:

- 一次只改一个核心参数
- 先固定半径再调跟随强度
- 再固定跟随强度调阻尼

---

## 11. 对 Codex 的直接实现要求

第一版实现只要求做到:

1. 有统一 `MagneticHandle` 组件骨架
2. 有 `MAGNETIC_CONFIG`
3. 有画布级 `connecting` 状态和鼠标坐标输入
4. 有四阶段状态机
5. 有非线性跟随
6. 有释放回弹
7. 有合法 / 非法视觉分流

**不要求** 第一版就把所有参数调到最终手感。

### 11.1 允许的实现策略

- 若仓库未使用 Framer Motion,第一版可先用 CSS 备用回弹方案
- 若 React Flow 某些连接中状态 API 不够直接,允许在 `Canvas.tsx` 自己维护辅助状态
- 若节点全面替换成本过高,允许先从高频节点开始接入,但组件设计必须能平滑扩展到全节点

### 11.2 禁止事项

- 禁止把参数散落到多个节点文件里
- 禁止为每个节点各写一套吸附逻辑
- 禁止因为这个交互去改 `canvasStore` 持久化结构
- 禁止破坏现有 `Handle id` 与 edge 兼容性

---

## 12. 一句话总结

这次不是给连接点“加个动画”,而是把连接点从静态命中目标升级为带物理感的意图预判系统。真正决定品质的不是“会动”,而是:

- 它会不会先感觉到你来了
- 它跟不跟手
- 它松开时有没有生命力
- 它会不会主动迎上来接住线

如果第一版只做出机械位移,那只是完成了 40%; 只有把 **非线性阻尼 + 弹性回弹 + 边缘感知 + 合法性反馈** 一起做对,这个 spec 才算真正被实现。
