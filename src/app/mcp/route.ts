import { createMcpHandler } from "mcp-handler";
import { findSchoolsInput, runFindSchools, schoolToolLimitations } from "@/mcp/school-tools";
import {
  findFoodBusinessesInput,
  getFoodBusinessInput,
  runFindFoodBusinesses,
  runGetFoodBusiness,
  toolLimitations,
} from "@/mcp/tools";
import {
  findWasteCollectionAddressesInput,
  getWasteCollectionsInput,
  runFindWasteCollectionAddresses,
  runGetWasteCollections,
  wasteToolLimitations,
} from "@/mcp/waste-tools";

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
      "find_schools",
      {
        title: "Find Cardiff schools",
        description: `Find Cardiff maintained schools by name, phase and published language group. Filters combine with AND. Returns alphabetical, paginated directory details from the Welsh Government register. ${schoolToolLimitations}`,
        inputSchema: findSchoolsInput,
        annotations,
      },
      runFindSchools,
    );
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

    // Gated until Cardiff Council confirms third-party reuse terms and the
    // upstream flow has been verified from Vercel. Enable only in a preview
    // environment with CARDIFF_WASTE_TOOLS_ENABLED=true.
    if (process.env.CARDIFF_WASTE_TOOLS_ENABLED === "true") {
      server.registerTool(
        "find_waste_collection_addresses",
        {
          title: "Find Cardiff waste collection addresses",
          description: `Find bounded residential address matches for a Cardiff postcode before looking up collections. Always ask the user to select a returned address; never choose one silently. ${wasteToolLimitations}`,
          inputSchema: findWasteCollectionAddressesInput,
          annotations,
        },
        runFindWasteCollectionAddresses,
      );

      server.registerTool(
        "get_waste_collections",
        {
          title: "Get Cardiff waste collections",
          description: `Get the upcoming collection dates published for an explicitly selected Cardiff property UPRN. Use only a property_id returned by the address tool. ${wasteToolLimitations}`,
          inputSchema: getWasteCollectionsInput,
          annotations,
        },
        runGetWasteCollections,
      );
    }
  },
  {
    serverInfo: { name: "cardiff-mcp", version: "0.1.0" },
    instructions:
      "Use these read-only tools for Cardiff public data. Cite each returned source_url. School directory data is a manually refreshed Welsh Government snapshot: state its publication date, preserve transitional language labels, and do not infer statistics, distances, catchments or school quality. For food data, hygiene ratings describe standards at inspection, not food quality, menus, hours, bookings, or availability. If waste tools are enabled, require the user to select an address and treat collection dates as schedules rather than confirmation of completed service.",
  },
);

export { handler as GET, handler as POST };
