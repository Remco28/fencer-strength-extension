'use strict';

const MY_KIDS_STORAGE_KEY = 'fsMyKids';
const MAX_MY_KIDS = 2;

const kidsListEl = document.getElementById('kids-list');
const kidsEmptyEl = document.getElementById('kids-empty');
const addRowEl = document.getElementById('add-row');
const kidSearchInput = document.getElementById('kid-search');
const kidSearchBtn = document.getElementById('kid-search-btn');
const searchResultsEl = document.getElementById('search-results');
const viewFavoritesButton = document.getElementById('view-favorites');
const statusElement = document.getElementById('popup-status');

let kidsCache = [];

initPopup();

/**
 * Bootstrap popup UI
 */
async function initPopup() {
  await refreshKidsList();

  if (kidSearchBtn) {
    kidSearchBtn.addEventListener('click', () => runKidSearch());
  }

  if (kidSearchInput) {
    kidSearchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runKidSearch();
      }
    });
  }

  if (viewFavoritesButton) {
    viewFavoritesButton.addEventListener('click', openFavorites);
  }
}

/**
 * Call a background API function
 * @param {string} functionName
 * @param {...any} args
 * @returns {Promise<any>}
 */
function callBackgroundApi(functionName, ...args) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'fsCallBackgroundApi',
        functionName,
        args
      },
      response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Runtime messaging error'));
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

/**
 * Load kids from storage
 * @returns {Promise<Array>}
 */
function getMyKids() {
  return new Promise(resolve => {
    chrome.storage.local.get(MY_KIDS_STORAGE_KEY, result => {
      if (chrome.runtime.lastError) {
        console.warn(chrome.runtime.lastError);
        resolve([]);
        return;
      }
      const raw = result[MY_KIDS_STORAGE_KEY];
      if (!Array.isArray(raw)) {
        resolve([]);
        return;
      }
      resolve(
        raw
          .filter(entry => entry && entry.id && entry.name)
          .slice(0, MAX_MY_KIDS)
          .map(entry => ({
            id: String(entry.id),
            slug: entry.slug || deriveSlug(entry.name),
            name: entry.name
          }))
      );
    });
  });
}

/**
 * Persist kids list
 * @param {Array} kids
 * @returns {Promise<void>}
 */
function setMyKids(kids) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [MY_KIDS_STORAGE_KEY]: kids.slice(0, MAX_MY_KIDS) }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Derive slug from search name (often already hyphenated)
 * @param {string} name
 * @returns {string}
 */
function deriveSlug(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  if (trimmed.includes('-') && !trimmed.includes(' ')) {
    return trimmed;
  }
  return trimmed.replace(/\s+/g, '-');
}

/**
 * Display name from search result name field
 * @param {string} name
 * @returns {string}
 */
function displayNameFromSearch(name) {
  if (!name) return 'Unknown';
  return String(name).replace(/-/g, ' ');
}

/**
 * Refresh kids list UI
 */
async function refreshKidsList() {
  kidsCache = await getMyKids();
  if (!kidsListEl || !kidsEmptyEl) {
    return;
  }

  kidsListEl.innerHTML = '';

  if (kidsCache.length === 0) {
    kidsEmptyEl.classList.remove('hidden');
  } else {
    kidsEmptyEl.classList.add('hidden');
    kidsCache.forEach(kid => {
      const li = document.createElement('li');
      li.className = 'kid-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'kid-name';
      nameSpan.textContent = kid.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'kid-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', `Remove ${kid.name}`);
      removeBtn.addEventListener('click', () => removeKid(kid.id));

      li.appendChild(nameSpan);
      li.appendChild(removeBtn);
      kidsListEl.appendChild(li);
    });
  }

  const atCapacity = kidsCache.length >= MAX_MY_KIDS;
  if (addRowEl) {
    addRowEl.style.display = atCapacity ? 'none' : 'flex';
  }
  if (searchResultsEl && atCapacity) {
    searchResultsEl.classList.add('hidden');
    searchResultsEl.innerHTML = '';
  }
}

/**
 * Remove a kid by id
 * @param {string} id
 */
async function removeKid(id) {
  try {
    const next = kidsCache.filter(kid => String(kid.id) !== String(id));
    await setMyKids(next);
    setStatus('');
    await refreshKidsList();
  } catch (error) {
    console.error(error);
    setStatus('Could not remove kid.', true);
  }
}

/**
 * Run search against fencingtracker
 */
async function runKidSearch() {
  if (!kidSearchInput) {
    return;
  }

  const query = kidSearchInput.value.trim();
  if (!query) {
    setStatus('Enter a name to search.', true);
    return;
  }

  if (kidsCache.length >= MAX_MY_KIDS) {
    setStatus('You already have 2 kids saved.', true);
    return;
  }

  if (kidSearchBtn) {
    kidSearchBtn.disabled = true;
  }
  setStatus('Searching…');

  try {
    const results = await callBackgroundApi('searchFencers', query);
    renderSearchResults(Array.isArray(results) ? results : []);
    if (!results || results.length === 0) {
      setStatus('No fencers found. Try another spelling.', true);
    } else {
      setStatus(`Select a result (${results.length} found).`);
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Search failed.', true);
    if (searchResultsEl) {
      searchResultsEl.classList.add('hidden');
      searchResultsEl.innerHTML = '';
    }
  } finally {
    if (kidSearchBtn) {
      kidSearchBtn.disabled = false;
    }
  }
}

/**
 * Render search results list
 * @param {Array} results
 */
function renderSearchResults(results) {
  if (!searchResultsEl) {
    return;
  }

  searchResultsEl.innerHTML = '';
  if (!results.length) {
    searchResultsEl.classList.add('hidden');
    return;
  }

  searchResultsEl.classList.remove('hidden');

  results.forEach(result => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result';
    button.setAttribute('role', 'option');

    const name = displayNameFromSearch(result.name || result.slug || 'Unknown');
    const club = result.club || 'Unknown club';

    const nameEl = document.createElement('span');
    nameEl.className = 'search-result-name';
    nameEl.textContent = name;

    const clubEl = document.createElement('span');
    clubEl.className = 'search-result-club';
    clubEl.textContent = club;

    button.appendChild(nameEl);
    button.appendChild(clubEl);
    button.addEventListener('click', () => addKidFromResult(result));

    li.appendChild(button);
    searchResultsEl.appendChild(li);
  });
}

/**
 * Add kid from a search result
 * @param {Object} result
 */
async function addKidFromResult(result) {
  if (!result || result.id == null) {
    setStatus('Invalid search result.', true);
    return;
  }

  if (kidsCache.length >= MAX_MY_KIDS) {
    setStatus('You already have 2 kids saved.', true);
    return;
  }

  const id = String(result.id);
  if (kidsCache.some(kid => String(kid.id) === id)) {
    setStatus('That fencer is already in My kids.', true);
    return;
  }

  const entry = {
    id,
    slug: result.slug || deriveSlug(result.name || ''),
    name: displayNameFromSearch(result.name || result.slug || 'Unknown')
  };

  try {
    const next = [...kidsCache, entry].slice(0, MAX_MY_KIDS);
    await setMyKids(next);
    if (kidSearchInput) {
      kidSearchInput.value = '';
    }
    if (searchResultsEl) {
      searchResultsEl.classList.add('hidden');
      searchResultsEl.innerHTML = '';
    }
    setStatus(`Added ${entry.name}.`);
    await refreshKidsList();
  } catch (error) {
    console.error(error);
    setStatus('Could not save kid.', true);
  }
}

/**
 * Open favorites list on the active tab
 */
function openFavorites() {
  if (!viewFavoritesButton) {
    return;
  }

  viewFavoritesButton.disabled = true;
  setStatus('Opening favorites…');

  chrome.runtime.sendMessage({ action: 'fsShowTrackedFencers' }, response => {
    if (chrome.runtime.lastError) {
      console.error('popup message failed:', chrome.runtime.lastError);
      setStatus('Unable to reach the background script. Reload the extension and try again.', true);
      viewFavoritesButton.disabled = false;
      return;
    }

    if (response && response.success) {
      setStatus('');
      window.close();
      return;
    }

    const message =
      (response && response.error) ||
      'Please open the extension on a regular web page to view favorites.';
    setStatus(message, true);
    viewFavoritesButton.disabled = false;
  });
}

/**
 * Update popup status text
 * @param {string} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError) {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message || '';
  statusElement.classList.toggle('error', Boolean(isError && message));
}
