# Spec: Strength Card Emphasis & Palette Swap

## Objective
Swap the visual hierarchy between the “Total bouts” card and the strength ratings so that weapon strength stands out as the hero information. Apply the new palette consistently and add subtle UX polish that keeps the overview tidy and scannable.

## References
- `modal.css`
- `content.js`
- Screenshot provided via user request (Fencer Lookup modal)

## Background
The modal currently uses a vibrant gradient on the total-bouts card while the strength section is rendered on neutral tiles. Users want the opposite: strength ratings should attract attention first, with bouts displayed in a calmer style. We’ll also take the opportunity to surface the key metric in each strength card and ensure the layout feels balanced after the swap.

## Deliverables

### 1. Strength Card Highlight (`modal.css`, `content.js`)
- Introduce a reusable gradient token at the top of the stylesheet (e.g., `--fs-accent-gradient: linear-gradient(140deg, #2563eb 0%, #3b82f6 55%, #60a5fa 100%);`).
- Apply that gradient to `.fs-strength-card`, replacing the current white background with the same treatment previously used on `.fs-profile-record-card`. Include the large-drop shadow so the card feels elevated.
- Adjust typography and spacing so strength values remain legible on the dark background:
  - Set `.fs-strength-item` background to `rgba(255, 255, 255, 0.12)` with rounded corners and a subtle border (1px `rgba(255, 255, 255, 0.18)`).
  - Change `.fs-strength-label` color to `rgba(255, 255, 255, 0.75)` and make the font all-caps at ~12px with letter spacing to reinforce structure.
  - Increase `.fs-strength-value` size to ~20px, color `#fff`, font-weight 700.
  - Ensure focus outlines for keyboard navigation remain visible (e.g., `outline: 2px solid rgba(255, 255, 255, 0.7);` on `:focus` states of the card).
- In `content.js`, add a helper that splits each metric into value and optional range so we can style the range separately:
  - Update `formatStrengthValue` (or add a new `getStrengthDisplayParts`) to return `{ valueText, rangeText }`.
  - Render range text inside `<span class="fs-strength-range">` when present; style it as `rgba(255, 255, 255, 0.65)` with smaller font (~13px).
- Add a top-line badge inside each card to surface the strongest available metric:
  - Compute the highest `value` among DE/Pool (ignore `null` metrics).
  - Render `<span class="fs-strength-badge">Top: DE 1147</span>` aligned to the top-right of the card header.
  - Style `.fs-strength-badge` with a semi-transparent white pill background (`rgba(255, 255, 255, 0.18)`), uppercase glyphs, and 11px font.

### 2. Muted Bouts Card (`modal.css`)
- Update `.fs-profile-record-card` to use the light gradient block currently on `.fs-profile-info` (or a soft white/ice background). Recommended styling:
  - Background: `linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)`.
  - Text color: `#1f2937`, remove white text assumptions.
  - Replace the large drop shadow with a subtle soft-shadow (`0 8px 20px rgba(15, 23, 42, 0.08)`).
  - Adjust the label to use the accent navy (`#1e3a8a`) for contrast but keep weight 600; ensure the value font size still reads as ~28–30px.
- Verify contrast ratios meet accessibility standards after the change.

### 3. Layout & Micro-Polish (`modal.css`, `content.js`)
- Add `gap: 20px;` to `.fs-strength-cards` and introduce `flex-wrap: wrap;` with new responsive breakpoint so multiple weapons form a 2-column grid on screens ≥768px (`.fs-strength-card` min width ~280px).
- Add `margin-top: 12px;` to `.fs-profile-record` so the muted card breathes above the strength cards after the hierarchy shift.
- Ensure keyboard focus order remains intact: cards should remain focusable only if they already were; strength items rely on their parent button states (no change needed unless new focusable elements are introduced).

### 4. Optional Enhancement (Quick Wins)
- If time allows, add a small subtitle under the fencer name (e.g., “Live strength & bout stats”) borrowing the color palette used for the new muted card to reinforce the visual grouping.
- Consider adding a tooltip or inline note on the strength card when only one metric exists (“Pool rating only”).
  - Only implement if straightforward within the existing markup patterns; otherwise leave as backlog note in `NEXT_STEPS.md`.

## Acceptance Criteria
1. Strength cards visually adopt the gradient accent, with legible white typography and badges highlighting the top metric.
2. The total-bouts card is rendered on a calm, light background while maintaining clear typography and accessibility contrast.
3. Strength ranges are displayed with dedicated styling separate from the primary value.
4. Layout adapts gracefully on tablet/desktop with multi-column strength cards while maintaining mobile stacking.
5. Any optional enhancements applied are documented in `NEXT_STEPS.md` if deferred.

## Notes for the Developer
- Test the modal in both light and dark OS themes to verify contrast (even though modal is theme-agnostic).
- Confirm the badge logic handles weapons that only have Pool or only DE data.
- Update `modal.css` comments where necessary to reflect new sections so future contributors understand the palette decisions.
