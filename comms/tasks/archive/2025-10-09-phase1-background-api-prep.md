# Task: Phase 1 – Prepare Background Service Worker for API Ownership

**Owner:** Architect  
**Status:** Ready for Implementation  
**Target Phase:** BLOCKER › CORS Refactor › Phase 1

## Objective
Load all existing network/cache helpers inside the background service worker so that cross-origin work can migrate off the page context in a follow-up phase. This task must leave the current content-script behavior intact while giving the background script first-class access to the API surface.

## Scope & Constraints
- Do **not** change `content.js` message flow yet; the content script should continue calling the global helper functions it already uses.
- Keep the current content-script bundle (manifest and `CONTENT_SCRIPT_FILES`) untouched for now so we do not break lookups during this phase.
- Avoid introducing any new network behavior or message routing. The goal is to ensure the background script can own the helpers without being wired into the UI yet.
- All updates must work under Manifest V3 service-worker constraints (no `import`/`export` modules, use `importScripts`).

## Required Changes
1. **`background.js`**
   - At the top of the file, call `importScripts` with the helper/API modules that currently run in the page (`src/config/base-url.js`, `src/cache/cache.js`, `src/utils/normalize.js`, `src/api/search.js`, `src/api/profile.js`, `src/api/strength.js`, `src/api/history.js`).
   - After the imports, construct a namespaced API surface (e.g., `const backgroundApi = { searchFencers, getProfile, getStrength, getHistory, purgeExpired };`) and attach it to the service-worker global (`self.fsApi = backgroundApi`). Validate the functions exist before wiring them into the map; throw or log a clear error if any import failed.
   - Add a lightweight helper (`getBackgroundApi()` or similar) that future phases can call to retrieve this map safely.
   - Add inline documentation describing why the helpers are now loaded in the background and referencing Phase 2 for the messaging hand-off.

2. **Sanity Checks**
   - Confirm the background service worker loads without runtime errors by using `chrome.runtime.getManifest()` or existing install hooks (e.g., ensure the console would log an import failure if it occurred).
   - Ensure any linting/formatting used by the project still passes (use existing scripts).

## Out of Scope
- Do not remove the helper scripts from the content-script bundle yet.
- Do not implement the message router or modify `content.js`.
- No UX changes or additional caching strategy tweaks.

## Acceptance Criteria
- Background console shows no errors on startup related to missing globals or failed imports.
- A namespaced API object exists on the `self` global with the expected functions (`searchFencers`, `getProfile`, `getStrength`, `getHistory`, `purgeExpired`) and can be accessed in future phases.
- Existing user flows (context menu lookup, tracked list) remain functional with the current direct calls in `content.js`.

## Validation
- Reload the extension in Chrome and check the service-worker console for import confirmation/error logs.
- Trigger a context menu lookup to confirm no regressions (content script should still work as today).
