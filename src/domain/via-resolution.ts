import { normalizeName } from "./slug";
import type { Coordinates, Location, Waypoint } from "./location";

/**
 * Name-to-position lookup for via notes. Worth building once and reusing
 * when resolving thousands of edges — the graph does exactly that, and
 * rebuilding these maps per edge dominated everything else it does.
 */
export interface CoordinateIndex {
  lookup(name: string): Coordinates | undefined;
}

export const buildCoordinateIndex = (
  locations: readonly Location[],
  waypoints: readonly Waypoint[]
): CoordinateIndex => {
  const byName = new Map<string, Coordinates>();

  // Locations first, so a waypoint of the same name wins — the curated
  // waypoint is the passage itself, the location merely shares its name.
  for (const location of locations) {
    byName.set(normalizeName(location.name), { lat: location.lat, lon: location.lon });
  }
  for (const waypoint of waypoints) {
    const at = { lat: waypoint.lat, lon: waypoint.lon };
    byName.set(normalizeName(waypoint.name), at);
    for (const alias of waypoint.aliases ?? []) byName.set(normalizeName(alias), at);
  }

  return { lookup: (name) => byName.get(normalizeName(name)) };
};

/** As below, against an index you've already built. */
export const resolveViaCoordinatesWith = (
  via: readonly string[],
  index: CoordinateIndex
): Coordinates[] => {
  const resolved: Coordinates[] = [];
  for (const name of via) {
    const match = index.lookup(name);
    if (match !== undefined) resolved.push(match);
  }
  return resolved;
};

/**
 * Best-effort resolution of a leg's `via` names to coordinates, so the
 * map can bend a route line through named passages instead of drawing a
 * single straight segment that might cut across land. Order follows the
 * order the names were listed in, which is usually (not guaranteed)
 * travel order.
 */
export const resolveViaCoordinates = (
  via: readonly string[],
  locations: readonly Location[],
  waypoints: readonly Waypoint[]
): Coordinates[] =>
  resolveViaCoordinatesWith(via, buildCoordinateIndex(locations, waypoints));
