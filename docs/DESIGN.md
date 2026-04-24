# Design System — Apple-Inspired

> Adapted from VoltAgent/awesome-design-md Apple design system for Storyboard Copilot.
> Dark-first application with Apple's design philosophy: clean typography, minimal chrome, cinematic spacing.

## Color Palette (Dark-First Adaptation)

### Backgrounds
- **Primary Surface**: `#1d1d1f` (Apple near-black, warmer than pure black)
- **Elevated Surface**: `#2a2a2d` (cards, dialogs)
- **Deeper Surface**: `#161617` (canvas, deepest layer)
- **Light Section**: `#f5f5f7` (alternate light sections if needed)

### Text
- **Primary**: `#f5f5f7` (high contrast on dark)
- **Secondary**: `rgba(255, 255, 255, 0.72)`
- **Tertiary/Muted**: `rgba(255, 255, 255, 0.48)`

### Interactive
- **Accent**: `#0071e3` (Apple Blue — sole chromatic accent)
- **Accent Hover**: `#0077ED`
- **Link on Dark**: `#2997ff`

### Borders
- **Subtle**: `rgba(255, 255, 255, 0.08)`
- **Medium**: `rgba(255, 255, 255, 0.12)`
- **Strong**: `rgba(255, 255, 255, 0.18)`

## Typography

- Font: system-ui (SF Pro on macOS, Segoe UI on Windows, Roboto on Android)
- Negative letter-spacing at all sizes
- Display (20px+): weight 600, line-height 1.07–1.14
- Body (14–17px): weight 400, line-height 1.47
- Caption (12px): weight 400, line-height 1.33

## Radius Scale
- Micro: 6px (tags, badges)
- Standard: 10px (buttons, inputs)
- Comfortable: 12px (cards, containers)
- Large: 16px (dialogs, panels)
- Pill: 980px (CTAs, chips)

## Depth
- Navigation glass: `backdrop-filter: saturate(180%) blur(20px)` on translucent bg
- Card shadow: `0 2px 20px rgba(0, 0, 0, 0.3)` (subtle lift)
- No heavy shadows — elevation via background contrast

## Principles
- Single accent color (Apple Blue) for all interactive elements
- No borders on cards — use background contrast
- Tight headline line-heights, comfortable body line-heights
- Generous whitespace between sections
- Products/content as hero — UI retreats
