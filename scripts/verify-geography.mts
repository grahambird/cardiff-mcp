/** Offline release gate. Refuse source/reference/association mixtures. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locationFingerprint, MATCHER_VERSION, normalizePostcode, LEVELS } from "../src/geography/engine.ts";
import type { AssociationSnapshot, Location } from "../src/geography/types.ts";

export function verifyRelease(directory = "src/geography/data/W06000015", schoolFile = "src/schools/directory.json", fsaFile = "src/fsa/source.json") {
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const manifest = read(join(directory, "release.json"));
  const required = ["catalogue.json", "boundaries.json", "postcodes.json", "spatial-relations.json", "fsa-source.json", "schools-associations.json", "fsa-associations.json"];
  if (Object.keys(manifest.files).sort().join() !== required.sort().join()) throw new Error("Invalid release manifest files");
  for (const name of required) {
    const path = name === "fsa-source.json" ? fsaFile : join(directory, name);
    if (digest(path) !== manifest.files[name]) throw new Error("Release checksum mismatch: " + name);
  }
  if (digest(schoolFile) !== manifest.school_source_sha256) throw new Error("School source changed without association refresh");
  const catalogue = read(join(directory, "catalogue.json"));
  const areas = new Map<string, { area_type: string }>(catalogue.areas.map((a: { code: string; area_type: string }) => [a.code, a]));
  if (areas.size !== catalogue.areas.length || catalogue.reference.version !== manifest.reference_version) throw new Error("Invalid catalogue/version");
  for (const name of ["boundaries.json", "postcodes.json", "spatial-relations.json"]) {
    if (read(join(directory, name)).version !== manifest.reference_version) throw new Error("Reference version mismatch");
  }
  const schools = read(schoolFile).schools as { school_id: string; address: string; postcode: string }[];
  const fsa = read(fsaFile) as { records: Record<string, unknown>[]; expected_count: number };
  if (fsa.records.length !== fsa.expected_count || !schools.length) throw new Error("Incomplete source snapshot");
  const numeric = (value: unknown) => value !== null && value !== undefined && String(value).trim() && Number.isFinite(Number(value)) ? Number(value) : null;
  const populations: ["schools" | "fsa", { id: string; location: Location }[], string][] = [
    ["schools", schools.map(s => ({ id: s.school_id, location: s })), schoolFile],
    ["fsa", fsa.records.map(r => ({ id: String(r.FHRSID), location: { address: [r.AddressLine1, r.AddressLine2, r.AddressLine3, r.AddressLine4].filter(Boolean).join(", "),
      postcode: r.PostCode as string | undefined, latitude: numeric((r.Geocode as Record<string, unknown>)?.Latitude), longitude: numeric((r.Geocode as Record<string, unknown>)?.Longitude) } })), fsaFile],
  ];
  for (const [source, records, path] of populations) {
    const associations = read(join(directory, source + "-associations.json")) as AssociationSnapshot;
    if (associations.source !== source || associations.reference_version !== manifest.reference_version || associations.source_sha256 !== digest(path) || associations.matcher_version !== MATCHER_VERSION ||
        new Set(records.map(r => r.id)).size !== records.length || Object.keys(associations.associations).length !== records.length) throw new Error("Inconsistent source/association snapshot");
    for (const record of records) {
      const a = associations.associations[record.id];
      if (!a || a.source !== source || a.record_id !== record.id || a.reference_version !== manifest.reference_version || a.matcher_version !== MATCHER_VERSION || a.location_fingerprint !== locationFingerprint(record.location) || !Number.isFinite(Date.parse(a.calculated_at)) || !a.location_source.startsWith("https://")) throw new Error("Stale or invalid association");
      for (const level of LEVELS) {
        const match = a[level];
        if (!match || !["exact", "approximate", "unresolved"].includes(match.accuracy)) throw new Error("Invalid accuracy");
        if (match.code ? areas.get(match.code)?.area_type !== level || match.accuracy === "unresolved" : match.accuracy !== "unresolved" || !match.reason) throw new Error("Invalid geographical association");
        if (match.accuracy === "exact" && match.method !== "coordinates" || match.accuracy === "approximate" && match.method !== "postcode") throw new Error("Invalid matching method");
      }
    }
  }
  const postcodes = read(join(directory, "postcodes.json")).postcodes;
  for (const [key, record] of Object.entries(postcodes) as [string, { postcode: string; lsoa_code: string | null; msoa_code: string | null }][]) {
    if (normalizePostcode(key) !== key || record.postcode !== key || record.lsoa_code && catalogue.hierarchy[record.lsoa_code] !== record.msoa_code) throw new Error("Invalid postcode reference");
  }
  return { schools: schools.length, establishments: fsa.records.length, areas: areas.size, reference_version: manifest.reference_version };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(verifyRelease(process.argv[2], process.argv[3], process.argv[4])));
