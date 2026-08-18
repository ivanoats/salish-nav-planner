import { haversineNm } from "./geo";
import type { Coordinates, Location, Waypoint } from "./location";
import type { PlannedRoute } from "./route";
import { normalizeName } from "./slug";

/** [lon, lat] as GeoJSON expects. */
export type LonLat = readonly [number, number];

const toLonLat = (c: Coordinates): LonLat => [c.lon, c.lat];

const sameCoordinates = (a: Coordinates, b: Coordinates): boolean =>
  a.lat === b.lat && a.lon === b.lon;

interface ResolvedDisplayWaypoint {
  readonly anchor: Coordinates;
  readonly display: readonly Coordinates[];
}

const representativePoint = (point: Coordinates): Coordinates => ({ lat: point.lat, lon: point.lon });

const buildWaypointLookup = (
  waypoints: readonly Waypoint[]
): ReadonlyMap<string, Waypoint> => {
  const byName = new Map<string, Waypoint>();

  for (const waypoint of waypoints) {
    byName.set(normalizeName(waypoint.name), waypoint);
    for (const alias of waypoint.aliases ?? []) {
      byName.set(normalizeName(alias), waypoint);
    }
  }

  return byName;
};

const buildLocationLookup = (
  locationsBySlug: ReadonlyMap<string, Location>
): ReadonlyMap<string, Coordinates> => {
  const byName = new Map<string, Coordinates>();

  for (const location of locationsBySlug.values()) {
    byName.set(normalizeName(location.name), representativePoint(location));
  }

  return byName;
};

const resolveDisplayWaypoint = (
  name: string,
  locationsByName: ReadonlyMap<string, Coordinates>,
  waypointsByName: ReadonlyMap<string, Waypoint>
): ResolvedDisplayWaypoint | null => {
  const waypoint = waypointsByName.get(normalizeName(name));
  if (waypoint !== undefined) {
    const anchor = representativePoint(waypoint);
    return {
      anchor,
      display: waypoint.corridor ?? [anchor],
    };
  }

  const location = locationsByName.get(normalizeName(name));
  if (location !== undefined) {
    return { anchor: location, display: [location] };
  }

  return null;
};

const orientCorridor = (
  corridor: readonly Coordinates[],
  previous: Coordinates,
  next: Coordinates
): readonly Coordinates[] => {
  if (corridor.length < 2) return corridor;

  const first = corridor[0];
  const last = corridor[corridor.length - 1];
  if (first === undefined || last === undefined) return corridor;

  const forward = haversineNm(previous, first) + haversineNm(last, next);
  const reverse = haversineNm(previous, last) + haversineNm(first, next);

  return reverse < forward ? [...corridor].reverse() : corridor;
};

/**
 * Turns a planned route into an ordered list of coordinates for drawing
 * a line on the map: each leg's start, any resolved via-waypoints in
 * between, then the leg's end. Consecutive duplicate points (a leg's end
 * equals the next leg's start) are collapsed.
 */
export const buildRouteLineCoordinates = (
  route: PlannedRoute,
  locationsBySlug: ReadonlyMap<string, Location>,
  waypoints: readonly Waypoint[]
): LonLat[] => {
  const points: Coordinates[] = [];
  const locationsByName = buildLocationLookup(locationsBySlug);
  const waypointsByName = buildWaypointLookup(waypoints);

  const push = (point: Coordinates) => {
    const last = points[points.length - 1];
    if (last === undefined || !sameCoordinates(last, point)) {
      points.push(point);
    }
  };

  for (const leg of route.legs) {
    const from = locationsBySlug.get(leg.from);
    const to = locationsBySlug.get(leg.to);
    if (from === undefined || to === undefined) continue;

    const via = leg.via
      .map((name) => resolveDisplayWaypoint(name, locationsByName, waypointsByName))
      .filter((point): point is ResolvedDisplayWaypoint => point !== null);

    push(from);

    for (const [index, waypoint] of via.entries()) {
      const previous = index === 0 ? from : via[index - 1]?.anchor;
      const next = via[index + 1]?.anchor ?? to;
      if (previous === undefined) continue;

      for (const point of orientCorridor(waypoint.display, previous, next)) {
        push(point);
      }
    }

    push(to);
  }

  return points.map(toLonLat);
};
