import { bearingDegrees, polylineLengthNm, projectOntoPolyline } from "./geo";
import { buildDisplayedRouteLineCoordinates, type LonLat } from "./route-line";
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
 * way. Proximity is a hint for an unnamed pass on either mesh or
 * approximate geometry.
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

/** The route table can name a pass by an alias. */
export const isNamedPass = (pass: TidalPass, via: readonly string[]): boolean => {
  const names = [pass.name, ...(pass.aliases ?? [])].map(normalizeName);
  return via.some((name) => names.includes(normalizeName(name)));
};

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
 * Projects passes onto each displayed leg. Scale the leg's track to its
 * published mileage so earlier legs contribute their full planned distance.
 */
export const passTransitsForDay = ({
  route,
  locationsBySlug,
  waypoints,
  passes,
  departureMinutes,
  speedKnots,
}: PassTransitsInput): PassTransit[] => {
  if (speedKnots <= 0) return [];

  const transits = new Map<string, PassTransit>();
  let completedNm = 0;

  for (const leg of route.legs) {
    const coordinates: readonly LonLat[] = leg.track?.coordinates ??
      buildDisplayedRouteLineCoordinates(
        { legs: [leg], totalNm: leg.nm, totalHrMin: leg.hrMin }, locationsBySlug, waypoints
      );
    const polyline = coordinates.map(toCoordinates);
    const drawnNm = polylineLengthNm(polyline);

    for (const pass of passes) {
      const projection = projectOntoPolyline(pass, polyline);
      if (projection === null || drawnNm === 0) continue;

      const named = isNamedPass(pass, leg.via) && projection.offsetNm <= NAMED_PASS_MAX_OFFSET_NM;
      if (!named && projection.offsetNm > PASS_PROXIMITY_NM) continue;

      const previous = transits.get(pass.id);
      const detection = named ? "named" : "nearby";
      if (previous?.detection === "named" && !named) continue;
      if (previous?.detection === detection && previous.offRouteNm <= projection.offsetNm) continue;

      const start = polyline[projection.segmentIndex];
      const end = polyline[projection.segmentIndex + 1];
      if (start === undefined || end === undefined) continue;

      const alongRouteNm = completedNm + Math.min(1, projection.alongNm / drawnNm) * leg.nm;
      transits.set(pass.id, {
        pass,
        detection,
        alongRouteNm,
        offRouteNm: projection.offsetNm,
        courseDegrees: bearingDegrees(start, end),
        etaMinutes: departureMinutes + (alongRouteNm / speedKnots) * 60,
      });
    }

    completedNm += leg.nm;
  }

  return [...transits.values()].sort((a, b) => a.alongRouteNm - b.alongRouteNm);
};
