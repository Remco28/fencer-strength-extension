// Mock data utilities for Phase 2 testing
// These simulate API responses from FencingTracker.com
// Functions are exposed globally for use by content script

/**
 * Mock search for fencers
 * @param {string} query - The search query
 * @returns {Promise<Object>} Search results with matches array
 */
async function searchMock(query) {
  // Simulate network delay
  await delay(300);

  const queryLower = query.toLowerCase().trim();

  // Multi-result case
  if (queryLower === 'john doe' || queryLower === 'john') {
    return {
      success: true,
      results: [
        { id: '12345', name: 'John Doe', club: 'NYC Fencing', country: 'USA' },
        { id: '12346', name: 'John A. Doe', club: 'LA Fencing', country: 'USA' },
        { id: '12347', name: 'Johnny Doe', club: 'Boston FC', country: 'USA' }
      ]
    };
  }

  // Single result case
  if (queryLower === 'jane doe' || queryLower === 'jane') {
    return {
      success: true,
      results: [
        { id: '54321', name: 'Jane Doe', club: 'Chicago Fencing', country: 'USA' }
      ]
    };
  }

  // Multi-weapon fencer case
  if (queryLower === 'alex smith' || queryLower === 'alex') {
    return {
      success: true,
      results: [
        { id: '99999', name: 'Alex Smith', club: 'Seattle Fencing', country: 'USA' }
      ]
    };
  }

  // No results case
  if (queryLower === 'unknown' || queryLower === 'nobody') {
    return {
      success: true,
      results: []
    };
  }

  // Error case
  if (queryLower === 'error') {
    throw new Error('Mock error: Unable to search');
  }

  // Default: single generic result
  return {
    success: true,
    results: [
      { id: '00000', name: query, club: 'Mock Fencing Club', country: 'USA' }
    ]
  };
}

/**
 * Mock fetch profile data for a fencer
 * @param {string} id - The fencer ID
 * @returns {Promise<Object>} Profile data
 */
async function fetchProfileMock(id) {
  await delay(200);

  const profiles = {
    '12345': {
      id: '12345',
      name: 'John Doe',
      club: 'NYC Fencing',
      country: 'USA',
      birthYear: 1995,
      gender: 'M'
    },
    '12346': {
      id: '12346',
      name: 'John A. Doe',
      club: 'LA Fencing',
      country: 'USA',
      birthYear: 1998,
      gender: 'M'
    },
    '12347': {
      id: '12347',
      name: 'Johnny Doe',
      club: 'Boston FC',
      country: 'USA',
      birthYear: 1992,
      gender: 'M'
    },
    '54321': {
      id: '54321',
      name: 'Jane Doe',
      club: 'Chicago Fencing',
      country: 'USA',
      birthYear: 1996,
      gender: 'F'
    },
    '99999': {
      id: '99999',
      name: 'Alex Smith',
      club: 'Seattle Fencing',
      country: 'USA',
      birthYear: 1993,
      gender: 'M'
    },
    '00000': {
      id: '00000',
      name: 'Generic Fencer',
      club: 'Mock Fencing Club',
      country: 'USA',
      birthYear: 1990,
      gender: 'M'
    }
  };

  const profile = profiles[id];
  if (!profile) {
    throw new Error(`Profile not found for ID: ${id}`);
  }

  return profile;
}

/**
 * Mock fetch strength data for a fencer
 * @param {string} id - The fencer ID
 * @returns {Promise<Object>} Strength data with ratings per weapon
 */
async function fetchStrengthMock(id) {
  await delay(250);

  const strengths = {
    '12345': {
      weapons: {
        epee: {
          domesticStrength: 'B2',
          pool: 65
        }
      }
    },
    '12346': {
      weapons: {
        foil: {
          domesticStrength: 'C1',
          pool: 45
        }
      }
    },
    '12347': {
      weapons: {
        saber: {
          domesticStrength: 'A3',
          pool: 85
        }
      }
    },
    '54321': {
      weapons: {
        epee: {
          domesticStrength: 'B1',
          pool: 72
        }
      }
    },
    '99999': {
      // Multi-weapon fencer
      weapons: {
        epee: {
          domesticStrength: 'A2',
          pool: 88
        },
        foil: {
          domesticStrength: 'B3',
          pool: 62
        },
        saber: {
          domesticStrength: 'C2',
          pool: 52
        }
      }
    },
    '00000': {
      weapons: {
        epee: {
          domesticStrength: 'U',
          pool: 0
        }
      }
    }
  };

  const strength = strengths[id];
  if (!strength) {
    throw new Error(`Strength data not found for ID: ${id}`);
  }

  return strength;
}

/**
 * Helper function to simulate network delay
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
