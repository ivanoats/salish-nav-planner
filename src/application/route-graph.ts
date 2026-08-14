import { minutesToHrMin, hrMinToMinutes } from "@/domain/hr-min";
import type { PlannedRoute, RouteEdge, RouteLeg } from "@/domain/route";
import type { DayLengthRange } from "@/domain/trip";

interface AdjacencyEdge {
  readonly to: string;
  readonly nm: number;
  readonly hrMin: string;
  readonly via: readonly string[];
}

export interface RouteGraph {
  readonly adjacency: ReadonlyMap<string, readonly AdjacencyEdge[]>;
}

/**
 * Builds an undirected adjacency list from the scraped (directed, and
 * incomplete) edge list. nwcruising.net's per-location pages don't all
 * reciprocally list each other, so every edge is added in both
 * directions; if both directions were independently scraped with
 * different distances, the shorter one wins.
 */
export const buildRouteGraph = (edges: readonly RouteEdge[]): RouteGraph => {
  const adjacency = new Map<string, AdjacencyEdge[]>();

  const add = (from: string, to: string, edge: RouteEdge) => {
    const existing = adjacency.get(from) ?? [];
    adjacency.set(from, existing);
    existing.push({ to, nm: edge.nm, hrMin: edge.hrMin, via: edge.via });
  };

  for (const edge of edges) {
    add(edge.from, edge.to, edge);
    add(edge.to, edge.from, edge);
  }

  return { adjacency };
};

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
  fromSlug: string
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

export interface RankOptions {
  readonly range: DayLengthRange;
  readonly exclude?: ReadonlySet<string>;
  readonly returnLeg?: ReturnLegContext;
}

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
 * Ties break alphabetically for stable output.
 */
export const rankNextDestinations = (
  graph: RouteGraph,
  fromSlug: string,
  { range: { minNm, maxNm }, exclude = new Set<string>(), returnLeg }: RankOptions
): DestinationCandidate[] => {
  const distances = shortestDistancesFrom(graph, fromSlug);
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
    if (returnLeg === undefined || candidate.distanceToEnd === undefined) return lengthFit;
    const shapeFit = Math.abs(candidate.distanceToEnd - returnLeg.idealDistanceToEnd);
    return lengthFit + returnLeg.weight * shapeFit;
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
  toSlug: string
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
