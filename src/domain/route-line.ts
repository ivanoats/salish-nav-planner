import { resolveViaCoordinates } from "./via-resolution";
import type { Coordinates, Location, Waypoint } from "./location";
import type { PlannedRoute } from "./route";

/** [lon, lat] as GeoJSON expects. */
export type LonLat = readonly [number, number];

const toLonLat = (c: Coordinates): LonLat => [c.lon, c.lat];

const sameCoordinates = (a: Coordinates, b: Coordinates): boolean =>
  a.lat === b.lat && a.lon === b.lon;

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
    push(from);
    for (const via of resolveViaCoordinates(leg.via, [...locationsBySlug.values()], waypoints)) {
      push(via);
    }
    push(to);
  }

  return points.map(toLonLat);
};
