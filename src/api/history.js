// History parser for fencingtracker.com
// Fetches /p/{id}/{slug}/history HTML; parsing happens in the content script

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
 * Helper to delay execution
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
