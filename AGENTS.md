# Guidance for coding agents

Read `README.md`, `DATA_SOURCES.md`, and `QUALITY.md` before changing MCP tools, data connectors, or tests.

- Preserve the read-only, public-data-only scope and keep source connectors separate from MCP tool definitions.
- Treat mocked contract tests as the persistent truth for behaviour controlled by this project; treat live FSA values as changeable.
- Maintain the daily production canary using stable invariants rather than fixed establishment names, IDs, ratings, or dates.
- Turn confirmed production defects into deterministic regression tests.
- Follow the adoption triggers in `QUALITY.md`. Do not add databases, hosted eval platforms, LLM calls, authentication, or paid infrastructure without a demonstrated need and explicit approval.
- Prefer small, understandable changes over speculative abstractions.
