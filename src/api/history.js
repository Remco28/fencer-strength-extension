// History parser for fencingtracker.com
// Fetches and parses /p/{id}/{slug}/history HTML for win/loss stats

const HISTORY_BASE_URL = globalThis.FENCINGTRACKER_BASE_URL || 'https://fencingtracker.com';

/**
 * Get fencer history HTML with caching
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<{html: string}>} Cached or fetched HTML
 */
async function getHistory(id, slug) {
  const cacheKey = getHistoryCacheKey(id);

  // Check cache first
  const cached = await getCached(cacheKey);
  if (cached) {
    console.log(`Cache hit for history: ${id}`);
    return cached;
  }

  // Fetch from API
  const result = await fetchHistoryHtml(id, slug);
  await setCached(cacheKey, result);
  return result;
}

/**
 * Fetch history HTML with retry logic (background-safe, no parsing)
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<{html: string}>} Raw HTML
 */
async function fetchHistoryHtml(id, slug) {
  const url = `${HISTORY_BASE_URL}/p/${id}/${slug}/history`;
  let lastError = null;

  // Try with one retry on 429/5xx
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url);

      // Handle rate limiting
      if (response.status === 429) {
        console.warn('History fetch rate limited (429), retrying after delay...');
        if (attempt === 0) {
          await delay(2000);
          continue;
        }
        throw new Error('Rate limited after retry');
      }

      // Handle server errors
      if (response.status >= 500) {
        console.warn(`History fetch server error (${response.status}), retrying...`);
        if (attempt === 0) {
          await delay(2000);
          continue;
        }
        throw new Error(`Server error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return { html };
    } catch (error) {
      lastError = error;
      if (attempt === 0 && !error.message.includes('404')) {
        console.warn('History fetch attempt failed, retrying...', error);
        await delay(2000);
      }
    }
  }

  throw lastError || new Error('History fetch failed after retries');
}

/**
 * DEPRECATED: Fetch and parse history HTML (kept for backward compatibility)
 * Use fetchHistoryHtml and parse in content script instead
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<Object>} Parsed history data
 */
async function fetchHistory(id, slug) {
  const result = await fetchHistoryHtml(id, slug);
  return parseHistoryHtml(result.html);
}

/**
 * Helper to delay execution
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
