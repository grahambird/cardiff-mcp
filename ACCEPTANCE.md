# Milestone 1 acceptance record

Complete this after production deployment. Do not mark ChatGPT as tested based only on MCP Inspector results.

- Date: 11 October 2026
- Git commit: `1bf2fc3cc5329bd2a02535cb2a0c0c99b037feff`
- GitHub repository URL: <https://github.com/grahambird/cardiff-mcp>
- Vercel MCP endpoint: <https://cardiff-mcp.vercel.app/mcp>
- MCP Inspector listed both tools: [ ]
- Equivalent production MCP client listed both tools: [x]
- Production search invocation succeeded: [x]
- Production detail invocation succeeded: [x]
- ChatGPT web showed Add Custom MCP Server: [ ]
- ChatGPT discovered exactly `find_food_businesses` and `get_food_business`: [ ]
- Prompt: “Find cafés in Cardiff with a food hygiene rating of 5.”
- Selected establishment name and FHRSID: `200 Degrees Coffee Shop` — `979940` (production MCP smoke test)
- Follow-up prompt: “What is the hygiene rating and inspection date for this Cardiff restaurant?”
- Answer matched the linked FSA record: [ ]
- Answer included an openable FSA source link: [ ]
- Answer avoided claiming that hygiene ratings assess food quality: [ ]
- Notes or remaining issues:

## Waste collection gated-release record

Complete privately before setting `CARDIFF_WASTE_TOOLS_ENABLED=true` in production. Never paste a postcode, address, UPRN, or JWT into this public file.

- Cardiff Council confirmed third-party reuse and attribution: [ ]
- Council response/reference recorded without personal data: [ ]
- `Moved` status meaning confirmed: [ ]
- Private ambiguous-address selection check passed: [x]
- Private selected-property schedule matched the official lookup: [x]
- Communal or unsupported-property behaviour checked: [ ]
- Vercel preview acquired a token and called both endpoints: [ ]
- Preview MCP client discovered and executed both waste tools: [ ]
- No sensitive location data appeared in Vercel logs: [ ]
- Production environment gate enabled: [ ]
- Production MCP smoke test extended and passed: [ ]
- ChatGPT required explicit address selection: [ ]
- ChatGPT described dates as scheduled rather than completed: [ ]
- ChatGPT avoided inferring a reschedule when status was not explicit: [ ]

## School directory release

- Source checked on 11 October 2026; latest register page date: 23 April 2026.
- Imported 126 Cardiff maintained schools; independent schools, PRUs and pupil figures excluded.
- Local lint, type-check, 49 tests, production build and MCP smoke checks passed: [x]
- Vercel preview discovered three default read-only tools: [ ]
- Preview school search returned source URL and publication/import dates: [ ]
- Existing FSA preview smoke checks passed: [ ]
- ChatGPT discovered `find_schools` after refreshing the connection: [ ]
- ChatGPT answered “Find Cardiff High School” using published directory details: [ ]
- ChatGPT searched secondary Welsh-medium schools and preserved transitional labels: [ ]
- ChatGPT cited the register and did not infer pupil figures, distance, catchments or performance: [ ]

Preview and ChatGPT checks remain pending until a preview is deployed and the connection is refreshed. Do not mark them complete based on local tests.

### Production deployment — 11 October 2026

- Deployed the tested working-directory snapshot using Vercel CLI; no Git commit or push was made.
- Deployment: `dpl_97LdrgyAfa2TmAXtyFkzFsMdyNp3`
- Production endpoint: <https://cardiff-mcp.vercel.app/mcp>
- Production build succeeded; deployment is READY.
- Unauthenticated production MCP client discovered `find_food_businesses`, `find_schools`, `get_food_business`: [x]
- School directory shape, Cardiff scope, source dates and attribution passed: [x]
- Existing live FSA search and detail smoke checks passed: [x]
- Live Cardiff High name search and Welsh-medium secondary search passed: [x]
- ChatGPT discovery and presentation remain for the user's live test: [ ]
- Vercel preview checks above were not performed; this was a direct production deployment.

### Custom production domain — 12 October 2026

- Production endpoint: <https://mcp.wales/mcp>.
- Unauthenticated production MCP smoke client discovered all three default read-only tools: [x]
- School directory invariants and live FSA search/detail checks passed: [x]
- Earlier records retain the deployment URLs used for those checks.
