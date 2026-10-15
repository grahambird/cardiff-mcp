# Roadmap for MCP server future development

## Potential other data sources

* Air quality from UK-AIR
* Green spaces from OS Open Greenspace
* Listed buildings from Cadw
* Visitor atractions - unclear where we can get this
* Crime data from Police street level crime API
* Transport stops from NaPTAN
* Bus data from Cardiff Bus https://www.cardiffbus.com/open-data
* Train times from Darwin https://www.nationalrail.co.uk/developers/darwin-data-feeds/
* Post office and postbox data
* Nearby planning application data
* School performance, inspections and other info - from StatsWales, Estyn
* Information about colleges, further education and higher education - from StatsWales
* Information about local government officials through TheyWorkForYou or similar sources

## Improvement for food safety data
Add a sort by feature so that users can ask date-based questions and get answers without needing to download the entire dataset

## Possible central feature: Location resolver
Location resolver that allows a common location capability across tools for use cases where the user specifies a location in their request.

## Schools: possible next steps

The first release is a Cardiff maintained-school directory from the Welsh Government register. These are possible follow-ups, not commitments for that release.

| Later step | Evidence or condition needed |
| --- | --- |
| Nearby-school searches | Validate a reusable postcode-coordinate download; label approximate straight-line distances separately from catchment and admission rules. |
| Estyn inspections | Confirm permitted automated access and redistribution. Direct links are allowed; structured findings and recommendations remain gated. |
| School examination results and trends | Obtain a supported school-level API/export or explicit permission for My Local School access. The examined national examination workbook does not supply individual-school results. |
| Shared profiles and historical joins | Reuse Welsh school numbers; add evidence-backed, dated mappings for identifier changes, closures and mergers when multiple sources are introduced. |
| Catchments, term dates and capacity | Confirm structured access, reuse terms and school-specific coverage. Admission numbers are not total capacity or live vacancies. |

Do not scrape unsupported endpoints, generate school rankings or add infrastructure in anticipation of these steps.

## Census 2021

Implemented initial coverage: Cardiff wards/MSOAs plus Welsh local-authority demographics, comparisons and complete Cardiff rankings. Shared geography now supplies internal Cardiff LSOA coverage and separate school/FSA ward associations. Future Census candidates: verified neighbourhood aliases, native LSOA observations and other authorities’ subdivisions. Add only with authoritative dated membership, bounded queries and coverage tests. Current population estimates would be a separate source with distinct reporting dates.
