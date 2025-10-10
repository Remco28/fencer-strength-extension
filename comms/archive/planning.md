### Chrome Extension Specification: FencingTracker Fencer Lookup

#### 1. Overview and Purpose
This Chrome extension enables users to quickly look up fencing fencer profiles on [fencingtracker.com](https://fencingtracker.com) by right-clicking on selected text (a full name, e.g., "John Doe"). The extension searches for the fencer, handles single or multiple matches, and displays relevant profile data in a modal popup. If multiple results are found, the user selects from a list including name and club. The modal shows key stats, with a link to the full profile. The extension is designed to be fully polished, with smooth animations, error handling, and mindful scraping to respect the site's resources.

**Key Goals:**
- Enhance user productivity for fencing enthusiasts, coaches, or researchers by providing instant access to public fencer data.
- Minimize scraping impact: Limit to user-initiated requests, add delays between fetches, and cache results locally for 24 hours.
- No privacy concerns, as all data is public.

**Target Browser:** Chrome (Manifest V3). No cross-browser compatibility required.

**Assumptions:**
- Selected text is a full name (first + last); no validation for partial names.
- External sources (e.g., fencingtimelive.com) may supply names with uppercase surnames, suffixes, and parenthetical nicknames; normalization utilities should emit workable variants automatically.
- Site structure based on investigation (as of October 8, 2025): Search via client-side JS (likely API endpoint like `/api/search?q={name}`); profiles at `/p/{ID}/{Name}`; strength at `/p/{ID}/{Name}/strength`.
- Developer must inspect the site (e.g., via DevTools Network tab) to confirm API endpoints and HTML selectors, as some content may be JS-rendered.
- Total bouts calculated as wins + losses; if not directly available, sum from profile results table (but prefer direct stat if present).

#### 2. Functional Requirements
##### Core Workflow
1. **Text Selection and Context Menu:**
   - User selects text (e.g., "Pau Chou Esteban") on any webpage.
   - Right-click shows custom menu item: "Lookup Fencer on FencingTracker".
   - If no text selected, menu item is hidden/disabled.

2. **Search Execution:**
   - Capture selected text as query (trim whitespace).
   - Fetch search results from fencingtracker.com (via API or HTML parse).
   - Delay: 500ms before request to simulate human behavior.

3. **Handle Search Results:**
   - **Single Match:** Directly fetch and display profile data in modal.
   - **Multiple Matches (up to 10):** Display selection modal with list of fencers (name + club). User clicks one to fetch/display full data.
   - **No Matches:** Show error modal: "No fencers found for '{query}'. Try a different spelling."
   - Cache results in `chrome.storage.local` (key: `search:{query}`, TTL: 24 hours).

4. **Profile Data Display:**
   - Modal shows:
     - **Name:** Clickable link to full profile (`https://fencingtracker.com/p/{ID}/{Name}`).
     - **Birth Year & Estimated Age:** e.g., "Birth Year: 2005 (Age: ~20)". Age = `new Date().getFullYear() - birthYear`.
     - **Club:** From search/profile.
     - **Strength Ratings:** Direct Elimination (DE) and Pool, per weapon (Foil, Épée, Saber if available). e.g., "Foil DE: 1939 | Foil Pool: 1454".
     - **Total Bouts:** Wins + Losses (e.g., "Total Bouts: 150 (Wins: 85, Losses: 65)").
   - Data fetched from profile (`/p/{ID}/{Name}`) and strength subpage (`/p/{ID}/{Name}/strength`).
   - If data unavailable (e.g., missing birth year), show "N/A" or note "Data not available on profile".

5. **Modal Behavior:**
   - Appears centered, overlaying the page (fixed position, z-index 10000).
   - Size: 400x500px max, responsive to content.
   - Close options: Close (X) button, Esc key, click outside.
   - For selection list: Scrollable list with hover effects; each item clickable.
   - Smooth fade-in/out animations (CSS transitions).

6. **Error Handling:**
   - Network errors, 404s, or rate limits (e.g., 429): Retry once after 2s, then show "Unable to fetch data. Please try again later."
   - Unavailable data: Inline "N/A" in modal fields.
   - Logging: Console logs for debugging (no user-facing errors beyond modals).

##### Non-Functional Requirements
- **Performance:** Requests < 2s total; cache to avoid refetches.
- **Scraping Ethics:** 
  - User-Agent: Mimic Chrome ("Mozilla/5.0 ... Chrome/120.0").
  - Delays: 1-2s between multi-step fetches (search → profile → strength).
  - No bulk scraping; only per-user action.
  - If site adds rate limits, implement exponential backoff (e.g., retry after 5s, 10s).
- **Accessibility:** Basic (no keyboard/screen reader required, per user).
- **Polish:** Clean UI (modern sans-serif font, fencing-themed colors: e.g., #1E3A8A blue accents), loading spinner during fetches.

#### 3. Technical Requirements
##### Manifest.json (V3)
```json
{
  "manifest_version": 3,
  "name": "FencingTracker Lookup",
  "version": "1.0",
  "description": "Right-click names to lookup fencer profiles on FencingTracker.",
  "permissions": ["contextMenus", "activeTab", "storage", "scripting"],
  "host_permissions": ["https://fencingtracker.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": [
        "src/config/base-url.js",
        "src/cache/cache.js",
        "src/utils/normalize.js",
        "src/api/search.js",
        "src/api/profile.js",
        "src/api/strength.js",
        "src/api/history.js",
        "content.js"
      ],
      "css": ["modal.css"]
    }
  ],
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
```
- Icons: Simple fencing sword silhouette (developer to source/create).

##### Background Script (background.js)
- Create context menu: `chrome.contextMenus.create({id: "lookupFencer", title: "Lookup Fencer on FencingTracker", contexts: ["selection"]})`.
- On click: If `info.selectionText`, send message to content script with query.
- If the target tab does not yet have the content scripts, dynamically inject the script/css bundle via `chrome.scripting` before retrying the message, and warn when injection is disallowed (e.g., Chrome Web Store, chrome:// pages).

##### Content Script (content.js)
- Listen for messages from background.
- Fetch data using `fetch()` (with host_permissions).
- Parse HTML responses with `DOMParser`.
- Example Scraping Logic:
  1. **Search:** `fetch('https://fencingtracker.com/search?q=' + encodeURIComponent(query))`.
     - If HTML, parse table: Selectors (from investigation): `table tr` for rows; `a[href^="/p/"]` for name/link (extract ID from href); `td:nth-child(3)` for club.
     - Assume API if JSON (developer inspect: e.g., `/api/fencers/search?q={query}` returning `{results: [{id, name, club, division}]}`).
  2. **Profile:** `fetch('https://fencingtracker.com/p/' + id + '/' + slug)`.
     - Extract: Birth year (e.g., `.profile-info .birth-year` or from table); Club (if not from search); Total bouts/wins/losses (e.g., `.stats-table .total-bouts`; fallback: count rows in `.results-table` if per-bout, but inspect for aggregate).
  3. **Strength:** `fetch('https://fencingtracker.com/p/' + id + '/' + slug + '/strength')`.
     - Parse table: e.g., `table tr td:nth-child(4)` for ratings (Foil DE: row 1 col 4; etc., per investigation).
- Inject modal HTML via `document.body.appendChild()`.
- Cache: Use `chrome.storage.local.set({key: data, timestamp: Date.now()})`; check TTL on fetch.
- Event listeners: Document click for outside close; `keydown` for Esc.

##### UI Components
- **Selection Modal:** `<div id="fencer-select-modal" class="modal"> <h2>Select a fencer</h2> <ul class="fs-results-items"></ul> </div>`. Each item renders name + club/country summary; clicking hydrates the profile view.
- **Profile Modal:** `<div class="fs-profile-view">` hosts a header with a linked name, meta chip grid (club, country, birth year + age), and a bouts highlight card that summarizes wins/losses before showing weapon strength cards.
- Loading: `<div class="spinner">Loading...</div>` during fetches.

##### Styles (modal.css)
- Modal: `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); padding: 20px; max-width: 400px; z-index: 10000; animation: fadeIn 0.3s;`.
- Overlay: Semi-transparent backdrop.
- List: Simple bulleted, hover: `background: #f0f0f0;`.
- Colors: Primary #1E3A8A (blue), text #333, accents #DC2626 (red for close).

#### 4. User Interface and Experience Details
- **Onboarding:** Optional first-run popup: "Right-click selected names to lookup fencers!"
- **Animations:** Fade-in modal (0.3s), slide-down list items.
- **Edge Cases:**
  - Long names/lists: Auto-scroll modal.
  - Mobile: Modal fits viewport (though Chrome extension primary desktop).
- **Testing Scenarios:**
  - Single match: e.g., "Pau Chou Esteban" → Direct modal.
  - Multiple: Common name like "John Smith" → Selection list.
  - No results: Rare name → Error.
  - Offline: "No connection" error.
  - External feed formats: `"XIAO Leon (Ruibo)"`, `"SIMMONS Ariel (Ari) J."` → Confirm normalization variants resolve to live profiles.

#### 5. Security and Privacy Considerations
- No data storage beyond cache (local, user-only).
- Sanitize query (escape for URL); parse HTML safely (no `innerHTML` for user input).
- Permissions minimal: Only `fencingtracker.com` hosts.
- No tracking or external sends.

#### 6. Development and Deployment Notes
- **Tech Stack:** Vanilla JS (no frameworks for lightness); CSS for styling.
- **Investigation Notes:** 
  - Search: Likely API; inspect Network tab on site search for endpoint (e.g., returns JSON with `id`, `name`, `club`).
  - Profile Selectors: Inspect for birth year (e.g., in header or table); bouts (aggregate in stats section or sum events).
  - If JS-heavy, consider headless fetch via extension, but prefer direct `fetch`.
- **Build Steps:** 
  1. Create files per above.
  2. Load unpacked in `chrome://extensions`.
  3. Test on sample pages with known fencers.
  4. Publish to Chrome Web Store (optional).
- **Potential Enhancements (Post-MVP):** Weapon-specific filters, export to CSV.
- **Effort Estimate:** 10-15 hours for experienced dev (scraping inspection: 2h; UI: 4h; logic: 6h; polish: 3h).

This spec provides a complete blueprint. If adjustments are needed (e.g., after dev inspection), provide feedback!
