# MCP Wales

A small, open-source, read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for trusted public data in Wales, starting with Cardiff.

Visit [mcp.wales](https://mcp.wales). Connect an MCP client to `https://mcp.wales/mcp` without authentication.

| Data | Tools | Coverage and freshness |
| --- | --- | --- |
| Food hygiene | `find_food_businesses`, `get_food_business` | Cardiff; live FSA data |
| Schools | `find_schools`, `get_school` | Cardiff maintained schools; manually refreshed register and StatsWales snapshots |
| Census 2021 | `find_census_areas`, `get_area_demographics`, `compare_area_demographics`, `rank_areas_by_demographic` | All 22 Welsh local authorities and Cardiff wards/MSOAs; live requests to pinned historical datasets |

Food ratings describe hygiene, not food quality. School statistics describe their published census period, and Census 2021 figures describe 2021 rather than today's population. Responses include source information and dates.

The waste-collection prototype is disabled by default pending reuse and release checks. See [operations](docs/OPERATIONS.md#waste-collection-spike).

## Run locally

Install Node.js 24 or later and npm. Python 3 is also required for the offline checks; curl is required for live source-freshness checks and geography refreshes. No API keys or environment variables are needed for the default tools.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`; the MCP endpoint is `http://localhost:3000/mcp`.

Before submitting a change, run the same offline checks as CI:

```bash
npm run check
```

For live checks against the local production build, run `npm run build` followed by `npm run test:smoke`. These require internet access and responsive upstream services. See [contributor checks](CONTRIBUTING.md#checks).

## Find your way around

- [Contributing](CONTRIBUTING.md): project map, workflow, checks and an example change.
- [Tool guide](docs/TOOLS.md): inputs, examples, interpretation and errors.
- [Operations](docs/OPERATIONS.md): deployment, logging, privacy and the waste release gate.
- [Data sources](DATA_SOURCES.md): licences, snapshots, refresh procedures and monthly freshness checks.
- [Quality strategy](QUALITY.md): test expectations and when more infrastructure is justified.
- [Release acceptance](ACCEPTANCE.md): manual verification records.
- [Roadmap](ROADMAP.md): possible future work.
- [Project migration](MIGRATION.md): rename and integration notes.

## Design and licence

```text
MCP client → /mcp route → tool validation and responses → source connectors or bundled snapshots
```

Next.js hosts the public information page and MCP endpoint on Vercel. There is no database, account system or LLM dependency. Keep changes small and sources public and read-only.

Project code is MIT-licensed. Public datasets have separate attribution and licence requirements; see [DATA_SOURCES.md](DATA_SOURCES.md).

## Design and engineering guidance

Read the [design principles](docs/design-principles.md) and use the [tool checklist](docs/tool-design-checklist.md) for new integrations. See the [engineering assessment](docs/engineering-assessment.md), [privacy statement](docs/privacy.md) and [AI evaluation guide](docs/ai-evaluations.md). Reuse the shared bounded cache, HTTP guard, logger and output schemas; follow existing mocked tests and `npm run check`.
