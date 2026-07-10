# fencingtracker.com Research Notes

**Last verified:** 2026-07-10 (site redesign / person-hero layout)

## Search Endpoints
- Typeahead POST: `POST https://fencingtracker.com/search` with JSON body `{"query": string, "limit": number}`; returns an array of `{usfa_id, name, club}` objects.
- `limit` is accepted but responses are capped at 10 rows; fall back to HTML search when more results are needed.
- Search page GET: `GET https://fencingtracker.com/search?s=<encoded name>` (also responds to `?q=`); site typeahead builds profile links as `/p/{usfa_id}/{name}` where `name` is often hyphenated (`Lee-Kiefer`).
- **Note:** All API requests are handled by the background service worker to avoid CORS issues.

## Query Normalization
- Queries are case-insensitive and ignore extra spaces.
- Formats confirmed: `"First Last"`, `"Last, First"`, and some `"Last First"` strings (without comma) — but the last form is unreliable.
- Recommendation: normalize the initial selection (trim, collapse spaces), then try the raw value; if no results, retry with `First Last` → `Last, First` swap (and vice versa) before surfacing a miss.
- API `name` field uses hyphenated slugs (`"Lee-Kiefer"`), so replace hyphens with spaces for display; keep the hyphenated form as the URL slug when present.

## Profile Page Selectors (`/p/{id}/{slug}`) — 2026 layout
- Hero block (current):
  - Display name: `.person-hero__identity h1` (fallback: `.person-hero h1`, then first `h1`)
  - Birth year: `.person-hero__birth-year`
  - Club: `a.person-hero__club-link` or `.person-hero a[href^="/club/"]`
  - Country flag: `.person-hero__flag` / `.flag-icon[title]`
  - Optional olympian marker: `.person-hero__olympian-rings`
- Legacy (removed): `div.card-header h1.fw-bold`, `h3.text-dark-emphasis` — do not rely on these alone.
- Tabs: Summary | History | Strength; URLs follow `/p/{id}/{slug}`, `/history`, `/strength`. Bare `/summary` may 404.

## Win/Loss Aggregates (`/p/{id}/{slug}/history`)
- "Win/loss statistics" table includes seasonal columns and an "All time" column.
- Rows: Victories, Losses, Win Ratio, DE Win Ratio, Pool Win Ratio, etc. Empty values render as `-`.
- Total bouts = (`Victories` + `Losses`) using the "All Time" column. Ensure parser treats `-` as zero before summing.
- History HTML can be large (hundreds of KB); prefer caching and avoid unnecessary refetches.
- Bout tables include Opponent Strength / Win Chance columns when data exists (public).

## Strength Data (`/p/{id}/{slug}/strength`)
- Summary table class: `table.person-strength__summary-table` (also still `table-striped`).
- Columns: Weapon, Type, Strength, Estimate Range*, Min, Max.
- Type labels: `Pool`, `Direct elimination` (map non-pool → `de`).
- Strength values are Elo-like integers (~0–5000, average ~2500; new fencers start near 2500 with uncertainty).
- Ignore “Matchup against me” teaser table (auth-gated; empty teaser bars publicly).
- Inline `const series = { E/F/S: { P: [...], D: [...] } }` still present for history charts.
- Weapon UI uses `data-strength-weapon` / `data-strength-series` / `data-strength-range` (old `#weapon_pill_*` removed).

## Matchup estimates (extension-side)
- FencingTracker’s authenticated matchup is not scraped.
- Extension computes Elo win probability from public strength: `P = 1 / (1 + 10^((opp - me)/400))` per pool/DE.
- Soft labels: Clear favorite / Slight edge / Even matchup / Underdog / Clear underdog.

## Implementation Notes
- Treat hyphenated search `name` as canonical slug for cache keys alongside numeric `usfa_id`.
- Cache keys use a version prefix (`profile:v2:…`) so redesign invalidates old HTML.
- Respect polite scraping: single GET per tab interaction with pacing; 24h `chrome.storage.local` cache.
- Expect occasional 404s when a slug is outdated; recover by retrying with the `name` returned from the search API.
