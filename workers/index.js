import { Camunda8 } from '@camunda8/sdk';
import { registerFetchConcerts } from './fetch-concerts.js';
import { registerFetchSpotify } from './fetch-spotify.js';
import { registerMatchArtists } from './match-artists.js';
import { registerSendWhatsAppReply } from './send-whatsapp.js';
import { registerGetConcertDetails } from './get-concert-details.js';
import { registerCheckTicketPrice } from './check-ticket-price.js';
import { registerBookTickets } from './book-tickets.js';

const c8 = new Camunda8();
const zeebe = c8.getZeebeGrpcApiClient();

// Data pipeline workers
registerFetchConcerts(zeebe);
registerFetchSpotify(zeebe);
registerMatchArtists(zeebe);

// AI Agent tool workers (inside ad-hoc sub-process)
registerSendWhatsAppReply(zeebe);
registerGetConcertDetails(zeebe);
registerCheckTicketPrice(zeebe);
registerBookTickets(zeebe);

console.log('All workers registered. Listening for jobs...');

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down workers...');
  await zeebe.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
