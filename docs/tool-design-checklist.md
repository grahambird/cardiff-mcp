# Tool design checklist

Use this short checklist in a change description. It guides engineering judgement; it is not a separate approval process. Read the [principles](design-principles.md), [source register](../DATA_SOURCES.md) and [testing conventions](../QUALITY.md).

## A. Value proposition

- Identify the user questions and who benefits.
- Compare **two or three representative questions** with a capable assistant using knowledge, web search and usual tools, without MCP Wales. Record answer quality, retrieval steps and limitations, then the expected MCP improvement.
- Does better access, accuracy, analysis, efficiency or coverage justify development and ongoing maintenance? Do not invent baseline results; mark unperformed comparisons pending.

Suggested brief record: question | without MCP result/evidence | expected gain | maintenance cost. Reuse [evaluation prompts](ai-evaluations.md).

## B. Data responsibility

- Is the publisher authoritative, the data public, and reuse appropriately licensed? Record terms, attribution, coverage, dates and limitations.
- Could individual records or combinations identify people, properties, households or vulnerable groups, or enable targeting?
- Record contextual risk: **low** (aggregated Census statistics, institutional directories), **moderate** (granular statistics, detailed school characteristics, property records), **high** (sensitive person/household information). These examples are indicative, not automatic clearance.
- Higher-risk integrations require explicit review of the actual risk and may need redesign or rejection. Default to aggregates and minimise user inputs.

## C. Tool design and AI usability

- Does the tool complete a useful task rather than mirror an endpoint? Is its name/scope distinctive and its description factual about when to invoke it?
- Can an assistant choose and use it efficiently without overlapping tools or unnecessary follow-up calls?
- Are parameters validated and bounded? Do filtering, sorting and ranking happen before bounded pagination without exhaustive upstream calls?
- Are outputs concise, structured, attributable and clear about no results, missing values and errors?

## D. MCP protocol compliance

- Consult the [current official specification](https://modelcontextprotocol.io/specification/) and the installed SDK's supported revisions; preserve tested older-client compatibility.
- Check input schemas, structured/text results and any `outputSchema`. Declared schemas must match outputs; optional protocol features need a concrete benefit.
- Set accurate `readOnlyHint`, `destructiveHint` and `openWorldHint`; annotations are advisory, not access enforcement.
- Check protocol errors versus tool execution errors, transport/session behaviour, HTTP security, version handling and interoperability with common clients.
- Separate mandatory protocol requirements from security recommendations and platform-specific publication rules.

## E. Operational safeguards

- Reuse existing cache, HTTP guard and logger where appropriate; keep connectors separate from tool definitions.
- Bound bytes, results, time, concurrency and cache memory. Deduplicate requests, respect cooldowns and avoid unnecessary provider traffic.
- Validate untrusted upstream content and geography; avoid diagnostic/credential leakage.
- Keep logging minimal, retention disclosed, and performance/resilience proportionate. Note instance-local versus deployment-wide limits.

## F. Testing

- Cover normal, invalid and boundary inputs, pagination/sorting, missing/suppressed data, upstream failure/timeouts, malformed and malicious content, repeated/concurrent requests and information leakage.
- Test output contracts, annotations and HTTP compatibility with mocked upstream responses. Avoid unnecessary live-provider traffic.
- Add realistic assistant cases covering selection, completion, accuracy and unnecessary calls, including a no-call baseline. Record manual results honestly.
- Run `npm run check`; use bounded smoke checks and [release acceptance](../ACCEPTANCE.md) where applicable.

For directory publication, separately review the current platform rules for metadata, support contact, data handling and a published privacy policy; a passing MCP test is not directory approval.
