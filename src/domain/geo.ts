import type { Coordinates } from "./location";

/** Mean Earth radius in nautical miles. */
const EARTH_RADIUS_NM = 3440.065;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Great-circle distance in nautical miles. */
export const haversineNm = (a: Coordinates, b: Coordinates): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Initial great-circle bearing from `a` to `b`, degrees true in [0, 360). */
export const bearingDegrees = (a: Coordinates, b: Coordinates): number => {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLon = toRadians(b.lon - a.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
};

/**
 * Smallest angle between two compass bearings, in [0, 180]. Direction
 * of the turn doesn't matter here — a course 90° left of the wind is as
 * far off it as one 90° right.
 */
export const angleBetweenDegrees = (a: number, b: number): number => {
  const delta = Math.abs(((a - b) % 360) + 360) % 360;
  return delta > 180 ? 360 - delta : delta;
};

/**
 * Local flat-earth projection about `origin`, in nautical miles. Over
 * the few tens of miles a single route leg spans, the error against a
 * great circle is far smaller than the precision of the underlying
 * distance tables, and it makes the projection-onto-a-segment maths
 * below plain 2D geometry.
 */
const project = (point: Coordinates, origin: Coordinates): readonly [number, number] => {
  const nmPerDegreeLat = 60;
  const nmPerDegreeLon = 60 * Math.cos(toRadians(origin.lat));
  return [(point.lon - origin.lon) * nmPerDegreeLon, (point.lat - origin.lat) * nmPerDegreeLat];
};

export interface PolylineProjection {
  /** Distance from the query point to the closest point on the line. */
  readonly offsetNm: number;
  /** Distance along the line, from its start, to that closest point. */
  readonly alongNm: number;
  /** Index of the segment the closest point falls on, for its heading. */
  readonly segmentIndex: number;
}

/**
 * Where a point falls relative to a polyline: how far off it, and how
 * far along it. Used to place a tidal pass on a day's route — a pass is
 * "on the way" when its offset is small, and the along-track distance is
 * what turns into an ETA.
 *
 * Returns null for a polyline with fewer than two points, which has no
 * geometry to measure against.
 */
export const projectOntoPolyline = (
  point: Coordinates,
  polyline: readonly Coordinates[]
): PolylineProjection | null => {
  if (polyline.length < 2) return null;

  const origin = polyline[0];
  if (origin === undefined) return null;

  const [px, py] = project(point, origin);

  let best: PolylineProjection | null = null;
  let travelled = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const start = polyline[i];
    const end = polyline[i + 1];
    if (start === undefined || end === undefined) continue;

    const [ax, ay] = project(start, origin);
    const [bx, by] = project(end, origin);
    const dx = bx - ax;
    const dy = by - ay;
    const segmentNm = Math.hypot(dx, dy);

    // A zero-length segment still has a well-defined closest point (its
    // own endpoint); skipping the division keeps it from going NaN.
    const t =
      segmentNm === 0
        ? 0
        : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (segmentNm * segmentNm)));

    const offsetNm = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (best === null || offsetNm < best.offsetNm) {
      best = { offsetNm, alongNm: travelled + t * segmentNm, segmentIndex: i };
    }

    travelled += segmentNm;
  }

  return best;
};

/** Total length of a polyline in nautical miles. */
export const polylineLengthNm = (polyline: readonly Coordinates[]): number => {
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const start = polyline[i];
    const end = polyline[i + 1];
    if (start === undefined || end === undefined) continue;
    total += haversineNm(start, end);
  }
  return total;
};
