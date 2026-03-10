# AI-Assisted Camunda Development: Developer Experience Feedback

## Context

I built an end-to-end Camunda 8 process using Claude Code as an AI coding assistant — no visual modeler involved. The process fetches concerts from Ticketmaster, cross-references with a user's Spotify library, and hands off to an AI Agent (via the Camunda AI Agent connector) that converses with the user over WhatsApp.

This is relevant because AI-assisted development is becoming a primary way developers build software. Claude Code writes BPMN XML, configures connectors, and iterates on errors — much like a developer would using the Modeler, but programmatically. The friction points below are amplified for AI assistants but affect any developer working outside the visual modeler (CI/CD pipelines, IaC, code-first BPMN generation, testing frameworks).

---

## Summary

Problems are ordered by severity — most urgent first.

| # | Problem | Severity | Fix Complexity | Known Issue? |
|---|---------|----------|----------------|--------------|
| 1 | AI Agent connector not discoverable from problem description | High | Medium (docs + use-case guides) | No |
| 2 | Webhook path conflicts across versions | High | Fixed in alpha5 | Yes — [#3227](https://github.com/camunda/connectors/issues/3227), fixed in 8.9.0-alpha5 ([PR #6056](https://github.com/camunda/connectors/pull/6056)) |
| 3 | Connector input contracts undocumented | High | Medium (auto-generate from templates) | No |
| 4 | AI Agent tool I/O contract hard to figure out | High | Medium (docs + reference page) | No |
| 4.1 | Testing: No DSL generator | High | Medium? | Assumed, but no ProductHub issues found |
| 4.2 | Testing: Element instance + variable search APIs not discoverable | Medium | Low (docs + SDK) | Partially resolved — `@camunda8/sdk` 8.9.0-alpha.3 added typed methods; docs gap remains |
| 4.3 | Testing: No way to mock ad-hoc sub-process completion | High | Medium (CPT API addition) | Yes — [#3315](https://github.com/camunda/product-hub/issues/3315) |
| 4.4 | Testing: No CPT-equivalent for non-Java API clients | Medium | High (new packages per SDK) | No - yet [Josh has already triaged that](https://github.com/jwulf/camunda-process-test-js)  |
| 5 | Webhook connector properties undocumented | Medium | Medium (same pattern as #3) | No |
| 6 | Enum values hidden in element templates | Medium | Low (add to docs + improve error messages) | No |
| 7 | Duplicate message subscriptions go undetected | Medium | Low (docs + runtime warning) | By design — [documented](https://docs.camunda.io/docs/components/concepts/messages/) but surprising |
| 8 | AI Agent Task vs Sub-process differences unclear | Medium | Low (docs improvement) | No |
| 9 | Connector error messages obfuscated | Medium | Low (likely a bug) | No |
| 10 | Timer processes can't be manually started | Low | Medium (engine change) | No |
| 11 | BPMN XML ordering errors misleading | Low | Medium (validation improvement) | No |


## What the AI did vs. what required human intervention

| Category | AI (Claude Code) | Human guidance needed |
|----------|-----------------|----------------------|
| **Architecture** | Designed an explicit BPMN conversation loop (receive → LLM call → reply → done check → loop) | Recognized the AI Agent connector + ad-hoc sub-process was the right pattern; redirected the AI away from the hand-rolled loop |
| **Sub-flow tools** | Had no model for making a tool "wait" for an external callback | Suggested the two-element sub-flow pattern (service task → receive task) inside the ad-hoc sub-process |
| **Implementation** | Wrote all BPMN XML, workers, connector config, chat server, environment setup | Dev kit provided scaffolding guidance for ad-hoc sub-process structure |
| **Debugging** | Diagnosed webhook version conflicts from connector runtime logs; discovered port 8086 vs 8080; traced misrouted messages to duplicate correlation keys | — |
| **Connector config** | Reverse-engineered `zeebe:properties`, `fromAi()`, `toolCallResult` from element template JSON through trial and error | — |
| **Correlation keys** | Implemented unique keys per tool call after diagnosing the stale instance problem | Pointed out that "target most recent instance" would hide bugs until production; the correct fix is unique keys + warnings |

**The pattern:** The AI is effective at execution — writing code, debugging errors, reading logs, iterating on configuration. But it missed architectural choices that required knowing Camunda's connector catalog and recognizing that a domain-specific abstraction (AI Agent connector) was a better fit than a general BPMN pattern (explicit loop). The [Camunda AI Dev Kit](https://github.com/meyerdan/camunda-ai-dev-kit) and human guidance bridged that gap. This suggests that **dev tooling and documentation are the highest-leverage investments** — when the right pattern is surfaced (via dev kit, docs, or examples), the AI can execute on it effectively.

The highest-leverage fixes are:

1. **Make the AI Agent connector discoverable** from common use-case descriptions, with concrete sub-flow tool examples (Problem 1)
2. **Publish programmatic references** for connector input contracts and webhook properties (Problems 3, 5)
3. **Document the complete tool lifecycle** including `fromAi()`, `toolCallResult`, and webhook interaction patterns (Problem 4)
4. **Improve connector runtime observability** — log which version handles each request (Problem 2)

---


## Testing DX Assessment

### What was built

Dual-language tests for the concerts-agent process to compare Java and Node.js testing DX:

| Dimension | Node.js | Java (CPT) |
|-----------|---------|------------|
| **Unit tests** | 48 tests across 6 files | N/A (workers are JS — no Java unit tests for worker logic) |
| **Integration tests** | 2 idiomatic SDK tests + 2 DSL-driven tests | 3 CPT tests + 2 DSL scenario tests (via `@TestScenarioSource`, 8.9.0-alpha5) |
| **Test runner** | `node:test` (built-in, zero deps) | JUnit 6 + Surefire 3.5.5 + Testcontainers (via CPT) |
| **BPMN process testing** | REST API search endpoints (`searchElementInstances`, `searchVariables`) + polling | `@CamundaProcessTest` with rich assertion API |
| **Framework overhead** | 0 new dependencies for unit tests | Separate Maven project with ~10 transitive dependencies |
| **Test execution wall time** | Unit: ~80ms / Integration: needs C8 Run | ~46s for 5 tests (includes Testcontainers container startup) |

### Setup Effort

| | Node.js | Java (CPT) |
|---|---------|------------|
| **Unit tests** | Zero setup — `node --test` is built-in. Add `"test"` script to package.json. | Would need: new Maven project, Spring Boot config, build plugins — but not applicable since workers are JS. |
| **Integration tests** | Requires C8 Run already running. SDK already a project dependency. | Add `pom.xml` with `camunda-process-test-java`, JUnit 6, surefire 3.5.5. CPT auto-starts Docker container. |
| **First-run friction** | none: `node --test 'tests/unit/*.test.js'`. | CPT 8.9.0-alpha5 pulls JUnit 6.0.3 — a major version jump from JUnit 5. Surefire 3.5.5 is required; earlier 3.5.x versions fail with `OutputDirectoryProvider` errors. This version alignment is not documented. |
| **Zeebe resources (BPMN, DMN, Forms) file access** | Direct `import.meta.dirname` resolution — works naturally. | Copy Zeebe resources to `src/test/resources/` (Maven convention). |

### Test Authoring

| | Node.js | Java (CPT) |
|---|---------|------------|
| **Unit test ergonomics** | `node:test` + `node:assert` are minimal, fast, zero-config. Mock API (`mock.fn()`) is adequate. | N/A — worker logic is in JS. |
| **Process test assertions** | `searchProcessInstances` for state, `searchElementInstances` for per-element state, `searchVariables` for variable values — all with polling. Comparable assertions to CPT but verbose. | Rich: `assertThat(processInstance).hasCompletedElements("A", "B").isCompleted()`. Auto-waits with timeout. |
| **Mock workers** | SDK's `createWorker()` with inline handlers. Must manage worker lifecycle manually (close after test). | `processTestContext.mockJobWorker("type").thenComplete(vars)`. Auto-cleaned per test. |
| **Gateway/routing verification** | `searchElementInstances` with `elementId` + `state` filter verifies which elements were activated/completed. Can also check `searchVariables` for routing-dependent data. | Can assert on specific elements: `hasActiveElements("AgentTools")`, `hasNotActivatedElements("End_NoMatches")`. |

**Verdict:** Java CPT has more ergonomic process-level assertions (fluent API, auto-wait). Node.js can now achieve equivalent assertion coverage via the 8.9 alpha SDK's `searchElementInstances` and `searchVariables` search methods, but requires more boilerplate (manual polling loops, explicit filter construction).

### DSL Comparison

| | Node.js | Java (CPT) |
|---|---------|------------|
| **Runner** | Custom `dsl-runner.js` (~120 lines) interprets JSON → SDK calls. | Built-in `TestScenarioRunner` + `@TestScenarioSource` annotation. |
| **Scenario file** | Shared `tests/scenarios/happy-path.json` | Same JSON copied to `src/test/resources/scenarios/` |
| **Feature coverage** | 5 instruction types with full assertions: `searchElementInstances` for element state, `searchVariables` for variable existence, `searchProcessInstances` for process state. | All 25 instruction types. Full element-level assertions. |
| **Availability** | Works now with `@camunda8/sdk` 8.9.0-alpha.3 (custom runner). | Works with CPT 8.9.0-alpha5. `TestScenarioRunner` is auto-injected by `@CamundaProcessTest`. |

**Verdict:** The shared JSON scenario approach works well — the same `happy-path.json` drives both runners. Java's built-in `@TestScenarioSource` + `TestScenarioRunner` is zero-code (just `testScenarioRunner.run(testCase)`); Node.js needs a custom runner (~120 lines) but can now implement full assertions using the 8.9 alpha SDK's `searchElementInstances`, `searchVariables`, and `searchProcessInstances` methods. The remaining gap is instruction type coverage (5 vs 25) — the Node.js runner only implements the types used in our scenarios.

### Ad-Hoc Sub-Process Testing

The AI Agent ad-hoc sub-process was the main testing challenge in both languages:

- **Java CPT:** `mockJobWorker("io.camunda.agenticai:aiagent-job-worker:1").thenComplete()` activates the sub-process but doesn't complete it — the orchestration loop keeps creating new jobs. Test adjusted to assert `hasActiveElements("AgentTools")` instead of full completion.
- **Node.js:** Same limitation. Mock worker completes individual jobs but can't signal the end of the agent's conversation loop. Asserted via `searchElementInstances({ filter: { processInstanceKey, elementId: 'AgentTools', state: 'ACTIVE' } })`.
- **Root cause:** The agentic connector's internal loop semantics aren't exposed for testing. You can't tell either framework "the agent is done, close the sub-process."

### Integration Test Infrastructure

| | Node.js | Java (CPT) |
|---|---------|------------|
| **Engine** | External: requires C8 Run already running on localhost:8080 | Embedded: Testcontainers auto-starts a Camunda Docker container |
| **Isolation** | Shared engine state between test runs (risk of interference) | Clean engine per test class (container recycled, data purged per test) |
| **CI/CD** | Need to start C8 Run before tests, or use Docker Compose | Just Docker — `mvn test` handles everything |
| **Coverage reports** | None built-in | CPT generates BPMN coverage report (we got 50% for our test) |

**Verdict:** Java CPT's self-contained testing (Testcontainers + auto-cleanup + coverage) is significantly more mature for CI/CD. Node.js integration tests require manual orchestration.

---

## Problem 1: The AI Agent connector is not discoverable from the problem description

### What happened

When building this project, the initial design used an **explicit BPMN conversation loop**: receive message → call LLM (via `@anthropic-ai/sdk` in a custom worker) → send reply → check if conversation is done → loop back. This is the standard BPMN pattern for iterative interactions and the one an AI coding assistant (or any developer familiar with BPMN but not Camunda's connector catalog) would naturally reach for.

The AI Agent connector with an ad-hoc sub-process — where the agent drives the conversation through tool calls and no explicit loop is needed — was only adopted after a **human** recognized the pattern and pointed the AI assistant to it. The assistant did not discover or suggest the AI Agent connector on its own. Once the architectural direction was set, the [Camunda AI Dev Kit](https://github.com/meyerdan/camunda-ai-dev-kit) provided implementation guidance (scaffolding the ad-hoc sub-process with root-element tools, `fromAi()` parameters, and `toolCallResult` output mapping), but without the human's intervention the project would have shipped with the hand-rolled loop, a direct LLM SDK dependency, and a custom `process-message.js` worker — all unnecessary complexity.

Even after discovering the AI Agent connector, the **sub-flow tool pattern** required a separate hint. The "Send message and wait for reply" tool is not a single service task — it's a two-element sub-flow: a service task (sends the message) connected via sequence flow to a receive task (waits for the reply via webhook). The ad-hoc sub-process detects only root elements (nodes with no incoming sequence flows) as tools, so the agent sees one tool while BPMN executes two steps. This pattern — composing a multi-step tool from connected BPMN elements inside an ad-hoc sub-process — is mentioned briefly in the docs ("You can use any BPMN elements and connectors as tools and to model sub-flows within the ad-hoc sub-process") and in a [blog post](https://camunda.com/blog/2025/11/designing-ai-agents-in-camunda-ai-agent-task-connector-with-loop/) ("the tool is a set of BPMN elements"). But there is no concrete example of a "send and wait" sub-flow, and the AI assistant did not arrive at this pattern on its own — it was only built because it was explicitly suggested. Without that guidance, the assistant had no model for how to make an agent tool "wait" for an external callback.

### Why it matters

- **The problem description doesn't lead to the solution.** A developer thinking "I need a process that has a conversation with a user" will search for "BPMN conversation loop" or "message correlation patterns," not "AI Agent ad-hoc sub-process." The connector solves the problem elegantly, but you have to already know it exists.
- **AI coding assistants are particularly affected.** They pattern-match from training data, which has abundant examples of explicit loops and very few examples of Camunda's agentic connector pattern. Without a dev kit or explicit guidance, they will consistently choose the worse architecture.
- **The ad-hoc sub-process concept is unfamiliar.** Even developers who find the AI Agent connector docs may not understand that "tools are root elements in an ad-hoc sub-process" means they don't need a loop. The mental model shift from "explicit orchestration" to "agent-driven tool calling" needs a bridge.
- **Sub-flow tools are a hidden power feature.** The ability to compose a tool from multiple BPMN elements (service task → receive task, or service task → gateway → multiple paths) is extremely powerful but hard to discover. The "root element = tool entry point" convention is documented briefly, but without a concrete "send and wait" example, developers (and AI assistants) default to assuming each tool must be a single task.
- **The manual approach works but is worse in every way.** The explicit loop required more BPMN elements, a custom worker, a direct LLM dependency, manual context management, and a "done" check gateway. The AI Agent connector eliminated all of this. But "it works" is the enemy of "there's a better way" — developers who build the loop first have little reason to discover the connector later.

### Suggestion

1. **Use-case-based documentation entry points.** Add a "Building conversational processes" or "Adding AI to your process" guide that starts from the problem ("I want my process to have a back-and-forth conversation") and leads to the AI Agent connector — not buried in the connector catalog but linked from the main BPMN patterns / best practices docs.
2. **"Before and after" examples.** Show the explicit loop pattern side-by-side with the AI Agent connector approach, making the simplification immediately visible. This validates developers who built the loop ("you're not wrong") while showing the better path.
3. **Document sub-flow tools with concrete examples.** The docs mention sub-flows are supported and a blog post references "sets of BPMN elements," but there are no step-by-step examples of the most useful patterns. Add a "Sub-flow tool recipes" section to the AI Agent connector docs with examples: send-and-wait (service → catch event), conditional tools (service → gateway → paths), and enrichment chains (service → service). The "send and wait" pattern in particular is critical for any agent that interacts with external systems asynchronously.
4. **Dev tooling that suggests the pattern.** The Camunda AI Dev Kit proved this works — when the `new-agent` skill was available, the right architecture emerged naturally. Integrating similar guidance into the Modeler (e.g., "This loop with an LLM call could be replaced by an AI Agent sub-process") or the docs would have the same effect.

---

## Problem 2: Webhook connector path conflicts across process definition versions

**Likely fixed in 8.9.0-alpha5** — see [#3227](https://github.com/camunda/connectors/issues/3227) / [PR #6056](https://github.com/camunda/connectors/pull/6056). We were running 8.9.0-alpha4.

### What happened

After 13 iterative deployments with changing webhook connector configurations, the connector runtime loaded connectors from multiple versions. An old version (v10) registered on the `whatsapp-reply` path first and became the primary handler; the current version (v13) went to standby. All incoming requests were processed by v10's connector with its outdated activation condition, returning 422. The fix required restarting the connector runtime.

### Remaining suggestion

Even after the alpha5 fix, **log which version is handling a request**. The current log says "Activation condition not met" but doesn't say which process definition version evaluated the condition — this cost significant debugging time.

---

## Problem 3: Connector input contracts are undocumented

### What happened

The AI Agent connector requires specific `zeebe:input` target names like `data.systemPrompt.prompt`, `data.memory.storage.type`, and `provider.openai.authentication.apiKey`. These names are not documented anywhere in the Camunda docs. The documentation describes fields conceptually ("System Prompt", "Memory storage type") but never provides the programmatic field names.

To discover the correct names, I had to download the raw element template JSON from GitHub (`agenticai-aiagent-job-worker.json`) and parse the binding definitions manually.

### Why it matters

- Any developer writing BPMN programmatically (code-first, CI/CD, testing) has no reference for these fields
- AI coding assistants cannot reliably generate correct connector configurations
- The element template JSON is the de facto API contract, but it's treated as an internal implementation detail

### Suggestion

Publish a **Connector Input Reference** for each connector — a table mapping the UI field label to its `zeebe:input` binding name, expected type, valid values, and default. This could be auto-generated from the element template JSON and included in each connector's documentation page. Example:

| UI Label | Binding Name | Type | Valid Values | Default |
|----------|-------------|------|-------------|---------|
| Memory storage type | `data.memory.storage.type` | enum | `in-process`, `document-storage`, `custom` | `in-process` |
| Context window size | `data.memory.contextWindowSize` | number | — | `20` |

---

## Problem 4: AI Agent tool I/O contract (`fromAi` / `toolCallResult`) is hard to figure out

### What happened

The AI Agent connector's tools communicate with the agent through a specific contract: input parameters are declared using `fromAi()` in `zeebe:input` mappings, and the tool's result must be written to a variable named `toolCallResult`. Getting this working required piecing together information from multiple sources:

1. **Declaring tool parameters**: Each tool's input mappings use `fromAi("paramName", "type", "description")` as a FEEL source expression. The connector reads these to build the tool's JSON Schema for the LLM. This function signature — including valid types (`string`, `number`, `boolean`, `object`, `array`) — is not documented outside the element template.
2. **Returning tool results**: The tool must set a variable named exactly `toolCallResult` (not `result`, not `output`, not `response`). For simple workers, this means calling `job.complete({ toolCallResult: "..." })`. For webhook connectors inside the sub-flow, this means writing a `resultExpression` like `={toolCallResult: request.body.text}`. The variable name convention is mentioned in the docs but easy to miss among all the other configuration.
3. **Scope matters**: The `toolCallResult` variable must be set at the right scope — inside the ad-hoc sub-process, not at the process level. Workers do this naturally (they complete the job that activated them), but webhook connector `resultExpression` behavior inside ad-hoc sub-processes was unclear and required experimentation.
4. **The `agent` result variable**: The ad-hoc sub-process itself produces an `agent` result variable containing `agent.context` (conversation memory), `agent.response` (last LLM response), and `agent.toolCalls` (tool call history). This structure is documented but the interaction between `toolCallResult` (per-tool) and `agent` (per-iteration) took trial and error to understand.

### Why it matters

- The `fromAi()` → worker execution → `toolCallResult` → agent loop is the core contract for building AI Agent tools, but it's spread across multiple doc pages (connector config, ad-hoc sub-process, worker patterns)
- The exact variable name `toolCallResult` is a magic string — if you get it wrong, the agent silently receives no result and may hallucinate or retry
- AI coding assistants struggle particularly with this because there's no single reference page showing the complete tool lifecycle with code examples
- The interaction between webhook connector `resultExpression` and the `toolCallResult` convention is not documented at all

### Suggestion

1. **Create a "Tool Lifecycle" reference page** that shows the complete flow in one place: how `fromAi()` declares parameters → how the connector builds the tool schema → how the worker/connector executes → how `toolCallResult` flows back to the agent → how the agent decides the next action. Include code examples for each tool type (simple worker, webhook sub-flow, connector).
2. **Make `toolCallResult` less magic**: Consider accepting the variable name as a configurable property on the ad-hoc sub-process (defaulting to `toolCallResult`), or at minimum, add prominent documentation with a warning: *"Your tool MUST set a variable named `toolCallResult`. Any other name will be silently ignored."*
3. **Add `fromAi()` to the FEEL function reference** with its full signature, valid types, and examples.

---

## Problem 4.1: No DSL scenario generator — the "test gap" between BPMN and JSON

### What happened

The CPT DSL (`@TestScenarioSource` + `TestScenarioRunner`) lets you write test scenarios as JSON and run them in any language. But **there is no tool to generate these JSON scenarios** — not from BPMN files, not from existing Java tests, not from process execution traces. The codebase has a `TestScenarioReader` (deserializes JSON) and a `TestScenarioRunner` (executes test cases), but no `TestScenarioWriter` or generator of any kind.

To create our `happy-path.json`, I had to:
1. Read the BPMN process to understand the element IDs, job types, and flow routing
2. Read the CPT DSL source code in the camunda repo to learn the 25 supported instruction types, selector field names, and state enum values (`IS_COMPLETED`, `IS_NOT_ACTIVATED`, `IS_ACTIVE`, etc.)
3. Study the JSON Schema file (`test-scenario-dsl.schema.json`) for structural validation
4. Manually translate the hand-written `ProcessFlowTest.java` tests — mapping `mockJobWorker()` calls to `MOCK_JOB_WORKER_COMPLETE_JOB` instructions, `createInstanceCommand` to `CREATE_PROCESS_INSTANCE`, and `assertThat()` chains to `ASSERT_ELEMENT_INSTANCES` / `ASSERT_PROCESS_INSTANCE`
5. Get the instruction ordering right — mocks must come before `CREATE_PROCESS_INSTANCE`, assertions after

The official docs acknowledge this gap and recommend: *"Use AI to support the generation of your test scenario DSL files. Provide the JSON schema, a description of your test case, and your BPMN processes to get a first draft."* This is practical advice, but it means the developer (or AI assistant) must discover the schema, understand all instruction types, and manually validate the output — there's no feedback loop shorter than running the actual test.

### Why it matters

- **The DSL's main value proposition is cross-language test sharing**, but the authoring cost is high enough to discourage adoption. Writing equivalent Java tests with `mockJobWorker()` and `assertThat()` is faster and gives better IDE support (type checking, autocompletion). Developers will default to the imperative Java API unless the declarative JSON is easier to produce.
- **BPMN files contain most of the information needed.** Element IDs, job types (`zeebe:taskDefinition`), message names, and sequence flow routing are all in the XML. A generator could produce a skeleton scenario (mock all service tasks, create instance, assert completion) that the developer then fills in with test data.
- **The Immutables Builder API exists but isn't exposed.** The CPT codebase has `ImmutableTestScenario.builder()` and `ImmutableTestCase.builder()` for programmatically constructing scenarios in Java (used internally for testing). A `TestScenarioWriter` that serializes these to JSON would close the loop — write tests in Java with IDE support, export to JSON for cross-language use.
- **AI coding assistants need a schema to generate reliably.** The docs recommend using AI, but the JSON Schema alone isn't enough context. The AI also needs to know instruction ordering rules (mocks before instance creation), which selectors apply to which instructions, and which state enums are valid for which assertion types. A generator or at minimum a well-documented "scenario cookbook" would make AI generation much more reliable.

### Suggestion

1. **Build a BPMN → scenario skeleton generator.** Given a BPMN file, produce a JSON scenario with `MOCK_JOB_WORKER_COMPLETE_JOB` for each service task, `CREATE_PROCESS_INSTANCE`, and `ASSERT_PROCESS_INSTANCE` with `IS_COMPLETED`. The developer fills in variables and adds specific assertions. This could be a Maven plugin (`mvn camunda:generate-test-scenario`), a CLI tool (`c8ctl` plugin!), or a Modeler feature.
2. **Add a `TestScenarioWriter`** that serializes `TestScenario` objects to JSON. This enables a Java-first workflow: write scenarios with IDE autocompletion using the builder API, export to JSON for polyglot use. The building blocks (Immutables builders + Jackson) already exist.
3. **Publish a "Scenario Cookbook"** with annotated examples for common patterns: service task pipelines, exclusive gateways, message correlation, ad-hoc sub-processes, timer events. Each example should show the BPMN pattern, the resulting JSON scenario, and explain the instruction ordering.

---

## Problem 4.2: Element instance and variable search APIs exist but are not discoverable for testing

### What happened

When building the Node.js integration tests and the custom DSL runner (`dsl-runner.js`), I needed to assert which BPMN elements had been activated, completed, or terminated during a process instance execution. Java CPT can do this natively — `assertThat(processInstance).hasCompletedElements("Task_FetchConcerts", "Task_FetchSpotify")` works because CPT has direct access to the engine's internal state via the embedded Testcontainers runtime.

The V2 REST API already has the endpoints needed, and the `@camunda8/sdk` 8.9.0-alpha.3 exposes them as typed methods:

| Method | Path | SDK method (8.9 alpha) | What it does |
|--------|------|------------------------|--------------|
| `POST` | `/v2/element-instances/search` | `searchElementInstances()` | Search element instances by `processInstanceKey`, `state`, `elementId`, `type`, etc. |
| `GET` | `/v2/element-instances/{key}` | — | Get a single element instance by key |
| `POST` | `/v2/variables/search` | `searchVariables()` | Search variables by `processInstanceKey`, `scopeKey`, `name` |
| `GET` | `/v2/variables/{key}` | — | Get a single variable (full value) |
| `GET` | `/v2/process-instances/{key}/statistics/element-instances` | — | Aggregated element counts by state |
| `GET` | `/v2/process-instances/{key}/sequence-flows` | — | Which sequence flows were taken |


Discoverability on these endpoints was difficult:
- The testing documentation (`test-scenario-dsl.md`, CPT guides) never mentions these REST endpoints as an alternative for non-Java assertions
- The AI coding assistant (which wrote the original DSL runner) searched for endpoints on the `/v2/process-instances/{key}/...` sub-resource pattern and found only the statistics/sequence-flows/call-hierarchy endpoints — it did not discover the top-level `/v2/element-instances/search` and `/v2/variables/search` endpoints



### Why it matters

- **The capability exists but the testing docs don't connect the dots.** A developer reading the CPT DSL documentation and wanting to implement a non-Java runner has no indication that `POST /v2/element-instances/search` exists and can serve as the foundation for `ASSERT_ELEMENT_INSTANCES`. The REST API reference and the testing guide are separate doc trees with no cross-references.
- **AI coding assistants pattern-match on sub-resources.** When asked "how do I get element instances for a process instance?", an AI will look for `/v2/process-instances/{key}/element-instances` (a sub-resource, which doesn't exist) rather than the top-level search endpoint with a filter. This is a REST API design choice, not a bug, but it reduces discoverability.
- **The API scatters process instance data across unrelated top-level resources.** To fully inspect a process instance's state for testing, you need to call three separate endpoints across two different URL hierarchies: `POST /v2/element-instances/search` (with a `processInstanceKey` filter) for element states, `POST /v2/variables/search` (with the same filter) for variables, and `GET /v2/process-instances/{key}` for the overall process state. None of these sit under `/v2/process-instances/{key}/...` where a developer would naturally look. By contrast, `/v2/process-instances/{key}/statistics/element-instances` and `/v2/process-instances/{key}/sequence-flows` *do* live under the process instance sub-resource — but they return aggregated counts, not the individual element instances you need for assertions. The result: a developer who explores the process instance sub-resource finds tantalizing hints (statistics, sequence flows) but misses the actual data (element states, variables) because it lives elsewhere. A convenience endpoint like `GET /v2/process-instances/{key}/element-instances` or even a composite `GET /v2/process-instances/{key}/details` returning elements + variables in one call would dramatically improve the testing DX.
- **The sequence-flows endpoint is a hidden gem.** `GET /v2/process-instances/{key}/sequence-flows` returns which paths were taken through the process, which is arguably even better for testing gateway routing than element state assertions. This endpoint is not mentioned anywhere in the testing documentation.

### Suggestion

1. **Cross-reference REST API endpoints in the testing documentation.** Add a "Testing with the REST API" section to the CPT DSL docs showing how non-Java runners can implement assertions using `POST /v2/element-instances/search`, `POST /v2/variables/search`, and `GET /v2/process-instances/{key}/sequence-flows`. Include concrete examples with the `@camunda8/sdk` typed methods.
2. **Add convenience sub-resource endpoints under `/v2/process-instances/{key}/`.** A `GET /v2/process-instances/{key}/element-instances` endpoint (returning the same data as the search endpoint, pre-filtered to that process instance) would match the mental model developers start with. Similarly, `GET /v2/process-instances/{key}/variables` would eliminate the need to know about the top-level search endpoint. This is a thin wrapper over the existing search infra but would significantly improve discoverability.
3. **Document the Node.js testing pattern.** A "Testing Camunda processes with Node.js" guide showing the polling + search pattern would help developers who can't or don't want to use Java CPT.

---

## Problem 4.3: CPT needs a way to mock ad-hoc sub-process completion for agentic processes

### What happened

Both the Java CPT and Node.js integration tests hit the same wall: you can mock the AI Agent connector's job worker (`io.camunda.agenticai:aiagent-job-worker:1`) to activate the ad-hoc sub-process, but you cannot signal that the agent's conversation is **done**. The connector's internal orchestration loop keeps creating new jobs after each tool call, and neither framework provides a way to say "the agent has finished — close the sub-process."

In Java CPT, `mockJobWorker("io.camunda.agenticai:aiagent-job-worker:1").thenComplete()` completes the initial activation job, but the loop immediately creates the next one. The test can only assert `hasActiveElements("AgentTools")` — never `isCompleted()`. In Node.js, the same limitation applies: the mock worker completes individual jobs but cannot terminate the loop.

The workaround in both languages was to **weaken the assertions**: instead of testing the full happy path through the agent and out the other side, the tests assert that the ad-hoc sub-process *activated* and stop there. This means the post-agent portion of the process (everything after the ad-hoc sub-process) is untested.

### Why it matters

- **Every process using the AI Agent connector has an untestable segment.** The post-agent flow — which may include error handling, notifications, data persistence, or downstream service calls — cannot be reached in a CPT test.
- **The ad-hoc sub-process is opaque to the test framework.** CPT treats it as a black box with no hooks for controlling its lifecycle. Unlike service tasks (where `thenComplete(vars)` gives full control), the agent sub-process has no `thenFinish()` or `mockAdHocSubProcessCompletion()` equivalent.
- **This is a known gap** tracked in [camunda/product-hub#3315](https://github.com/camunda/product-hub/issues/3315).

### Suggestion

Follow [camunda/product-hub#3315](https://github.com/camunda/product-hub/issues/3315) :)

---

## Problem 4.4: Publish a CPT-equivalent testing package for every officially supported API client

### What happened

Java CPT provides a turnkey process testing experience: `@CamundaProcessTest` starts an engine via Testcontainers, auto-registers mock workers, and offers a fluent assertion API (`assertThat(processInstance).hasCompletedElements(...).isCompleted()`). The entire ceremony is one annotation and a few lines of assertion code.

The Node.js SDK (`@camunda8/sdk` 8.9.0-alpha.3) now has the raw building blocks — `searchElementInstances()`, `searchVariables()`, `searchProcessInstances()` — but using them for testing requires substantial boilerplate:

- **Polling loops.** Every assertion needs a retry-with-timeout wrapper because the search endpoints are eventually consistent. Java CPT handles this internally; Node.js tests must implement it manually.
- **Filter construction.** Each search call requires building a filter object (`{ filter: { processInstanceKey, elementId, state } }`). CPT abstracts this behind `hasCompletedElements("A", "B")`.
- **Worker lifecycle management.** `createWorker()` returns a handle that the test must close explicitly. CPT's `mockJobWorker()` is auto-cleaned per test.
- **No embedded engine.** Node.js tests require an external C8 Run instance; CPT starts its own via Testcontainers.

The custom DSL runner (`dsl-runner.js`, ~120 lines) built for this project is essentially a minimal, hand-rolled version of what a first-party testing package would provide. Every Node.js developer writing process tests will end up building something similar — or, more likely, skip element-level assertions entirely and settle for weaker tests.

### Why it matters

- **Camunda officially supports multiple API clients** (Java, Node.js, Python, C#). Only Java has a first-class testing story. Every other language is left to assemble raw REST calls into an ad-hoc test harness.
- **The ergonomics gap discourages thorough testing.** In Java, asserting "these 5 elements completed and this variable equals X" is a one-liner. In Node.js, the same assertion is 20+ lines of polling, filtering, and manual comparison. Developers under time pressure will write fewer and weaker tests.
- **The building blocks already exist.** The 8.9 alpha SDK exposes typed search methods. What's missing is a thin layer on top: `waitForProcessCompletion(key, timeout)`, `assertCompletedElements(key, ["A", "B"])`, `assertVariable(key, "matchedConcerts", expectedValue)`, and `mockWorker(type, handler)` with auto-cleanup. This is not a large engineering effort — it's packaging patterns that every test author re-invents.
- **The DSL scenario approach amplifies the need.** The CPT DSL (`@TestScenarioSource`) lets you write test scenarios as JSON and run them in any language — but only if each language has a runner that can execute the instructions. Without a testing package, each language community must build its own runner from scratch, defeating the "write once, run anywhere" promise of the DSL.

### Suggestion

1. **Publish a `@camunda8/process-test` (or similar) < insert language here > package** that wraps the SDK's search methods in test-friendly helpers.
2. **Follow the same pattern for every officially supported SDK.** Python, C#, or any future client should ship with a testing companion package. The API surface is small (the helpers above are ~200 lines of code per language) and the DX impact is outsized.
3. **At minimum, publish the polling + assertion patterns as documentation.** Even without a dedicated package, a "Testing Camunda processes with < supported language here >" guide showing the `searchElementInstances` polling pattern, the filter shapes, and the worker lifecycle management would prevent every developer from re-discovering these independently.

---


## Problem 5: No programmatic reference for webhook connector properties

### What happened

Configuring the webhook inbound connector (`io.camunda:webhook:1`) on an intermediate catch event required setting multiple `zeebe:property` entries: `inbound.type`, `inbound.context`, `inbound.method`, `inbound.activationCondition`, `correlationKeyExpression`, `inbound.responseBodyExpression`, etc.

These property names are not listed in the webhook connector documentation. I assembled them from scattered examples and by inferring from the modeler's property panel behavior.

### Why it matters

- Webhook connectors are commonly used in agentic patterns (waiting for external callbacks)
- The `zeebe:property` names are essentially the connector's configuration API
- Without a reference, developers must reverse-engineer the configuration from examples or the modeler

### Suggestion

Apply the same "Input Reference" documentation pattern (see Problem 3) to inbound connectors. Document all `zeebe:property` names, their expected values, and which are required vs optional.

---

## Problem 6: Enum values are hidden in element template dropdowns

### What happened

The memory storage type field requires the exact string `in-process` (with hyphen). I first tried `inProcess` (camelCase), which seemed reasonable. The connector rejected it with a deserialization error but did not indicate the valid values. I had to find the dropdown choices in the element template JSON to discover the correct format.

Similarly, `data.events.behavior` expects a specific enum format that wasn't obvious from the field name alone.

### Why it matters

- Trial-and-error debugging for string enum values is slow
- Error messages confirm a value is wrong but don't suggest correct alternatives
- Inconsistent casing conventions across fields (some camelCase, some kebab-case) make guessing unreliable

### Suggestion

1. Include valid enum values in the connector documentation (see Problem 3)
2. Improve connector validation error messages to list accepted values: *"Invalid value 'inProcess' for data.memory.storage.type. Valid values: in-process, document-storage, custom"*

---

## Problem 7: Duplicate message subscriptions go undetected

**Known issue?** By design — [documented](https://docs.camunda.io/docs/components/concepts/messages/) but surprising.

### What happened

The AI Agent ad-hoc sub-process uses a "Send message → Wait for reply" tool, where "Wait for reply" is a message intermediate catch event. During development, 12+ process instances accumulated from testing — all subscribed to the same message name (`msg-webhook-reply`) with the same correlation key (`local-user`).

When a user replied, Zeebe correlated the message to a **random** active subscription (non-deterministic among instances). The reply went to a stale instance instead of the current one. Messages were silently misrouted with no warning.

The initial instinct was that Zeebe should target the "most recent" or "current" instance. On reflection, this would be **worse**: it would mask the bug during single-developer testing (where "most recent" happens to be correct) and then fail unpredictably in production when multiple users have concurrent instances. If Zeebe silently picked the "right" instance during dev, the broken correlation key design would ship to production undetected.

The real issue is that **static/shared correlation keys are fundamentally wrong** for patterns where multiple instances can coexist. Zeebe's non-deterministic selection is actually the correct behavior — it surfaces the bug early rather than hiding it. What's missing is a **warning** when the situation arises.

This was resolved by implementing unique correlation keys per tool call (`${chatId}-${crypto.randomUUID()}`), where the send-message worker generates the key, passes it to the chat server alongside the message, and the catch event subscribes with it. The webhook connector extracts the key from the incoming request body.

### Why it matters

- **No warning on duplicate subscriptions.** When a new subscription opens with the same message name and correlation key as an existing one, Zeebe silently accepts it. This is the moment the bug could be caught — but nothing flags it.
- **Developers naturally use static keys.** During early development (single instance, single user), a hardcoded phone number or user ID works fine as a correlation key. The problem only manifests when stale instances accumulate or concurrent users appear — by which point the pattern is baked in.
- **The non-deterministic selection is confusing but correct.** The behavior feels wrong ("why did my message go to the wrong instance?") but any alternative (like "most recent") would just hide the bug until production. The docs should help developers understand this rather than leaving them to discover it through failure.
- **The fix is non-trivial.** Unique keys per interaction require a design change: the send step must generate the key, pass it to the external system, and the catch event must subscribe with it. This pattern needs to be taught upfront, not discovered after debugging misrouted messages.

### Suggestion

1. **Emit a runtime warning on duplicate subscriptions.** When a new message subscription opens with the same message name + correlation key as an existing active subscription, log a warning (at least in dev mode): *"Warning: message subscription for 'msg-webhook-reply' with correlation key 'local-user' already exists on process instance 12345. Messages will be delivered to one instance non-deterministically. Consider using unique correlation keys."* This single change would have saved hours of debugging.
2. **Document the unique correlation key pattern prominently** in the message correlation docs and the AI Agent connector docs. Show the complete flow: generate key → send with message → subscribe with key → correlate on reply. This is the correct pattern for any agent that interacts with external systems, and it should be the primary example, not an afterthought.
3. **Explain why "most recent instance" would be wrong.** Developers who hit this issue will instinctively want Zeebe to "just pick the right one." The docs should explain why non-deterministic selection is correct and why unique keys are the real solution — preventing a class of production bugs that "smart" selection would merely hide during development.

---

## Problem 8: AI Agent Task vs Sub-process implementation differences are unclear

### What happened

The AI Agent connector has two implementations:
- **AI Agent Task** (`io.camunda.agenticai:aiagent:1`) — applied to a service task
- **AI Agent Sub-process** (`io.camunda.agenticai:aiagent-job-worker:1`) — applied to an ad-hoc sub-process

Both share most configuration fields but have subtle differences:
- The Task variant requires `data.tools.containerElementId`; the Sub-process resolves tools automatically
- The `agentContext` field is required for Task but optional for Sub-process
- They have separate element template files with slightly different field sets

The documentation describes both implementations but doesn't provide a clear diff of which fields apply to which, or a decision guide for when to use each.

### Why it matters

- Easy to apply the wrong field set and get cryptic validation errors
- Debugging a field mismatch between implementations wastes time
- The recommended approach (Sub-process) should be the prominent one

### Suggestion

1. Add a comparison table to the AI Agent connector overview showing which fields are shared, Task-only, and Sub-process-only
2. Lead with the Sub-process implementation in the docs (since it's recommended) and treat Task as the advanced/alternative option
3. Consider aligning the task definition types to make the distinction clearer (e.g., `aiagent-task:1` vs `aiagent-subprocess:1` instead of `aiagent:1` vs `aiagent-job-worker:1`)

---

## Problem 9: Connector error messages are obfuscated

### What happened

Every error message from the AI Agent connector had each character wrapped in asterisks:

```
***J***s***o***n*** ***o***b***j***e***c***t*** ***c***o***n***t***a***i***n***s***...
```

The decoded message was: *"Json object contains an invalid field: data, memory, storage"*. This encoding made errors very difficult to read, both for humans scanning the Operate UI and for AI assistants parsing incident details.

### Why it matters

- Slows down the debug cycle significantly — you have to mentally decode every error
- Breaks automated error parsing in CI/CD or monitoring tools
- Particularly painful when iterating on connector configuration

### Suggestion

Investigate why connector error messages are being character-encoded this way and fix it. Error messages should be plain text.

---

## Problem 10: Timer-only processes can't be manually started for testing

### What happened

The process uses a timer start event (weekly trigger). During development, I needed to start instances manually for testing. The engine returned `INVALID_STATE` because `createProcessInstance` doesn't support timer-only start events.

The workaround was adding a second (manual/none) start event to the BPMN — purely for testing purposes, cluttering the process definition.

### Why it matters

- Every timer-triggered process needs this workaround during development
- The extra start event must be remembered and removed (or left as tech debt) before production
- Common developer workflow: deploy → manually trigger → observe → iterate

### Suggestion

Allow `createProcessInstance` (and `c8ctl create pi`) to bypass the timer start event for testing purposes, either as a flag (`--force` or `--ignoreTimer`) or by default in development mode. Alternatively, the modeler could automatically add a manual start event in dev builds.

---

## Problem 11: BPMN XML element ordering errors are misleading

### What happened

The BPMN 2.0 XML Schema requires specific element ordering within events. For example, `<bpmn:outgoing>` must appear before `<bpmn:timerEventDefinition>` inside a start event. When violated, the deployment error is:

*"Invalid content was found starting with element 'outgoing'"*

This suggests `outgoing` is invalid, when in reality it's just in the wrong position.

### Why it matters

- Misleading for anyone generating BPMN programmatically
- AI assistants are particularly susceptible to this since they don't memorize XML Schema ordering rules
- The fix is non-obvious: you have to know the BPMN schema's sequence constraints

### Suggestion

Improve the deployment validation error message to indicate ordering issues: *"Element 'outgoing' must appear before 'timerEventDefinition' in startEvent 'StartEvent_Timer'"*. This is a schema validation enhancement that would save significant debugging time.

---

## Closing thoughts

**Camunda's runtime and execution model are strong.** Zeebe's message correlation, the connector runtime, ad-hoc sub-processes, and the AI Agent connector all work correctly. Every problem in this document is about **discoverability, documentation, or observability** — not about broken functionality.

### Which problems are AI-specific vs. universal?

After verifying each problem in the Camunda Modeler, most are **not specific to AI-assisted or code-first development**. The modeler helps with some problems (dropdown enums, element template application) but provides little advantage for others.

**Would hit any developer equally hard — even in the modeler:**
- **Problem 1 (AI Agent connector not discoverable)** — The modeler has a template browser, but if a developer is thinking "I need a conversation loop," they won't search for "AI Agent sub-process." A human might have a slight advantage through webinars, colleagues, or browsing — but that's serendipity, not discoverability.
- **Problem 2 (webhook version conflicts)** — Likely fixed in alpha5, but when it occurred it affected anyone deploying multiple versions equally.
- **Problem 4 (tool I/O contract)** — The service tasks inside the ad-hoc sub-process have no element template. `fromAi()` is a raw FEEL expression manually typed into the input mapping field. The modeler does provide FEEL autocomplete — but only if you already know that `fromAi()` exists and is the function you need. There's no "tool parameter wizard," no guided form, and no indication on the input mapping panel that this is how agent tool parameters are declared. The `toolCallResult` variable name is equally undiscoverable. This problem is just as hard for a human in the modeler as it is programmatically:

  ![fromAi() as a raw FEEL expression in the modeler's input mapping — no guided form for tool parameters](docs/modeler-fromAi.png)

- **Problem 7 (duplicate subscriptions)** — Static correlation keys are a natural starting point for any developer. The production failure mode is the same regardless of who wrote the code.
- **Problem 9 (obfuscated errors)** — Character-wrapped error messages are harder for everyone to read.
- **Problem 10 (timer processes)** — Every developer needs to manually trigger timer processes during testing.

**The modeler helps, but doesn't fully solve:**
- **Problem 3 (connector inputs undocumented)** — The modeler's properties panel abstracts binding names into labeled fields with dropdowns. A human in the modeler never needs to know `data.memory.storage.type` — but anyone working outside the modeler (CI/CD, code-first, testing, AI-assisted) has no reference:

  ![AI Agent sub-process config in the modeler — labeled fields abstract away binding names](docs/modeler-agent-config.png)
  ![AI Agent prompts, memory, and output mapping in the modeler](docs/modeler-agent-prompts.png)

- **Problem 5 (webhook properties)** — The modeler shows labeled fields ("Webhook ID", "Correlation key (process)") that map to undocumented `zeebe:property` names. The modeler abstracts this, but anyone configuring webhooks programmatically must discover the property names independently:

  ![Webhook connector properties panel — labeled fields, but underlying property names are undocumented](docs/modeler-webhook.png)

- **Problem 6 (enum values)** — A human in the modeler sees dropdowns (e.g., "In Process (part of agent context)" for memory storage type). Anyone else has to find the element template JSON.
- **Problem 8 (Task vs Sub-process)** — The modeler's template selector helps guide the choice, but the docs remain confusing.
- **Problem 11 (XML ordering)** — Only affects programmatic BPMN generation. The modeler handles ordering automatically.

### The real takeaway

**7 out of 11 problems would hit any developer equally hard, even with the visual modeler.** The modeler fully solves only 4 problems (connector input naming, webhook property naming, enum values, and XML ordering) — and only for developers who use it. For the remaining 7, the modeler provides no meaningful advantage.

The problems are not primarily about "code-first vs. modeler" — they're about **documentation, observability, and discoverability gaps that exist regardless of tooling**. The AI Agent tool I/O contract (`fromAi()`, `toolCallResult`) is equally opaque in the modeler as it is in raw XML. Webhook version conflicts are invisible in both. Duplicate message subscriptions go undetected in both. The AI Agent connector is hard to discover in both.

The AI-assisted development angle amplifies these gaps (the AI can't browse, attend webinars, or ask colleagues) but the gaps exist for all developers. Fixing them improves the experience across the board.
