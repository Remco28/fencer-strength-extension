// Strength parser for fencingtracker.com
// Fetches and parses /p/{id}/{slug}/strength HTML

const STRENGTH_BASE_URL = globalThis.FENCINGTRACKER_BASE_URL || 'https://fencingtracker.com';

/**
 * Get fencer strength data
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<Object>} Strength data
 */
async function getStrength(id, slug) {
  const cacheKey = getStrengthCacheKey(id);

  // Check cache first
  const cached = await getCached(cacheKey);
  if (cached) {
    console.log(`Cache hit for strength: ${id}`);
    return cached;
  }

  // Fetch from API
  const strength = await fetchStrength(id, slug);
  await setCached(cacheKey, strength);
  return strength;
}

/**
 * Fetch and parse strength HTML with retry logic
 * @param {string} id - Fencer ID
 * @param {string} slug - Name slug
 * @returns {Promise<Object>} Parsed strength data
 */
async function fetchStrength(id, slug) {
  const url = `${STRENGTH_BASE_URL}/p/${id}/${slug}/strength`;
  let lastError = null;

  // Try with one retry on 429/5xx
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url);

      // Handle rate limiting
      if (response.status === 429) {
        console.warn('Strength fetch rate limited (429), retrying after delay...');
        if (attempt === 0) {
          await delay(2000);
          continue;
        }
        throw new Error('Rate limited after retry');
      }

      // Handle server errors
      if (response.status >= 500) {
        console.warn(`Strength fetch server error (${response.status}), retrying...`);
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
      return parseStrengthHtml(html);
    } catch (error) {
      lastError = error;
      if (attempt === 0 && !error.message.includes('404')) {
        console.warn('Strength fetch attempt failed, retrying...', error);
        await delay(2000);
      }
    }
  }

  throw lastError || new Error('Strength fetch failed after retries');
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
  try {
    // Look for "const series = {...}" in script
    const seriesMatch = html.match(/const\s+series\s*=\s*({[^;]+});/);
    if (!seriesMatch) {
      return null;
    }

    // Parse the JSON
    const seriesData = JSON.parse(seriesMatch[1]);
    return seriesData;
  } catch (error) {
    console.warn('Failed to parse series data:', error);
    return null;
  }
}
