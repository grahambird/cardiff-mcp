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
