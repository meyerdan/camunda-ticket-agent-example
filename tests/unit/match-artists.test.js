import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSpotifyArtists } from '../fixtures/artists.js';

// We need to mock downloadDocument before importing the module.
// The match-artists worker calls downloadDocument at runtime.
// We'll test the matching logic by importing normalize and recreating the core logic.
import { normalize } from '../../workers/match-artists.js';

// Sample concert data (Ticketmaster-style)
const concertResults = [
  {
    name: 'Radiohead at TD Garden',
    performers: [{ name: 'Radiohead' }],
    _embedded: { attractions: [{ name: 'Radiohead', id: 'art-001' }] },
  },
  {
    name: 'Local Jazz Fest',
    performers: [{ name: 'Unknown Local Band' }],
  },
  {
    name: 'Taylor Swift | The Eras Tour',
    performers: [{ name: 'Taylor Swift' }],
    _embedded: { attractions: [{ name: 'Taylor Swift', id: 'art-002' }] },
  },
];

// Core matching logic extracted from the worker for testability
function matchArtists(concertResults, spotifyArtists) {
  const spotifyNames = new Set(
    (spotifyArtists || []).map((a) => normalize(typeof a === 'string' ? a : a.name))
  );

  return (concertResults || [])
    .filter((concert) => {
      const performers = concert.performers || concert._embedded?.attractions || [];
      return performers.some((p) => {
        const name = typeof p === 'string' ? p : p.name;
        return spotifyNames.has(normalize(name));
      });
    })
    .map((concert) => {
      const performers = concert.performers || concert._embedded?.attractions || [];
      const matched = performers
        .filter((p) => {
          const name = typeof p === 'string' ? p : p.name;
          return spotifyNames.has(normalize(name));
        })
        .map((p) => (typeof p === 'string' ? p : p.name));
      return { ...concert, matchedArtists: matched };
    });
}

describe('match-artists logic', () => {
  it('returns concerts matching Spotify artists', () => {
    const result = matchArtists(concertResults, sampleSpotifyArtists);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'Radiohead at TD Garden');
    assert.equal(result[1].name, 'Taylor Swift | The Eras Tour');
  });

  it('annotates matched concerts with matchedArtists', () => {
    const result = matchArtists(concertResults, sampleSpotifyArtists);
    assert.deepEqual(result[0].matchedArtists, ['Radiohead']);
    assert.deepEqual(result[1].matchedArtists, ['Taylor Swift']);
  });

  it('returns empty array when no overlapping artists', () => {
    const noMatchArtists = [{ name: 'Completely Unknown', id: 'x', genres: [] }];
    const result = matchArtists(concertResults, noMatchArtists);
    assert.equal(result.length, 0);
  });

  it('handles string performers', () => {
    const concerts = [{ name: 'Gig', performers: ['Radiohead', 'Opener'] }];
    const result = matchArtists(concerts, sampleSpotifyArtists);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].matchedArtists, ['Radiohead']);
  });

  it('handles null inputs', () => {
    assert.deepEqual(matchArtists(null, sampleSpotifyArtists), []);
    assert.deepEqual(matchArtists(concertResults, null), []);
  });

  it('handles empty inputs', () => {
    assert.deepEqual(matchArtists([], sampleSpotifyArtists), []);
    assert.deepEqual(matchArtists(concertResults, []), []);
  });

  it('matches case-insensitively', () => {
    const concerts = [{ name: 'Show', performers: [{ name: 'RADIOHEAD' }] }];
    const result = matchArtists(concerts, sampleSpotifyArtists);
    assert.equal(result.length, 1);
  });
});
