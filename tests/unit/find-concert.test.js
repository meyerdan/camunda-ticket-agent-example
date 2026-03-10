import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findConcert, listNames } from '../../workers/lib/find-concert.js';
import { sampleConcerts, minimalConcert } from '../fixtures/concerts.js';

describe('findConcert()', () => {
  it('finds by exact name', () => {
    const result = findConcert(sampleConcerts, 'Radiohead at TD Garden');
    assert.equal(result?.id, 'evt-001');
  });

  it('finds by exact name (case-insensitive)', () => {
    const result = findConcert(sampleConcerts, 'radiohead at td garden');
    assert.equal(result?.id, 'evt-001');
  });

  it('finds by partial name (concert name contains search)', () => {
    const result = findConcert(sampleConcerts, 'Radiohead');
    assert.equal(result?.id, 'evt-001');
  });

  it('finds by partial name (search contains concert name)', () => {
    const result = findConcert(sampleConcerts, 'Jazz Night featuring Herbie Hancock and friends');
    assert.equal(result?.id, 'evt-003');
  });

  it('finds by performer/attraction name', () => {
    const result = findConcert(sampleConcerts, 'Taylor Swift');
    // Partial match on the concert name "Taylor Swift | The Eras Tour" catches this
    assert.equal(result?.id, 'evt-002');
  });

  it('returns falsy when no match', () => {
    assert.ok(!findConcert(sampleConcerts, 'Nonexistent Band'));
  });

  it('returns null for null concerts', () => {
    assert.equal(findConcert(null, 'anything'), null);
  });

  it('returns null for null name', () => {
    assert.equal(findConcert(sampleConcerts, null), null);
  });

  it('returns falsy for empty inputs', () => {
    assert.ok(!findConcert([], 'Radiohead'));
  });

  it('handles concerts with string performers', () => {
    const concerts = [{ name: 'Small Gig', performers: ['Indie Band'] }];
    const result = findConcert(concerts, 'Indie Band');
    assert.equal(result?.name, 'Small Gig');
  });
});

describe('listNames()', () => {
  it('returns concert names', () => {
    const names = listNames(sampleConcerts);
    assert.deepEqual(names, [
      'Radiohead at TD Garden',
      'Taylor Swift | The Eras Tour',
      'Jazz Night featuring Herbie Hancock',
    ]);
  });

  it('returns "Unknown" for missing names', () => {
    assert.deepEqual(listNames([{}]), ['Unknown']);
  });

  it('returns empty array for null', () => {
    assert.deepEqual(listNames(null), []);
  });
});
