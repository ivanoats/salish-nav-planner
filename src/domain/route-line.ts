import { haversineNm } from "./geo";
import type { Coordinates, Location, Waypoint } from "./location";
import type { PlannedRoute } from "./route";
import { normalizeName } from "./slug";
import { buildCoordinateIndex } from "./via-resolution";

/** [lon, lat] as GeoJSON expects. */
export type LonLat = readonly [number, number];

const toLonLat = (c: Coordinates): LonLat => [c.lon, c.lat];

const sameCoordinates = (a: Coordinates, b: Coordinates): boolean =>
  a.lat === b.lat && a.lon === b.lon;

interface ResolvedDisplayWaypoint {
  readonly anchor: Coordinates;
  readonly display: readonly Coordinates[];
}

const buildCorridorLookup = (
  waypoints: readonly Waypoint[]
): ReadonlyMap<string, readonly Coordinates[]> => {
  const byName = new Map<string, readonly Coordinates[]>();

  for (const waypoint of waypoints) {
    const display = waypoint.corridor ?? [{ lat: waypoint.lat, lon: waypoint.lon }];
    byName.set(normalizeName(waypoint.name), display);
    for (const alias of waypoint.aliases ?? []) {
      byName.set(normalizeName(alias), display);
    }
  }

  return byName;
};

const resolveDisplayWaypoint = (
  normalizedName: string,
  lookup: ReturnType<typeof buildCoordinateIndex>,
  corridorsByName: ReadonlyMap<string, readonly Coordinates[]>,
  useCorridors: boolean
): ResolvedDisplayWaypoint | null => {
  const anchor = lookup.lookup(normalizedName);
  if (anchor === undefined) return null;
  return {
    anchor,
    display: useCorridors ? (corridorsByName.get(normalizedName) ?? [anchor]) : [anchor],
  };
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
const buildRouteLinePoints = (
  route: PlannedRoute,
  locationsBySlug: ReadonlyMap<string, Location>,
  waypoints: readonly Waypoint[],
  useCorridors: boolean
): Coordinates[] => {
  const points: Coordinates[] = [];
  const lookup = buildCoordinateIndex([...locationsBySlug.values()], waypoints);
  const corridorsByName = buildCorridorLookup(waypoints);

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
      .map((name) =>
        resolveDisplayWaypoint(normalizeName(name), lookup, corridorsByName, useCorridors)
      )
      .filter((point): point is ResolvedDisplayWaypoint => point !== null);

    push(from);
    let previous: Coordinates = from;

    for (const [index, waypoint] of via.entries()) {
      const next = via[index + 1]?.anchor ?? to;
      const display = orientCorridor(waypoint.display, previous, next);

      for (const point of display) {
        push(point);
      }

      const last = display[display.length - 1];
      if (last === undefined) continue;
      previous = last;
    }

    push(to);
  }

  return points;
};

/**
 * Turns a planned route into its anchor-only polyline: each leg's start,
 * any resolved via-waypoints, then the leg's end. Consecutive duplicate
 * points (a leg's end equals the next leg's start) are collapsed.
 */
export const buildRouteLineCoordinates = (
  route: PlannedRoute,
  locationsBySlug: ReadonlyMap<string, Location>,
  waypoints: readonly Waypoint[]
): LonLat[] => buildRouteLinePoints(route, locationsBySlug, waypoints, false).map(toLonLat);

/**
 * Turns a planned route into its display polyline, expanding curated
 * waypoint corridors where available.
 */
export const buildDisplayedRouteLineCoordinates = (
  route: PlannedRoute,
  locationsBySlug: ReadonlyMap<string, Location>,
  waypoints: readonly Waypoint[]
): LonLat[] => buildRouteLinePoints(route, locationsBySlug, waypoints, true).map(toLonLat);
