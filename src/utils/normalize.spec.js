const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeQuery, parseStructuredExternalName } = require('./normalize.js');

test('parseStructuredExternalName handles comma formatted names', () => {
  const structured = parseStructuredExternalName('Suico, Kyubi Emmanuelle');

  assert.ok(structured, 'structured result should be returned');
  assert.equal(structured.lastName, 'Suico');
  assert.equal(structured.firstNames, 'Kyubi Emmanuelle');
  assert.equal(structured.suffix, null);
});

test('normalizeQuery emits expected variants for Suico comma name', () => {
  const { variants } = normalizeQuery('Suico, Kyubi Emmanuelle');

  assert.ok(
    variants.includes('Kyubi Suico'),
    'Kyubi Suico variant should be present'
  );

  assert.ok(
    variants.includes('Suico, Kyubi'),
    'Suico, Kyubi variant should be present'
  );

  assert.ok(
    variants.includes('Kyubi Emmanuelle-Suico'),
    'Hyphenated slug-style variant should be present'
  );
});

test('normalizeQuery emits expected variants for multi-given-name Smith comma case', () => {
  const { variants } = normalizeQuery('Smith, Grace Logan');

  assert.ok(
    variants.includes('Grace Smith'),
    'Grace Smith variant should be present'
  );

  assert.ok(
    variants.includes('Smith, Grace'),
    'Smith, Grace variant should be present'
  );

  assert.ok(
    variants.includes('Grace Logan Smith'),
    'Grace Logan Smith primary variant should be present'
  );
});
