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

The code also applies an eight-second FSA timeout, permits no more than 20 records per page, caps pages at 10, and caches successful upstream responses for five minutes in warm instances. Cache and rate limiting are deliberately modest for a first public prototype.

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

After building, `CARDIFF_WASTE_TOOLS_ENABLED=true npm run test:smoke` verifies that MCP discovery includes all ten tools while retaining the existing live FSA checks. Waste execution remains covered by mocked deterministic tests until a private property is supplied for the gated acceptance check.

The connector uses a five-minute address cache, a fifteen-minute collection cache, short-lived JWT caching, single-flight request deduplication, and at most two outgoing Cardiff requests per warm instance. It retries transient network, `429`, and `5xx` failures once; it does not retry `400`, `401`, or `403`. Cache keys are SHA-256 hashes rather than raw location identifiers. These controls are per Vercel instance, not deployment-wide.

Do not enable the tools in production until Cardiff Council confirms third-party reuse and attribution, private address-selection checks pass, and the flow succeeds from a Vercel preview. Record those checks in [ACCEPTANCE.md](../ACCEPTANCE.md).

Collection dates are schedules, not proof of collection. The server does not infer future dates and does not treat missing data as “no collection.” Short-notice changes should be checked using the official lookup and collection-updates pages.

## Cost and limitations

The expected incremental cost for low-volume development is £0: the FSA API is free, public GitHub repositories are free, and this service should fit comfortably within Vercel Hobby limits. Usage limits and product availability can change.

Not included in this milestone: Welsh responses, location/distance search, school inspections/performance, persistent analytics or caching, authentication, maps, menus, opening hours, bookings, alerts, MCP widgets, or public directory submission.
