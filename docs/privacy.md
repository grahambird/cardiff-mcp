# MCP Wales privacy statement

Last updated: 15 October 2026.

MCP Wales is an open-source public, read-only service. It does not require an account, authentication, payment or user credentials. Do not include private information in tool searches. An assistant may send task-specific information from your question as tool arguments; MCP Wales does not request your conversation history.

## Processing and recipients

The service processes the arguments needed for the requested lookup. Food business searches and establishment identifiers go to the Food Standards Agency. Census requests send supported official area codes and dataset choices to ONS. School tools use bundled Welsh Government snapshots and make no runtime requests to that provider. Queries pass through Vercel, which hosts the service. Public-source providers and Vercel operate under their own privacy and logging practices; MCP Wales does not control their retention.

The property-level waste prototype is disabled in normal public operation. Its preview-only processing is described in [operations](OPERATIONS.md#waste-collection-spike); it must not launch until reuse and privacy release checks are complete.

## Storage and logging

MCP Wales has no user database, tracking analytics or persistent query history. Successful FSA and ONS results are cached in process memory for five minutes, with at most 100 entries per provider cache. Entries expire from use after five minutes and are removed on subsequent cache activity, capacity eviction or instance shutdown; expired bytes are not guaranteed to be erased immediately. FSA cache keys can contain business search terms, so do not put personal information in them. Temporary in-flight requests and provider cooldowns also live in memory.

Application logs contain tool names, outcomes, durations, result counts where useful, safe error codes and upstream status metadata. They exclude arguments, search text, prompts, establishment/property identifiers, IP addresses, user-agent strings, credentials and upstream response bodies. ONS also logs safe provider-request metrics. Current Vercel Hobby runtime log retention is documented as one hour; hosting plan changes can alter it. No separate log drain is configured by this repository.

Vercel hosting and firewall systems can process network information, including IP addresses, for delivery, security and rate limiting. This is distinct from application logging. The repository cannot verify the hosting account's current configuration or provider retention; operators must review those settings before directory submission or changing this statement. See [Vercel privacy information](https://vercel.com/legal/privacy-policy).

## Choices and contact

You can avoid sending private information, disconnect the MCP server in your assistant, or use the official data sources directly. There are no user accounts or persistent user profiles to manage. For privacy questions, contact the maintainers through the repository's GitHub Issues linked from [mcp.wales](https://mcp.wales); do not publish personal information or secrets in an issue. A directory submission must verify that this support route and the published policy satisfy its current requirements.
