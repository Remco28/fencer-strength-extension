// Content script for Fencer Strength extension
// Injects modal and handles fencer lookup flow with live fencingtracker.com data
// All API calls are delegated to the background service worker via message passing

// ============================================================================
// Background API Bridge
// ============================================================================
// Phase 2: All cross-origin requests now execute in the background service worker.
// The content script uses callBackgroundApi to delegate function calls.
// ============================================================================

/**
 * Call a background API function via message passing
 * @param {string} functionName - Name of the API function to call
 * @param {...any} args - Arguments to pass to the function
 * @returns {Promise<any>} Result from the API function
 * @throws {Error} If the call fails or response indicates an error
 */
async function callBackgroundApi(functionName, ...args) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'fsCallBackgroundApi',
        functionName,
        args
      },
      response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message || 'Runtime messaging error'));
          return;
        }

        if (!response) {
          reject(new Error('No response from background API'));
          return;
        }

        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Background API call failed'));
        }
      }
    );
  });
}

// ============================================================================
// HTML Parsers (DOMParser-dependent, must run in content script context)
// ============================================================================
// These functions parse HTML responses from fencingtracker.com using DOMParser.
// They cannot run in the background service worker (no DOM APIs available).
// The background worker fetches raw HTML, and content script parses it here.
// ============================================================================

/**
 * Parse profile HTML
 * @param {string} html - HTML content
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Object} Parsed profile data
 */
function parseProfileHtml(html, id, slug) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Prefer redesigned person-hero layout; fall back to legacy card-header selectors.
  const nameElement =
    doc.querySelector('.person-hero__identity h1') ||
    doc.querySelector('.person-hero h1') ||
    doc.querySelector('div.card-header h1.fw-bold') ||
    doc.querySelector('h1');
  const name = nameElement ? nameElement.textContent.trim() : parseSlug(slug);

  let birthYear = null;
  const birthYearElement =
    doc.querySelector('.person-hero__birth-year') ||
    doc.querySelector('div.card-header h3.text-dark-emphasis');
  if (birthYearElement) {
    const yearText = birthYearElement.textContent.trim();
    const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      birthYear = parseInt(yearMatch[0], 10);
    }
  }

  let club = null;
  const clubElement =
    doc.querySelector('a.person-hero__club-link') ||
    doc.querySelector('.person-hero a[href^="/club/"]') ||
    doc.querySelector('div.card-header a[href^="/club/"]') ||
    doc.querySelector('a[href^="/club/"]');
  if (clubElement) {
    club = clubElement.textContent.trim();
  }

  let country = 'USA';
  const flagElement =
    doc.querySelector('.person-hero__flag') ||
    doc.querySelector('.person-hero .flag-icon') ||
    doc.querySelector('.flag-icon');
  if (flagElement) {
    const title = flagElement.getAttribute('title');
    if (title) {
      country = title.trim();
    }
  }

  return {
    id,
    slug,
    name,
    birthYear,
    club,
    country
  };
}

/**
 * Convert slug back to readable name
 * @param {string} slug - Name slug
 * @returns {string} Readable name
 */
function parseSlug(slug) {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse strength HTML
 * @param {string} html - HTML content
 * @returns {Object} Parsed strength data
 */
function parseStrengthHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const weapons = {};

  // Prefer the dedicated summary table so matchup/teaser tables are ignored.
  let rows = doc.querySelectorAll('table.person-strength__summary-table tbody tr');
  if (!rows.length) {
    rows = doc.querySelectorAll('table.table-striped tbody tr');
  }

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 4) continue;

    const weaponText = cells[0].textContent.trim();
    const weapon = normalizeWeapon(weaponText);
    if (!weapon || weapon === 'unknown') continue;

    const typeText = cells[1].textContent.trim().toLowerCase();
    // Only accept real strength-summary type labels (skip matchup "I win in pool" rows).
    const isPool = typeText === 'pool' || typeText === 'pools';
    const isDe =
      typeText === 'de' ||
      typeText === 'direct elimination' ||
      typeText === 'direct eliminations';
    if (!isPool && !isDe) continue;
    const type = isPool ? 'pool' : 'de';

    const strengthText = cells[2].textContent.trim();
    if (!strengthText || strengthText === '-') continue;
    const strengthValue = parseStrengthValue(strengthText);
    if (strengthValue === '' || strengthValue === null || strengthValue === undefined) {
      continue;
    }

    const rangeText = cells[3].textContent.trim();
    const range = parseStrengthRange(rangeText);

    // Prefer explicit Min/Max columns when present (new site layout).
    if (cells.length >= 6) {
      const minVal = parseInt(cells[4].textContent.trim(), 10);
      const maxVal = parseInt(cells[5].textContent.trim(), 10);
      if (!isNaN(minVal) && !isNaN(maxVal)) {
        range.min = minVal;
        range.max = maxVal;
      }
    }

    if (!weapons[weapon]) {
      weapons[weapon] = {};
    }

    weapons[weapon][type] = {
      value: strengthValue,
      ...range
    };
  }

  const series = parseSeriesData(html);

  return {
    weapons,
    series
  };
}

/**
 * Normalize weapon name
 * @param {string} weapon - Weapon name
 * @returns {string} Normalized weapon name
 */
function normalizeWeapon(weapon) {
  const lower = weapon.toLowerCase().trim();
  if (!lower) return 'unknown';
  if (lower.includes('foil')) return 'foil';
  if (lower.includes('epee') || lower.includes('épée') || lower.includes('pee')) return 'epee';
  if (lower.includes('saber') || lower.includes('sabre')) return 'saber';
  return lower;
}

/**
 * Parse strength value from text
 * @param {string} text - Strength text (e.g., "65", "B2", "U")
 * @returns {string|number} Parsed strength value
 */
function parseStrengthValue(text) {
  const trimmed = text.trim();

  // Try to parse as number
  const numValue = parseInt(trimmed, 10);
  if (!isNaN(numValue)) {
    return numValue;
  }

  // Return as string (e.g., "B2", "U")
  return trimmed;
}

/**
 * Parse strength range from text
 * @param {string} text - Range text (e.g., "60-70", "+/- 5")
 * @returns {Object} Range object with min/max or empty
 */
function parseStrengthRange(text) {
  const trimmed = text.trim();

  if (!trimmed || trimmed === '-') {
    return {};
  }

  // Try to parse "min-max" format
  const rangeMatch = trimmed.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10)
    };
  }

  // Try to parse "+/- n" format
  const plusMinusMatch = trimmed.match(/[+\-\/]+\s*(\d+)/);
  if (plusMinusMatch) {
    const delta = parseInt(plusMinusMatch[1], 10);
    return {
      range: delta
    };
  }

  return { raw: trimmed };
}

/**
 * Parse series data from inline script
 * @param {string} html - HTML content
 * @returns {Object|null} Series data or null
 */
function parseSeriesData(html) {
  // Look for "const series = {...}" in script
  const seriesMatch = html.match(/const\s+series\s*=\s*({[\s\S]*?});/);
  if (!seriesMatch) {
    return null;
  }

  const objectLiteral = seriesMatch[1];

  // Attempt JSON parse first
  try {
    return JSON.parse(objectLiteral);
  } catch (jsonError) {
    // Fall back to a manual parser that can handle unquoted keys and single quotes
    try {
      return parseJsObjectLiteral(objectLiteral);
    } catch (literalError) {
      console.warn('Failed to parse series data:', literalError);
      return null;
    }
  }
}

/**
 * Parse a simple JS object literal without using eval
 * @param {string} literal - Object literal string
 * @returns {any} Parsed value
 */
function parseJsObjectLiteral(literal) {
  // Normalize quotes
  let normalized = literal.replace(/'/g, '"');

  // Quote unquoted keys by inserting double quotes around identifier + colon
  normalized = normalized.replace(/([\s,{])([A-Za-z_][\w]*)\s*:/g, '$1"$2":');

  // Remove trailing commas
  normalized = normalized.replace(/,(\s*[}\]])/g, '$1');

  return JSON.parse(normalized);
}

/**
 * Parse history HTML for win/loss statistics
 * @param {string} html - HTML content
 * @returns {Object} Parsed history data
 */
function parseHistoryHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let wins = 0;
  let losses = 0;

  const statsTable = findWinLossTable(doc);

  if (!statsTable) {
    console.warn('Win/Loss Statistics table not found');
    return { wins: 0, losses: 0, bouts: 0 };
  }

  // Parse the table
  const rows = statsTable.querySelectorAll('tbody tr');
  const allTimeIndex = getAllTimeColumnIndex(statsTable);

  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    if (cells.length === 0) continue;

    const rowLabel = cells[0].textContent.trim().toLowerCase();
    const sanitizedLabel = rowLabel.replace(/[^a-z]/g, '');

    if (sanitizedLabel.includes('ratio')) {
      continue;
    }

    const isPoolRow = rowLabel.includes('pool');
    const isDirectElimRow = /\bde\b/.test(rowLabel) || rowLabel.includes('direct elimination');

    if (isPoolRow || isDirectElimRow) {
      continue;
    }

    // Find "All Time" column (usually last column)
    const valueCell =
      allTimeIndex !== null && allTimeIndex < cells.length
        ? cells[allTimeIndex]
        : cells[cells.length - 1];

    const allTimeValue = valueCell.textContent.trim();

    if (
      sanitizedLabel.includes('victo') ||
      sanitizedLabel.includes('wins')
    ) {
      wins = parseStatValue(allTimeValue);
    } else if (
      sanitizedLabel.includes('loss') ||
      sanitizedLabel.includes('defeat')
    ) {
      losses = parseStatValue(allTimeValue);
    }
  }

  const bouts = wins + losses;

  return {
    wins,
    losses,
    bouts,
    winRatio: bouts > 0 ? (wins / bouts * 100).toFixed(1) : '0.0'
  };
}

/**
 * Parse a stat value (handles "-" as 0)
 * @param {string} text - Stat text
 * @returns {number} Parsed value
 */
function parseStatValue(text) {
  const trimmed = text.trim();

  if (trimmed === '-' || trimmed === '') {
    return 0;
  }

  const value = parseInt(trimmed, 10);
  return isNaN(value) ? 0 : value;
}

/**
 * Locate the win/loss statistics table within the document
 * @param {Document} doc - Parsed HTML document
 * @returns {HTMLTableElement|null} Table element or null if not found
 */
function findWinLossTable(doc) {
  const tables = doc.querySelectorAll('table');

  for (const table of tables) {
    const rowLabels = table.querySelectorAll('tbody tr td:first-child, tbody tr th:first-child');

    for (const cell of rowLabels) {
      const label = cell.textContent.trim().toLowerCase();
      const normalized = label.replace(/[^a-z]/g, '');

      if (
        normalized.includes('victo') ||
        normalized.includes('wins') ||
        normalized.includes('loss') ||
        normalized.includes('defeat')
      ) {
        return table;
      }
    }
  }

  return null;
}

/**
 * Determine the column index corresponding to "All Time" totals
 * @param {HTMLTableElement} table - Win/loss table
 * @returns {number|null} Zero-based column index or null if not identified
 */
function getAllTimeColumnIndex(table) {
  const headerRow = table.querySelector('thead tr');
  if (!headerRow) {
    return null;
  }

  const headerCells = Array.from(headerRow.querySelectorAll('th, td'));

  for (let i = 0; i < headerCells.length; i++) {
    const headerText = headerCells[i].textContent.trim().toLowerCase();
    const normalized = headerText.replace(/[^a-z]/g, '');

    if (normalized.includes('alltime')) {
      return i;
    }
  }

  return null;
}

// Storage keys and icons
const TRACKED_STORAGE_KEY = 'fsTrackedFencers'; // Favorites (legacy key kept for stored data)
const MY_KIDS_STORAGE_KEY = 'fsMyKids';
const MAX_MY_KIDS = 2;
const STAR_ICON_EMPTY = `
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3.25l2.62 5.31 5.86.85-4.24 4.14 1 5.85L12 16.98l-5.24 2.77 1-5.85-4.24-4.14 5.86-.85z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>
`;
const STAR_ICON_FILLED = `
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3.25l2.62 5.31 5.86.85-4.24 4.14 1 5.85L12 16.98l-5.24 2.77 1-5.85-4.24-4.14 5.86-.85z" fill="#facc15" stroke="#fbbf24" stroke-width="1.1" stroke-linejoin="round"/>
  </svg>
`;

// Modal state
let modalElement = null;
let currentResults = [];
let currentFencer = null;
let currentLookupId = 0; // Track lookup requests to ignore stale responses
let currentStrengthData = null;
let currentHistoryData = null;
let isCurrentFencerTracked = false;
let matchupWeaponState = {
  weapons: [],
  selected: null,
  kidComparisons: []
};

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'lookupFencer') {
    handleLookup(message.query);
  } else if (message.action === 'showTrackedFencers') {
    showTrackedFencerList();
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

  // Fetch base URL and purge expired cache entries opportunistically
  fetchAndCacheBaseUrl().catch(err => console.warn('Base URL fetch error:', err));
  callBackgroundApi('purgeExpired').catch(err => console.warn('Cache purge error:', err));

  try {
    const searchResults = await callBackgroundApi('searchFencers', query);

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
        <div class="fs-tracked-list fs-hidden">
          <div class="fs-tracked-actions">
            <h3 class="fs-tracked-title">Favorites</h3>
            <button class="fs-tracked-clear" type="button" aria-label="Clear all favorites" disabled>Clear All</button>
          </div>
          <p class="fs-tracked-empty fs-hidden">You haven't saved any favorites yet.</p>
          <ul class="fs-tracked-items"></ul>
        </div>
        <div class="fs-profile-view fs-hidden">
          <button class="fs-back-button">← Back to results</button>
          <div class="fs-profile-info">
            <div class="fs-profile-header">
              <h3 class="fs-profile-name"></h3>
              <button class="fs-track-toggle" type="button" aria-label="Add to favorites" aria-pressed="false"></button>
            </div>
            <div class="fs-profile-details">
              <div class="fs-profile-meta"></div>
              <div class="fs-profile-record"></div>
            </div>
          </div>
          <div class="fs-strength-cards"></div>
          <div class="fs-matchup-section fs-hidden" aria-live="polite"></div>
        </div>
      </div>
    </div>
  `;

  const trackButton = modalElement.querySelector('.fs-track-toggle');
  if (trackButton) {
    renderTrackToggleState(trackButton, false);
    trackButton.disabled = true;
  }

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

  // Track toggle button
  const trackButton = modalElement.querySelector('.fs-track-toggle');
  if (trackButton) {
    trackButton.addEventListener('click', () => {
      toggleTrackCurrentFencer().catch(err => console.error('Track toggle error:', err));
    });
  }

  const clearButton = modalElement.querySelector('.fs-tracked-clear');
  if (clearButton) {
    clearButton.addEventListener('click', async () => {
      if (clearButton.disabled) {
        return;
      }

      const confirmed = window.confirm('Remove all favorites? This cannot be undone.');
      if (!confirmed) {
        return;
      }

      clearButton.disabled = true;

      try {
        await clearAllTrackedFencers();
        setModalMode('tracked');
        setModalTitle('Favorites');
        await renderTrackedList();
      } catch (error) {
        console.error('Failed to clear favorites:', error);
        clearButton.disabled = false;
      }
    });
  }

  const trackedList = modalElement.querySelector('.fs-tracked-items');
  if (trackedList) {
    trackedList.addEventListener('click', async event => {
      const removeButton = event.target.closest('.fs-tracked-remove');
      if (!removeButton) {
        return;
      }

      event.preventDefault();

      if (removeButton.disabled) {
        return;
      }

      const fencerId = removeButton.getAttribute('data-fencer-id');
      if (!fencerId) {
        return;
      }

      removeButton.disabled = true;

      try {
        await removeTrackedFencerById(fencerId);
        setModalMode('tracked');
        setModalTitle('Favorites');
        await renderTrackedList();
      } catch (error) {
        console.error('Failed to remove favorite:', error);
        removeButton.disabled = false;
      }
    });
  }
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
  setModalMode('default');
  setModalTitle('Fencer Lookup');
  const loadingState = modalElement.querySelector('.fs-loading-state');
  loadingState.classList.remove('fs-hidden');
}

/**
 * Show error state
 * @param {string} message - Error message to display
 */
function showErrorState(message) {
  hideAllStates();
  setModalMode('default');
  setModalTitle('Fencer Lookup');
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
  setModalMode('default');
  setModalTitle('Fencer Lookup');
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
    // Fetch cached/live HTML in parallel from background (with slug fallback), then parse locally
    const [profileHtmlResult, strengthHtmlResult, historyHtmlResult] = await Promise.all([
      callBackgroundApi('getProfile', searchResult.id, searchResult.slug, searchResult.name).catch(err => {
        console.warn('Profile fetch failed:', err);
        return null;
      }),
      callBackgroundApi('getStrength', searchResult.id, searchResult.slug).catch(err => {
        console.warn('Strength fetch failed:', err);
        return null;
      }),
      callBackgroundApi('getHistory', searchResult.id, searchResult.slug).catch(err => {
        console.warn('History fetch failed:', err);
        return null;
      })
    ]);

    // Parse the HTML responses locally (DOMParser available in content script)
    const profile = profileHtmlResult
      ? parseProfileHtml(profileHtmlResult.html, profileHtmlResult.id, profileHtmlResult.slug)
      : { ...searchResult, birthYear: null };

    const strength = strengthHtmlResult
      ? parseStrengthHtml(strengthHtmlResult.html)
      : { weapons: {} };

    const history = historyHtmlResult
      ? parseHistoryHtml(historyHtmlResult.html)
      : { wins: 0, losses: 0, bouts: 0 };

    // Ignore if a newer lookup started
    if (lookupId !== currentLookupId) {
      console.log('Ignoring stale profile response');
      return;
    }

    currentFencer = profile;
    currentStrengthData = strength;
    currentHistoryData = history;

    hideAllStates();
    setModalMode('default');
    setModalTitle('Fencer Lookup');
    const profileView = modalElement.querySelector('.fs-profile-view');
    const profileName = modalElement.querySelector('.fs-profile-name');
    const profileDetails = modalElement.querySelector('.fs-profile-details');
    const profileMeta = profileDetails ? profileDetails.querySelector('.fs-profile-meta') : null;
    const profileRecord = profileDetails ? profileDetails.querySelector('.fs-profile-record') : null;
    const strengthCards = modalElement.querySelector('.fs-strength-cards');

    // Update profile info
    const profileUrl = createProfileUrl(profile);
    if (profileUrl) {
      profileName.innerHTML = `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(profile.name)}</a>`;
    } else {
      profileName.textContent = profile.name;
    }

    if (profileMeta) {
      const metaItems = [];

      if (profile.club) {
        metaItems.push({
          label: 'Club',
          value: escapeHtml(profile.club)
        });
      }

      if (profile.country) {
        metaItems.push({
          label: 'Country',
          value: escapeHtml(profile.country)
        });
      }

      if (profile.birthYear) {
        const age = calculateApproxAge(profile.birthYear);
        const birthValue =
          age !== null
            ? `${profile.birthYear} (Age ~${age})`
            : `${profile.birthYear}`;
        metaItems.push({
          label: 'Birth Year',
          value: escapeHtml(birthValue)
        });
      }

      // Add total bouts if available
      if (history && history.bouts > 0) {
        const boutsValue = `${history.bouts} (${history.wins}W / ${history.losses}L)`;
        metaItems.push({
          label: 'Total Bouts',
          value: escapeHtml(boutsValue)
        });
      }

      profileMeta.innerHTML = metaItems.length
        ? metaItems
            .map(
              item => `
                <div class="fs-profile-meta-item">
                  <span class="fs-profile-meta-label">${item.label}</span>
                  <span class="fs-profile-meta-value">${item.value}</span>
                </div>
              `
            )
            .join('')
        : '<div class="fs-profile-meta-placeholder">No profile details available</div>';
    }

    // Hide the old bouts card container (no longer used)
    if (profileRecord) {
      profileRecord.innerHTML = '';
    }

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
        const weaponClass = `fs-weapon-${weapon.toLowerCase()}`;
        card.className = `fs-strength-card ${weaponClass}`;

        let strengthHtml = `<h4 class="fs-weapon-name">${capitalizeFirst(weapon)}</h4>`;
        strengthHtml += '<div class="fs-strength-data">';

        // DE strength
        if (weaponData.de) {
          const { valueText, rangeText } = formatStrengthValue(weaponData.de);
          strengthHtml += `
            <div class="fs-strength-item">
              <span class="fs-strength-label">DE:</span>
              <span class="fs-strength-value">
                ${escapeHtml(valueText)}${rangeText ? `<span class="fs-strength-range">${escapeHtml(rangeText)}</span>` : ''}
              </span>
            </div>
          `;
        }

        // Pool strength
        if (weaponData.pool) {
          const { valueText, rangeText } = formatStrengthValue(weaponData.pool);
          strengthHtml += `
            <div class="fs-strength-item">
              <span class="fs-strength-label">Pool:</span>
              <span class="fs-strength-value">
                ${escapeHtml(valueText)}${rangeText ? `<span class="fs-strength-range">${escapeHtml(rangeText)}</span>` : ''}
              </span>
            </div>
          `;
        }

        strengthHtml += '</div>';
        card.innerHTML = strengthHtml;
        strengthCards.appendChild(card);
      });

      // Add explanatory label at the bottom
      const explanationLabel = document.createElement('p');
      explanationLabel.className = 'fs-strength-explanation';
      explanationLabel.textContent = 'Ranges show potential skill variation';
      strengthCards.appendChild(explanationLabel);
    }

    await refreshTrackToggle();
    await renderMatchupSection(profile, strength, history, lookupId);

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
 * Format strength value for display, splitting value and range
 * @param {Object} strengthData - Strength data with value and optional range
 * @returns {Object} Object with valueText and rangeText properties
 */
function formatStrengthValue(strengthData) {
  if (!strengthData) {
    return { valueText: 'N/A', rangeText: null };
  }

  const { value, min, max, range } = strengthData;

  const valueText = String(value);
  let rangeText = null;

  if (min !== undefined && max !== undefined) {
    rangeText = `(${min}-${max})`;
  } else if (range !== undefined) {
    rangeText = `(±${range})`;
  }

  return { valueText, rangeText };
}

/**
 * Toggle tracked state for the current fencer
 * @returns {Promise<void>}
 */
async function toggleTrackCurrentFencer() {
  if (!modalElement) {
    return;
  }

  const trackButton = modalElement.querySelector('.fs-track-toggle');
  if (!trackButton || !currentFencer || !currentFencer.id) {
    return;
  }

  trackButton.disabled = true;

  let shouldRefreshList = false;

  try {
    const tracked = await getTrackedFencers();
    const normalizedId = String(currentFencer.id);
    const existingIndex = findTrackedIndex(tracked, normalizedId);

    if (existingIndex >= 0) {
      tracked.splice(existingIndex, 1);
      await setTrackedFencers(tracked);
      shouldRefreshList = true;
    } else {
      const entry = buildTrackedEntry(currentFencer, currentStrengthData);
      if (!entry) {
        throw new Error('Unable to capture data for this fencer.');
      }

      const updated = tracked.filter(item => String(item.id) !== normalizedId);
      updated.push(entry);
      await setTrackedFencers(updated);
      shouldRefreshList = true;
    }
  } catch (error) {
    console.error('Failed to toggle tracked fencer state:', error);
  } finally {
    trackButton.disabled = false;
  }

  await refreshTrackToggle();

  if (shouldRefreshList && isTrackedListVisible()) {
    try {
      await renderTrackedList();
    } catch (error) {
      console.error('Failed to refresh tracked fencer list:', error);
    }
  }
}

/**
 * Refresh star toggle UI based on storage state
 * @returns {Promise<void>}
 */
async function refreshTrackToggle() {
  if (!modalElement) {
    return;
  }

  const trackButton = modalElement.querySelector('.fs-track-toggle');
  if (!trackButton) {
    return;
  }

  if (!currentFencer || !currentFencer.id) {
    trackButton.disabled = true;
    renderTrackToggleState(trackButton, false);
    return;
  }

  try {
    const tracked = await getTrackedFencers();
    const isTracked = findTrackedIndex(tracked, currentFencer.id) >= 0;
    isCurrentFencerTracked = isTracked;
    trackButton.disabled = false;
    renderTrackToggleState(trackButton, isTracked);
  } catch (error) {
    console.error('Failed to load tracked fencers from storage:', error);
    trackButton.disabled = true;
    renderTrackToggleState(trackButton, false);
  }
}

/**
 * Update track toggle button appearance
 * @param {HTMLButtonElement} button - Toggle button element
 * @param {boolean} isTracked - Whether the current fencer is tracked
 */
function renderTrackToggleState(button, isTracked) {
  if (!button) {
    return;
  }

  button.classList.toggle('fs-track-toggle-active', Boolean(isTracked));
  button.setAttribute('aria-pressed', String(Boolean(isTracked)));
  button.setAttribute(
    'aria-label',
    isTracked ? 'Remove from favorites' : 'Add to favorites'
  );
  button.setAttribute(
    'title',
    isTracked ? 'Remove from favorites' : 'Add to favorites'
  );
  button.innerHTML = isTracked ? STAR_ICON_FILLED : STAR_ICON_EMPTY;
}

/**
 * Show favorites list modal view
 * @returns {Promise<void>}
 */
async function showTrackedFencerList() {
  if (!modalElement) {
    createModal();
  }

  showModal();
  hideAllStates();
  setModalMode('tracked');
  setModalTitle('Favorites');

  // Ensure base URL is cached before rendering links
  await fetchAndCacheBaseUrl().catch(err => console.warn('Base URL fetch error:', err));

  try {
    await renderTrackedList();
    const trackedContainer = modalElement.querySelector('.fs-tracked-list');
    if (trackedContainer) {
      trackedContainer.classList.remove('fs-hidden');
    }
  } catch (error) {
    console.error('Unable to display favorites:', error);
    showErrorState('Unable to load favorites. Please try again.');
  }
}

/**
 * Render tracked fencer list contents
 * @returns {Promise<Array>} Tracked fencers array
 */
async function renderTrackedList() {
  if (!modalElement) {
    return [];
  }

  const container = modalElement.querySelector('.fs-tracked-list');
  if (!container) {
    return [];
  }

  const listElement = container.querySelector('.fs-tracked-items');
  const emptyState = container.querySelector('.fs-tracked-empty');
  const clearButton = container.querySelector('.fs-tracked-clear');

  if (!listElement || !emptyState) {
    return [];
  }

  const tracked = await getTrackedFencers();
  listElement.innerHTML = '';

  if (!tracked || tracked.length === 0) {
    emptyState.classList.remove('fs-hidden');
    if (clearButton) {
      clearButton.disabled = true;
    }
    return [];
  }

  emptyState.classList.add('fs-hidden');
  if (clearButton) {
    clearButton.disabled = false;
  }

  const normalized = [...tracked].map(normalizeTrackedEntryShape);

  const sorted = normalized.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      sensitivity: 'base'
    })
  );

  sorted.forEach(entry => {
    const item = document.createElement('li');
    item.className = 'fs-tracked-item';

    const textWrapper = document.createElement('div');
    textWrapper.className = 'fs-tracked-text';

    const nameRow = document.createElement('div');
    nameRow.className = 'fs-tracked-row';

    const nameElement = createTrackedNameElement(entry);
    nameRow.appendChild(nameElement);

    const removeButton = document.createElement('button');
    removeButton.className = 'fs-tracked-remove';
    removeButton.type = 'button';
    removeButton.textContent = 'X';
    removeButton.setAttribute('data-fencer-id', String(entry.id));
    const ariaLabelName = entry.name || 'this fencer';
    removeButton.setAttribute(
      'aria-label',
      `Remove ${ariaLabelName} from favorites`
    );
    removeButton.setAttribute('title', 'Remove from favorites');
    nameRow.appendChild(removeButton);

    textWrapper.appendChild(nameRow);

    const strengthElement = renderTrackedWeaponSummaries(entry);
    textWrapper.appendChild(strengthElement);

    item.appendChild(textWrapper);

    listElement.appendChild(item);
  });

  return sorted;
}

/**
 * Determine if tracked list is currently visible
 * @returns {boolean}
 */
function isTrackedListVisible() {
  if (!modalElement) {
    return false;
  }

  const container = modalElement.querySelector('.fs-tracked-list');
  return Boolean(container && !container.classList.contains('fs-hidden'));
}

/**
 * Build tracked entry from profile/strength data
 * @param {Object} profile - Fencer profile
 * @param {Object} strength - Strength response
 * @returns {Object|null} Tracked entry or null
 */
function buildTrackedEntry(profile, strength) {
  if (!profile || !profile.id || !profile.name) {
    return null;
  }

  const weaponSummaries = collectWeaponSummaries(strength);
  const primary = weaponSummaries[0] || selectPrimaryWeaponStrength(strength);

  return {
    id: String(profile.id),
    name: profile.name,
    slug: profile.slug || null,
    deStrength: primary.de,
    poolStrength: primary.pool,
    weapon: primary.weapon,
    weaponSummaries
  };
}

/**
 * Select primary weapon data to store for tracking
 * @param {Object} strength - Strength response
 * @returns {Object} { weapon, de, pool }
 */
function selectPrimaryWeaponStrength(strength) {
  const summaries = collectWeaponSummaries(strength);
  if (summaries.length > 0) {
    const primary = summaries[0];
    return {
      weapon: primary.weapon,
      de: primary.de,
      pool: primary.pool
    };
  }

  const weapons = (strength && strength.weapons) || {};
  const weaponKeys = Object.keys(weapons);

  if (weaponKeys.length === 0) {
    return { weapon: null, de: null, pool: null };
  }

  const priority = ['epee', 'foil', 'saber'];
  const selectedKey =
    priority.find(key => Object.prototype.hasOwnProperty.call(weapons, key)) ||
    weaponKeys[0];

  const weaponData = weapons[selectedKey] || {};

  return {
    weapon: selectedKey,
    de: extractStrengthValue(weaponData.de),
    pool: extractStrengthValue(weaponData.pool)
  };
}

/**
 * Collect weapon summaries from strength data in priority order
 * @param {Object} strength - Strength response
 * @returns {Array} Weapon summary objects
 */
function collectWeaponSummaries(strength) {
  const weapons = (strength && strength.weapons) || {};
  const availableKeys = Object.keys(weapons);

  if (availableKeys.length === 0) {
    return [];
  }

  const priority = ['epee', 'foil', 'saber'];
  const prioritized = priority.filter(key =>
    Object.prototype.hasOwnProperty.call(weapons, key)
  );
  const extras = availableKeys
    .filter(key => !priority.includes(key))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const ordered = [...prioritized, ...extras];
  const summaries = [];

  ordered.forEach((weaponKey, index) => {
    const weaponData = weapons[weaponKey] || {};
    const de = extractStrengthValue(weaponData.de);
    const pool = extractStrengthValue(weaponData.pool);
    const hasDe = de !== null && de !== undefined && de !== '';
    const hasPool = pool !== null && pool !== undefined && pool !== '';

    if (!hasDe && !hasPool) {
      return;
    }

    summaries.push({
      weapon: weaponKey,
      de: hasDe ? de : null,
      pool: hasPool ? pool : null,
      isPrimary: index === 0
    });
  });

  if (summaries.length === 0) {
    return [];
  }

  summaries.forEach((summary, index) => {
    summary.isPrimary = index === 0;
  });

  return summaries;
}

/**
 * Extract numeric/string value out of strength entry
 * @param {Object} entry - Strength entry
 * @returns {string|null}
 */
function extractStrengthValue(entry) {
  if (!entry || entry.value === undefined || entry.value === null) {
    return null;
  }

  return String(entry.value);
}

/**
 * Create DOM element for tracked fencer name
 * @param {Object} entry - Tracked fencer entry
 * @returns {HTMLElement}
 */
function createTrackedNameElement(entry) {
  const profileUrl = createProfileUrl(entry);
  const textContent = entry.name || 'Unknown fencer';

  if (profileUrl) {
    const link = document.createElement('a');
    link.className = 'fs-tracked-name';
    link.href = profileUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = textContent;
    return link;
  }

  const span = document.createElement('span');
  span.className = 'fs-tracked-name';
  span.textContent = textContent;
  return span;
}

/**
 * Format tracked strength summary for list display
 * @param {Object} entry - Tracked fencer entry
 * @returns {string}
 */
function formatTrackedStrength(entry) {
  const deText = formatStrengthSummaryValue(entry.deStrength);
  const poolText = formatStrengthSummaryValue(entry.poolStrength);
  return `(DE: ${deText}, Pool: ${poolText})`;
}

/**
 * Render weapon summaries chip container for tracked entry
 * @param {Object} entry - Tracked fencer entry
 * @returns {HTMLElement}
 */
function renderTrackedWeaponSummaries(entry) {
  const container = document.createElement('div');
  container.className = 'fs-tracked-strength';

  const summaries = Array.isArray(entry.weaponSummaries)
    ? entry.weaponSummaries
    : [];

  if (!summaries.length) {
    container.textContent = formatTrackedStrength(entry);
    return container;
  }

  summaries.forEach(summary => {
    const chip = document.createElement('span');
    chip.className = 'fs-tracked-weapon';
    if (summary.isPrimary) {
      chip.classList.add('fs-tracked-weapon-primary');
    }

    const weaponLabel = formatWeaponLabel(summary.weapon);
    const parts = [];

    if (summary.de !== null && summary.de !== undefined && summary.de !== '') {
      parts.push(`DE ${formatStrengthSummaryValue(summary.de)}`);
    }

    if (
      summary.pool !== null &&
      summary.pool !== undefined &&
      summary.pool !== ''
    ) {
      parts.push(`Pool ${formatStrengthSummaryValue(summary.pool)}`);
    }

    chip.textContent =
      parts.length > 0 ? `${weaponLabel} · ${parts.join(' / ')}` : weaponLabel;
    container.appendChild(chip);
  });

  return container;
}

/**
 * Format individual strength value for tracked summary
 * @param {string|null} value - Strength value
 * @returns {string}
 */
function formatStrengthSummaryValue(value) {
  if (value === undefined || value === null || value === '') {
    return 'N/A';
  }

  return String(value);
}

/**
 * Format weapon label for display
 * @param {string|null} weapon - Weapon identifier
 * @returns {string}
 */
function formatWeaponLabel(weapon) {
  if (!weapon) {
    return 'Unknown';
  }

  const map = {
    epee: 'Épée',
    épée: 'Épée',
    foil: 'Foil',
    saber: 'Saber',
    sabre: 'Saber'
  };

  const lower = String(weapon).toLowerCase();
  if (map[lower]) {
    return map[lower];
  }

  return capitalizeFirst(String(weapon));
}

/**
 * Retrieve tracked fencers from storage
 * @returns {Promise<Array>}
 */
function getTrackedFencers() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([TRACKED_STORAGE_KEY], result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const raw = result[TRACKED_STORAGE_KEY];
      if (!raw) {
        resolve([]);
        return;
      }

      if (Array.isArray(raw)) {
        resolve(raw);
        return;
      }

      // Support legacy object maps by converting to array
      resolve(Object.values(raw));
    });
  });
}

/**
 * Persist tracked fencers to storage
 * @param {Array} entries - Tracked entries
 * @returns {Promise<void>}
 */
function setTrackedFencers(entries) {
  const sanitized = (entries || []).map(entry => {
    const normalizedSummaries = normalizeTrackedWeaponSummaries(entry);
    const primary = normalizedSummaries[0] || {};

    const weapon =
      entry.weapon !== undefined && entry.weapon !== null && entry.weapon !== ''
        ? entry.weapon
        : primary.weapon || null;
    const deStrength =
      entry.deStrength === undefined ||
      entry.deStrength === null ||
      entry.deStrength === ''
        ? primary.de ?? null
        : entry.deStrength;
    const poolStrength =
      entry.poolStrength === undefined ||
      entry.poolStrength === null ||
      entry.poolStrength === ''
        ? primary.pool ?? null
        : entry.poolStrength;

    return {
      id: entry.id,
      name: entry.name,
      slug: entry.slug || null,
      deStrength:
        deStrength === undefined || deStrength === null ? null : deStrength,
      poolStrength:
        poolStrength === undefined || poolStrength === null
          ? null
          : poolStrength,
      weapon: weapon || null,
      weaponSummaries: normalizedSummaries
    };
  });

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      {
        [TRACKED_STORAGE_KEY]: sanitized
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Remove a tracked fencer by ID
 * @param {string|number} fencerId
 * @returns {Promise<Array>}
 */
async function removeTrackedFencerById(fencerId) {
  const normalizedId = String(fencerId);
  const tracked = await getTrackedFencers();
  const filtered = tracked.filter(entry => String(entry.id) !== normalizedId);

  if (filtered.length === tracked.length) {
    return tracked;
  }

  await setTrackedFencers(filtered);
  await handleTrackedRemovalEffects(normalizedId);
  return filtered;
}

/**
 * Clear all tracked fencers from storage
 * @returns {Promise<Array>}
 */
async function clearAllTrackedFencers() {
  const tracked = await getTrackedFencers();
  await setTrackedFencers([]);

  if (currentFencer && currentFencer.id) {
    const normalizedId = String(currentFencer.id);
    const wasTracked =
      isCurrentFencerTracked ||
      tracked.some(entry => String(entry.id) === normalizedId);

    if (wasTracked) {
      await handleTrackedRemovalEffects(normalizedId);
    }
  }

  return [];
}

/**
 * Sync track toggle state after removal operations
 * @param {string} normalizedId
 * @returns {Promise<void>}
 */
async function handleTrackedRemovalEffects(normalizedId) {
  if (!currentFencer || !currentFencer.id) {
    return;
  }

  if (String(currentFencer.id) !== normalizedId) {
    return;
  }

  isCurrentFencerTracked = false;

  if (modalElement) {
    const trackButton = modalElement.querySelector('.fs-track-toggle');
    if (trackButton) {
      trackButton.disabled = false;
      renderTrackToggleState(trackButton, false);
    }
  }

  try {
    await refreshTrackToggle();
  } catch (error) {
    console.error('Failed to refresh track toggle after tracked fencer removal:', error);
  }
}

/**
 * Find tracked fencer index by id
 * @param {Array} entries - Tracked entries
 * @param {string|number} id - Fencer ID
 * @returns {number}
 */
function findTrackedIndex(entries, id) {
  const normalizedId = String(id);
  return entries.findIndex(item => String(item.id) === normalizedId);
}

/**
 * Normalize weapon summaries for storage/display
 * @param {Object} entry - Tracked entry
 * @returns {Array}
 */
function normalizeTrackedWeaponSummaries(entry) {
  const rawSummaries = Array.isArray(entry.weaponSummaries)
    ? entry.weaponSummaries
    : [];

  const cleaned = rawSummaries
    .map(summary => {
      if (!summary) {
        return null;
      }

      const weapon =
        summary.weapon === undefined ||
        summary.weapon === null ||
        summary.weapon === ''
          ? null
          : String(summary.weapon);
      const de =
        summary.de === undefined || summary.de === null || summary.de === ''
          ? null
          : String(summary.de);
      const pool =
        summary.pool === undefined || summary.pool === null || summary.pool === ''
          ? null
          : String(summary.pool);

      if (!weapon && de === null && pool === null) {
        return null;
      }

      return {
        weapon,
        de,
        pool,
        isPrimary: Boolean(summary.isPrimary)
      };
    })
    .filter(Boolean);

  if (cleaned.length === 0) {
    const fallbackWeapon =
      entry.weapon === undefined || entry.weapon === null || entry.weapon === ''
        ? null
        : String(entry.weapon);
    const fallbackDe =
      entry.deStrength === undefined ||
      entry.deStrength === null ||
      entry.deStrength === ''
        ? null
        : String(entry.deStrength);
    const fallbackPool =
      entry.poolStrength === undefined ||
      entry.poolStrength === null ||
      entry.poolStrength === ''
        ? null
        : String(entry.poolStrength);

    if (fallbackWeapon || fallbackDe !== null || fallbackPool !== null) {
      cleaned.push({
        weapon: fallbackWeapon,
        de: fallbackDe,
        pool: fallbackPool,
        isPrimary: true
      });
    }
  }

  if (cleaned.length > 0) {
    cleaned.forEach((summary, index) => {
      summary.isPrimary = index === 0;
    });
  }

  return cleaned;
}

/**
 * Normalize tracked entry shape ensuring weapon summaries exist
 * @param {Object} entry - Tracked entry
 * @returns {Object}
 */
function normalizeTrackedEntryShape(entry) {
  const weaponSummaries = normalizeTrackedWeaponSummaries(entry);
  return {
    ...entry,
    weaponSummaries
  };
}

/**
 * Set modal container mode
 * @param {'default'|'tracked'} mode
 */
function setModalMode(mode) {
  if (!modalElement) {
    return;
  }

  const container = modalElement.querySelector('.fs-modal-container');
  if (!container) {
    return;
  }

  container.classList.toggle('fs-modal-compact', mode === 'tracked');
}

/**
 * Update modal title text
 * @param {string} title
 */
function setModalTitle(title) {
  if (!modalElement) {
    return;
  }

  const titleElement = modalElement.querySelector('.fs-modal-title');
  if (!titleElement) {
    return;
  }

  titleElement.textContent = title;
}

/**
 * Hide all modal states
 */
function hideAllStates() {
  const states = [
    '.fs-loading-state',
    '.fs-error-state',
    '.fs-results-list',
    '.fs-tracked-list',
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
 * Calculate approximate age from birth year
 * @param {number} birthYear - Birth year value
 * @returns {number|null} Age in years or null if invalid
 */
function calculateApproxAge(birthYear) {
  const year = Number(birthYear);
  if (!Number.isInteger(year)) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  if (year <= 0 || year > currentYear) {
    return null;
  }

  return currentYear - year;
}

/**
 * Build profile URL for the given fencer
 * @param {Object} profile - Profile data containing id and slug
 * @param {string} [baseUrl] - Optional base URL (if not provided, will use cached value)
 * @returns {string|null} Profile URL or null if data incomplete
 */
function createProfileUrl(profile, baseUrl) {
  if (!profile || !profile.id || !profile.slug) {
    return null;
  }

  // Use provided base URL or fall back to cached/default value
  const effectiveBase = baseUrl || getCachedBaseUrl();
  const sanitizedBase = effectiveBase.endsWith('/') ? effectiveBase.slice(0, -1) : effectiveBase;
  const idPart = encodeURIComponent(String(profile.id));
  const slugPart = encodeURIComponent(String(profile.slug));
  return `${sanitizedBase}/p/${idPart}/${slugPart}`;
}

/**
 * Get cached base URL or default
 * @returns {string} Base URL
 */
function getCachedBaseUrl() {
  // Use cached value if available, otherwise fall back to default
  // The cache is populated on first lookup
  return globalThis._fsBaseUrlCache || 'https://fencingtracker.com';
}

/**
 * Fetch and cache the base URL from background
 * @returns {Promise<string>} Base URL
 */
async function fetchAndCacheBaseUrl() {
  try {
    const baseUrl = await callBackgroundApi('getBaseUrl');
    globalThis._fsBaseUrlCache = baseUrl;
    return baseUrl;
  } catch (error) {
    console.warn('Failed to fetch base URL from background, using default:', error);
    return 'https://fencingtracker.com';
  }
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

// ============================================================================
// My Kids + Matchups
// ============================================================================

/**
 * Load saved kids from storage (max 2)
 * @returns {Promise<Array<{id:string,slug:string,name:string}>>}
 */
function getMyKids() {
  return new Promise(resolve => {
    chrome.storage.local.get(MY_KIDS_STORAGE_KEY, result => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to load my kids:', chrome.runtime.lastError);
        resolve([]);
        return;
      }
      const raw = result[MY_KIDS_STORAGE_KEY];
      if (!Array.isArray(raw)) {
        resolve([]);
        return;
      }
      resolve(
        raw
          .filter(entry => entry && entry.id && entry.name)
          .slice(0, MAX_MY_KIDS)
          .map(entry => ({
            id: String(entry.id),
            slug: entry.slug || '',
            name: entry.name
          }))
      );
    });
  });
}

/**
 * Elo-style win probability for me vs opponent (higher strength = favorite)
 * @param {number} myStrength
 * @param {number} oppStrength
 * @returns {number} Probability in [0, 1]
 */
function eloWinProbability(myStrength, oppStrength) {
  const mine = Number(myStrength);
  const theirs = Number(oppStrength);
  if (!Number.isFinite(mine) || !Number.isFinite(theirs)) {
    return null;
  }
  return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
}

/**
 * Soft qualitative label for a win probability
 * @param {number} probability
 * @returns {string}
 */
function softMatchupLabel(probability) {
  if (probability == null || !Number.isFinite(probability)) {
    return '';
  }
  if (probability >= 0.7) return 'Clear favorite';
  if (probability >= 0.58) return 'Slight edge';
  if (probability >= 0.42) return 'Even matchup';
  if (probability >= 0.3) return 'Underdog';
  return 'Clear underdog';
}

/**
 * Format win probability as whole percent
 * @param {number} probability
 * @returns {string}
 */
function formatWinPercent(probability) {
  if (probability == null || !Number.isFinite(probability)) {
    return '—';
  }
  return `${Math.round(probability * 100)}%`;
}

/**
 * Extract numeric strength value from a pool/de entry
 * @param {Object|null} entry
 * @returns {number|null}
 */
function numericStrengthValue(entry) {
  if (!entry || entry.value === undefined || entry.value === null || entry.value === '') {
    return null;
  }
  const num = Number(entry.value);
  return Number.isFinite(num) ? num : null;
}

/**
 * List weapons that have pool and/or DE strength
 * @param {Object} strength
 * @returns {string[]}
 */
function weaponsWithRatings(strength) {
  const weapons = (strength && strength.weapons) || {};
  return Object.keys(weapons).filter(weapon => {
    const data = weapons[weapon] || {};
    return numericStrengthValue(data.pool) != null || numericStrengthValue(data.de) != null;
  });
}

/**
 * Overlapping weapons between kid and opponent
 * @param {Object} kidStrength
 * @param {Object} oppStrength
 * @returns {string[]}
 */
function overlappingWeapons(kidStrength, oppStrength) {
  const kidWeapons = new Set(weaponsWithRatings(kidStrength));
  return weaponsWithRatings(oppStrength).filter(w => kidWeapons.has(w));
}

/**
 * Choose default weapon from overlap set (prefer opponent's strongest DE)
 * @param {string[]} weapons
 * @param {Object} oppStrength
 * @returns {string|null}
 */
function pickDefaultOverlapWeapon(weapons, oppStrength) {
  if (!weapons || weapons.length === 0) return null;
  if (weapons.length === 1) return weapons[0];

  let best = weapons[0];
  let bestScore = -Infinity;
  for (const weapon of weapons) {
    const data = (oppStrength.weapons && oppStrength.weapons[weapon]) || {};
    const de = numericStrengthValue(data.de);
    const pool = numericStrengthValue(data.pool);
    const score = de != null ? de : pool != null ? pool : -Infinity;
    if (score > bestScore) {
      bestScore = score;
      best = weapon;
    }
  }
  return best;
}

/**
 * Build per-type comparison for one kid vs opponent on one weapon
 * @param {Object} kidWeaponData
 * @param {Object} oppWeaponData
 * @param {'pool'|'de'} type
 * @returns {Object|null}
 */
function buildTypeComparison(kidWeaponData, oppWeaponData, type) {
  const mine = numericStrengthValue(kidWeaponData && kidWeaponData[type]);
  const theirs = numericStrengthValue(oppWeaponData && oppWeaponData[type]);
  if (mine == null || theirs == null) {
    return null;
  }
  const probability = eloWinProbability(mine, theirs);
  return {
    type,
    myStrength: mine,
    oppStrength: theirs,
    probability,
    percentText: formatWinPercent(probability),
    softLabel: softMatchupLabel(probability)
  };
}

/**
 * Fetch strength (and optional history) for a kid entry
 * @param {{id:string,slug:string,name:string}} kid
 * @returns {Promise<{kid:Object,strength:Object,history:Object|null}>}
 */
async function loadKidMatchupData(kid) {
  const slug = kid.slug || buildSlugFromNameSafe(kid.name);
  let strength = { weapons: {} };
  let history = null;

  try {
    const strengthHtmlResult = await callBackgroundApi('getStrength', kid.id, slug);
    if (strengthHtmlResult && strengthHtmlResult.html) {
      strength = parseStrengthHtml(strengthHtmlResult.html);
    }
  } catch (error) {
    console.warn(`Failed to load strength for kid ${kid.name}:`, error);
  }

  try {
    const historyHtmlResult = await callBackgroundApi('getHistory', kid.id, slug);
    if (historyHtmlResult && historyHtmlResult.html) {
      history = parseHistoryHtml(historyHtmlResult.html);
    }
  } catch (error) {
    // Optional for minimal experience line
    console.warn(`Failed to load history for kid ${kid.name}:`, error);
  }

  return { kid, strength, history };
}

/**
 * Safe slug helper when buildSlugFromName is unavailable in content script
 * @param {string} name
 * @returns {string}
 */
function buildSlugFromNameSafe(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  if (!trimmed) return '';
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      return `${parts[1]}-${parts[0]}`.replace(/\s+/g, '-');
    }
  }
  // Search API often returns already-hyphenated names (e.g. Lee-Kiefer)
  if (/^[A-Za-z0-9().\-\s]+$/.test(trimmed) && trimmed.includes('-') && !trimmed.includes(' ')) {
    return trimmed;
  }
  return trimmed.replace(/\s+/g, '-');
}

/**
 * Render matchup section for configured kids vs looked-up opponent
 * @param {Object} profile
 * @param {Object} strength
 * @param {Object} history
 * @param {number} lookupId
 */
async function renderMatchupSection(profile, strength, history, lookupId) {
  const section = modalElement && modalElement.querySelector('.fs-matchup-section');
  if (!section) {
    return;
  }

  section.classList.add('fs-hidden');
  section.innerHTML = '';
  matchupWeaponState = { weapons: [], selected: null, kidComparisons: [] };

  const kids = await getMyKids();
  if (lookupId !== currentLookupId) {
    return;
  }

  if (!kids.length) {
    section.innerHTML = `
      <div class="fs-matchup-empty">
        Add your kids in the extension popup to see matchups.
      </div>
    `;
    section.classList.remove('fs-hidden');
    return;
  }

  // Skip matchup when looking up one of your own kids
  const opponentId = profile && profile.id != null ? String(profile.id) : null;
  const kidsForMatchup = kids.filter(kid => String(kid.id) !== opponentId);
  if (!kidsForMatchup.length) {
    section.innerHTML = `
      <div class="fs-matchup-empty">
        This is one of your kids — look up an opponent to see matchups.
      </div>
    `;
    section.classList.remove('fs-hidden');
    return;
  }

  section.innerHTML = `<div class="fs-matchup-loading">Loading matchups…</div>`;
  section.classList.remove('fs-hidden');

  const loaded = await Promise.all(kidsForMatchup.map(loadKidMatchupData));
  if (lookupId !== currentLookupId) {
    return;
  }

  // Union of overlapping weapons across all kids (preserve save order of kids)
  const weaponSet = new Set();
  loaded.forEach(({ strength: kidStrength }) => {
    overlappingWeapons(kidStrength, strength).forEach(w => weaponSet.add(w));
  });
  const weapons = Array.from(weaponSet);
  // Stable weapon order: foil, epee, saber, then others
  const priority = ['foil', 'epee', 'saber'];
  weapons.sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  if (!weapons.length) {
    section.innerHTML = `
      <div class="fs-matchup-header">
        <h4 class="fs-matchup-title">Matchups</h4>
      </div>
      <div class="fs-matchup-empty">No shared weapon ratings with your kids.</div>
    `;
    return;
  }

  const selected = pickDefaultOverlapWeapon(weapons, strength);
  matchupWeaponState = {
    weapons,
    selected,
    kidComparisons: loaded,
    opponentStrength: strength,
    opponentHistory: history
  };

  paintMatchupSection();
}

/**
 * Paint matchup DOM from matchupWeaponState
 */
function paintMatchupSection() {
  const section = modalElement && modalElement.querySelector('.fs-matchup-section');
  if (!section || !matchupWeaponState.selected) {
    return;
  }

  const { weapons, selected, kidComparisons, opponentStrength, opponentHistory } =
    matchupWeaponState;
  const oppWeaponData =
    (opponentStrength && opponentStrength.weapons && opponentStrength.weapons[selected]) || {};

  const chipsHtml =
    weapons.length > 1
      ? `<div class="fs-matchup-weapons" role="tablist" aria-label="Matchup weapon">
          ${weapons
            .map(
              weapon => `
            <button type="button"
              class="fs-matchup-weapon-chip${weapon === selected ? ' fs-matchup-weapon-chip-active' : ''}"
              data-weapon="${escapeHtml(weapon)}"
              role="tab"
              aria-selected="${weapon === selected}">
              ${escapeHtml(formatWeaponLabel(weapon))}
            </button>`
            )
            .join('')}
        </div>`
      : `<div class="fs-matchup-weapon-label">${escapeHtml(formatWeaponLabel(selected))}</div>`;

  const cardsHtml = kidComparisons
    .map(({ kid, strength: kidStrength, history: kidHistory }) => {
      const overlaps = overlappingWeapons(kidStrength, opponentStrength);
      if (!overlaps.includes(selected)) {
        return `
          <div class="fs-matchup-card">
            <div class="fs-matchup-kid-name">${escapeHtml(kid.name)}</div>
            <p class="fs-matchup-card-note">No ${escapeHtml(formatWeaponLabel(selected))} rating</p>
          </div>`;
      }

      const kidWeaponData = (kidStrength.weapons && kidStrength.weapons[selected]) || {};
      const pool = buildTypeComparison(kidWeaponData, oppWeaponData, 'pool');
      const de = buildTypeComparison(kidWeaponData, oppWeaponData, 'de');

      if (!pool && !de) {
        return `
          <div class="fs-matchup-card">
            <div class="fs-matchup-kid-name">${escapeHtml(kid.name)}</div>
            <p class="fs-matchup-card-note">Incomplete strength data for this weapon</p>
          </div>`;
      }

      const rows = [];
      if (pool) {
        rows.push(`
          <div class="fs-matchup-row">
            <span class="fs-matchup-type">Pools</span>
            <span class="fs-matchup-pct">${escapeHtml(pool.percentText)}</span>
            <span class="fs-matchup-soft">${escapeHtml(pool.softLabel)}</span>
          </div>`);
      }
      if (de) {
        rows.push(`
          <div class="fs-matchup-row">
            <span class="fs-matchup-type">DE</span>
            <span class="fs-matchup-pct">${escapeHtml(de.percentText)}</span>
            <span class="fs-matchup-soft">${escapeHtml(de.softLabel)}</span>
          </div>`);
      }

      const strengthBits = [];
      if (pool) {
        strengthBits.push(`Pool ${pool.myStrength} vs ${pool.oppStrength}`);
      }
      if (de) {
        strengthBits.push(`DE ${de.myStrength} vs ${de.oppStrength}`);
      }

      let experienceLine = '';
      const kidBouts = kidHistory && kidHistory.bouts > 0 ? kidHistory.bouts : null;
      const oppBouts =
        opponentHistory && opponentHistory.bouts > 0 ? opponentHistory.bouts : null;
      if (kidBouts != null && oppBouts != null) {
        experienceLine = `<div class="fs-matchup-experience">~${kidBouts} vs ~${oppBouts} career bouts</div>`;
      }

      return `
        <div class="fs-matchup-card">
          <div class="fs-matchup-kid-name">${escapeHtml(kid.name)}</div>
          <div class="fs-matchup-rows">${rows.join('')}</div>
          <div class="fs-matchup-strength">${escapeHtml(strengthBits.join(' · '))}</div>
          ${experienceLine}
        </div>`;
    })
    .join('');

  section.innerHTML = `
    <div class="fs-matchup-header">
      <h4 class="fs-matchup-title">Matchups</h4>
      ${chipsHtml}
    </div>
    <div class="fs-matchup-cards">${cardsHtml}</div>
    <p class="fs-matchup-footnote">Estimated from strength ratings only (FencingTracker-style). Not a guarantee.</p>
  `;

  section.querySelectorAll('.fs-matchup-weapon-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const weapon = chip.getAttribute('data-weapon');
      if (!weapon || weapon === matchupWeaponState.selected) {
        return;
      }
      matchupWeaponState.selected = weapon;
      paintMatchupSection();
    });
  });
}
