// Idiomatic integration test using @camunda8/sdk 8.9 alpha.
// Uses searchElementInstances and searchVariables for real assertions.
// Requires C8 Run on localhost:8080 (or ZEEBE_REST_ADDRESS env var).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Camunda8 } from '@camunda8/sdk';
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

    // Wait for process to complete via searchProcessInstances
    await waitFor(async () => {
      const { items } = await client.searchProcessInstances({
        filter: { processInstanceKey },
      });
      return items?.[0]?.state === 'COMPLETED';
    });

    // Verify End_NoMatches was reached via searchElementInstances
    const { items: endElements } = await client.searchElementInstances({
      filter: { processInstanceKey, elementId: 'End_NoMatches', state: 'COMPLETED' },
    });
    assert.ok(endElements?.length > 0, 'End_NoMatches element completed');

    // Verify AgentTools sub-process was never activated
    const { items: agentElements } = await client.searchElementInstances({
      filter: { processInstanceKey, elementId: 'AgentTools' },
    });
    assert.equal(agentElements?.length ?? 0, 0, 'AgentTools sub-process was not activated');
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

    // Wait for service tasks to complete via searchElementInstances
    for (const elementId of ['Task_FetchConcerts', 'Task_FetchSpotify', 'Task_MatchArtists']) {
      await waitFor(async () => {
        const { items } = await client.searchElementInstances({
          filter: { processInstanceKey, elementId, state: 'COMPLETED' },
        });
        return items?.length > 0;
      });
    }

    // Verify AgentTools sub-process is active
    await waitFor(async () => {
      const { items } = await client.searchElementInstances({
        filter: { processInstanceKey, elementId: 'AgentTools', state: 'ACTIVE' },
      });
      return items?.length > 0;
    });

    // Verify expected variables exist via searchVariables
    await waitFor(async () => {
      const { items } = await client.searchVariables({
        filter: { processInstanceKey },
      });
      const varNames = new Set(items?.map((v) => v.name) ?? []);
      return ['matchedConcerts', 'concertResultsDoc', 'spotifyArtistsDoc']
        .every((n) => varNames.has(n));
    });
  });
});
