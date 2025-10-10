# Task: Slug Regression Hotfix – Restore Mixed-Case & Diacritic Support

**Owner:** Architect  
**Status:** Ready for Implementation  
**Priority:** Blocker › CORS Refactor › Phase 2 – Bugfix

## Objective
Reinstate the slug-generation behaviour that preserves fencingtracker.com’s mixed-case and accented characters. Recent refactors reintroduced lowercase/ASCII-only slugs, breaking fallback profile lookups for names such as “Sheth, Anayaà” and “Suico, Kyubi Emmanuelle” whenever the upstream slug casing changes. The fix must ensure the background slug regeneration path yields the exact casing that fencingtracker expects.

## Scope & Constraints
- Work only in the shared normalization helpers (`src/utils/normalize.js`) and any direct consumers (`src/api/profile.js`, plus affected unit helpers if touched elsewhere).
- Do not alter the message bridge or caching code; the bug is confined to slug generation.
- Preserve existing search/normalization variants—only adjust the slug construction so we do not regress hit rates for other names.
- Avoid introducing heavyweight dependencies; stick to built-in string/regex utilities.

## Required Changes
1. **`src/utils/normalize.js`**
   - Update `createSlug` so it preserves the original case and Unicode letters. Replace the current `.toLowerCase()` and `[^\w\s-]` stripping with logic that:
     - Normalizes whitespace (trim + collapse) and converts internal spaces to single hyphens.
     - Removes only characters that fencingtracker’s slugs cannot contain (e.g., apostrophes, commas) while leaving letters with diacritics untouched.
     - Collapses consecutive hyphens and trims leading/trailing hyphens as before.
   - Retain compatibility with existing helpers (`buildSlugFromName`, `parseSlug`) without forcing lowercase.
   - Add a concise comment noting why we must preserve case/diacritics (reference the fencingtracker slug requirement to avoid future regressions).

2. **`src/api/profile.js`**
   - Ensure the slug fallback path passes the regenerated slug back to the content layer. Today `getProfile` caches `{ html, id, slug }`; after regenerating with `createSlug`, make sure the returned object’s `slug` field reflects the fallback slug so `createProfileUrl` and caching stay in sync.
   - Verify no other callers rely on lowercased slugs; adjust as needed if assumptions exist.

3. **Optional sanity helpers (if helpful)**
   - If you add a helper like `sanitizeSlugToken`, keep it within `normalize.js` and export it via the existing UMD/global pattern. Avoid sprinkling slug logic across multiple files.

## Acceptance Criteria
- `createSlug('Lee Kiefer')` returns `Lee-Kiefer` (not `lee-kiefer`).
- Diacritic preservation: `createSlug('Anayaà Sheth')` returns `Anayaà-Sheth`.
- Fallback regeneration works: requesting a profile with an outdated slug triggers the retry and succeeds using the new slug casing.
- Manual lookups for the reported names succeed in the extension UI, and the profile links point to the correct URL.

## Validation
- Reload the extension, perform lookups for:
  - `Sheth, Anayaà`
  - `Suico, Kyubi Emmanuelle`
  - A known hyphenated case (e.g., `Lee Kiefer`) to confirm mixed case.
- Inspect the background console to ensure no additional retries or 404 errors after the fix.
