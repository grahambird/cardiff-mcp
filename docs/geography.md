# Shared geography

MCP Wales compares institutional and food-business locations using May 2022 Cardiff wards and Census 2021 LSOAs/MSOAs. These are explicitly dated geographies, not a claim about today's electoral arrangements. Census measures remain historical observations from ONS. No WIMD, income, catchment or residential lookup service is included.

## Ownership and runtime

```text
School register / StatsWales       FSA bulk source snapshot       ONS live Census
             │                              │                         │
             └── source-owned locations ────┘                         │
                             │                                       │
              shared references + offline matcher                    │
                             │                                       │
                separate school/FSA associations                     │
                             └──── existing tools + summaries ───────┘
```

1. Source data: school register and StatsWales files keep their independent imports. `src/fsa/source.json` retains the complete official Cardiff XML fields as JSON, including original identifiers, rating labels, location fields and source provenance. Missing/nil source values are not invented. Existing FSA discovery without a ward and individual detail requests stay live.
2. Reference data: `src/geography/data/W06000015/` contains the shared catalogue, full-resolution boundaries, postcode subset, spatial intersections and manifests. The directory is partitioned by GSS authority code; another authority can use the same engine and association format. The initial deployment supports only Cardiff subdivisions, plus the existing 22 authority names/codes.
3. Associations: separate `schools-associations.json` and `fsa-associations.json` files join seven-digit school IDs or FHRSIDs to reference codes. They retain location fingerprints, source URLs, matching methods, per-level accuracy, reference/matcher versions and calculation timestamps. The geography module never downloads source records.

Ordinary queries join precomputed files; no point-in-polygon work or external postcode call happens during those queries. Coordinate and postcode matching is available only to offline preparation and tests; the deployed module exports no point or postcode lookup helpers. Boundary and postcode reference files remain in the repository for rebuilds but are excluded from the deployed MCP server bundle. Geometry uses bounding-box rejection, polygon/multipolygon rings and holes. Source connectors remain separate from MCP definitions; no new runtime package, database, hosted service or secret is required.

The previous `src/ons/geographies.json` is retained only as a historical seed for the existing Census catalogue and provenance. Runtime Census resolution uses the shared catalogue through its adapter. The old standalone Census refresh command refuses to overwrite a competing catalogue.

## References, licences and matching

The machine-readable catalogue records exact product URLs, retrieval dates, input checksums, available publication dates, portal creation/modification dates, versions and attribution. A portal creation timestamp is not assumed to be the dataset's publication date.

| Product | Vintage and use |
| --- | --- |
| ONS ward-to-authority lookup | May 2022; existing Census code/name seed |
| Welsh Government Electoral Wards Wales May 2022 | Full OS Boundary-Line-derived ward geometry; created 4 July 2022 |
| ONS LSOA BFC V10 / MSOA BFC V7 | December 2021 geography; full resolution, not generalised cartography |
| ONS OA→LSOA→MSOA→LAD exact-fit lookup V3 | Official 2021 statistical nesting; validate actual fields, including LAD22CD |
| ONS LSOA→ward→authority best-fit lookup | May 2022, published 26 August 2022; approximate allocation only |
| ONSPD hosted table | August 2026 edition, published 16 September 2026; Cardiff authority subset, including termination and grid-quality indicators |

Sources: [Welsh ward boundaries](https://datamap.gov.wales/layers/geonode:electoral_wards_wales_may_2022), [ONS geography portal](https://geoportal.statistics.gov.uk/), [ONS postcode licensing](https://www.ons.gov.uk/methodology/geography/licences). The ONS sources' ArcGIS item IDs and download services are pinned in the importer and catalogue.

Reference data are OGL v3, with ONS, OS and Royal Mail attribution carried into geographic responses. Ward geometry separately retains the publisher's 2022 OS notice. Wales postcode geography is freely reusable under these terms; a paid postcode-to-address service is unnecessary. No Northern Ireland data or individual-address directory is bundled.

Coordinates take priority when finite and within latitude/longitude bounds. Each geographical level is matched independently. Exact means unambiguous containment of the supplied coordinate, not independent verification of the establishment's real location. Outside-coverage coordinates are not replaced by a conflicting postcode. Invalid/missing coordinates can fall back to ONSPD. Current postcodes with grid quality 1–3 are accepted; terminated, missing, invalid, unsupported or less reliable entries remain unresolved. Postcode-based establishment allocation is always approximate. The ward comes from the postcode point against the pinned 2022 geometry; published 2021 LSOA/MSOA identifiers are retained independently. Current ONSPD ward codes are not silently mixed into this historical ward basis.

Boundary-edge points, overlaps and gaps remain unresolved with reasons/candidates; no alphabetical tie-break assigns them. Matching has a numerical edge tolerance of approximately a millimetre. Spatial-intersection preparation uses centimetre-scale interior probes and strict edge crossings to distinguish positive-area intersections from contact. It supplies relationships, not statistical weights. Full geometry and coordinate provenance remain versioned; source coordinate accuracy can be much worse than numerical tolerances.

Area names resolve to one exact official name/code or published Welsh alias. Partial or ambiguous names require selecting an official code. Roath is not silently mapped to a ward. Exact parentage covers LSOA→MSOA and authority membership; wards do not form a parent hierarchy for LSOAs/MSOAs. `getRelatedAreas` labels exact nesting, best-fit LSOA allocation and spatial intersection separately.

## Manual refresh and rebuild

Run commands from the repository root using Node 24+, Python 3 and curl. Large raw inputs stay outside the application bundle. Retain input directories and reports locally for audit; do not commit the full national products. A fresh input directory checks publisher corrections; an existing directory reuses its pinned downloads.

**Reference preparation**, independent of schools/FSA acquisition:

```bash
python3 scripts/download-geography.py /tmp/geography-inputs
python3 scripts/prepare-geography.py /tmp/geography-inputs --candidate /tmp/geography-references
```

Download is restricted to official lookup membership and explicit ward codes, with complete service pagination and cardinality checks. Preparation validates checksums, scope, codes, rings, coordinate system and statistical/postcode hierarchies before writing a candidate. The raw `inputs.json` manifest pins all acquired files. To reproduce exactly, retain that directory; publishers may correct data in place.

**FSA source refresh**, independent of references and association calculation:

```bash
curl -fsSL --max-time 60 https://ratings.food.gov.uk/api/open-data-files/FHRS556en-GB.xml -o /tmp/cardiff-fsa.xml
python3 scripts/import-fsa.py /tmp/cardiff-fsa.xml --expected-count COUNT_FROM_OFFICIAL_LISTING --candidate /tmp/fsa-source.json
```

Use the count for that extract from the [official download listing](https://ratings.food.gov.uk/open-data), not a fixed historical count. If listing and extract disagree, stop and acquire a consistent pair; never weaken completeness validation. The XML header count, success status, Cardiff scope, scheme and unique FHRSIDs are checked. This is a full supported authority export, not exhaustive runtime search.

**Incremental enrichment**, from existing local source files:

```bash
node scripts/build-geography.mts --references /tmp/geography-references --schools src/schools/directory.json --fsa /tmp/fsa-source.json --previous src/geography/data/W06000015 --candidate /tmp/geography-release
node scripts/verify-geography.mts /tmp/geography-release src/schools/directory.json /tmp/geography-release/fsa-source.json
```

For a source-only refresh, `--references src/geography/data/W06000015` reuses existing references. For a reference-only rebuild, `--fsa src/fsa/source.json` reuses retained FSA data. A school-only update uses the normal school importer, then rebuilds against existing FSA and references. Both association candidates are emitted as a consistent set, but unchanged records retain their calculations. No source downloads occur in the builder.

Location fingerprints include normalised address, postcode and coordinates: a same-postcode relocation is reconsidered; rating/name-only updates do not cause location recalculation. New records are calculated, missing IDs are removed from the new association population and reported without inferring closure. A reference or matcher-version change invalidates affected authority associations. Add `--full` to recalculate everything. Review `report.json` for reuse, recalculation, removals and unresolved counts.

**Promotion**: review the candidate/report, then copy the candidate's reference, spatial-relation, association and release files together into `src/geography/data/W06000015/`; copy `fsa-source.json` to `src/fsa/source.json`. Preserve independently updated school source files. Run `npm run check`, review the Git diff and deploy the whole tested revision. `npm run build` also verifies manifest checksums, source fingerprints, association populations and versions before Next builds. A partial copy cannot produce a successful release build.

Production publication is atomic at the immutable deployment level. Candidate files and local edits are not served to production. If acquisition, validation or build fails, leave the deployed version alone. Roll back the complete Git revision/deployment; do not roll back one association file independently. No runtime filesystem writes occur.

## Responses and limitations

- `find_schools(ward?)` filters the full register before existing sorting/pagination. Profiles and discovery carry joined geography. `summarize_schools_by_ward(wards?, phase?, language_group?)` returns all selected wards, including zeros, plus authority coverage. Locations do not imply catchments, eligibility, pupil residences or school quality.
- `find_food_businesses(ward?)` uses the complete source snapshot only when ward is supplied. Local name matching is case-insensitive substring matching. Local sorts apply before pagination, with numeric ratings ahead of non-numeric states in either direction and FHRSID ties ascending. Unfiltered discovery retains upstream sorting and limits.
- `summarize_food_businesses_by_ward(wards?, business_type?)` includes every eligible snapshot record, rating counts, numeric-rating denominators/percentages and a separate pending flag count. Pending flags must not be added to rating bucket totals.
- `get_food_business` remains live with its existing short cache. Geography is attached only when live location fields match the stored fingerprint; relocated or new records show association pending refresh. API lowercase `geocode` and XML uppercase `Geocode` are explicitly handled.
- Coverage splits exact, approximate and unresolved ward allocations. Selected-ward summaries retain **authority-wide filtered coverage**, so excluded/unresolved records are visible. Sum of all ward populations plus unresolved equals the source population. A complete source population does not mean every location was resolved.
- FSA snapshots show extract/retrieval dates and age; after 30 days they carry a freshness warning but remain usable as dated historical snapshots. Live ratings and snapshots can legitimately disagree.
- Census tools retain their supported types, topics, versions, native ward observations and denominators. Internal LSOAs do not expand Census tool scope. No percentages, deprivation ranks or intersecting-area totals are allocated to wards. Unsupported statistical allocation requires an explicit explanation.

Initial 15 October 2026 release preparation: 126 schools (125 approximate ward allocations, one unresolved terminated postcode); 3,492 FSA-published establishments (2,553 exact, 448 approximate and 491 unresolved: 481 missing postcodes/coordinates, nine terminated postcodes, one unsupported postcode). These are dated audit facts, not live canary assertions. Do not infer hidden residential locations from absent FSA location fields.

## Quality, operation and release evidence

`npm run check` covers deterministic matcher/importer/refresh/release tests, tool contracts, existing regressions and build. Synthetic fixtures control behavioural truth; dated institutional/business examples test the bundled references. The canary checks complete ward reconciliation, source dates and bounded discovery rather than fixed live businesses or ratings. Monthly freshness checks compare pinned ONS metadata, look for a newer postcode edition and flag FSA snapshots older than 30 days. Ward-layer corrections still require checking the official Welsh Government page manually.

Two new summary tools provide complete aggregates in one call, which paginated discovery could not safely provide. Tool checklist: public/read-only data; bounded outputs (at most 28 wards); no additional upstream runtime requests; serialized untrusted source fields; shared logger/HTTP controls retained; exact/approximate and reporting periods explicit. Public institution/food-business location enrichment has moderate combination risk; no household lookup or pupil-level data is added.

Manual no-MCP comparisons, assistant selection/interpretation and Vercel-origin live checks remain pending. The evaluation prompt fixtures record expected gains, not fabricated baseline results. WAF settings were not inspected. Record performed release checks separately without overwriting existing acceptance notes.


Local verification on 15 October 2026: production-build HTTP smoke passed with live FSA/ONS and complete ward reconciliation. Six dated examples were independently checked using GeoServer WFS `Intersects` against the official Welsh Government May 2022 layer: school postcode points CF11 7XS (Grangetown), CF14 6HL (Rhiwbina), CF14 5YL (Llanishen), and public FSA coordinate records 968668, 968433, 969048 respectively. These verify the reference/matcher examples, not independent school-site coordinate accuracy. Before runtime simplification, the local server reported ready in 109 ms; first food summary took 36 ms (including initial snapshot mapping), school summary 2 ms and subsequent bounded ward lookups 1 ms. These are local observations, not Vercel cold-start guarantees.

Runtime simplification verified on 15 October 2026: all 180 tests and the production build pass. Traced MCP server files fell from 18,800,047 to 7,496,856 bytes (approximately 60%). Full boundary and postcode inputs are now offline-only. Production builds check the MCP file trace and reject accidental inclusion of these files. The public tools and source/reference/association refresh workflows are unchanged. A future user-facing point or postcode lookup would require an intentional new runtime capability.
