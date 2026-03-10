import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../../workers/match-artists.js';

describe('normalize()', () => {
  it('lowercases and trims', () => {
    assert.equal(normalize('  Radiohead  '), 'radiohead');
  });

  it('strips special characters', () => {
    assert.equal(normalize("Guns N' Roses"), 'guns n roses');
    assert.equal(normalize('AC/DC'), 'acdc');
    assert.equal(normalize('Mötley Crüe'), 'mtley cre');
  });

  it('preserves spaces between words', () => {
    assert.equal(normalize('Taylor Swift'), 'taylor swift');
  });

  it('handles null and undefined', () => {
    assert.equal(normalize(null), '');
    assert.equal(normalize(undefined), '');
  });

  it('handles empty string', () => {
    assert.equal(normalize(''), '');
  });

  it('handles numbers in names', () => {
    assert.equal(normalize('Maroon 5'), 'maroon 5');
    assert.equal(normalize('Blink-182'), 'blink182');
  });
});
