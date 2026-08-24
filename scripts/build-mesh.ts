/**
 * Builds `public/data/salish-mesh.json`: a connected GeoJSON network of
 * deep-water corridors, tidal passes and marina entrance spurs for every
 * location in the dataset.
 *
 * The corridors are hand-chosen but not hand-traced. `scripts/mesh/
 * skeleton-*.ts` says which named waterways exist and roughly where each
 * one runs; the geometry comes from searching a raster of the OSM
 * shoreline, so a line in this file follows real water rather than a
 * recollection of it. Spurs are searched the same way, from each
 * harbour out to the nearest corridor.
 *
 * Run: npm run mesh:coastline && npm run mesh
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWaterGrid,
  CELL_METRES,
  type InlandWater,
  type WaterGrid,
  type WaterPatch,
} from "./mesh/water-grid";
import {
  centreInChannel,
  routeThroughWater,
  routeToNearestTarget,
  snapToWater,
  stringPullThroughWater,
  type Cell,
} from "./mesh/router";
import type { CorridorSpec, LonLat } from "./mesh/types";
import { PUGET_CORRIDORS } from "./mesh/skeleton-puget";
import { SAN_JUAN_CORRIDORS } from "./mesh/skeleton-sanjuans";
import { GEORGIA_CORRIDORS } from "./mesh/skeleton-georgia";
import { NORTH_CORRIDORS } from "./mesh/skeleton-north";

const DATA_DIR = join(process.cwd(), "public", "data");
const CACHE_DIR = join(process.cwd(), "data", "coastline");
const INLAND_DIR = join(CACHE_DIR, "inland");
const OUT_PATH = join(DATA_DIR, "salish-mesh.json");

const SPECS: readonly CorridorSpec[] = [
  ...PUGET_CORRIDORS,
  ...SAN_JUAN_CORRIDORS,
  ...GEORGIA_CORRIDORS,
  ...NORTH_CORRIDORS,
];

/** Open water the flood starts from. Everything reachable is navigable. */
const SEEDS: readonly LonLat[] = [
  [-126.0, 47.5], // Pacific, off the Washington coast
  [-124.5, 48.35], // Strait of Juan de Fuca
  [-130.5, 53.4], // Hecate Strait
  [-128.5, 51.0], // Queen Charlotte Sound
  // Extra seeds so a clipped MESH_REGION run still has open water in it.
  // All are on the same body of water as the others, so they change
  // nothing in a full run.
  [-122.44, 47.65], // mid Puget Sound
  [-124.0, 49.5], // Strait of Georgia
  [-126.0, 50.45], // Johnstone Strait
  [-127.3, 50.75], // Queen Charlotte Strait
];

/**
 * Points well inland, checked after the flood. They are the tripwire for
 * a hole in the shoreline barrier, which otherwise produces a build that
 * succeeds at everything except being true.
 */
const MUST_BE_DRY: readonly LonLat[] = [
  [-123.4, 47.8], // Olympic Mountains
  [-121.95, 48.5], // North Cascades
  [-122.6, 47.45], // Kitsap Peninsula, inland of Dyes Inlet
  [-126.5, 49.9], // central Vancouver Island
  [-122.3, 49.2], // Fraser Valley
  [-126.0, 53.0], // BC interior
  [-129.5, 54.0], // Coast Mountains behind Prince Rupert
];

const INLAND: readonly InlandWater[] = [
  { name: "Lake Washington", seed: [-122.25, 47.6] },
  { name: "Lake Union", seed: [-122.335, 47.64] },
  { name: "Salmon Bay", seed: [-122.383, 47.66] },
  { name: "Portage Bay", seed: [-122.317, 47.649] },
  { name: "Union Bay", seed: [-122.279, 47.647] },
  { name: "Duwamish Waterway", seed: [-122.336, 47.545] },
];

/**
 * Channels narrower than one 80 m cell, which the shoreline raster
 * closes. Each is a real, marked, navigable cut — the raster simply
 * cannot resolve it.
 */
const PATCHES: readonly WaterPatch[] = [
  {
    name: "Ballard Locks and the Fremont Cut",
    widthCells: 1,
    path: [
      [-122.4085, 47.6705],
      [-122.3995, 47.6659],
      [-122.3925, 47.6647],
      [-122.3855, 47.6633],
      [-122.3767, 47.6597],
      [-122.3685, 47.6565],
      [-122.3605, 47.6512],
      [-122.3497, 47.6486],
      [-122.3455, 47.6478],
    ],
  },
  {
    name: "Montlake Cut",
    widthCells: 1,
    path: [
      [-122.3245, 47.6478],
      [-122.3145, 47.6469],
      [-122.3047, 47.6469],
      [-122.2955, 47.6465],
    ],
  },
  {
    name: "Swinomish Channel",
    widthCells: 1,
    // Traced off the shoreline with scripts/mesh/probe.mjs rather than
    // guessed: the cut is about 120 m wide, so a patch 300 m out of
    // place misses it entirely and the channel silently stays closed.
    path: [
      [-122.4995, 48.372],
      [-122.4975, 48.388],
      [-122.4963, 48.395],
      [-122.4968, 48.405],
      [-122.4986, 48.415],
      [-122.5015, 48.425],
      [-122.5003, 48.435],
      [-122.5085, 48.445],
      [-122.5146, 48.455],
      [-122.515, 48.465],
      [-122.5155, 48.472],
    ],
  },
  {
    name: "Duwamish Waterway",
    widthCells: 1,
    // The coastline layer stops at the river mouth; the dredged federal
    // channel above it carries a marina in the dataset.
    path: [
      [-122.3585, 47.5915],
      [-122.3505, 47.5825],
      [-122.3435, 47.5735],
      [-122.3396, 47.5645],
      [-122.3372, 47.5555],
      [-122.3335, 47.5465],
      [-122.3295, 47.538],
    ],
  },
  {
    name: "Malibu Rapids",
    widthCells: 1,
    path: [
      [-123.8552, 50.1605],
      [-123.8502, 50.1642],
      [-123.8435, 50.1688],
    ],
  },
];

interface LocationRecord {
  slug: string;
  name: string;
  region: "US" | "CA";
  lon: number;
  lat: number;
}

const readJson = <T>(fileName: string): T =>
  JSON.parse(readFileSync(join(DATA_DIR, fileName), "utf8")) as T;

const loadLocations = (): LocationRecord[] => {
  const geojson = readJson<{
    features: {
      geometry: { coordinates: [number, number] };
      properties: { slug: string; name: string; region: "US" | "CA" };
    }[];
  }>("locations.geojson");
  const fixes = readJson<
    { slug: string; name: string; region: "US" | "CA"; lat: number; lon: number }[]
  >("location-fixes.json");

  const bySlug = new Map<string, LocationRecord>();
  for (const feature of geojson.features) {
    bySlug.set(feature.properties.slug, {
      slug: feature.properties.slug,
      name: feature.properties.name,
      region: feature.properties.region,
      lon: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    });
  }
  // Same corrections the app applies on load, for the same reason: the
  // uncorrected headers put three harbours in the open Pacific.
  for (const fix of fixes) {
    const existing = bySlug.get(fix.slug);
    bySlug.set(fix.slug, {
      slug: fix.slug,
      name: existing?.name ?? fix.name,
      region: existing?.region ?? fix.region,
      lon: fix.lon,
      lat: fix.lat,
    });
  }
  return [...bySlug.values()];
};

const EARTH_RADIUS_NM = 3440.065;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineNm = (a: LonLat, b: LonLat): number => {
  const dLat = toRadians(b[1] - a[1]);
  const dLon = toRadians(b[0] - a[0]);
  const halfChord =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a[1])) * Math.cos(toRadians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(halfChord)));
};

const lengthNm = (line: readonly LonLat[]): number => {
  let total = 0;
  for (let segment = 0; segment + 1 < line.length; segment++) {
    total += haversineNm(line[segment] as LonLat, line[segment + 1] as LonLat);
  }
  return total;
};

const round = (value: number) => Math.round(value * 1e5) / 1e5;

interface BuiltCorridor {
  readonly spec: CorridorSpec;
  /** Every cell the track passes through, before simplification. */
  cells: Cell[];
  /** Indices into `cells` where another feature joins. */
  readonly junctions: Set<number>;
  readonly passIds: Set<string>;
  readonly obstructionIds: Set<string>;
}

const cellToLonLat = (grid: WaterGrid, cell: Cell): LonLat => [
  grid.lon(cell.col),
  grid.lat(cell.row),
];

/** Longest published leg to trace its own geometry for. */
const EDGE_CAP_NM = 25;

/** How far a straightened leg may wander from the traced track, in cells. */
const MAX_DEVIATION_CELLS = 3;

/**
 * Cuts out any stretch where a track revisits a cell it has already
 * been through.
 *
 * Joining a corridor to its parent can double the line back on itself:
 * the join runs from the nearest point on the parent to this corridor's
 * first control point, and if that control point sits behind the join,
 * the result runs out and back again. Length is taken from this geometry,
 * so a line that retraces itself does not just look wrong — it reports a
 * passage as longer than it is.
 */
const removeLoops = (cells: readonly Cell[], cols: number): Cell[] => {
  const out: Cell[] = [];
  const seenAt = new Map<number, number>();
  for (const cell of cells) {
    const index = cell.row * cols + cell.col;
    const earlier = seenAt.get(index);
    if (earlier !== undefined) {
      for (let back = out.length - 1; back > earlier; back--) {
        const dropped = out[back] as Cell;
        seenAt.delete(dropped.row * cols + dropped.col);
      }
      out.length = earlier + 1;
      continue;
    }
    seenAt.set(index, out.length);
    out.push(cell);
  }
  return out;
};

/** Corridors must be built after whatever they branch from. */
const orderByDependency = (specs: readonly CorridorSpec[]): CorridorSpec[] => {
  const bySpec = new Map(specs.map((spec) => [spec.id, spec] as const));
  const ordered: CorridorSpec[] = [];
  const state = new Map<string, "visiting" | "done">();

  const visit = (spec: CorridorSpec) => {
    const seen = state.get(spec.id);
    if (seen === "done") return;
    if (seen === "visiting") throw new Error(`corridor dependency cycle at ${spec.id}`);
    state.set(spec.id, "visiting");
    for (const parentId of [spec.startsOn, spec.endsOn]) {
      if (parentId === undefined) continue;
      const parent = bySpec.get(parentId);
      if (parent === undefined) {
        throw new Error(`${spec.id} references unknown corridor ${parentId}`);
      }
      visit(parent);
    }
    state.set(spec.id, "done");
    ordered.push(spec);
  };

  for (const spec of specs) visit(spec);
  return ordered;
};

/**
 * Straightens a traced corridor without losing the vertices other
 * features are joined at — every junction stays an exact shared point,
 * so the mesh remains a graph rather than a pile of crossing lines.
 */
const dressCorridor = (
  grid: WaterGrid,
  cells: readonly Cell[],
  junctions: ReadonlySet<number>
): LonLat[] => {
  const cuts = [...new Set([0, cells.length - 1, ...junctions])]
    .filter((index) => index >= 0 && index < cells.length)
    .sort((left, right) => left - right);

  const out: LonLat[] = [];
  for (let cut = 0; cut + 1 < cuts.length; cut++) {
    const piece = stringPullThroughWater(
      grid,
      cells.slice(cuts[cut] as number, (cuts[cut + 1] as number) + 1),
      MAX_DEVIATION_CELLS
    );
    for (const cell of piece) {
      const point = cellToLonLat(grid, cell);
      const last = out.at(-1);
      if (last?.[0] === point[0] && last[1] === point[1]) continue;
      out.push(point);
    }
  }
  return out.length >= 2 ? out : cells.map((cell) => cellToLonLat(grid, cell));
};

/** One harbour's traced approach, from the network in to the harbour. */
interface BuiltSpur {
  readonly location: LocationRecord;
  readonly corridorId: string;
  readonly line: LonLat[];
  /** Length of the final straight run to the published position. */
  readonly harbourLegMetres: number;
}

interface Marker {
  readonly id: string;
  readonly lon: number;
  readonly lat: number;
}

/** Attaches passes and bridges to the corridor whose track runs past them. */
const attachMarkers = (
  grid: WaterGrid,
  corridors: readonly BuiltCorridor[],
  markers: readonly Marker[],
  withinNm: number,
  onMatch: (corridor: BuiltCorridor, id: string) => void
): Map<string, string> => {
  const owner = new Map<string, string>();
  for (const marker of markers) {
    let bestCorridor: BuiltCorridor | null = null;
    let bestNm = withinNm;
    for (const corridor of corridors) {
      for (const cell of corridor.cells) {
        const distance = haversineNm([marker.lon, marker.lat], cellToLonLat(grid, cell));
        if (distance < bestNm) {
          bestNm = distance;
          bestCorridor = corridor;
        }
      }
    }
    if (bestCorridor === null) continue;
    onMatch(bestCorridor, marker.id);
    owner.set(marker.id, bestCorridor.spec.id);
  }
  return owner;
};

/** Union-find over shared vertices, to prove the mesh is one network. */
const countComponents = (lines: readonly (readonly LonLat[])[]) => {
  const parent = new Map<string, string>();
  const key = (point: LonLat) => `${point[0]},${point[1]}`;
  const find = (a: string): string => {
    let root = a;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string;
    let walk = a;
    while (walk !== root) {
      const next = parent.get(walk) as string;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  for (const line of lines) {
    for (const point of line) if (!parent.has(key(point))) parent.set(key(point), key(point));
    for (let segment = 0; segment + 1 < line.length; segment++) {
      union(key(line[segment] as LonLat), key(line[segment + 1] as LonLat));
    }
  }

  const sizes = new Map<string, number>();
  for (const node of parent.keys()) {
    const root = find(node);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  return [...sizes.values()].sort((larger, smaller) => smaller - larger);
};

/**
 * Joins corridors that pass close to one another but were never
 * declared as connected.
 *
 * A skeleton written as "this branches off that" produces a tree, and a
 * tree is the wrong shape for water. Where two channels run within sight
 * of each other the graph has to know it, or a route between them takes
 * the long way round: Port Ludlow sits off Admiralty Inlet, but with the
 * Port Townsend Canal joined at its northern end only, reaching it meant
 * running up the inlet, through the canal and back down — 47 nm for a
 * leg the tables put at 23.5.
 *
 * The link itself is traced through water like everything else, so this
 * adds no geometry that a boat could not follow.
 */
const linkNearbyCorridors = (
  grid: WaterGrid,
  built: ReadonlyMap<string, BuiltCorridor>,
  warnings: string[],
  log: (message: string) => void
): { readonly id: string; readonly cells: Cell[] }[] => {
  /** How far apart two corridors may be and still be worth joining. */
  const GAP_LIMIT_CELLS = Math.round((3 * 1852) / CELL_METRES);
  /** Sampling stride: a link 100 m off the ideal spot costs nothing. */
  const STRIDE = 4;

  interface Sampled {
    readonly id: string;
    readonly cells: Cell[];
    readonly minCol: number;
    readonly maxCol: number;
    readonly minRow: number;
    readonly maxRow: number;
  }

  const sampled: Sampled[] = [];
  for (const corridor of built.values()) {
    const cells: Cell[] = [];
    for (let at = 0; at < corridor.cells.length; at += STRIDE) {
      cells.push(corridor.cells[at] as Cell);
    }
    if (cells.length === 0) continue;
    sampled.push({
      id: corridor.spec.id,
      cells,
      minCol: Math.min(...cells.map((cell) => cell.col)),
      maxCol: Math.max(...cells.map((cell) => cell.col)),
      minRow: Math.min(...cells.map((cell) => cell.row)),
      maxRow: Math.max(...cells.map((cell) => cell.row)),
    });
  }

  const apart = (left: Sampled, right: Sampled) =>
    Math.max(0, Math.max(left.minCol - right.maxCol, right.minCol - left.maxCol)) >
      GAP_LIMIT_CELLS ||
    Math.max(0, Math.max(left.minRow - right.maxRow, right.minRow - left.maxRow)) >
      GAP_LIMIT_CELLS;

  const links: { id: string; cells: Cell[] }[] = [];
  let considered = 0;

  for (let first = 0; first < sampled.length; first++) {
    for (let second = first + 1; second < sampled.length; second++) {
      const left = sampled[first] as Sampled;
      const right = sampled[second] as Sampled;
      // Bounding boxes settle almost every pair without touching a cell.
      if (apart(left, right)) continue;
      considered++;

      let bestGap = Number.POSITIVE_INFINITY;
      let from: Cell | null = null;
      let to: Cell | null = null;
      for (const leftCell of left.cells) {
        for (const rightCell of right.cells) {
          const gap = Math.hypot(leftCell.col - rightCell.col, leftCell.row - rightCell.row);
          if (gap < bestGap) {
            bestGap = gap;
            from = leftCell;
            to = rightCell;
          }
        }
      }
      // Already touching: the declared join covers it.
      if (from === null || to === null || bestGap <= 2 || bestGap > GAP_LIMIT_CELLS) continue;

      const parent = built.get(left.id);
      const child = built.get(right.id);
      if (parent === undefined || child === undefined) continue;

      const line = routeThroughWater(grid, from, to, { margin: 200 });
      if (line === null) {
        warnings.push(`link ${left.id} <-> ${right.id}: no water route between them`);
        continue;
      }
      parent.junctions.add(parent.cells.findIndex((cell) => cell.col === from.col && cell.row === from.row));
      child.junctions.add(child.cells.findIndex((cell) => cell.col === to.col && cell.row === to.row));
      links.push({ id: `link-${left.id}-${right.id}`, cells: line });
    }
  }

  log(`  ${considered} corridor pairs within reach, ${links.length} links added`);
  return links;
};

/** One published harbour-to-harbour leg, traced through water. */
interface BuiltEdge {
  readonly from: string;
  readonly to: string;
  readonly publishedNm: number;
  readonly line: LonLat[];
}

/**
 * Traces the short legs nwcruising.net publishes a distance for.
 *
 * The named corridors describe the water a navigator would name; they do
 * not, on their own, say which harbours are a morning apart. That is what
 * the distance tables are for, and without it the network comes out as a
 * tree — Port McNeill and Sointula sit four miles apart across Broughton
 * Strait and were thirty apart over the mesh, because no corridor runs
 * between them.
 *
 * Only the short legs are traced. Local connectivity is what the mesh
 * lacks, and once it is there a long passage composes from short ones
 * without needing its own line.
 */
const traceHarbourEdges = (
  grid: WaterGrid,
  locations: readonly LocationRecord[],
  harbourCells: ReadonlyMap<string, Cell>,
  warnings: string[],
  log: (message: string) => void
): BuiltEdge[] => {
  const published = readJson<{ from: string; to: string; nm: number }[]>("edges.json");
  const bySlug = new Map(locations.map((location) => [location.slug, location] as const));

  // One entry per unordered pair, keeping the shorter published figure
  // where the two directions disagree.
  const pairs = new Map<string, { from: string; to: string; nm: number }>();
  for (const edge of published) {
    if (!harbourCells.has(edge.from) || !harbourCells.has(edge.to)) continue;
    if (!Number.isFinite(edge.nm) || edge.nm <= 0 || edge.nm > EDGE_CAP_NM) continue;
    const key = [edge.from, edge.to].sort((left, right) => left.localeCompare(right)).join("|");
    const seen = pairs.get(key);
    if (seen === undefined || edge.nm < seen.nm) {
      pairs.set(key, { from: edge.from, to: edge.to, nm: edge.nm });
    }
  }
  log(`\ntracing ${pairs.size} published legs up to ${EDGE_CAP_NM} nm`);

  const edges: BuiltEdge[] = [];
  let failed = 0;
  for (const pair of pairs.values()) {
    const start = harbourCells.get(pair.from) as Cell;
    const finish = harbourCells.get(pair.to) as Cell;
    const path = routeThroughWater(grid, start, finish);
    if (path === null) {
      failed++;
      warnings.push(`edge ${pair.from} -> ${pair.to}: no water route`);
      continue;
    }
    const line = stringPullThroughWater(grid, path, MAX_DEVIATION_CELLS).map((cell) =>
      cellToLonLat(grid, cell)
    );
    // Terminate on the published positions, which are the harbour nodes
    // the spurs also end on, so the graph joins up without any snapping.
    const from = bySlug.get(pair.from) as LocationRecord;
    const to = bySlug.get(pair.to) as LocationRecord;
    edges.push({
      from: pair.from,
      to: pair.to,
      publishedNm: pair.nm,
      line: [[from.lon, from.lat], ...line, [to.lon, to.lat]],
    });
  }
  log(`  ${edges.length} traced, ${failed} with no water route`);
  return edges;
};

const main = () => {
  const log = (message: string) => console.log(message);
  const started = Date.now();

  const locations = loadLocations();
  log(`${locations.length} locations`);

  const grid = buildWaterGrid({
    cacheDir: CACHE_DIR,
    inlandDir: INLAND_DIR,
    seeds: SEEDS,
    inland: INLAND,
    patches: PATCHES,
    mustBeDry: MUST_BE_DRY,
    log,
  });

  const warnings: string[] = [];
  const built = new Map<string, BuiltCorridor>();

  const nearestOnCorridor = (corridor: BuiltCorridor, target: Cell) => {
    let bestIndex = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let position = 0; position < corridor.cells.length; position++) {
      const cell = corridor.cells[position] as Cell;
      const distance = (cell.col - target.col) ** 2 + (cell.row - target.row) ** 2;
      if (distance < best) {
        best = distance;
        bestIndex = position;
      }
    }
    return { index: bestIndex, cell: corridor.cells[bestIndex] as Cell };
  };

  log(`\ntracing ${SPECS.length} corridors through the water raster`);
  /** Traces each corridor, joined to whatever it branches from. */
  const traceCorridors = () => {
    for (const spec of orderByDependency(SPECS)) {
      const controls: Cell[] = [];
      for (const point of spec.path) {
        const landed = snapToWater(grid, point[0], point[1], { maxCells: 70, wantClearance: 2 });
        if (landed === null) {
          warnings.push(`${spec.id}: control point ${point.join(",")} is nowhere near water`);
          continue;
        }
        // Warn on how far the point was from *any* water, not on how far
        // it then walked to mid-channel: the first is my mistake, the
        // second is the builder doing its job.
        const offWater = haversineNm(point, cellToLonLat(grid, landed)) * 1852;
        const centred = centreInChannel(grid, landed, 12);
        if (offWater > 500) {
          const [lon, lat] = cellToLonLat(grid, centred);
          // The suggestion is the mid-channel cell the builder actually
          // used, so a warning can be closed by pasting it back — after
          // checking on a chart that it is the intended channel and not
          // the next inlet over.
          warnings.push(
            `${spec.id}: control point [${point[0]}, ${point[1]}] is ${Math.round(offWater)} m ` +
              `from any water — mid-channel is [${round(lon)}, ${round(lat)}]`
          );
        }
        controls.push(centred);
      }
      if (controls.length < 2) {
        warnings.push(`${spec.id}: fewer than two usable control points, skipped`);
        continue;
      }

      let cells: Cell[] = [];
      const append = (segment: readonly Cell[]) => {
        for (const cell of segment) {
          const last = cells.at(-1);
          if (last?.col === cell.col && last.row === cell.row) continue;
          cells.push(cell);
        }
      };

      let failed = false;
      for (let leg = 0; leg + 1 < controls.length; leg++) {
        const segment = routeThroughWater(grid, controls[leg] as Cell, controls[leg + 1] as Cell);
        if (segment === null) {
          warnings.push(`${spec.id}: no water route between control points ${leg} and ${leg + 1}`);
          failed = true;
          break;
        }
        append(segment);
      }
      if (failed || cells.length < 2) continue;

      // Join to whatever this corridor branches from, so the two share an
      // exact vertex instead of merely passing close to one another.
      const attach = (parentId: string | undefined, atStart: boolean) => {
        if (parentId === undefined) return;
        const parent = built.get(parentId);
        if (parent === undefined) {
          warnings.push(`${spec.id}: parent ${parentId} was not built`);
          return;
        }
        const own = (atStart ? cells[0] : cells.at(-1)) as Cell;
        const { index, cell } = nearestOnCorridor(parent, own);
        // link runs parent -> own.
        const link = routeThroughWater(grid, cell, own, { margin: 300 });
        if (link === null) {
          warnings.push(`${spec.id}: could not trace a join to ${parentId}`);
          return;
        }
        parent.junctions.add(index);
        if (atStart) {
          cells = [...link.slice(0, -1), ...cells];
        } else {
          for (let step = link.length - 2; step >= 0; step--) cells.push(link[step] as Cell);
        }
      };
      attach(spec.startsOn, true);
      attach(spec.endsOn, false);
      const trimmed = removeLoops(cells, grid.cols);
      if (trimmed.length < cells.length) {
        warnings.push(
          `${spec.id}: trimmed ${cells.length - trimmed.length} cells where the track doubled back`
        );
      }
      cells = trimmed;

      built.set(spec.id, {
        spec,
        cells,
        junctions: new Set<number>([0, cells.length - 1]),
        passIds: new Set(spec.passId === undefined ? [] : [spec.passId]),
        obstructionIds: new Set(spec.obstructionIds ?? []),
      });
      log(`  ${spec.id.padEnd(28)} ${String(cells.length).padStart(6)} cells`);
    }
  };
  traceCorridors();

  log("\njoining corridors that run close to one another");
  for (const link of linkNearbyCorridors(grid, built, warnings, log)) {
    built.set(link.id, {
      spec: {
        id: link.id,
        name: "Open water link",
        corridorClass: "secondary",
        note: "Generated: open water joining two named channels that pass close by.",
        path: [],
      },
      cells: link.cells,
      junctions: new Set<number>([0, link.cells.length - 1]),
      passIds: new Set<string>(),
      obstructionIds: new Set<string>(),
    });
  }


  // Spurs: every harbour finds its own way out to the network.
  const owner = new Map<number, string>();
  const ownerIndex = new Map<number, number>();
  for (const corridor of built.values()) {
    for (let position = 0; position < corridor.cells.length; position++) {
      const cell = corridor.cells[position] as Cell;
      const index = cell.row * grid.cols + cell.col;
      if (!owner.has(index)) {
        owner.set(index, corridor.spec.id);
        ownerIndex.set(index, position);
      }
    }
  }

  const spurs: BuiltSpur[] = [];
    const harbourCells = new Map<string, Cell>();

  log(`\ntracing ${locations.length} harbour spurs`);
  /** Traces one entrance spur per harbour, out to the nearest corridor. */
  const traceSpurs = () => {
    for (const location of locations) {
      const harbour = snapToWater(grid, location.lon, location.lat, {
        maxCells: 90,
        wantClearance: 1,
      });
      if (harbour === null) {
        warnings.push(`${location.slug}: no navigable water within 7 km of its published position`);
        continue;
      }
      harbourCells.set(location.slug, harbour);
    const moved = haversineNm([location.lon, location.lat], cellToLonLat(grid, harbour)) * 1852;
      if (moved > 500) {
        warnings.push(
          `${location.slug}: published position is ${Math.round(moved)} m from the nearest water`
        );
      }

      const path = routeToNearestTarget(grid, harbour, (index) => owner.has(index));
      if (path === null) {
        warnings.push(`${location.slug}: could not reach any corridor`);
        continue;
      }

      const junctionCell = path[0] as Cell;
      const junctionIndex = junctionCell.row * grid.cols + junctionCell.col;
      const corridorId = owner.get(junctionIndex);
      const corridor = corridorId === undefined ? undefined : built.get(corridorId);
      if (corridor === undefined || corridorId === undefined) {
        warnings.push(`${location.slug}: spur landed on an unowned cell`);
        continue;
      }
      corridor.junctions.add(ownerIndex.get(junctionIndex) as number);

      // Corridor first, harbour last, finishing at the published position
      // so the graph actually terminates at the harbour.
      const line = stringPullThroughWater(grid, path, MAX_DEVIATION_CELLS).map((cell) =>
        cellToLonLat(grid, cell)
      );
      const last = line.at(-1) as LonLat;
      // How far the harbour's published position is from the last cell the
      // search could prove was water. Usually metres; occasionally a
      // kilometre or more, where the entrance is finer than the raster or
      // the published position is simply inland of its own shoreline. That
      // last leg is a straight line, not traced water, and saying so in
      // the data is better than hoping nobody leans on it.
      const harbourLegMetres = Math.round(haversineNm(last, [location.lon, location.lat]) * 1852);
      if (last[0] !== location.lon || last[1] !== location.lat) line.push([location.lon, location.lat]);
      spurs.push({ location, corridorId, line, harbourLegMetres });
    }
  };
  traceSpurs();
  const harbourEdges = traceHarbourEdges(grid, locations, harbourCells, warnings, log);

  log(`  ${spurs.length}/${locations.length} spurs traced`);

  // Passes and bridges belong to whichever corridor runs past them.
  const corridorList = [...built.values()];
  const passes = readJson<{ id: string; name: string; lat: number; lon: number; maxKnots?: number }[]>(
    "passes.json"
  );
  const obstructions = readJson<
    { id: string; name: string; lat: number; lon: number; clearanceFeet: number; opens: boolean }[]
  >("obstructions.json");

  const passOwner = attachMarkers(grid, corridorList, passes, 2, (corridor, id) =>
    corridor.passIds.add(id)
  );
  // A pass whose published position is a rounded-off degree can sit
  // further from the traced channel than the search allows — Swinomish
  // is named at 122°32'W and dredged at 122°30'W. Where a corridor has
  // already declared the pass by hand, take its word for it.
  for (const corridor of corridorList) {
    for (const passId of corridor.passIds) {
      if (!passOwner.has(passId)) passOwner.set(passId, corridor.spec.id);
    }
  }
  const obstructionOwner = attachMarkers(grid, corridorList, obstructions, 0.6, (corridor, id) =>
    corridor.obstructionIds.add(id)
  );
  log(
    `\n${passOwner.size}/${passes.length} passes and ${obstructionOwner.size}/${obstructions.length} bridges attached`
  );

  // Emit.
  const corridorLines = new Map<string, LonLat[]>();
  for (const corridor of corridorList) {
    corridorLines.set(corridor.spec.id, dressCorridor(grid, corridor.cells, corridor.junctions));
  }

  const features: unknown[] = [];
  for (const corridor of corridorList) {
    const line = corridorLines.get(corridor.spec.id) as LonLat[];
    features.push({
      type: "Feature",
      properties: {
        kind: "corridor",
        id: corridor.spec.id,
        name: corridor.spec.name,
        corridorClass: corridor.spec.corridorClass,
        zone: corridor.spec.zone ?? null,
        passIds: [...corridor.passIds].sort((left, right) => left.localeCompare(right)),
        obstructionIds: [...corridor.obstructionIds].sort((left, right) => left.localeCompare(right)),
        lengthNm: Math.round(lengthNm(line) * 10) / 10,
        note: corridor.spec.note ?? null,
      },
      geometry: {
        type: "LineString",
        coordinates: line.map(([lon, lat]) => [round(lon), round(lat)]),
      },
    });
  }
  for (const spur of spurs) {
    features.push({
      type: "Feature",
      properties: {
        kind: "spur",
        id: `spur-${spur.location.slug}`,
        slug: spur.location.slug,
        name: `${spur.location.name} entrance`,
        corridorId: spur.corridorId,
        lengthNm: Math.round(lengthNm(spur.line) * 100) / 100,
        harbourLegMetres: spur.harbourLegMetres,
      },
      geometry: {
        type: "LineString",
        coordinates: spur.line.map(([lon, lat]) => [round(lon), round(lat)]),
      },
    });
  }
  for (const edge of harbourEdges) {
    features.push({
      type: "Feature",
      properties: {
        kind: "edge",
        id: `edge-${edge.from}-${edge.to}`,
        from: edge.from,
        to: edge.to,
        publishedNm: edge.publishedNm,
        lengthNm: Math.round(lengthNm(edge.line) * 10) / 10,
      },
      geometry: {
        type: "LineString",
        coordinates: edge.line.map(([lon, lat]) => [round(lon), round(lat)]),
      },
    });
  }
  for (const location of locations) {
    features.push({
      type: "Feature",
      properties: {
        kind: "harbour",
        id: location.slug,
        slug: location.slug,
        name: location.name,
        region: location.region,
      },
      geometry: { type: "Point", coordinates: [round(location.lon), round(location.lat)] },
    });
  }
  for (const pass of passes) {
    features.push({
      type: "Feature",
      properties: {
        kind: "pass",
        id: pass.id,
        name: pass.name,
        corridorId: passOwner.get(pass.id) ?? null,
        maxKnots: pass.maxKnots ?? null,
      },
      geometry: { type: "Point", coordinates: [round(pass.lon), round(pass.lat)] },
    });
  }

  // The one check that matters: does any emitted line cross land? The
  // string pull only ever accepts legs it has proved wet, so a hit here
  // means a bug or a bad water patch, not a rounding artefact.
  const dryRun = (line: readonly LonLat[], skipLastSegment: boolean): number => {
    let dry = 0;
    const limit = skipLastSegment ? line.length - 2 : line.length - 1;
    for (let index = 0; index < limit; index++) {
      const start = line[index] as LonLat;
      const finish = line[index + 1] as LonLat;
      const steps = Math.max(
        1,
        Math.ceil((haversineNm(start, finish) * 1852) / (CELL_METRES / 2))
      );
      for (let step = 0; step <= steps; step++) {
        const along = step / steps;
        const col = grid.col(start[0] + along * (finish[0] - start[0]));
        const row = grid.row(start[1] + along * (finish[1] - start[1]));
        if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
        if (grid.water[row * grid.cols + col] !== 1) dry++;
      }
    }
    return dry;
  };

  let dryFeatures = 0;
  for (const corridor of corridorList) {
    const dry = dryRun(corridorLines.get(corridor.spec.id) as LonLat[], false);
    if (dry > 0) {
      dryFeatures++;
      warnings.push(`${corridor.spec.id}: ${dry} sampled points fall on land`);
    }
  }
  for (const spur of spurs) {
    // The last leg runs to the harbour's published position, which is
    // often a berth inside a breakwater and so "land" to the raster.
    const dry = dryRun(spur.line, true);
    if (dry > 0) {
      dryFeatures++;
      warnings.push(`spur-${spur.location.slug}: ${dry} sampled points fall on land`);
    }
  }
  log(`land check: ${dryFeatures} feature(s) cross land`);

  const components = countComponents([
    ...corridorLines.values(),
    ...spurs.map((spur) => spur.line),
    ...harbourEdges.map((edge) => edge.line),
  ]);
  const stray = components.length - 1;
  log(
    `\nconnectivity: ${components.length} component(s), largest holds ${components[0]} of ` +
      `${components.reduce((total, size) => total + size, 0)} vertices`
  );
  if (stray > 0) warnings.push(`mesh is in ${components.length} pieces, not one connected network`);

  const collection = {
    type: "FeatureCollection",
    name: "salish-mesh",
    metadata: {
      description:
        "Navigable-water network for the Salish Sea and the BC Inside Passage: deep-water " +
        "corridors, tidal passes, and an entrance spur for every harbour in the planner.",
      generatedBy: "scripts/build-mesh.ts",
      shorelineSource: "OpenStreetMap coastline (ODbL), rasterised at 80 m",
      caution:
        "A planning aid, not a chart. Corridors follow the middle of navigable water as OSM " +
        "describes the shoreline; they carry no soundings and clear no rocks. Navigate from " +
        "current charts.",
      corridorCount: corridorList.length,
      spurCount: spurs.length,
      edgeCount: harbourEdges.length,
      harbourCount: locations.length,
      components: components.length,
    },
    features,
  };

  writeFileSync(OUT_PATH, JSON.stringify(collection));
  writeFileSync(
    join(process.cwd(), "scripts", "mesh", ".build-warnings.txt"),
    `${warnings.join("\n")}\n`
  );

  log(`\n${warnings.length} warnings (scripts/mesh/.build-warnings.txt)`);
  for (const warning of warnings.slice(0, 60)) log(`  ! ${warning}`);
  const megabytes = (JSON.stringify(collection).length / 1e6).toFixed(2);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(
    `\nwrote ${OUT_PATH} — ${features.length} features, ${megabytes} MB, ${seconds}s`
  );
};

main();
