# Development Guide

This guide provides technical details for contributors working on the
Fencer Strength Chrome Extension.

## Project Layout

```
fencer-strength/
├── manifest.json              # Extension configuration
├── background.js              # Service worker (core logic, network requests)
├── content.js                 # Content script (UI rendering and user interaction)
├── modal.css                  # Modal styling
├── src/                       # Modules used by the background service worker
│   ├── api/                   # API clients for fencingtracker.com
│   ├── cache/                 # Caching layer
│   └── utils/                 # Helper utilities
...
```

*(Note: The `src` directory contains modules used by `background.js`. The content script communicates with the service worker to access their functionality; it does not use them directly.)*

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
1. Open the service worker's DevTools (from `chrome://extensions/`).
2. Go to the **Network** tab inside the service worker's DevTools.
3. Trigger a fencer lookup from a webpage.
4. The requests made by the service worker to `fencingtracker.com` will be visible here.

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
