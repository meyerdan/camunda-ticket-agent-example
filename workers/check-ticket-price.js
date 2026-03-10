// Tool: Check ticket pricing for a specific concert.
// Receives `concertName` from the agent via fromAi().
// Returns pricing info as `toolCallResult`.

import { findConcert } from './lib/find-concert.js';

export function registerCheckTicketPrice(zeebe) {
  zeebe.createWorker({
    taskType: 'check-ticket-price',
    taskHandler: async (job) => {
      const { concertName, matchedConcerts } = job.variables;
      console.log(`[check-ticket-price] Checking price for: "${concertName}"`);

      const concert = findConcert(matchedConcerts, concertName);

      if (!concert) {
        return job.complete({
          toolCallResult: JSON.stringify({
            error: `No concert found matching "${concertName}"`,
          }),
        });
      }

      const pricing = {
        concert: concert.name,
        date: concert.dates?.start?.localDate || concert.date || 'TBD',
        venue: concert._embedded?.venues?.[0]?.name || concert.venue || 'TBD',
      };

      if (concert.priceRanges && concert.priceRanges.length > 0) {
        pricing.priceRanges = concert.priceRanges.map((pr) => ({
          type: pr.type || 'standard',
          min: pr.min,
          max: pr.max,
          currency: pr.currency || 'USD',
        }));
      } else {
        pricing.note =
          'Pricing not available from API. Check the event URL for current prices.';
      }

      pricing.url = concert.url || '';

      // If we have a Ticketmaster event ID, we could do a follow-up call for
      // real-time availability, but the Discovery API price ranges are usually enough.

      console.log(`[check-ticket-price] Pricing for ${concert.name}: ${JSON.stringify(pricing.priceRanges || 'N/A')}`);
      return job.complete({ toolCallResult: JSON.stringify(pricing) });
    },
  });
}
