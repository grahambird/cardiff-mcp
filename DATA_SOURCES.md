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

The API sometimes supplies `1901-01-01` when no meaningful rating date exists. Cardiff MCP returns `null` instead. Numeric values `0` to `5` remain numbers; `AwaitingInspection`, `AwaitingPublication`, `Exempt`, unknown text, and `NewRatingPending` remain explicit states rather than being converted into scores.

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

Retrieval time records when Cardiff MCP fetched a response. It is not the publisher's update time. Scheduled dates are not confirmation that collection occurred, missing data is not proof that no service exists, and future dates must not be calculated from an assumed pattern.

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
