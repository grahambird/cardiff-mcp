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
* School performance, inspections, welsh language support, and other info - from StatsWales, Estyn

## Schools: possible next steps

The first release is a Cardiff maintained-school directory from the Welsh Government register. These are possible follow-ups, not commitments for that release.

| Later step | Evidence or condition needed |
| --- | --- |
| Pupil totals and FSM statistics | Use verified StatsWales downloads; preserve census periods, rounding and eligibility categories. Confirm a simple refresh approach first. |
| Nearby-school searches | Validate a reusable postcode-coordinate download; label approximate straight-line distances separately from catchment and admission rules. |
| Estyn inspections | Confirm permitted automated access and redistribution. Direct links are allowed; structured findings and recommendations remain gated. |
| School examination results and trends | Obtain a supported school-level API/export or explicit permission for My Local School access. The examined national examination workbook does not supply individual-school results. |
| Shared profiles and historical joins | Reuse Welsh school numbers; add evidence-backed, dated mappings for identifier changes, closures and mergers when multiple sources are introduced. |
| Catchments, term dates and capacity | Confirm structured access, reuse terms and school-specific coverage. Admission numbers are not total capacity or live vacancies. |

Do not scrape unsupported endpoints, generate school rankings or add infrastructure in anticipation of these steps.

## Census 2021

Implemented initial coverage: Cardiff wards/MSOAs plus Welsh local-authority demographics, comparisons and complete Cardiff rankings. Future candidates: verified neighbourhood aliases, LSOAs and other authorities’ subdivisions. Add only with authoritative dated membership, bounded queries and coverage tests. Current population estimates would be a separate source with distinct reporting dates.
