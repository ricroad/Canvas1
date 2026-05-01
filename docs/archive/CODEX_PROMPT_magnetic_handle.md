# Task: 重写 MagneticHandle / Port 交互系统

## ⚠️ 最重要的约束（先读这段再动手）

1. **不改节点架构**。不动 `canvasNodes.ts`、`nodeRegistry.ts`、resolver、store、持久化。只改 Port 的 UI 组件和样式。
2. **涉及的文件范围**：`MagneticHandle.tsx`、`Canvas.tsx`（连线状态监听）、`index.css`（Port 相关样式）。如果当前节点组件里有 Handle 相关的内联代码，也一并迁移到 `MagneticHandle` 里统一管理。
3. **所有可调参数抽到文件顶部的 `PORT_CONFIG` 常量对象**，每个参数加中文注释说明含义和调节方向。后续会反复调参。

---

## 一、设计目标

实现「隐性节点端口」交互系统：Port 默认完全不可见，hover 节点时弹性弹出，鼠标靠近时磁吸跟随，点击自动从节点边缘拉出连线。

参考产品：TapNow（视频已提供）。

---

## 二、PORT_CONFIG 参数表

```ts
export const PORT_CONFIG = {
  // ======== 视觉 ========
  VISUAL_SIZE: 24,              // Port 可见直径 px
  HIT_AREA_SIZE: 36,            // 实际热区直径 px（比视觉大，易命中）
  OVERFLOW_OFFSET: 12,          // Port 外溢距离（悬浮在节点边缘外）px
  PLUS_STROKE_WIDTH: 1.5,       // "+" 号线条粗细 px

  // ======== 节点 hover 热区 ========
  NODE_HOVER_BUFFER: 8,         // 节点视觉边界外扩的隐形缓冲区 px
  HOVER_DEBOUNCE: 100,          // hover 触发延迟 ms（防止鼠标快速划过闪烁）
  LEAVE_DELAY: 50,              // 离开延迟 ms（鼠标短暂出去又回来不闪烁）

  // ======== 弹出动画 ========
  APPEAR_DURATION: 200,         // 浮现时长 ms
  APPEAR_EASING: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // 弹性过冲
  DISAPPEAR_DURATION: 150,      // 消失时长 ms（比浮现快，不拖沓）
  DISAPPEAR_EASING: 'cubic-bezier(0.4, 0, 1, 1)',     // ease-in 快速收回
  INITIAL_SCALE: 0.6,           // 弹出起始缩放
  INITIAL_TRANSLATE_X: 4,       // 弹出起始水平位移 px（右侧 Port 从更右飘入，左侧相反）

  // ======== 磁吸跟随 ========
  TRIGGER_RADIUS: 60,           // 磁吸触发半径 px（鼠标进入此范围开始跟随）
  MAX_OFFSET: 14,               // Port 最大跟随位移 px
  FOLLOW_RATIO: 0.35,           // 跟随强度 0-1（越大跟得越紧）
  HOVER_SCALE: 1.15,            // Port 进入磁吸态时的放大比

  // ======== 回弹 ========
  SPRING_STIFFNESS: 400,        // 回弹刚性（越大越快）
  SPRING_DAMPING: 18,           // 回弹阻尼（越小弹得越欢，越大越稳；推荐 12-25）

  // ======== 连线 ========
  DRAG_THRESHOLD: 3,            // 区分点击和拖拽的鼠标移动阈值 px
} as const;
```

---

## 三、Port 视觉规格

### 左右两个 Port 完全一致

- 都是圆形 `+` 按钮，视觉、尺寸、颜色完全相同
- 左边：React Flow `type="target"`
- 右边：React Flow `type="source"`
- 用户不需要区分 source/target，他只看到"这里可以连"

### 样式（亮色主题）

```css
/* Port 本体 */
background: rgba(0, 0, 0, 0.03);
border: 1px solid rgba(0, 0, 0, 0.1);
border-radius: 50%;
backdrop-filter: blur(4px);

/* "+" 号 */
color: rgba(0, 0, 0, 0.35);
font-size: 14px;
line-height: 1;

/* 磁吸态（鼠标进入触发半径） */
background: rgba(59, 130, 246, 0.06);
border-color: rgba(59, 130, 246, 0.3);
box-shadow: 0 0 8px rgba(59, 130, 246, 0.15);
color: rgba(59, 130, 246, 0.7);
```

### 空间定位

Port 悬浮在节点卡片边缘之外（外溢 `OVERFLOW_OFFSET` = 12px）：

```css
.port-right {
  position: absolute;
  right: -12px;
  top: 50%;
  transform: translateY(-50%);
}
.port-left {
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
}
```

---

## 四、状态机（5 态）

```
Hidden ──(hover 节点)──▶ Visible ──(鼠标靠近 Port)──▶ Hovering(磁吸跟随)
  ▲                        │                              │
  │                        │(离开节点)                     │(鼠标按下+移动>3px)
  │                        ▼                              ▼
  │                      Hidden                        Dragging
  │                                                    │       │
  │                              (松手在空白画布)       │       │(松手在目标节点 Port)
  │                                    ▼               │       ▼
  │                                MenuOpen            │    Connected
  │                                    │               │       │
  └────────────────────────────────────┘───────────────┘───────┘
```

### 各状态详细行为

#### ① Hidden（默认）

- Port 不渲染视觉元素（Handle DOM 始终挂载以保证 React Flow 连线能力，但视觉层 `opacity: 0; pointer-events: none`）

#### ② Visible（节点 hover）

**触发**：鼠标进入节点 hover 区域（节点视觉边界 + 外扩 `NODE_HOVER_BUFFER`=8px）。
有 `HOVER_DEBOUNCE`=100ms 防抖。

**表现**：左右两个 `+` **同时**弹出。

**弹出动画**：
- 右侧 Port：`opacity:0, scale(0.6), translateX(4px)` → `opacity:1, scale(1), translateX(0)`
- 左侧 Port：`opacity:0, scale(0.6), translateX(-4px)` → `opacity:1, scale(1), translateX(0)`
- 时长 `APPEAR_DURATION`=200ms，缓动 `APPEAR_EASING`（弹性过冲）

**离开**：鼠标移出节点 hover 区域，有 `LEAVE_DELAY`=50ms 延迟（防止鼠标在节点和 Port 之间穿越时闪烁）。

**消失动画**：
- 时长 `DISAPPEAR_DURATION`=150ms，缓动 `DISAPPEAR_EASING`（ease-in，快速收回）

**关键实现细节——hover 区域必须覆盖 Port 本身**：
Port 悬浮在节点 DOM 之外。如果 hover 检测只绑在节点 DOM 上，鼠标从节点移向 Port 时会触发 `mouseLeave`，Port 会闪烁消失。

解决方案：用一个比节点视觉边界大的 wrapper div 做 hover 检测，左右各外扩 `OVERFLOW_OFFSET + HIT_AREA_SIZE / 2`（约 30px），确保 Port 热区包含在 hover 区域内：

```tsx
<div
  className="node-hover-zone"
  style={{ padding: '0 30px', margin: '0 -30px' }}
  onMouseEnter={handleHoverEnter}
  onMouseLeave={handleHoverLeave}
>
  <div className="node-visual">{/* 节点内容 */}</div>
  <PortLeft />
  <PortRight />
</div>
```

#### ③ Hovering / 磁吸跟随

**触发**：Port 处于 Visible 态，鼠标进入 Port 的 `TRIGGER_RADIUS`=60px 范围。

**表现**：
- Port 放大到 `HOVER_SCALE`=1.15×
- 增加光晕和蓝色边框（见样式规格）
- Port **以阻尼方式朝鼠标方向偏移**

**阻尼跟随计算**（每帧 rAF 执行，**不用 CSS transition**）：

```ts
function calculateOffset(mouseX: number, mouseY: number, portCenterX: number, portCenterY: number) {
  const dx = mouseX - portCenterX;
  const dy = mouseY - portCenterY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > PORT_CONFIG.TRIGGER_RADIUS) return { x: 0, y: 0 };

  const normalized = distance / PORT_CONFIG.TRIGGER_RADIUS;
  const eased = 1 - Math.pow(1 - normalized, 2); // easeOutQuad
  const scale = PORT_CONFIG.FOLLOW_RATIO * (1 - eased * 0.5);

  return {
    x: clamp(dx * scale, -PORT_CONFIG.MAX_OFFSET, PORT_CONFIG.MAX_OFFSET),
    y: clamp(dy * scale, -PORT_CONFIG.MAX_OFFSET, PORT_CONFIG.MAX_OFFSET),
  };
}
```

**光标**：变为 `cursor: pointer`（用 `!important` 覆盖 React Flow 默认的 `grab`）

**回弹**：鼠标离开 `TRIGGER_RADIUS` 后，Port 以 spring 动画弹回原位：
- 推荐用 CSS `transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)` 做回弹
- 如果已引入 framer-motion，用 `useSpring({ stiffness: 400, damping: 18 })` 效果更好
- 回弹时允许轻微过冲（越过原位再稳住）

#### ④ Dragging（拖线态）

**触发**：在 Port 的触控区域内按下鼠标，移动超过 `DRAG_THRESHOLD`=3px。

**⚠️ 连线起点不是 Port 的视觉位置，而是节点卡片边缘正中心**：
- 右侧 Port 拖线 → 起点 = 节点卡片右边缘垂直中心
- 左侧 Port 拖线 → 起点 = 节点卡片左边缘垂直中心
- Port 只是视觉引导和交互入口，连线锚点固定在节点边缘

React Flow 的 Handle 位置决定了连线起点。所以 Handle 的 DOM 定位要在节点卡片边缘（`right: 0` / `left: 0`），Port 的视觉元素（`+` 圆圈）再从 Handle 位置向外偏移 `OVERFLOW_OFFSET`。不要把 Handle 本身定位到外溢位置。

```tsx
{/* Handle 定位在节点边缘 → 连线从这里发射 */}
<Handle
  type="source"
  position={Position.Right}
  className="handle-anchor"          // 定位在 right: 0, top: 50%
  style={{ right: 0, opacity: 0 }}   // Handle 本身不可见
>
  {/* 视觉 Port 向外偏移 → 用户看到和点到的 */}
  <div
    className="port-visual"
    style={{ transform: `translateX(${OVERFLOW_OFFSET}px)` }}
  >
    +
  </div>
</Handle>
```

这样连线起点从 Handle（节点边缘）发射，但用户看到和交互的是外溢的 `+` 圆圈。

**拖线中的行为**：
- 源 Port 锁定高亮状态
- 贝塞尔连线从节点边缘中心出发，终点跟随鼠标
- 目标节点的 Port 只在鼠标 hover 到该节点时才浮现（不全局预亮）
- 松手在目标节点的 Port 上 → 建立连接
- 松手在空白画布 → 弹出节点创建菜单（MenuOpen）
- 松手在无效位置 → 连线消失

#### ⑤ MenuOpen（菜单态）

**触发**：拖线松手在空白画布上。

**表现**：在鼠标松手位置弹出 "Generate from this node" 菜单，选项从 `nodeRegistry.ts` 的 `connectMenu` 动态读取。选择后自动创建新节点并建立连接。点击菜单外关闭，Port 回到 Hidden。

---

## 五、连线中目标节点 Port 的显示逻辑

```tsx
// 在每个节点组件中
const connection = useConnection(); // React Flow hook

// target Port 的显示条件：
// 1. 有人在拖线（connection.inProgress === true）
// 2. 拖线来源不是自己（connection.fromNode?.id !== nodeId）
// 3. 鼠标 hover 在本节点上（hovered === true）
const showTargetPort = hovered && connection.inProgress && connection.fromNode?.id !== nodeId;

// source Port 的显示条件（不变）：
const showSourcePort = hovered;
```

---

## 六、节点 hover 区域结构

```tsx
function NodeWrapper({ nodeId, children }) {
  const [hovered, setHovered] = useState(false);
  const connection = useConnection();
  const leaveTimer = useRef<number>();
  const enterTimer = useRef<number>();

  const handleEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    enterTimer.current = window.setTimeout(
      () => setHovered(true),
      PORT_CONFIG.HOVER_DEBOUNCE
    );
  };

  const handleLeave = () => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    leaveTimer.current = window.setTimeout(
      () => setHovered(false),
      PORT_CONFIG.LEAVE_DELAY
    );
  };

  const showSourcePort = hovered;
  const showTargetPort = hovered && connection.inProgress && connection.fromNode?.id !== nodeId;

  return (
    <div
      className="node-hover-zone"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* 节点本体 */}
      <div className="node-card">
        {children}
      </div>

      {/* 右侧 source Port */}
      <Handle type="source" position={Position.Right} className="handle-anchor-right">
        {showSourcePort && (
          <MagneticPort side="right" nodeId={nodeId} />
        )}
      </Handle>

      {/* 左侧 target Port */}
      <Handle type="target" position={Position.Left} className="handle-anchor-left">
        {showTargetPort && (
          <MagneticPort side="left" nodeId={nodeId} />
        )}
      </Handle>
    </div>
  );
}
```

---

## 七、MagneticPort 组件

```tsx
function MagneticPort({ side, nodeId }: { side: 'left' | 'right'; nodeId: string }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isNear, setIsNear] = useState(false);
  const portRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>();

  // 磁吸跟随：监听鼠标移动
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!portRef.current) return;

      const rect = portRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const newOffset = calculateOffset(e.clientX, e.clientY, centerX, centerY);
      const distance = Math.sqrt(
        Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2)
      );

      setIsNear(distance < PORT_CONFIG.TRIGGER_RADIUS);

      // rAF 节流
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => setOffset(newOffset));
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const translateDir = side === 'right' ? 1 : -1;

  return (
    <div
      ref={portRef}
      className={cn(
        'port-visual',
        `port-${side}`,
        isNear && 'port-near',
        // 弹出动画 class
        'port-entering'
      )}
      style={{
        // 外溢定位
        transform: isNear
          ? `translate(${PORT_CONFIG.OVERFLOW_OFFSET * translateDir + offset.x}px, ${offset.y}px) scale(${PORT_CONFIG.HOVER_SCALE})`
          : `translate(${PORT_CONFIG.OVERFLOW_OFFSET * translateDir}px, 0) scale(1)`,
        // 跟随时无 transition，离开时有 spring 回弹
        transition: isNear ? 'none' : `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)`,
        cursor: 'pointer',
      }}
    >
      <span className="port-plus">+</span>
    </div>
  );
}
```

---

## 八、CSS 样式

```css
/* ===== Handle 锚点（不可见，决定连线起点） ===== */
.handle-anchor-right,
.handle-anchor-left {
  width: 1px !important;
  height: 1px !important;
  background: transparent !important;
  border: none !important;
  min-width: 0 !important;
  min-height: 0 !important;
}
.handle-anchor-right {
  right: 0 !important;
  top: 50% !important;
}
.handle-anchor-left {
  left: 0 !important;
  top: 50% !important;
}

/* ===== Port 视觉元素 ===== */
.port-visual {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);

  /* 热区外扩：视觉 24px，点击区域 36px */
  padding: 6px;
  margin: -6px;

  pointer-events: auto;
  cursor: pointer !important;
  z-index: 10;
}

.port-plus {
  font-size: 14px;
  line-height: 1;
  color: rgba(0, 0, 0, 0.35);
  user-select: none;
  pointer-events: none;
}

/* ===== 弹出动画 ===== */
.port-entering.port-right {
  animation: port-pop-right 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.port-entering.port-left {
  animation: port-pop-left 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes port-pop-right {
  from {
    opacity: 0;
    transform: translateX(16px) scale(0.6);  /* OVERFLOW_OFFSET + INITIAL_TRANSLATE_X */
  }
  to {
    opacity: 1;
    transform: translateX(12px) scale(1);    /* OVERFLOW_OFFSET */
  }
}

@keyframes port-pop-left {
  from {
    opacity: 0;
    transform: translateX(-16px) scale(0.6);
  }
  to {
    opacity: 1;
    transform: translateX(-12px) scale(1);
  }
}

/* ===== 磁吸态 ===== */
.port-near {
  background: rgba(59, 130, 246, 0.06);
  border-color: rgba(59, 130, 246, 0.3);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.15);
}
.port-near .port-plus {
  color: rgba(59, 130, 246, 0.7);
}

/* ===== hover 区域 ===== */
.node-hover-zone {
  position: relative;
  /* 左右各外扩 30px，覆盖 Port 热区 */
  padding: 0 30px;
  margin: 0 -30px;
}
```

---

## 九、Canvas 级连线状态

在 `Canvas.tsx` 中，用 `useConnection()` 监听全局连线状态，通过 context 或 class 传递给所有节点：

```tsx
import { useConnection } from '@xyflow/react';

function Canvas() {
  const connection = useConnection();

  return (
    <ReactFlow
      className={cn(connection.inProgress && 'rf-connecting')}
      // ... 其他 props
    >
      {/* nodes */}
    </ReactFlow>
  );
}
```

节点组件内通过 `useConnection()` 自行读取连线状态。

---

## 十、常见错误，请避免

1. ❌ 把 Handle 定位到外溢位置（`right: -12px`）→ 连线会从外溢位置发射，而不是节点边缘。**Handle 必须在节点边缘，视觉 Port 用 transform 向外偏移。**

2. ❌ 左右 Port 用不同视觉（一个 `+`，一个空心圆）→ 两个都是 `+`，完全一致。

3. ❌ hover 节点时只显示 source Port → **左右两个 Port 同时显示**（但 target Port 仅在有人正在拖线时才显示——具体条件见第五节）。

4. ❌ 磁吸跟随用 CSS transition → **跟随过程无 transition**，否则有延迟感。只有回弹时才用 transition/spring。

5. ❌ hover 检测只绑节点 DOM → 鼠标从节点移向 Port 会闪烁。**hover 区域要包含 Port 热区**（用 node-hover-zone 外扩实现）。

6. ❌ Port 消失时立即执行 → 加 `LEAVE_DELAY`=50ms 防闪烁。

---

## 十一、验收标准

- [ ] 节点静止态：左右无任何 Port 可见
- [ ] hover 节点：左右两个 `+` 以弹性动画同时弹出
- [ ] 鼠标靠近右侧 `+`（60px 内）：`+` 跟随鼠标偏移，放大，变蓝
- [ ] 鼠标离开 60px 范围：`+` 弹性回弹到原位
- [ ] 鼠标离开节点区域：两个 `+` 快速消失
- [ ] 鼠标从节点内移向 `+` 按钮：不闪烁
- [ ] 在 `+` 附近按下鼠标 + 拖动 > 3px：从**节点边缘正中心**拉出贝塞尔连线
- [ ] 拖线中移到另一个节点：目标节点的左侧 `+` 浮现
- [ ] 拖线松手在目标 Port 上：建立连接
- [ ] 拖线松手在空白画布：弹出节点创建菜单
- [ ] 已有连线的节点 hover：Port 正常显示，连线不断不闪
- [ ] `tsc --noEmit` 通过
