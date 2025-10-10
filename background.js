// Service worker for Fencer Strength extension
// Manages context menu and message passing to content scripts

// ============================================================================
// Phase 1: Load API helpers in background context
// ============================================================================
// Import all network/cache helper modules so the background service worker
// can own cross-origin requests in future phases. This phase keeps the
// content script flow intact; Phase 2 will wire message routing to use these.
//
// Loaded modules: base-url config, cache layer, normalization utilities,
// and API functions (search, profile, strength, history).
// ============================================================================

try {
  importScripts(
    'src/config/base-url.js',
    'src/cache/cache.js',
    'src/utils/normalize.js',
    'src/api/search.js',
    'src/api/profile.js',
    'src/api/strength.js',
    'src/api/history.js'
  );
} catch (error) {
  console.error(
    '========================================\n' +
    'Fencer Strength: CRITICAL ERROR\n' +
    '========================================\n' +
    'Failed to load required helper modules from src/ directory.\n' +
    'This usually means the extension was packaged incorrectly.\n\n' +
    'Missing files may include:\n' +
    '  - src/config/base-url.js\n' +
    '  - src/cache/cache.js\n' +
    '  - src/utils/normalize.js\n' +
    '  - src/api/search.js\n' +
    '  - src/api/profile.js\n' +
    '  - src/api/strength.js\n' +
    '  - src/api/history.js\n\n' +
    'If you are developing the extension:\n' +
    '  Run ./scripts/package-extension.sh to create a proper distribution.\n\n' +
    'If you installed from a zip:\n' +
    '  The archive may be incomplete. Please contact the distributor.\n' +
    '========================================\n' +
    'Original error: ' + (error.message || String(error)) + '\n' +
    '========================================'
  );
  // Re-throw to prevent the service worker from registering
  throw error;
}

// ============================================================================
// Namespaced API Surface
// ============================================================================
// Construct a namespaced API object that collects all imported helper functions.
// This will be used in Phase 2 when message routing is wired to the background.
// Validates that all expected functions exist; throws an error if any are missing.
// ============================================================================

/**
 * Validate and construct the background API surface.
 * @returns {Object} API object with search, profile, strength, history, and cache functions
 * @throws {Error} if any required function is missing
 */
function buildBackgroundApi() {
  const requiredFunctions = {
    // Search (JSON, no parsing needed)
    searchFencers: typeof searchFencers === 'function' ? searchFencers : null,

    // Cached HTML getters (background-safe, with 24-hour cache + slug fallback)
    getProfile: typeof getProfile === 'function' ? getProfile : null,
    getStrength: typeof getStrength === 'function' ? getStrength : null,
    getHistory: typeof getHistory === 'function' ? getHistory : null,

    // Cache management
    purgeExpired: typeof purgeExpired === 'function' ? purgeExpired : null,

    // Base URL getter for environment consistency
    getBaseUrl: () => globalThis.FENCINGTRACKER_BASE_URL || 'https://fencingtracker.com'
  };

  const missing = Object.keys(requiredFunctions).filter(key => !requiredFunctions[key]);

  if (missing.length > 0) {
    const error = `Fencer Strength: Failed to load required API functions: ${missing.join(', ')}`;
    console.error(error);
    throw new Error(error);
  }

  console.log('Fencer Strength: Background API loaded successfully with functions:', Object.keys(requiredFunctions));

  return requiredFunctions;
}

/**
 * Retrieve the background API surface.
 * Future phases will call this to access the API functions.
 * @returns {Object} API object with all helper functions
 */
function getBackgroundApi() {
  return self.fsApi;
}

// Build and attach the API surface to the service worker global scope
try {
  self.fsApi = buildBackgroundApi();
} catch (error) {
  console.error('Fencer Strength: Critical error during API initialization. Extension may not function correctly.', error);
}

// Context menu ID
const CONTEXT_MENU_ID = 'lookup-fencer';

// Assets to inject when content script not yet present
const CONTENT_SCRIPT_FILES = ['content.js'];

const CONTENT_STYLE_FILES = ['modal.css'];

const NO_RECEIVER_CODE = 'NO_RECEIVER';
const PORT_CLOSED_MESSAGE = 'The message port closed before a response was received.';

/**
 * Send a message to a tab and normalize common error cases.
 * Treats "message port closed" as a successful delivery (listener is fire-and-forget).
 * @param {number} tabId
 * @param {Object} payload
 * @returns {Promise<void>}
 */
function sendMessageToTab(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, () => {
      const lastError = chrome.runtime.lastError;
      if (!lastError) {
        resolve();
        return;
      }

      const message = String(lastError.message || '');

      if (message.includes(PORT_CLOSED_MESSAGE)) {
        // Listener executed without returning a response; treat as success.
        resolve();
        return;
      }

      if (message.includes('Receiving end does not exist')) {
        const error = new Error(message);
        error.code = NO_RECEIVER_CODE;
        reject(error);
        return;
      }

      reject(new Error(message || 'Unknown messaging error'));
    });
  });
}

/**
 * Handle background API call delegation from content script
 * @param {Object} message - Message with functionName and args
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function handleBackgroundApiCall(message) {
  const { functionName, args } = message;

  if (!functionName || typeof functionName !== 'string') {
    return {
      success: false,
      error: 'Invalid API call: functionName is required.'
    };
  }

  const api = getBackgroundApi();
  if (!api) {
    console.error('Fencer Strength: Background API not initialized.');
    return {
      success: false,
      error: 'Background API not available.'
    };
  }

  const apiFunction = api[functionName];
  if (typeof apiFunction !== 'function') {
    console.error(`Fencer Strength: Unknown API function "${functionName}".`);
    return {
      success: false,
      error: `Unknown API function: ${functionName}`
    };
  }

  try {
    const functionArgs = Array.isArray(args) ? args : [];
    const result = await apiFunction(...functionArgs);
    return {
      success: true,
      data: result
    };
  } catch (error) {
    // Log unexpected errors but don't spam for user-facing errors
    const isUserError =
      error.message.includes('404') ||
      error.message.includes('Not found') ||
      error.message.includes('No fencers');

    if (!isUserError) {
      console.error(`Fencer Strength: API function "${functionName}" failed.`, error);
    }

    return {
      success: false,
      error: error.message || 'API call failed.'
    };
  }
}

/**
 * Handle popup request to show tracked fencers
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handleShowTrackedRequest() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      return { success: false, error: 'No active tab available.' };
    }

    const tabId = tab.id;

    try {
      await sendMessageToTab(tabId, { action: 'showTrackedFencers' });
      return { success: true };
    } catch (error) {
      if (error.code !== NO_RECEIVER_CODE) {
        console.warn('Fencer Strength: failed to reach content script.', error);
        return { success: false, error: 'Unable to reach this page. Try reloading the tab.' };
      }

      const injected = await injectContentScripts(tabId);
      if (!injected) {
        return {
          success: false,
          error: 'This page does not allow the extension to run. Try a standard web page.'
        };
      }

      await sendMessageToTab(tabId, { action: 'showTrackedFencers' });
      return { success: true };
    }
  } catch (error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.includes(PORT_CLOSED_MESSAGE)) {
      // Treat as success – content script handled the request without responding.
      return { success: true };
    }

    console.error('Fencer Strength: unexpected error handling tracked list request.', error);
    return { success: false, error: 'Unexpected error occurred. Please try again.' };
  }
}

/**
 * Attempt to inject content scripts/styles into the active tab.
 * Falls back gracefully if the page does not permit injection.
 * @param {number} tabId
 * @returns {Promise<boolean>} true if injection executed, false otherwise
 */
async function injectContentScripts(tabId) {
  if (!tabId) {
    return false;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: CONTENT_STYLE_FILES
    });
  } catch (error) {
    // CSS injection can fail on restricted pages.
    console.warn('Fencer Strength: unable to inject CSS.', error);
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES
    });
    return true;
  } catch (error) {
    console.warn('Fencer Strength: unable to inject content scripts.', error);
    return false;
  }
}

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Lookup Fencer on FencingTracker',
    contexts: ['selection']
  });
});

// Handle popup message requests and API delegation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return;
  }

  // Handle tracked fencers request
  if (message.action === 'fsShowTrackedFencers') {
    handleShowTrackedRequest()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Fencer Strength: tracked list request failed.', error);
        sendResponse({
          success: false,
          error: 'Unable to open tracked fencers. Reload the page and try again.'
        });
      });

    return true; // Keep the message channel open for async response
  }

  // Handle background API delegation
  if (message.action === 'fsCallBackgroundApi') {
    handleBackgroundApiCall(message)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('Fencer Strength: background API call failed.', error);
        sendResponse({
          success: false,
          error: error.message || 'Background API call failed.'
        });
      });

    return true; // Keep the message channel open for async response
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText || !tab || !tab.id) {
    return;
  }

  const message = {
    action: 'lookupFencer',
    query: info.selectionText.trim()
  };

  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    const hasNoReceiver =
      error &&
      typeof error.message === 'string' &&
      error.message.includes('Receiving end does not exist');

    if (!hasNoReceiver) {
      console.error('Fencer Strength: failed to dispatch lookup message.', error);
      return;
    }

    const injected = await injectContentScripts(tab.id);

    if (!injected) {
      console.warn(
        'Fencer Strength: content script not available on this tab. Reload the page and try again.'
      );
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (retryError) {
      console.error('Fencer Strength: content script injection succeeded but messaging still failed.', retryError);
    }
  }
});
