# Tech Advisory: Critical CORS Refactor Required

**Date:** 2025-10-09
**Author:** TECHADVISOR
**Status:** High Priority / Blocker

## 1. Summary

A critical architectural issue has been identified that will prevent the Fencer Strength extension from functioning. All cross-origin network requests (e.g., to `fencingtracker.com`) are currently being made from a content script, which will be blocked by the browser's Cross-Origin Resource Sharing (CORS) policy.

This is not a potential risk; it is a guaranteed failure point. The core functionality of the extension will not work as currently implemented.

This report outlines the issue and the required refactoring steps.

## 2. The Problem

The extension's API calls to fetch fencer data are initiated from `content.js`.

- **File:** `content.js` (Line 55) calls `searchFencers(query)`.
- **File:** `src/api/search.js` defines `searchFencers`, which uses `fetch` to make a `POST` request to `https://fencingtracker.com/search`.

Because `content.js` is injected into arbitrary web pages (e.g., `google.com`), this `fetch` call is a cross-origin request from that page's origin to `fencingtracker.com`. Without explicit permission from `fencingtracker.com` via CORS headers (e.g., `Access-Control-Allow-Origin: *`), the browser will block the request. It is unsafe to assume these permissive headers exist.

## 3. The Solution

The standard and correct architecture for Chrome extensions is to perform all cross-origin requests from the background service worker, which is not subject to the same CORS restrictions. Communication between the content script and the background script must be handled via message passing.

The following three-step refactoring is required.

### Step 1: Isolate Scripts in `manifest.json`

The `manifest.json` file currently injects all API-related scripts into every web page, which is incorrect and inefficient. It must be modified to only inject `content.js`.

**File:** `manifest.json`
**Change:** Modify the `content_scripts.js` array.

**Current:**
```json
"js": [
  "src/config/base-url.js",
  "src/cache/cache.js",
  "src/utils/normalize.js",
  "src/api/search.js",
  "src/api/profile.js",
  "src/api/strength.js",
  "src/api/history.js",
  "content.js"
]
```

**Required:**
```json
"js": [
  "content.js"
]
```

### Step 2: Move API Logic to Background Script

The background script must be updated to import the API scripts and handle requests from the content script.

**File:** `background.js`
**Changes:**

1.  **Import API Scripts:** At the top of the file, use `importScripts` to load all necessary helper and API files.
    ```javascript
    importScripts(
      'src/config/base-url.js',
      'src/cache/cache.js',
      'src/utils/normalize.js',
      'src/api/search.js',
      'src/api/profile.js',
      'src/api/strength.js',
      'src/api/history.js'
    );
    ```

2.  **Create an API Message Router:** Add a new message listener to handle API calls. This listener will call the corresponding API function and return the result asynchronously.

    ```javascript
    // Example API router
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'callApi') {
        const { functionName, args } = message.payload;
        
        // Find the function (e.g., searchFencers, getProfile)
        const apiFunction = self[functionName]; 

        if (typeof apiFunction === 'function') {
          // Call the function and send the response when the promise resolves
          apiFunction(...args)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        } else {
          sendResponse({ success: false, error: `Function ${functionName} not found.` });
        }
        
        // Return true to indicate an async response
        return true; 
      }
      // ... handle other message types
    });
    ```
    *(Note: This is a conceptual example. The existing `onMessage` listener will need to be integrated or expanded).*

### Step 3: Refactor Content Script to Use Message Passing

The content script must be updated to delegate API calls to the background script.

**File:** `content.js`
**Changes:**

1.  **Create a Background API Client:** Create a helper function that sends a message to the background script and waits for the response.

    ```javascript
    function callBackgroundAPI(functionName, ...args) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'callApi',
          payload: { functionName, args }
        }, response => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || 'Unknown background script error.'));
          }
        });
      });
    }
    ```

2.  **Replace Direct API Calls:** Replace all instances of direct API calls with the new helper.

    **Current:**
    ```javascript
    const searchResults = await searchFencers(query);
    ```
    **Required:**
    ```javascript
    const searchResults = await callBackgroundAPI('searchFencers', query);
    ```
    This change will need to be applied to `searchFencers`, `getProfile`, `getStrength`, and `getHistory` calls within `content.js`.

## 4. Conclusion

This refactor is not optional. It is a required fix to make the extension's core feature work as intended. Prioritizing this change will prevent a major, guaranteed failure upon release.
