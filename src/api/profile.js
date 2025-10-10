// Profile parser for fencingtracker.com
// Fetches and parses /p/{id}/{slug} HTML

const PROFILE_BASE_URL = globalThis.FENCINGTRACKER_BASE_URL || 'https://fencingtracker.com';

/**
 * Get fencer profile HTML with caching and slug fallback
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @param {string} fallbackName - Optional fallback name for slug regeneration
 * @returns {Promise<{html: string, id: string, slug: string}>} Cached or fetched HTML
 */
async function getProfile(id, slug, fallbackName = null) {
  const cacheKey = getProfileCacheKey(id);

  // Check cache first
  const cached = await getCached(cacheKey);
  if (cached) {
    console.log(`Cache hit for profile: ${id}`);
    return cached;
  }

  // Fetch from API
  try {
    const result = await fetchProfileHtml(id, slug);
    await setCached(cacheKey, result);
    return result;
  } catch (error) {
    // Try with regenerated slug if we have a fallback name
    if (error.message.includes('404') && fallbackName) {
      console.warn(`Profile 404 for ${id}/${slug}, trying regenerated slug...`);
      const newSlug = createSlug(fallbackName);
      if (!newSlug) {
        throw error;
      }
      const result = await fetchProfileHtml(id, newSlug);
      const updatedResult = { ...result, slug: newSlug };
      await setCached(cacheKey, updatedResult);
      return updatedResult;
    }
    throw error;
  }
}

/**
 * Fetch profile HTML with retry logic (background-safe, no parsing)
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<{html: string, id: string, slug: string}>} Raw HTML and metadata
 */
async function fetchProfileHtml(id, slug) {
  const url = `${PROFILE_BASE_URL}/p/${id}/${slug}`;
  let lastError = null;

  // Try with one retry on 429/5xx
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url);

      // Handle rate limiting
      if (response.status === 429) {
        console.warn('Profile fetch rate limited (429), retrying after delay...');
        if (attempt === 0) {
          await delay(2000);
          continue;
        }
        throw new Error('Rate limited after retry');
      }

      // Handle server errors
      if (response.status >= 500) {
        console.warn(`Profile fetch server error (${response.status}), retrying...`);
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
      return { html, id, slug };
    } catch (error) {
      lastError = error;
      if (attempt === 0 && !error.message.includes('404')) {
        console.warn('Profile fetch attempt failed, retrying...', error);
        await delay(2000);
      }
    }
  }

  throw lastError || new Error('Profile fetch failed after retries');
}

/**
 * DEPRECATED: Fetch and parse profile HTML (kept for backward compatibility if needed)
 * Use fetchProfileHtml and parse in content script instead
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<Object>} Parsed profile data
 */
async function fetchProfile(id, slug) {
  const result = await fetchProfileHtml(id, slug);
  return parseProfileHtml(result.html, result.id, result.slug);
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
