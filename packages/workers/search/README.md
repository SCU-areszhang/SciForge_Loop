# SciForge Research Search

Shared MCP server for scientific research discovery. It exposes `research_search` over stdio so any runtime that can connect to MCP can use the same research pipeline.

## Start

```bash
npm --workspace @sciforge/search run start
```

## MCP Tool

- `research_search`: searches configured scientific sources, expands the query, ranks duplicate paper results, and returns structured evidence for an assistant to synthesize.

## Configuration

Environment variables:

- `SCIFORGE_RESEARCH_ARXIV_ENABLED`: default `true`
- `SCIFORGE_RESEARCH_BIORXIV_ENABLED`: default `true`
- `SCIFORGE_RESEARCH_EUROPE_PMC_ENABLED`: default `true`
- `SCIFORGE_RESEARCH_SEMANTIC_SCHOLAR_ENABLED`: default `true`; uses the anonymous API path
- `SCIFORGE_RESEARCH_TAVILY_ENABLED`: default `false`
- `SCIFORGE_RESEARCH_CNS_ENABLED`: default `false`
- `SCIFORGE_RESEARCH_CNS_DOMAINS`: comma-separated domains, default `nature.com,science.org,cell.com`
- `SCIFORGE_RESEARCH_MAX_RESULTS`: default `10`
- `SCIFORGE_RESEARCH_TIMEOUT_MS`: default `15000`
- `SCIFORGE_RESEARCH_DEFAULT_SINCE_YEAR`: optional

The worker never reads provider credentials from environment variables, argv, MCP configuration,
logs, or receipts. Authenticated web and CNS search require a separately composed Host-private
provider connector. No generic connector is currently installed, so explicitly requesting either
source fails closed while the anonymous scientific sources remain available.

Example MCP config:

```json
{
  "mcpServers": {
    "sciforge-research": {
      "command": "npm",
      "args": ["--workspace", "@sciforge/search", "run", "start"]
    }
  }
}
```
