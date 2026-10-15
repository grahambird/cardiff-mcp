import { createHash } from "node:crypto";
import type { AssociationSnapshot, Boundary, Geometry, Level, Location, Match, Matches, Position, Postcode } from "./types.ts";

export const MATCHER_VERSION = "1";
export const LEVELS: Level[] = ["ward", "lsoa", "msoa"];
export function normalizePostcode(value: string): string | null {
  const compact = value.toUpperCase().replace(/\s/g, "");
  return /^(?:GIR0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-HJKPSTUW\d]?\d[ABD-HJLNP-UW-Z]{2})$/.test(compact)
    ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : null;
}
export function validPoint(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}
export function locationFingerprint(location: Location): string {
  const text = (value?: string | null) => value?.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase() ?? "";
  return createHash("sha256").update(JSON.stringify([
    text(location.address), text(location.postcode).replace(/\s/g, ""),
    location.latitude ?? null, location.longitude ?? null,
  ])).digest("hex");
}
export const unresolved = (reason: string, candidates?: string[]): Match => ({ code: null, method: "none", accuracy: "unresolved", reason, ...(candidates?.length ? { candidates } : {}) });
export const unresolvedMatches = (reason: string): Matches => ({ ward: unresolved(reason), lsoa: unresolved(reason), msoa: unresolved(reason) });

// Three-state ray casting: boundary points are never arbitrarily assigned.
function ringContains([x, y]: Position, ring: Position[]): "inside" | "outside" | "edge" {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay;
    const length = Math.hypot(dx, dy);
    // Tolerance is numerical only (approximately a millimetre), not a location accuracy claim.
    if (length > 0 && Math.abs((x - ax) * dy - (y - ay) * dx) / length <= 1e-8 &&
        x >= Math.min(ax, bx) - 1e-8 && x <= Math.max(ax, bx) + 1e-8 && y >= Math.min(ay, by) - 1e-8 && y <= Math.max(ay, by) + 1e-8) return "edge";
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? "inside" : "outside";
}
export function geometryContains(point: Position, geometry: Geometry): "inside" | "outside" | "edge" {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let inside = false;
  for (const polygon of polygons) {
    const outer = ringContains(point, polygon[0]);
    if (outer === "edge") return "edge";
    if (outer === "outside") continue;
    let hole = false;
    for (const ring of polygon.slice(1)) {
      const result = ringContains(point, ring);
      if (result === "edge") return "edge";
      if (result === "inside") hole = true;
    }
    if (!hole) inside = true;
  }
  return inside ? "inside" : "outside";
}
/** Positive-area intersection, not just two polygons touching at an edge. */
export function boundariesIntersect(a: Boundary, b: Boundary): boolean {
  if (a.bbox[0] >= b.bbox[2] || a.bbox[2] <= b.bbox[0] || a.bbox[1] >= b.bbox[3] || a.bbox[3] <= b.bbox[1]) return false;
  const rings = (g: Geometry): Position[][] => g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  const ar = rings(a.geometry), br = rings(b.geometry);
  // Mid-edge interior probes also handle aligned overlapping and coincident edges.
  // Validate against both polygons so an edge-only contact never becomes membership.
  for (const [ownRings, own, other] of [[ar, a, b], [br, b, a]] as const) {
    for (const ring of ownRings) for (let i = 1; i < ring.length; i++) {
      const [x, y] = ring[i - 1], [u, v] = ring[i];
      const length = Math.hypot(u - x, v - y);
      if (!length) continue;
      const mx = (x + u) / 2, my = (y + v) / 2;
      if (mx < other.bbox[0] - 1e-7 || mx > other.bbox[2] + 1e-7 || my < other.bbox[1] - 1e-7 || my > other.bbox[3] + 1e-7) continue;
      for (const side of [-1, 0, 1]) {
        const point: Position = [mx + side * (v - y) / length * 1e-7, my - side * (u - x) / length * 1e-7];
        if (geometryContains(point, own.geometry) === "inside" && geometryContains(point, other.geometry) === "inside") return true;
      }
    }
  }
  for (const [outer, other] of [[ar, b], [br, a]] as const) {
    for (const ring of outer) for (const point of ring) {
      if (point[0] > other.bbox[0] && point[0] < other.bbox[2] && point[1] > other.bbox[1] && point[1] < other.bbox[3] && geometryContains(point, other.geometry) === "inside") return true;
    }
  }
  const cross = (p: Position, q: Position, r: Position) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  for (const ringA of ar) for (let i = 1; i < ringA.length; i++) {
    const p = ringA[i - 1], q = ringA[i];
    for (const ringB of br) for (let j = 1; j < ringB.length; j++) {
      const r = ringB[j - 1], s = ringB[j];
      if (Math.max(p[0], q[0]) < Math.min(r[0], s[0]) || Math.min(p[0], q[0]) > Math.max(r[0], s[0]) || Math.max(p[1], q[1]) < Math.min(r[1], s[1]) || Math.min(p[1], q[1]) > Math.max(r[1], s[1])) continue;
      if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true;
    }
  }
  // Coincident polygons have no strictly interior vertices or crossing edges.
  return JSON.stringify(a.geometry) === JSON.stringify(b.geometry);
}
export function locatePoint(boundaries: Boundary[], latitude: number, longitude: number): Matches {
  if (!validPoint(latitude, longitude)) return unresolvedMatches("invalid_coordinates");
  const matches = unresolvedMatches("outside_coverage_or_boundary_gap");
  for (const level of LEVELS) {
    const inside: string[] = [], edges: string[] = [];
    for (const boundary of boundaries) {
      if (boundary.area_type !== level) continue;
      const [xmin, ymin, xmax, ymax] = boundary.bbox;
      if (longitude < xmin - 1e-8 || longitude > xmax + 1e-8 || latitude < ymin - 1e-8 || latitude > ymax + 1e-8) continue;
      const result = geometryContains([longitude, latitude], boundary.geometry);
      if (result === "inside") inside.push(boundary.code);
      if (result === "edge") edges.push(boundary.code);
    }
    matches[level] = edges.length ? unresolved("boundary_edge", [...new Set([...inside, ...edges])].sort()) : inside.length > 1
      ? unresolved("overlapping_boundaries", inside.sort()) : inside.length === 1
        ? { code: inside[0], method: "coordinates", accuracy: "exact" } : matches[level];
  }
  return matches;
}
export function lookupPostcode(postcodes: Record<string, Postcode>, input?: string | null): { record?: Postcode; reason?: string } {
  if (!input?.trim()) return { reason: "missing_postcode" };
  const normalized = normalizePostcode(input);
  if (!normalized) return { reason: "invalid_postcode" };
  const record = postcodes[normalized];
  if (!record) return { reason: "unsupported_postcode" };
  if (record.terminated) return { record, reason: "terminated_postcode" };
  if (![1, 2, 3].includes(record.quality)) return { record, reason: "unreliable_postcode_location" };
  return { record };
}
export function matchLocation(boundaries: Boundary[], postcodes: Record<string, Postcode>, location: Location): Matches {
  if (validPoint(location.latitude, location.longitude)) return locatePoint(boundaries, location.latitude, location.longitude!);
  const lookup = lookupPostcode(postcodes, location.postcode);
  if (lookup.reason || !lookup.record) return unresolvedMatches(lookup.reason ?? "missing_location");
  const record = lookup.record;
  const point = record.ward ? null : validPoint(record.latitude, record.longitude) ? locatePoint(boundaries, record.latitude!, record.longitude!) : null;
  const ward = record.ward ?? point?.ward ?? unresolved("missing_postcode_coordinates");
  const approximate = (code: string | null): Match => code ? { code, method: "postcode", accuracy: "approximate" } : unresolved("missing_postcode_geography");
  return { ward: ward.code ? approximate(ward.code) : ward, lsoa: approximate(record.lsoa_code), msoa: approximate(record.msoa_code) };
}
export function buildAssociations(input: {
  source: "schools" | "fsa"; records: { id: string; location: Location }[]; sourceSha256: string;
  referenceVersion: string; locationSource: string; boundaries: Boundary[]; postcodes: Record<string, Postcode>;
  previous?: AssociationSnapshot; full?: boolean; calculatedAt: string;
}) {
  const snapshot: AssociationSnapshot = { source: input.source, source_sha256: input.sourceSha256, reference_version: input.referenceVersion, matcher_version: MATCHER_VERSION, associations: {} };
  let recalculated = 0, reused = 0;
  for (const record of input.records) {
    if (!record.id || Object.hasOwn(snapshot.associations, record.id)) throw new Error("Missing or duplicate source identifier");
    const fingerprint = locationFingerprint(record.location);
    const existing = input.previous?.associations[record.id];
    if (!input.full && existing?.source === input.source && existing.location_fingerprint === fingerprint && existing.reference_version === input.referenceVersion && existing.matcher_version === MATCHER_VERSION) {
      snapshot.associations[record.id] = existing; reused++;
    } else {
      snapshot.associations[record.id] = { source: input.source, record_id: record.id, location_fingerprint: fingerprint,
        reference_version: input.referenceVersion, matcher_version: MATCHER_VERSION, calculated_at: input.calculatedAt,
        location_source: input.locationSource, ...matchLocation(input.boundaries, input.postcodes, record.location) };
      recalculated++;
    }
  }
  return { snapshot, report: { recalculated, reused, removed: Object.keys(input.previous?.associations ?? {}).filter(id => !Object.hasOwn(snapshot.associations, id)), unresolved: Object.values(snapshot.associations).filter(a => !a.ward.code).length } };
}
