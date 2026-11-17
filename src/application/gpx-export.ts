import type { LonLat } from "@/domain/route-line";
import type { TripDay } from "@/domain/trip";

export const GPX_DESCRIPTION = "Passage-planning aid. Verify the route against current charts and conditions.";

interface GpxPoint {
  readonly coordinates: LonLat;
  readonly name?: string;
}

export interface GpxRoute {
  readonly name: string;
  readonly points: readonly GpxPoint[];
}

export type GpxExport =
  | { readonly status: "ready"; readonly routes: readonly GpxRoute[] }
  | { readonly status: "unavailable"; readonly reason: string };

export type RouteGeometryStatus = "loading" | "ready" | "unavailable";

type PlaceNames = ReadonlyMap<string, { readonly name: string }>;

const chooseStops = "Choose a start and destination to download GPX.";
const discontinuous = "Route geometry is discontinuous.";

const samePoint = (a: LonLat, b: LonLat): boolean => a[0] === b[0] && a[1] === b[1];

const validPoint = ([lon, lat]: LonLat): boolean =>
  Number.isFinite(lon) && lon >= -180 && lon < 180 &&
  Number.isFinite(lat) && lat >= -90 && lat <= 90;

function validTrack(coordinates: readonly LonLat[]): boolean {
  const first = coordinates[0];
  return first !== undefined && coordinates.every(validPoint) &&
    coordinates.some((point) => !samePoint(first, point));
}

function buildDayRoute(
  day: TripDay,
  places: PlaceNames,
  geometry: RouteGeometryStatus
): GpxRoute | string {
  if (day.toSlug === null) return day.dayNumber === 1 ? chooseStops : "No destination could be planned.";
  if (day.route === null) return "Destination is unreachable.";
  if (day.route.legs.length === 0) return "Route geometry is missing.";
  if (geometry === "loading") return "Route geometry is loading.";
  if (geometry === "unavailable") return "Route geometry could not be loaded.";

  const from = places.get(day.fromSlug);
  const to = places.get(day.toSlug);
  if (from === undefined || to === undefined) return "A stop name is missing.";

  let expectedFrom = day.fromSlug;
  const points: GpxPoint[] = [];
  for (const { from: legFrom, to: legTo, track } of day.route.legs) {
    if (track === undefined) return "Route geometry is missing.";
    if (track.source === "approximate") return "Route geometry is approximate.";
    const { coordinates } = track;
    const first = coordinates[0];
    const last = coordinates.at(-1);
    if (first === undefined || last === undefined || !validTrack(coordinates)) {
      return "Route geometry is invalid.";
    }

    const previous = points.at(-1);
    if (legFrom !== expectedFrom || (previous !== undefined && !samePoint(previous.coordinates, first))) {
      return discontinuous;
    }

    const stop = places.get(legTo);
    if (stop === undefined) return "A stop name is missing.";
    if (previous === undefined) points.push({ coordinates: first, name: from.name });
    for (const point of coordinates.slice(1, -1)) points.push({ coordinates: point });
    points.push({ coordinates: last, name: stop.name });
    expectedFrom = legTo;
  }

  if (expectedFrom !== day.toSlug) return discontinuous;
  return { name: `Day ${day.dayNumber}: ${from.name} → ${to.name}`, points };
}

/** Uses the displayed itinerary's resolved tracks and fails the export as a whole. */
export function buildGpxExport(
  days: readonly TripDay[],
  places: PlaceNames,
  geometry: RouteGeometryStatus
): GpxExport {
  if (days.length === 0) return { status: "unavailable", reason: chooseStops };

  const routes: GpxRoute[] = [];
  for (const [index, day] of days.entries()) {
    const route = buildDayRoute(day, places, geometry);
    if (typeof route === "string") {
      return { status: "unavailable", reason: `Day ${day.dayNumber}: ${route}` };
    }

    const previousDay = days[index - 1];
    const previousEnd = routes.at(-1)?.points.at(-1);
    const start = route.points[0];
    const startsAtPreviousStop = previousDay === undefined ||
      (day.fromSlug === previousDay.toSlug && previousEnd !== undefined && start !== undefined &&
        samePoint(previousEnd.coordinates, start.coordinates));
    if (!startsAtPreviousStop || day.dayNumber !== index + 1) {
      return { status: "unavailable", reason: `Day ${day.dayNumber}: ${discontinuous}` };
    }
    routes.push(route);
  }
  return { status: "ready", routes };
}
