# C8 Run (Local)

| Component | URL |
|-----------|-----|
| REST API | http://localhost:8080/v2/ |
| MCP Server | http://localhost:8080/mcp/cluster (built-in, enabled by default) |
| Operate | http://localhost:8080/operate |
| Tasklist | http://localhost:8080/tasklist |
| Zeebe gRPC | localhost:26500 |

No authentication.

MCP setup (Claude Code):
```
claude mcp add camunda --transport http http://localhost:8080/mcp/cluster
claude mcp add camunda-docs --transport http https://camunda-docs.mcp.kapa.ai
```

Worker env vars:
```
ZEEBE_REST_ADDRESS=http://localhost:8080
ZEEBE_GRPC_ADDRESS=grpc://localhost:26500
CAMUNDA_AUTH_STRATEGY=NONE
```

Java (`application.yaml`):
```yaml
camunda:
  client:
    mode: simple
    zeebe:
      enabled: true
      gateway-url: http://localhost:26500
      base-url: http://localhost:8080
```

REST connectors can reach `http://localhost:*` directly.
