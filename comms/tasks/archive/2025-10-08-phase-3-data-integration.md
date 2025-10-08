# Spec: Phase 3 – Live Data Integration & Caching

## Objective
Replace the Phase 2 mock data flow with real calls to fencingtracker.com, parse the returned data (search JSON + HTML profile/strength/history pages), and introduce a 24-hour cache so repeat lookups are fast and gentle on the site. Maintain all existing UI flows (single result, multi result, error states) and add defensive retry/backoff handling.

## References
- Research notes: `comms/research/fencingtracker.md`
- Chrome extension skeleton (Phase 2): `manifest.json`, `background.js`, `content.js`, `modal.css`, `src/mock/mockData.js`

## Key Outcomes
1. Context menu lookup uses live fencingtracker.com data.
2. Cache layer (24-hour TTL) prevents redundant network hits per normalized query + fencer ID.
3. Modal displays real profile & strength stats per weapon, including multi-weapon coverage, with graceful handling when data is missing.

## Implementation Plan

### 1. Project Structure
Create a lightweight module organization under `src/`:
- `src/api/search.js` – handles POST `/search` requests.
- `src/api/profile.js` – fetches and parses `/p/{id}/{slug}` HTML.
- `src/api/strength.js` – fetches and parses `/p/{id}/{slug}/strength` HTML (including summary table + `series` data).
- `src/api/history.js` – fetches and parses `/p/{id}/{slug}/history` HTML (for win/loss totals, optional derived stats).
- `src/cache/cache.js` – wrappers around `chrome.storage.local` with TTL support.
- `src/utils/normalize.js` – query normalization helpers (trim, collapse spaces, swap order, slug utilities).

Update `manifest.json` content script entry to load the new modules (before `content.js`) so they are available in the page context. Keep mock data file out of MV3 bundle (remove from manifest to avoid shipping unused mocks).

### 2. Search Flow (content.js & src/api/search.js)
- Implement `searchFencers(query)` with these steps:
  1. Normalize the selection (`normalizeQuery(query)`) → returns lowercase `normalized` string and `variants` list.
  2. For each variant (e.g., `first last`, `last, first`, swapped order), check cache `search:{variant}`. If cached and fresh (<24h), return cached payload.
  3. Otherwise issue `fetch('https://fencingtracker.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: variant, limit: 10 }) })`.
  4. If POST returns array with >=1 result, cache under that variant and break.
  5. If still empty after all variants, optionally fall back to GET `/search?s=...` and scrape first table page (optional but recommended). If fallback fails, return empty array.
  6. Handle HTTP 429/5xx: wait 2s and retry once before surfacing failure.
- Return results shape `{ id: usfa_id, name, slug, club, country (default 'USA' if not available) }`.
- Add guard against slug mismatches: include the `name` string as slug (hyphenated) to build future URLs.

### 3. Profile Parsing (content.js & src/api/profile.js)
- Given `{ id, slug }`, fetch `https://fencingtracker.com/p/${id}/${slug}`.
- Parse using `DOMParser` on response text:
  - Name: `div.card-header h1.fw-bold`.
  - Birth year: sibling `h3` text trimmed (may be empty ⇒ set to `null`).
  - Club: first `div.card-header a[href^="/club/"]`; fallback to search result club if missing.
  - Country: `.flag-icon` element `title` attribute.
- Cache under key `profile:${id}` with TTL 24h.
- If page returns 404, attempt to re-fetch using slug derived from search result name (replace spaces with hyphens, strip punctuation) before failing.

### 4. Strength Parsing (content.js & src/api/strength.js)
- Fetch `https://fencingtracker.com/p/${id}/${slug}/strength`.
- Parse summary table rows (`table.table-striped tbody tr`) extracting:
  - Weapon name (normalize to lowercase key `foil`, `epee`, `saber`).
  - Type (`DE`, `Pool`).
  - Strength value (integer) and optional range (store as `{ min, max }`).
- Build structure:
```js
{
  weapons: {
    foil: { de: { value, range, min, max }, pool: { ... } },
    epee: {...},
    saber: {...}
  }
}
```
- Optional: parse inline `series` JSON to add arrays `history` for future charts (store but not yet surfaced).
- Cache under `strength:${id}` (24h).
- Handle missing tables gracefully: return empty `weapons` object.

### 5. History Parsing (content.js & src/api/history.js)
- Fetch `https://fencingtracker.com/p/${id}/${slug}/history`.
- Locate the `h3` "Win/Loss Statistics" table and extract `Victories` + `Losses` from the `All Time` column (convert `-` → `0`).
- Return `stats: { wins, losses, bouts: wins + losses }` for use in profile view.
- Cache under `history:${id}` (24h).

### 6. Cache Module (`src/cache/cache.js`)
- Implement `getCached(key)` / `setCached(key, data, ttlMs)` using `chrome.storage.local`.
- Store payload as `{ value, expiresAt }`.
- Add `purgeExpired()` helper and call opportunistically before returning results.

### 7. Content Script Adaptations
- Replace mock calls in `handleLookup` and `showProfileView` with new APIs:
  - `const results = await searchFencers(query);`
  - `const profile = await getProfile(id, slug);` (use cached slug from search response).
  - `const strength = await getStrength(id, slug);`
  - `const history = await getHistory(id, slug);`
- Update profile details section to include wins/losses: e.g., `Total bouts: 83 (81W / 2L)` when available.
- Remove global mock functions; ensure any references are deleted.
- If a user opens the modal again while previous requests are in-flight, cancel or ignore previous responses (e.g., track `currentLookupId` and bail if mismatch).
- Provide user feedback when data missing: if no strength data, show `No strength data available`; if history fails, omit stats but avoid breaking UI.

### 8. Error & Rate Limit Handling
- For each fetch:
  - Catch network/timeouts, show `showErrorState('Unable to reach fencingtracker.com. Please try again.')`.
  - For HTTP 429, wait exponential backoff (2s, then 5s) and retry once; on final failure show message.
  - Log errors via `console.error` with context for debugging.

### 9. Clean-up
- Remove `src/mock/mockData.js` from the build (can keep file for unit tests if desired but not loaded by manifest).
- Update README to note live data support and add instructions about caching/respecting rate limits.
- Update `.gitignore` if new build outputs introduced.

## Deliverables
- Updated `manifest.json`, `content.js`, `background.js` (if necessary), `modal.css` (if needed), new modules in `src/api/`, `src/cache/`, `src/utils/`.
- Removal of mock data loading from manifest and content script.
- Working lookup flow using real data with caching.
- Documentation updates (README “Current Status”, testing instructions).

## Acceptance Criteria
1. Right-click lookup retrieves live results from fencingtracker.com (verified with known fencers like "Lee Kiefer", "Mariel Zagunis").
2. Modal shows accurate profile info, strength cards per weapon/type, and total bouts when available.
3. Multi-result queries present selection list with data from live search; selecting opens correct profile.
4. Repeating the same query within 24 hours hits cache (verified via logging or instrumentation).
5. Graceful handling: network failure → error message; fencer without strength/history data → fallback messages without crashes.
6. No unused mock data shipped; manifest and scripts free of Phase 2 placeholders.

## Testing Checklist
- Lookup with unique name (single result) and common surname (multi result).
- Fencer with multi-weapon strength (e.g., Alex Smith equivalent) and with missing strength.
- Fencer missing birth year or club to confirm UI resilience.
- Offline simulation (disable network) to validate error states.
- Repeat query to confirm cached response (log timestamp or network panel).
