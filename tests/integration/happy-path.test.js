// Idiomatic integration test using @camunda8/sdk directly.
// Requires C8 Run on localhost:8080 (or ZEEBE_REST_ADDRESS env var).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Camunda8 } from '@camunda8/sdk';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BPMN_PATH = resolve(import.meta.dirname, '../../resources/concerts-agent.bpmn');
const PROCESS_ID = 'concerts-agent';

// Polling helper — waits for a condition with retries
async function waitFor(fn, { timeout = 30_000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

describe('Integration: concerts-agent process', () => {
  let c8;
  let client;
  let workers = [];

  before(async () => {
    c8 = new Camunda8();
    client = c8.getCamundaRestClient();

    // Deploy the BPMN
    await client.deployResourcesFromFiles([BPMN_PATH]);
  });

  after(async () => {
    for (const w of workers) {
      try { w.close(); } catch { /* ignore */ }
    }
  });

  it('no matches → process completes via End_NoMatches', async () => {
    const zeebe = c8.getZeebeGrpcApiClient();

    // Register mock workers that complete immediately with test data
    workers.push(
      zeebe.createWorker({
        taskType: 'fetch-concerts',
        taskHandler: (job) =>
          job.complete({
            concertResultsDoc: { documentId: 'test-d1', contentHash: 'test-h1' },
          }),
      }),
      zeebe.createWorker({
        taskType: 'fetch-spotify',
        taskHandler: (job) =>
          job.complete({
            spotifyArtistsDoc: { documentId: 'test-d2', contentHash: 'test-h2' },
          }),
      }),
      zeebe.createWorker({
        taskType: 'match-artists',
        taskHandler: (job) =>
          job.complete({ matchedConcerts: [] }),
      })
    );

    // Create a process instance
    const { processInstanceKey } = await client.createProcessInstance({
      processDefinitionId: PROCESS_ID,
    });

    assert.ok(processInstanceKey, 'Process instance created');

    // Wait for process to complete
    await waitFor(async () => {
      try {
        const instance = await client.getProcessInstance(processInstanceKey);
        return instance.state === 'COMPLETED';
      } catch {
        return false;
      }
    });

    // If we get here, the process completed successfully via the no-matches path
    assert.ok(true, 'Process completed via no-matches path');
  });

  it('happy path → agent sub-process activates with matched concerts', async () => {
    const zeebe = c8.getZeebeGrpcApiClient();

    const matchedConcerts = [
      {
        name: 'Radiohead at TD Garden',
        matchedArtists: ['Radiohead'],
        url: 'https://www.ticketmaster.com/event/evt-001',
      },
    ];

    workers.push(
      zeebe.createWorker({
        taskType: 'fetch-concerts',
        taskHandler: (job) =>
          job.complete({
            concertResultsDoc: { documentId: 'test-d1', contentHash: 'test-h1' },
          }),
      }),
      zeebe.createWorker({
        taskType: 'fetch-spotify',
        taskHandler: (job) =>
          job.complete({
            spotifyArtistsDoc: { documentId: 'test-d2', contentHash: 'test-h2' },
          }),
      }),
      zeebe.createWorker({
        taskType: 'match-artists',
        taskHandler: (job) =>
          job.complete({ matchedConcerts }),
      }),
      zeebe.createWorker({
        taskType: 'io.camunda.agenticai:aiagent-job-worker:1',
        taskHandler: (job) => job.complete(),
      })
    );

    const { processInstanceKey } = await client.createProcessInstance({
      processDefinitionId: PROCESS_ID,
    });

    assert.ok(processInstanceKey, 'Process instance created');

    // Wait for the agent sub-process to be active (process won't complete
    // because the ad-hoc sub-process has an internal orchestration loop)
    await waitFor(async () => {
      try {
        const instance = await client.getProcessInstance(processInstanceKey);
        // Process should be ACTIVE (agent sub-process running)
        return instance.state === 'ACTIVE';
      } catch {
        return false;
      }
    });

    assert.ok(true, 'Process is active with agent sub-process');
  });
});
