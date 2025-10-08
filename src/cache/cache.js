// Cache module using chrome.storage.local with TTL support
// Provides 24-hour caching for API responses

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cached data by key
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Cached data or null if expired/missing
 */
async function getCached(key) {
  try {
    const result = await chrome.storage.local.get(key);

    if (!result[key]) {
      return null;
    }

    const { value, expiresAt } = result[key];

    // Check if expired
    if (Date.now() > expiresAt) {
      // Remove expired entry
      await chrome.storage.local.remove(key);
      return null;
    }

    return value;
  } catch (error) {
    console.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

/**
 * Set cached data with TTL
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttlMs - Time to live in milliseconds (default 24h)
 * @returns {Promise<void>}
 */
async function setCached(key, data, ttlMs = DEFAULT_TTL_MS) {
  try {
    const expiresAt = Date.now() + ttlMs;

    await chrome.storage.local.set({
      [key]: {
        value: data,
        expiresAt
      }
    });
  } catch (error) {
    console.error(`Cache set error for key ${key}:`, error);
  }
}

/**
 * Purge all expired cache entries
 * @returns {Promise<number>} Number of entries purged
 */
async function purgeExpired() {
  try {
    const allData = await chrome.storage.local.get(null);
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, entry] of Object.entries(allData)) {
      if (entry.expiresAt && now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      await chrome.storage.local.remove(expiredKeys);
    }

    return expiredKeys.length;
  } catch (error) {
    console.error('Cache purge error:', error);
    return 0;
  }
}

/**
 * Clear all cache entries
 * @returns {Promise<void>}
 */
async function clearCache() {
  try {
    await chrome.storage.local.clear();
  } catch (error) {
    console.error('Cache clear error:', error);
  }
}

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache stats (count, size estimate)
 */
async function getCacheStats() {
  try {
    const allData = await chrome.storage.local.get(null);
    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;

    for (const entry of Object.values(allData)) {
      if (entry.expiresAt) {
        if (now > entry.expiresAt) {
          expiredCount++;
        } else {
          activeCount++;
        }
      }
    }

    return {
      active: activeCount,
      expired: expiredCount,
      total: activeCount + expiredCount
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return { active: 0, expired: 0, total: 0 };
  }
}
