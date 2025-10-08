// Search API for fencingtracker.com
// Handles POST search with variant fallback and caching

const SEARCH_URL = 'https://fencingtracker.com/search';
const RETRY_DELAY_MS = 2000;

/**
 * Search for fencers by name
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of fencer results
 */
async function searchFencers(query) {
  const { variants } = normalizeQuery(query);

  // Try each variant
  for (const variant of variants) {
    const cacheKey = `search:${variant.toLowerCase()}`;

    // Check cache first
    const cached = await getCached(cacheKey);
    if (cached) {
      console.log(`Cache hit for search: ${variant}`);
      return cached;
    }

    // Try POST search
    try {
      const results = await searchPost(variant);

      if (results && results.length > 0) {
        // Cache and return
        await setCached(cacheKey, results);
        return results;
      }
    } catch (error) {
      console.error(`Search POST failed for "${variant}":`, error);
      // Continue to next variant
    }
  }

  // All variants failed - return empty array
  console.log('No results found for any variant');
  return [];
}

/**
 * Execute POST search request
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
async function searchPost(query) {
  let lastError = null;

  // Try with one retry on 429/5xx
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, limit: 10 })
      });

      // Handle rate limiting
      if (response.status === 429) {
        console.warn('Rate limited (429), retrying after delay...');
        if (attempt === 0) {
          await delay(RETRY_DELAY_MS);
          continue;
        }
        throw new Error('Rate limited after retry');
      }

      // Handle server errors
      if (response.status >= 500) {
        console.warn(`Server error (${response.status}), retrying...`);
        if (attempt === 0) {
          await delay(RETRY_DELAY_MS);
          continue;
        }
        throw new Error(`Server error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Transform results to standard format
      return data.map(item => {
        // API returns name already formatted as slug (e.g., "Lee-Kiefer")
        // Preserve casing; just replace spaces with hyphens if needed
        const slug = item.name.replace(/\s+/g, '-');

        return {
          id: item.usfa_id || item.id,
          name: item.name,
          slug: slug,
          club: item.club || 'Unknown Club',
          country: item.country || 'USA'
        };
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        console.warn('Search attempt failed, retrying...', error);
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError || new Error('Search failed after retries');
}

/**
 * Helper to delay execution
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
