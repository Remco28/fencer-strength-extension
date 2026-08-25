# fencingtracker.com Research Notes

## Search Endpoints
- Typeahead POST: `POST https://fencingtracker.com/search` with JSON body `{"query": string, "limit": number}`; returns an array of `{usfa_id, name, club}` objects.
- `limit` is accepted but responses are capped at 10 rows; fall back to HTML search when more results are needed.
- Search page GET: `GET https://fencingtracker.com/search?s=<encoded name>` (also responds to `?q=`); renders an HTML table with columns Name, Nickname, Club, Division.
- Name cell is `<td><a href="/p/{usfa_id}/{slug}">Last, First</a></td>`; use the link href to extract the numeric id and slug.
- **Note:** All API requests are now handled by the background service worker to avoid CORS issues (refactored 2025-10-09).

## Query Normalization
- Queries are case-insensitive and ignore extra spaces.
- Formats confirmed: `"First Last"`, `"Last, First"`, and some `"Last First"` strings (without comma) — but the last form is unreliable (`"Smith John"` returned zero results while `"Fields Lila"` worked).
- Recommendation: normalize the initial selection (trim, collapse spaces), then try the raw value; if no results, retry with `First Last` → `Last, First` swap (and vice versa) before surfacing a miss.
- API `name` field uses hyphenated slugs (`"Lee-Kiefer"`), so replace hyphens with spaces for display.

## Profile Page Selectors (`/p/{id}/{slug}`)
- Post-redesign layout (current):
  - Display name: `.person-hero h1` (primary selector) or `div.card-header h1.fw-bold` (legacy fallback).
  - Birth year: `.person-hero__birth-year` (post-redesign) or `div.card-header h3.text-dark-emphasis` (legacy fallback); may be empty for many fencers.
  - Primary club link: `a[href^="/club/"]` (moved out of card header in redesign; new hrefs: `/club/{id}/{Name}/ratings`).
  - Country flag: `<span class="flag-icon ...">` next to the name.
- Tabs: Summary | History | Strength; URLs follow `/p/{id}/{slug}/{tab}`.

## Win/Loss Aggregates (`/p/{id}/{slug}/history`)
- "Win/Loss Statistics" table includes seasonal columns and an "All Time" column.
- Rows: Victories, Losses, Win Ratio, DE Win Ratio, Pool Win Ratio, etc. Empty values render as `-`.
- Total bouts = (`Victories` + `Losses`) using the "All Time" column. Ensure parser treats `-` as zero before summing.

## Strength Data (`/p/{id}/{slug}/strength`)
- Post-redesign layout (current):
  - Summary table: `table.person-strength__summary-table` (primary) or `table.table-striped` (legacy fallback). Each row is a `(weapon, type)` pair where `type` ∈ {`DE`, `Pool`}.
  - Table structure: columns are Weapon | Type | Strength | Estimate Range | Min | Max
  - Weapons appear as "Foil", "Epee" (UI label uses the accented form), and "Saber". Multi-weapon support: the table lists one row per (weapon, type).
  - **Critical parsing note**: The redesign added a "Matchup against me" table that also uses the `table-striped` class. The old selector `table.table-striped tbody tr` would match both tables, causing matchup rows (which have empty strength values) to overwrite real strength data. Always prefer `table.person-strength__summary-table tbody tr` to target only the strength summary.
  - Type column validation: Only process rows where column 1 matches `/^(pool|direct elimination|de)$/i` to skip non-strength rows.
- Chart and navigation:
  - Nav pills above the chart map to weapons: `#weapon_pill_f`, `#weapon_pill_e`, `#weapon_pill_s`. Pills have `disabled` when that weapon lacks data.
  - Inline script exposes `const series = { "F": { P: [...], D: [...] }, "E": {...}, "S": {...} }` and `const stabilityPos = {...}`. Non-empty arrays indicate available data for that weapon.
  - Chart is populated by the `switchWeapon('<letter>')` function; `switchWeapon` is invoked at the bottom with the starting weapon for the profile (e.g., `'f'` for foil specialists).
- Use the summary table for quick DE/Pool values, and optionally the `series` data for sparkline history or to detect multi-weapon coverage.

## Implementation Notes
- Treat hyphenated slugs as canonical IDs for cache keys alongside the numeric `usfa_id`.
- When caching search results, store both the display name and slug to avoid recomputing.
- Respect polite scraping guidelines: single GET per tab interaction with 500–1000 ms pacing between sequential requests (search → profile → strength → history if needed).
- Expect occasional 404s when a slug is outdated; recover by retrying with the `name` returned from the search API.

## Parser Data Format Changes (Post-redesign)
- **Strength data structure**: The current parser returns `{ weapon: { pool: number, de: number, pool_range?: {min, max}, de_range?: {min, max} } }` 
- **Legacy format**: Pre-redesign mock data used `{ weapons: { weapon: { domesticStrength: "B2", pool: number } } }`
- **Current ratings**: Numeric strength values are typically in the 2000-5000+ range for active fencers
- **Range data**: When available, confidence intervals are provided as `{min: number, max: number}` objects
