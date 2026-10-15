# Guidance for coding agents

Read `README.md`, `DATA_SOURCES.md`, `ROADMAP.md` and `QUALITY.md` before changing MCP tools, data connectors, or tests.

- Preserve the read-only, public-data-only scope and keep source connectors separate from MCP tool definitions.
- Treat mocked contract tests as the persistent truth for behaviour controlled by this project; treat live FSA values as changeable.
- Maintain the daily production canary using stable invariants rather than fixed establishment names, IDs, ratings, or dates.
- Turn confirmed production defects into deterministic regression tests.
- Follow the adoption triggers in `QUALITY.md`. Do not add databases, hosted eval platforms, LLM calls, authentication, or paid infrastructure without a demonstrated need and explicit approval.
- Read [design principles](docs/design-principles.md) and use the [tool checklist](docs/tool-design-checklist.md) before changing tools. Consult the current official MCP specification and security links there, preserving tested legacy compatibility.
- Reuse `src/lib/cache.ts`, `src/lib/logger.ts`, `src/mcp/http-guard.ts` and `src/mcp/output-schemas.ts` where applicable. Use mocked tests and the [evaluation guide](docs/ai-evaluations.md); never claim manual evaluations or deployed settings were checked when they were not.
- Prefer small, understandable changes over speculative abstractions.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
