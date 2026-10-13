// fencing-api client (fencingapi.teamremco.org)
// When a key is saved in the popup, lookups go through the home server's API,
// which scrapes FencingTracker once and serves everyone from its store.
// Any failure (no key, server down, rate limited, not found) returns null so
// the caller falls back to fetching FencingTracker directly.

const FENCING_API_KEY_STORAGE_KEY = 'fsApiKey';
const FENCING_API_TIMEOUT_MS = 15000;

/**
 * Read the saved API key
 * @returns {Promise<string|null>}
 */
async function getFencingApiKey() {
  try {
    const result = await chrome.storage.local.get(FENCING_API_KEY_STORAGE_KEY);
    const key = result[FENCING_API_KEY_STORAGE_KEY];
    return typeof key === 'string' && key.trim() ? key.trim() : null;
  } catch (error) {
    return null;
  }
}

/**
 * GET a fencing-api path with ?live=true
 * @param {string} path - e.g. /v1/tracker/search
 * @param {Object} params - query parameters
 * @returns {Promise<Object|null>} Response body, or null when unusable
 */
async function fencingApiGet(path, params) {
  const key = await getFencingApiKey();
  if (!key) {
    return null;
  }

  const base = globalThis.FENCING_API_BASE_URL || 'https://fencingapi.teamremco.org';
  const url = new URL(path, base);
  Object.entries({ ...params, live: 'true' }).forEach(([name, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(name, value);
    }
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FENCING_API_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: controller.signal
    });
    if (response.status !== 200 && response.status !== 202) {
      console.warn(`fencing-api ${path}: HTTP ${response.status}, falling back to FencingTracker`);
      return null;
    }
    const body = await response.json();
    // 202 with nothing stored yet: the scrape is still running; don't wait for it.
    if (!body || !body.fetched_at) {
      return null;
    }
    return body;
  } catch (error) {
    console.warn(`fencing-api ${path} unreachable, falling back to FencingTracker`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search through fencing-api. Same shape as searchFencers().
 * @param {string} query
 * @returns {Promise<Array|null>}
 */
async function apiSearchFencers(query) {
  const body = await fencingApiGet('/v1/tracker/search', { q: query });
  if (!body || !Array.isArray(body.items)) {
    return null;
  }
  return body.items.map(item => ({
    id: item.tracker_id,
    // FencingTracker's search names are slugs ("Lee-Kiefer"); keep showing them as before.
    name: item.slug || item.name,
    slug: item.slug,
    club: item.club || 'Unknown Club',
    country: 'USA',
    via: 'fencing-api'
  }));
}

function fencerPath(id, tab) {
  return `/v1/tracker/fencers/${encodeURIComponent(id)}/${tab}`;
}

/**
 * Profile through fencing-api. Returns { parsed, id, slug, via } instead of { html, ... }.
 */
async function apiGetProfile(id, slug) {
  const body = await fencingApiGet(fencerPath(id, 'profile'), { slug });
  const item = body && Array.isArray(body.items) ? body.items[0] : null;
  if (!item) {
    return null;
  }
  if (!('birth_year' in item)) {
    // Without birth year the API isn't treating us as a keyed app; the direct path has it.
    return null;
  }
  return {
    id,
    slug: item.slug || slug,
    via: 'fencing-api',
    parsed: {
      id,
      slug: item.slug || slug,
      name: item.name,
      birthYear: item.birth_year || null,
      club: item.club || null,
      country: item.country || 'USA'
    }
  };
}

/**
 * Strength through fencing-api, in the same shape as parseStrengthHtml().
 */
async function apiGetStrength(id, slug) {
  const body = await fencingApiGet(fencerPath(id, 'strength'), { slug });
  if (!body || !Array.isArray(body.items)) {
    return null;
  }
  const weapons = {};
  const series = {};
  body.items.forEach(entry => {
    if (!entry || !entry.weapon) {
      return;
    }
    ['de', 'pool'].forEach(type => {
      const data = entry[type];
      if (!data || data.value === null || data.value === undefined) {
        return;
      }
      const min = data.min ?? data.estimate_low;
      const max = data.max ?? data.estimate_high;
      weapons[entry.weapon] = weapons[entry.weapon] || {};
      weapons[entry.weapon][type] = {
        value: data.value,
        ...(min !== null && min !== undefined && max !== null && max !== undefined ? { min, max } : {})
      };
    });
    if (entry.series) {
      series[entry.weapon] = entry.series;
    }
  });
  return { via: 'fencing-api', parsed: { weapons, series } };
}

/**
 * All-time win/loss through fencing-api, in the same shape as parseHistoryHtml().
 */
async function apiGetHistory(id, slug) {
  const body = await fencingApiGet(fencerPath(id, 'history'), { slug });
  const item = body && Array.isArray(body.items) ? body.items[0] : null;
  if (!item) {
    return null;
  }
  const wins = item.wins || 0;
  const losses = item.losses || 0;
  const bouts = wins + losses;
  return {
    via: 'fencing-api',
    parsed: {
      wins,
      losses,
      bouts,
      winRatio: bouts > 0 ? (wins / bouts * 100).toFixed(1) : '0.0'
    }
  };
}

/**
 * Try fencing-api first, then the direct FencingTracker function.
 * @param {Function} viaApi
 * @param {Function} direct
 * @returns {Function}
 */
function preferFencingApi(viaApi, direct) {
  return async (...args) => {
    const result = await viaApi(...args);
    if (result) {
      return result;
    }
    return direct(...args);
  };
}
