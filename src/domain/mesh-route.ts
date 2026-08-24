import { haversineNm } from "./geo";
import type { Coordinates, Location } from "./location";
import type { PlannedRoute } from "./route";
import type { LonLat } from "./route-line";

/**
 * Route geometry taken from `public/data/salish-mesh.json`.
 *
 * The planner's own tables say how far apart two harbours are and which
 * passages lie between them; they say nothing about the shape of the
 * water, so a leg drawn from its endpoints runs over whatever land is
 * in the way. The mesh is a network of traced, navigable water, and
 * walking it turns a leg into a line a boat could follow.
 *
 * Route *choice* is not this module's business — `route-graph.ts` still
 * decides which harbours a trip visits, from the published distances.
 * This only draws the water between two already-chosen points.
 */

/** The subset of the mesh file this needs. */
export interface MeshFeatureCollection {
  readonly features: readonly {
    readonly geometry:
      | { readonly type: "LineString"; readonly coordinates: readonly LonLat[] }
      | { readonly type: "Point"; readonly coordinates: LonLat };
    readonly properties: Readonly<Record<string, unknown>>;
  }[];
}

interface Node {
  readonly at: Coordinates;
  /** Neighbour index and the distance to it. */
  readonly edges: { to: number; nm: number }[];
}

export interface MeshGraph {
  readonly nodes: readonly Node[];
  /** Node index by rounded "lon,lat", the form the mesh file stores. */
  readonly byKey: ReadonlyMap<string, number>;
}

const key = (point: LonLat) => `${point[0]},${point[1]}`;

/**
 * Indexes the mesh once, so a trip's legs can be walked without rebuilding
 * it. Vertices shared between features are the same node by construction:
 * the mesh build splits a corridor wherever anything joins it, so a spur's
 * first coordinate *is* a coordinate of the corridor it hangs off.
 */
export const buildMeshGraph = (mesh: MeshFeatureCollection): MeshGraph => {
  const nodes: Node[] = [];
  const byKey = new Map<string, number>();

  const nodeAt = (point: LonLat): number => {
    const found = byKey.get(key(point));
    if (found !== undefined) return found;
    const index = nodes.length;
    nodes.push({ at: { lon: point[0], lat: point[1] }, edges: [] });
    byKey.set(key(point), index);
    return index;
  };

  for (const feature of mesh.features) {
    if (feature.geometry.type !== "LineString") continue;
    const line = feature.geometry.coordinates;
    for (let at = 0; at + 1 < line.length; at++) {
      const from = nodeAt(line[at] as LonLat);
      const to = nodeAt(line[at + 1] as LonLat);
      if (from === to) continue;
      const nm = haversineNm(
        (nodes[from] as Node).at,
        (nodes[to] as Node).at
      );
      (nodes[from] as Node).edges.push({ to, nm });
      (nodes[to] as Node).edges.push({ to: from, nm });
    }
  }

  return { nodes, byKey };
};

/**
 * How far a position may be from the network and still be considered on
 * it. Every harbour in the dataset has a spur terminating on its exact
 * published position, so this only ever catches a point the mesh does
 * not cover — and snapping such a point to the nearest node regardless
 * would draw a confident line from somewhere it never was.
 */
const MAX_SNAP_NM = 2;

/**
 * Nearest mesh node to a position, or null when the nearest is too far
 * to honestly call the same place.
 *
 * A harbour normally hits its own node exactly — the mesh stores harbour
 * positions to five decimal places and its spurs terminate on them — so
 * the scan is the fallback for everything else.
 */
const nearestNode = (graph: MeshGraph, at: Coordinates): number | null => {
  const exact = graph.byKey.get(
    key([Math.round(at.lon * 1e5) / 1e5, Math.round(at.lat * 1e5) / 1e5])
  );
  if (exact !== undefined) return exact;

  let best: number | null = null;
  let bestNm = MAX_SNAP_NM;
  for (let index = 0; index < graph.nodes.length; index++) {
    const nm = haversineNm((graph.nodes[index] as Node).at, at);
    if (nm < bestNm) {
      bestNm = nm;
      best = index;
    }
  }
  return best;
};

/** Binary heap over (distance, node), so a long leg does not sort per pop. */
class Frontier {
  private readonly heap: [number, number][] = [];

  push(entry: [number, number]) {
    this.heap.push(entry);
    let at = this.heap.length - 1;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if ((this.heap[parent] as [number, number])[0] <= (this.heap[at] as [number, number])[0]) break;
      [this.heap[parent], this.heap[at]] = [this.heap[at] as [number, number], this.heap[parent] as [number, number]];
      at = parent;
    }
  }

  pop(): [number, number] | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      let at = 0;
      for (;;) {
        const left = 2 * at + 1;
        const right = left + 1;
        let smallest = at;
        if (left < this.heap.length && (this.heap[left] as [number, number])[0] < (this.heap[smallest] as [number, number])[0]) smallest = left;
        if (right < this.heap.length && (this.heap[right] as [number, number])[0] < (this.heap[smallest] as [number, number])[0]) smallest = right;
        if (smallest === at) break;
        [this.heap[smallest], this.heap[at]] = [this.heap[at] as [number, number], this.heap[smallest] as [number, number]];
        at = smallest;
      }
    }
    return top;
  }

  get size() {
    return this.heap.length;
  }
}

/**
 * The shortest way through the water from one position to another, or
 * null when the mesh cannot serve the pair — which the caller should
 * treat as "fall back to the straight line", not as an error.
 */
export const meshPathCoordinates = (
  graph: MeshGraph,
  from: Coordinates,
  to: Coordinates
): LonLat[] | null => {
  const start = nearestNode(graph, from);
  const goal = nearestNode(graph, to);
  if (start === null || goal === null) return null;
  if (start === goal) return null;

  const distance = new Float64Array(graph.nodes.length).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(graph.nodes.length).fill(-1);
  const settled = new Uint8Array(graph.nodes.length);
  distance[start] = 0;

  const frontier = new Frontier();
  frontier.push([0, start]);
  while (frontier.size > 0) {
    const next = frontier.pop();
    if (next === undefined) break;
    const [cost, at] = next;
    if (settled[at] === 1) continue;
    settled[at] = 1;
    if (at === goal) break;
    for (const edge of (graph.nodes[at] as Node).edges) {
      const candidate = cost + edge.nm;
      if (candidate < (distance[edge.to] as number)) {
        distance[edge.to] = candidate;
        cameFrom[edge.to] = at;
        frontier.push([candidate, edge.to]);
      }
    }
  }

  if (settled[goal] !== 1) return null;

  const path: LonLat[] = [];
  for (let at = goal; at !== -1; at = cameFrom[at] as number) {
    const node = graph.nodes[at] as Node;
    path.push([node.at.lon, node.at.lat]);
    if (at === start) break;
  }
  return path.reverse();
};

/**
 * A whole planned route as one polyline, each leg walked over the mesh.
 *
 * Any leg the mesh cannot serve falls back to its own straight line, so
 * one unreachable harbour costs that leg's shape rather than the trip's.
 * `onFallback` is how the caller finds out; a line that quietly stops
 * following water is the failure this module exists to prevent.
 */
export const buildMeshRouteLineCoordinates = (
  route: PlannedRoute,
  locationsBySlug: ReadonlyMap<string, Location>,
  graph: MeshGraph,
  onFallback?: (leg: { from: string; to: string }) => void
): LonLat[] => {
  const points: LonLat[] = [];
  const push = (point: LonLat) => {
    const last = points.at(-1);
    if (last?.[0] === point[0] && last[1] === point[1]) return;
    points.push(point);
  };

  for (const leg of route.legs) {
    const from = locationsBySlug.get(leg.from);
    const to = locationsBySlug.get(leg.to);
    if (from === undefined || to === undefined) continue;

    const path = meshPathCoordinates(graph, from, to);
    if (path === null) {
      onFallback?.({ from: leg.from, to: leg.to });
      push([from.lon, from.lat]);
      push([to.lon, to.lat]);
      continue;
    }
    for (const point of path) push(point);
  }

  return points;
};
