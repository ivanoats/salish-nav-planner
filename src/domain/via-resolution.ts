import { normalizeName } from "./slug";
import type { Coordinates, Location, Waypoint } from "./location";

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
): Coordinates[] => {
  const locationsByName = new Map(
    locations.map((location) => [normalizeName(location.name), location] as const)
  );
  const waypointsByName = new Map<string, Waypoint>();
  for (const waypoint of waypoints) {
    waypointsByName.set(normalizeName(waypoint.name), waypoint);
    for (const alias of waypoint.aliases ?? []) {
      waypointsByName.set(normalizeName(alias), waypoint);
    }
  }

  const resolved: Coordinates[] = [];
  for (const name of via) {
    const key = normalizeName(name);
    const match = waypointsByName.get(key) ?? locationsByName.get(key);
    if (match !== undefined) {
      resolved.push({ lat: match.lat, lon: match.lon });
    }
  }
  return resolved;
};
