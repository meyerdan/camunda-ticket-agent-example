# Node.js Workers

SDK: `@camunda8/sdk`

```typescript
import { Camunda8 } from '@camunda8/sdk';
const c8 = new Camunda8();
const zeebe = c8.getZeebeGrpcApiClient();
zeebe.createWorker({ taskType: 'my-type', taskHandler: async (job) => {
  return job.complete({ output: 'value' });
  // job.fail('reason') — retries
  // job.error('BPMN_CODE', 'msg') — caught by error boundary events
}});
```

SDK reads env vars automatically (see env module).
