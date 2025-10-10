# Architecture Overview

This document provides a high-level overview of the Fencer Strength Chrome Extension, its components, and key technical decisions.

## 1. Overview & Purpose

This Chrome extension enables users to quickly look up fencer profiles on fencingtracker.com by right-clicking on selected text (a fencer's name). The extension searches for the fencer, handles single or multiple matches, and displays relevant profile data and strength ratings in a modal popup. The primary goal is to enhance productivity for fencing enthusiasts, coaches, and researchers by providing instant access to public fencer data.

## 2. System Components

The extension follows a standard Manifest V3 architecture, separating privileged operations from UI operations.

### Core Components
- **Service Worker** (`background.js`) – The extension's core engine. It runs in a privileged background context, handling all network requests, managing the context menu, and orchestrating communication.
- **Content Script** (`content.js`) – The UI layer. It is injected into web pages to display the lookup modal and interact with the user. It does **not** perform any direct network requests.

### Supporting Services
- **Storage Cache** (`chrome.storage.local`) – Used as a persistent cache for network responses (search results, profiles, etc.) to improve performance and reduce load on `fencingtracker.com`.

## 3. Process & Data Flow

The architecture is designed around a message-passing model to ensure security and stability, respecting the browser's Same-Origin Policy.

### Process Architecture
```
 User Action (on any webpage)
        |
        v
 [Content Script: content.js] --- (Displays UI, captures input)
        ^
        |  (2. Sends data back)
        |
 [chrome.runtime.sendMessage] --- (1. Sends request for data)
        |
        v
 [Service Worker: background.js] --- (Handles logic)
        |
        v
 [fetch API] <=> [fencingtracker.com] --- (Performs network requests)
        |
        v
 [Cache: chrome.storage.local] --- (Stores/retrieves results)

```

### Core Data Flow: Fencer Lookup
1.  User selects a name on a webpage and clicks the "Lookup Fencer" context menu item.
2.  The **Service Worker** (`background.js`) receives the context menu click event.
3.  It sends a message to the **Content Script** (`content.js`) on that page, containing the selected name.
4.  The **Content Script** receives the message, displays the UI modal in a "loading" state.
5.  The **Content Script** then sends a new message back to the **Service Worker**, requesting it to perform the search.
6.  The **Service Worker** receives the search request, checks the **Storage Cache** for existing results, and if not found, makes a `fetch` call to `fencingtracker.com`.
7.  Once the data is retrieved (from cache or network), the **Service Worker** sends the result back to the **Content Script**.
8.  The **Content Script** receives the data and renders it in the modal for the user.

## 4. Caching Strategy

- **Duration**: 24 hours.
- **Storage**: `chrome.storage.local`.
- **Cache Keys**: A separate key format is used for each data type to prevent collisions:
  - Search queries: `search:<normalized-query>`
  - Profile data: `profile:<slug>`
  - Strength data: `strength:<slug>`
  - History data: `history:<slug>`
- **Cleanup**: Expired cache entries are purged opportunistically during new lookup operations.

## 5. Error Handling & Resilience

The extension is designed to handle various error conditions gracefully.

- **Network Errors**: If `fencingtracker.com` is unreachable, a "Unable to reach..." message is displayed.
- **Rate Limiting (HTTP 429)**: The system performs an automatic retry with a backoff delay. If it fails again, a "Too many requests..." message is shown. The cache is the primary defense against hitting rate limits.
- **Missing Data**: If a fencer profile exists but lacks specific data (like strength ratings), the UI will render "N/A" or a similar message instead of failing.
- **No Results**: If a search query yields no matches, the UI displays a "No fencers found..." message.

## 6. Development Guidelines

- **Boundaries are Key**: The `content.js` script should **never** contain `fetch` calls or directly access `chrome.storage`. All such operations must be delegated to the `background.js` service worker via message passing.
- **Follow Existing Patterns**: The project uses vanilla JavaScript. Continue to follow the established patterns for API calls, caching, and UI manipulation.
- **Keep Flows Cohesive**: Avoid leaking implementation details across the content/background boundary. The content script should only need to know *what* data it needs, not *how* it is fetched.

---
*This document supersedes `docs/technical-notes.md` and the technical sections of `comms/planning.md`.*
