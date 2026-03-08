// Tool: Look up detailed info about a specific concert from the matched list.
// Receives `concertName` from the agent via fromAi().
// Returns details as `toolCallResult`.

export function registerGetConcertDetails(zeebe) {
  zeebe.createWorker({
    taskType: 'get-concert-details',
    taskHandler: async (job) => {
      const { concertName, matchedConcerts } = job.variables;
      console.log(`[get-concert-details] Looking up: "${concertName}"`);

      const concert = findConcert(matchedConcerts, concertName);

      if (!concert) {
        return job.complete({
          toolCallResult: JSON.stringify({
            error: `No concert found matching "${concertName}"`,
            availableConcerts: listNames(matchedConcerts),
          }),
        });
      }

      const details = {
        name: concert.name || 'Unknown',
        date: concert.dates?.start?.localDate || concert.date || 'TBD',
        time: concert.dates?.start?.localTime || concert.time || 'TBD',
        venue: concert._embedded?.venues?.[0]?.name || concert.venue || 'TBD',
        address: formatAddress(concert._embedded?.venues?.[0]),
        city: concert._embedded?.venues?.[0]?.city?.name || 'Boston',
        performers: (concert._embedded?.attractions || concert.performers || [])
          .map((p) => (typeof p === 'string' ? p : p.name))
          .join(', '),
        matchedArtists: (concert.matchedArtists || []).join(', '),
        priceRange: formatPriceRange(concert.priceRanges),
        url: concert.url || '',
        info: concert.info || concert.pleaseNote || '',
        eventId: concert.id || '',
      };

      console.log(`[get-concert-details] Found: ${details.name} at ${details.venue} on ${details.date}`);
      return job.complete({ toolCallResult: JSON.stringify(details) });
    },
  });
}

function findConcert(concerts, name) {
  if (!concerts || !name) return null;
  const lower = name.toLowerCase().trim();

  // Try exact-ish match first, then partial
  return (
    concerts.find((c) => (c.name || '').toLowerCase() === lower) ||
    concerts.find((c) => {
      const concertName = (c.name || '').toLowerCase();
      return concertName.includes(lower) || lower.includes(concertName);
    }) ||
    // Also try matching by performer name
    concerts.find((c) => {
      const performers = c.performers || c._embedded?.attractions || [];
      return performers.some((p) => {
        const pName = (typeof p === 'string' ? p : p.name || '').toLowerCase();
        return pName.includes(lower) || lower.includes(pName);
      });
    })
  );
}

function listNames(concerts) {
  return (concerts || []).map((c) => c.name || 'Unknown');
}

function formatAddress(venue) {
  if (!venue) return 'Address not available';
  const parts = [
    venue.address?.line1,
    venue.city?.name,
    venue.state?.stateCode,
    venue.postalCode,
  ].filter(Boolean);
  return parts.join(', ') || 'Address not available';
}

function formatPriceRange(priceRanges) {
  if (!priceRanges || priceRanges.length === 0) return 'Price not available';
  return priceRanges
    .map((pr) => `$${pr.min}-$${pr.max} ${pr.currency || 'USD'} (${pr.type || 'standard'})`)
    .join('; ');
}
