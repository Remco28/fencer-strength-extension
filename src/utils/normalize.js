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

  // Structured variants for formats like "XIAO Leon (Ruibo)"
  const structured = parseStructuredExternalName(cleaned);
  if (structured) {
    const structuredVariants = buildStructuredVariants(structured);
    structuredVariants.forEach(variant => pushVariant(variants, variant));
  }

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
      pushVariant(variants, `${parts[1]}, ${parts[0]}`);
    } else if (parts.length > 2) {
      // Multi-part names: try "LastPart, FirstParts"
      const lastName = parts[parts.length - 1];
      const sanitizedLast = lastName ? lastName.replace(/[^A-Za-z'-]/g, '') : '';
      if (lastName && !/[()]/.test(lastName) && sanitizedLast.length > 1) {
        const firstNames = parts.slice(0, -1).join(' ');
        pushVariant(variants, `${lastName}, ${firstNames}`);
      }
    }

    // Handle East Asian-style names (uppercase surname first)
    const allUppercase = parts.length >= 3 && parts.every(token => token === token.toUpperCase());
    const mixedCaseSurnameFirst =
      parts.length >= 3 &&
      !allUppercase &&
      isLikelySurnameToken(parts[0]) &&
      parts.slice(1).some(token => token !== token.toUpperCase()) &&
      !NAME_SUFFIXES.has(parts[1].replace(/[.,]/g, '').toLowerCase());

    if (allUppercase || mixedCaseSurnameFirst) {
      const surname = capitalizeToken(parts[0]);
      const remainingTokens = parts
        .slice(1)
        .filter(token => !NAME_SUFFIXES.has(token.replace(/[.,]/g, '').toLowerCase()));

      if (remainingTokens.length > 0) {
        const givenTokens = remainingTokens.map(capitalizeToken);
        const givenNames = givenTokens.join(' ');
        const firstGiven = givenTokens[0];

        pushVariant(variants, `${givenNames} ${surname}`);
        pushVariant(variants, `${surname}, ${givenNames}`);
        pushVariant(variants, `${surname}, ${firstGiven}`);
        pushVariant(variants, `${firstGiven} ${surname}`);
      }
    } else if (
      parts.length >= 3 &&
      isLikelySurnameToken(parts[0]) &&
      NAME_SUFFIXES.has(parts[1].replace(/[.,]/g, '').toLowerCase())
    ) {
      // Handle patterns like "EWART Jr. Stephen P." by providing a first-name-only variant
      const surname = capitalizeToken(parts[0]);
      const remainingTokens = parts.slice(2).map(capitalizeToken);
      if (remainingTokens.length > 0) {
        const givenNames = remainingTokens.join(' ');
        const firstGiven = remainingTokens[0];
        pushVariant(variants, `${givenNames} ${surname}`);
        pushVariant(variants, `${surname}, ${givenNames}`);
        pushVariant(variants, `${firstGiven} ${surname}`);
        pushVariant(variants, `${surname}, ${firstGiven}`);
      }
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
  if (!name) return '';

  // Preserve case/diacritics and nickname parentheses to match fencingtracker slugs; only strip punctuation they reject.
  const collapsedWhitespace = String(name).trim().replace(/\s+/g, ' ');
  const normalizedDashes = collapsedWhitespace.replace(/[\u2012-\u2015]/g, '-');
  const sanitized = normalizedDashes.replace(/[^\p{L}\p{N}\s\-()]/gu, '');

  let result = '';
  let parenDepth = 0;

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];

    if (char === '(') {
      parenDepth++;
      result += char;
      continue;
    }

    if (char === ')') {
      if (parenDepth > 0) {
        parenDepth--;
      }
      result += char;
      continue;
    }

    if (char === ' ') {
      const nextChar = sanitized[i + 1];
      if (parenDepth > 0) {
        result += ' ';
      } else if (nextChar === '(') {
        result += ' ';
      } else if (nextChar) {
        result += '-';
      }
      continue;
    }

    result += char;
  }

  return result
    .replace(/-+/g, '-')   // Collapse multiple hyphens
    .replace(/\s{2,}/g, ' ') // Collapse extra spaces (e.g., multiple spaces inside parens)
    .trim()
    .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens
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
 * Build a slug from an arbitrary name string
 * @param {string} name - Raw name (may include commas, nicknames, suffixes)
 * @returns {string} Hyphenated slug in "first-last" order
 */
function buildSlugFromName(name) {
  if (!name) return '';

  const trimmed = name.trim();
  if (!trimmed) return '';

  const structured = parseStructuredExternalName(trimmed);
  if (structured) {
    const parts = [];

    if (structured.firstNames) {
      parts.push(structured.firstNames);
    }

    if (structured.nickname) {
      parts.push(`(${structured.nickname})`);
    }

    if (structured.lastName) {
      parts.push(structured.lastName);
    }

    let base = parts.join(' ').trim();

    if (structured.suffix) {
      base = `${base} ${structured.suffix}`.trim();
    }

    const candidate = base ? createSlug(base) : '';
    if (candidate) {
      return candidate;
    }

    return createSlug(base || trimmed);
  }

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length === 2) {
      return createSlug(`${parts[1]} ${parts[0]}`);
    }
  }

  return createSlug(trimmed);
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

const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', 'vi']);

/**
 * Attempt to parse structured names from sources like fencingtimelive.com
 * Example: "XIAO Leon (Ruibo)" → { lastName: "Xiao", firstNames: "Leon", nickname: "Ruibo" }
 * @param {string} rawName - Raw name string
 * @returns {Object|null} Parsed name parts or null when unable to parse
 */
function parseStructuredExternalName(rawName) {
  if (!rawName) return null;

  // Extract nickname within parentheses (if present)
  const nicknameMatch = rawName.match(/\(([^)]+)\)/);
  const nickname = nicknameMatch ? nicknameMatch[1].trim() : null;

  // Remove parentheses content and collapse whitespace
  const withoutNick = rawName.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!withoutNick) return null;

  const commaParts = withoutNick
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (commaParts.length >= 2) {
    const surnameTokens = commaParts[0]
      .split(' ')
      .map(token => token.replace(/[.,]+$/g, ''))
      .filter(Boolean);

    const remainderJoined = commaParts.slice(1).join(' ').replace(/\s+/g, ' ').trim();
    const remainderTokens = remainderJoined
      .split(' ')
      .map(token => token.replace(/[.,]+$/g, ''))
      .filter(Boolean);

    let suffix = null;

    if (remainderTokens.length > 0) {
      const candidateSuffix = remainderTokens[remainderTokens.length - 1];
      if (NAME_SUFFIXES.has(candidateSuffix.toLowerCase())) {
        suffix = remainderTokens.pop();
      }
    }

    let givenTokens = remainderTokens;

    if (givenTokens.length === 0 && nickname) {
      givenTokens = [nickname];
    }

    if (surnameTokens.length > 0 && givenTokens.length > 0) {
      const formattedLastName = surnameTokens.map(formatNameToken).join(' ').trim();
      const formattedFirstNames = givenTokens.map(formatNameToken).join(' ').trim();
      const formattedSuffix = suffix ? suffix.replace(/,$/, '') : null;
      const formattedNickname = nickname ? formatNameToken(nickname) : null;

      if (formattedLastName && formattedFirstNames) {
        return {
          lastName: formattedLastName,
          firstNames: formattedFirstNames,
          suffix: formattedSuffix,
          nickname: formattedNickname
        };
      }
    }
  }

  const tokens = withoutNick
    .split(' ')
    .map(token => token.replace(/[.,]+$/g, ''))
    .filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  // Identify leading uppercase tokens as potential surname
  const lastTokens = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (isLikelySurnameToken(token) && !NAME_SUFFIXES.has(token.toLowerCase())) {
      lastTokens.push(token);
      index++;
      continue;
    }
    break;
  }

  if (lastTokens.length === 0) {
    // Fallback to assuming final token is the surname
    const fallbackLast = tokens[tokens.length - 1];
    if (!fallbackLast) return null;
    lastTokens.push(fallbackLast);
    index = Math.max(tokens.length - 1, 1);
  }

  let suffix = null;

  if (index < tokens.length) {
    const candidate = tokens[index].replace(/[,]/g, '');
    if (NAME_SUFFIXES.has(candidate.toLowerCase())) {
      suffix = tokens[index];
      index++;
    }
  }

  let givenTokens = tokens.slice(index);

  if (givenTokens.length === 0 && nickname) {
    givenTokens = [nickname];
  }

  if (givenTokens.length === 0) {
    // As a final fallback, use any remaining tokens after the surname
    givenTokens = tokens.slice(lastTokens.length);
  }

  if (givenTokens.length === 0) {
    return null;
  }

  const formattedLastName = lastTokens.map(formatNameToken).join(' ');
  const formattedFirstNames = givenTokens.map(formatNameToken).join(' ').trim();
  const formattedSuffix = suffix ? suffix.replace(/,$/, '') : null;
  const formattedNickname = nickname ? formatNameToken(nickname) : null;

  if (!formattedLastName || !formattedFirstNames) {
    return null;
  }

  return {
    lastName: formattedLastName,
    firstNames: formattedFirstNames,
    suffix: formattedSuffix,
    nickname: formattedNickname
  };
}

/**
 * Build search variants from parsed name parts
 * @param {Object} parts - Parsed name parts
 * @returns {string[]} Array of name variants
 */
function buildStructuredVariants(parts) {
  const variants = [];
  const { firstNames, lastName, suffix, nickname } = parts;

  const primary = `${firstNames} ${lastName}`.trim();
  const primaryWithSuffix = suffix ? `${primary} ${suffix}`.trim() : primary;
  pushVariant(variants, primaryWithSuffix);

  if (suffix) {
    pushVariant(variants, primary); // Variant without suffix
  }

  const commaVariant = suffix
    ? `${lastName}, ${firstNames} ${suffix}`.trim()
    : `${lastName}, ${firstNames}`.trim();
  pushVariant(variants, commaVariant);

  const firstTokens = firstNames.split(' ').filter(Boolean);
  const firstToken = firstTokens[0];

  if (firstToken) {
    const firstLast = `${firstToken} ${lastName}`.trim();
    pushVariant(variants, firstLast);

    if (suffix) {
      pushVariant(variants, `${firstLast} ${suffix}`.trim());
    }

    const commaFirst = `${lastName}, ${firstToken}`.trim();
    pushVariant(variants, commaFirst);

    if (suffix) {
      pushVariant(variants, `${lastName}, ${firstToken} ${suffix}`.trim());
    }
  }

  const normalizedFirstNames = firstNames.replace(/\s+/g, ' ').trim();
  const normalizedLastName = lastName.replace(/\s+/g, ' ').trim();

  if (normalizedFirstNames && normalizedLastName) {
    const hyphenated = `${normalizedFirstNames}-${normalizedLastName}`.trim();
    pushVariant(variants, hyphenated);

    if (suffix) {
      pushVariant(variants, `${hyphenated} ${suffix}`.trim());
    }

    const commaHyphenated = `${normalizedLastName}, ${hyphenated}`.trim();
    pushVariant(variants, commaHyphenated);

    if (suffix) {
      pushVariant(variants, `${normalizedLastName}, ${hyphenated} ${suffix}`.trim());
    }
  }

  const firstNamesNoTrailingInitials = stripTrailingInitials(firstNames);
  if (firstNamesNoTrailingInitials && firstNamesNoTrailingInitials !== firstNames) {
    const trimmedPrimary = `${firstNamesNoTrailingInitials} ${lastName}`.trim();
    const trimmedWithSuffix = suffix ? `${trimmedPrimary} ${suffix}`.trim() : trimmedPrimary;
    pushVariant(variants, trimmedWithSuffix);
    pushVariant(variants, trimmedPrimary);

    const trimmedComma = suffix
      ? `${lastName}, ${firstNamesNoTrailingInitials} ${suffix}`.trim()
      : `${lastName}, ${firstNamesNoTrailingInitials}`.trim();
    pushVariant(variants, trimmedComma);
  }

  if (nickname && nickname.toLowerCase() !== firstNames.toLowerCase()) {
    pushVariant(variants, `${nickname} ${lastName}`.trim());
    pushVariant(variants, `${lastName}, ${nickname}`.trim());
  }

  return variants.filter(Boolean);
}

/**
 * Determine if a token should be treated as part of an uppercase surname
 * @param {string} token - Token to inspect
 * @returns {boolean} True if token looks like an uppercase surname segment
 */
function isLikelySurnameToken(token) {
  if (!token) return false;
  const sanitized = token.replace(/['’\-\.]/g, '');
  if (!/[A-Za-z]/.test(sanitized)) {
    return false;
  }

  // Treat single-letter abbreviations as likely initials, not surname
  if (sanitized.length === 1 && sanitized === sanitized.toUpperCase()) {
    return false;
  }

  return sanitized === sanitized.toUpperCase();
}

/**
 * Convert a name token to title case while preserving hyphens/apostrophes
 * @param {string} token - Token to format
 * @returns {string} Formatted token
 */
function formatNameToken(token) {
  if (!token) return token;
  const lower = token.toLowerCase();
  return lower.replace(/(^|[-'\s])[a-z]/g, match => match.toUpperCase());
}

function capitalizeToken(token) {
  if (!token) return token;
  return token
    .toLowerCase()
    .replace(/(^|[-'\s])[a-z]/g, match => match.toUpperCase());
}

function stripTrailingInitials(firstNames) {
  if (!firstNames) return firstNames;
  const tokens = firstNames.split(' ').filter(Boolean);
  while (tokens.length > 1 && isInitialToken(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(' ');
}

function isInitialToken(token) {
  if (!token) return false;
  const cleaned = token.replace(/\./g, '');
  return cleaned.length === 1;
}

function pushVariant(list, value) {
  if (!value) return;
  if (list.includes(value)) return;
  list.push(value);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeQuery,
    parseStructuredExternalName,
    buildStructuredVariants
  };
}
