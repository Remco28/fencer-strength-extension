(() => {
  const defaultBaseUrl = 'https://fencingtracker.com';

  if (!globalThis.FENCINGTRACKER_BASE_URL) {
    globalThis.FENCINGTRACKER_BASE_URL = defaultBaseUrl;
  }
})();
