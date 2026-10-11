# Contributing

Thanks for helping make public Cardiff data easier to use responsibly.

## Small-project workflow

1. Open an issue describing the user need or defect before starting a substantial change.
2. Create a focused branch and keep the change small enough to review.
3. Run `npm run check` before opening a pull request.
4. Explain any visible tool-schema or data-interpretation change in the pull request.

Changes to existing MCP tool names or required inputs are breaking changes for connected clients. Prefer adding optional inputs or new tools. After metadata changes, connected ChatGPT users may need to refresh the custom MCP server.

## Tests

Use mocked FSA responses for deterministic unit tests. Cover successful mapping, empty results, unusual values, validation boundaries, timeouts, throttling, upstream failure, malformed data, and geographic scoping. Use `npm run test:smoke` separately for a live end-to-end check.

Read [QUALITY.md](QUALITY.md) before changing the smoke test or introducing eval or monitoring infrastructure. Live checks must assert stable invariants, not fixed ratings or continued existence of a particular establishment.

Never commit credentials, private user data, copied production logs, or `.env` files.

## Adding a data source

Keep source-specific HTTP calls, response validation, licences, identifiers, caching, and error mapping in a dedicated connector. MCP tools should depend on stable internal result types rather than raw upstream JSON. Update `DATA_SOURCES.md` with the publisher, source URL, licence, attribution, freshness, limitations, and any identifier mapping before exposing the source through a tool.

Avoid adding infrastructure until the user need requires it. New sources must remain read-only and public unless a separately reviewed milestone introduces authentication and privacy controls.
