#!/usr/bin/env node
// One-time helper to obtain a Spotify refresh token via the Authorization Code flow.
//
// Usage:
//   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/spotify-auth.js
//
// 1. Opens your browser to Spotify's authorization page
// 2. After you approve, Spotify redirects — you copy the URL from the address bar
// 3. Paste it here and the script exchanges the code for tokens
// 4. Prints the refresh token (save it as SPOTIFY_REFRESH_TOKEN)

import { execSync } from 'node:child_process';
import readline from 'node:readline';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'https://example.com/callback';

// Scopes needed to read the user's library
const SCOPES = [
  'user-top-read',        // top artists
  'user-follow-read',     // followed artists
  'user-library-read',    // saved tracks
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables first.');
  process.exit(1);
}

// Build the authorization URL
const authUrl = new URL('https://accounts.spotify.com/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES);

console.log('\n🎵 Spotify Authorization Flow\n');
console.log('Opening your browser to authorize the app...\n');
console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);

// Open the URL in the default browser (macOS)
try {
  execSync(`open "${authUrl}"`);
} catch {
  // If open fails, user can copy the URL manually
}

console.log('After you approve, the browser will redirect to a page that won\'t load.');
console.log('That\'s expected! Copy the FULL URL from your browser\'s address bar.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the redirect URL here: ', async (input) => {
  rl.close();

  try {
    // Extract the authorization code from the pasted URL
    const redirectUrl = new URL(input.trim());
    const code = redirectUrl.searchParams.get('code');
    const error = redirectUrl.searchParams.get('error');

    if (error) {
      console.error(`\n❌ Authorization denied: ${error}`);
      process.exit(1);
    }

    if (!code) {
      console.error('\n❌ No authorization code found in that URL. Make sure you copied the full URL.');
      process.exit(1);
    }

    // Exchange the authorization code for tokens
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(`Token exchange failed (${tokenResponse.status}): ${body}`);
    }

    const tokens = await tokenResponse.json();

    console.log('\n✅ Authorization successful!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Add these to your .env file or environment:');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`SPOTIFY_CLIENT_ID=${CLIENT_ID}`);
    console.log(`SPOTIFY_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n═══════════════════════════════════════════════════════\n');

    if (tokens.access_token) {
      // Quick test: fetch profile to verify it works
      const profileRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        console.log(`Verified! Logged in as: ${profile.display_name} (${profile.id})\n`);
      }
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  }
});
