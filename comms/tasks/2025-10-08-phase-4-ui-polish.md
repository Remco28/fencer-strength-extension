# Spec: Phase 4 – UI Polish & Accessibility

## Objective
Deliver a production-ready modal experience that feels on-brand, works smoothly across desktop breakpoints, and can be fully operated with keyboard and screen readers. Preserve the live data pipeline delivered in Phase 3 while elevating visual design, micro-interactions, and feedback messaging.

## References
- `ROADMAP.md` (Phase 4 goals)
- `NEXT_STEPS.md`
- `content.js`
- `modal.css`
- `src/cache/cache.js`
- `src/api/profile.js`, `src/api/strength.js`, `src/api/history.js`
- `README.md` (Current Status + Testing Instructions)

## User Stories
- As a coach, I want the lookup modal to feel polished and branded so I trust the extension during demos with athletes.
- As an accessibility-first user, I need to navigate search results, profile data, and dismissal controls using only the keyboard or a screen reader.
- As a power user, I want clear feedback about loading, errors, and cache freshness so I know when the data was last fetched.

## Key Outcomes
1. Modal aesthetic matches the fencing-inspired palette (navy primary, icy neutrals, accent gold) with refined spacing, typography, and motion.
2. Keyboard/screen-reader accessibility: focus trapped in the dialog, arrow navigation through results, semantic roles/labels, and `aria-live` messaging.
3. Feedback states cover loading skeletons, empty/error messaging, and “data updated” badges sourced from cache metadata.

## Implementation Plan

### 1. Modal Markup Refresh (`content.js`)
- Update `createModal()` to emit semantic structure:
  - `<div id="fencer-strength-modal" class="fs-modal-overlay fs-hidden" role="dialog" aria-modal="true" aria-labelledby="fs-modal-title" aria-describedby="fs-modal-subtitle">`.
  - Header: icon container (`.fs-modal-icon` with inline SVG), `<h2 id="fs-modal-title">`, optional subtitle `<p id="fs-modal-subtitle">Live strength & bout stats from fencingtracker.com</p>`.
  - Insert an inline `<button class="fs-modal-close" aria-label="Close modal">`.
  - Wrap view states in `<main class="fs-modal-content" role="document">` to aid screen readers.
  - Introduce `<footer class="fs-modal-footer">` containing:
    - Primary CTA button `View on FencingTracker` (opens `https://fencingtracker.com/p/{id}/{slug}` in new tab; hidden until profile data ready).
    - Secondary button `Copy Profile Link` (uses `navigator.clipboard.writeText`; disable and show tooltip when unavailable).
- Add a badge placeholder `.fs-cache-indicator` in the profile view to display “Updated X hr ago” once cache metadata is available.
- Replace the raw back arrow text with an icon+label button (`<button class="fs-back-button" aria-label="Back to search results"><span aria-hidden="true">←</span> Back</button>`).

### 2. Visual Redesign (`modal.css`)
- Define CSS custom properties at the top for theme reuse:
  ```
  :root {
    --fs-color-navy: #1e3a8a;
    --fs-color-navy-dark: #172554;
    --fs-color-ice: #f1f5f9;
    --fs-color-stone: #475569;
    --fs-color-gold: #f59e0b;
    --fs-radius-lg: 16px;
    --fs-shadow-lg: 0 32px 80px rgba(15, 23, 42, 0.3);
  }
  ```
- Apply a blurred, dimmed overlay (`backdrop-filter: blur(2px)` when supported) and a scale+fade entry animation (`@keyframes fs-modal-in` scaling from 0.98 → 1, opacity 0 → 1).
- Convert the modal container to a responsive card:
  - Larger max width (~680px) with a two-column grid for strength cards on ≥960px viewports.
  - Soft gradient header background (`linear-gradient(135deg, var(--fs-color-navy), var(--fs-color-navy-dark))`) with white text.
  - Typography hierarchy: title 22px bold, subtitle 15px regular, content 15–16px; use `font-family: 'Inter', 'Segoe UI', sans-serif`.
- Style results list items as elevated cards with hover + focus outlines (`outline: 2px solid var(--fs-color-gold)` when active) and transition durations ≤180ms.
- Give loading skeletons shimmering animation (see §4) and ensure `.fs-hidden` remains the single display toggle mechanism.
- Respect `prefers-reduced-motion`: wrap animations in `@media (prefers-reduced-motion: no-preference)` and fall back to instant state changes otherwise.

### 3. Interaction & Accessibility Enhancements (`content.js`)
- **Focus trap:** Within `showModal()`, capture the previously focused element, move focus to the close button, and add a `keydown` handler that loops `Tab` navigation inside focusable elements (links, buttons, inputs). Restore focus on `hideModal()`.
- **Keyboard shortcuts:**
  - Arrow Up/Down cycles through `.fs-result-item` elements; maintain `let activeResultIndex = 0`.
  - `Enter` on the active list item triggers `showProfileView`.
  - `Shift+Tab` from the first focusable element wraps to the footer button, and `Tab` from the last wraps to the close button.
  - Add `Ctrl+C`/`Cmd+C` handler while profile view open to copy the currently selected fencer’s profile URL.
- **ARIA semantics:**
  - Set `role="listbox"` on results container and `role="option"` on each result item, updating `aria-selected="true"` on the active element.
  - Mark error message with `role="alert"` and `aria-live="assertive"`.
  - When loading, set `aria-busy="true"` on main content and remove once resolved.
- **State helpers:** Extract a reusable `setActiveView(viewName)` helper to manage `fs-hidden` toggles and ARIA attributes for `loading`, `error`, `results`, and `profile`.

#### Pseudocode: results keyboard flow
```js
function showResultsList(results) {
  activeResultIndex = 0;
  renderResultItems(results);
  updateActiveResult();
  modalElement.addEventListener('keydown', handleResultsKeydown);
}

function handleResultsKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeResultIndex = (activeResultIndex + 1) % currentResults.length;
    updateActiveResult();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeResultIndex = (activeResultIndex - 1 + currentResults.length) % currentResults.length;
    updateActiveResult();
  } else if (event.key === 'Enter' && event.target.closest('.fs-results-list')) {
    event.preventDefault();
    const result = currentResults[activeResultIndex];
    showProfileView(result, currentLookupId);
  }
}
```

### 4. Loading, Skeletons, and Messaging (`content.js`, `modal.css`)
- Replace the single spinner with contextual skeletons:
  - Results skeleton: 3 placeholder cards (name bar + info bar).
  - Profile skeleton: grey bars for name, details, and two empty strength cards.
  - Implement via CSS classes (`.fs-skeleton`, `.fs-skeleton-text`, `.fs-skeleton-card`).
- Adjust `showLoadingState()` to accept `{ stage: 'search' | 'profile' }` and toggle the appropriate skeleton variant.
- Enhance `showErrorState(message, options)` to accept optional retry callback; render a retry button when provided. Button should regain focus and trigger the supplied function.
- Add subtle inline notices:
  - If results > 5, show `“Showing first 10 matches – refine search for more.”`.
  - If only cached data is available (freshness > 6 hours), show tooltip near cache badge indicating when to retry for newer data.

### 5. Cache Metadata for UI (`src/cache/cache.js`, API modules, `content.js`)
- Extend `setCached` to store `storedAt` alongside `value` and `expiresAt`.
- Add new helper `getCachedWithMeta(key)` returning `{ value, storedAt, expiresAt }` without stripping metadata on read. `getCached` can wrap this helper to preserve backward compatibility.
- In `searchFencers`, `getProfile`, `getStrength`, and `getHistory`, return objects augmented with `cachedAt` when pulled from cache:
  ```js
  const cached = await getCachedWithMeta(cacheKey);
  if (cached && !isExpired(cached.expiresAt)) {
    return { ...cached.value, cachedAt: cached.storedAt };
  }
  ```
- Within `showProfileView`, compute relative freshness (`formatDistanceToNow(cachedAt)` or manual hour/minute delta) and populate `.fs-cache-indicator`. Hide the badge for brand-new network responses.

### 6. Documentation & Cleanup
- Update `README.md` UI section with a short “Phase 4 polish” summary, noting keyboard support, cache badge, and copy-link feature.
- Add a “UI polish checklist” subsection to `NEXT_STEPS.md` (or mark relevant Phase 4 items complete if satisfied).
- Verify no unused CSS selectors remain from the old layout; delete orphaned classes (e.g., `.fs-loading-state p` if replaced by skeletons).

## Deliverables
- Updated `content.js`, `modal.css`, `src/cache/cache.js`, relevant API modules (`search.js`, `profile.js`, `strength.js`, `history.js`), and documentation (`README.md`, `NEXT_STEPS.md`).
- New/updated assets: inline SVG icon markup in modal header (no external files required).
- Keyboard-accessible, animated modal respecting reduced-motion preferences.
- Cache freshness badge and enhanced loading/error states.

## Acceptance Criteria
1. Modal opens with scale/fade animation (unless reduced-motion), traps focus, and restores the invoking focus on close.
2. Arrow keys and Enter allow navigating and selecting from the results list; `Tab` cycles through controls without escaping the modal.
3. Profile view shows “Updated <relative time> ago” when data served from cache ≥1 minute old; badge hidden for fresh network responses.
4. Loading skeletons appear for both search and profile stages; spinner no longer visible.
5. Error state offers retry action when network failure occurs and announces via screen reader (`role="alert"`).
6. View-on-site button opens a new tab to the fencer profile and copy-link button places the canonical URL on the clipboard (with graceful fallback message if API unavailable).

## Testing Checklist
- Keyboard walk-through: open modal, navigate multi-result list (Arrow keys, Enter), activate back button, and close via `Esc`.
- Screen reader smoke test: VoiceOver/NVDA announces dialog title, results count, and error messages.
- Cache badge validation: perform lookup twice—second run should display “Updated X min ago”; clear cache and confirm badge disappears.
- Reduced-motion: enable OS-level reduced-motion and confirm modal appears without animation.
- Clipboard fallback: test browsers where `navigator.clipboard` is unavailable (use DevTools emulate insecure context) to ensure user feedback.
- Responsive layout: inspect at 360px, 768px, and 1280px widths to confirm card stacking and footer behavior.
