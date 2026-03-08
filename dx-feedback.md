# AI-Assisted Camunda Development: Developer Experience Feedback

## Context

I built an end-to-end Camunda 8 process using Claude Code as an AI coding assistant — no visual modeler involved. The process fetches concerts from Ticketmaster, cross-references with a user's Spotify library, and hands off to an AI Agent (via the Camunda AI Agent connector) that converses with the user over WhatsApp.

This is relevant because AI-assisted development is becoming a primary way developers build software. Claude Code writes BPMN XML, configures connectors, and iterates on errors — much like a developer would using the Modeler, but programmatically. The friction points below are amplified for AI assistants but affect any developer working outside the visual modeler (CI/CD pipelines, IaC, code-first BPMN generation, testing frameworks).

---

## Problem 1: Connector input contracts are undocumented

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

## Problem 2: Enum values are hidden in element template dropdowns

### What happened

The memory storage type field requires the exact string `in-process` (with hyphen). I first tried `inProcess` (camelCase), which seemed reasonable. The connector rejected it with a deserialization error but did not indicate the valid values. I had to find the dropdown choices in the element template JSON to discover the correct format.

Similarly, `data.events.behavior` expects a specific enum format that wasn't obvious from the field name alone.

### Why it matters

- Trial-and-error debugging for string enum values is slow
- Error messages confirm a value is wrong but don't suggest correct alternatives
- Inconsistent casing conventions across fields (some camelCase, some kebab-case) make guessing unreliable

### Suggestion

1. Include valid enum values in the connector documentation (see Problem 1)
2. Improve connector validation error messages to list accepted values: *"Invalid value 'inProcess' for data.memory.storage.type. Valid values: in-process, document-storage, custom"*

---

## Problem 3: Connector error messages are obfuscated

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

## Problem 4: No programmatic reference for webhook connector properties

### What happened

Configuring the webhook inbound connector (`io.camunda:webhook:1`) on an intermediate catch event required setting multiple `zeebe:property` entries: `inbound.type`, `inbound.context`, `inbound.method`, `inbound.activationCondition`, `correlationKeyExpression`, `inbound.responseBodyExpression`, etc.

These property names are not listed in the webhook connector documentation. I assembled them from scattered examples and by inferring from the modeler's property panel behavior.

### Why it matters

- Webhook connectors are commonly used in agentic patterns (waiting for external callbacks)
- The `zeebe:property` names are essentially the connector's configuration API
- Without a reference, developers must reverse-engineer the configuration from examples or the modeler

### Suggestion

Apply the same "Input Reference" documentation pattern (see Problem 1) to inbound connectors. Document all `zeebe:property` names, their expected values, and which are required vs optional.

---

## Problem 5: AI Agent Task vs Sub-process implementation differences are unclear

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

## Problem 6: Timer-only processes can't be manually started for testing

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

## Problem 7: BPMN XML element ordering errors are misleading

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

## Problem 8: Webhook connector path conflicts across process definition versions

**Known issue? Partially.** The underlying behavior is documented ([Connector types docs](https://docs.camunda.io/docs/components/connectors/connector-types/)), and a related bug ([#3227](https://github.com/camunda/connectors/issues/3227)) was fixed in 8.9.0 ([PR #6056](https://github.com/camunda/connectors/pull/6056)). However, the fix introduced a new edge case that we hit.

### What happened

The process went through 13 deployed versions during iterative development. Versions 1–10 had a webhook connector on path `whatsapp-reply` with specific properties (e.g., `inbound.activationCondition==request.body.message != null`). Versions 11–12 stripped the webhook connector (switched to direct Zeebe message correlation as a workaround). Version 13 re-added the webhook connector with *different* properties (no activation condition, different correlation key expression).

After deploying v13, the webhook endpoint returned 422 on every request. The connector runtime logs revealed:

1. The runtime loaded connectors from **multiple versions** (not just the latest) — a result of the 8.9.0 fix for [#3227](https://github.com/camunda/connectors/issues/3227), which activates connectors for all versions with active subscriptions
2. The v10 connector registered on the `whatsapp-reply` path **first** and became the primary handler
3. The v13 connector went to **standby**: *"Webhook path 'whatsapp-reply' is already in use. Executable registered in standby"*
4. All incoming requests were processed by v10's connector, which applied v10's activation condition (`=request.body.message != null`) and rejected our payload format

The fix required **restarting the connector runtime** so v13 registered first. There was no API to force a specific version as primary or to deregister old versions.

### Why it matters

- During iterative development, you deploy many versions. Old versions with different webhook configs silently interfere with new ones.
- The "standby" behavior is non-deterministic from the developer's perspective — which version registers first depends on internal processing order.
- There is no way to delete old process definition versions in Camunda 8, so conflicting versions accumulate permanently.
- Debugging requires reading the connector runtime logs — the webhook just returns 422 with no indication that the wrong connector version is handling the request.
- The connector log message "Activation condition not met" gives no hint that it's evaluating a condition from a *different version* than expected.

### Suggestion

1. **Prefer the latest version**: When multiple versions register for the same webhook path, the latest process definition version should always be primary, not whichever registers first.
2. **Log which version is handling a request**: The webhook 422 response (or logs) should indicate which process definition version's connector processed the request. The current log says "Activation condition not met" but doesn't say "evaluated against version 10 (not version 13)".
3. **Provide an API to deregister stale connectors**: Either a REST endpoint to force-deregister a connector by version, or an API to delete old process definition versions.
4. **Dev mode clean slate**: In development environments, consider a mode that only loads connectors from the latest version of each process definition (the pre-8.9.0 behavior was actually better for dev).

---

## Problem 9: Zeebe message correlation targets random instances with shared correlation keys

### What happened

The AI Agent ad-hoc sub-process uses a "Send message → Wait for reply" tool, where "Wait for reply" is a message intermediate catch event. During development, 12+ process instances accumulated from testing — all subscribed to the same message name (`msg-webhook-reply`) with the same correlation key (`local-user`).

When a user replied, Zeebe correlated the message to a **random** active subscription (one-per-process-definition cardinality, non-deterministic among instances). The reply went to a stale instance instead of the current one.

This was resolved by implementing unique correlation keys per tool call (`${chatId}-${crypto.randomUUID()}`), where the send-message worker generates the key, passes it to the chat server alongside the message, and the catch event subscribes with it. The webhook connector extracts the key from the incoming request body.

### Why it matters

- The one-subscription-per-process-definition rule is documented but surprising. Developers expect a message to go to the "current" or "most recent" instance.
- The non-deterministic instance selection makes debugging extremely confusing — the behavior is correct by spec but wrong by developer expectation.
- There's no warning when multiple instances subscribe with the same correlation key on the same message name.

### Suggestion

1. **Document the cardinality rule prominently** in the message correlation docs — not buried in a conceptual section but front-and-center with a warning: *"If multiple process instances subscribe with the same message name and correlation key, exactly one will receive the message (non-deterministic)."*
2. **Consider a runtime warning** when a new subscription is opened that conflicts with an existing one — at least in a development/debug mode.
3. **Provide guidance on unique correlation keys** in the webhook connector and agent connector documentation, since agentic patterns naturally create many instances with the same message structure.

---

## Problem 10: Webhook connector `resultExpression` behavior is indistinguishable from version conflicts

**Known issue? No.** No existing bug reports cover this scenario.

### What happened

While debugging the webhook connector inside an ad-hoc sub-process, the `toolCallResult` variable was always empty (`""` or `null`). We tried three different variable mapping approaches:

1. `inbound.variableMapping` — variable not set
2. `inbound.resultExpression` — variable not set
3. `inbound.resultVariable` — variable not created

We concluded that webhook connector variable mapping doesn't work inside ad-hoc sub-processes. This led to replacing the webhook connector with direct Zeebe message correlation (`POST /v2/messages/correlation`), which **did** work.

Later, when revisiting the webhook connector with a clean setup, we discovered the variable mapping **does work** inside ad-hoc sub-processes. The original failures were caused by **Problem 8** — an old version's connector was handling requests, and its different configuration (different result expression, different activation condition) produced empty results. The webhook connector itself was never the issue.

### Why it matters

- The misdiagnosis cost hours of debugging and led to an unnecessary architectural workaround.
- The symptom (empty variables) was attributed to the wrong root cause (ad-hoc sub-process scoping) because there was no visibility into which connector version was actually processing requests.
- This failure mode is particularly insidious: the variable mapping appears broken, but the actual problem is a version conflict in the connector runtime.

### Suggestion

This is a direct consequence of Problem 8. Fixing version priority and improving logging (showing which version handles each request) would prevent this class of misdiagnosis entirely.

---

## Problem 11: The AI Agent connector is not discoverable from the problem description

### What happened

When building this project, the initial design used an **explicit BPMN conversation loop**: receive message → call LLM (via `@anthropic-ai/sdk` in a custom worker) → send reply → check if conversation is done → loop back. This is the standard BPMN pattern for iterative interactions and the one an AI coding assistant (or any developer familiar with BPMN but not Camunda's connector catalog) would naturally reach for.

The AI Agent connector with an ad-hoc sub-process — where the agent drives the conversation through tool calls and no explicit loop is needed — was only discovered later when the [Camunda AI Dev Kit](https://github.com/meyerdan/camunda-ai-dev-kit) introduced the pattern. The dev kit's `new-agent` skill scaffolded the ad-hoc sub-process with root-element tools, `fromAi()` parameters, and `toolCallResult` output mapping.

Without the dev kit, the project would have shipped with the hand-rolled loop, a direct LLM SDK dependency, and a custom `process-message.js` worker — all unnecessary complexity.

### Why it matters

- **The problem description doesn't lead to the solution.** A developer thinking "I need a process that has a conversation with a user" will search for "BPMN conversation loop" or "message correlation patterns," not "AI Agent ad-hoc sub-process." The connector solves the problem elegantly, but you have to already know it exists.
- **AI coding assistants are particularly affected.** They pattern-match from training data, which has abundant examples of explicit loops and very few examples of Camunda's agentic connector pattern. Without a dev kit or explicit guidance, they will consistently choose the worse architecture.
- **The ad-hoc sub-process concept is unfamiliar.** Even developers who find the AI Agent connector docs may not understand that "tools are root elements in an ad-hoc sub-process" means they don't need a loop. The mental model shift from "explicit orchestration" to "agent-driven tool calling" needs a bridge.
- **The manual approach works but is worse in every way.** The explicit loop required more BPMN elements, a custom worker, a direct LLM dependency, manual context management, and a "done" check gateway. The AI Agent connector eliminated all of this. But "it works" is the enemy of "there's a better way" — developers who build the loop first have little reason to discover the connector later.

### Suggestion

1. **Use-case-based documentation entry points.** Add a "Building conversational processes" or "Adding AI to your process" guide that starts from the problem ("I want my process to have a back-and-forth conversation") and leads to the AI Agent connector — not buried in the connector catalog but linked from the main BPMN patterns / best practices docs.
2. **"Before and after" examples.** Show the explicit loop pattern side-by-side with the AI Agent connector approach, making the simplification immediately visible. This validates developers who built the loop ("you're not wrong") while showing the better path.
3. **Dev tooling that suggests the pattern.** The Camunda AI Dev Kit proved this works — when the `new-agent` skill was available, the right architecture emerged naturally. Integrating similar guidance into the Modeler (e.g., "This loop with an LLM call could be replaced by an AI Agent sub-process") or the docs would have the same effect.

---

## Summary

| Problem | Severity | Fix Complexity | Known Issue? |
|---------|----------|----------------|--------------|
| Connector input contracts undocumented | High | Medium (auto-generate from templates) | No |
| Enum values hidden | High | Low (add to docs + improve error messages) | No |
| Error messages obfuscated | Medium | Low (likely a bug) | No |
| Webhook connector properties undocumented | Medium | Medium (same pattern as #1) | No |
| Task vs Sub-process differences unclear | Medium | Low (docs improvement) | No |
| Timer processes can't be manually started | Low | Medium (engine change) | No |
| BPMN XML ordering errors misleading | Low | Medium (validation improvement) | No |
| Webhook path conflicts across versions | High | Medium (version priority logic) | Partially — [#3227](https://github.com/camunda/connectors/issues/3227) fixed in 8.9.0, but fix introduced this edge case |
| Message correlation targets random instances | Medium | Low (docs + runtime warning) | By design — [documented](https://docs.camunda.io/docs/components/concepts/messages/) but surprising |
| resultExpression failures indistinguishable from version conflicts | High | Low (logging improvement) | No |
| AI Agent connector not discoverable from problem description | High | Medium (docs + use-case guides) | No |

The common theme: **Camunda's runtime and execution model are strong, but the developer experience outside the visual modeler has gaps.** As AI-assisted development grows, these gaps will become increasingly visible. The highest-leverage fixes are publishing programmatic references for connector input contracts, improving connector runtime observability (which version handles which request), and making the AI Agent connector discoverable from common use-case descriptions rather than only from the connector catalog.
