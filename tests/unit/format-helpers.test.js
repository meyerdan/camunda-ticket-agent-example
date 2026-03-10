import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAddress, formatPriceRange } from '../../workers/get-concert-details.js';
import { formatPriceRange as formatPriceRangeBooking } from '../../workers/book-tickets.js';

describe('formatAddress()', () => {
  it('formats full address', () => {
    const venue = {
      address: { line1: '100 Legends Way' },
      city: { name: 'Boston' },
      state: { stateCode: 'MA' },
      postalCode: '02114',
    };
    assert.equal(formatAddress(venue), '100 Legends Way, Boston, MA, 02114');
  });

  it('returns fallback for null venue', () => {
    assert.equal(formatAddress(null), 'Address not available');
  });

  it('handles partial address (city only)', () => {
    const venue = { city: { name: 'Cambridge' } };
    assert.equal(formatAddress(venue), 'Cambridge');
  });

  it('returns fallback for empty venue object', () => {
    assert.equal(formatAddress({}), 'Address not available');
  });
});

describe('formatPriceRange() — get-concert-details', () => {
  it('formats multiple price ranges', () => {
    const ranges = [
      { type: 'standard', min: 75, max: 250, currency: 'USD' },
      { type: 'VIP', min: 300, max: 500, currency: 'USD' },
    ];
    assert.equal(
      formatPriceRange(ranges),
      '$75-$250 USD (standard); $300-$500 USD (VIP)'
    );
  });

  it('returns "Price not available" for null', () => {
    assert.equal(formatPriceRange(null), 'Price not available');
  });

  it('returns "Price not available" for empty array', () => {
    assert.equal(formatPriceRange([]), 'Price not available');
  });

  it('defaults currency and type', () => {
    const ranges = [{ min: 50, max: 100 }];
    assert.equal(formatPriceRange(ranges), '$50-$100 USD (standard)');
  });
});

describe('formatPriceRange() — book-tickets', () => {
  it('formats price ranges without type', () => {
    const ranges = [{ min: 75, max: 250, currency: 'USD' }];
    assert.equal(formatPriceRangeBooking(ranges), '$75-$250 USD');
  });

  it('returns "Price not available" for null', () => {
    assert.equal(formatPriceRangeBooking(null), 'Price not available');
  });
});
