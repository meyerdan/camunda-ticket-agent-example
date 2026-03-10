// DSL-driven integration test — runs the shared JSON scenario file
// through the lightweight Node.js DSL runner.
// Requires C8 Run on localhost:8080 (or ZEEBE_REST_ADDRESS env var).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Camunda8 } from '@camunda8/sdk';
import { runTestCase } from './dsl-runner.js';

const BPMN_PATH = resolve(import.meta.dirname, '../../resources/concerts-agent.bpmn');
const SCENARIO_PATH = resolve(import.meta.dirname, '../scenarios/happy-path.json');

describe('DSL Scenario: happy-path.json', () => {
  let c8;
  let restClient;
  let zeebeClient;
  const allWorkers = [];

  before(async () => {
    c8 = new Camunda8();
    restClient = c8.getCamundaRestClient();
    zeebeClient = c8.getZeebeGrpcApiClient();

    // Deploy the BPMN
    await restClient.deployResourcesFromFiles([BPMN_PATH]);
  });

  after(async () => {
    for (const w of allWorkers) {
      try { w.close(); } catch { /* ignore */ }
    }
  });

  // Load scenario and create one test per test case
  const scenario = JSON.parse(readFileSync(SCENARIO_PATH, 'utf-8'));

  for (const testCase of scenario.testCases) {
    it(testCase.name, async () => {
      console.log(`  Running DSL test case: "${testCase.name}"`);
      if (testCase.description) {
        console.log(`  Description: ${testCase.description}`);
      }

      const { workers } = await runTestCase(testCase, restClient, zeebeClient);
      allWorkers.push(...workers);
    });
  }
});
