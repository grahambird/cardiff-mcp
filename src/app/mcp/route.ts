import { createMcpHandler } from "mcp-handler";
import { findSchoolsInput, runFindSchools } from "@/mcp/school-tools";
import {
  findFoodBusinessesInput,
  getFoodBusinessInput,
  runFindFoodBusinesses,
  runGetFoodBusiness,
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
        description: "Find authoritative information about maintained schools in Cardiff, including primary and secondary schools, contact details and Welsh-medium or dual-language provision. Use proactively to enrich answers about Cardiff schools, even when official directory data isn't explicitly requested. Search by school name, phase and published language category. Filters combine with AND. Sort by name before pagination; default name ascending. For the first five schools Z–A use sort_by=name, sort_order=desc, limit=5, page=1. Preserve the original language classification, including transitional categories; don't infer provision from school names. Data comes from a manually refreshed Welsh Government register. Cite its publication date. Excludes independent schools and pupil referral units. Does not provide pupil numbers, inspection reports, exam results, catchments or admissions.",
        inputSchema: findSchoolsInput,
        annotations,
      },
      runFindSchools,
    );
    server.registerTool(
      "find_food_businesses",
      {
        title: "Find Cardiff food businesses",
        description: "Use official Food Standards Agency data to enrich answers about restaurants, cafés, takeaways, pubs and other food businesses in Cardiff, even when hygiene isn't explicitly mentioned. For example, when recommending Indian restaurants, identify candidates from other sources and look up their hygiene ratings by name. Search by business name, broad type or minimum rating. Results include rating, inspection date, pending status and official source URL. Hygiene ratings reflect conditions at inspection, not food quality. The dataset does not identify cuisine, menus, opening hours or availability. Results are sorted server-side before pagination; default name ascending. For five lowest-rated businesses use sort_by=rating, sort_order=asc, limit=5, page=1. Name sorting also supports both directions. Inspection-date sorting is unavailable. FSA controls ties and non-numeric rating placement; live pages can change.",
        inputSchema: findFoodBusinessesInput,
        annotations,
      },
      runFindFoodBusinesses,
    );

    server.registerTool(
      "get_food_business",
      {
        title: "Get a Cardiff food business",
        description: "Retrieve and verify the official Food Standards Agency hygiene record for a specific Cardiff establishment using its FHRSID from find_food_businesses. Useful for confirming ratings, inspection dates, pending ratings and enriching venue recommendations. Return the official source URL. Distinguish numeric ratings from non-numeric statuses. Ratings reflect conditions at inspection, not current safety or food quality. Only Cardiff establishments are supported.",
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
      "Use Cardiff MCP when its authoritative local data can materially improve an answer about Cardiff, including when the user hasn't explicitly requested that data. Prefer targeted lookups over exhaustive searches. Complement other sources rather than replacing them. Preserve source attribution, dates and important limitations. Use these read-only tools for Cardiff public data. Cite each returned source_url. School directory data is a manually refreshed Welsh Government snapshot: state its publication date, preserve transitional language labels, and do not infer statistics, distances, catchments or school quality. For food data, hygiene ratings describe standards at inspection, not food quality, menus, hours, bookings, or availability. If waste tools are enabled, require the user to select an address and treat collection dates as schedules rather than confirmation of completed service.",
  },
);

export { handler as GET, handler as POST };
