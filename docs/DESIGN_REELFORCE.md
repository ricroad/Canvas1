# ReelForce Studio · 无限画布 设计系统 v1.0

> 本文是产品级品牌化设计规范，用于把"无限画布"从通用 SaaS 模板视觉，重塑为承载 **ReelForce Studio** 品牌识别、并对外展示团队技术与审美水准的内部工具。
>
> 既存的 [DESIGN.md](./DESIGN.md) 是 Apple 视觉语言的研究材料，请保留作为参考。本文件是落地依据。
>
> Tokens 落地路径：[src/index.css](../src/index.css)（CSS 变量）、[tailwind.config.js](../tailwind.config.js)（Tailwind 主题）、[src/components/ui/primitives.tsx](../src/components/ui/primitives.tsx)（基础组件）、[src/features/canvas/ui/nodeControlStyles.ts](../src/features/canvas/ui/nodeControlStyles.ts)（节点控制条）。

---

## 1. 品牌基底

### 1.1 Logo 解读

ReelForce Studio 的标志不是一个普通的"圆角五边形 + 字母组合"，它是一个**抽象化的电影投影设备**：不规则的橙红轮廓代表投影机/胶片机舱体，黑色粗体无衬线字 `REEL FORCE / STUDIO` 是被强光投射出的字幕。Logo 动画从光束 → 故障闪烁 → 字符成型，传递的是"捕捉光影、组合碎片、最终呈现强力作品"的影视工业叙事。

**一句话品牌气质**：暗房里的高对比舞台 · 红黑碰撞 · 故障美学 · 工业级精度。

### 1.2 设计原则（5 条）

| # | 原则 | 释义 |
|---|---|---|
| 1 | **双主题对等，红是公约** | 暗色 = 暗房 / 监视器；浅色 = 摄影棚 / 故事板。两套都是一等公民，品牌橙红是横跨两套的唯一公约色——切换主题时，唯一不变的是"那一抹红"。 |
| 2 | **红光点睛，不作填充** | 橙红只用于"录制中""执行中""焦点项"和主 CTA，不要把它当装饰色撒在面板背景或卡片大面积填充上。 |
| 3 | **节点即胶片** | 画布上的节点借用胶片格 / 监视器面板的视觉隐喻：硬边、薄高光、轻微的网格纹理。 |
| 4 | **工具感胜过装饰感** | 这是给内部成员日常用的工具，不是营销 landing page。所有动效服务于"看清状态"和"快速切换"，不做无意义的 hover 缩放和 parallax。 |
| 5 | **故障作为转场，不作为常态** | Glitch / scan line / RGB split 只在"生成完成""错误""系统启动"等离散事件出现，不要让界面长期在抖动。 |
| 6 | **审美对外可截图** | 任意一屏单独截图发到朋友圈、招聘 JD、客户提案，都不能露出"通用模板感"。这是我们对外秀技术的橱窗。 |

---

## 2. 颜色系统

> 当前主色 `#3B82F6`（蓝）必须替换为 ReelForce 橙红。下面是新的色板，已映射到 [src/index.css](../src/index.css) 现有的 CSS 变量结构，迁移成本最小。

### 2.1 品牌色

| Token | 值 | 用途 |
|---|---|---|
| `--brand-reel-500` | `#E94E1B` | **主品牌橙红**（取自 logo）。CTA 主按钮、主选中态、Logo 印章、危险/警告。 |
| `--brand-reel-400` | `#F2693B` | 主色 hover 提亮 |
| `--brand-reel-600` | `#C53A0F` | 主色 active 压暗 |
| `--brand-reel-glow` | `#FF5A2E` | 霓虹高光，仅用于"录制中""生成中"指示灯与发光描边 |
| `--brand-ink-950` | `#0B0B0D` | **舞台底色**（暗模式背景） |
| `--brand-ink-900` | `#141417` | 一级面板 |
| `--brand-ink-850` | `#1B1B1F` | 二级面板 / 节点本体 |
| `--brand-ink-700` | `#2A2A30` | 边框 / 分割线 |
| `--brand-ink-500` | `#5C5C66` | Muted text |
| `--brand-paper` | `#F4F1EC` | 浅模式纸面（不是纯白，带一点点偏暖灰，呼应 Logo 黑） |

**重要**：浅色模式不再使用 `#FFFFFF` 的纯白，改用 `--brand-paper`（带一点点偏暖灰），呼应 logo 的黑色字 + 橙红，避免"通用 SaaS 白底"观感。

### 2.1.1 双主题视觉气质对照

| 维度 | 暗模式（Studio） | 浅模式（Daylight） |
|---|---|---|
| 隐喻 | 暗房 / 监视器 / 影院 | 摄影棚 / 故事板 / 白纸 |
| 底色 | `#0B0B0D`（影院黑） | `#F4F1EC`（暖纸面） |
| 主面板 | `#141417` | `#FFFFFF`（带 1px ink-100 描边） |
| 文字 | `#FFFFFF` / `#888` | `#0B0B0D` / `#5C5C66` |
| 高光语言 | 内 1px 白色高光 + 外发光 | 单层柔阴影 + 1px 边描 |
| 选中态 | 橙红 + glow（暗中聚光灯） | 橙红描边（无 glow，避免脏） |
| 颗粒纹理 | opacity 0.025（胶片颗粒） | 不启用 |
| 对外人格 | "我们做工具的工业精度" | "我们做内容的克制审美" |

### 2.2 与现有 token 的映射（替换表）

修改 [src/index.css](../src/index.css)：

```css
:root {
  /* —— 品牌色（新增） —— */
  --brand-reel-rgb: 233 78 27;      /* #E94E1B */
  --brand-reel-glow-rgb: 255 90 46; /* #FF5A2E */
  --brand-ink-rgb: 11 11 13;
  --brand-paper-rgb: 244 241 236;

  /* —— 替换现有蓝色 accent —— */
  --accent: #E94E1B;
  --accent-rgb: 233 78 27;          /* 原: 59 130 246 */

  /* —— 浅色舞台收暖 —— */
  --bg-rgb: 244 241 236;            /* 原: 255 255 255 */
  --surface-rgb: 248 245 240;       /* 原: 245 245 245 */
}

.dark {
  --bg-rgb: 11 11 13;               /* 原: 15 15 15，更接近影院黑 */
  --surface-rgb: 20 20 23;          /* 原: 26 26 26 */
  --border-rgb: 42 42 48;
}
```

### 2.3 状态色

| 状态 | Token | 值 | 备注 |
|---|---|---|---|
| 成功 | `--state-success` | `#3FCF8E` | 略偏冷的绿，避免与橙红打架 |
| 警告 | `--state-warning` | `#F2A93B` | |
| 错误 | `--state-error` | `#FF4D4F` | 与品牌橙红区分：错误红更纯，更暗，无暖橙感 |
| 信息 | `--state-info` | `#7AA2FF` | 仅用于中性提示，避免回到蓝色主导的观感 |

### 2.4 红色使用预算

为了不让品牌橙红"廉价化"，每屏出现的强红色面积应有上限：

- **主操作按钮**：每屏 1 个（如"新建项目""生成"），多个候选时只有第一优先用红，其余降级为 ghost。
- **录制 / 生成中指示灯**：可以脉冲，但单点直径 ≤ 8px。
- **选中态描边**：1.5px 实色橙红 + 6px 模糊 glow（仅暗色模式启用 glow）。
- **禁止**：大面积橙红卡片背景、橙红表头、橙红文字段落。

---

## 3. 字体系统

### 3.1 字族

| 用途 | 字族 | 备注 |
|---|---|---|
| 西文显示（H1 / 数字） | `Inter Display`, `Inter`, `system-ui` | 字重 700–900，模拟 logo 的"FORCE"力量感 |
| 西文正文 | `Inter`, `system-ui` | 400/500/600 |
| 中文 UI | `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei` | 已在 [src/index.css](../src/index.css) 中存在，保留 |
| 等宽 / 数据 / Token | `JetBrains Mono`, `SF Mono`, `ui-monospace` | 用于：参数面板的数值、模型 ID、shortcut 提示、价格 `¥0.43/次` |
| 品牌印章 | `Inter Display 900` + 字符间距 `-0.02em` | 仅在 logo 锁版、空状态品牌词、splash screen 出现 |

### 3.2 字阶

| Role | Size / Line | Weight | 字符间距 |
|---|---|---|---|
| Display L (Splash) | 56 / 64 | 900 | -0.03em |
| Display M (空状态、品牌印章) | 40 / 48 | 800 | -0.02em |
| H1 (页面标题) | 28 / 36 | 700 | -0.01em |
| H2 (区块标题) | 20 / 28 | 700 | -0.005em |
| H3 (面板/卡片标题) | 16 / 24 | 600 | 0 |
| Body | 14 / 22 | 400 | 0 |
| Caption / Meta | 12 / 18 | 500 | 0 |
| Mono Data | 13 / 18 | 500 | 0 |

> 对比当前截图："项目管理"用了大字号，但字重和字阶层次不清，副信息"修改时间…"和卡片标题字重接近，需要拉开层级。

---

## 4. 形态语言

### 4.1 圆角

继承现有 `--ui-radius-*`，但语义化收窄：

| Token | 值 | 用途 |
|---|---|---|
| `--radius-sharp` | 2px | 节点把手、徽章、磁吸 chip |
| `--radius-md` | 8px | 输入框、小按钮、Tag |
| `--radius-lg` | 12px | 节点本体、卡片、面板（保持） |
| `--radius-xl` | 16px | 大型浮层、Copilot 抽屉、modal |
| `--radius-cinema` | `12px 12px 12px 28px` | **不对称圆角**，用于带"切角"暗示的特殊容器（呼应 logo 的不规则形状） |

`--radius-cinema` 是品牌专属形态：用在「项目卡片」「空状态插画框」「关键 CTA banner」上，作为整个产品最容易被记住的视觉签名。

### 4.2 边框 / 描边

- 默认描边：1px `var(--brand-ink-700)`（暗）/ 1px `rgba(11,11,13,0.08)`（浅）
- 选中描边：1.5px `var(--brand-reel-500)` + 暗模式下叠加 0 0 12px `rgba(255,90,46,0.45)` glow
- 节点 hover：1px `var(--brand-reel-500/0.5)`，无 glow

### 4.3 阴影 / 高光（按主题分别定义）

> 暗模式下 `box-shadow` 几乎不可见，要靠**内 1px 高光 + 外发光**模拟"舞台聚光灯"；浅模式则用传统的柔阴影。两套都通过 CSS 变量切换，组件无需感知。

```css
:root {
  /* 浅模式：纸面柔阴影 */
  --shadow-panel:
    0 1px 2px rgba(11,11,13,0.04),
    0 12px 28px rgba(11,11,13,0.08);
  --shadow-spotlight:
    0 0 0 1.5px rgb(var(--brand-reel-rgb)),
    0 4px 14px -2px rgba(233,78,27,0.35);
  --shadow-card-hover:
    0 4px 12px rgba(11,11,13,0.06),
    0 16px 36px rgba(11,11,13,0.10);
}

.dark {
  /* 暗模式：舞台高光 + 外阴影 */
  --shadow-panel:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 12px 28px rgba(0,0,0,0.5);
  --shadow-spotlight:
    0 0 0 1.5px rgb(var(--brand-reel-rgb)),
    0 0 24px -4px rgba(255,90,46,0.55);
  --shadow-card-hover:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 16px 36px rgba(0,0,0,0.6);
}
```

### 4.4 纹理 / 网格（按主题切换）

| 主题 | 背景层 | 用途 |
|---|---|---|
| 暗模式 | 胶片颗粒 SVG，opacity 0.025，`mix-blend-overlay` | 让大面积黑不显"廉价 OLED" |
| 浅模式 | 暖色纸张噪点，opacity 0.02 | 让纸面不显"塑料白" |
| 画布 dot grid | 暗：`rgba(255,255,255,0.04)`；浅：`rgba(11,11,13,0.06)` | 保持画布的"工程坐标纸"语言 |

```tsx
// src/components/ui/StageGrain.tsx（新增，按主题自动切纹理）
<div aria-hidden
     className="pointer-events-none fixed inset-0 z-0 opacity-[0.025] mix-blend-overlay
                bg-[url(/textures/grain-dark.svg)] dark:bg-[url(/textures/grain-dark.svg)]
                [&:not(.dark_*)]:bg-[url(/textures/grain-paper.svg)]" />
```

---

## 5. 组件级规范（关键 5 个）

> 每个组件下面都给出**双主题样表**，组件实现层只消费 token，不需要 `if (dark)` 分叉。

### 5.1 项目卡片 · `ProjectCard`

**现状问题**：白底浅灰卡 + 黑字 + 加粗标题 + 灰色 meta，看起来像 Notion 模板，没有任何品牌识别。

**新规范（共通）**：

- 容器：`rounded-[--radius-cinema]`（不对称圆角，品牌签名）
- 左上角：8×8 橙红方块"录制点"，hover 时脉冲 1.2× 一次
- 标题：H3
- Meta：Mono Data 字号
- 缩略图（若将来加）：16:9 胶片格，左右各 3 个齿孔（SVG 蒙版）
- Hover：translateY(-2px)，边框换色为橙红 0.5α，过渡 180ms

| 元素 | 暗模式 | 浅模式 |
|---|---|---|
| 卡片底色 | `var(--brand-ink-850)` | `#FFFFFF` |
| 边框 | 1px `var(--brand-ink-700)` | 1px `rgba(11,11,13,0.06)` |
| 标题色 | `#FFFFFF` | `var(--brand-ink-950)` |
| Meta 色 | `#888` | `var(--brand-ink-500)` |
| 默认阴影 | `--shadow-panel`（暗版：内高光 + 外阴影） | `--shadow-panel`（浅版：单层柔阴影） |
| Hover 阴影 | `--shadow-card-hover`（暗版） | `--shadow-card-hover`（浅版） |

### 5.2 主 CTA 按钮（"新建项目"/"生成"）

主按钮在两套主题下颜色完全一致 —— 这是品牌的"红色锚点"，无论暗浅都视觉等同。

```tsx
className="
  px-4 py-2 rounded-md font-semibold text-white
  bg-[var(--accent)]
  hover:bg-[#F2693B]
  active:bg-[#C53A0F]
  shadow-[0_4px_12px_-2px_rgba(233,78,27,0.45)]
  transition-all duration-150
"
```

**次级按钮 = ghost**（按主题切换边框 / hover 填充）：

| 元素 | 暗模式 | 浅模式 |
|---|---|---|
| 边框 | 1px `var(--brand-ink-700)` | 1px `rgba(11,11,13,0.12)` |
| 文字 | `#FFFFFF` | `var(--brand-ink-950)` |
| Hover 填充 | `rgba(255,255,255,0.04)` | `rgba(11,11,13,0.04)` |

### 5.3 左侧浮岛工具栏 · `ToolPill`

**现状问题**：药丸容器 OK，但激活态用蓝色高亮 + 浅色 tooltip，与品牌完全脱节。

**新规范（共通）**：

- 容器维持玻璃质感，`backdrop-filter: blur(20px) saturate(140%)`
- 激活按钮：底色 `rgba(233,78,27,0.12)` + 1px 内描边 `var(--brand-reel-500)` + 图标变橙红 —— **此规则两套主题一致**
- Tooltip：等宽字体，1px 边描

| 元素 | 暗模式 | 浅模式 |
|---|---|---|
| 容器底 | `rgba(30,30,32,0.72)` | `rgba(255,255,255,0.78)` |
| Tooltip 底 | `rgba(20,20,23,0.95)` | `rgba(11,11,13,0.92)`（深底白字也用在浅模式，保持 tooltip 的"信息层"语言） |
| Tooltip 文字 | `#FFFFFF` | `#FFFFFF` |

### 5.4 节点 · 沿用胶片机隐喻

**共通规范**：

- 节点头部 24px 高的"机舱条"：左侧 8px 状态点（idle 灰、生成中橙红脉冲、完成绿、错误纯红）
- 选中态：`--shadow-spotlight`（暗模式有 glow，浅模式无 glow，自动按主题切换）
- 节点底部控制条：复用 [nodeControlStyles.ts](../src/features/canvas/ui/nodeControlStyles.ts) 的尺寸 token，配色映射到新变量
- 端口（handle）：默认 1×1 透明，hover 时变成 12px 橙红圆点带 glow（沿用现有 magnetic 机制）

| 元素 | 暗模式 | 浅模式 |
|---|---|---|
| 机舱条底 | `var(--brand-ink-900)` | `rgba(11,11,13,0.04)` |
| 节点本体 | `var(--brand-ink-850)` | `#FFFFFF` |
| 节点边框 | 1px `var(--brand-ink-700)` | 1px `rgba(11,11,13,0.08)` |
| 默认阴影 | 无（靠边框定义） | `--shadow-panel` 浅版 |

### 5.5 Copilot 抽屉

**共通规范**：

- 玻璃质感背景，提高 saturate
- Bot 气泡：左侧 2px 橙红 accent border（呼应"AI 在说话"）—— 两套主题保持一致
- User 气泡：橙红 0.10α 填充 + 右对齐
- 模型选择器（"Kimi K2.5"）：等宽字体，chip 样式
- 输入框焦点：整框描边变橙红 + glow（暗模式 glow 更明显）

| 元素 | 暗模式 | 浅模式 |
|---|---|---|
| 抽屉底 | `rgba(26,26,28,0.78)` | `rgba(255,255,255,0.85)` |
| Bot 气泡 | `rgba(255,255,255,0.04)` | `rgba(11,11,13,0.03)` |
| 输入框底 | `rgba(255,255,255,0.06)` | `#FFFFFF` |
| Chip 边框 | `var(--brand-ink-700)` | `rgba(11,11,13,0.12)` |

---

## 6. 动效语言

| 场景 | 动效 | 时长 | 缓动 |
|---|---|---|---|
| 面板进入 | 8px 上移 + opacity | 180ms | `cubic-bezier(0.2, 0.9, 0.3, 1)` |
| 节点生成完成 | 1 次橙红光圈外扩 + 0.05s glitch（RGB split 1px） | 320ms | ease-out |
| 主 CTA hover | 仅亮度 +5%，无位移 | 120ms | ease |
| 项目卡片 hover | translateY(-2px) + 边框换色 | 180ms | ease-out |
| 选中节点 | 聚光灯 glow 渐入 | 140ms | ease |
| 视频生成进度 | 边框跑马灯（橙红 dashed），复用 `canvas-edge-flow` 关键帧 | infinite | linear |
| Splash / 启动 | Logo 投影动画（缩放 0.92→1 + glitch 一次） | 600ms | 自定义 |

**禁止**：parallax、3D tilt、慢于 400ms 的 hover、无意义的 confetti/烟花。

---

## 7. 关键页面视觉方向

> 所有页面通过 `var(--bg)` / `var(--surface)` 自动响应主题切换，下面的描述聚焦"主题无关"的结构与品牌动作。

### 7.1 项目管理（首屏）

- 顶部标题区加一条**横向胶片齿孔分割线**（SVG，2px 高，opacity 0.5）作为标题与卡片网格的分割 —— 暗模式齿孔色 `rgba(255,255,255,0.4)`，浅模式 `rgba(11,11,13,0.3)`
- 右上角"打开 test"= ghost，"新建项目"= 主品牌橙红 CTA
- 卡片按 §5.1，使用 `--radius-cinema` 不对称圆角
- 空状态：居中 logo 印章字 + slogan "Where every reel begins."

### 7.2 画布编辑器

- 画布背景：`var(--bg)`（主题切换自动跟随）
- Dot grid 的点色：`rgba(255,255,255,0.04)`（暗）/ `rgba(11,11,13,0.06)`（浅）
- 左侧浮岛工具栏：§5.3
- 右下角 minimap：1px 橙红边框 + 玻璃质感（两套主题边框色一致，玻璃底色按主题切换）
- Copilot 抽屉打开时，画布主区不变暗（不做 modal-style overlay），保持工作连续性

### 7.3 顶部 chrome（标题栏）

- 暗模式：`rgba(20,20,23,0.8)` + backdrop-blur；浅模式：`rgba(255,255,255,0.85)` + backdrop-blur
- 1px 底部分割线（按主题切换 ink-700 / rgba(11,11,13,0.06)）
- 左上角"无限画布"文字旁加 16×16 的 ReelForce mini logo（橙红小印章），两套主题保持原色
- 窗口控制按钮 hover：关闭按钮变红、其余按钮的 hover 底色按主题切换

### 7.4 主题切换按钮本身

- 现状：月亮图标 → 太阳图标的简单替换
- 升级：切换瞬间触发一次 320ms 的"舞台灯切换"过渡 —— 全局 `var(--bg)` / `var(--surface)` 通过 CSS transition 平滑过渡 200ms，叠加一次极短的橙红光圈从按钮位置外扩（视觉上像"按下了开机键"）。这是品牌的一个微动作签名。

---

## 8. 落地优先级（4 周路线）

> 给到 Codex/工程的拆解。每完成一项即 commit，遵循 [CLAUDE.md §12](../CLAUDE.md) 的提交规范。

### Phase 1 · 颜色与字体（1 天，影响 60% 视觉）

- [ ] 修改 [src/index.css](../src/index.css)：替换 `--accent`、新增 brand token、调整暗模式 `--bg/--surface`
- [ ] 修改 [tailwind.config.js](../tailwind.config.js)：新增 `brand-reel`、`brand-ink` 调色板
- [ ] 引入 Inter Display + JetBrains Mono（如未引入），加到 `--font-family-*`
- [ ] 验证：所有现存按钮、链接、选中态自动变橙红，无需逐个改组件

`commit: feat(theme): switch accent from blue to ReelForce orange-red`

### Phase 2 · 阴影与形态（1 天）

- [ ] 在 index.css 新增 `--shadow-stage-panel` / `--shadow-spotlight` / `--radius-cinema`
- [ ] 在 [primitives.tsx](../src/components/ui/primitives.tsx) 中替换 Card / Panel 默认阴影
- [ ] 节点选中态接入 `--shadow-spotlight`

`commit: feat(theme): introduce stage shadow and cinema radius tokens`

### Phase 3 · 关键组件改造（2–3 天）

- [ ] ProjectCard 按 5.1 规范重做
- [ ] 主 CTA 按 5.2 规范统一
- [ ] 左侧 ToolPill 激活态、Tooltip 配色更新（5.3）
- [ ] Copilot 抽屉气泡 / 输入框（5.5）

每个组件单独一个 commit。

### Phase 4 · 品牌资产与动效（1–2 天）

- [ ] 加入 logo SVG（横版 + 印章版 + 单色版），路径 `public/brand/`
- [ ] Splash / 启动动画
- [ ] 胶片齿孔 SVG 装饰组件
- [ ] StageGrain 颗粒纹理
- [ ] 节点生成完成的 glitch 微动效

`commit: feat(brand): logo assets, splash, grain texture, glitch microinteractions`

---

## 9. 验收清单

每个 PR 至少满足以下 5 条才算合规：

1. 不再出现 `#3B82F6` 或 `rgb(59, 130, 246)` 的硬编码（grep 校验）
2. 暗色模式截图发到群里能被认出是同一个产品
3. 任意一屏单独截图，能看到至少一处橙红主色（按钮 / 状态点 / 描边）
4. Logo 在标题栏可见
5. 无新增的 hardcoded color，全部走 CSS 变量

---

## 10. 后续可演进方向（V1.1+）

- **品牌"印章"系统**：每个项目可绑定一个色调变体（`--brand-reel` 默认，但允许 `--brand-cyan` / `--brand-violet` 等子项目色），仍保持暗舞台底
- **导出物水印**：所有从画布导出的图片右下角带一枚浅灰 ReelForce mini 印章，对外传播即品牌曝光
- **Loading 状态**：用 logo 的 glitch 重组动画替代通用 spinner
- **声音**：节点生成完成、错误时的极轻量音效（≤200ms，可关闭）

---

**维护者**：UI / 设计负责人 + 前端 Lead
**版本**：v1.1 · 2026-05-01（双主题对等版）
**状态**：待 Phase 1 落地后回归校准
