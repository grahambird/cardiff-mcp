# Engineering assessment — 15 October 2026

## Existing safeguards

Eight public, read-only tools have bounded validated inputs, structured/text responses and explicit annotations. Tools and source connectors are separate. School snapshots have offline importer/contract checks; Census enforces supported geography, table-specific denominators, historical dates, complete rankings and bounded upstream access. Outputs preserve missing/suppressed values and source attribution. Logging is operational rather than query-based. CI, a daily production canary and monthly freshness review already exist. The initial offline baseline was 123 passing tests in 14 files.

## Essential now

- The FSA cache was unbounded and lacked single-flight deduplication. It now retains at most 100 five-minute successes, evicts oldest entries and coalesces identical pending loads.
- FSA now limits outgoing concurrency to two per instance, waits within a 20-second operation deadline, reads at most 512 KiB under an eight-second request timeout, honours 429 Retry-After cooldowns and does not retry automatically. It rejects oversized pages, inconsistent pagination and out-of-scope records.
- The installed SDK's fetch-native entry explicitly leaves Origin validation to the host. The route now validates supplied origins and bounds incoming bytes to 64 KiB before mcp-handler's JSON clone/parse. No-Origin clients remain supported.
- Regression checks cover diagnostic leakage and untrusted content as data. This does not prove a consuming assistant immune to prompt injection.

## Useful improvements

The principles and six-part checklist establish lightweight baseline evaluation and contextual dataset risk assessment. Descriptions now focus on user tasks instead of broad proactive triggering. The eight tools advertise nested output schemas without changing existing structured success/error shapes or text fallbacks. Existing source-specific errors remain intact. Reusable evaluations extend Census cases across food, schools, unsupported and no-call questions. Application logging needs no new collection mechanism; privacy documentation explains its boundaries.

## Protocol and publication review

The current official specification resolved to 2026-07-28 during review; the installed MCP SDK v2 supports it alongside stateless legacy traffic through mcp-handler. Keep both paths and test them rather than pinning obsolete assumptions or replacing the transport. Output schemas are optional; declaring them creates output-conformance obligations. Read-only/destructive/open-world annotations are advisory.

[MCP security guidance](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices) addresses threat-specific controls; OAuth proxy, token passthrough and authenticated-session advice does not justify adding authentication here. [AWS guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/introduction.html) is architectural advice, not a requirement for enterprise infrastructure.

[OpenAI publication rules](https://developers.openai.com/plugins/plugin-guidelines) require appropriate metadata, privacy disclosures and support information for that directory. Review the stable public policy URL, hosting data practices, support contact, branding/name eligibility and service readiness at submission time. No directory submission or service rename is part of this change. Do not confuse platform rules with protocol obligations.

## Trade-offs and deferred risks

Small caches and byte limits bound memory while allowing existing bounded queries. Coalescing/concurrency can increase wait time under bursts; timeout/throttled errors remain explicit. Instance-local limits do not enforce a global provider budget. Origin checks affect browser clients that send Origin, not ordinary server-to-server clients; add future browser origins deliberately in trusted configuration rather than reflecting request headers. The 64 KiB guard buffers bounded input once before SDK processing.

No topic blocking is introduced. Institutional directories and aggregated Census statistics are broadly low risk; detailed school characteristics merit contextual moderate-risk consideration. Combining granular datasets requires renewed scrutiny. Property-level waste remains gated.

Defer distributed caching/budgets, paid monitoring, model-based evaluation, authentication and persistent analytics until measured demand or risk justifies them under QUALITY.md. Do not add dependencies for speculative protection.

## Deployment and manual checks

- **Pending:** verify the documented Vercel `/mcp` firewall rule is enabled and review shared-client-IP effects. Repository inspection cannot confirm account settings.
- **Pending:** run assistant evaluations with/without MCP Wales and record dated results in ACCEPTANCE.md; deterministic tests do not measure actual model selection or interpretation.
- **Pending:** verify hosting log configuration and privacy/support requirements before any directory submission.
- No deployment, directory submission or waste release is performed by this work.

## Validation result

`npm run check` passed: lint, type-check, 156 tests in 18 files, five offline maintenance checks and production build. The existing bounded `npm run test:smoke` also passed against the local production server with live FSA/ONS and bundled school data. All eight tools passed mocked legacy/current HTTP execution checks. See [ACCEPTANCE.md](../ACCEPTANCE.md) for the dated record and pending manual/deployment checks. Dependencies and deployment configuration were not changed; existing lockfile-based installs and CI remain in place.
