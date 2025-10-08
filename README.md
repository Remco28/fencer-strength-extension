# Fencer Strength Chrome Extension

A Chrome extension that allows users to quickly look up fencer strength ratings from FencingTracker.com using a context menu.

## Current Status: Phase 3 - Live Data Integration

The extension now fetches real data from fencingtracker.com with intelligent caching to minimize network requests and respect rate limits.

## Features

- **Context menu integration**: Right-click on selected text to look up fencer information
- **Live data**: Retrieves real-time fencer profiles, strength ratings, and bout statistics from FencingTracker.com
- **Smart caching**: 24-hour cache reduces redundant API calls and improves response times
- **Query normalization**: Handles different name formats ("First Last", "Last, First")
- **Multi-weapon support**: View DE and Pool strength ratings for epee, foil, and saber
- **Bout statistics**: Displays total bouts, wins, and losses when available
- **Resilient error handling**: Gracefully handles network issues, missing data, and rate limits

## Installation (Development Mode)

1. **Clone or download this repository** to your local machine

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer Mode** using the toggle in the top-right corner

4. **Click "Load unpacked"** and select the `fencer-strength` directory

5. The extension should now appear in your extensions list with a blue icon

## Usage

### Basic Lookup Flow

1. **Select text** on any webpage (e.g., a fencer's name like "Lee Kiefer")
2. **Right-click** to open the context menu
3. **Click "Lookup Fencer on FencingTracker"**
4. A modal will appear showing the results

### Search Behavior

- **Single match**: Goes directly to the fencer's profile
- **Multiple matches**: Shows a selection list to choose from
- **No matches**: Displays a helpful error message
- **Name variants**: Automatically tries different formats (e.g., "John Doe" → "Doe, John")

### Profile Information

The extension displays:

- **Fencer name** and basic info (club, country, birth year)
- **Bout statistics**: Total bouts with win/loss breakdown
- **Strength ratings** per weapon:
  - **DE (Direct Elimination)** strength value with optional range
  - **Pool** strength value with optional range
- Multi-weapon fencers show separate cards for each weapon

## Testing with Real Data

Try these known fencers to test the extension:

- **Lee Kiefer** - Olympic gold medalist (foil)
- **Mariel Zagunis** - Multiple Olympic medals (saber)
- Search for common names to test the multi-result selection flow

## Caching & Performance

- **Cache duration**: 24 hours (configurable)
- **Cache keys**: Search queries, profiles, strength data, and history are cached independently
- **Automatic cleanup**: Expired cache entries are purged opportunistically
- **Respects rate limits**: Built-in retry logic with exponential backoff for 429 responses

### Clearing Cache

To manually clear the cache:

1. Open Chrome DevTools on any page (F12)
2. Go to the Console tab
3. Run: `chrome.storage.local.clear()`

## Project Structure

```
fencer-strength/
├── manifest.json              # Extension configuration
├── background.js              # Service worker (context menu handler)
├── content.js                 # Content script (modal UI and orchestration)
├── modal.css                  # Modal styling
├── src/
│   ├── api/
│   │   ├── search.js         # Search API with variant fallback
│   │   ├── profile.js        # Profile HTML parser
│   │   ├── strength.js       # Strength table parser
│   │   └── history.js        # Win/loss statistics parser
│   ├── cache/
│   │   └── cache.js          # TTL-based caching layer
│   └── utils/
│       └── normalize.js      # Query/name normalization utilities
├── icons/                     # Extension icons
└── README.md                  # This file
```

## Error Handling

The extension handles various error conditions:

- **Network errors**: "Unable to reach fencingtracker.com"
- **Rate limiting**: "Too many requests. Please wait..."
- **No results**: "No fencers found matching your search"
- **Missing data**: Shows "No strength data available" when appropriate
- **404 errors**: Attempts slug regeneration before failing

## Development

### Debugging

1. **Service Worker Logs**: Go to `chrome://extensions/` and click "service worker"
2. **Content Script Logs**: Open DevTools on any page and check the Console
3. **Network Monitoring**: Use DevTools Network tab to see API calls
4. **Cache Inspection**: Run `chrome.storage.local.get(null)` in Console

### Making Changes

After modifying any files:

1. Save your changes
2. Go to `chrome://extensions/`
3. Click the refresh icon for the Fencer Strength extension
4. Test your changes by selecting text and using the context menu

### Rate Limit Guidelines

- Extension includes automatic retry with 2-second backoff
- Cache minimizes redundant requests (24-hour TTL)
- Respects `fencingtracker.com` CORS headers
- Consider adding delays between sequential lookups during testing

## Known Limitations

- Currently displays domestic strength only (international ratings not yet parsed)
- Placeholder icons (solid blue squares) - custom icons in future phases
- Basic styling - polish and animations planned for Phase 4
- No offline mode - requires active internet connection

## Next Steps

- **Phase 4**: UI/UX polish, animations, accessibility improvements
- **Phase 5**: Testing automation, documentation updates, deployment prep

## Support

For issues or questions, refer to the project documentation in the `comms/` directory or check the research notes in `comms/research/fencingtracker.md`.

## Technical Notes

- Built for Chrome Manifest V3
- Uses `chrome.storage.local` for persistent caching
- No external dependencies or build process required
- Content scripts use vanilla JavaScript with DOMParser for HTML parsing
