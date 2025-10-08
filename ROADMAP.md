# Fencer Strength Chrome Extension Roadmap

## Phase 1 – Research Wrap-Up (Tech Advisor)
- **Goals:** Confirm live endpoints, selectors, and data availability; solidify name-normalization approach.
- **Deliverables:** Updated `NEXT_STEPS.md` (all immediate tasks checked), vetted notes in `comms/research/fencingtracker.md`.
- **Exit Criteria:** Endpoint behaviors verified against live site; cache key rules documented; risk log captured (rate limits, selector volatility).

## Phase 2 – Extension Skeleton (Architect + Developer)
- **Goals:** Scaffold Manifest V3 extension with service worker, content script, modal container, and utility modules.
- **Deliverables:** `manifest.json`, `background.js`, `content.js`, `modal.css`, plus placeholder data service returning mocked search/profile payloads.
- **Exit Criteria:** Extension loads via "Load Unpacked" with context menu visible, modal shell injects with mock data, no live network dependencies yet.

## Phase 3 – Data Integration (Developer)
- **Goals:** Implement real fetch layer, HTML parsing, caching, and defensive retry/backoff logic.
- **Deliverables:** Search API client, profile/strength/history parsers, normalization helpers, cache module leveraging `chrome.storage.local`.
- **Exit Criteria:** ✅ Live lookup pipeline completes (search → profile → strength), multi-weapon strengths displayed, cache reused within TTL, graceful errors on 404/429.

## Phase 4 – UI Polish & UX (Designer + Developer)
- **Goals:** Finalize modal styling, selection UX, animations, accessibility considerations, and multi-result handling.
- **Deliverables:** Responsive modal with loading states, scrollable selection list, strength cards showing DE/Pool per weapon, error/empty states, and polished profile header.
- **Progress Highlights:** Linked profile headers with quick stats, total-bout highlight card, and structured name parsing to support external feeds (e.g., FencingTimeLive formats).
- **Next Focus:** Build out motion/animation polish, tighten accessibility (focus management, semantics), and enhance multi-result ergonomics.
- **Exit Criteria:** QA script covering single/multi/no results passes; UI meets design brief with brand colors; keyboard dismissal (Esc/outside click) functional.

## Phase 5 – Validation & Handoff (Tech Advisor + Developer)
- **Goals:** Execute regression checklist, optional automated smoke tests, and documentation updates for handoff/pause readiness.
- **Deliverables:** Test log (manual and automated), updated `comms/planning.md`, lightweight user guide for using the extension, known-issues list.
- **Exit Criteria:** No blocking defects; roadmap items referenced as complete; repo ready for pause or deployment prep.
