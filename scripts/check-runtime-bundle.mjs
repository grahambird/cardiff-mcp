// Build regression: offline boundary/postcode inputs must not ship with the MCP server.
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const tracePath = resolve(".next/server/app/mcp/route.js.nft.json");
const trace = JSON.parse(readFileSync(tracePath, "utf8"));
const files = [...new Set(trace.files.map(file => resolve(dirname(tracePath), file)))];
const forbidden = files.filter(file => /[/\\]geography[/\\]data[/\\][^/\\]+[/\\](boundaries|postcodes)\.json$/.test(file));
if (forbidden.length) throw new Error("Offline geographic reference files entered the runtime bundle: " + forbidden.join(", "));
const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`MCP server trace: ${bytes.toLocaleString("en-GB")} bytes; offline boundaries/postcodes excluded.`);
