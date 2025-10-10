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

  // Name from card header
  const nameElement = doc.querySelector('div.card-header h1.fw-bold');
  const name = nameElement ? nameElement.textContent.trim() : parseSlug(slug);

  // Birth year from sibling h3
  let birthYear = null;
  const birthYearElement = doc.querySelector('div.card-header h3.text-dark-emphasis');
  if (birthYearElement) {
    const yearText = birthYearElement.textContent.trim();
    const yearMatch = yearText.match(/\d{4}/);
    if (yearMatch) {
      birthYear = parseInt(yearMatch[0], 10);
    }
  }

  // Club from link
  let club = null;
  const clubElement = doc.querySelector('div.card-header a[href^="/club/"]');
  if (clubElement) {
    club = clubElement.textContent.trim();
  }

  // Country from flag icon
  let country = 'USA'; // Default
  const flagElement = doc.querySelector('.flag-icon');
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

  // Parse summary table
  const rows = doc.querySelectorAll('table.table-striped tbody tr');

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 4) continue;

    // Column 0: Weapon name
    const weaponText = cells[0].textContent.trim();
    const weapon = normalizeWeapon(weaponText);

    // Column 1: Type (DE or Pool)
    const typeText = cells[1].textContent.trim().toLowerCase();
    const type = typeText.includes('pool') ? 'pool' : 'de';

    // Column 2: Strength value
    const strengthText = cells[2].textContent.trim();
    const strengthValue = parseStrengthValue(strengthText);

    // Column 3: Range (optional)
    const rangeText = cells[3].textContent.trim();
    const range = parseStrengthRange(rangeText);

    // Initialize weapon object if needed
    if (!weapons[weapon]) {
      weapons[weapon] = {};
    }

    // Store the data
    weapons[weapon][type] = {
      value: strengthValue,
      ...range
    };
  }

  // Optionally parse series data from inline script
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
  if (lower.includes('foil')) return 'foil';
  if (lower.includes('epee') || lower.includes('épée')) return 'epee';
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
const TRACKED_STORAGE_KEY = 'fsTrackedFencers';
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
let isCurrentFencerTracked = false;

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
          <h3 class="fs-tracked-title">Tracked Fencers</h3>
          <p class="fs-tracked-empty fs-hidden">You haven't tracked any fencers yet.</p>
          <ul class="fs-tracked-items"></ul>
        </div>
        <div class="fs-profile-view fs-hidden">
          <button class="fs-back-button">← Back to results</button>
          <div class="fs-profile-info">
            <div class="fs-profile-header">
              <h3 class="fs-profile-name"></h3>
              <button class="fs-track-toggle" type="button" aria-label="Track fencer" aria-pressed="false"></button>
            </div>
            <div class="fs-profile-details">
              <div class="fs-profile-meta"></div>
              <div class="fs-profile-record"></div>
            </div>
          </div>
          <div class="fs-strength-cards"></div>
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
    'title',
    isTracked ? 'Remove from tracked fencers' : 'Track this fencer'
  );
  button.innerHTML = isTracked ? STAR_ICON_FILLED : STAR_ICON_EMPTY;
}

/**
 * Show tracked fencer list modal view
 * @returns {Promise<void>}
 */
async function showTrackedFencerList() {
  if (!modalElement) {
    createModal();
  }

  showModal();
  hideAllStates();
  setModalMode('tracked');
  setModalTitle('Tracked Fencers');

  // Ensure base URL is cached before rendering links
  await fetchAndCacheBaseUrl().catch(err => console.warn('Base URL fetch error:', err));

  try {
    await renderTrackedList();
    const trackedContainer = modalElement.querySelector('.fs-tracked-list');
    if (trackedContainer) {
      trackedContainer.classList.remove('fs-hidden');
    }
  } catch (error) {
    console.error('Unable to display tracked fencers:', error);
    showErrorState('Unable to load tracked fencers. Please try again.');
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

  if (!listElement || !emptyState) {
    return [];
  }

  const tracked = await getTrackedFencers();
  listElement.innerHTML = '';

  if (!tracked || tracked.length === 0) {
    emptyState.classList.remove('fs-hidden');
    return [];
  }

  emptyState.classList.add('fs-hidden');

  const sorted = [...tracked].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      sensitivity: 'base'
    })
  );

  sorted.forEach(entry => {
    const item = document.createElement('li');
    item.className = 'fs-tracked-item';

    const nameElement = createTrackedNameElement(entry);
    item.appendChild(nameElement);

    const strengthElement = document.createElement('span');
    strengthElement.className = 'fs-tracked-strength';
    strengthElement.textContent = formatTrackedStrength(entry);
    item.appendChild(strengthElement);

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

  const primary = selectPrimaryWeaponStrength(strength);

  return {
    id: String(profile.id),
    name: profile.name,
    slug: profile.slug || null,
    deStrength: primary.de,
    poolStrength: primary.pool,
    weapon: primary.weapon
  };
}

/**
 * Select primary weapon data to store for tracking
 * @param {Object} strength - Strength response
 * @returns {Object} { weapon, de, pool }
 */
function selectPrimaryWeaponStrength(strength) {
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
  const sanitized = (entries || []).map(entry => ({
    id: entry.id,
    name: entry.name,
    slug: entry.slug || null,
    deStrength:
      entry.deStrength === undefined || entry.deStrength === null
        ? null
        : entry.deStrength,
    poolStrength:
      entry.poolStrength === undefined || entry.poolStrength === null
        ? null
        : entry.poolStrength,
    weapon: entry.weapon || null
  }));

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
