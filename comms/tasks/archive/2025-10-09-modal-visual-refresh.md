# Modal Visual Refresh Spec

## Objective
Tighten the modal UI so future feature work (tracked fencer star, etc.) builds on a sharper visual language aligned with fencingtracker.com.

## Requirements
- Reduce vertical whitespace between the DE and Pool rows inside strength cards (reference screenshot 1281x1209) for a denser read.
- Decrease corner radii across modal elements; keep subtle rounding, not 90° angles.
- Adopt fencingtracker.com’s primary UI font to align with their branding.

## Implementation Notes
1. **Font parity**
   - Inspect fencingtracker.com to confirm their primary sans-serif (likely `Inter`).
   - Download WOFF2 files for weights 400, 500, 600 into a new `fonts/` directory.
   - Add `@font-face` declarations near the top of `modal.css`.
   - Introduce `--fs-font-sans` custom property and apply it to `.fs-modal-overlay` and any inheriting elements.
   - Expose the font files via `manifest.json > web_accessible_resources`.

2. **Design tokens**
   - Extend the `:root` block with tokens for font, radii, and tight spacing (e.g., `--fs-radius-card`, `--fs-radius-item`, `--fs-spacing-tight`).
   - Replace hard-coded radius and spacing values with these tokens throughout `modal.css` (modal container, profile info, meta items, strength cards/items, header/back button).

3. **Spacing adjustments**
   - Reduce padding/gap in `.fs-strength-card` and `.fs-strength-data` to hit the compact look.
   - Ensure the explanation label retains breathing room via updated margins.
   - Review mobile breakpoints (≤375px) to ensure content still fits without overflow.

## Acceptance Criteria
- Modal typography renders using the fencingtracker.com font on both Windows and macOS.
- Rounded corners look sharper than current build, with no remaining 12px+ radii.
- DE/Pool rows display with visibly reduced whitespace yet remain readable.
- No regressions on small widths (375px) or tablet (768px). Resize within the extension to confirm.
- Fonts load without console errors; fallback stack applies if font fails.

## Follow-up
- Document the chosen font family and token values in `comms/visual_design.md` for future tracked-fencer feature work.
