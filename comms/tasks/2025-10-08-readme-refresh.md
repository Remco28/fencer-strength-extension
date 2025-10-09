# Spec: README Refresh & Documentation Split

## Objective
Reframe the project’s public-facing `README.md` so it is concise, skimmable on GitHub, and oriented toward new contributors. Relocate deep operational details into focused docs under `docs/` so technical contributors still have complete guidance without overwhelming the README.

## References
- `README.md`
- `project-manifest.md`
- `docs/` (existing templates)
- `comms/roles/ARCHITECT.md`

## Background
The README currently mixes user-facing highlights with in-depth engineering notes (caching internals, debugging steps, rate-limit tactics, etc.). This makes the page long, reduces readability, and hides the primary “why” and “how do I try it” flow. We want the README to feel ready for GitHub visitors while still capturing the knowledge elsewhere.

## Deliverables

### 1. README Cleanup (`README.md`)
- Update the opening to include a short tagline under the title and a one-sentence summary of the extension.
- Replace the “Current Status” block with a succinct “Current Focus: Phase 4 – UI Polish & UX” line that links to `ROADMAP.md`.
- Keep a right-sized “Features” section (4–6 bullets max) that emphasizes user benefits; trim redundant technical phrasing.
- Add a “Get Started” section containing:
  - Development-mode installation (current steps, tightened wording).
  - A quick usage walkthrough (condensed to the essential flow).
- Introduce a “Documentation” section that links to the new docs listed below plus `ROADMAP.md` and `NEXT_STEPS.md`.
- Keep a “Known Limitations” section (trim language, retain key bullets).
- Replace “Support” with a short “Support & Questions” paragraph that directs readers to the documentation folder.
- Remove detailed subsections that will move to the new docs (testing scenarios, caching internals, clearing cache, debugging workflow, error messages, rate-limit guidance, project structure diagram, technical notes). Ensure the README instead links to those docs.
- Optional but encouraged: add a “Project Links” or “Quick Links” list near the top pointing to Docs, Roadmap, and extension manifest/Chrome store placeholder (if available). Avoid adding badges that depend on external services we do not yet use.

### 2. Development Guide (`docs/development.md`)
- Capture the material removed from README that targets contributors: project structure tree, debugging tips (service worker logs, content script logs, network monitoring), instructions for reloading the extension after edits.
- Organize into clear sections: “Project Layout”, “Reloading After Changes”, “Debugging Tips”.
- Mention where to find cache utilities or other helper modules if relevant.

### 3. Technical Notes (`docs/technical-notes.md`)
- Document caching behavior (duration, keys, cleanup strategy), clearing cache instructions, resilience/error handling behaviour, and rate-limit guidance.
- Include a short “Runtime stack” paragraph covering Manifest V3, storage usage, and lack of external dependencies (mirrors the existing “Technical Notes” section).
- Use headings so each topic (“Caching & Performance”, “Clearing the Cache”, “Error Handling & Resilience”, “Rate Limits”, “Platform Notes”) is easy to skim.

### 4. Testing Guide (`docs/testing-guide.md`)
- Move the “Testing with Real Data” section here.
- Expand slightly to include:
  - Example scenarios (single result, multi-result, no result, cache badge verification).
  - Suggested names already listed plus any other high-signal examples you think help validate the UI polish phase.
  - Instructions for verifying error handling by simulating network offline or rate-limit conditions (point back to Technical Notes where applicable).

### 5. Project Manifest Update (`project-manifest.md`)
- Under “Implementation Assets” or another appropriate section, add references to the new docs so contributors can find them quickly.
- Ensure the manifest text stays concise and alphabetical within sections when possible.

## Acceptance Criteria
1. `README.md` reads as a concise GitHub-friendly overview (intro, features, quick start, documentation links, known limitations, support) without the deep-dive technical sections currently present.
2. All detailed operational content removed from the README is captured in the new docs (`docs/development.md`, `docs/technical-notes.md`, `docs/testing-guide.md`) with clear headings and Markdown formatting.
3. Internal links in the README resolve to the new docs and existing roadmap/next-steps files.
4. `project-manifest.md` enumerates the new documentation assets.
5. Language across all new/updated docs follows the project’s plain-language, professional tone.

## Notes for the Developer
- Preserve existing naming conventions (e.g., “Fencer Strength” branding, Phase terminology).
- When adjusting the README, double-check that any relative links point to the correct paths.
- Do not introduce new badges or external images without confirming assets exist in the repo.
- Take care to keep line lengths readable (~80–100 characters) to aid diff reviews.
