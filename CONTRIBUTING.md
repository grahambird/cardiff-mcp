# Contributing

Help make public Welsh data easier to use responsibly. Small fixes, documentation improvements and source-data expertise are welcome alongside code contributions.

## Start here

1. Follow the [README setup](README.md#run-locally). Use `npm ci` to install the versions in the lockfile.
2. Open an issue describing the user need or defect before a substantial change.
3. Create a focused branch, for example `git switch -c codex/improve-school-search`.
4. Make a small change and run `npm run check`.
5. Push the branch and open a pull request describing the resulting behaviour and validation.

Read [DATA_SOURCES.md](DATA_SOURCES.md), [ROADMAP.md](ROADMAP.md) and [QUALITY.md](QUALITY.md) before changing tools, connectors or tests. Agents should also follow [AGENTS.md](AGENTS.md).

## Project map

| Change | Start here |
| --- | --- |
| Public information page and styling | `src/app/page.tsx`, `src/app/globals.css`, `src/app/page.module.css` |
| MCP endpoint and advertised tool definitions | `src/app/mcp/route.ts` |
| Tool inputs, execution and MCP response formatting | `src/mcp/`; `tools.ts` contains the food tools |
| Live food data | `src/fsa/` |
| School search, profiles and bundled JSON | `src/schools/` |
| Census geography, definitions and live observations | `src/ons/` |
| Gated waste connector | `src/waste/` |
| Small shared utilities | `src/lib/` |
| Imports, refreshes and operational checks | `scripts/` |
| Automated checks and schedules | `.github/workflows/` |

A request reaches the MCP route, which registers tools. Tool handlers validate inputs and format results. Source modules fetch or read data, apply source-specific rules and return internal results. Keep upstream HTTP details out of tool definitions.

Tests sit beside the code as `*.test.ts`. Python importer and geography tests are invoked by Vitest wrappers; maintenance-checker tests run through `npm run test:maintenance`. Synthetic CSV and metadata fixtures live in `scripts/fixtures/`. Large runtime JSON files are source snapshots: use their import procedures rather than hand-editing data.

## Checks

Node.js 24+, npm and Python 3 are required for the complete offline suite. curl is needed for live maintenance commands, not the offline tests.

| Command | Purpose | Network needed? |
| --- | --- | --- |
| `npm run check` | All required CI checks: lint, types, tests, maintenance tests and production build | No live public-data calls; initial dependency installation needs network |
| `npm test -- src/mcp/school-tools.test.ts` | Run one test file while editing | No |
| `npm run test:maintenance` | Offline freshness checker and issue lifecycle tests | No |
| `npm run build` then `npm run test:smoke` | Start the built server and verify MCP discovery, food, schools and census | Yes |
| `npm run smoke:client -- https://mcp.wales` | Read-only production smoke check | Yes |
| `python3 scripts/check-source-freshness.py --report /tmp/source-freshness.md` | Compare public sources with committed snapshots and pins | Yes; requires curl |

Use mocked responses and synthetic records for deterministic tests. Cover the behaviour affected by a change, including relevant validation, missing data, upstream failures and geographic scope. The daily live canary checks stable invariants; never require a particular establishment, rating or population value to remain unchanged. See [QUALITY.md](QUALITY.md).

If a live check fails, distinguish a project regression from upstream availability or data changes. Confirmed production defects should become deterministic regression tests. Do not weaken checks to accommodate unexplained failures.

## Example: add an optional school-search input

The existing `sort_order` input illustrates the full path for a compatible addition:

1. Define and describe the optional input in `src/mcp/school-tools.ts`. Preserve the behaviour when it is omitted; validate allowed values there.
2. Apply it in `src/schools/directory.ts`, filtering and sorting all matches before pagination. Keep source rules in this module.
3. Check `src/app/mcp/route.ts`: tool registration uses the input schema, but the advertised description may also need updating.
4. Add focused cases beside the source module and in `src/mcp/school-tools.test.ts`: omitted input, accepted values, invalid values and the resulting response. Existing contracts must still pass.
5. Update the [tool guide](docs/TOOLS.md) and run `npm run check`. For metadata changes, verify discovery with the live smoke client and record any required manual host checks in [ACCEPTANCE.md](ACCEPTANCE.md).

Tool names and required inputs are client contracts. Prefer optional inputs or new tools; changing existing names or required inputs is a breaking change. Connected ChatGPT users may need to refresh the custom MCP server after schemas, descriptions or annotations change.

## Add or refresh a source

Keep HTTP calls, validation, licences, identifiers, caching and error mapping in the source's folder. Tools should consume internal results rather than raw upstream JSON. Document publisher, source URL, licence, attribution, freshness, limitations and identifier mappings in [DATA_SOURCES.md](DATA_SOURCES.md) before exposing data.

Follow the documented import procedures for snapshots. Review candidate diffs and provenance, run checks and deploy the approved update. A new publication date is not a new census date; missing values are not zero. Monthly freshness checks flag updates but never import them automatically.

## Boundaries

Keep sources read-only and public. Do not add databases, authentication, paid services or LLM calls without demonstrated need and explicit approval; follow the adoption triggers in [QUALITY.md](QUALITY.md). Waste tools remain disabled until the documented release gate is cleared.

Never commit credentials, private user data, copied production logs or `.env` files. Logs should contain safe operational metadata, not tool arguments or tokens.
