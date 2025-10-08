# Next Steps for Fencer Strength Chrome Extension

## Immediate Tasks
- [ ] Confirm fencingtracker.com search endpoint and response format (HTML vs JSON)
- [ ] Capture reliable selectors/fields for profile and strength pages, including stats availability
- [ ] Validate name-order tolerance and define normalization strategy for cache keys
- [ ] Document findings in `comms/research/` for dev handoff

## Future Enhancements
- [ ] Prototype fallback logic if search responses exceed the 10-result cap or paginate
- [ ] Explore leveraging the background service worker for network calls if CORS blocks content script fetches
- [ ] Assess feasibility of a quick-add favorites list within the modal for repeat lookups

## Documentation
- [ ] Update `comms/planning.md` with confirmed endpoints and selectors once verified
- [ ] Draft UX notes covering modal behavior, load states, and accessibility touchpoints
- [ ] Outline testing checklist for name variants, offline handling, and rate-limit scenarios

---

Notes:
- Keep the file in the repository root so the app can fetch it via the GitHub Contents API.
- Use `- [ ]` and `- [x]` checkboxes under headings; the parser recognizes H1–H3 section headers.
