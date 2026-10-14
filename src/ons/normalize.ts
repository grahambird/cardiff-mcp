import { z } from "zod";
import { DATASETS, ONS_BASE } from "./datasets";
import { type Area, type Topic, OnsError } from "./types";
const option = z.object({ id: z.string(), label: z.string() });
const schema = z.object({
  links: z.object({ version: z.object({ href: z.string() }), dataset_metadata: z.object({ href: z.string() }) }),
  dimensions: z.array(z.object({ dimension_name: z.string(), options: z.array(option) })).length(2),
  observations: z.array(z.number().int().nonnegative()),
  total_observations: z.number().int().nonnegative(),
  blocked_areas: z.number().int().nonnegative(), total_areas: z.number().int().nonnegative(), areas_returned: z.number().int().nonnegative(),
});
export const upstreamAreaType = { local_authority: "ltla", ward: "wd", msoa: "msoa" } as const;
export function normalizeObservations(raw: unknown, areas: Area[], topic: Topic): Map<string, Record<string, number>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new OnsError("malformed", "ONS returned an unexpected census response.");
  const d = parsed.data;
  const expectedVersion = `${ONS_BASE}/datasets/${DATASETS[topic].id}/editions/2021/versions/${DATASETS[topic].version}`;
  if (d.links.version.href !== expectedVersion || d.links.dataset_metadata.href !== `${expectedVersion}/metadata`) throw new OnsError("malformed", "ONS returned unexpected dataset provenance.");
  if (d.blocked_areas || d.total_areas !== areas.length || d.areas_returned !== areas.length) throw new OnsError("unavailable", "ONS did not return all requested areas; no complete comparison or ranking can be provided.");
  const geography = d.dimensions.findIndex(x => x.dimension_name === upstreamAreaType[areas[0].area_type]);
  const category = d.dimensions.findIndex(x => x.dimension_name === DATASETS[topic].dimension);
  if (geography < 0 || category < 0 || geography === category) throw new OnsError("malformed", "ONS returned unexpected dimensions.");
  const areaOptions = d.dimensions[geography].options;
  const categoryOptions = d.dimensions[category].options;
  const sameIds = (actual: string[], expected: string[]) => actual.length === expected.length && new Set(actual).size === actual.length && actual.every(id => expected.includes(id));
  if (!sameIds(areaOptions.map(o => o.id), areas.map(a => a.code)) || !sameIds(categoryOptions.map(o => o.id), DATASETS[topic].categories)) throw new OnsError("malformed", "ONS returned unexpected area or category identifiers.");
  if (d.observations.length !== areaOptions.length * categoryOptions.length || d.total_observations !== d.observations.length) throw new OnsError("malformed", "ONS observation array is incomplete.");
  const result = new Map<string, Record<string, number>>();
  areaOptions.forEach((area, ai) => {
    const values: Record<string, number> = {};
    categoryOptions.forEach((cat, ci) => { values[cat.id] = d.observations[geography === 0 ? ai * categoryOptions.length + ci : ci * areaOptions.length + ai]; });
    result.set(area.id, values);
  });
  return result;
}
