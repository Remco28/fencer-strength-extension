// Service worker for Fencer Strength extension
// Manages context menu and message passing to content scripts

// Context menu ID
const CONTEXT_MENU_ID = 'lookup-fencer';

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Lookup Fencer on FencingTracker',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
    // Send message to content script with selected text
    chrome.tabs.sendMessage(tab.id, {
      action: 'lookupFencer',
      query: info.selectionText.trim()
    });
  }
});
