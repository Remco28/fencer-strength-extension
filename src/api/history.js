// History parser for fencingtracker.com
// Fetches and parses /p/{id}/{slug}/history HTML for win/loss stats

const BASE_URL = 'https://fencingtracker.com';

/**
 * Get fencer history/win-loss data
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<Object>} History data
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
  const history = await fetchHistory(id, slug);
  await setCached(cacheKey, history);
  return history;
}

/**
 * Fetch and parse history HTML with retry logic
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<Object>} Parsed history data
 */
async function fetchHistory(id, slug) {
  const url = `${BASE_URL}/p/${id}/${slug}/history`;
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
      return parseHistoryHtml(html);
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

  // Find the "Win/Loss Statistics" heading
  const headings = doc.querySelectorAll('h3');
  let statsTable = null;

  for (const heading of headings) {
    if (heading.textContent.includes('Win/Loss Statistics')) {
      // Find the next table after this heading
      let nextElement = heading.nextElementSibling;
      while (nextElement) {
        if (nextElement.tagName === 'TABLE') {
          statsTable = nextElement;
          break;
        }
        nextElement = nextElement.nextElementSibling;
      }
      break;
    }
  }

  if (!statsTable) {
    console.warn('Win/Loss Statistics table not found');
    return { wins: 0, losses: 0, bouts: 0 };
  }

  // Parse the table
  const rows = statsTable.querySelectorAll('tbody tr');

  for (const row of rows) {
    const cells = row.querySelectorAll('td, th');
    if (cells.length === 0) continue;

    const rowLabel = cells[0].textContent.trim().toLowerCase();

    // Find "All Time" column (usually last column)
    const allTimeValue = cells[cells.length - 1].textContent.trim();

    if (rowLabel.includes('victorie') || rowLabel.includes('wins')) {
      wins = parseStatValue(allTimeValue);
    } else if (rowLabel.includes('loss')) {
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
