# Next Steps for Fencer Strength Chrome Extension

## BLOCKER: Slug Fallback Reliability
- [x] For Frank: go through a list of names and check to see if they work or not. Let's create a checklist of edge case names. I'll generate an HTML file with them for testing purposes. How about an interactive one with checkboxes!?  
- [x] Reproduce the remaining nickname/parenthesis failures (start with the cases observed today) and document the exact inputs/expected slugs.
- [x] Extend `createSlug`/`buildSlugFromName` coverage so fallback slugs always mirror fencingtracker’s canonical form (watch for names with suffixes, multi-word nicknames, and mixed comma formats).
- [x] Add a lightweight unit harness (Node script or tests) that exercises the regression cases before refactoring further.
- [x] Validate end-to-end by loading the extension and confirming no 404 retries in the background console for the tracked edge cases.

## Priority 1: Ship It
- [ ] **Package for Distribution:** Create a `.zip` file of the extension and add clear, step-by-step installation instructions to `README.md` for manual installation.
- [ ] **Audit Keyboard Accessibility:** Perform a full audit of the keyboard navigation and focus management in the modal. Fix all identified issues to ensure the extension is usable without a mouse.

## Priority 2: Stability
- [ ] **Capture Regression Tests:** Document key test scenarios for the live data functionality to prevent future regressions.

## Deferred (Post-Launch)
- [ ] UI/UX Polish (Animations, visual refinements, iconography).
- [ ] Future Features:
  - [ ] Search result pagination.
  - [ ] Tracked list enhancements:
    - [ ] Add ability to delete individual tracked fencers.
    - [ ] Add a "Clear All" button with confirmation.
    - [ ] Add sorting/pinning options.
- [ ] Draft detailed UX notes for documentation.

---
*Tech Advisor Note: CORS refactor landed on 2025-10-10; remaining items focus on polishing and packaging for release.*
