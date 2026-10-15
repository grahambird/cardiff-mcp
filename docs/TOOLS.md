# Using the tools

[Project overview](../README.md) · [Contributing](../CONTRIBUTING.md)

## What the data means

Food hygiene ratings reflect hygiene standards found on the date of inspection or visit. They do **not** assess food quality. The FSA data used here does not provide menus, opening hours, bookings, or availability. Non-numeric states such as `AwaitingInspection`, `AwaitingPublication`, `Exempt`, and a pending new rating are returned explicitly.

Contains public sector information licensed under the Open Government Licence v3.0. Source: Food Standards Agency. See [DATA_SOURCES.md](../DATA_SOURCES.md).

## Connect ChatGPT

Availability is account- and workspace-dependent. It was observed on the project owner's ChatGPT Plus account, but this is not a guarantee for every Plus account.

1. Use ChatGPT on the web and confirm **Plugins → Add Custom MCP Server** is available.
2. Enter a name such as `MCP Wales` and the full `https://mcp.wales/mcp` URL.
3. Choose no authentication, review the risk warning, create the connection, and install it.
4. Confirm the four food/school tools and four census tools below are discoverable.
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

## School directory

`find_schools` accepts optional `name`, `phase` (`nursery`, `primary`, `middle`, `secondary`, `special`) and `language_group` (`english_medium`, `welsh_medium`, `dual_language`, `not_applicable`, `unknown`). Filters combine with AND; name matching is case-insensitive. Results are alphabetical, with `page` (positive integer, default 1) and `limit` (1–20, default 10). An empty search returns `schools: []` successfully. Invalid parameters return `invalid_input`.

Try “Find Cardiff High School” or “Which Cardiff secondary schools offer Welsh-medium education?” Results retain published language labels, including transitional provision. They include school numbers as strings, contact details, the official source URL, publication date and snapshot import date. Independent schools and pupil referral units are excluded. These are published directory details, not live school status, pupil statistics, distances, catchments, inspections or performance results.

The initial snapshot contains 126 maintained schools, from the register published 23 April 2026 and imported on 11 October 2026. Searches make no external requests and need no additional cache or service. The directory is refreshed manually; see DATA_SOURCES.md for the procedure.

Contains public sector information licensed under the Open Government Licence v3.0. Source: Welsh Government.

## Discovery sorting and pagination

Both discovery tools accept optional `sort_by` and `sort_order` (`asc` or `desc`). Omitted values mean name ascending; supplying only `sort_order` changes the name direction. Existing filters, `page` and `limit` defaults and bounds are unchanged. Unsupported sort values return `invalid_input`.

- `find_schools`: `sort_by="name"` or `"pupil_total"`; filters and sorts the complete matching snapshot before pagination. Equal names use ascending school ID in either direction, giving stable pages within an unchanged snapshot.
- `find_food_businesses`: `sort_by="name"` or `"rating"`; FSA filters and sorts before returning the requested page. Inspection-date sorting is unavailable. Non-numeric ratings retain their explicit states, and missing or sentinel inspection dates remain null. FSA controls their placement and tied results; stable ties and snapshot consistency across live pages are not guaranteed.

For the first five schools Z–A: `{"sort_by":"name","sort_order":"desc","limit":5,"page":1}`.
For the five lowest-rated food businesses: `{"sort_by":"rating","sort_order":"asc","limit":5,"page":1}`.
Keep the same filters, sort and limit when requesting the next page.

## Combined school profiles

For “Tell me about Cardiff High School”, call `find_schools` by name, then `get_school` with the returned seven-digit `school_id` string. The profile retains directory identity and contact fields and adds pupil totals, published year groups and both FSM eligibility categories. Search result shapes, filters, sorting and pagination remain unchanged.

The initial three StatsWales snapshots cover all 126 register schools for 2025/26 (census 20 January 2026; published 5 August 2026). Each source is stored separately and composed at query time, with no network calls. Each section carries its own reporting period and source reference; `sources` gives publication/import dates, definitions and attribution. Different source characteristics appear in `source_differences` without overwriting register values.

Measures return `value` and `status`: `reported`, `suppressed`, `unavailable` or `not_applicable`. Only reported values are numeric. Missing groups are not zero. FSM counts round to five; its “all pupils” count can differ from the unrounded pupil total. Published percentages are preserved rather than recalculated. Means-tested eligibility and eligibility including transitional protection exclude meals received solely under universal primary provision. No estimates, rankings or historical queries are supplied.

Invalid IDs return `invalid_input`; IDs absent from the Cardiff register return `not_found`. Missing statistics for an existing school remain a successful partial profile. See DATA_SOURCES.md for independent refresh instructions.

## School size comparisons in one call

For “Which is the largest school in Cardiff?”, call `find_schools` with `{"sort_by":"pupil_total","sort_order":"desc","limit":1}`. Ascending order finds the smallest published pupil headcount; `limit=5` returns the first five. Existing name, phase and language filters still apply before ordering.

Only pupil-sorted responses add `pupil_total: {value, status}` to each school and shared `pupil_statistics` metadata. Its `source` carries StatsWales provenance, reporting period and census date; `reported_count` and `unavailable_count` cover all matching schools, including those on other pages. The latter includes every non-reported total, including suppression and non-applicability. Non-reported totals sort last in both directions; ties use ascending school ID.

Describe the result as the largest Cardiff maintained school by published pupil headcount, with its census date. If coverage is incomplete, qualify it as the largest among schools with reported totals. This excludes independent schools and does not measure school quality, capacity or live enrolment. Do not claim a unique largest school if totals tie. Use `get_school` only for additional profile details. Default name searches retain their original response shape.

## Census 2021 demographics

Four read-only tools query official ONS observations live:

- `find_census_areas`: `query`, optional `area_type` (`local_authority`, `ward`, `msoa`), `limit` 1–20 (default 10).
- `get_area_demographics`: official `area` code or exact name, `topic` (`population`, `age`, `sex`, `welsh_speaking`), `detail_level` (`summary`, `full`; default summary).
- `compare_area_demographics`: 2–5 distinct `areas` and one `topic`. All areas must use the same geography type.
- `rank_areas_by_demographic`: `parent_area` (default Cardiff), `area_type` (`ward`, `msoa`; default ward), `metric` (`population`, `aged_65_plus_percentage`, `welsh_speaking_percentage`), `sort_order` (`asc`, `desc`; default desc), `limit` 1–20 (default 10).

Try “What was Cardiff’s population in the 2021 Census?”, “Compare the age profiles of Llanishen and Grangetown”, or “Which Cardiff wards had the highest proportion of Welsh speakers in 2021?” Cardiff–Swansea comparisons are supported at local-authority level.

Coverage: all 22 Welsh local authorities, 28 Cardiff wards and 48 Cardiff MSOAs. LSOAs and other authorities’ subdivisions are deferred. Find an official area first when unsure: `{"query":"Whitchurch"}` returns Whitchurch and Tongwynlais with a boundary note; select its code `W05001297` explicitly. “Roath” has no single equivalent supported ward. Exact Llanishen names resolve to its electoral ward and remain labelled as such.

Results describe **21 March 2021**, not current population estimates. Wards use **May 2022** boundaries; neighbourhoods may differ. Population totals sum TS001 household and communal-establishment counts. Age summaries cover 0–15, 16–64 and 65+; full detail derives five-year bands from TS007, ending with 100+. Sex retains ONS female/male categories. Welsh-speaking percentages use can-speak plus cannot-speak counts for residents aged 3+, excluding “Does not apply”. Full Welsh detail includes the excluded count. Each response supplies counts, denominator definition, source URL, dataset/version and reporting/retrieval dates. Disclosure control can produce small differences between topic totals; do not replace one topic’s denominator with another.

Rankings fetch only the required observations for the complete official Cardiff area list, sort unrounded measures before limiting, use official codes to order ties, and identify tied values. An incomplete or blocked response is an error, not a partial ranking. Approximate or ambiguous area requests return `ambiguous_area` with candidates; unsupported codes return `unsupported_scope`. Other errors include `invalid_input`, `not_found`, `unavailable`, `timeout`, `throttled`, `upstream` and `malformed`.

No census observations are persisted. Successful responses have a bounded five-minute in-memory cache and identical in-flight requests are deduplicated. The connector has eight-second request timeouts, a twenty-second operation budget, a 128 KB response cap, up to two concurrent requests and a conservative instance-local request budget. It retries transient network/5xx failures once and honours ONS 429 cooldowns. These controls are per warm instance, not distributed.

The existing daily GitHub Action now checks Cardiff population and a complete Welsh-speaking ward ranking alongside FSA and school checks. It validates shapes, dates, attribution, percentages, ordering and completeness without fixed demographic values. Census tools must be deployed together with the updated canary.

Source: Office for National Statistics licensed under the Open Government Licence v.3.0. See DATA_SOURCES.md for geography refresh and dataset revision procedures.

Optional live census release acceptance: `node scripts/test-census-live.mjs http://localhost:3000`. It checks comparisons and geography edge cases, and independently verifies ward-age arithmetic against the published ONS API response without saving observations.


## Ward filtering and complete ward summaries

Both `find_schools` and `find_food_businesses` accept optional `ward`: a May 2022 Cardiff ward code or unambiguous official English/Welsh name. Filtering happens before sorting and pagination. Approximate neighbourhood names require explicit official-area selection; Roath is not a single ward. Existing calls without this parameter keep their defaults.

- `find_schools({"ward":"Grangetown","limit":10})`: joined school locations, including explicitly approximate postcode allocations. Profiles also include geography and reference provenance.
- `find_food_businesses({"ward":"Grangetown","business_type":"restaurant_cafe_canteen","minimum_rating":5})`: a dated FSA snapshot search. Without `ward` this tool remains live. Snapshot sorting is local, with numeric ratings before other states and stable ascending FHRSID ties. The FSA category includes restaurants, cafes and canteens.
- `summarize_schools_by_ward({"phase":"secondary"})`: complete maintained-school counts for every ward. Optional `wards` (1–28 distinct wards) and existing `language_group` filter. No discovery-page enumeration is needed.
- `summarize_food_businesses_by_ward({"wards":["Rhiwbina","Llanishen"]})`: establishment counts and hygiene-rating distributions; optionally filter `business_type`. All eligible snapshot records participate, independent of search pagination.

Summaries include zero wards, exact/approximate allocation counts, authority-wide filtered coverage and unresolved records. Numeric rating percentages use only numerically rated establishments; non-numeric states remain separate. `new_rating_pending_count` is an overlapping flag, not another rating bucket. Never add it to rating totals.

School location is not catchment, admission eligibility or pupils’ residence. FSA-published establishment counts are not a count of every business operating in Cardiff. Missing source locations can leave geography unresolved. Complete source coverage and complete geographical allocation are different properties.

FSA ward outputs identify `data_mode: snapshot`, extract/retrieval dates, age and a warning after 30 days. `get_food_business` remains live and may disagree with a historical snapshot; it shows pending geography if its location changed. Census uses native ward statistics from 2021 on May 2022 boundaries. A shared ward code does not make establishment and Census reporting periods contemporary. See [matching, provenance and limitations](geography.md).
