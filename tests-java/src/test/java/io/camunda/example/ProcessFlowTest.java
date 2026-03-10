package io.camunda.example;

import static io.camunda.process.test.api.CamundaAssert.assertThat;

import io.camunda.client.CamundaClient;
import io.camunda.process.test.api.CamundaProcessTest;
import io.camunda.process.test.api.CamundaProcessTestContext;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@CamundaProcessTest
class ProcessFlowTest {

  // Auto-injected by @CamundaProcessTest
  private CamundaClient client;
  private CamundaProcessTestContext processTestContext;

  @BeforeEach
  void deploy() {
    client
        .newDeployResourceCommand()
        .addResourceFromClasspath("concerts-agent.bpmn")
        .send()
        .join();
  }

  @Test
  @DisplayName("No matches → process ends at End_NoMatches")
  void noMatchesPath() {
    // Mock the data pipeline workers
    processTestContext
        .mockJobWorker("fetch-concerts")
        .thenComplete(Map.of("concertResultsDoc", Map.of("documentId", "d1", "contentHash", "h1")));
    processTestContext
        .mockJobWorker("fetch-spotify")
        .thenComplete(Map.of("spotifyArtistsDoc", Map.of("documentId", "d2", "contentHash", "h2")));
    processTestContext
        .mockJobWorker("match-artists")
        .thenComplete(Map.of("matchedConcerts", List.of()));

    // Start the process via the manual start event
    var processInstance =
        client
            .newCreateInstanceCommand()
            .bpmnProcessId("concerts-agent")
            .latestVersion()
            .send()
            .join();

    // Assert: completes through the "no matches" path
    assertThat(processInstance)
        .hasCompletedElements("Task_FetchConcerts", "Task_FetchSpotify", "Task_MatchArtists")
        .hasCompletedElements("End_NoMatches")
        .hasNotActivatedElements("AgentTools")
        .isCompleted();
  }

  @Test
  @DisplayName("Happy path → data pipeline completes and agent sub-process activates")
  void happyPath() {
    // Mock the data pipeline workers
    processTestContext
        .mockJobWorker("fetch-concerts")
        .thenComplete(Map.of("concertResultsDoc", Map.of("documentId", "d1", "contentHash", "h1")));
    processTestContext
        .mockJobWorker("fetch-spotify")
        .thenComplete(Map.of("spotifyArtistsDoc", Map.of("documentId", "d2", "contentHash", "h2")));
    processTestContext
        .mockJobWorker("match-artists")
        .thenComplete(
            Map.of(
                "matchedConcerts",
                List.of(
                    Map.of(
                        "name", "Radiohead at TD Garden",
                        "matchedArtists", List.of("Radiohead"),
                        "url", "https://www.ticketmaster.com/event/evt-001"),
                    Map.of(
                        "name", "Taylor Swift | The Eras Tour",
                        "matchedArtists", List.of("Taylor Swift"),
                        "url", "https://www.ticketmaster.com/event/evt-002"))));

    // Mock the AI Agent job worker — the ad-hoc sub-process with the AI agent connector
    // creates iterative jobs for its orchestration loop. We mock completion to end it.
    processTestContext
        .mockJobWorker("io.camunda.agenticai:aiagent-job-worker:1")
        .thenComplete();

    // Start the process
    var processInstance =
        client
            .newCreateInstanceCommand()
            .bpmnProcessId("concerts-agent")
            .latestVersion()
            .send()
            .join();

    // Assert: the data pipeline tasks complete and the agent sub-process is reached.
    // The ad-hoc sub-process (AgentTools) uses the AI Agent connector which has an
    // internal orchestration loop. We verify the routing is correct.
    assertThat(processInstance)
        .hasCompletedElements(
            "Task_FetchConcerts",
            "Task_FetchSpotify",
            "Task_MatchArtists")
        .hasActiveElements("AgentTools");
  }

  @Test
  @DisplayName("Process stores matched concerts variable after match-artists completes")
  void matchedConcertsVariable() {
    processTestContext
        .mockJobWorker("fetch-concerts")
        .thenComplete(Map.of("concertResultsDoc", Map.of("documentId", "d1", "contentHash", "h1")));
    processTestContext
        .mockJobWorker("fetch-spotify")
        .thenComplete(Map.of("spotifyArtistsDoc", Map.of("documentId", "d2", "contentHash", "h2")));

    var matchedData =
        List.of(Map.of("name", "Radiohead at TD Garden", "matchedArtists", List.of("Radiohead")));
    processTestContext
        .mockJobWorker("match-artists")
        .thenComplete(Map.of("matchedConcerts", matchedData));
    processTestContext
        .mockJobWorker("io.camunda.agenticai:aiagent-job-worker:1")
        .thenComplete();

    var processInstance =
        client
            .newCreateInstanceCommand()
            .bpmnProcessId("concerts-agent")
            .latestVersion()
            .send()
            .join();

    // Assert: matchedConcerts is stored and agent sub-process is active
    assertThat(processInstance)
        .hasVariableNames("matchedConcerts")
        .hasActiveElements("AgentTools");
  }
}
