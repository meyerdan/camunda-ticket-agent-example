// Fetch upcoming concerts in Boston area from Ticketmaster Discovery API
// API docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

import { uploadDocument } from './document-store.js';

const TICKETMASTER_BASE = 'https://app.ticketmaster.com/discovery/v2';

export function registerFetchConcerts(zeebe) {
  zeebe.createWorker({
    taskType: 'fetch-concerts',
    taskHandler: async (job) => {
      console.log('[fetch-concerts] Fetching Boston-area concerts...');

      const apiKey = process.env.TICKETMASTER_API_KEY;
      if (!apiKey) {
        return job.fail('TICKETMASTER_API_KEY not set');
      }

      const params = new URLSearchParams({
        apikey: apiKey,
        classificationName: 'music',
        city: 'Boston',
        stateCode: 'MA',
        radius: '30',
        unit: 'miles',
        size: '50',
        sort: 'date,asc',
      });

      const url = `${TICKETMASTER_BASE}/events.json?${params}`;

      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text();
        return job.fail(`Ticketmaster API error ${response.status}: ${body}`);
      }

      const data = await response.json();
      const events = data._embedded?.events || [];

      // Normalize into a clean structure while keeping the full Ticketmaster shape
      // (downstream workers rely on _embedded.attractions, priceRanges, etc.)
      const concertResults = events.map((event) => ({
        id: event.id,
        name: event.name,
        url: event.url,
        dates: event.dates,
        info: event.info || '',
        pleaseNote: event.pleaseNote || '',
        priceRanges: event.priceRanges || null,
        _embedded: {
          venues: event._embedded?.venues || [],
          attractions: event._embedded?.attractions || [],
        },
        // Convenience: flat performer list for matching
        performers: (event._embedded?.attractions || []).map((a) => ({
          name: a.name,
          id: a.id,
        })),
      }));

      console.log(`[fetch-concerts] Found ${concertResults.length} concerts`);

      // Store as a document to avoid bloating process variables (~1MB+ of concert data)
      const concertResultsDoc = await uploadDocument(concertResults, 'concert-results.json');

      return job.complete({ concertResultsDoc });
    },
  });
}
