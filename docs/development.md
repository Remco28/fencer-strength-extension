# Development Guide

This guide provides technical details for contributors working on the
Fencer Strength Chrome Extension.

## Project Layout

```
fencer-strength/
├── manifest.json              # Extension configuration
├── background.js              # Service worker (context menu handler)
├── content.js                 # Content script (modal UI orchestration)
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
├── docs/                      # Documentation
└── comms/                     # Internal project communication
```

## Reloading After Changes

After modifying any files:

1. Save your changes
2. Go to `chrome://extensions/`
3. Click the refresh icon for the Fencer Strength extension
4. Test your changes by selecting text and using the context menu

## Debugging Tips

### Service Worker Logs

To view background script logs:
1. Go to `chrome://extensions/`
2. Find the Fencer Strength extension
3. Click "service worker" link
4. Logs will appear in the DevTools Console

### Content Script Logs

To view content script logs:
1. Open DevTools on any page (F12)
2. Check the Console tab
3. Look for messages prefixed with extension context

### Network Monitoring

To inspect API calls to FencingTracker:
1. Open DevTools on any page (F12)
2. Go to the Network tab
3. Trigger a fencer lookup
4. Filter by domain: `fencingtracker.com`

### Cache Inspection

To view cached data:
1. Open Chrome DevTools Console (F12)
2. Run: `chrome.storage.local.get(null, console.log)`
3. Cached entries will be logged with their keys and values

### Cache Utilities

The `src/cache/cache.js` module provides helper functions:
- `setCache(key, value, ttl)` - Store data with TTL
- `getCache(key)` - Retrieve data (null if expired)
- `clearExpiredCache()` - Clean up expired entries
