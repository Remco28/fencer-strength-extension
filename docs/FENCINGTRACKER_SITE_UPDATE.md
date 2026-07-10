# FencingTracker Site Update — Findings & Proposed Changes

**Branch:** `update/fencingtracker-site-refresh`  
**Date:** 2026-07-10  
**Status:** Research only — no application code changes yet  
**Extension version reviewed:** `0.2.0` (Manifest V3)

---

## 1. Purpose

This document captures:

1. An examination of the current extension architecture and improvement opportunities.
2. Live probing of [fencingtracker.com](https://fencingtracker.com) as of 2026-07-10.
3. Concrete recommendations for adapting scrapers/parsers to the redesigned site.
4. A suggested implementation plan (for a later PR; not executed here).

---

## 2. Extension Snapshot (Current Repo)

### 2.1 What it does

Chrome/Edge/Brave MV3 extension that:

- Right-click selected text → **Lookup Fencer on FencingTracker**
- Searches fencingtracker.com, shows multi-match picker or profile modal
- Displays club/country/birth year, multi-weapon DE/Pool strength, win/loss
- Stars/tracks fencers (local `chrome.storage.local`) with popup entry point

### 2.2 Architecture (working model)

```
User selection
    → context menu (background.js)
    → content.js modal (loading)
    → callBackgroundApi → service worker
         → search / getProfile / getStrength / getHistory
         → fetch + 24h chrome.storage.local cache
    → content.js parses HTML (DOMParser) and renders UI
```

| Layer | Files | Role |
| --- | --- | --- |
| Manifest | `manifest.json` | MV3, host perm `https://fencingtracker.com/*`, content scripts on `<all_urls>` |
| Service worker | `background.js` + `src/**` via `importScripts` | Network, cache, context menu, message bridge |
| Content / UI | `content.js`, `modal.css` | Modal, HTML parsers, tracked list |
| Popup | `popup.html`, `popup.js` | Opens tracked list on active tab |
| API clients | `src/api/{search,profile,strength,history}.js` | Fetch only (HTML or JSON); no DOM in SW |
| Utils | `src/utils/normalize.js`, `src/cache/cache.js` | Name variants, slugs, TTL cache |

**Important split:** Background fetches raw HTML; content script parses with `DOMParser`. Parser logic is **duplicated** in both `content.js` and `src/api/*.js` (the `src` parsers are largely legacy / unused at runtime because the SW has no DOM).

### 2.3 Endpoints the extension assumes

| Capability | Method / URL | Expected shape |
| --- | --- | --- |
| Search | `POST /search` JSON `{"query","limit"}` | `[{usfa_id, name, club}]` |
| Profile | `GET /p/{id}/{slug}` | Bootstrap card header selectors |
| Strength | `GET /p/{id}/{slug}/strength` | `table.table-striped` weapon/type/strength/range + `const series` |
| History | `GET /p/{id}/{slug}/history` | Win/Loss table with Victories/Losses + “All time” |

Documented originally in `comms/research/fencingtracker.md` (Oct 2025 research era).

---

## 3. Live Site Probe (2026-07-10)

Probed with HTTP/1.1 + browser User-Agent (HTTP/2 from this environment was flaky). Sample athletes:

- Yosef Ali — `/p/100522249/Yosef-Ali`
- Lee Kiefer — `/p/100050305/Lee-Kiefer`

### 3.1 What still works

| Area | Status | Notes |
| --- | --- | --- |
| `POST /search` | ✅ Same contract | Returns `[{club, name, usfa_id}]`. Site JS (`/js/search.min.js`) still uses this for typeahead. Profile URL built as `/p/${usfa_id}/${name}` where `name` is hyphenated (e.g. `Lee-Kiefer`). |
| Profile URL scheme | ✅ Unchanged | `/p/{usfa_id}/{slug}` still valid (HTTP 200). |
| Strength URL | ✅ Unchanged | `/p/{id}/{slug}/strength` HTTP 200. |
| History URL | ✅ Unchanged | `/p/{id}/{slug}/history` HTTP 200 (often **large**: ~400KB–600KB+). |
| Tabs | ✅ Renamed labels only | Summary \| History \| Strength (still same paths). |
| Strength summary table | ✅ Mostly compatible | Still `table.table-striped`; columns Weapon, Type, Strength, Estimate Range*, Min, Max. Type labels: **Pool** / **Direct elimination**. |
| Strength `const series` | ✅ Compatible | Still `{ E/F/S: { P: [{x,y}…], D: […] } }` Elo-style time series. |
| History win/loss table | ✅ Compatible | Still has Victories / Losses / ratios and **All time** column. Content-based table discovery should still work. |
| Flag icons | ✅ Compatible | `.flag-icon` with `title="USA"` etc. |
| Club links | ✅ Path style same | `/club/{id}/{slug}/ratings` — full club name in link text. |

### 3.2 What changed (breaking / important)

#### A. Profile page markup redesign (BREAKING for profile parser)

Old selectors (from research + `parseProfileHtml`):

```text
div.card-header h1.fw-bold          → name
div.card-header h3.text-dark-emphasis → birth year
div.card-header a[href^="/club/"]   → club
.flag-icon[title]                   → country
```

**None of the card-header selectors exist anymore** (`card-header`, `fw-bold`, `text-dark-emphasis` counts = 0 on live pages).

New hero structure (simplified):

```html
<section class="ranking-hero person-hero">
  <p class="ranking-eyebrow">Statistics Profile</p>
  <div class="person-hero__headline">
    <div class="person-hero__identity">
      <h1>Lee Kiefer</h1>
      <span class="flag-icon flag-icon-us … person-hero__flag" title="USA"></span>
      <!-- optional: person-hero__olympian-rings -->
    </div>
    <div class="person-hero__birth-year">1994</div>
  </div>
  <div class="person-hero__clubs">
    <a class="person-hero__club-link" href="/club/…">Bluegrass Fencers' Club</a>
  </div>
  …
</section>
```

**Impact of current parser on live HTML:**

| Field | Current behavior |
| --- | --- |
| Name | Falls back to slug → often OK but less accurate (hyphen/case/nickname issues) |
| Birth year | **Always null** |
| Club | **Always null** |
| Country | Still works via `.flag-icon` |

Default profile body also changed: rating history, podium finishes, results tables — not a Bootstrap “summary card”. Tab `/summary` returns **404** (summary is the bare profile URL).

#### B. Strength scale / presentation (non-breaking for parse, UX impact)

- Strength values are **Elo-like integers** (examples: mid-level saber DE ~1750; elite foil DE ~5181). Homepage marketing copy shows values like **2874**.
- Type column text is full **“Direct elimination”** (parser already maps non-pool → `de`).
- Extra columns Min/Max present; existing parser only needs first four columns — still fine.
- Weapon pills `#weapon_pill_*` / `switchWeapon()` **removed**; UI uses `data-strength-weapon`, `data-strength-series`, `data-strength-range` attributes.
- New “Matchup against me” panel (auth-gated) — ignore for extension.
- Chart UX modernized; series object remains the reliable machine-readable history.

#### C. History page weight (performance / politeness)

- Yosef Ali history ≈ **611 KB**; Lee Kiefer ≈ **398 KB**.
- Extension currently downloads the **entire** history page solely to read the win/loss summary table at the top.
- Functionally works, but is wasteful, slow, and harder on fencingtracker.com.

#### D. Search HTML page

- Full-page search (`GET /search?s=…`) still exists; typeahead remains `POST /search`.
- Extension already prefers POST — **no change required** for search path.
- HTML table fallback documented in old research is lower priority if POST stays stable.

#### E. Site chrome / product surface

- Broader product: strength rankings (`/strength/ME/D`), national points, clubs, Discord, claim-profile signup.
- Still Bootstrap 5 + server-rendered pages (not a pure SPA) — HTML scraping remains viable.
- No public JSON API found for profile/strength (`/api/...` → 404). Scraping HTML remains the only public path.

### 3.3 Parser simulation summary (2026-07-10)

| Parser | Live result |
| --- | --- |
| Profile (old selectors) | Name via slug fallback; **club/birthYear missing** |
| Profile (new selectors) | Name, birth year, club, country correct |
| Strength (current) | Correct weapons + DE/Pool numbers |
| History (current) | Correct all-time W/L for samples |

**Conclusion:** Ship-critical fix is **profile selectors**. Strength/history are largely OK but should be hardened and slimmed.

---

## 4. Proposed App Updates (Site Adaptation)

### 4.1 Priority 0 — Restore profile parsing

Update `parseProfileHtml` in **`content.js`** (and mirror in `src/api/profile.js` if retained for parity):

| Field | Preferred selector | Fallback |
| --- | --- | --- |
| Name | `.person-hero__identity h1` | first `h1` in `.person-page` / `.person-shell`, then slug |
| Birth year | `.person-hero__birth-year` | regex `\b(19\|20)\d{2}\b` near hero |
| Club | `a.person-hero__club-link` | any `a[href^="/club/"]` in `.person-hero` |
| Country | `.person-hero__flag[title]` | `.flag-icon[title]` |
| Optional | `.person-hero__olympian-rings` | expose `isOlympian: true` later |

Keep parsers defensive: site will redesign again.

### 4.2 Priority 1 — Harden strength parsing

- Prefer scoped table: `table.person-strength__summary-table` (or first table under “Current strength”).
- Avoid scraping the “Matchup against me” table (also striped).
- Treat type cell as:
  - contains `pool` → `pool`
  - else → `de` (covers “DE”, “Direct elimination”, etc.)
- Optionally capture Min/Max columns.
- UI: strength values are large integers — ensure formatting (thousands separators optional), and that tracked-list chips remain readable.
- Consider showing estimate range in tooltip/secondary text.

### 4.3 Priority 2 — Slim history fetch

Options (pick one in implementation):

1. **Regex / partial parse without full DOM** on first ~N KB if server streams top-first (fragile).
2. **Parse only the first win/loss table** after download but **stop walking** further tables (CPU win only).
3. **Defer history** until user expands “Record” (latency win; biggest UX change).
4. Long-term: if fencingtracker ever exposes a stats fragment/API, switch to it.

Also: cache history aggressively; avoid refetch when only profile/strength needed for tracked-list refresh.

### 4.4 Priority 3 — Search robustness

- Keep `POST /search`; map `usfa_id` → `id`, `name` → display + slug source (already mostly done).
- Confirm slug construction matches site: profile links use **raw search `name`** as path segment (`Lee-Kiefer`), not a re-slugified “Lee Kiefer”. Prefer storing search `name` as slug when present.
- Retain name-variant fallbacks in `normalize.js` (still valuable for “Last, First”, nicknames, all-caps surnames from fencingtimelive).

### 4.5 Priority 4 — Fixture-based regression tests

Add saved HTML fixtures under e.g. `test/fixtures/fencingtracker/`:

- `profile-yosef-ali.html`, `strength-lee-kiefer.html`, `history-winloss-snippet.html`
- Unit tests for parsers (Node + jsdom, or browser test harness)

Today only `src/utils/normalize.spec.js` exists; parsers have no automated coverage — primary regression risk.

### 4.6 Update research notes

Refresh `comms/research/fencingtracker.md` to match this document after implementation so future agents do not re-learn the old card-header selectors.

---

## 5. Broader Extension Improvements (Independent of Site)

These are quality / maintainability items observed while reviewing the repo. Ordered roughly by value.

### 5.1 Code structure

| Issue | Proposal |
| --- | --- |
| `content.js` is ~1.8k+ lines (parsers + UI + storage + tracked list) | Split into modules if build step added; or at least isolate parsers into a shared file injected into content script |
| Duplicate parsers in `content.js` and `src/api/*` | Single source of truth for parse functions; SW only fetches |
| `importScripts` multi-file SW | Fine for now; optional future bundler (esbuild) for tree-shaking and shared modules |
| ROADMAP still says Phase 3.5 “in progress” | Docs drift — mark CORS refactor complete (it is) |

### 5.2 Reliability & ops

- **Cache invalidation after site change:** bump cache key prefix (e.g. `profile:v2:`) so stale HTML from old markup is not served for 24h.
- **Structured errors:** distinguish network / 404 / parse-empty so UI can say “Profile layout changed” vs “No match”.
- **Rate limiting:** keep 429 backoff; optionally serialize multi-fencer bulk actions.
- **User-Agent / Accept headers:** set explicit `Accept: text/html` / `application/json` on fetches for clarity.

### 5.3 Performance

- Parallel fetch is already good (`Promise.all` profile/strength/history).
- History payload is the main cost — see §4.3.
- Consider not fetching history when rendering multi-result list.
- Tracked list open should not re-download all strength pages every time if cache warm.

### 5.4 UX / product

- Keyboard accessibility audit (already on `NEXT_STEPS.md`).
- Popup is minimal (only “View Tracked”); could show count badge, quick search, last lookup.
- Display **USFA rating history** (E25, etc.) from summary profile tables as optional enrichment (new site surface).
- Link out more clearly: Strength tab / History tab deep links.
- Empty/error states: if parse returns empty weapons but page loaded, show “Could not parse strength; open on FencingTracker” with deep link.

### 5.5 Platform / packaging

- Manifest `content_scripts.matches: ["<all_urls>"]` is broad; works with injection fallback — document why (selection on any site).
- Firefox: README claims support; verify `browser` namespace / MV3 differences before marketing.
- Version bump to `0.3.0` when site adapters land.
- Add simple CI: run normalize tests + parser fixture tests on PR.

### 5.6 Privacy / ethics

- Continue polite scraping (caching, no bulk crawl).
- Do not automate claim-profile or authenticated matchup features.
- Keep all tracked data local-only (already true).

---

## 6. Suggested Implementation Plan (Later — Not Done Here)

Work in branch `update/fencingtracker-site-refresh`.

### PR / commit sequence (suggested)

1. **Docs** — this file + short pointer from `README.md` / `comms/research/fencingtracker.md` *(this change)*.
2. **Cache namespace bump** — avoid serving pre-redesign HTML.
3. **Profile parser update** — new hero selectors + fallbacks; manual smoke on 3–5 athletes.
4. **Strength parser hardening** — scope to summary table; optional range/min/max.
5. **History optimization** — at least avoid unnecessary work; ideally defer or truncate strategy.
6. **Fixtures + tests** — freeze sample HTML; prevent silent breakage.
7. **UI polish for new strength scale** — formatting, labels (“Strength” still accurate).
8. **Version / packaging** — `0.3.0`, refresh screenshots if modal copy changes, run `scripts/package-extension.sh`.

### Manual smoke checklist

- [ ] Search: `Lee Kiefer`, `Lee, Kiefer`, `Yosef Ali`, comma names, nickname forms
- [ ] Single match opens profile with **club + birth year**
- [ ] Multi-weapon fencer shows correct DE/Pool per weapon
- [ ] Win/loss all-time non-zero when site has data
- [ ] Star / unstar / clear tracked list
- [ ] Popup → tracked list on normal https page
- [ ] Restricted page (`chrome://`) fails gracefully
- [ ] Service worker loads `importScripts` without error after package zip install

### Out of scope for first adaptation PR

- Matchup calculator / login
- Strength ranking leaderboards
- National points browser
- Full SPA rewrite or unofficial private APIs

---

## 7. Risk Register

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Another markup redesign | High over time | Fixtures + loose selectors + deep-link fallback |
| History pages grow further | Medium | Defer fetch / cache / partial parse |
| Search API auth/rate limits | Low–medium | Cache, backoff, clear user messaging |
| Elo scale confuses users used to old numbers | Medium | Brief label/tooltip (“FencingTracker strength rating”) |
| Duplicate parser drift | Medium | One shared parse module |

---

## 8. Appendix — Live Examples (2026-07-10)

### Search

```http
POST https://fencingtracker.com/search
Content-Type: application/json

{"query":"Lee Kiefer","limit":10}
```

```json
[{"club":"BluegrassFC","name":"Lee-Kiefer","usfa_id":100050305}]
```

### Strength summary (Lee Kiefer)

| Weapon | Type | Strength | Estimate Range |
| --- | --- | --- | --- |
| Foil | Pool | 4373 | 3896 – 4849 |
| Foil | Direct elimination | 5181 | 4846 – 5515 |

### History all-time (samples via current-style parse)

| Fencer | W | L | Bouts |
| --- | --- | --- | --- |
| Yosef Ali | 63 | 82 | 145 |
| Lee Kiefer | 93 | 2 | 95 |

*(History totals reflect what fencingtracker publishes in the summary table, not a guarantee of complete career coverage.)*

### New CSS hooks to prefer

```text
.person-page / .person-shell / .person-hero
.person-hero__identity h1
.person-hero__birth-year
.person-hero__club-link
.person-hero__flag
.person-strength__summary-table
[data-strength-weapon] / [data-strength-series] / [data-strength-range]
```

---

## 9. Decision Log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Code changes in this pass? | **No** | User requested research + branch + documentation only |
| Branch name | `update/fencingtracker-site-refresh` | Clear purpose for site-driven refresh |
| Continue HTML scrape vs wait for API | Continue scrape | No public JSON API; site still SSR |
| First code fix when coding starts | Profile selectors | Only fully broken critical path |

---

*When implementation begins, treat this document as the source of truth until `comms/research/fencingtracker.md` is rewritten to match.*
