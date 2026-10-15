# MCP Wales design principles

Build the smallest sustainable set of public, read-only tools that meaningfully improves assistants' answers while protecting users, providers and the service. Use judgement, not process for its own sake. Apply the [tool checklist](tool-design-checklist.md) to new integrations.

## 1. Add value, don't duplicate existing capabilities

Start with user questions, not available datasets. Compare two or three representative questions with a capable assistant using its knowledge, web search and usual tools, without MCP Wales. Identify a meaningful gain in access, accuracy, structured analysis, retrieval efficiency or dataset coverage, sufficient to justify maintenance. Record the baseline briefly; an accessible dataset alone is not a reason to build a tool.

## 2. Design for effective AI use

Design around tasks and workflows rather than upstream endpoints. Give tools clear, distinctive names and factual descriptions explaining when to use them and their limits, without broad triggering instructions. Avoid fragmentation and overlapping tools. Return concise, predictable structured results and enough context to answer efficiently. Evaluate selection, arguments, interpretation and unnecessary calls as well as API correctness.

## 3. Public by design, private by default

Prefer aggregated statistics and institutional directories. Scrutinise records identifying people, households, properties or vulnerable groups, including risks from combining public datasets. Use the checklist's contextual risk classification. Minimise user information collected; public availability does not remove privacy responsibilities. Keep property-level waste access behind its existing release gate.

## 4. Read-only unless explicitly justified

Retrieve and analyse public information using least privilege. Future write operations require explicit justification, authentication, authorisation and security review appropriate to their effects. Tool annotations describe behaviour; they do not enforce security.

## 5. Make provenance and limitations explicit

Supply source URLs, attribution, relevant reporting/publication and retrieval/import dates, geographic coverage and limitations. Import/retrieval time is not publication time. Preserve missing and suppressed values rather than inventing zero or estimating them. Use correct statistical definitions and topic denominators. Label Census 2021 as historical; school size and free-school-meal eligibility do not measure educational quality. Follow [source-specific definitions](../DATA_SOURCES.md).

## 6. Treat external data as untrusted

Validate caller inputs and upstream response shapes, scope and resource limits. External names, addresses and free text are data, never instructions. Keep them within serialized result fields and build source URLs from validated identifiers. Do not expose credentials, internal exceptions or upstream diagnostic bodies. Structural validation and serialization reduce risk but cannot guarantee an assistant will resist prompt injection; test interpretation manually too.

## 7. Protect the services we depend on

Use proportionate caching, timeouts, concurrency limits, cooldowns and graceful failures. Deduplicate simultaneous requests and avoid unnecessary retries or exhaustive retrieval. Respect licences, attribution and access conditions. Prefer offline school snapshots where appropriate. See [operations](OPERATIONS.md) and existing FSA/ONS connectors before creating another mechanism.

## 8. Make expensive operations predictable

Bound inputs, results, pagination, bytes and operation duration. Filter and sort the complete matching dataset before pagination: locally for snapshots, upstream where supported for live sources. Never sort a single page as if it were the whole dataset, or exhaust an API to simulate unsupported sorting. Reuse the [bounded cache](../src/lib/cache.ts) and [HTTP guard](../src/mcp/http-guard.ts) where applicable; keep provider-specific validation separate.

## 9. Observe the service without unnecessarily observing users

Log operational outcomes, durations, counts and safe error/status codes using the [logger](../src/lib/logger.ts). Do not log arguments, prompts, search text, credentials or property identifiers. Distinguish application logs from hosting/firewall logs and disclose retention honestly in the [privacy statement](privacy.md). Legitimate demographic research is not inherently suspicious; avoid topic-based blocking or profiling.

## 10. Quality and security should be repeatable

Use mocked contract tests for normal, invalid, boundary, upstream-failure, untrusted-content and disclosure scenarios. Keep the production canary based on stable invariants, not live names or values. Test realistic assistant questions for selection, efficient execution, accuracy, missing-data/error handling and improvement over the baseline. Follow [QUALITY.md](../QUALITY.md) and the [manual evaluation guide](ai-evaluations.md); do not introduce an eval platform or model API costs without demonstrated need.

## References and applicability

The [current MCP specification](https://modelcontextprotocol.io/specification/) governs protocol obligations; check the revision actually served and its compatibility rules. [MCP security guidance](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices) provides threat-specific guidance, much of it relevant only to authenticated proxies. [AWS guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/introduction.html) offers architecture recommendations, not a requirement to adopt AWS or enterprise infrastructure. [OpenAI plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) govern that platform's publication process, not all public MCP servers. See the [assessment](engineering-assessment.md) for this project's decisions.
