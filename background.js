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
