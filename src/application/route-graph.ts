import { minutesToHrMin, hrMinToMinutes } from "@/domain/hr-min";
import { bearingDegrees, haversineNm, projectOntoPolyline } from "@/domain/geo";
import { airDraftFor, type Obstruction } from "@/domain/obstruction";
import { normalizeName } from "@/domain/slug";
import { buildCoordinateIndex, resolveViaCoordinatesWith } from "@/domain/via-resolution";
import { windPenaltyNm, type Wind } from "@/domain/wind";
import type { Coordinates, Location, Waypoint } from "@/domain/location";
import type { PlannedRoute, RouteEdge, RouteLeg } from "@/domain/route";
import type { DayLengthRange } from "@/domain/trip";

interface AdjacencyEdge {
  readonly to: string;
  readonly nm: number;
  readonly hrMin: string;
  readonly via: readonly string[];
  /** Ids of every obstruction this hop passes under, fixed or opening. */
  readonly obstructionIds: readonly string[];
  /**
   * The lowest *fixed* span on the hop, or Infinity where there is none.
   * Precomputed because it decides passability for every air draft, so
   * changing the mast height re-filters rather than re-measuring.
   */
  readonly lowestFixedClearanceFeet: number;
}

export interface RouteGraph {
  readonly adjacency: ReadonlyMap<string, readonly AdjacencyEdge[]>;
  readonly obstructionsById: ReadonlyMap<string, Obstruction>;
}

/** Everything needed to work out which bridges a hop goes under. */
export interface GraphGeometry {
  readonly locations: readonly Location[];
  readonly waypoints: readonly Waypoint[];
  readonly obstructions: readonly Obstruction[];
}

/**
 * How close a hop's drawn track has to run before it counts as passing
 * under a span.
 *
 * Tighter than the equivalent test for tidal passes, and deliberately:
 * a false positive here doesn't clutter a panel, it declares a perfectly
 * good route impassable. Named `via` matching below covers the cases
 * that matter most — the route tables name the Port Townsend Canal on
 * 39 different hops — so the geometry only has to catch the rest.
 */
const OBSTRUCTION_PROXIMITY_NM = 1.5;

/**
 * Proximity alone is not enough, because the drawn line between two
 * distant ports sweeps past plenty of bridges it never goes under —
 * Everett to Port Angeles passes close to the Port Townsend Canal while
 * actually rounding Point Wilson miles away.
 *
 * So the published mileage has to *agree* that the bridge is on the way.
 * Going through it costs at least the two great-circle legs either side
 * of it, which gives a lower bound: a hop shorter than that took a
 * different route, and one much longer went round. Port Ludlow to Port
 * Townsend sits at 1.11 and is a genuine canal transit; Port Hadlock to
 * Port Townsend at 0.85 runs up the bay instead, and Port Townsend to
 * Poulsbo at 1.62 goes the long way via Agate Passage.
 */
const MIN_THROUGH_RATIO = 0.95;
const MAX_THROUGH_RATIO = 1.35;

const goesThrough = (
  edge: RouteEdge,
  obstruction: Obstruction,
  from: Coordinates,
  to: Coordinates
): boolean => {
  const through = haversineNm(from, obstruction) + haversineNm(obstruction, to);
  if (through === 0) return true;
  const ratio = edge.nm / through;
  return ratio >= MIN_THROUGH_RATIO && ratio <= MAX_THROUGH_RATIO;
};

const obstructionsOnEdge = (
  edge: RouteEdge,
  geometry: GraphGeometry,
  index: ReturnType<typeof buildCoordinateIndex>,
  namesById: ReadonlyMap<string, readonly string[]>
): readonly string[] => {
  const from = index.lookup(edge.from);
  const to = index.lookup(edge.to);

  const viaNames = new Set(edge.via.map(normalizeName));
  const found = new Set<string>();

  for (const obstruction of geometry.obstructions) {
    if ((namesById.get(obstruction.id) ?? []).some((name) => viaNames.has(name))) {
      found.add(obstruction.id);
    }
  }

  if (from === undefined || to === undefined) return [...found];

  const polyline: Coordinates[] = [
    from,
    ...resolveViaCoordinatesWith(edge.via, index),
    to,
  ];

  // Degrees of latitude are ~60nm; a generous box beats projecting every
  // obstruction against every one of several thousand hops.
  const pad = OBSTRUCTION_PROXIMITY_NM / 60 + 0.05;
  const minLat = Math.min(...polyline.map((p) => p.lat)) - pad;
  const maxLat = Math.max(...polyline.map((p) => p.lat)) + pad;
  const minLon = Math.min(...polyline.map((p) => p.lon)) - pad * 1.5;
  const maxLon = Math.max(...polyline.map((p) => p.lon)) + pad * 1.5;

  for (const obstruction of geometry.obstructions) {
    if (found.has(obstruction.id)) continue;
    if (obstruction.lat < minLat || obstruction.lat > maxLat) continue;
    if (obstruction.lon < minLon || obstruction.lon > maxLon) continue;

    const projection = projectOntoPolyline(obstruction, polyline);
    if (projection === null || projection.offsetNm > OBSTRUCTION_PROXIMITY_NM) continue;
    if (!goesThrough(edge, obstruction, from, to)) continue;
    found.add(obstruction.id);
  }

  return [...found];
};

/**
 * Builds an undirected adjacency list from the scraped (directed, and
 * incomplete) edge list. nwcruising.net's per-location pages don't all
 * reciprocally list each other, so every edge is added in both
 * directions; if both directions were independently scraped with
 * different distances, the shorter one wins.
 *
 * Given `geometry`, each hop is also annotated with the bridges it goes
 * under, which is what lets the searches below route a tall rig around a
 * fixed span instead of under it.
 */
export const buildRouteGraph = (
  edges: readonly RouteEdge[],
  geometry?: GraphGeometry
): RouteGraph => {
  const adjacency = new Map<string, AdjacencyEdge[]>();
  const obstructionsById = new Map<string, Obstruction>(
    (geometry?.obstructions ?? []).map((o) => [o.id, o] as const)
  );

  const index =
    geometry === undefined
      ? null
      : buildCoordinateIndex(geometry.locations, geometry.waypoints);

  // Slug lookup too: an edge's endpoints are slugs, not display names.
  const bySlug = new Map((geometry?.locations ?? []).map((l) => [l.slug, l] as const));
  const lookup = {
    lookup: (key: string): Coordinates | undefined => {
      const location = bySlug.get(key);
      if (location !== undefined) return { lat: location.lat, lon: location.lon };
      return index?.lookup(key);
    },
  };

  const namesById = new Map<string, readonly string[]>(
    (geometry?.obstructions ?? []).map((o) => [
      o.id,
      [o.name, ...(o.aliases ?? [])].map(normalizeName),
    ])
  );

  const add = (from: string, to: string, edge: RouteEdge, ids: readonly string[]) => {
    const existing = adjacency.get(from) ?? [];
    adjacency.set(from, existing);

    let lowestFixed = Infinity;
    for (const id of ids) {
      const obstruction = obstructionsById.get(id);
      if (obstruction !== undefined && !obstruction.opens) {
        lowestFixed = Math.min(lowestFixed, obstruction.clearanceFeet);
      }
    }

    existing.push({
      to,
      nm: edge.nm,
      hrMin: edge.hrMin,
      via: edge.via,
      obstructionIds: ids,
      lowestFixedClearanceFeet: lowestFixed,
    });
  };

  for (const edge of edges) {
    const ids =
      geometry === undefined || index === null
        ? []
        : obstructionsOnEdge(edge, geometry, lookup, namesById);
    add(edge.from, edge.to, edge, ids);
    add(edge.to, edge.from, edge, ids);
  }

  return { adjacency, obstructionsById };
};

/** Whether a rig of this height can take this hop at all. */
const edgeIsPassable = (edge: AdjacencyEdge, mastHeightFeet: number | undefined): boolean =>
  mastHeightFeet === undefined ||
  edge.lowestFixedClearanceFeet >= airDraftFor(mastHeightFeet);

export interface DestinationCandidate {
  readonly slug: string;
  readonly nm: number;
  /** Present only when ranked with a `returnLeg`. */
  readonly distanceToEnd?: number;
}

/**
 * Single-source Dijkstra: shortest distance in nm from `fromSlug` to
 * every reachable location.
 */
export const shortestDistancesFrom = (
  graph: RouteGraph,
  fromSlug: string,
  mastHeightFeet?: number
): Map<string, number> => {
  const distances = new Map<string, number>([[fromSlug, 0]]);
  const visited = new Set<string>();
  const queue = new Set<string>([fromSlug]);

  while (queue.size > 0) {
    let current: string | null = null;
    let currentDistance = Infinity;
    for (const candidate of queue) {
      const distance = distances.get(candidate) ?? Infinity;
      if (distance < currentDistance) {
        currentDistance = distance;
        current = candidate;
      }
    }
    if (current === null) break;
    queue.delete(current);
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of graph.adjacency.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      if (!edgeIsPassable(edge, mastHeightFeet)) continue;
      const candidateDistance = currentDistance + edge.nm;
      if (candidateDistance < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, candidateDistance);
        queue.add(edge.to);
      }
    }
  }

  return distances;
};

/**
 * Shaping context for a trip that has to finish somewhere specific.
 * Omit it and days are picked purely on length, which is right for a
 * one-way wander but will happily strand you.
 */
export interface ReturnLegContext {
  /** Shortest distance from every location to the trip's end point. */
  readonly distancesToEnd: ReadonlyMap<string, number>;
  /** Days left *after* this one to cover the run back. */
  readonly daysRemaining: number;
  /** Where this day should ideally leave you relative to the end point. */
  readonly idealDistanceToEnd: number;
  readonly weight: number;
}

/**
 * Weather shaping for one day. Omit it and days are picked on distance
 * alone, which is the right answer past the forecast horizon and for
 * anyone who'd rather the planner not second-guess the sky.
 */
export interface WindRankingContext {
  readonly originCoordinates: Coordinates;
  readonly coordinatesBySlug: ReadonlyMap<string, Coordinates>;
  /** This day's wind at a point, or null where the forecast doesn't reach. */
  readonly windAt: (point: Coordinates) => Wind | null;
  readonly weight: number;
}

export interface RankOptions {
  readonly range: DayLengthRange;
  readonly exclude?: ReadonlySet<string>;
  readonly returnLeg?: ReturnLegContext;
  readonly wind?: WindRankingContext;
  /** Omit to ignore vertical clearance entirely. */
  readonly mastHeightFeet?: number;
}

/**
 * The wind cost of running to a candidate, in nautical miles so it adds
 * to the other ranking terms.
 *
 * The heading used is the straight line from origin to candidate, not the
 * dog-legged route actually sailed. That understates a day that turns a
 * corner into the wind, but the alternative — weighting every leg of a
 * path that hasn't been chosen yet — costs a shortest-path search per
 * candidate to sharpen a term the forecast itself can't resolve that
 * finely.
 */
const windCostNm = (
  candidate: DestinationCandidate,
  wind: WindRankingContext | undefined
): number => {
  if (wind === undefined) return 0;
  const destination = wind.coordinatesBySlug.get(candidate.slug);
  if (destination === undefined) return 0;

  const forecast = wind.windAt(destination);
  if (forecast === null) return 0;

  const course = bearingDegrees(wind.originCoordinates, destination);
  return wind.weight * windPenaltyNm(forecast, course, candidate.nm);
};

/**
 * Candidate next-day destinations whose travel distance from `fromSlug`
 * falls in the day-length range, best first.
 *
 * Distances come from the same shortest-path search `findRoute` uses,
 * not from raw direct edges. Ranking on direct-edge distance instead
 * lets a day be *displayed* at a different (shorter) distance than it
 * was selected on, which can put an auto-picked day outside the very
 * range that chose it.
 *
 * Ranked by closeness to the middle of the range, so a 20–55nm day
 * prefers a ~38nm hop over a 21nm or 54nm one. With a `returnLeg`,
 * candidates you couldn't get back from in the days left are dropped,
 * and the ranking also rewards sitting near `idealDistanceToEnd` — see
 * `idealDistanceToEnd()` in the domain for the tent that shapes it.
 * With a `wind` context, a day spent beating into a blow is penalised in
 * proportion to how long it lasts, so the plan drifts toward the sheltered
 * or downwind option without ever refusing to sail.
 * Ties break alphabetically for stable output.
 */
export const rankNextDestinations = (
  graph: RouteGraph,
  fromSlug: string,
  {
    range: { minNm, maxNm },
    exclude = new Set<string>(),
    returnLeg,
    wind,
    mastHeightFeet,
  }: RankOptions
): DestinationCandidate[] => {
  const distances = shortestDistancesFrom(graph, fromSlug, mastHeightFeet);
  const candidates: DestinationCandidate[] = [];

  for (const [slug, nm] of distances) {
    if (slug === fromSlug || exclude.has(slug)) continue;
    if (nm < minNm || nm > maxNm) continue;

    let distanceToEnd: number | undefined;
    if (returnLeg !== undefined) {
      distanceToEnd = returnLeg.distancesToEnd.get(slug);
      // Unreachable from the end point, or too far to get back in the
      // days left. This bound is optimistic — it assumes the remaining
      // distance can be split into legs that each fit the day range,
      // which a sparse graph may not allow — so it prunes only what is
      // definitely infeasible and lets the chain surface the rest.
      if (distanceToEnd === undefined) continue;
      if (distanceToEnd > returnLeg.daysRemaining * maxNm) continue;
    }

    candidates.push({ slug, nm, distanceToEnd });
  }

  const target = (minNm + maxNm) / 2;
  const scoreOf = (candidate: DestinationCandidate): number => {
    const lengthFit = Math.abs(candidate.nm - target);
    const windFit = windCostNm(candidate, wind);
    if (returnLeg === undefined || candidate.distanceToEnd === undefined) {
      return lengthFit + windFit;
    }
    const shapeFit = Math.abs(candidate.distanceToEnd - returnLeg.idealDistanceToEnd);
    return lengthFit + returnLeg.weight * shapeFit + windFit;
  };

  return candidates.sort((a, b) => {
    const delta = scoreOf(a) - scoreOf(b);
    return delta !== 0 ? delta : a.slug.localeCompare(b.slug);
  });
};

/**
 * Dijkstra shortest path by nautical miles. Direct edges are the 1-hop
 * case; most pairs the site doesn't list directly still resolve through
 * shared hub locations (Shilshole, Anacortes, etc).
 */
export const findRoute = (
  graph: RouteGraph,
  fromSlug: string,
  toSlug: string,
  mastHeightFeet?: number
): PlannedRoute | null => {
  if (fromSlug === toSlug) {
    return { legs: [], totalNm: 0, totalHrMin: "0:00" };
  }

  const distances = new Map<string, number>([[fromSlug, 0]]);
  const previous = new Map<string, { via: string; leg: RouteLeg }>();
  const visited = new Set<string>();
  const queue = new Set<string>([fromSlug]);

  while (queue.size > 0) {
    let current: string | null = null;
    let currentDistance = Infinity;
    for (const candidate of queue) {
      const distance = distances.get(candidate) ?? Infinity;
      if (distance < currentDistance) {
        currentDistance = distance;
        current = candidate;
      }
    }
    if (current === null) break;
    queue.delete(current);
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === toSlug) break;

    for (const edge of graph.adjacency.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      if (!edgeIsPassable(edge, mastHeightFeet)) continue;
      const candidateDistance = currentDistance + edge.nm;
      const bestKnown = distances.get(edge.to) ?? Infinity;
      if (candidateDistance < bestKnown) {
        distances.set(edge.to, candidateDistance);
        previous.set(edge.to, {
          via: current,
          leg: {
            from: current,
            to: edge.to,
            nm: edge.nm,
            hrMin: edge.hrMin,
            via: edge.via,
            obstructionIds: edge.obstructionIds,
          },
        });
        queue.add(edge.to);
      }
    }
  }

  if (!previous.has(toSlug)) return null;

  const legs: RouteLeg[] = [];
  let cursor = toSlug;
  while (cursor !== fromSlug) {
    const step = previous.get(cursor);
    if (step === undefined) return null;
    legs.unshift(step.leg);
    cursor = step.via;
  }

  const totalNm = legs.reduce((sum, leg) => sum + leg.nm, 0);
  const totalMinutes = legs.reduce(
    (sum, leg) => sum + hrMinToMinutes(leg.hrMin),
    0
  );

  return { legs, totalNm, totalHrMin: minutesToHrMin(totalMinutes) };
};
