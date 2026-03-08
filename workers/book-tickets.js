// Tool: Book tickets for a concert.
// Receives `concertName` and `quantity` from the agent via fromAi().
// Returns booking confirmation as `toolCallResult`.
//
// Note: Ticketmaster doesn't offer a direct booking API. This worker generates
// a deep link to the Ticketmaster purchase page. A real integration could use
// a partner API or redirect the user via the WhatsApp message.

export function registerBookTickets(zeebe) {
  zeebe.createWorker({
    taskType: 'book-tickets',
    taskHandler: async (job) => {
      const { concertName, quantity, matchedConcerts } = job.variables;
      const numTickets = quantity || 2;
      console.log(`[book-tickets] Booking ${numTickets} ticket(s) for: "${concertName}"`);

      const concert = findConcert(matchedConcerts, concertName);

      if (!concert) {
        return job.complete({
          toolCallResult: JSON.stringify({
            error: `Cannot book: no concert found matching "${concertName}"`,
          }),
        });
      }

      // Build the purchase URL — Ticketmaster event pages have a buy button
      const purchaseUrl = concert.url || 'https://www.ticketmaster.com';

      const confirmation = {
        status: 'booking_link_sent',
        concert: concert.name,
        date: concert.dates?.start?.localDate || concert.date || 'TBD',
        time: concert.dates?.start?.localTime || concert.time || 'TBD',
        venue: concert._embedded?.venues?.[0]?.name || concert.venue || 'TBD',
        quantity: numTickets,
        purchaseUrl,
        priceEstimate: formatPriceRange(concert.priceRanges),
        message:
          `Here's the link to purchase ${numTickets} ticket(s) for ${concert.name}: ${purchaseUrl}`,
      };

      console.log(`[book-tickets] Booking initiated for ${concert.name} — sending purchase link`);
      return job.complete({ toolCallResult: JSON.stringify(confirmation) });
    },
  });
}

function findConcert(concerts, name) {
  if (!concerts || !name) return null;
  const lower = name.toLowerCase().trim();

  return (
    concerts.find((c) => (c.name || '').toLowerCase() === lower) ||
    concerts.find((c) => {
      const concertName = (c.name || '').toLowerCase();
      return concertName.includes(lower) || lower.includes(concertName);
    }) ||
    concerts.find((c) => {
      const performers = c.performers || c._embedded?.attractions || [];
      return performers.some((p) => {
        const pName = (typeof p === 'string' ? p : p.name || '').toLowerCase();
        return pName.includes(lower) || lower.includes(pName);
      });
    })
  );
}

function formatPriceRange(priceRanges) {
  if (!priceRanges || priceRanges.length === 0) return 'Price not available';
  return priceRanges
    .map((pr) => `$${pr.min}-$${pr.max} ${pr.currency || 'USD'}`)
    .join('; ');
}
