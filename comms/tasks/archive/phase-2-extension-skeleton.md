# Spec: Phase 2 – Extension Skeleton

## Objective
Set up the Manifest V3 Chrome extension foundation with context-menu wiring, modal injection, and mock data services so later phases can focus on live data integration and polish.

## Scope
- Manifest, icons placeholder wiring, and service worker (background script).
- Content script responsible for modal injection and message handling.
- Modal markup/CSS scaffold with loading, error, and list sections (no detailed styling yet).
- Utility layer for messaging, DOM helpers, and mock data source (search + profile strength payloads).
- Build/test instructions for loading the extension in Chrome using mocked data.

## Requirements
1. **Manifest (manifest.json)**
   - MV3 compliant; include `contextMenus`, `activeTab`, `storage` permissions and `https://fencingtracker.com/*` host permissions.
   - Register `background.js` as service worker and `content.js` with `modal.css`.
   - Placeholder icons (`icon16.png`, `icon48.png`, `icon128.png`) committed or noted.
2. **Service Worker (background.js)**
   - Create context menu item `Lookup Fencer on FencingTracker` visible when text selected.
   - Forward selection text via message to the active tab content script.
3. **Content Script (content.js)**
   - Listen for messages; show modal with mock data lookup.
   - Modal states: loading spinner, error message, results list, profile view.
   - Provide close controls (X button, escape key, backdrop click).
   - Pull data from mock service; no real network calls yet.
4. **Modal Styles (modal.css)**
   - Basic layout: fixed center, overlay backdrop, typography placeholders.
   - Distinguish states (loading, list, details) using utility classes.
5. **Mock Data Utilities (`src/mock/` or similar)**
   - `searchMock(query)` returning promise with simulated single/multi/no match cases.
   - `fetchProfileMock(id)` and `fetchStrengthMock(id)` returning deterministic sample data including multi-weapon example.
   - Introduce minimal delay (e.g., `setTimeout`) to emulate network latency.
6. **Developer Experience**
   - README or section in this spec covering how to load the unpacked extension, trigger mock flows (recommended sample text), and known limitations.

## Deliverables
- `manifest.json`, `background.js`, `content.js`, `modal.css`, `src/mock/*.js` (or `.ts` if TypeScript chosen), and supporting README notes.
- Verified ability to load the extension, select text on any page, right-click, and open the modal populated via mock data.

## Out of Scope
- Real fencingtracker API calls or HTML parsing.
- Final styling, animation polish, caching layer, and error analytics.
- Testing/cert automation (covered in later phases).

## Acceptance Criteria
- Context menu appears only when text is selected and opens modal flow using mock data.
- Modal supports switching between mock single-result and multi-result scenarios via mock responses (e.g., set query `John Doe` => multiple, `Jane Doe` => single, `Unknown` => error).
- No console errors or unhandled promise rejections during mock flows.
- Code structured to be easily replaced with live data modules in Phase 3 (modules exported via interfaces or clear functions).
