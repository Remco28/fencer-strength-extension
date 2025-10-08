// Content script for Fencer Strength extension
// Injects modal and handles fencer lookup flow with live fencingtracker.com data
// Requires: cache.js, normalize.js, search.js, profile.js, strength.js, history.js

// Modal state
let modalElement = null;
let currentResults = [];
let currentFencer = null;
let currentLookupId = 0; // Track lookup requests to ignore stale responses

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'lookupFencer') {
    handleLookup(message.query);
  }
});

/**
 * Handle fencer lookup from context menu
 * @param {string} query - The search query
 */
async function handleLookup(query) {
  if (!modalElement) {
    createModal();
  }

  // Increment lookup ID to track this request
  currentLookupId++;
  const lookupId = currentLookupId;

  showModal();
  showLoadingState();

  // Purge expired cache entries opportunistically
  purgeExpired().catch(err => console.warn('Cache purge error:', err));

  try {
    const searchResults = await searchFencers(query);

    // Ignore if a newer lookup started
    if (lookupId !== currentLookupId) {
      console.log('Ignoring stale search response');
      return;
    }

    if (!searchResults || searchResults.length === 0) {
      showErrorState('No fencers found matching your search.');
      return;
    }

    // Always update currentResults to reflect the active query
    currentResults = searchResults;

    if (searchResults.length === 1) {
      // Single result - go directly to profile view
      await showProfileView(searchResults[0], lookupId);
    } else {
      // Multiple results - show selection list
      showResultsList(searchResults);
    }
  } catch (error) {
    console.error('Lookup error:', error);

    // Check if network error
    if (error.message.includes('fetch') || error.message.includes('network')) {
      showErrorState('Unable to reach fencingtracker.com. Please check your connection and try again.');
    } else if (error.message.includes('Rate limited')) {
      showErrorState('Too many requests. Please wait a moment and try again.');
    } else {
      showErrorState('An error occurred while searching. Please try again.');
    }
  }
}

/**
 * Create the modal DOM structure
 */
function createModal() {
  modalElement = document.createElement('div');
  modalElement.id = 'fencer-strength-modal';
  modalElement.className = 'fs-modal-overlay';

  modalElement.innerHTML = `
    <div class="fs-modal-container">
      <div class="fs-modal-header">
        <h2 class="fs-modal-title">Fencer Lookup</h2>
        <button class="fs-modal-close" aria-label="Close">×</button>
      </div>
      <div class="fs-modal-body">
        <div class="fs-loading-state fs-hidden">
          <div class="fs-spinner"></div>
          <p>Loading...</p>
        </div>
        <div class="fs-error-state fs-hidden">
          <p class="fs-error-message"></p>
        </div>
        <div class="fs-results-list fs-hidden">
          <p class="fs-results-label">Select a fencer:</p>
          <ul class="fs-results-items"></ul>
        </div>
        <div class="fs-profile-view fs-hidden">
          <button class="fs-back-button">← Back to results</button>
          <div class="fs-profile-info">
            <h3 class="fs-profile-name"></h3>
            <p class="fs-profile-details"></p>
          </div>
          <div class="fs-strength-cards"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalElement);

  // Set up event listeners
  setupModalListeners();
}

/**
 * Set up modal event listeners
 */
function setupModalListeners() {
  // Close button
  const closeButton = modalElement.querySelector('.fs-modal-close');
  closeButton.addEventListener('click', hideModal);

  // Backdrop click
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      hideModal();
    }
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalElement && !modalElement.classList.contains('fs-hidden')) {
      hideModal();
    }
  });

  // Back button (delegates to click handler since it's dynamically shown/hidden)
  modalElement.addEventListener('click', (e) => {
    if (e.target.classList.contains('fs-back-button')) {
      showResultsList(currentResults);
    }
  });
}

/**
 * Show the modal
 */
function showModal() {
  if (modalElement) {
    modalElement.classList.remove('fs-hidden');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Hide the modal
 */
function hideModal() {
  if (modalElement) {
    modalElement.classList.add('fs-hidden');
    document.body.style.overflow = '';
  }
}

/**
 * Show loading state
 */
function showLoadingState() {
  hideAllStates();
  const loadingState = modalElement.querySelector('.fs-loading-state');
  loadingState.classList.remove('fs-hidden');
}

/**
 * Show error state
 * @param {string} message - Error message to display
 */
function showErrorState(message) {
  hideAllStates();
  const errorState = modalElement.querySelector('.fs-error-state');
  const errorMessage = modalElement.querySelector('.fs-error-message');
  errorMessage.textContent = message;
  errorState.classList.remove('fs-hidden');
}

/**
 * Show results list
 * @param {Array} results - Array of search results
 */
function showResultsList(results) {
  hideAllStates();
  const resultsContainer = modalElement.querySelector('.fs-results-list');
  const resultsList = modalElement.querySelector('.fs-results-items');

  // Clear previous results
  resultsList.innerHTML = '';

  // Add each result as a list item
  results.forEach(result => {
    const li = document.createElement('li');
    li.className = 'fs-result-item';
    li.innerHTML = `
      <div class="fs-result-name">${escapeHtml(result.name)}</div>
      <div class="fs-result-info">${escapeHtml(result.club)} • ${escapeHtml(result.country)}</div>
    `;
    li.addEventListener('click', () => showProfileView(result, currentLookupId));
    resultsList.appendChild(li);
  });

  resultsContainer.classList.remove('fs-hidden');
}

/**
 * Show profile view with strength and history data
 * @param {Object} searchResult - Search result with id, name, slug
 * @param {number} lookupId - Lookup ID to track stale requests
 */
async function showProfileView(searchResult, lookupId) {
  showLoadingState();

  try {
    // Fetch all data in parallel
    const [profile, strength, history] = await Promise.all([
      getProfile(searchResult.id, searchResult.slug, searchResult.name).catch(err => {
        console.warn('Profile fetch failed:', err);
        return { ...searchResult, birthYear: null };
      }),
      getStrength(searchResult.id, searchResult.slug).catch(err => {
        console.warn('Strength fetch failed:', err);
        return { weapons: {} };
      }),
      getHistory(searchResult.id, searchResult.slug).catch(err => {
        console.warn('History fetch failed:', err);
        return { wins: 0, losses: 0, bouts: 0 };
      })
    ]);

    // Ignore if a newer lookup started
    if (lookupId !== currentLookupId) {
      console.log('Ignoring stale profile response');
      return;
    }

    currentFencer = profile;

    hideAllStates();
    const profileView = modalElement.querySelector('.fs-profile-view');
    const profileName = modalElement.querySelector('.fs-profile-name');
    const profileDetails = modalElement.querySelector('.fs-profile-details');
    const strengthCards = modalElement.querySelector('.fs-strength-cards');

    // Update profile info
    profileName.textContent = profile.name;

    // Build details line
    const detailsParts = [];
    if (profile.club) detailsParts.push(profile.club);
    if (profile.country) detailsParts.push(profile.country);
    if (profile.birthYear) detailsParts.push(`Born ${profile.birthYear}`);

    // Add win/loss stats if available
    if (history && history.bouts > 0) {
      detailsParts.push(`${history.bouts} bouts (${history.wins}W / ${history.losses}L)`);
    }

    profileDetails.textContent = detailsParts.join(' • ');

    // Clear previous strength cards
    strengthCards.innerHTML = '';

    // Create strength cards for each weapon
    const weapons = Object.keys(strength.weapons || {});
    if (weapons.length === 0) {
      strengthCards.innerHTML = '<p class="fs-no-data">No strength data available</p>';
    } else {
      weapons.forEach(weapon => {
        const weaponData = strength.weapons[weapon];
        const card = document.createElement('div');
        card.className = 'fs-strength-card';

        let strengthHtml = `<h4 class="fs-weapon-name">${capitalizeFirst(weapon)}</h4><div class="fs-strength-data">`;

        // DE strength
        if (weaponData.de) {
          strengthHtml += `
            <div class="fs-strength-item">
              <span class="fs-strength-label">DE:</span>
              <span class="fs-strength-value">${formatStrengthValue(weaponData.de)}</span>
            </div>
          `;
        }

        // Pool strength
        if (weaponData.pool) {
          strengthHtml += `
            <div class="fs-strength-item">
              <span class="fs-strength-label">Pool:</span>
              <span class="fs-strength-value">${formatStrengthValue(weaponData.pool)}</span>
            </div>
          `;
        }

        strengthHtml += '</div>';
        card.innerHTML = strengthHtml;
        strengthCards.appendChild(card);
      });
    }

    // Show back button only if there were multiple results
    const backButton = modalElement.querySelector('.fs-back-button');
    if (currentResults.length > 1) {
      backButton.classList.remove('fs-hidden');
    } else {
      backButton.classList.add('fs-hidden');
    }

    profileView.classList.remove('fs-hidden');
  } catch (error) {
    console.error('Error loading profile:', error);
    showErrorState('Failed to load fencer profile. Please try again.');
  }
}

/**
 * Format strength value for display
 * @param {Object} strengthData - Strength data with value and optional range
 * @returns {string} Formatted string
 */
function formatStrengthValue(strengthData) {
  if (!strengthData) return 'N/A';

  const { value, min, max, range } = strengthData;

  let display = String(value);

  if (min !== undefined && max !== undefined) {
    display += ` (${min}-${max})`;
  } else if (range !== undefined) {
    display += ` (±${range})`;
  }

  return display;
}

/**
 * Hide all modal states
 */
function hideAllStates() {
  const states = [
    '.fs-loading-state',
    '.fs-error-state',
    '.fs-results-list',
    '.fs-profile-view'
  ];

  states.forEach(selector => {
    const element = modalElement.querySelector(selector);
    if (element) {
      element.classList.add('fs-hidden');
    }
  });
}

/**
 * Capitalize first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string}
 */
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
