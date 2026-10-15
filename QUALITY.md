# Quality strategy

MCP Wales uses the smallest quality system that provides useful confidence. Tests should distinguish stable product behaviour from live public data that can legitimately change.

## Current safeguards

### Deterministic checks on every change

GitHub Actions runs `npm run check` on each push and pull request: linting, type-checking, unit tests (including Python importer/geography checks), offline maintenance tests, and a production build. Contributors run the same command locally. Mocked FSA fixtures cover filtering, response mapping, non-numeric and pending ratings, sentinel dates, Cardiff enforcement, upstream failures, and validation boundaries.

These tests are the persistent source of truth for behaviour that MCP Wales controls. The gated waste spike additionally covers postcode normalization, ambiguous and empty address results, string UPRNs, bounded results, unusual stream/status values, empty and malformed schedules, throttling/access failures, cache behaviour, simultaneous-request deduplication, and privacy-safe logging. Live residential details are never fixtures.

### Daily production canary

`.github/workflows/production-smoke.yml` calls the deployed Streamable HTTP endpoint once each day. It checks that:

- exactly the eight expected tools after the census release are discoverable and advertised as read-only;
- a bounded rating-5 Cardiff search succeeds with valid metadata, attribution, and FSA source links;
- every returned result satisfies stable shape and rating invariants;
- a detail lookup agrees with the selected search result;
- a bounded school search returns valid Cardiff identifiers, directory fields, publication/import dates and attribution, without fixed school names or counts.

The canary deliberately selects a result dynamically. Do not assert that a particular establishment will retain a fixed rating or remain open: FSA data is live and can change legitimately.

### Release acceptance

`ACCEPTANCE.md` records manual checks that cannot be inferred from server tests, especially whether a signed-in ChatGPT account discovers, invokes, and presents the tools appropriately.

## How to handle failures

First classify a failure as a MCP Wales regression, an upstream FSA availability/data change, a Vercel problem, or an MCP-host behaviour change. Do not weaken an invariant merely to make a failing check green. When a real defect or production edge case is found, add a deterministic regression fixture and test before or alongside the fix.

## Deferred improvements and adoption triggers

Keep these deferred until their trigger occurs:

- **Prompt-to-tool eval cases:** the reusable cases now cover Census, schools, food, unsupported and no-call questions under the agreed design-principles work. Use [the evaluation guide](docs/ai-evaluations.md); add cases for observed failures. Actual assistant comparisons remain manual.
- **Automated model-based evals:** consider only when prompt behaviour changes frequently enough to justify API cost and grader maintenance. Keep deterministic checks as the primary gate and calibrate model graders with human review.
- **Persistent monitoring and alerting:** add when traffic or reliability expectations make Vercel's short Hobby log retention insufficient.
- **Distributed caching or analytics:** add only when measured traffic, latency, or FSA limits require them.
- **Waste production release:** enable only after Cardiff Council's reuse and attribution guidance and a Vercel-origin check are recorded. Until then, keep its environment gate off and exclude it from the production canary.
- **Automated ChatGPT UI testing:** defer while account-specific manual release acceptance remains quick and reliable.

Avoid introducing an eval platform, database, OpenAI API key, or paid monitoring service solely in anticipation of future scale.

School-directory contract tests use mocked records for filtering, pagination, Cardiff scope and language grouping. A separate bundled-snapshot check validates unique string IDs, required fields and provenance. Searches make no upstream requests.

## Discovery design principle

Expose useful sorting supported by the consumed source using `sort_by`, `sort_order` and bounded `limit`. Filter and sort the complete matching dataset before pagination: locally for bundled data, server-side for live APIs. Never sort an already paginated subset or make exhaustive upstream requests to simulate unsupported sorting. Preserve defaults and document source limitations; keep each connector simple.

Deterministic sorting tests cover first-five requests, school ties and adjacent pages, all four FSA sort mappings, bounded requests, cache separation, invalid inputs and preservation of missing dates/non-numeric ratings. Live canaries continue to use stable invariants.

## School statistics quality

The canary selects a school from discovery and checks its combined profile identity, source dates, attribution and value/status shapes; it does not fix school names, counts, pupil values or reporting dates. Offline importer tests run through Vitest and require Python 3 in development/CI (already available on the Ubuntu runner). They cover representative primary, secondary and Welsh-medium exports, schema/period/revision failures, suppression, rounding, identifiers and preservation of existing files on failure.

Source differences and mismatched same-period year-group sums are preserved and surfaced. Refresh reports flag coverage losses and pupil changes above 20% for review, rather than automatically treating them as errors. Independent updates retain unrelated sections and their own periods.

## School size discovery regression

ChatGPT needed 18 calls to answer “Which is the largest school in Cardiff?” after individual profiles launched. Pupil-total sorting now supports that query in one bounded discovery call. Deterministic fixtures verify first-five ordering before pagination, filters, zeros, ties, adjacent pages, incomplete coverage and missing/suppressed totals last in either direction. Manual ChatGPT acceptance confirms argument selection; no LLM calls or eval platform are introduced.

## Census quality

Synthetic contract tests cover geography resolution, explicit selection for approximate names, dimension/category order, disclosure-control-compatible topic denominators, age 65 and 100+, exclusions, malformed/incomplete observations, bounded batching, all-area rankings, ties, failures, caching and throttling. Never persist live observations as an application dataset. Mocked contracts remain the behavioural truth.

The existing production canary additionally calls Cardiff TS001 and a bounded TS033 ward ranking. It checks the complete eligible catalogue size, valid official codes, census/boundary dates, counts, population bases, percentage arithmetic, unrounded ordering and ONS attribution. Live demographic values are not fixed assertions. An ONS outage is surfaced as a canary failure, not silently skipped.

`scripts/fixtures/census-prompts.json` records representative prompt-to-tool expectations for manual ChatGPT acceptance; no LLM evaluator or paid infrastructure is introduced. Before release, compare numerical results with the same ONS table/version and record Vercel-origin access in ACCEPTANCE.md. Keep checks pending until actually performed.

## Design and security regression checks

Follow the [principles](docs/design-principles.md) and [tool checklist](docs/tool-design-checklist.md). Mocked tests cover the HTTP byte/origin guard, FSA cache/concurrency/cooldowns, streamed response bounds, disclosure safety, nested output schemas and legacy/current protocol paths. Keep existing missing/suppressed-data, sorting and provenance contracts. Instance-local controls cannot prove a Vercel firewall is configured. See the [assessment](docs/engineering-assessment.md) for pending deployment/manual checks.
