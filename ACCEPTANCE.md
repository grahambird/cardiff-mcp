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
