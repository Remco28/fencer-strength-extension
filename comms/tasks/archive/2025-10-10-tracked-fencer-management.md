# Task: Tracked Fencer Management Controls

**Owner:** Architect  
**Status:** Ready for Implementation  
**Target Phase:** Priority 1 – Core Functionality & Shipping

## Objective
Extend the tracked-fencer modal so users can manage the list without leaving the overlay. Provide controls to remove individual entries and to clear the entire list (with protection against accidental nukes). These actions must keep chrome storage in sync, refresh the rendered list immediately, and respect the existing modal states.

## Scope & Constraints
- Touch only the tracked-list experience (DOM building, event wiring, and styling) plus any shared helpers you introduce inside `content.js`. Do not modify popup, background, or search flows.
- Preserve alphabetical sorting, existing empty state messaging, and storage schema (`[{ id, name, slug, deStrength, poolStrength, weapon }]`).
- All controls must be keyboard accessible, follow existing modal semantics, and avoid introducing additional modal dialogs beyond the standard `window.confirm` for the bulk-clear confirmation.
- When a removal affects the currently viewed profile (`currentFencer`), ensure the star toggle state stays accurate the next time the profile pane is shown.

## Required Changes
1. **`content.js` – modal markup & listeners**
   - Update `createModal()` template so the tracked list section includes a small header action row (e.g., title on the left, `Clear All` button on the right). Button text: “Clear All”. Add `aria-label="Clear all tracked fencers"` and disable it when there are no tracked entries.
   - Add event wiring inside `setupModalListeners()` (or a new helper invoked from there) for:
     - Clicks on the new clear button: prompt the user with `confirm('Remove all tracked fencers? This cannot be undone.')`. On confirmation, wipe storage via `setTrackedFencers([])`, refresh the list, and keep the modal open.
     - Delegated clicks on new per-item remove buttons (described below). Attach a single listener to `.fs-tracked-items` and detect the button via class or `data-action`.
   - Introduce helpers:
     - `async function removeTrackedFencerById(fencerId)` that filters the stored array, writes it back via `setTrackedFencers`, and returns the updated collection.
     - `async function clearAllTrackedFencers()` that sets an empty array and returns `[]`.
     - Both helpers should call `refreshTrackToggle()` when the removal touches `currentFencer`.
   - Ensure `renderTrackedList()`:
     - Emits a remove button for each row. Suggested markup: `<button class="fs-tracked-remove" type="button" aria-label="Remove {{name}} from tracked list">Remove</button>`.
     - Wraps the name, strength summary, and action button in a flex row to avoid layout jumps.
     - Toggles the new clear button’s disabled state depending on `tracked.length`.
     - When the list becomes empty, shows the existing empty-state paragraph, hides or disables the clear button, and returns `[]`.
   - Guard all async flows with try/catch; log errors via `console.error` and keep the modal usable (e.g., re-enable buttons on failure).

2. **`content.js` – state synchronization**
   - After any removal or clear operation, ensure the list is re-rendered (`await renderTrackedList()`), the modal remains in tracked mode, and `setModalTitle('Tracked Fencers')` is preserved.
   - If the removed ID matches `currentFencer.id`, set `isCurrentFencerTracked = false` and re-run `renderTrackToggleState` so the star button is accurate when returning to profile view.
   - Retain existing `shouldRefreshList` behavior in `toggleTrackCurrentFencer()`. Removal helpers should not rely on that toggle; they should handle list refresh themselves.

3. **`modal.css` – layout updates**
   - Add styles for the action row (`.fs-tracked-actions`) to align the title and clear button horizontally with 12–16px gap and responsive wrapping for narrow widths.
   - Update `.fs-tracked-item` to lay out content in a row: name on the left, strength summary centered/right, and the remove button aligned to the far right. Maintain mobile friendliness (stack vertically when viewport is narrow).
   - Style `.fs-tracked-remove` to look like a subtle text-button (e.g., small font, primary color hover underline) while preserving focus outlines for accessibility.
   - Ensure disabled clear button state conveys non-interactive appearance and retains WCAG contrast (e.g., reduced opacity but still legible).

## Acceptance Criteria
- Tracked modal shows “Clear All” button only when entries exist; clicking it prompts for confirmation and clears storage + UI when accepted.
- Each tracked fencer row includes a remove control that deletes only that fencer, updates storage, and re-renders without leaving stale rows.
- Alphabetical sorting, empty state, and profile links continue to work as before.
- Removing a fencer that is the current profile causes the star toggle to show “Track this fencer” when revisiting their profile.
- All new controls are reachable by keyboard (tab order logical, Enter/Space activate) and have descriptive accessible labels.
- No console errors during normal usage; error paths log once and keep controls responsive.

## Validation
- Manually add three fencers, open the tracked list from the popup, remove the middle entry, and confirm the remaining two stay sorted.
- With the tracked list open, click “Clear All”, confirm once, and verify the empty-state message reappears plus the button disables.
- Load a profile, track it, remove it from the tracked list, then navigate back to the profile to confirm the star toggle shows the untracked state.
- Exercise keyboard-only navigation: tab to each remove button and activate with Space/Enter; ensure focus returns predictably after removal.
- Reload extension, reopen tracked list to confirm persisted state matches storage after deletions and clears.
