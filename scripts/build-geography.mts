/** Offline enrichment. Reads local inputs only; writes a candidate release. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { boundariesIntersect, buildAssociations, locatePoint, validPoint } from "../src/geography/engine.ts";
import type { AssociationSnapshot, Boundary, Postcode } from "../src/geography/types.ts";
import { verifyRelease } from "./verify-geography.mts";

const { values } = parseArgs({ options: {
  references: { type: "string" }, schools: { type: "string" }, fsa: { type: "string" },
  previous: { type: "string" }, candidate: { type: "string" }, full: { type: "boolean", default: false },
} });
if (!values.references || !values.schools || !values.fsa || !values.candidate) throw new Error("Required: --references DIR --schools FILE --fsa FILE --candidate DIR [--previous DIR] [--full]");
const output = resolve(values.candidate);
if (output.startsWith(resolve("src") + "/")) throw new Error("Write a candidate outside src; review before promotion");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const refs = read(join(values.references, "catalogue.json"));
const geometry = read(join(values.references, "boundaries.json")) as { version: string; boundaries: Boundary[] };
const postcodeFile = read(join(values.references, "postcodes.json")) as { version: string; postcodes: Record<string, Postcode> };
if (geometry.version !== refs.reference.version || postcodeFile.version !== geometry.version) throw new Error("Incompatible reference versions");
const timestamp = new Date().toISOString();
const intersections: Record<string, string[]> = {};
for (const ward of geometry.boundaries.filter(b => b.area_type === "ward")) {
  intersections[ward.code] = geometry.boundaries.filter(b => b.area_type !== "ward" && boundariesIntersect(ward, b)).map(b => b.code).sort();
}
for (const postcode of Object.values(postcodeFile.postcodes)) {
  if (!postcode.ward && !postcode.terminated && validPoint(postcode.latitude, postcode.longitude))
    postcode.ward = locatePoint(geometry.boundaries.filter(b => b.area_type === "ward"), postcode.latitude!, postcode.longitude!).ward;
}
const schools = read(values.schools);
const fsa = read(values.fsa);
const numeric = (value: unknown): number | null => typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : typeof value === "number" && Number.isFinite(value) ? value : null;
const schoolRecords = schools.schools.map((s: { school_id: string; address: string; postcode: string }) => ({ id: s.school_id, location: { address: s.address, postcode: s.postcode } }));
const fsaRecords = fsa.records.map((r: Record<string, unknown>) => ({ id: String(r.FHRSID), location: {
  address: [r.AddressLine1, r.AddressLine2, r.AddressLine3, r.AddressLine4].filter(Boolean).join(", "), postcode: typeof r.PostCode === "string" ? r.PostCode : null,
  latitude: numeric((r.Geocode as Record<string, unknown>)?.Latitude), longitude: numeric((r.Geocode as Record<string, unknown>)?.Longitude),
} }));
const results = [];
for (const [source, records, sourcePath, locationSource] of [
  ["schools", schoolRecords, values.schools, schools.source_url],
  ["fsa", fsaRecords, values.fsa, fsa.source_url],
] as const) {
  const previousPath = values.previous && join(values.previous, source + "-associations.json");
  const previous = previousPath && existsSync(previousPath) ? read(previousPath) as AssociationSnapshot : undefined;
  results.push({ source, ...buildAssociations({ source, records, sourceSha256: digest(sourcePath), referenceVersion: geometry.version,
    locationSource, boundaries: geometry.boundaries, postcodes: postcodeFile.postcodes, previous, full: values.full, calculatedAt: timestamp }) });
}
mkdirSync(output, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(join(output, name), JSON.stringify(value) + "\n");
write("catalogue.json", refs); write("boundaries.json", geometry); write("postcodes.json", postcodeFile);
write("spatial-relations.json", { version: geometry.version, intersections });
copyFileSync(values.fsa, join(output, "fsa-source.json"));
for (const result of results) write(result.source + "-associations.json", result.snapshot);
write("report.json", Object.fromEntries(results.map(r => [r.source, r.report])));
const files = ["catalogue.json", "boundaries.json", "postcodes.json", "spatial-relations.json", "fsa-source.json", "schools-associations.json", "fsa-associations.json"];
write("release.json", { reference_version: geometry.version, school_source_sha256: digest(values.schools), files: Object.fromEntries(files.map(f => [f, digest(join(output, f))])) });
verifyRelease(output, values.schools, join(output, "fsa-source.json"));
console.log(JSON.stringify({ candidate: output, reference_version: geometry.version, ...Object.fromEntries(results.map(r => [r.source, r.report])) }, null, 2));
