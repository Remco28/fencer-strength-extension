(() => {
  const defaultBaseUrl = 'https://fencingtracker.com';

  if (!globalThis.FENCINGTRACKER_BASE_URL) {
    globalThis.FENCINGTRACKER_BASE_URL = defaultBaseUrl;
  }

  if (!globalThis.FENCING_API_BASE_URL) {
    globalThis.FENCING_API_BASE_URL = 'https://fencingapi.teamremco.org';
  }
})();
