# Fencer Strength Chrome Extension

**Instantly look up fencer strength ratings from FencingTracker.com**

A Chrome extension that retrieves real-time fencer profiles, strength
ratings, and bout statistics via a simple context menu.

## Current Focus

Phase 4 – UI Polish & UX (see [ROADMAP.md](ROADMAP.md) for details)

## Features

- **Context menu lookup**: Right-click selected text to search for fencers
- **Live data retrieval**: Real-time profiles and strength ratings from
  FencingTracker.com
- **Smart caching**: 24-hour cache reduces API calls and improves speed
- **Multi-weapon support**: View DE and Pool strength for epee, foil, saber
- **Bout statistics**: Displays win/loss records when available
- **Tracked fencers**: Star fencers to save them in a quick-access list from the toolbar popup
- **Flexible name handling**: Handles various formats including
  `"First Last"`, `"Last, First"`, nicknames, and suffixes

## Get Started

### Installation (Development Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in top-right)
4. Click **"Load unpacked"** and select the `fencer-strength-extension`
   directory
5. Extension appears with a blue icon

### Usage

1. **Select text** on any webpage (e.g., "Lee Kiefer")
2. **Right-click** and choose **"Lookup Fencer on FencingTracker"**
3. View results in the modal:
   - **Single match**: Shows profile directly
   - **Multiple matches**: Displays selection list
   - **No match**: Shows helpful error message

## Documentation

- **[Development Guide](docs/development.md)** - Project structure, debugging,
  reloading after changes
- **[Technical Notes](docs/technical-notes.md)** - Caching behavior, error
  handling, rate limits, platform details
- **[Testing Guide](docs/testing-guide.md)** - Test scenarios, validation
  steps, cache verification
- **[Roadmap](ROADMAP.md)** - Project phases and future plans
- **[Next Steps](NEXT_STEPS.md)** - Current task checklist

## Known Limitations

- Displays domestic strength only (international ratings not yet parsed)
- Placeholder icons (custom icons planned for future phases)
- No offline mode (requires active internet connection)

## Support & Questions

For detailed information, refer to the documentation linked above. Technical
contributors can also check the `comms/` directory for internal planning notes
and research references.

---

**License**: MIT
**Project Status**: Active development
