# Cardiff MCP

Cardiff MCP is a small, open-source, read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for useful public data about Cardiff, Wales. It connects AI assistants to live Food Standards Agency (FSA) food-hygiene ratings and maintained-school profiles with StatsWales pupil and FSM statistics. The production information page is at <https://mcp.wales>; connect an MCP client using `https://mcp.wales/mcp`.

```text
ChatGPT or another MCP client → Streamable HTTP /mcp → Next.js on Vercel → FSA API v2
```

The server has no database, accounts, authentication, Redis, LLM calls, or OpenAI API key. This version exposes four tools (after deployment):

- `find_food_businesses` searches within Cardiff by business name, broad FSA business type, and minimum numeric hygiene rating.
- `get_food_business` gets one Cardiff establishment using its FSA `FHRSID`.
- `find_schools` searches a bundled Welsh Government directory of Cardiff maintained schools by name, phase and language group.
- `get_school` returns one combined school profile with separate-source pupil totals, year groups and FSM eligibility.

An implementation spike for Cardiff Council waste collections is present but gated off by default while data-reuse terms and Vercel-origin access are confirmed. It adds no production tools unless `CARDIFF_WASTE_TOOLS_ENABLED=true` is set.

## What the data means

Food hygiene ratings reflect hygiene standards found on the date of inspection or visit. They do **not** assess food quality. The FSA data used here does not provide menus, opening hours, bookings, or availability. Non-numeric states such as `AwaitingInspection`, `AwaitingPublication`, `Exempt`, and a pending new rating are returned explicitly.

Contains public sector information licensed under the Open Government Licence v3.0. Source: Food Standards Agency. See [DATA_SOURCES.md](DATA_SOURCES.md).

## Local setup

Prerequisites: Node.js 24 or later and npm. The lockfile records the exact tested versions. The initial Next.js 15.2/Vitest 3 compatibility baseline was upgraded to current compatible releases after npm reported security advisories; this public server should not preserve vulnerable version pins.

```bash
npm install
npm run dev
```

The information page is at `http://localhost:3000` and the MCP endpoint is `http://localhost:3000/mcp`.

Inspect the endpoint with the current MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

Select Streamable HTTP and enter `http://localhost:3000/mcp`.

Useful checks:

```bash
npm run lint
npm run type-check
npm test
npm run build
npm run test:smoke
```

The smoke test starts the production build, discovers all four MCP tools, checks the school directory, performs a live rating-5 Cardiff search, and retrieves the first returned establishment. It therefore requires internet access and a responsive FSA service. Unit tests use mocked responses and remain deterministic.

The production endpoint is also checked daily by GitHub Actions using stable behavioural invariants rather than fixed establishment data. See [QUALITY.md](QUALITY.md) for the quality strategy and deliberately deferred improvements.

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

## Connect ChatGPT

Availability is account- and workspace-dependent. It was observed on the project owner's ChatGPT Plus account, but this is not a guarantee for every Plus account.

1. Use ChatGPT on the web and confirm **Plugins → Add Custom MCP Server** is available.
2. Enter a name such as `Cardiff MCP` and the full `https://mcp.wales/mcp` URL.
3. Choose no authentication, review the risk warning, create the connection, and install it.
4. Confirm the discovered tools are `find_food_businesses`, `get_food_business`, `find_schools` and `get_school`.
5. Try:
   - “Find cafés in Cardiff with a food hygiene rating of 5.”
   - “What is the hygiene rating and inspection date for this Cardiff restaurant?”

The FSA business type is named `Restaurant/Cafe/Canteen`, so a café search uses a category broader than cafés alone. Every returned business includes a link to its FSA page for verification.

After changing tool names, schemas, descriptions, or annotations, refresh the custom server in ChatGPT and start a new conversation.

## Errors and troubleshooting

An empty search is a successful result with `businesses: []`. It is different from these explicit tool errors:

- `timeout`: the FSA did not answer within eight seconds;
- `throttled`: the FSA returned HTTP 403 or 429;
- `upstream`: the service could not be reached or returned another error;
- `malformed`: the upstream response did not match the expected shape;
- `not_found`: no establishment has that ID;
- `outside_cardiff`: the ID exists but belongs to another local authority.

The FSA changes its unpublished throttling rules according to operating conditions. Retry later rather than automatically making many requests.

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

After building, `CARDIFF_WASTE_TOOLS_ENABLED=true npm run test:smoke` verifies that MCP discovery includes all six tools while retaining the existing live FSA checks. Waste execution remains covered by mocked deterministic tests until a private property is supplied for the gated acceptance check.

The connector uses a five-minute address cache, a fifteen-minute collection cache, short-lived JWT caching, single-flight request deduplication, and at most two outgoing Cardiff requests per warm instance. It retries transient network, `429`, and `5xx` failures once; it does not retry `400`, `401`, or `403`. Cache keys are SHA-256 hashes rather than raw location identifiers. These controls are per Vercel instance, not deployment-wide.

Do not enable the tools in production until Cardiff Council confirms third-party reuse and attribution, private address-selection checks pass, and the flow succeeds from a Vercel preview. Record those checks in [ACCEPTANCE.md](ACCEPTANCE.md).

Collection dates are schedules, not proof of collection. The server does not infer future dates and does not treat missing data as “no collection.” Short-notice changes should be checked using the official lookup and collection-updates pages.

## Cost and limitations

The expected incremental cost for low-volume development is £0: the FSA API is free, public GitHub repositories are free, and this service should fit comfortably within Vercel Hobby limits. Usage limits and product availability can change.

Not included in this milestone: Welsh responses, location/distance search, school inspections/performance, persistent analytics or caching, authentication, maps, menus, opening hours, bookings, alerts, MCP widgets, or public directory submission.

## Licence

Project code is MIT-licensed. FSA and Welsh Government school data have their own OGL v3 terms and attribution; see [DATA_SOURCES.md](DATA_SOURCES.md).

## School directory

`find_schools` accepts optional `name`, `phase` (`nursery`, `primary`, `middle`, `secondary`, `special`) and `language_group` (`english_medium`, `welsh_medium`, `dual_language`, `not_applicable`, `unknown`). Filters combine with AND; name matching is case-insensitive. Results are alphabetical, with `page` (positive integer, default 1) and `limit` (1–20, default 10). An empty search returns `schools: []` successfully. Invalid parameters return `invalid_input`.

Try “Find Cardiff High School” or “Which Cardiff secondary schools offer Welsh-medium education?” Results retain published language labels, including transitional provision. They include school numbers as strings, contact details, the official source URL, publication date and snapshot import date. Independent schools and pupil referral units are excluded. These are published directory details, not live school status, pupil statistics, distances, catchments, inspections or performance results.

The initial snapshot contains 126 maintained schools, from the register published 23 April 2026 and imported on 11 October 2026. Searches make no external requests and need no additional cache or service. The directory is refreshed manually; see DATA_SOURCES.md for the procedure.

Contains public sector information licensed under the Open Government Licence v3.0. Source: Welsh Government.

## Discovery sorting and pagination

Both discovery tools accept optional `sort_by` and `sort_order` (`asc` or `desc`). Omitted values mean name ascending; supplying only `sort_order` changes the name direction. Existing filters, `page` and `limit` defaults and bounds are unchanged. Unsupported sort values return `invalid_input`.

- `find_schools`: `sort_by="name"`; filters and sorts the complete matching snapshot before pagination. Equal names use ascending school ID in either direction, giving stable pages within an unchanged snapshot.
- `find_food_businesses`: `sort_by="name"` or `"rating"`; FSA filters and sorts before returning the requested page. Inspection-date sorting is unavailable. Non-numeric ratings retain their explicit states, and missing or sentinel inspection dates remain null. FSA controls their placement and tied results; stable ties and snapshot consistency across live pages are not guaranteed.

For the first five schools Z–A: `{"sort_by":"name","sort_order":"desc","limit":5,"page":1}`.
For the five lowest-rated food businesses: `{"sort_by":"rating","sort_order":"asc","limit":5,"page":1}`.
Keep the same filters, sort and limit when requesting the next page.

## Combined school profiles

For “Tell me about Cardiff High School”, call `find_schools` by name, then `get_school` with the returned seven-digit `school_id` string. The profile retains directory identity and contact fields and adds pupil totals, published year groups and both FSM eligibility categories. Search result shapes, filters, sorting and pagination remain unchanged.

The initial three StatsWales snapshots cover all 126 register schools for 2025/26 (census 20 January 2026; published 5 August 2026). Each source is stored separately and composed at query time, with no network calls. Each section carries its own reporting period and source reference; `sources` gives publication/import dates, definitions and attribution. Different source characteristics appear in `source_differences` without overwriting register values.

Measures return `value` and `status`: `reported`, `suppressed`, `unavailable` or `not_applicable`. Only reported values are numeric. Missing groups are not zero. FSM counts round to five; its “all pupils” count can differ from the unrounded pupil total. Published percentages are preserved rather than recalculated. Means-tested eligibility and eligibility including transitional protection exclude meals received solely under universal primary provision. No estimates, rankings or historical queries are supplied.

Invalid IDs return `invalid_input`; IDs absent from the Cardiff register return `not_found`. Missing statistics for an existing school remain a successful partial profile. See DATA_SOURCES.md for independent refresh instructions.
