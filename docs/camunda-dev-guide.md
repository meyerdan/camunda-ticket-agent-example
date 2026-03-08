# Camunda 8 Development Guide

Only non-obvious, Camunda-specific patterns that you can't infer from general knowledge. Read before generating any Camunda resources.

---

## MCP Server Setup

### Camunda Docs MCP — REQUIRED (documentation lookups)

URL: `https://camunda-docs.mcp.kapa.ai`
Provides: `search_camunda_knowledge_sources` — semantic search over Camunda 8 docs, forum posts, blogs.
This is how the AI agent looks up connector-specific configs (Slack, Kafka, SendGrid task types and input targets), current API patterns, and BPMN element support. Without it, the agent relies on training data which may be outdated.

First use requires Google sign-in (rate limiting: 40 req/hr, 200 req/day).

**Claude Code:**
```bash
claude mcp add camunda-docs --transport http https://camunda-docs.mcp.kapa.ai
```

**Other tools (VS Code Copilot, Cursor, ChatGPT Desktop):**
```json
{ "mcpServers": { "camunda docs": { "url": "https://camunda-docs.mcp.kapa.ai" } } }
```
See https://docs.camunda.io/docs/reference/mcp-docs/ for IDE-specific setup.

### Camunda Orchestration Cluster MCP — OPTIONAL (C8 Run 8.9+)

URL: `http://localhost:8080/mcp/cluster` (built-in, enabled by default)
Provides: start instances, search tasks/instances/incidents, resolve incidents, get BPMN XML.
Does NOT provide deployment.

This overlaps with c8ctl (which covers all the same operations plus deployment, watch mode, profiles). Use if your tool supports MCP natively (e.g., Claude Desktop), otherwise c8ctl is preferred.

**Claude Code:** `claude mcp add camunda --transport http http://localhost:8080/mcp/cluster`
SaaS does not have a built-in MCP endpoint — use c8ctl instead for SaaS operations.

---

## BPMN for Camunda 8 (Zeebe)

### Required Namespaces and Attributes

```xml
<bpmn:definitions
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  xmlns:modeler="http://camunda.org/schema/modeler/1.0"
  modeler:executionPlatform="Camunda Cloud"
  modeler:executionPlatformVersion="8.9.0"
  ...>
  <bpmn:process id="my-process" isExecutable="true">
```

The `zeebe` namespace and `isExecutable="true"` are mandatory. Without `modeler:executionPlatform`, Camunda Modeler won't recognize it as a C8 process.

### Zeebe Extension Elements

**Service task (custom job worker):**
```xml
<zeebe:taskDefinition type="my-task-type" retries="3"/>
```
The `type` string must exactly match the `taskType` in worker registration. Case-sensitive.

**Business rule task (DMN):**
```xml
<zeebe:calledDecision decisionId="risk-assessment" resultVariable="riskLevel"/>
```

**User task (Camunda Form):**
```xml
<zeebe:formDefinition formId="my-form-id"/>
<zeebe:userTask/>
```
The `formId` must match the `id` field in the `.form` JSON file.
The `<zeebe:userTask/>` element is **required** for native Camunda user tasks (8.5+). Without it, the task falls back to the deprecated job-based implementation and won't appear in the user-tasks API or Tasklist.

**Setting variables via IO mapping (e.g., before a notification task):**
```xml
<zeebe:ioMapping>
  <zeebe:input source="some-value" target="myVariable"/>
</zeebe:ioMapping>
```

### FEEL Expressions in BPMN

All FEEL expressions must be prefixed with `=`:
```xml
<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">=riskLevel = "HIGH"</bpmn:conditionExpression>
```

**Timer durations are also FEEL expressions** — they must use the `="..."` format:
```xml
<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">="PT7D"</bpmn:timeDuration>
```
Plain `PT7D` without the FEEL prefix will be rejected as an invalid duration format.

### Wildcard Error Catching

An empty `<bpmn:errorEventDefinition/>` on a boundary event catches ANY error (wildcard). To catch specific errors, add `errorRef`.

### Non-Interrupting Events

Boundary events default to `cancelActivity="true"` (interrupting). For non-interrupting (e.g., reminder timers), explicitly set `cancelActivity="false"`.

---

## Connectors (40+ built-in)

All outbound connectors (REST, Slack, Kafka, SendGrid, OpenAI, AWS, etc.) use the **same BPMN structure**. Only the task type and input target names change per connector.

### Universal pattern:
```xml
<zeebe:taskDefinition type="<CONNECTOR_TASK_TYPE>" retries="3"/>
<zeebe:ioMapping>
  <zeebe:input source="<value or FEEL expression>" target="<connector-specific-field>"/>
  <!-- more inputs as needed -->
</zeebe:ioMapping>
<zeebe:taskHeaders>
  <zeebe:header key="resultVariable" value="myResult"/>
  <zeebe:header key="resultExpression" value="=<FEEL expression to extract fields>"/>
  <zeebe:header key="retryBackoff" value="PT0S"/>
</zeebe:taskHeaders>
```

### To configure any specific connector:
1. Look up the connector in Camunda docs (use the Docs MCP tool or https://docs.camunda.io/docs/components/connectors/out-of-the-box-connectors/)
2. Find the **task type** (e.g., `io.camunda:http-json:1`, `io.camunda:slack:1`, `io.camunda:kafka:1`)
3. Find the **required input target names** and expected values
4. Apply them to the pattern above

Secrets (API keys, tokens) are referenced as `{{secrets.MY_SECRET}}` in input values.

### Non-obvious connector behaviors:
- Inputs (method, URL, body, auth, etc.) go in `<zeebe:ioMapping>` as `<zeebe:input>`
- Outputs (result extraction) go in `<zeebe:taskHeaders>` as `<zeebe:header>` — NOT in ioMapping
- Response shape for REST: `response.status`, `response.headers`, `response.body`
- `retryBackoff` is a reserved header key handled by the connector runtime

### REST connector example (most common, `io.camunda:http-json:1`):
```xml
<zeebe:taskDefinition type="io.camunda:http-json:1" retries="1"/>
<zeebe:ioMapping>
  <zeebe:input source="noAuth" target="authentication.type"/>
  <zeebe:input source="POST" target="method"/>
  <zeebe:input source="http://localhost:3001/api/endpoint" target="url"/>
  <zeebe:input source="={&#10;  &quot;name&quot;: applicantName,&#10;  &quot;email&quot;: email&#10;}" target="body"/>
  <zeebe:input source="20" target="connectionTimeoutInSeconds"/>
  <zeebe:input source="20" target="readTimeoutInSeconds"/>
</zeebe:ioMapping>
<zeebe:taskHeaders>
  <zeebe:header key="resultExpression" value="={&#10;  verified: response.body.verified,&#10;  score: response.body.score&#10;}"/>
  <zeebe:header key="retryBackoff" value="PT0S"/>
</zeebe:taskHeaders>
```

### REST connector input targets (must be exact):
`method`, `url`, `body`, `headers`, `queryParameters`, `authentication.type`, `authentication.token`, `authentication.username`, `authentication.password`, `connectionTimeoutInSeconds`, `readTimeoutInSeconds`

---

## DMN Decision Tables

### Namespace (must be exact):
```xml
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" ...>
```

### Non-obvious rules:
- Output string values **must be quoted**: `"HIGH"` not `HIGH` — unquoted = silent evaluation failure
- Empty `<text></text>` in input entries = **wildcard** (matches anything)
- List matching for strings: `"US","GB","DE"` (comma-separated, each quoted)
- Reference from BPMN: `<zeebe:calledDecision decisionId="..." resultVariable="..."/>`
- **`resultVariable` overwrites**: The DMN output is stored in the variable named by `resultVariable`. If this matches an existing process variable (e.g., an input), it **overwrites** it. Use a distinct name (e.g., `qualified` not `resumeScore`) to avoid clobbering input data.

---

## Camunda Forms

- File extension: `.form`
- Schema: `"type": "default"`, include `"schemaVersion"` (check current version via Docs MCP — it increments with releases, e.g., 16 for 8.5, 18 for 8.7+)
- The `id` field links to `<zeebe:formDefinition formId="..."/>` in the BPMN
- Form `key` values map directly to process variables
- Deploy `.form` files alongside BPMN in the same deployment request

---

## CLI: c8ctl

Install: `npm install @camunda8/cli -g` (requires Node.js >= 22.18)

Camunda 8 developer CLI. Falls back to `localhost:8080` by default — zero config needed for C8 Run.

Run `c8 help` to discover all commands. Key non-obvious features:
- `c8 deploy .` deploys all resources atomically (all-or-nothing)
- `c8 run ./resources/process.bpmn` deploys AND starts in one command
- `c8 watch` monitors folder and auto-redeploys on file changes
- `c8 use profile "modeler:Local Dev"` reads profiles from Camunda Desktop Modeler
- `c8 await pi --id=myProcess` starts and waits for process completion

## Deployment

Atomic (all-or-nothing): `c8 deploy ./resources` or `c8 deploy .`

Java/Spring Boot: BPMN/DMN/Forms in `src/main/resources/` auto-deploy on startup.

---

## API Gotchas (v2 — Camunda 8.9)

These matter when writing UI code or using the REST API directly. c8ctl abstracts most of these away.

| What | Wrong (v1/old) | Correct (v2/8.9) |
|------|---------------|-------------------|
| Start process field | `bpmnProcessId` | `processDefinitionId` |
| Flow node endpoint | `/v2/flownode-instances/search` | `/v2/element-instances/search` |
| Flow node ID field | `flowNodeId` | `elementId` |

### Variable serialization:
Variables from the API are double-serialized. String values come back as `"\"MEDIUM\""`. Always `JSON.parse(v.value)` to get the actual value.

---

## Worker SDK

### Node.js (@camunda8/sdk):
```typescript
import { Camunda8 } from '@camunda8/sdk';
const c8 = new Camunda8();
const zeebe = c8.getZeebeGrpcApiClient();
zeebe.createWorker({ taskType: 'my-type', taskHandler: async (job) => {
  return job.complete({ output: 'value' });
  // or: job.fail('reason')
  // or: job.error('BPMN_ERROR_CODE', 'message')
}});
```

Environment variables (SDK reads these automatically):
```
ZEEBE_REST_ADDRESS=http://localhost:8080
ZEEBE_GRPC_ADDRESS=grpc://localhost:26500
CAMUNDA_AUTH_STRATEGY=NONE
```

### Java (Camunda Spring Boot Starter):
```java
@JobWorker(type = "my-type")
public Map<String, Object> handle(@Variable String input) {
    return Map.of("output", "value");
}
// BPMN error: throw new ZeebeBpmnError("CODE", "message")
// Failure: throw any other exception (retries automatically)
```

Maven: `io.camunda:camunda-spring-boot-starter`

Config (`application.yaml` for C8 Run):
```yaml
camunda:
  client:
    mode: simple
    zeebe:
      enabled: true
      gateway-url: http://localhost:26500
      base-url: http://localhost:8080
```

**Java auto-deploys** BPMN/DMN/Forms from `src/main/resources/` on startup.

---

## SaaS Differences (vs. C8 Run)

- Auth: OAuth2 client credentials. Audience: `<clusterId>.zeebe.camunda.io`
- c8ctl: use `c8 add profile` + `c8 use profile` to switch between C8 Run and SaaS (run `c8 help profiles`)
- REST connector URLs **cannot reach localhost** — APIs must be publicly accessible or tunneled (ngrok)
- Cluster MCP: not available on SaaS (no built-in endpoint) — use c8ctl for all operations
- SDK env vars: `CAMUNDA_CLIENT_ID`, `CAMUNDA_CLIENT_SECRET`, `CAMUNDA_CLUSTER_ID`, `CAMUNDA_CLUSTER_REGION`
- Java config: `camunda.client.mode: saas` with auth block
