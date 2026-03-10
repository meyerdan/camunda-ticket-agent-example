import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sampleConcerts } from '../fixtures/concerts.js';

// Helper: create a mock Zeebe job object
function mockJob(variables = {}) {
  return {
    variables,
    complete: mock.fn((result) => result),
    fail: mock.fn((message) => ({ error: message })),
  };
}

describe('get-concert-details handler', () => {
  it('returns concert details for valid name', async () => {
    const { registerGetConcertDetails } = await import('../../workers/get-concert-details.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerGetConcertDetails(fakeZeebe);

    const job = mockJob({
      concertName: 'Radiohead at TD Garden',
      matchedConcerts: sampleConcerts,
    });

    await handler(job);

    assert.equal(job.complete.mock.callCount(), 1);
    const result = JSON.parse(job.complete.mock.calls[0].arguments[0].toolCallResult);
    assert.equal(result.name, 'Radiohead at TD Garden');
    assert.equal(result.venue, 'TD Garden');
    assert.equal(result.date, '2026-04-15');
    assert.match(result.address, /100 Legends Way/);
  });

  it('returns error for unknown concert', async () => {
    const { registerGetConcertDetails } = await import('../../workers/get-concert-details.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerGetConcertDetails(fakeZeebe);

    const job = mockJob({
      concertName: 'Nonexistent',
      matchedConcerts: sampleConcerts,
    });

    await handler(job);

    const result = JSON.parse(job.complete.mock.calls[0].arguments[0].toolCallResult);
    assert.ok(result.error);
    assert.ok(Array.isArray(result.availableConcerts));
  });
});

describe('check-ticket-price handler', () => {
  it('returns pricing for valid concert', async () => {
    const { registerCheckTicketPrice } = await import('../../workers/check-ticket-price.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerCheckTicketPrice(fakeZeebe);

    const job = mockJob({
      concertName: 'Radiohead',
      matchedConcerts: sampleConcerts,
    });

    await handler(job);

    const result = JSON.parse(job.complete.mock.calls[0].arguments[0].toolCallResult);
    assert.equal(result.concert, 'Radiohead at TD Garden');
    assert.ok(result.priceRanges);
    assert.equal(result.priceRanges.length, 2);
  });

  it('returns note when no pricing available', async () => {
    const { registerCheckTicketPrice } = await import('../../workers/check-ticket-price.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerCheckTicketPrice(fakeZeebe);

    const job = mockJob({
      concertName: 'Jazz Night',
      matchedConcerts: sampleConcerts,
    });

    await handler(job);

    const result = JSON.parse(job.complete.mock.calls[0].arguments[0].toolCallResult);
    assert.ok(result.note);
  });
});

describe('book-tickets handler', () => {
  it('returns booking link for valid concert', async () => {
    const { registerBookTickets } = await import('../../workers/book-tickets.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerBookTickets(fakeZeebe);

    const job = mockJob({
      concertName: 'Radiohead',
      quantity: 2,
      matchedConcerts: sampleConcerts,
    });

    await handler(job);

    const result = JSON.parse(job.complete.mock.calls[0].arguments[0].toolCallResult);
    assert.equal(result.status, 'booking_link_sent');
    assert.equal(result.concert, 'Radiohead at TD Garden');
    assert.equal(result.quantity, 2);
    assert.ok(result.purchaseUrl);
  });

  it('defaults to 2 tickets when quantity not set', async () => {
    const { registerBookTickets } = await import('../../workers/book-tickets.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerBookTickets(fakeZeebe);

    const job = mockJob({
      concertName: 'Radiohead',
      matchedConcerts: sampleConcerts,
    });

    await handler(job);

    const result = JSON.parse(job.complete.mock.calls[0].arguments[0].toolCallResult);
    assert.equal(result.quantity, 2);
  });
});

describe('send-whatsapp-reply handler', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends message and returns unique correlationKey', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );

    const { registerSendWhatsAppReply } = await import('../../workers/send-whatsapp.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerSendWhatsAppReply(fakeZeebe);

    const job = mockJob({ messageText: 'Hello from test' });
    await handler(job);

    assert.equal(job.complete.mock.callCount(), 1);
    const result = job.complete.mock.calls[0].arguments[0];
    assert.ok(result.replyCorrelationKey);
    assert.match(result.replyCorrelationKey, /^local-user-/);

    // Verify fetch was called
    assert.equal(globalThis.fetch.mock.callCount(), 1);
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
    assert.match(url, /\/message$/);
    assert.equal(opts.method, 'POST');
  });

  it('generates unique correlation keys across calls', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    );

    const { registerSendWhatsAppReply } = await import('../../workers/send-whatsapp.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerSendWhatsAppReply(fakeZeebe);

    const job1 = mockJob({ messageText: 'msg1' });
    const job2 = mockJob({ messageText: 'msg2' });
    await handler(job1);
    await handler(job2);

    const key1 = job1.complete.mock.calls[0].arguments[0].replyCorrelationKey;
    const key2 = job2.complete.mock.calls[0].arguments[0].replyCorrelationKey;
    assert.notEqual(key1, key2);
  });

  it('fails job when chat server returns error', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Server error') })
    );

    const { registerSendWhatsAppReply } = await import('../../workers/send-whatsapp.js');

    let handler;
    const fakeZeebe = {
      createWorker: ({ taskHandler }) => { handler = taskHandler; },
    };
    registerSendWhatsAppReply(fakeZeebe);

    const job = mockJob({ messageText: 'test' });
    await handler(job);

    assert.equal(job.fail.mock.callCount(), 1);
    assert.match(job.fail.mock.calls[0].arguments[0], /500/);
  });
});
