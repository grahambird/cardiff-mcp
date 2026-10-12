# MCP Wales identity migration

The package, public page, documentation, advertised MCP server name and outgoing client labels now use MCP Wales / `mcp-wales`. Cardiff remains the only supported area. Tools, schemas, data, environment variables, caching, logging, rate limiting and the waste release gate are unchanged.

## GitHub and Vercel completion

On 12 October 2026, the owner confirmed that the existing GitHub repository was renamed to `grahambird/mcp-wales`, its description was updated to “An open-source MCP server for trusted local and public data in Wales, starting with Cardiff.” and its homepage was set to `https://mcp.wales`. The local fetch and push remote now use `https://github.com/grahambird/mcp-wales.git`.

The owner also confirmed that Vercel's Git integration picked up the renamed repository and the existing Vercel project was renamed to `mcp-wales`. No replacement project was created. The ignored local `.vercel/project.json` has not been relinked: its project and organisation IDs preserve the link, though its cached project name may still read `cardiff-mcp`.

No checked-in deployment configuration or CI workflow depends on the old repository slug; the daily production canary already uses `https://mcp.wales`. Preserve existing domains, environment variables and firewall rules. After deploying the migration, verify `https://mcp.wales` and run:

```bash
npm run smoke:client -- https://mcp.wales
```

GitHub documents redirects for repository links and Git operations following a rename. Avoid creating another repository at the old name, which would override those redirects. See <https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository>. Vercel Git integration reference: <https://vercel.com/docs/git/vercel-for-github>.

## Client compatibility

The endpoint remains `https://mcp.wales/mcp`. The four default tool names, schemas and descriptions are unchanged. Initialization now advertises `serverInfo.name = "mcp-wales"`; only the brand text in instructions changes. MCP exchanges implementation information separately from protocol version and capabilities: <https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle>.

The SDK client successfully initializes and invokes all four tools against the renamed local production build. A client that explicitly pins the old server name may need its configuration updated. Existing ChatGPT connections may retain their user-entered Cardiff MCP label or cached metadata; rename that label and refresh the connection after deployment if needed. Signed-in ChatGPT acceptance was not performed.

## Retained old references

- `ACCEPTANCE.md` retains the old repository URL and Vercel endpoints as dated historical evidence, not current setup instructions.
- `.vercel/project.json` retains the cached old Vercel project name and existing IDs to preserve the deployment link.
- The local checkout directory remains `cardiff-mcp`; the Git remote has been updated. The local directory does not affect package identity or deployment; it can be renamed separately after closing apps using it and updating their saved project paths.
- This migration record uses the old name when describing the transition.
- `CARDIFF_WASTE_*` environment variables and Cardiff dataset identifiers remain unchanged because they are geographic and compatibility identifiers.

## Validation — 12 October 2026

- Lint, type-check, all 85 tests in 12 files, and production build passed.
- Initialization contract test asserts the new advertised name and unchanged version.
- Renamed local production build smoke test passed on port 3107; port 3000 was already occupied, so that server was left alone.
- Existing public `https://mcp.wales/mcp` passed all four-tool discovery, school/profile and live FSA search/detail smoke checks.
- Both `https://mcp.wales` and the legacy Vercel information page returned HTTP 200 from Vercel.
- These public checks validate the existing deployment; deployment of the rename is verified separately after pushing.
