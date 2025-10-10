# Testing Guide

This guide provides testing scenarios and validation steps for the
Fencer Strength Chrome Extension.

## Testing with Real Data

The extension uses live data from FencingTracker.com. Here are recommended
test cases to validate functionality:

### Single Result Lookup

Test fencers with unique names that return a single result:

- **Lee Kiefer** - Olympic gold medalist (foil)
  - Validates: Profile display, strength ratings, bout statistics
  - Expected: Direct navigation to profile

- **Mariel Zagunis** - Multiple Olympic medals (saber)
  - Validates: Multi-weapon display, historical data
  - Expected: Saber strength card with DE/Pool values

### Multi-Result Lookup

Test common names that return multiple matches:

- **Smith** - Common surname
  - Validates: Search results list, selection flow
  - Expected: List of multiple fencers to choose from

- **John Lee** - Common first + last combination
  - Validates: Disambiguation UI, back button functionality
  - Expected: Multiple results with club/country to differentiate

### Name Format Variations

Test different query formats to validate normalization:

- **"Lee Kiefer"** - Standard format
- **"Kiefer, Lee"** - Comma-separated (last, first)
- **"XIAO Leon (Ruibo)"** - Parenthetical nickname with caps
- **"SIMMONS Ariel (Ari) J."** - Suffix with middle initial

### Regression Checks

- **"Suico, Kyubi Emmanuelle"** - Confirms comma-formatted names resolve to the profile at https://fencingtracker.com/p/100225219/Kyubi%20Emmanuelle-Suico and emit the hyphenated variant (`Kyubi Emmanuelle-Suico`).
- **"Smith, Grace Logan"** - Verifies multi-given-name variants reach https://fencingtracker.com/p/100198963/Grace-Smith and include the `Grace Smith` fallback.
- **"EWART Jr. Stephen P."** - Ensures suffix handling still returns https://fencingtracker.com/p/100210509/Stephen-P-Ewart-Jr and keeps the first-name fallback variants.

### No Results

Test queries that should return no matches:

- **"zzz123xyz"** - Random string
  - Validates: Error handling for no results
  - Expected: "No fencers found" message

### Cache Verification

Test caching behavior:

1. **Initial Lookup**: Search "Lee Kiefer"
   - Check DevTools Network tab for API calls to fencingtracker.com
   - Note response time

2. **Cached Lookup**: Search "Lee Kiefer" again immediately
   - Verify no new network requests in DevTools
   - Response should be near-instant
   - Look for "(cached)" badge in modal header

3. **Cache Expiry**: Wait 24+ hours or manually clear cache
   - Run `chrome.storage.local.clear()` in Console
   - Search "Lee Kiefer" again
   - Verify new API calls appear in Network tab

## Error Handling Validation

### Network Offline

Simulate network issues:

1. Open DevTools (F12)
2. Go to Network tab
3. Select "Offline" from throttling dropdown
4. Attempt a fencer lookup
5. Verify error message: "Unable to reach fencingtracker.com"

### Rate Limit Simulation

Test rate limit handling:

1. Perform many rapid sequential lookups (10+ different fencers)
2. Watch for 429 responses in DevTools Network tab
3. Verify extension shows "Too many requests" message
4. Confirm automatic retry after 2-second delay
5. Check that subsequent requests succeed

For more details on rate limit behavior, see
[Technical Notes](technical-notes.md#rate-limits).

## UI/UX Validation

### Modal Display

Verify modal appearance and behavior:

- Modal centers on screen with overlay backdrop
- Header shows fencer name and profile link
- Chips display club, country, birth year, age (when available)
- Bout statistics card highlights total/wins/losses
- Strength cards show weapon, DE/Pool values with ranges
- Close button (×) dismisses modal
- Clicking overlay backdrop dismisses modal

### Multi-Weapon Display

Test fencers who compete in multiple weapons:

- Each weapon gets separate strength card
- Cards stack vertically in weapon order
- DE and Pool values displayed per weapon
- Missing values show "—" placeholder

### Tracked List Management

- Track at least two fencers (one single-weapon, one multi-weapon), open the tracked list from the popup, and confirm each entry shows a clean name row with inline weapon chips (`Épée · DE 2500 / Pool 1900`, etc.).
- Remove an individual fencer using the inline remove button and confirm the list re-orders alphabetically without stale chips or console errors.
- Use the `Clear All` button, accept the confirmation prompt, and verify the empty-state message returns and the button disables.
- Navigate back to a profile that was removed and ensure the star toggle reads “Track this fencer.”
- Tab through the tracked list controls (chips should be skipped, remove buttons and `Clear All` should receive focus) to validate keyboard accessibility.

### Responsive Behavior

Test modal on different viewport sizes:

- Wide desktop (1920px+): Modal max-width constrains size
- Standard laptop (1366px): Modal fits comfortably
- Narrow viewport (800px): Modal adapts, maintains readability

## Suggested Test Flow

Recommended validation sequence:

1. **Install Extension**: Load unpacked in developer mode
2. **Single Lookup**: Test "Lee Kiefer" (verify profile, cache badge)
3. **Multi-Result**: Test "Smith" (verify selection list, back button)
4. **Name Formats**: Test "Kiefer, Lee" (verify normalization)
5. **Cache Check**: Repeat "Lee Kiefer" (verify cached response)
6. **No Results**: Test "zzz123xyz" (verify error message)
7. **Network Offline**: Test with network disabled (verify error handling)
8. **Clear Cache**: Run `chrome.storage.local.clear()`
9. **Verify Refresh**: Test "Lee Kiefer" (verify new API call)

This flow covers core functionality, caching, error states, and resilience.
