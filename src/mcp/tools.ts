import { z } from "zod";
import { findFoodBusinesses, FsaError, getFoodBusiness } from "@/fsa/client";
import { BUSINESS_TYPES } from "@/fsa/types";

export const findFoodBusinessesInput = z.object({
  name: z.string().trim().min(1).max(100).optional().describe("Terms to search within the business name."),
  business_type: z.enum(Object.keys(BUSINESS_TYPES) as [keyof typeof BUSINESS_TYPES, ...(keyof typeof BUSINESS_TYPES)[]]).optional(),
  minimum_rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  page: z.number().int().min(1).max(10).default(1),
  limit: z.number().int().min(1).max(20).default(10),
});

export const getFoodBusinessInput = z.object({
  establishment_id: z.number().int().positive().describe("The FSA FHRSID for a food establishment."),
});

const LIMITATIONS =
  "Ratings reflect hygiene standards found on the inspection date, not food quality. FSA data does not include menus, opening hours, bookings, or availability. Non-numeric and pending ratings must not be treated as numeric ratings.";

function success(value: unknown) {
  return {
    content: [{ type: "text" as const, text: `${JSON.stringify(value, null, 2)}\n\n${LIMITATIONS}` }],
    structuredContent: { result: value },
  };
}

function failure(error: unknown) {
  const fsaError = error instanceof FsaError ? error : new FsaError("upstream", "An unexpected error occurred while reading FSA data.");
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: fsaError.code, message: fsaError.message }) }],
    structuredContent: { error: fsaError.code, message: fsaError.message },
  };
}

export async function runFindFoodBusinesses(input: z.infer<typeof findFoodBusinessesInput>) {
  try {
    return success(await findFoodBusinesses(findFoodBusinessesInput.parse(input)));
  } catch (error) {
    return failure(error);
  }
}

export async function runGetFoodBusiness(input: z.infer<typeof getFoodBusinessInput>) {
  try {
    const parsed = getFoodBusinessInput.parse(input);
    return success(await getFoodBusiness(parsed.establishment_id));
  } catch (error) {
    return failure(error);
  }
}

export const toolLimitations = LIMITATIONS;
