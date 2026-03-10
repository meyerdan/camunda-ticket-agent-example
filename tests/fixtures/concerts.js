// Shared test concert data matching the Ticketmaster-style structure
// used throughout the workers.

export const sampleConcerts = [
  {
    id: 'evt-001',
    name: 'Radiohead at TD Garden',
    url: 'https://www.ticketmaster.com/event/evt-001',
    dates: {
      start: { localDate: '2026-04-15', localTime: '20:00:00' },
    },
    info: 'Doors open at 7pm',
    pleaseNote: 'No professional cameras',
    priceRanges: [
      { type: 'standard', min: 75, max: 250, currency: 'USD' },
      { type: 'VIP', min: 300, max: 500, currency: 'USD' },
    ],
    _embedded: {
      venues: [
        {
          name: 'TD Garden',
          address: { line1: '100 Legends Way' },
          city: { name: 'Boston' },
          state: { stateCode: 'MA' },
          postalCode: '02114',
        },
      ],
      attractions: [{ name: 'Radiohead', id: 'art-001' }],
    },
    performers: [{ name: 'Radiohead', id: 'art-001' }],
    matchedArtists: ['Radiohead'],
  },
  {
    id: 'evt-002',
    name: 'Taylor Swift | The Eras Tour',
    url: 'https://www.ticketmaster.com/event/evt-002',
    dates: {
      start: { localDate: '2026-05-20', localTime: '19:00:00' },
    },
    info: '',
    pleaseNote: '',
    priceRanges: [{ type: 'standard', min: 100, max: 450, currency: 'USD' }],
    _embedded: {
      venues: [
        {
          name: 'Fenway Park',
          address: { line1: '4 Jersey St' },
          city: { name: 'Boston' },
          state: { stateCode: 'MA' },
          postalCode: '02215',
        },
      ],
      attractions: [{ name: 'Taylor Swift', id: 'art-002' }],
    },
    performers: [{ name: 'Taylor Swift', id: 'art-002' }],
    matchedArtists: ['Taylor Swift'],
  },
  {
    id: 'evt-003',
    name: 'Jazz Night featuring Herbie Hancock',
    url: 'https://www.ticketmaster.com/event/evt-003',
    dates: {
      start: { localDate: '2026-06-01' },
    },
    info: '',
    pleaseNote: '',
    priceRanges: null,
    _embedded: {
      venues: [
        {
          name: 'Blue Note',
          city: { name: 'Cambridge' },
        },
      ],
      attractions: [{ name: 'Herbie Hancock', id: 'art-003' }],
    },
    performers: [{ name: 'Herbie Hancock', id: 'art-003' }],
    matchedArtists: ['Herbie Hancock'],
  },
];

// A concert with minimal/missing fields for edge case testing
export const minimalConcert = {
  id: 'evt-999',
  name: 'Mystery Show',
  performers: ['Some Artist'],
};
