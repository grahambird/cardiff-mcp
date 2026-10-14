# Data source register

## Food Standards Agency food hygiene ratings

| Field | Detail |
| --- | --- |
| Publisher | Food Standards Agency (FSA) |
| Dataset | Food Hygiene Rating Scheme (FHRS) data |
| API | `https://api.ratings.food.gov.uk`, version 2 |
| Documentation | <https://api.ratings.food.gov.uk/help> |
| Dataset page | <https://data.food.gov.uk/catalog/datasets/38dd8d6a-5ab1-4f50-b753-ab33288e3200> |
| Terms | <https://ratings.food.gov.uk/terms-and-conditions> |
| Licence | Open Government Licence v3.0 |
| Update pattern | Live API data is updated as local authorities upload and publish records |

Requests use these headers:

```text
x-api-version: 2
Accept: application/json
Accept-Language: en-GB
```

No registration, login, or API key is currently required.

### Cardiff scope

The current FSA authority listing identifies Cardiff as:

- `LocalAuthorityId`: `339` — used by the API search filter;
- `LocalAuthorityIdCode`: `556` — used when verifying detail records;
- name: `Cardiff`;
- scheme: FHRS.

These are identifiers in the FSA system and must not be described as ONS area codes. The connector fixes every search to authority ID 339. A direct establishment lookup is returned only when its authority code or authority name confirms Cardiff.

### Interpretation and freshness

Ratings describe hygiene standards found at the inspection date. They are not reviews of food quality and do not contain menus, opening hours, bookings, or availability. Ratings can change. Results therefore include the inspection date, the FSA extract time when the endpoint supplies it, the retrieval time, and a canonical FSA business link.

The API sometimes supplies `1901-01-01` when no meaningful rating date exists. MCP Wales returns `null` instead. Numeric values `0` to `5` remain numbers; `AwaitingInspection`, `AwaitingPublication`, `Exempt`, unknown text, and `NewRatingPending` remain explicit states rather than being converted into scores.

### Attribution and branding

Every tool result and relevant project documentation includes:

> Contains public sector information licensed under the Open Government Licence v3.0. Source: Food Standards Agency.

The project does not use FSA logos or official rating badge imagery. It does not imply endorsement by the FSA. FSA imagery has additional trademark and usage rules separate from the dataset's OGL terms.

## Cardiff Council waste collections — gated spike

| Field | Detail |
| --- | --- |
| Publisher | Cardiff Council |
| Official lookup | <https://www.cardiff.gov.uk/article/2115/When-are-my-bins-collected> |
| Collection updates | <https://www.cardiff.gov.uk/collectionupdates> |
| Access method | Undocumented council-operated SOAP token service and JSON address/collection endpoints used by the official web experience |
| Authentication | Short-lived bearer token issued without a resident account; no project secret |
| Verification date | 11 October 2026 |
| Licence and attribution | Not identified; clarification required before production release |
| Published limits | None found |
| Freshness metadata | None supplied in the checked response |

Bounded checks confirmed token acquisition, HTTP 204 for both an invalid address search and a synthetic unknown UPRN, and two weeks of collection data for a community connector's published test UPRN. Observed source labels were `Garden`, `Food`, `Recycling`, `General`, and `Glass`; new labels are preserved rather than rejected. `collectionType` was `Standard` in the live sample. Historical community code maps `Moved` to a rescheduled collection, but that meaning still requires confirmation from Cardiff Council.

The community connectors are MIT-licensed, but their code licences do not license Cardiff Council's data. The implementation is therefore disabled by default. It neither downloads a city-wide address dataset nor performs arbitrary address searches. User-supplied postcodes, addresses, UPRNs and access tokens must not be persisted or logged.

Retrieval time records when MCP Wales fetched a response. It is not the publisher's update time. Scheduled dates are not confirmation that collection occurred, missing data is not proof that no service exists, and future dates must not be calculated from an assumed pattern.

## Welsh Government school register — Cardiff maintained schools

| Field | Detail |
| --- | --- |
| Publisher | Welsh Government |
| Official register | <https://www.gov.wales/addresses-and-phone-numbers-schools-and-pupil-referral-units> |
| Download checked | <https://www.gov.wales/sites/default/files/publications/2026-04/address-list-schools-values.ods> |
| Publication date | 23 April 2026; no newer release shown when checked on 11 October 2026 |
| Import date | 11 October 2026; exact timestamp and source SHA-256 recorded in `src/schools/directory.json` |
| Licence | Workbook N2 explicitly states OGL v3.0 except where otherwise stated; <https://www.gov.wales/copyright-statement> |
| Coverage | 126 Cardiff maintained schools from the English `Maintained` sheet, LA education code `681` |
| Update frequency | Directory schedule unconfirmed; updates are manual |

School numbers are seven-digit strings, separate from FSA authority identifiers and ONS geography codes. The import retains source names, sectors, types, governance, language categories, addresses, postcodes and telephone numbers. It excludes independent schools, PRUs and pupil counts. Register pupil counts do not have a sufficiently clear reporting period for this release.

Welsh-medium and dual-language groups include transitional provision; original labels are retained. Unknown future labels map to `unknown`, never to an inferred language based on school name. A missing school or a changed identifier does not prove closure. No historical identity mapping is supplied.

Every result includes the register URL, its publication date, the snapshot import time and:

> Contains public sector information licensed under the Open Government Licence v3.0. Source: Welsh Government.

Import time is not the publisher's update time. The data is a snapshot, not a guarantee of current contacts or availability. No logos or endorsement claims are used.

### Manual refresh

1. Check the official register page for a newer release and its publication date. Download its linked ODS locally; do not assume the old URL is current.
2. Use Python 3 (standard library only) to regenerate the snapshot:

   ```bash
   python3 scripts/import-schools.py /path/to/register.ods --published-at YYYY-MM-DD --download-url https://www.gov.wales/path/to/register.ods
   ```

3. Review changes in counts, identifiers, school details and language labels. The importer rejects changed columns, missing required fields and duplicate IDs. Investigate unexpected removals rather than inferring closures.
4. Run `npm run check`, review the JSON diff, and deploy the reviewed update. A failed import must not replace the previous snapshot.

The importer selects only the `Maintained` sheet and Cardiff LA code; it neither adds application dependencies nor performs network requests. Runtime searches use bundled JSON.

## FSA sorting capability — checked 12 October 2026

The live API v2 `/SortOptions` lookup confirms name A–Z (`alpha`), name Z–A (`desc_alpha`), rating highest first (`rating`) and rating lowest first (`desc_rating`). These rating keys are counterintuitive and must be mapped explicitly. The lookup also provides relevance and distance; these are not exposed in this change. No inspection-date option is supplied.

The connector sends the chosen sort with existing filters and bounded pagination in one request. It preserves returned ordering without sorting individual pages or downloading all matches. FSA does not document a secondary tie-breaker or guarantee an unchanged dataset between page requests. Non-numeric rating placement is upstream-controlled.

## StatsWales school statistics

Three independent Cardiff-only snapshots are stored under `src/schools/statswales/`; the register is never rewritten by this import. The provider is Welsh Government, publishing service StatsWales, source PLASC. Supported API documentation: <https://api.stats.gov.wales/docs/?urls.primaryName=API+v2+%28English%29>.

| Import kind | Dataset ID | Measures |
| --- | --- | --- |
| characteristics | 2018f447-f4c0-438d-bb88-2a72af967724 | Pupil headcount and census characteristics |
| year_groups | 9b0d8f7a-02f9-4663-8093-ec975074f4ea | Pupil headcounts by published year group |
| fsm | 996385d1-061e-4835-8c92-60d232277216 | Eligibility and eligibility including transitional protection; counts, percentages, all-pupils count |

Initial import: 12 October 2026. All three exports cover 2025/26, census 20 January 2026, published 5 August 2026; next update expected August 2027. Each matches all 126 register schools, with no unmatched Cardiff IDs. Year groups sum to the characteristics total for every Cardiff school. Pupil totals include published nursery and post-16 groups and are headcounts, not FTE or capacity. The characteristics dataset history records removal of subsidiary pupils on 29 January 2026.

FSM counts round to the nearest five; percentages are supplied separately and must not be recalculated. Thus Glantaf has a pupil total of 1,528 and an FSM all-pupils count of 1,530. Means-tested eligibility and eligibility including transitional protection are separate categories; neither includes meals received solely through universal primary provision. CSV exports represent suppression as a blank value with a Confidential note. No Cardiff values were suppressed in this import; suppression exists elsewhere in the public dataset and is covered by tests. Blank values without notes are unavailable, never zero.

Register and census characteristics differ, including governance at some schools and the name THE COURT SCHOOL versus Ysgol Cynefin (6817005). These differences are retained, not resolved by assumptions. Original source names are stored separately; joins use seven-digit identifiers only. The year-group Welsh metadata title is stale (2024/25); the importer checks the English title and explicitly supplied reporting period. Historical comparisons are deferred because the documented API exposes latest revisions, without an established historical revision-download route.

Reuse follows OGL v3 through the dataset pages' linked <https://www.gov.wales/copyright-statement>. Every profile includes source URLs and: “Contains public sector information licensed under the Open Government Licence v3.0. Source: Welsh Government (StatsWales).” No logos or endorsement are used.

### Independent manual refresh

Python 3 standard library only; no network calls in the importer or runtime school tools.

1. Choose one kind and its dataset ID above. Check its dataset page, English metadata, definitions and reporting period. Record the census date from the relevant official census report, not from the publication timestamp.
2. Download metadata before, the full supported CSV, then metadata after. The export preserves source notes and published rounding. No HTML scraping or undocumented endpoint is needed:

   ```bash
   curl -fsS "https://api.stats.gov.wales/v2/DATASET_ID?language=en-gb" -o /tmp/metadata-before.json
   curl -fsS "https://api.stats.gov.wales/v2/DATASET_ID/data?format=csv&language=en-gb" -o /tmp/schools.csv
   curl -fsS "https://api.stats.gov.wales/v2/DATASET_ID?language=en-gb" -o /tmp/metadata-after.json
   ```

3. Create a candidate and change report (replace kind, period and date as appropriate):

   ```bash
   python3 scripts/import-statswales.py characteristics /tmp/schools.csv --metadata-before /tmp/metadata-before.json --metadata-after /tmp/metadata-after.json --period 2025/26 --census-date 2026-01-20 --candidate /tmp/characteristics-candidate.json --report /tmp/characteristics-report.json
   ```

   The importer refuses to write directly to its canonical snapshot. It checks dataset/revision consistency, columns, identifiers, duplicate measures, period, numeric ranges, notes and rounding. Changed schemas or unfamiliar notes require source review before adapting the parser. It validates all input rows before narrowing to Cardiff. Cardiff authority and the 681 school prefix must agree in characteristics; the other exports use these validated Welsh school identifiers. Geography codes are not school IDs.

4. Review the report: missing register schools, unmatched Cardiff IDs, added/removed IDs, changed records, source characteristics, periods/revisions, pupil changes above 20%, and same-period year-group discrepancies. Changes may be valid. Never infer closure or silently change IDs. Retain raw inputs and reports outside the runtime bundle for audit.
5. After review, copy the candidate beside the destination and rename it into place, so replacement is atomic. Update only the selected source:

   ```bash
   cp /tmp/characteristics-candidate.json src/schools/statswales/characteristics.json.pending
   mv src/schools/statswales/characteristics.json.pending src/schools/statswales/characteristics.json
   npm run check
   ```

6. Review the Git diff and deploy the tested update. Git preserves previous snapshots. If download or validation fails, stop before promotion; the previous snapshot remains intact. When updating totals and year groups separately, check the report again after both imports. Different periods stay explicitly labelled in profiles and are not combined.

Supported CSV downloads stream the complete, modest national dataset once during manual refresh (currently about 1,441, 11,972 and 7,205 rows respectively), then bundle only Cardiff rows. This is a documented bulk export, not exhaustive runtime search. API v2 also supports filtered and paginated JSON and sorting, but runtime requests are unnecessary for this snapshot design. No new source-specific numerical usage limit was established; keep acquisition sequential and stop on upstream errors.

## ONS Census 2021

| Dataset | Pinned published version | Use |
| --- | --- | --- |
| TS001 | 3 | Usual residents in households and communal establishments |
| TS007 | 3 | Single-year ages; derived summary and five-year bands |
| TS008 | 4 | Sex |
| TS033 | 3 | Welsh-speaking ability; denominator is residents aged 3+ |

Metadata latest-version links and live Cardiff requests were verified on 14 October 2026. TS007A was not found at its API dataset endpoint; this integration uses TS007, not a local download or a substituted provider. Pinned definitions are in `src/ons/datasets.ts`. During release verification, read each `/datasets/{ID}` metadata response and compare `links.latest_version` with the registry. Review category/population-definition changes and rerun acceptance before updating a pin; never silently adopt a new version.

API: `https://api.beta.ons.gov.uk/v1`. Observations use GET `/datasets/{ID}/editions/2021/versions/{version}/json?area-type={ltla|wd|msoa},{explicit codes}`. Documentation: <https://developer.ons.gov.uk/censusobservations/>. No authentication or API key. Queries always specify supported codes. Parent filters are not relied on, because attempted filters were rejected or ignored during investigation. All 28 Cardiff wards were returned together for TS001, TS007 and TS033. No upstream sorting is assumed. The connector checks returned codes and completeness, then calculates and sorts locally. MSOA and local-authority comparisons use the same normalizer.

Statistics are as at 21 March 2021. ONS wards use May 2022 boundaries. Census disclosure control adds small perturbations: topic totals can differ, and sums of areas need not equal the separately tabulated authority total. Cardiff TS001 in the checked response summed to 362,308, whereas TS008 summed to 362,310; these are table-specific estimates, not a calculation defect or today’s population. Percentages use the selected table’s categories and population base. “65+” includes age 65 and the 100+ category. TS033 excludes category -8 from its eligible denominator. See <https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/methodologies/protectingpersonaldataincensus2021results>.

### Geography catalogue and extension

`src/ons/geographies.json` stores **identifiers, names, selected published aliases and provenance only**. It includes 22 Welsh authorities, 28 Cardiff wards and 48 Cardiff MSOAs. The manual refresh command is `python3 scripts/refresh-census-geographies.py` (Python standard library and curl). It follows all ONS metadata pages, validates expected coverage and unique codes, and writes only after all sources pass. Review the diff before committing.

Ward membership comes from the direct ONS May 2022 ward-to-authority workbook, ArcGIS item `96172380bb7d429bac154d03bf35a651`; its full list is used rather than inferred code ranges. Welsh ward aliases come from the ONS geography lookup service. MSOA membership uses ONS’s published Cardiff-prefixed official MSOA names; the response has 48 entries and is validated. Local-authority identifiers come from the ONS ltla listing. Cardiff/Caerdydd and Swansea/Abertawe aliases are included; Welsh aliases are not comprehensive across all authorities. Sources and retrieval time are recorded in the catalogue.

To add another authority’s subdivisions: extend the refresh script’s explicit authority coverage, retrieve matching official ward and MSOA membership for the same boundary vintages, validate the lists against ONS, update resolver coverage and ranking scope, and add contract/completeness tests and live acceptance. Do not derive ward population by summing best-fit LSOAs. Neighbourhood aliases require authoritative boundary evidence; approximate or partial names must require explicit official-code selection. LSOA support requires a separate reviewed catalogue and bounds update.

### Attribution, storage and operations

Source: Office for National Statistics licensed under the Open Government Licence v.3.0.

ONS observations and non-postcode lookup products use OGL v3: <https://www.ons.gov.uk/methodology/geography/licences>. The integration uses no logos, boundary geometry, postcode or UPRN data. Observations are never written to disk or a persistent store; synthetic test fixtures are not a demographic dataset. Successful validated live responses are cached in memory for five minutes, at most 100 entries per warm instance.

ONS documents 120 requests/10 seconds, 200/minute, and 15/10 seconds for high-demand assets, subject to change: <https://developer.ons.gov.uk/bots/>. Honour Retry-After. Local safeguards are deliberately more conservative but cannot enforce a deployment-wide budget. Node/Vercel access must be checked separately: curl worked locally; another HTTP client received 403. Neither availability nor an undocumented production observation-size limit is assumed.

## Monthly freshness review

`.github/workflows/source-freshness.yml` runs on the first of each month at
08:23 UTC and can also be started with **Run workflow** in GitHub Actions.
It compares the school-register ODS link, workbook SHA-256 and available page
modification metadata, StatsWales revision IDs and reporting periods, and ONS
latest-version links with committed snapshots and pins. It does not import,
change dataset versions, or deploy anything. Geography remains a manual review
because newer boundaries may not match Census 2021.

Run locally with Python 3 and curl (no npm dependencies or credentials):

```bash
python3 scripts/test-source-freshness.py
python3 scripts/check-source-freshness.py --report /tmp/source-freshness.md
```

Each source reports unchanged, update available, or check failed. An update
requires the existing manual review/import/test/deploy procedure above. A check
failure fails the workflow and requires investigating availability or metadata
shape; it never counts as unchanged. This is a change detector, not a guarantee
that the publisher has corrected every outdated record.

The workflow publishes a run summary and maintains one bot-owned GitHub issue,
“Review public-source freshness”, while updates or failures remain. An unchanged
report does not create an issue; when all checks become unchanged, the existing
issue closes. Issue creation uses only the workflow's built-in GitHub token with
`issues: write`; no additional secret is needed. Repository Issues and scheduled
Actions must be enabled. The schedule starts after the workflow reaches the
default branch; GitHub may delay scheduled runs. Source checks run sequentially
with bounded downloads and timeouts.
