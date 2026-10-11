import { createMcpHandler } from "mcp-handler";
import {
  findFoodBusinessesInput,
  getFoodBusinessInput,
  runFindFoodBusinesses,
  runGetFoodBusiness,
  toolLimitations,
} from "@/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 30;

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
} as const;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "find_food_businesses",
      {
        title: "Find Cardiff food businesses",
        description: `Search live Food Standards Agency hygiene-rating data within Cardiff by name, broad FSA business type, and minimum numeric hygiene rating. Results are bounded and paginated. ${toolLimitations}`,
        inputSchema: findFoodBusinessesInput,
        annotations,
      },
      runFindFoodBusinesses,
    );

    server.registerTool(
      "get_food_business",
      {
        title: "Get a Cardiff food business",
        description: `Retrieve current Food Standards Agency hygiene-rating details for one Cardiff establishment using its FHRSID. Rejects establishments outside Cardiff. ${toolLimitations}`,
        inputSchema: getFoodBusinessInput,
        annotations,
      },
      runGetFoodBusiness,
    );
  },
  {
    serverInfo: { name: "cardiff-mcp", version: "0.1.0" },
    instructions:
      "Use these read-only tools for current Food Standards Agency hygiene ratings in Cardiff. Cite each returned source_url. Hygiene ratings describe standards at inspection, not food quality, menus, hours, bookings, or availability.",
  },
);

export { handler as GET, handler as POST };
