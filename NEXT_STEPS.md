# Next Steps for Fencer Strength Chrome Extension

## Immediate Tasks
- [x] Outline Phase 4 UI/UX polish requirements (animations, typography, accessibility touchpoints)
- [x] Inventory modal interaction gaps (keyboard focus, screen reader copy) ahead of Phase 4
- [ ] Capture regression test scenarios from recent live-data work for future automation
- [ ] Draft animation/motion options for modal entrance, card reveals, and selection transitions
- [ ] Audit keyboard/focus flow with the refreshed layout and record follow-up fixes

## Future Enhancements
- [ ] Prototype fallback logic if search responses exceed the 10-result cap or paginate
- [ ] Explore leveraging the background service worker for network calls if CORS blocks content script fetches
- [ ] Assess feasibility of a quick-add favorites list within the modal for repeat lookups

## Documentation
- [x] Update `comms/planning.md` with confirmed endpoints and selectors once verified
- [ ] Draft UX notes covering modal behavior, load states, and accessibility touchpoints
- [ ] Outline testing checklist for name variants, offline handling, and rate-limit scenarios

---

Notes:
- Keep the file in the repository root so the app can fetch it via the GitHub Contents API.
- Use `- [ ]` and `- [x]` checkboxes under headings; the parser recognizes H1–H3 section headers.
