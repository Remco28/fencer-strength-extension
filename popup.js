'use strict';

const viewTrackedButton = document.getElementById('view-tracked');
const statusElement = document.getElementById('popup-status');

if (viewTrackedButton) {
  viewTrackedButton.addEventListener('click', () => {
    openTrackedFencers();
  });
}

/**
 * Send a message to the active tab to display tracked fencers
 */
function openTrackedFencers() {
  if (!viewTrackedButton) {
    return;
  }

  viewTrackedButton.disabled = true;
  setStatus('Opening tracked fencers…');

  chrome.runtime.sendMessage({ action: 'fsShowTrackedFencers' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('popup message failed:', chrome.runtime.lastError);
      setStatus('Unable to reach the background script. Reload the extension and try again.');
      viewTrackedButton.disabled = false;
      return;
    }

    if (response && response.success) {
      setStatus('');
      window.close();
      return;
    }

    const message =
      (response && response.error) ||
      'Please open the extension on a regular web page to view tracked fencers.';
    setStatus(message);
    viewTrackedButton.disabled = false;
  });
}

/**
 * Update popup status text
 * @param {string} message - Status message
 */
function setStatus(message) {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message || '';
}
