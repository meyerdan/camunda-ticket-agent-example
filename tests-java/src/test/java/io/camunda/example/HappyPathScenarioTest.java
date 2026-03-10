package io.camunda.example;

import io.camunda.client.CamundaClient;
import io.camunda.process.test.api.CamundaProcessTest;
import io.camunda.process.test.api.dsl.TestCase;
import io.camunda.process.test.api.dsl.TestScenarioRunner;
import io.camunda.process.test.api.dsl.TestScenarioSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;

/**
 * Runs the shared DSL scenario file (tests/scenarios/happy-path.json) via the CPT DSL runner. The
 * same JSON is also consumed by the Node.js DSL runner, ensuring both languages exercise identical
 * test logic.
 */
@CamundaProcessTest
class HappyPathScenarioTest {

  // Auto-injected by @CamundaProcessTest
  private CamundaClient client;
  private TestScenarioRunner testScenarioRunner;

  @BeforeEach
  void deploy() {
    client
        .newDeployResourceCommand()
        .addResourceFromClasspath("concerts-agent.bpmn")
        .send()
        .join();
  }

  @ParameterizedTest(name = "{1}: {0}")
  @TestScenarioSource(fileNames = "happy-path.json")
  void shouldPass(final TestCase testCase, final String scenarioFile) {
    testScenarioRunner.run(testCase);
  }
}
