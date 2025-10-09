// Service worker for Fencer Strength extension
// Manages context menu and message passing to content scripts

// Context menu ID
const CONTEXT_MENU_ID = 'lookup-fencer';

// Assets to inject when content script not yet present
const CONTENT_SCRIPT_FILES = [
  'src/config/base-url.js',
  'src/cache/cache.js',
  'src/utils/normalize.js',
  'src/api/search.js',
  'src/api/profile.js',
  'src/api/strength.js',
  'src/api/history.js',
  'content.js'
];

const CONTENT_STYLE_FILES = ['modal.css'];

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

    const sendMessage = async () => {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'showTrackedFencers' }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(true);
          }
        });
      });
    };

    try {
      await sendMessage();
      return { success: true };
    } catch (error) {
      const hasNoReceiver =
        typeof error.message === 'string' &&
        error.message.includes('Receiving end does not exist');

      if (!hasNoReceiver) {
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

      await sendMessage();
      return { success: true };
    }
  } catch (error) {
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

// Handle popup message requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== 'fsShowTrackedFencers') {
    return;
  }

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
