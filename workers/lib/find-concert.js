// Shared utility for finding a concert by name in the matched concerts list.
// Used by get-concert-details, check-ticket-price, and book-tickets workers.

export function findConcert(concerts, name) {
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

export function listNames(concerts) {
  return (concerts || []).map((c) => c.name || 'Unknown');
}
