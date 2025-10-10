# Task: Slug Nickname Preservation Fix

**Owner:** Architect  
**Status:** Ready for Implementation  
**Priority:** BLOCKER › CORS Refactor › Bugfix

## Objective
Extend the recent slug hotfix so regenerated slugs retain nickname parentheses (`(...)`) exactly as fencingtracker expects. Profiles such as “LI Yunji (Rain)” still fail the fallback retry because `createSlug` strips parentheses and `buildSlugFromName` excludes the nickname when rebuilding the slug. We must preserve these tokens so the background retry hits the canonical URL.

## Scope & Constraints
- Limit changes to the shared normalization helpers in `src/utils/normalize.js` plus the fallback logic in `src/api/profile.js` if additional data needs propagating.
- Do not touch message routing, caching, or HTML parsing.
- Avoid adding new dependencies; stick to native string manipulation.

## Required Changes
1. **`src/utils/normalize.js` – `createSlug`**
   - Allow parentheses to pass through the sanitisation step. Update the regex so it removes punctuation fencingtracker disallows but keeps `(` and `)` when they’re part of nicknames.
   - Ensure whitespace collapse and hyphen logic still yield a clean slug (e.g., `Yunji (Rain)-Li`).
   - Update the comment to note that parentheses must be preserved for nickname slugs.

2. **`src/utils/normalize.js` – `buildSlugFromName`**
   - When `parseStructuredExternalName` detects a nickname, include it in the base string before handing off to `createSlug`. The canonical order should mirror fencingtracker: `"${firstNames} (${nickname}) ${lastName}"`, followed by any suffix if present.
   - For non-structured names, keep existing behaviour.

3. **Validation guard**
   - If trimming produces empty tokens (e.g., nickname only), fall back gracefully so we never emit slugs like `-Li`.

## Acceptance Criteria
- `createSlug('Yunji (Rain) Li')` returns `Yunji (Rain)-Li`.
- `buildSlugFromName('LI Yunji (Rain)')` returns `Yunji (Rain)-Li`.
- Looking up `LI Yunji (Rain)` in the extension succeeds after a fallback retry (no 404 in background logs).
- Previously fixed cases (e.g., `Sheth, Anayaà`, `Lee Kiefer`) still work.

## Validation
- Reload the extension and look up:
  - `LI Yunji (Rain)`
  - `Sheth, Anayaà`
  - `Lee Kiefer`
- Inspect the background console to confirm no 404s after regeneration and that the cached slug stored on retry matches fencingtracker’s canonical casing with parentheses.
