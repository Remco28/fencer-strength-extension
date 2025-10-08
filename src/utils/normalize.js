// Normalization utilities for query strings and slugs
// Used for cache keys and search variants

/**
 * Normalize a query string
 * @param {string} query - Raw query string
 * @returns {Object} { normalized, variants }
 */
function normalizeQuery(query) {
  // Trim and collapse multiple spaces
  const cleaned = query.trim().replace(/\s+/g, ' ');

  // Lowercase for comparison
  const normalized = cleaned.toLowerCase();

  // Generate variants to try
  const variants = [];

  // Original cleaned version
  variants.push(cleaned);

  // Try to detect and swap name order
  const commaIndex = cleaned.indexOf(',');

  if (commaIndex > 0) {
    // Has comma: "Last, First" → "First Last"
    const parts = cleaned.split(',').map(p => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      variants.push(`${parts[1]} ${parts[0]}`);
    }
  } else {
    // No comma: "First Last" → "Last, First"
    const parts = cleaned.split(' ');
    if (parts.length === 2) {
      variants.push(`${parts[1]}, ${parts[0]}`);
    } else if (parts.length > 2) {
      // Multi-part names: try "LastPart, FirstParts"
      const lastName = parts[parts.length - 1];
      const firstNames = parts.slice(0, -1).join(' ');
      variants.push(`${lastName}, ${firstNames}`);
    }
  }

  // Remove duplicates while preserving order
  const uniqueVariants = [...new Set(variants)];

  return {
    normalized,
    variants: uniqueVariants
  };
}

/**
 * Create a slug from a name string
 * @param {string} name - Name to slugify
 * @returns {string} Hyphenated slug
 */
function createSlug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove punctuation
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Collapse multiple hyphens
    .replace(/^-|-$/g, '');    // Trim leading/trailing hyphens
}

/**
 * Parse a slug back to a readable name
 * @param {string} slug - Hyphenated slug
 * @returns {string} Name with spaces
 */
function parseSlug(slug) {
  return slug
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Normalize a weapon name to lowercase standard form
 * @param {string} weapon - Weapon name (e.g., "Foil", "Épée", "Saber")
 * @returns {string} Normalized weapon ('foil', 'epee', 'saber')
 */
function normalizeWeapon(weapon) {
  const lower = weapon.toLowerCase().trim();

  if (lower.includes('foil')) return 'foil';
  if (lower.includes('pee') || lower.includes('epee')) return 'epee'; // Handles "Épée" and "Epee"
  if (lower.includes('saber') || lower.includes('sabre')) return 'saber';

  return lower;
}

/**
 * Create a cache key for search queries
 * @param {string} query - Search query
 * @returns {string} Cache key
 */
function getSearchCacheKey(query) {
  return `search:${normalizeQuery(query).normalized}`;
}

/**
 * Create a cache key for profile data
 * @param {string} id - Fencer ID
 * @returns {string} Cache key
 */
function getProfileCacheKey(id) {
  return `profile:${id}`;
}

/**
 * Create a cache key for strength data
 * @param {string} id - Fencer ID
 * @returns {string} Cache key
 */
function getStrengthCacheKey(id) {
  return `strength:${id}`;
}

/**
 * Create a cache key for history data
 * @param {string} id - Fencer ID
 * @returns {string} Cache key
 */
function getHistoryCacheKey(id) {
  return `history:${id}`;
}
