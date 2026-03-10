// Cross-reference concert artists with Spotify library (pure logic, no API calls)
// Reads large payloads from the document store, writes matchedConcerts back as a
// regular variable since it's typically a small subset.

import { downloadDocument } from './document-store.js';

export function registerMatchArtists(zeebe) {
  zeebe.createWorker({
    taskType: 'match-artists',
    taskHandler: async (job) => {
      const { concertResultsDoc, spotifyArtistsDoc } = job.variables;

      // Download full data from the document store
      const concertResults = await downloadDocument(concertResultsDoc);
      const spotifyArtists = await downloadDocument(spotifyArtistsDoc);

      console.log(
        `[match-artists] Matching ${concertResults?.length ?? 0} concerts against ${spotifyArtists?.length ?? 0} Spotify artists...`
      );

      // Build a set of normalized Spotify artist names for fast lookup
      const spotifyNames = new Set(
        (spotifyArtists || []).map((a) => normalize(typeof a === 'string' ? a : a.name))
      );

      // Match concerts where any performer is in the Spotify library
      const matchedConcerts = (concertResults || [])
        .filter((concert) => {
          const performers = concert.performers || concert._embedded?.attractions || [];
          return performers.some((p) => {
            const name = typeof p === 'string' ? p : p.name;
            return spotifyNames.has(normalize(name));
          });
        })
        .map((concert) => {
          // Annotate each matched concert with which artists matched
          const performers = concert.performers || concert._embedded?.attractions || [];
          const matched = performers
            .filter((p) => {
              const name = typeof p === 'string' ? p : p.name;
              return spotifyNames.has(normalize(name));
            })
            .map((p) => (typeof p === 'string' ? p : p.name));

          return { ...concert, matchedArtists: matched };
        });

      console.log(`[match-artists] Found ${matchedConcerts.length} matching concerts`);
      if (matchedConcerts.length > 0) {
        console.log(
          `[match-artists] Matches: ${matchedConcerts.map((c) => `${c.name} (${c.matchedArtists.join(', ')})`).join('; ')}`
        );
      }

      // matchedConcerts stays as a regular variable — it's a small subset and
      // is used by the AI Agent prompt via FEEL: string(matchedConcerts)
      return job.complete({ matchedConcerts });
    },
  });
}

export function normalize(name) {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}
