# Quality strategy

Cardiff MCP uses the smallest quality system that provides useful confidence. Tests should distinguish stable product behaviour from live public data that can legitimately change.

## Current safeguards

### Deterministic checks on every change

GitHub Actions runs linting, type-checking, unit tests, and a production build on each push and pull request. Mocked FSA fixtures cover filtering, response mapping, non-numeric and pending ratings, sentinel dates, Cardiff enforcement, upstream failures, and validation boundaries.

These tests are the persistent source of truth for behaviour that Cardiff MCP controls.

### Daily production canary

`.github/workflows/production-smoke.yml` calls the deployed Streamable HTTP endpoint once each day. It checks that:

- exactly the two expected tools are discoverable and advertised as read-only;
- a bounded rating-5 Cardiff search succeeds with valid metadata, attribution, and FSA source links;
- every returned result satisfies stable shape and rating invariants;
- a detail lookup agrees with the selected search result.

The canary deliberately selects a result dynamically. Do not assert that a particular establishment will retain a fixed rating or remain open: FSA data is live and can change legitimately.

### Release acceptance

`ACCEPTANCE.md` records manual checks that cannot be inferred from server tests, especially whether a signed-in ChatGPT account discovers, invokes, and presents the tools appropriately.

## How to handle failures

First classify a failure as a Cardiff MCP regression, an upstream FSA availability/data change, a Vercel problem, or an MCP-host behaviour change. Do not weaken an invariant merely to make a failing check green. When a real defect or production edge case is found, add a deterministic regression fixture and test before or alongside the fix.

## Deferred improvements and adoption triggers

Keep these deferred until their trigger occurs:

- **Prompt-to-tool eval cases:** add a small version-controlled dataset when a real tool-selection, argument-extraction, or answer-quality failure is observed, or before adding several overlapping tools.
- **Automated model-based evals:** consider only when prompt behaviour changes frequently enough to justify API cost and grader maintenance. Keep deterministic checks as the primary gate and calibrate model graders with human review.
- **Persistent monitoring and alerting:** add when traffic or reliability expectations make Vercel's short Hobby log retention insufficient.
- **Distributed caching or analytics:** add only when measured traffic, latency, or FSA limits require them.
- **Automated ChatGPT UI testing:** defer while account-specific manual release acceptance remains quick and reliable.

Avoid introducing an eval platform, database, OpenAI API key, or paid monitoring service solely in anticipation of future scale.
