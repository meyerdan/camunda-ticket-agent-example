// Shared test Spotify artist data matching the simplified format
// produced by fetch-spotify's simplifyArtist().

export const sampleSpotifyArtists = [
  { name: 'Radiohead', id: 'spotify-001', genres: ['alternative rock', 'art rock'] },
  { name: 'Taylor Swift', id: 'spotify-002', genres: ['pop', 'country'] },
  { name: 'Kendrick Lamar', id: 'spotify-003', genres: ['hip hop', 'rap'] },
  { name: 'Björk', id: 'spotify-004', genres: ['art pop', 'electronic'] },
];

// Raw Spotify API artist object (before simplification)
export const rawSpotifyArtist = {
  name: 'Radiohead',
  id: 'spotify-001',
  genres: ['alternative rock', 'art rock'],
  popularity: 82,
  followers: { total: 5_000_000 },
  external_urls: { spotify: 'https://open.spotify.com/artist/spotify-001' },
  images: [{ url: 'https://example.com/image.jpg', height: 640, width: 640 }],
};

// Raw artist from saved tracks (minimal — no genres/id sometimes)
export const rawTrackArtist = {
  name: 'Unknown Band',
};
