import type { Topic } from "./types";
export const DATASETS = {
  population: { id: "TS001", version: 3, dimension: "residence_type", categories: ["1", "2"], population_base: "All usual residents" },
  age: { id: "TS007", version: 3, dimension: "resident_age_101a", categories: Array.from({ length: 101 }, (_, i) => String(i)), population_base: "All usual residents" },
  sex: { id: "TS008", version: 4, dimension: "sex", categories: ["1", "2"], population_base: "All usual residents" },
  welsh_speaking: { id: "TS033", version: 3, dimension: "welsh_skills_speak", categories: ["-8", "0", "1"], population_base: "Usual residents aged 3 years and over" },
} satisfies Record<Topic, { id: string; version: number; dimension: string; categories: string[]; population_base: string }>;
export const ONS_BASE = "https://api.beta.ons.gov.uk/v1";
