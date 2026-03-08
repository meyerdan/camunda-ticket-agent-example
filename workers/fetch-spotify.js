// Fetch user's saved/top artists from Spotify Web API
// API docs: https://developer.spotify.com/documentation/web-api

import { uploadDocument } from './document-store.js';

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';

export function registerFetchSpotify(zeebe) {
  zeebe.createWorker({
    taskType: 'fetch-spotify',
    taskHandler: async (job) => {
      console.log('[fetch-spotify] Fetching Spotify library...');

      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
      const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        return job.fail(
          'Spotify credentials not set (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN)'
        );
      }

      // 1. Refresh access token
      const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);

      // 2. Fetch from multiple sources in parallel
      const [topArtists, followedArtists, savedTrackArtists] = await Promise.all([
        fetchTopArtists(accessToken),
        fetchFollowedArtists(accessToken),
        fetchSavedTrackArtists(accessToken),
      ]);

      // 3. Merge and deduplicate by name (lowercased)
      const seen = new Map();
      const allArtists = [...topArtists, ...followedArtists, ...savedTrackArtists];

      for (const artist of allArtists) {
        const key = artist.name.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.set(key, artist);
        }
      }

      const spotifyArtists = Array.from(seen.values());

      console.log(
        `[fetch-spotify] Found ${spotifyArtists.length} unique artists ` +
          `(${topArtists.length} top, ${followedArtists.length} followed, ${savedTrackArtists.length} from saved tracks)`
      );

      // Store as a document to keep process variables lightweight
      const spotifyArtistsDoc = await uploadDocument(spotifyArtists, 'spotify-artists.json');

      return job.complete({ spotifyArtistsDoc });
    },
  });
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify token refresh failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchTopArtists(accessToken) {
  // Fetch from both medium-term and long-term to get a broader picture
  const [mediumTerm, longTerm] = await Promise.all([
    spotifyGet(`${SPOTIFY_API}/me/top/artists?limit=50&time_range=medium_term`, accessToken),
    spotifyGet(`${SPOTIFY_API}/me/top/artists?limit=50&time_range=long_term`, accessToken),
  ]);

  const artists = [...(mediumTerm.items || []), ...(longTerm.items || [])];
  return artists.map(simplifyArtist);
}

async function fetchFollowedArtists(accessToken) {
  const artists = [];
  let url = `${SPOTIFY_API}/me/following?type=artist&limit=50`;

  // Paginate through all followed artists
  while (url) {
    const data = await spotifyGet(url, accessToken);
    const items = data.artists?.items || [];
    artists.push(...items.map(simplifyArtist));

    // Spotify uses cursor-based pagination for followed artists
    url = data.artists?.cursors?.after
      ? `${SPOTIFY_API}/me/following?type=artist&limit=50&after=${data.artists.cursors.after}`
      : null;
  }

  return artists;
}

async function fetchSavedTrackArtists(accessToken) {
  const artistMap = new Map();
  let url = `${SPOTIFY_API}/me/tracks?limit=50`;
  let pages = 0;
  const maxPages = 4; // Cap at 200 tracks to avoid excessive API calls

  while (url && pages < maxPages) {
    const data = await spotifyGet(url, accessToken);
    const items = data.items || [];

    for (const item of items) {
      for (const artist of item.track?.artists || []) {
        const key = artist.name.toLowerCase().trim();
        if (!artistMap.has(key)) {
          artistMap.set(key, simplifyArtist(artist));
        }
      }
    }

    url = data.next;
    pages++;
  }

  return Array.from(artistMap.values());
}

function simplifyArtist(artist) {
  return {
    name: artist.name,
    id: artist.id || null,
    genres: artist.genres || [],
  };
}

async function spotifyGet(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${body}`);
  }

  return response.json();
}
