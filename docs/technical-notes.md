# Technical Notes

This document covers the technical architecture and runtime behavior of the
Fencer Strength Chrome Extension.

## Platform Notes

- **Manifest Version**: Chrome Manifest V3
- **Storage**: `chrome.storage.local` for persistent caching
- **Dependencies**: No external libraries or build process required
- **Parsing**: Vanilla JavaScript with DOMParser for HTML parsing
- **CORS**: Respects `fencingtracker.com` CORS headers

## Caching & Performance

### Cache Behavior

- **Duration**: 24 hours (configurable via TTL parameter)
- **Cache Keys**: Separate keys for different data types:
  - Search queries: `search_<normalized-query>`
  - Profile data: `profile_<slug>`
  - Strength data: `strength_<slug>`
  - History data: `history_<slug>`
- **Automatic Cleanup**: Expired cache entries are purged opportunistically
  during new cache operations

### Cache Benefits

- Reduces redundant API calls to FencingTracker
- Improves response times for repeated lookups
- Minimizes load on FencingTracker servers
- Respects rate limits by reducing request volume

## Clearing the Cache

To manually clear all cached data:

1. Open Chrome DevTools on any page (F12)
2. Go to the Console tab
3. Run: `chrome.storage.local.clear()`
4. Confirm in Console: `Promise {<fulfilled>: undefined}`

Alternatively, to clear specific entries:
```javascript
chrome.storage.local.remove(['search_lee-kiefer', 'profile_lee-kiefer']);
```

## Error Handling & Resilience

The extension handles various error conditions gracefully:

### Network Errors
- **Message**: "Unable to reach fencingtracker.com"
- **Cause**: No internet connection or server unreachable
- **Recovery**: User should check network and retry

### Rate Limiting
- **Message**: "Too many requests. Please wait..."
- **Cause**: FencingTracker rate limit exceeded (HTTP 429)
- **Recovery**: Automatic retry with 2-second backoff, up to 3 attempts

### Missing Data
- **Message**: "No strength data available"
- **Cause**: Fencer profile exists but lacks strength ratings
- **Behavior**: Shows profile info without strength cards

### No Results
- **Message**: "No fencers found matching your search"
- **Cause**: Query doesn't match any fencer in database
- **Recovery**: User should try alternative spelling or format

### 404 Errors
- **Behavior**: Attempts slug regeneration with different casing
- **Fallback**: If regeneration fails, shows "Profile not found" error

## Rate Limits

### Built-in Protections

- **Retry Logic**: 2-second exponential backoff for 429/5xx responses
- **Cache Layer**: 24-hour TTL minimizes redundant requests
- **Request Deduplication**: Concurrent requests for same fencer are tracked
  to prevent parallel API calls

### Testing Guidelines

When performing manual testing:
- Add short delays between sequential lookups
- Leverage cache by repeating searches on same fencers
- Clear cache sparingly to avoid excessive API load
- Monitor DevTools Network tab for 429 responses
