# Cardiff MCP

Cardiff MCP is a small, open-source, read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for useful public data about Cardiff, Wales. Its first milestone connects AI assistants to live Food Standards Agency (FSA) food-hygiene ratings.

```text
ChatGPT or another MCP client → Streamable HTTP /mcp → Next.js on Vercel → FSA API v2
```

The server has no database, accounts, authentication, Redis, LLM calls, or OpenAI API key. It exposes two tools:

- `find_food_businesses` searches within Cardiff by business name, broad FSA business type, and minimum numeric hygiene rating.
- `get_food_business` gets one Cardiff establishment using its FSA `FHRSID`.

## What the data means

Food hygiene ratings reflect hygiene standards found on the date of inspection or visit. They do **not** assess food quality. The FSA data used here does not provide menus, opening hours, bookings, or availability. Non-numeric states such as `AwaitingInspection`, `AwaitingPublication`, `Exempt`, and a pending new rating are returned explicitly.

Contains public sector information licensed under the Open Government Licence v3.0. Source: Food Standards Agency. See [DATA_SOURCES.md](DATA_SOURCES.md).

## Local setup

Prerequisites: Node.js 20.9 or later and npm. The lockfile records the exact tested versions. The initial Next.js 15.2/Vitest 3 compatibility baseline was upgraded to current compatible releases after npm reported security advisories; this public server should not preserve vulnerable version pins.

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

The smoke test starts the production build, discovers both MCP tools, performs a live rating-5 Cardiff search, and retrieves the first returned establishment. It therefore requires internet access and a responsive FSA service. Unit tests use mocked responses and remain deterministic.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project**, import the repository, and accept the detected Next.js settings.
3. Deploy without environment variables. New Vercel projects use Fluid Compute by default.
4. Visit `https://<project>.vercel.app` and run the smoke client against production:

   ```bash
   npm run smoke:client -- https://<project>.vercel.app
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
2. Enter a name such as `Cardiff MCP` and the full `https://<project>.vercel.app/mcp` URL.
3. Choose no authentication, review the risk warning, create the connection, and install it.
4. Confirm the discovered tools are `find_food_businesses` and `get_food_business`.
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

To inspect events, open the Vercel project and choose **Logs**, then search for `mcp_tool_call`, a tool name, or an error code such as `throttled`. On the Hobby plan, Runtime Log retention is currently one hour, so this provides immediate troubleshooting rather than long-term analytics. Persistent log drains and longer-term alerting are deferred until traffic justifies a paid plan or external service.

## Security and privacy

`/mcp` is intentionally public and unauthenticated. Both tools are read-only and accept narrow, validated inputs. The service does not request, store, or transmit user credentials, private ChatGPT data, or personal account data. Do not add secrets to the repository; use Vercel environment variables if a future source needs credentials.

Remote MCP servers can receive prompt-derived tool arguments. Only connect servers you trust and avoid placing sensitive information in searches.

## Cost and limitations

The expected incremental cost for low-volume development is £0: the FSA API is free, public GitHub repositories are free, and this service should fit comfortably within Vercel Hobby limits. Usage limits and product availability can change.

Not included in this milestone: Welsh responses, location/distance search, other datasets, persistent analytics or caching, authentication, maps, menus, opening hours, bookings, alerts, MCP widgets, or public directory submission.

## Licence

Project code is MIT-licensed. FSA data has its own OGL v3 terms and attribution; see [DATA_SOURCES.md](DATA_SOURCES.md).
