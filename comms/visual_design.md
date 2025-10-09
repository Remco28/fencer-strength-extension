# Visual Design Documentation

## Overview

This document captures the visual design system for the Fencer Strength extension modal, established during the Modal Visual Refresh (2025-10-09).

## Typography

### Font Family

**Primary Font:** Inter
- **Source:** Inter font family by Rasmus Andersson
- **Weights Used:**
  - 400 (Regular) - Body text
  - 500 (Medium) - Medium emphasis text
  - 600 (SemiBold) - Headings and labels

**Font Stack:**
```css
--fs-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

**Font Files:**
- `fonts/Inter-Regular.woff2` (400 weight)
- `fonts/Inter-Medium.woff2` (500 weight)
- `fonts/Inter-SemiBold.woff2` (600 weight)

**Implementation Notes:**
- All font files are loaded via `@font-face` declarations in `modal.css`
- Files are exposed as `web_accessible_resources` in `manifest.json`
- `font-display: swap` ensures text remains visible during font loading

## Design Tokens

All design tokens are defined in the `:root` CSS selector for global reuse.

### Border Radius

- **`--fs-radius-card: 8px`** - Used for larger card containers (modal, profile info, strength cards)
- **`--fs-radius-item: 6px`** - Used for smaller interactive items (buttons, meta items, result items, strength items)
- **`--fs-radius-button: 4px`** - Used for small action buttons (back button)

### Spacing

- **`--fs-spacing-tight: 6px`** - Compact spacing between related items (e.g., DE and Pool rows in strength cards)

### Color & Gradients

- **`--fs-accent-gradient`** - Default gradient fallback for strength cards
  ```css
  linear-gradient(140deg, #2563eb 0%, #3b82f6 55%, #60a5fa 100%)
  ```
- **Weapon-specific gradients**
  - `--fs-gradient-foil`: `linear-gradient(140deg, #059669 0%, #10b981 55%, #34d399 100%)`
  - `--fs-gradient-epee`: `linear-gradient(140deg, #2563eb 0%, #3b82f6 55%, #60a5fa 100%)`
  - `--fs-gradient-sabre`: `linear-gradient(140deg, #dc2626 0%, #ef4444 55%, #f87171 100%)`
  - Weapon classes (`fs-weapon-foil`, `fs-weapon-epee`, `fs-weapon-épée`, `fs-weapon-saber`) map to these gradients and adjust drop shadows to match the hue.

### Font

- **`--fs-font-sans`** - Primary font stack (see Typography section above)

## Spacing Philosophy

The visual refresh prioritized tighter, more efficient use of space while maintaining readability:

- **Strength Cards:** Reduced gap between DE/Pool rows from `8px` to `6px` (using `--fs-spacing-tight`)
- **Strength Items:** Reduced padding from `10px 14px` to `8px 12px`
- **Weapon Name Margin:** Reduced bottom margin from `12px` to `10px`
- **Label Alignment:** Strength labels now reserve `min-width: 42px` with an 8px row gap to keep DE/Pool values vertically aligned.
- **Tracked List Mode:** Compact variant (`.fs-modal-compact`) narrows the container to `360px`, hides the secondary heading, and renders each entry as a simple two-line row with only top/bottom borders for quick scanning.

## Responsive Breakpoints

### Default (≥521px)
- Strength cards use a CSS Grid layout: `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`
- Grid gap set to `16px`, with the explanation label spanning all columns via `grid-column: 1 / -1`

### Compact (≤520px)
- Grid collapses to a single column for readability on narrow devices

### Tablet/Mobile (≤640px)
- Modal container width increases to `95%`
- Header padding reduced to `16px 20px`
- Title font size reduced to `18px`

### Small Mobile (≤375px)
- Modal body padding reduced to `16px`
- Profile info padding reduced to `14px`
- Strength card padding reduced to `14px 16px`

## Alignment with fencingtracker.com

This design system was developed to align the extension's visual language with fencingtracker.com:

1. **Font Parity:** Inter font matches fencingtracker.com's typography
2. **Sharper Radii:** Reduced corner radii from `10-12px` to `6-8px` for a more refined look
3. **Tighter Spacing:** Compact vertical spacing in strength cards for denser information display

## Future Work

This visual foundation supports upcoming features:

- **Tracked Fencers Feature:** Star icon and tracked list UI will inherit these design tokens
- **Additional Components:** Any new UI elements should reference the tokens defined here
- **Theming:** The token-based system makes it straightforward to introduce theme variants in the future

## References

- Spec: `comms/tasks/2025-10-09-modal-visual-refresh.md`
- Stylesheet: `modal.css`
- Manifest: `manifest.json`
