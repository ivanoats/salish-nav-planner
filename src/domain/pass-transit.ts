import { bearingDegrees, polylineLengthNm, projectOntoPolyline } from "./geo";
import { buildRouteLineCoordinates } from "./route-line";
import { normalizeName } from "./slug";
import type { Coordinates, Location, Waypoint } from "./location";
import type { TidalPass } from "./pass";
import type { PlannedRoute } from "./route";

/**
 * How a pass came to be on a day's list.
 *
 * "named" means the scraped route table said so — nwcruising.net lists
 * Deception Pass on 147 of its routes — which is as authoritative as this
 * dataset gets. "nearby" means the drawn track runs close by, which
 * catches passes the tables left implicit but is only a geometric guess,
 * so the UI marks the two differently rather than pretending to equal
 * confidence.
 */
export type PassDetection = "named" | "nearby";

export interface PassTransit {
  readonly pass: TidalPass;
  readonly detection: PassDetection;
  /** Distance from the day's departure to the pass, in nautical miles. */
  readonly alongRouteNm: number;
  /** How far the pass sits off the drawn track. */
  readonly offRouteNm: number;
  /** Heading through the pass, degrees true. */
  readonly courseDegrees: number;
  /** Minutes past midnight of the day's date; may exceed 1440. */
  readonly etaMinutes: number;
}

/**
 * How close the track has to run before an unnamed pass counts as on the
 * way. The route line is drawn straight between stops and via-points, so
 * it only approximates the water actually covered — tight enough to
 * exclude the next channel over, loose enough to survive that slop.
 */
export const PASS_PROXIMITY_NM = 3;

/**
 * How far a *named* pass may sit off the track before the name is
 * treated as a different place of the same name.
 *
 * Channel names repeat around the Salish Sea — there is a Hale Passage in
 * the south Sound and another by Lummi Island, a hundred miles apart — so
 * a name alone can't identify a pass. The bound is generous, because the
 * route table naming a pass is strong evidence and the drawn track is
 * crude, but it's far tighter than the distance between two namesakes.
 */
export const NAMED_PASS_MAX_OFFSET_NM = 20;

const toCoordinates = (lonLat: readonly [number, number]): Coordinates => ({
  lon: lonLat[0],
  lat: lonLat[1],
});

/** Every via name on the route, normalized for comparison. */
const namedPlacesOn = (route: PlannedRoute): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const leg of route.legs) {
    for (const via of leg.via) names.add(normalizeName(via));
  }
  return names;
};

const isNamedOn = (pass: TidalPass, named: ReadonlySet<string>): boolean =>
  named.has(normalizeName(pass.name)) ||
  (pass.aliases ?? []).some((alias) => named.has(normalizeName(alias)));

export interface PassTransitsInput {
  readonly route: PlannedRoute;
  readonly locationsBySlug: ReadonlyMap<string, Location>;
  readonly waypoints: readonly Waypoint[];
  readonly passes: readonly TidalPass[];
  /** Minutes past local midnight the day gets underway. */
  readonly departureMinutes: number;
  readonly speedKnots: number;
}

/**
 * The tidal passes a day's route goes through, in the order they're met,
 * each with an estimated time of arrival.
 *
 * The ETA is what makes this useful rather than decorative — knowing
 * Deception Pass turns at 12:37 means nothing until you know you'll get
 * there at 11:20. Distance to each pass comes from projecting it onto the
 * drawn track, then rescaling so the track's total matches the route's
 * published mileage: the line is a rough polyline, but stretching it to
 * the real distance keeps the ETA honest at the scale that matters.
 */
export const passTransitsForDay = ({
  route,
  locationsBySlug,
  waypoints,
  passes,
  departureMinutes,
  speedKnots,
}: PassTransitsInput): PassTransit[] => {
  if (route.legs.length === 0 || speedKnots <= 0) return [];

  const polyline = buildRouteLineCoordinates(route, locationsBySlug, waypoints).map(toCoordinates);
  if (polyline.length < 2) return [];

  const drawnNm = polylineLengthNm(polyline);
  const scale = drawnNm > 0 ? route.totalNm / drawnNm : 1;
  const named = namedPlacesOn(route);

  const transits: PassTransit[] = [];

  for (const pass of passes) {
    const projection = projectOntoPolyline(pass, polyline);
    if (projection === null) continue;

    const wasNamed = isNamedOn(pass, named) && projection.offsetNm <= NAMED_PASS_MAX_OFFSET_NM;
    if (!wasNamed && projection.offsetNm > PASS_PROXIMITY_NM) continue;

    const start = polyline[projection.segmentIndex];
    const end = polyline[projection.segmentIndex + 1];
    if (start === undefined || end === undefined) continue;

    const alongRouteNm = projection.alongNm * scale;

    transits.push({
      pass,
      detection: wasNamed ? "named" : "nearby",
      alongRouteNm,
      offRouteNm: projection.offsetNm,
      courseDegrees: bearingDegrees(start, end),
      etaMinutes: departureMinutes + (alongRouteNm / speedKnots) * 60,
    });
  }

  return transits.sort((a, b) => a.alongRouteNm - b.alongRouteNm);
};
