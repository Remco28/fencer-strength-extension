# Final Steps to Ship

## Priority 1: Core Functionality & Shipping
- [x] **Implement Tracked Fencer Management:**
  - [x] Add ability to delete individual tracked fencers.
  - [x] Add a "Clear All" button with confirmation.
- [x] **Package for Distribution:** Created `scripts/package-extension.sh` to generate `dist/fencer-strength-extension.zip` with all required files including `src/` helper modules. Added installation instructions to `README.md` and defensive error handling to `background.js` for missing dependencies.

## Priority 2: Pre-Launch Polish
- [ ] **Audit Keyboard Accessibility:** Perform a full audit of the keyboard navigation and focus management in the modal to ensure the extension is usable without a mouse.
- [ ] **Document Key Test Scenarios:** Briefly document the main test cases (e.g., comma-names, nickname slugs, tracked list management) in `docs/testing-guide.md` to help with future maintenance.

## Deferred
- UI/UX Polish (Animations, icons, etc.)
- Advanced tracked list features (sorting, pinning)
- Search result pagination
- Detailed UX notes for documentation

---
*Tech Advisor Note: This list has been reprioritized to focus on shipping a stable, functional extension.*
