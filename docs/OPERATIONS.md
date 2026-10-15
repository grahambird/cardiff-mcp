# Deployment and operations

[Project overview](../README.md) · [Contributing](../CONTRIBUTING.md)

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project**, import the repository, and accept the detected Next.js settings.
3. Deploy without environment variables. New Vercel projects use Fluid Compute by default. Do not enable the waste feature in production until the release gate below is cleared.
4. Add `mcp.wales` as the production custom domain in Vercel. Visit `https://mcp.wales` and run the smoke client against production:

   ```bash
   npm run smoke:client -- https://mcp.wales
   ```

5. In **Project → Firewall → Configure**, create and publish this WAF rule:
   - condition: request path equals `/mcp`;
   - action: **Rate Limit**;
   - algorithm: **Fixed Window**;
   - limit: **120 requests in 60 seconds**;
   - counting key: **IP address**;
   - response: default HTTP `429`.

This is a deliberately generous starting limit for an MCP client. Review it if ChatGPT or another MCP host uses shared outbound addresses and legitimate requests receive `429` responses. The firewall is configured in Vercel rather than in this repository; Vercel Hobby currently permits one custom firewall rule.

The code also applies an eight-second FSA timeout, permits no more than 20 records per page, caps pages at 10, and caches successful upstream responses for five minutes in warm instances. FSA cache capacity is 100 entries, with identical in-flight requests deduplicated. Outgoing FSA concurrency is two per warm instance, waiting within a 20-second operation deadline. Responses are limited to 512 KiB; the eight-second timeout includes body reading. HTTP 429 Retry-After establishes a per-instance cooldown; requests are not automatically retried. These limits are not deployment-wide.

## Logging and monitoring

Each tool call writes a single structured JSON event to Vercel Runtime Logs. It records the tool name, success or error outcome, duration, result count where useful, and a safe error code/upstream status. It deliberately does **not** log tool arguments, search text, establishment IDs, prompts, IP addresses, or user-agent strings.

The gated waste connector additionally logs `upstream_request` and `upstream_cache` events containing only provider, operation, duration, outcome, status category, retry count, and cache hit/miss. It never logs addresses, postcodes, UPRNs, JWTs, or request bodies.

To inspect events, open the Vercel project and choose **Logs**, then search for `mcp_tool_call`, a tool name, or an error code such as `throttled`. On the Hobby plan, Runtime Log retention is currently one hour, so this provides immediate troubleshooting rather than long-term analytics. Persistent log drains and longer-term alerting are deferred until traffic justifies a paid plan or external service.

## Security and privacy

`/mcp` is intentionally public and unauthenticated. All tools are read-only and accept narrow, validated inputs. The service does not request, store, or transmit user credentials, private ChatGPT data, or personal account data. Do not add secrets to the repository; use Vercel environment variables if a future source needs credentials.

Remote MCP servers can receive prompt-derived tool arguments. Only connect servers you trust and avoid placing sensitive information in searches.

## Waste collection spike

The spike implements two optional tools:

- `find_waste_collection_addresses` accepts a postcode, optional house number, and limit. It returns bounded matches but never chooses a property.
- `get_waste_collections` accepts the selected UPRN as a string and returns only dates supplied by Cardiff Council.

To exercise them in a local or Vercel preview environment:

```bash
CARDIFF_WASTE_TOOLS_ENABLED=true npm run dev
```

After building, `CARDIFF_WASTE_TOOLS_ENABLED=true npm run test:smoke` verifies that MCP discovery includes all twelve tools while retaining the existing live FSA checks. Waste execution remains covered by mocked deterministic tests until a private property is supplied for the gated acceptance check.

The connector uses a five-minute address cache, a fifteen-minute collection cache, short-lived JWT caching, single-flight request deduplication, and at most two outgoing Cardiff requests per warm instance. It retries transient network, `429`, and `5xx` failures once; it does not retry `400`, `401`, or `403`. Cache keys are SHA-256 hashes rather than raw location identifiers. These controls are per Vercel instance, not deployment-wide.

Do not enable the tools in production until Cardiff Council confirms third-party reuse and attribution, private address-selection checks pass, and the flow succeeds from a Vercel preview. Record those checks in [ACCEPTANCE.md](../ACCEPTANCE.md).

Collection dates are schedules, not proof of collection. The server does not infer future dates and does not treat missing data as “no collection.” Short-notice changes should be checked using the official lookup and collection-updates pages.

## Cost and limitations

The expected incremental cost for low-volume development is £0: the FSA API is free, public GitHub repositories are free, and this service should fit comfortably within Vercel Hobby limits. Usage limits and product availability can change.

Not included in this milestone: Welsh responses, location/distance search, school inspections/performance, persistent analytics or caching, authentication, maps, menus, opening hours, bookings, alerts, MCP widgets, or public directory submission.

## HTTP guard and privacy

The route caps POST bodies at 64 KiB before handler JSON parsing, returning 413 above that limit. Supplied Origin values must exactly match `https://mcp.wales`, the deployment's `VERCEL_URL` or `VERCEL_BRANCH_URL` origin, or `http://localhost:3000` / `http://127.0.0.1:3000` in development. No-Origin clients remain supported. Incoming Host and forwarded headers never extend this list. A future browser client needs an intentional trusted-origin addition in `src/mcp/http-guard.ts` and matching tests; do not reflect arbitrary origins or enable wildcard access.

See the [privacy statement](privacy.md) for provider recipients, cache retention and the distinction between application logs and hosting/firewall network logs. Verify the deployed WAF and hosting retention settings separately; repository tests cannot verify them. Read the [assessment](engineering-assessment.md) before directory submission.


## Geography snapshot operations

The two ward summaries bring default discovery to ten tools (twelve with the gated waste prototype). Follow [the geography runbook](geography.md) for separate source import, reference refresh, incremental association generation, full rebuild and rollback. All publication remains manual and reviewed. `npm run build` runs the release verifier before Next.js; partial or incompatible snapshots cannot pass that gate.

Ward queries perform bounded local joins, not bulk upstream searches. Existing FSA live queries retain their cache, sorting and request limits. Monthly source-freshness checks also flag changed reference metadata, newer ONSPD editions and FSA snapshot age; they do not publish changes. The daily canary reconciles complete snapshot populations and bounded ward discovery, using stable invariants.

The initial production build traced about 18.8 MB of MCP server files. Runtime point/postcode lookup helpers have since been removed, excluding the full boundary and postcode inputs from deployment. The simplified local production build on 15 October 2026 traced 7,496,856 bytes (about 7.5 MB), down from 18,800,047 bytes (about 18.8 MB). Production builds enforce that exclusion and print the resulting traced size. These inputs remain available offline for refreshes and rebuilds; deployment limits and Vercel-origin access were not checked. No hosted storage, paid service or runtime geospatial dependency was added. Measure again when adding another authority rather than bundling all Wales pre-emptively.
