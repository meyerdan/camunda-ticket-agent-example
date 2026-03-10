// Lightweight Node.js DSL runner that interprets CPT DSL JSON scenarios.
// Translates DSL instructions into Camunda 8 REST API calls via @camunda8/sdk.
//
// Uses searchElementInstances and searchVariables (available since 8.9 alpha)
// for real assertions instead of time-based stubs.
//
// Supports:
//   - MOCK_JOB_WORKER_COMPLETE_JOB
//   - CREATE_PROCESS_INSTANCE
//   - ASSERT_ELEMENT_INSTANCES
//   - ASSERT_PROCESS_INSTANCE
//   - ASSERT_VARIABLES

import assert from 'node:assert/strict';

// Polling helper
async function waitFor(fn, { timeout = 30_000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw lastError || new Error(`waitFor timed out after ${timeout}ms`);
}

function mapState(dslState) {
  switch (dslState) {
    case 'IS_ACTIVE': return 'ACTIVE';
    case 'IS_COMPLETED': return 'COMPLETED';
    case 'IS_COMPLETED_IN_ORDER': return 'COMPLETED';
    case 'IS_TERMINATED': return 'TERMINATED';
    case 'IS_CREATED': return 'ACTIVE';
    default: return dslState;
  }
}

/**
 * Run a single test case from a DSL scenario.
 *
 * @param {object} testCase         - { name, description, instructions }
 * @param {object} restClient       - CamundaRestClient from @camunda8/sdk (8.9+)
 * @param {object} zeebeClient      - ZeebeGrpcApiClient from @camunda8/sdk
 * @returns {Promise<{ workers: object[] }>}  Created workers (caller should close them)
 */
export async function runTestCase(testCase, restClient, zeebeClient) {
  const workers = [];
  let processInstanceKey = null;

  for (const instruction of testCase.instructions) {
    switch (instruction.type) {
      case 'MOCK_JOB_WORKER_COMPLETE_JOB': {
        const worker = zeebeClient.createWorker({
          taskType: instruction.jobType,
          taskHandler: (job) => job.complete(instruction.variables || {}),
        });
        workers.push(worker);
        break;
      }

      case 'CREATE_PROCESS_INSTANCE': {
        const result = await restClient.createProcessInstance({
          processDefinitionId: instruction.processDefinitionSelector.processDefinitionId,
          variables: instruction.variables || {},
        });
        processInstanceKey = result.processInstanceKey;
        assert.ok(processInstanceKey, 'Process instance created');
        break;
      }

      case 'ASSERT_PROCESS_INSTANCE': {
        const pid = instruction.processInstanceSelector.processDefinitionId;
        assert.ok(processInstanceKey, `No process instance for ${pid}`);

        const expectedState = mapState(instruction.state);
        await waitFor(async () => {
          const { items } = await restClient.searchProcessInstances({
            filter: { processInstanceKey },
          });
          return items?.[0]?.state === expectedState;
        });
        break;
      }

      case 'ASSERT_ELEMENT_INSTANCES': {
        assert.ok(processInstanceKey, 'No process instance for element assertion');
        const elementIds = instruction.elementSelectors.map((s) => s.elementId || s.elementName);
        const expectedState = mapState(instruction.state);

        if (instruction.state === 'IS_NOT_ACTIVATED') {
          // Wait briefly for the engine to settle, then verify no matching elements exist
          await new Promise((r) => setTimeout(r, 2000));
          for (const elementId of elementIds) {
            const { items } = await restClient.searchElementInstances({
              filter: { processInstanceKey, elementId },
            });
            assert.equal(
              items?.length ?? 0,
              0,
              `Expected element "${elementId}" to NOT be activated, but found ${items?.length} instance(s)`
            );
          }
          break;
        }

        // For IS_ACTIVE, IS_COMPLETED, IS_COMPLETED_IN_ORDER — poll until all elements reach the expected state
        for (const elementId of elementIds) {
          await waitFor(async () => {
            const { items } = await restClient.searchElementInstances({
              filter: { processInstanceKey, elementId, state: expectedState },
            });
            return items?.length > 0;
          }, { timeout: 30_000 });
        }
        break;
      }

      case 'ASSERT_VARIABLES': {
        assert.ok(processInstanceKey, 'No process instance for variable assertion');

        if (instruction.variableNames) {
          // Poll until all expected variables exist on the process instance
          await waitFor(async () => {
            const { items } = await restClient.searchVariables({
              filter: { processInstanceKey },
            });
            const varNames = new Set(items?.map((v) => v.name) ?? []);
            return instruction.variableNames.every((n) => varNames.has(n));
          }, { timeout: 30_000 });
        }
        break;
      }

      default:
        throw new Error(`Unsupported DSL instruction type: ${instruction.type}`);
    }
  }

  return { workers };
}
