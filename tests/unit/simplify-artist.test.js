import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simplifyArtist } from '../../workers/fetch-spotify.js';
import { rawSpotifyArtist, rawTrackArtist } from '../fixtures/artists.js';

describe('simplifyArtist()', () => {
  it('extracts name, id, genres from full artist', () => {
    const result = simplifyArtist(rawSpotifyArtist);
    assert.deepEqual(result, {
      name: 'Radiohead',
      id: 'spotify-001',
      genres: ['alternative rock', 'art rock'],
    });
  });

  it('handles missing id and genres', () => {
    const result = simplifyArtist(rawTrackArtist);
    assert.deepEqual(result, {
      name: 'Unknown Band',
      id: null,
      genres: [],
    });
  });

  it('strips extra fields', () => {
    const result = simplifyArtist(rawSpotifyArtist);
    assert.equal(result.popularity, undefined);
    assert.equal(result.followers, undefined);
    assert.equal(result.images, undefined);
  });
});
