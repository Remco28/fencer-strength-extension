# Task: Phase 2 – Background Messaging Bridge for API Calls

**Owner:** Architect  
**Status:** Ready for Implementation  
**Target Phase:** BLOCKER › CORS Refactor › Phase 2

## Objective
Move all cross-origin API execution into the background service worker by removing helper scripts from the page context and introducing a structured message bridge between `content.js` and `background.js`. After this phase, the content script must never call `fetch` (or helper wrappers) directly; it will delegate to the background API surface created in Phase 1.

## Scope & Constraints
- Update only the files required to reroute API traffic (`manifest.json`, `background.js`, `content.js`, and any shared messaging utilities you introduce). Do not modify unrelated UI or styling.
- Preserve existing user flows: context-menu lookup, tracked-fencer toggles, popup-triggered tracked list, and error handling must behave exactly as before.
- Continue to support lazy content-script injection via `background.js` when a page lacks the script.
- Keep the Phase 1 API surface (`self.fsApi`, `getBackgroundApi`) as the single source for background helpers. Do not re-import the helpers elsewhere.

## Required Changes
1. **`manifest.json`**
   - In the `content_scripts[0].js` array, remove all helper modules. Only `content.js` should remain (CSS stays as-is).
   - Confirm no other manifest fields require adjustment after this change.

2. **`background.js`**
   - Update `CONTENT_SCRIPT_FILES` so dynamic injection matches the manifest (only `content.js`).
   - Add an explicit message router that handles API delegation:
     - Listen for messages with an action such as `fsCallBackgroundApi`.
     - Extract the `functionName` and `args` payload, look up the function via `getBackgroundApi()`, and invoke it.
     - Ensure the handler supports async functions (return `true` from the listener and resolve via `sendResponse`).
     - Provide clear error responses when the function is missing or throws (e.g., `{ success: false, error: message }`).
     - Log unexpected failures for debugging but do not spam the console for expected user-facing errors (e.g., 404).
   - Preserve existing message listeners (`fsShowTrackedFencers`, context menu logic); integrate the new handler without breaking them.

3. **`content.js`**
   - Create a helper such as `callBackgroundApi(functionName, ...args)` that wraps `chrome.runtime.sendMessage` using the new action (`fsCallBackgroundApi`).
     - Handle `chrome.runtime.lastError` by rejecting with a descriptive `Error`.
     - Validate that the response contains `success: true` before resolving.
   - Replace direct calls to `searchFencers`, `getProfile`, `getStrength`, `getHistory`, and `purgeExpired` with the helper:
     - `purgeExpired()` should become a background call that can be awaited or ignored via `.catch` as today.
     - Ensure `lookupId` concurrency logic remains intact—only the data retrieval mechanism changes.
   - Remove any now-unused imports/globals references left behind by the helper removal.

4. **Sanity Updates**
   - Confirm that `importScripts` in `background.js` still executes before the message router initializes (Phase 1 code already does this).
   - If additional messaging constants/utilities improve clarity, place them near existing helper declarations within `content.js`.

## Acceptance Criteria
- `manifest.json` loads only `content.js` for `content_scripts` and the extension still injects CSS as before.
- `background.js` exposes a working `fsCallBackgroundApi` handler that invokes `searchFencers`, `getProfile`, `getStrength`, `getHistory`, and `purgeExpired` via `self.fsApi`.
- Content script successfully completes searches, profile loading, strength/history fetches, and cache purges using message passing; there are no direct `fetch` calls in `content.js`.
- Tracked-fencer flows and context-menu actions behave exactly as prior to this change.
- Background console shows helpful logs when API functions fail, but routine operations (successful lookups, cache hits) do not produce excessive noise.

## Validation
- Reload the extension and open the background service worker console. Trigger a lookup; confirm the console shows the Phase 1 success log once and no missing-function errors.
- Use the context menu to search for a fencer with multiple results, select one, and verify profile/strength/history data loads correctly.
- Toggle tracked status and open the tracked list via the popup to ensure messaging changes did not break those flows.
- Optionally inspect the Network tab for the active tab to confirm no cross-origin requests originate from the page context after the refactor (they should appear under the extension’s background worker).
