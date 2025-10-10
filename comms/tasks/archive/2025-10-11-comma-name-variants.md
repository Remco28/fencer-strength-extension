# Task: Comma-Name Variant Repairs

**Owner:** Architect  
**Status:** Ready for Implementation  
**Priority:** Blocker › Live Data Regression

## Objective
Prevent regressions where comma-formatted names (e.g., “Suico, Kyubi Emmanuelle”) produce unusable search variants. Update the normalization helpers so we generate variants that align with fencingtracker’s canonical slugs and allow the extension to resolve live profiles reliably.

## Background
Testing uncovered two failures:

- `Suico, Kyubi Emmanuelle` only emits variants such as “Emmanuelle Emmanuelle”, never “Kyubi Suico”, so every search attempt misses the real record (`Kyubi Emmanuelle-Suico`).
- `Smith, Grace Logan` collapses to “Grace Logan Smith” without a “Grace Smith” fallback, which fencingtracker expects. This name likely mirrors many two-given-name cases in the wild.

Both issues stem from `parseStructuredExternalName` misclassifying the surname when the comma-separated “Last, First …” format is present, plus `buildStructuredVariants` not emitting reduced given-name variants. The slug-generation work from 2025-10-10 remains intact; we only need to improve the structured-name path.

## Scope & Constraints
- Touch **only** `src/utils/normalize.js` and associated unit tests/docs. No API or messaging changes.
- Preserve existing behaviour for East-Asian uppercase surnames, suffix handling, and nickname parentheses.
- Keep slug casing/diacritics untouched; this task is solely about variant emission.
- Do not introduce external dependencies.

## Requirements
1. **Comma-Aware Structured Parsing**
   - Update `parseStructuredExternalName` to detect an initial comma. When present, treat the segment before the first comma as the full surname (allowing multi-token surnames), trim punctuation, and run suffix detection on the remaining tokens.
   - Ensure the fallback path no longer promotes the *last* token to surname for comma names. Verify suffixes like “Jr.” still work.

2. **Expanded Variant Set**
   - In `buildStructuredVariants`, add support for first-name-only fallbacks:
     - Emit `${firstToken} ${lastName}` and `${lastName}, ${firstToken}` alongside the existing full-given-name variants.
     - When a suffix exists, mirror the suffix-bearing options.
   - Generate a hyphenated combination `${normalizedFirstNames}-${lastName}` (and comma form if relevant) so we search with the canonical slug form. Normalise whitespace before inserting the hyphen.
   - Avoid duplicates by relying on the existing `pushVariant`.

3. **Regression Fixtures**
   - Add/extend unit coverage under `src/utils` (feel free to create `src/utils/normalize.spec.js` or similar) asserting the variant arrays include:
     - `Suico, Kyubi Emmanuelle` → variants containing `Kyubi Suico`, `Suico, Kyubi`, `Kyubi Emmanuelle-Suico`.
     - `Smith, Grace Logan` → variants containing `Grace Smith`, `Smith, Grace`, `Grace Logan Smith`.
   - Keep existing scenarios (nickname, suffix, East-Asian formats) passing.

4. **Testing Guide**
   - Update `docs/testing-guide.md` to mention the new regression cases under manual verification, referencing the fencingtracker profile URLs.

## Acceptance Criteria
- Normalising “Suico, Kyubi Emmanuelle” yields variants covering:
  - `Kyubi Suico`, `Suico, Kyubi`, `Kyubi Emmanuelle-Suico`, and the existing full-name permutations.
- Normalising “Smith, Grace Logan” yields variants including:
  - `Grace Smith`, `Smith, Grace`, `Grace Logan Smith`.
- No regressions in other documented variant types (suffixes, uppercase surnames, nicknames).
- Unit tests covering the above pass locally.
- Manual browser checks confirm the extension resolves both problematic names without manual edits.

## Validation Steps
1. Run the new normalization unit tests (`npm test -- normalize` or equivalent command documented in the repo).
2. Reload the extension and perform manual lookups for:
   - `Suico, Kyubi Emmanuelle`
   - `Smith, Grace Logan`
   - A known suffix case (e.g., `EWART Jr. Stephen P.`) to ensure no regressions.
3. Confirm the modal shows live data and the profile links open the expected fencingtracker URLs.
