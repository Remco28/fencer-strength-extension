# Task: Multi-Weapon Summaries in Tracked List

**Owner:** Architect  
**Status:** Ready for Implementation  
**Target Phase:** Priority 1 – Core Functionality & Shipping

## Objective
Enhance the tracked-fencer list so each entry can surface multiple weapon strength summaries without breaking the current clean, compact layout. Preserve today’s primary-weapon highlight while adding lightweight badges for any additional weapons a fencer competes in.

## Scope & Constraints
- Limit code changes to `content.js` and `modal.css` (plus any new helpers within these files). Do not touch popup, background, or API layers.
- Maintain existing aesthetics: same typography, spacing rhythm, and remove button placement. Additional weapon info must read as subtle inline chips—no new heavy blocks or tables.
- Keep storage backwards-compatible. Existing entries lacking multi-weapon data must continue to render using the legacy single-line summary.
- Avoid migrations that require clearing user data; enrich records on-the-fly when information becomes available.

## Required Changes
1. **`content.js` – tracked entry data model**
   - Update `buildTrackedEntry(profile, strength)` so it captures a `weaponSummaries` array alongside the existing top-level fields. Suggested structure per weapon: `{ weapon: 'foil', de: '2450', pool: '1980', isPrimary: boolean }`.
   - Use current priority ordering (`['epee','foil','saber']`) to mark `isPrimary`. Ensure the first element in the array aligns with the stored `weapon`, `deStrength`, and `poolStrength` fields for backwards compatibility.
   - Introduce a helper such as `collectWeaponSummaries(strength)` that:
     - Iterates `strength.weapons` in the priority order, falling back to alphabetical for any extras.
     - Normalizes each summary via existing `extractStrengthValue`.
     - Filters out weapons missing both DE and Pool numbers.
   - When no strength data exists, continue returning the legacy shape (empty array).

2. **`content.js` – storage normalization**
   - Update `setTrackedFencers` sanitization to persist `weaponSummaries` if provided (deep copy to avoid accidental reference sharing). Default to `[]` when absent.
   - Add a lightweight normalization step in `renderTrackedList()` (or a dedicated helper) that guarantees each entry exposes `weaponSummaries`. For legacy records, synthesize an array with a single element derived from the top-level `weapon/deStrength/poolStrength`.

3. **`content.js` – rendering adjustments**
   - Replace `formatTrackedStrength(entry)` usage with a new renderer that:
     - Creates a container (e.g., `.fs-tracked-strength`) holding inline chip elements per weapon.
     - Each chip should follow the pattern `Épée · DE 2500 / Pool 1900`. Use weapon name capitalization consistent with existing UI (`titleCase` helper already exists for weapon labels—reuse if available).
     - Highlight the primary weapon subtly (e.g., add `.fs-tracked-weapon-primary` class) without introducing bold color blocks.
   - Provide a fallback for entries lacking the array: render the current single-line text.
   - Ensure long lists wrap gracefully on narrow viewports while keeping remove buttons aligned via the existing flex row.

4. **`modal.css` – subtle chip styling**
   - Extend `.fs-tracked-strength` to act as a horizontal wrap container with small gutter (4–6px) and top margin of ~2px from the name row.
   - Add `.fs-tracked-weapon` styles for the chips: pill-shaped border radius (match existing 6px), light neutral background (`rgba(17, 24, 39, 0.04)` or similar), 11–12px font, medium gray text (`#4b5563`).
   - `.fs-tracked-weapon-primary` may use a slightly darker text or medium-weight font to imply emphasis while staying within the clean aesthetic.
   - Respect the current responsive breakpoint (≤540px) to wrap chips nicely and maintain tap targets.

5. **Interaction & state sync**
   - Ensure removal/clear flows continue to work with the enriched data (no additional changes expected, but validate that sanitized entries keep `weaponSummaries` intact).
   - Confirm `handleTrackedRemovalEffects` and `refreshTrackToggle` still reflect the primary weapon correctly after updates.

## Acceptance Criteria
- Tracked entries with multiple weapons show a tidy row of chips: primary weapon first, others following in priority order.
- Entries lacking additional weapons continue to display exactly one chip (visually similar to today’s single-line text).
- Existing stored data (without `weaponSummaries`) renders without errors and is upgraded seamlessly after the user re-tracks a fencer.
- Layout remains compact: name + remove button on the first line; chips wrap beneath without pushing controls out of alignment.
- Keyboard focus order and remove/clear behaviors are unchanged; no console errors during typical usage.

## Validation
- Track a multi-weapon fencer (e.g., one with Épée and Foil strengths). Open the tracked list and verify chip ordering and styling.
- Track a single-weapon fencer to ensure the presentation still looks identical aside from the chip styling.
- Remove a multi-weapon fencer and confirm the list re-renders without stale chips or layout shifts.
- Resize the modal to narrow widths (or simulate via DevTools) to confirm chips wrap cleanly and the remove button stays accessible.
- Inspect `chrome.storage.local` (via DevTools) to confirm entries now include `weaponSummaries` arrays while legacy entries remain compatible.
