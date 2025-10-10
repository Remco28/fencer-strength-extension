# Fencer Strength Chrome Extension Roadmap

## Phase 1 – Research Wrap-Up (Tech Advisor)
- **Status:** ✅ Complete
- **Goals:** Confirm live endpoints, selectors, and data availability; solidify name-normalization approach.

## Phase 2 – Extension Skeleton (Architect + Developer)
- **Status:** ✅ Complete
- **Goals:** Scaffold Manifest V3 extension with service worker, content script, modal container, and utility modules.

## Phase 3 – Data Integration (Developer)
- **Status:** ⚠️ **Refactor Required**
- **Goals:** Implement real fetch layer, HTML parsing, caching, and defensive retry/backoff logic.
- **Note:** Initial integration is complete, but a critical architectural flaw was discovered. Network requests are made from the content script and will be blocked by browser CORS policy. **This phase is not considered complete until the refactor in Phase 3.5 is done.**

## Phase 3.5 – Critical Refactor (Tech Advisor + Developer)
- **Status:** 🟧 **In Progress / Next Up**
- **Goals:** Correct the architectural flaw by moving all network requests to the background service worker.
- **Deliverables:**
  - `manifest.json` updated to remove API scripts from `content_scripts`.
  - `background.js` updated to handle API calls via message passing.
  - `content.js` updated to delegate API calls to the background script.
- **Exit Criteria:** All `fetch` calls originate from the background script, and the UI correctly displays live data received via messaging.

## Phase 4 – MVP Hardening & Release Prep (Developer)
- **Status:** ⬜ Not Started
- **Goals:** Ensure the extension is stable, accessible, and distributable for a Minimum Viable Product (MVP) release.
- **Deliverables:**
  - A fully keyboard-accessible modal.
  - A `.zip` package for distribution.
  - Updated `README.md` with clear installation instructions.
- **Exit Criteria:** All core functionality is usable with a keyboard; users can successfully install and run the extension from the packaged file.

## Phase 5 – Validation & Handoff (Tech Advisor + Developer)
- **Status:** ⬜ Not Started
- **Goals:** Execute regression checklist, optional automated smoke tests, and documentation updates for handoff/pause readiness.
- **Exit Criteria:** No blocking defects; repo ready for pause or deployment prep.

## Post-MVP Enhancements (Future)
- **UI Polish:** Implement animations, motion, and other visual refinements.
- **Feature Enhancements:**
  - Add pagination or fallback logic for searches with >10 results.
  - Enhance the tracked fencers list (sorting, pinning, etc.).
- **Documentation:** Draft detailed UX notes and guides.