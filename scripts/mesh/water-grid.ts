/**
 * A raster of "where the salt water is", built from the cached OSM
 * coastline. The search that traces a channel through it lives in
 * ./router.ts.
 *
 * Working in a raster rather than in polygons is deliberate: assembling
 * clipped coastline ways into valid land polygons is fiddly and fails
 * exactly where this project cares most (island clusters, drying
 * passes), whereas painting the shoreline as a barrier and flooding
 * inwards from the open Pacific is hard to get wrong. What survives the
 * flood is water connected to the sea, which is the same question a
 * navigator asks.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Region {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;
}

/** Whole-region bounds: Olympia to Prince Rupert, Neah Bay to Hecate Strait. */
const FULL_REGION: Region = { minLat: 46.9, maxLat: 54.6, minLon: -130.9, maxLon: -121.9 };

/**
 * `MESH_REGION=minLon,minLat,maxLon,maxLat` shrinks the raster to one
 * area. Only for working on the builder itself — a clipped region seals
 * badly at its edges, so the flood leaks inland and the output is not
 * publishable.
 */
const readRegionOverride = (): Region | null => {
  const raw = process.env.MESH_REGION;
  if (raw === undefined || raw === "") return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error(`MESH_REGION must be minLon,minLat,maxLon,maxLat — got "${raw}"`);
  }
  return {
    minLon: parts[0] as number,
    minLat: parts[1] as number,
    maxLon: parts[2] as number,
    maxLat: parts[3] as number,
  };
};

export const REGION: Region = readRegionOverride() ?? FULL_REGION;

/** Target cell size. Small enough to keep Swinomish Channel open. */
export const CELL_METRES = 80;

const METRES_PER_DEGREE_LAT = 111_320;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export interface WaterGrid {
  readonly cols: number;
  readonly rows: number;
  readonly minLon: number;
  readonly minLat: number;
  readonly dLon: number;
  readonly dLat: number;
  /** 1 where salt water reached during the flood fill. */
  readonly water: Uint8Array;
  /** Cells to the nearest non-water cell, saturating at 255. */
  readonly clearance: Uint8Array;
  col(lon: number): number;
  row(lat: number): number;
  lon(col: number): number;
  lat(row: number): number;
}

const buildGeometry = (region: Region) => {
  const midLat = (region.minLat + region.maxLat) / 2;
  const dLat = CELL_METRES / METRES_PER_DEGREE_LAT;
  const dLon = CELL_METRES / (METRES_PER_DEGREE_LAT * Math.cos(toRadians(midLat)));
  const cols = Math.ceil((region.maxLon - region.minLon) / dLon);
  const rows = Math.ceil((region.maxLat - region.minLat) / dLat);
  return { dLat, dLon, cols, rows };
};

const loadCoastlineWays = (cacheDir: string): number[][] => {
  const files = readdirSync(cacheDir).filter((name) => name.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(
      `No coastline tiles in ${cacheDir}. Run \`npm run mesh:coastline\` first.`
    );
  }
  const byId = new Map<number, number[]>();
  for (const file of files) {
    const ways = JSON.parse(readFileSync(join(cacheDir, file), "utf8")) as {
      id: number;
      flat: number[];
    }[];
    for (const way of ways) if (!byId.has(way.id)) byId.set(way.id, way.flat);
  }
  return [...byId.values()];
};

/** 8-connected line, so it blocks any 4-connected flood trying to cross it. */
const drawLine = (
  blocked: Uint8Array,
  cols: number,
  rows: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) => {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;

  for (;;) {
    if (x >= 0 && x < cols && y >= 0 && y < rows) blocked[y * cols + x] = 1;
    if (x === x1 && y === y1) return;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
};

/**
 * A ribbon of water painted over the raster after the flood, for the
 * handful of channels narrower than a cell: the lock chambers, the
 * Fremont and Montlake cuts, the dredged Swinomish cut.
 *
 * Applied afterwards rather than as a hole in the shoreline barrier,
 * because a hole would let the flood through into the land behind it and
 * turn half of Washington into navigable water.
 */
export interface WaterPatch {
  readonly name: string;
  /** Half-width in cells painted either side of the line. */
  readonly widthCells: number;
  readonly path: readonly (readonly [number, number])[];
}

/** A lake or tidal river the coastline layer does not cover. */
export interface InlandWater {
  readonly name: string;
  /** A position known to be inside it. */
  readonly seed: readonly [number, number];
  /** Cap on the fill, so a seed that misses cannot flood the continent. */
  readonly maxCells?: number;
}

export const buildWaterGrid = (options: {
  readonly cacheDir: string;
  readonly inlandDir: string;
  readonly seeds: readonly (readonly [number, number])[];
  readonly inland: readonly InlandWater[];
  readonly patches: readonly WaterPatch[];
  /** Points that must come out dry, as a check that nothing leaked. */
  readonly mustBeDry: readonly (readonly [number, number])[];
  readonly log?: (message: string) => void;
}): WaterGrid => {
  const log = options.log ?? (() => {});
  const { dLat, dLon, cols, rows } = buildGeometry(REGION);
  log(`grid ${cols} x ${rows} = ${((cols * rows) / 1e6).toFixed(1)}M cells @ ${CELL_METRES} m`);

  const col = (lon: number) => Math.floor((lon - REGION.minLon) / dLon);
  const row = (lat: number) => Math.floor((lat - REGION.minLat) / dLat);
  const lon = (c: number) => REGION.minLon + (c + 0.5) * dLon;
  const lat = (r: number) => REGION.minLat + (r + 0.5) * dLat;

  const blocked = new Uint8Array(cols * rows);
  const ways = loadCoastlineWays(options.cacheDir);
  log(`rasterising ${ways.length} coastline ways`);

  /** Paints every coastline segment into `blocked` as a barrier. */
  const rasteriseShoreline = () => {
    let segments = 0;
    for (const flat of ways) {
      for (let i = 0; i + 3 < flat.length; i += 2) {
        const x0 = col(flat[i] as number);
        const y0 = row(flat[i + 1] as number);
        const x1 = col(flat[i + 2] as number);
        const y1 = row(flat[i + 3] as number);

        // Skip segments entirely outside the grid, but keep ones that
        // straddle the edge so the border stays sealed.
        if (
          (x0 < 0 && x1 < 0) ||
          (y0 < 0 && y1 < 0) ||
          (x0 >= cols && x1 >= cols) ||
          (y0 >= rows && y1 >= rows)
        ) {
          continue;
        }
        drawLine(blocked, cols, rows, x0, y0, x1, y1);
        segments++;
      }
    }
    log(`  ${segments} shoreline segments drawn`);
  };
  rasteriseShoreline();


  const collectSeaSideSeeds = (): number[] => {
    // Flood seeds taken from the coastline's own orientation. OSM draws a
    // coastline with the land on its left and the water on its right, so a
    // point a couple of hundred metres to starboard of the way's direction
    // of travel is at sea. Seeding per stretch of coast rather than only
    // from the open ocean is what puts water in the bays whose entrance is
    // narrower than a cell — Gorge Harbour, Von Donop, Squirrel Cove —
    // which the ocean flood can never swim into.
    //
    // The baseline is long on purpose: over one 80 m segment the bearing
    // is quantised to nothing useful, and a normal taken from it lands on
    // either side at random.
    const SEED_BASELINE_M = 400;
    const SEED_OFFSET_M = 200;
    const seaSide: number[] = [];

    for (const flat of ways) {
      const points = flat.length / 2;
      let i = 0;
      while (i < points - 1) {
        let j = i + 1;
        let run = 0;
        while (j < points && run < SEED_BASELINE_M) {
          const dLon =
            ((flat[2 * j] as number) - (flat[2 * (j - 1)] as number)) *
            Math.cos(toRadians(flat[2 * j + 1] as number));
          const dLat = (flat[2 * j + 1] as number) - (flat[2 * (j - 1) + 1] as number);
          run += Math.hypot(dLon, dLat) * METRES_PER_DEGREE_LAT;
          j++;
        }
        j = Math.min(j, points - 1);
        if (j <= i) break;

        const aLon = flat[2 * i] as number;
        const aLat = flat[2 * i + 1] as number;
        const bLon = flat[2 * j] as number;
        const bLat = flat[2 * j + 1] as number;
        const midLat = (aLat + bLat) / 2;
        const midLon = (aLon + bLon) / 2;
        const east = (bLon - aLon) * Math.cos(toRadians(midLat));
        const north = bLat - aLat;
        const length = Math.hypot(east, north);
        if (length > 0) {
          // Right-hand normal of the direction of travel.
          const offsetLat = ((-east / length) * SEED_OFFSET_M) / METRES_PER_DEGREE_LAT;
          const offsetLon =
            ((north / length) * SEED_OFFSET_M) /
            (METRES_PER_DEGREE_LAT * Math.cos(toRadians(midLat)));
          const seedCol = col(midLon + offsetLon);
          const seedRow = row(midLat + offsetLat);
          if (seedCol >= 0 && seedCol < cols && seedRow >= 0 && seedRow < rows) {
            seaSide.push(seedRow * cols + seedCol);
          }
        }
        i = j;
      }
    }
    log(`  ${seaSide.length} sea-side seeds from coastline orientation`);
    return seaSide;
  };
  const seaSide = collectSeaSideSeeds();


  const water = new Uint8Array(cols * rows);

  /** Floods inward from the open ocean, then checks nothing leaked. */
  const floodFromSea = () => {
    // Flood from the open sea. 4-connected on purpose: an 8-connected
    // flood squeezes through the diagonal gaps in the shoreline barrier
    // and floods entire islands.
    const stack = new Int32Array(cols * rows);
    let top = 0;
    for (const [seedLon, seedLat] of options.seeds) {
      const seedCol = col(seedLon);
      const seedRow = row(seedLat);
      // Silently wrapping an out-of-region seed onto some other row is how
      // a clipped test region ends up with almost no water in it.
      if (seedCol < 0 || seedCol >= cols || seedRow < 0 || seedRow >= rows) continue;
      const index = seedRow * cols + seedCol;
      if (blocked[index] === 1 || water[index] === 1) continue;
      water[index] = 1;
      stack[top++] = index;
    }
    if (top === 0) throw new Error("every flood-fill seed landed on a shoreline cell");

    let filled = 0;
    while (top > 0) {
      const index = stack[--top] as number;
      filled++;
      const x = index % cols;
      const y = (index - x) / cols;
      if (x > 0 && water[index - 1] === 0 && blocked[index - 1] === 0) {
        water[index - 1] = 1;
        stack[top++] = index - 1;
      }
      if (x + 1 < cols && water[index + 1] === 0 && blocked[index + 1] === 0) {
        water[index + 1] = 1;
        stack[top++] = index + 1;
      }
      if (y > 0 && water[index - cols] === 0 && blocked[index - cols] === 0) {
        water[index - cols] = 1;
        stack[top++] = index - cols;
      }
      if (y + 1 < rows && water[index + cols] === 0 && blocked[index + cols] === 0) {
        water[index + cols] = 1;
        stack[top++] = index + cols;
      }
    }
    log(
      `flood fill reached ${(filled / 1e6).toFixed(1)}M water cells ` +
        `(${((100 * filled) / (cols * rows)).toFixed(0)}% of the grid)`
    );

    // A gap anywhere in the shoreline barrier lets the flood inland, and
    // the result still looks like a plausible run — corridors trace, spurs
    // attach, nothing errors — while every line is drawn over dry land.
    // Checking a few points that are unambiguously mountain catches it.
    const wetLand: string[] = [];
    for (const [dryLon, dryLat] of options.mustBeDry) {
      const dryCol = col(dryLon);
      const dryRow = row(dryLat);
      if (dryCol < 0 || dryCol >= cols || dryRow < 0 || dryRow >= rows) continue;
      if (water[dryRow * cols + dryCol] === 1) wetLand.push(`${dryLon},${dryLat}`);
    }
    if (wetLand.length > 0) {
      // Reporting all of them, not just the first, is what distinguishes
      // one unclosed inlet from a barrier that has failed everywhere.
      throw new Error(
        `the flood fill reached ${wetLand.length} of ${options.mustBeDry.length} inland ` +
          `check points (${wetLand.join("; ")}), so the shoreline barrier has a gap. ` +
          `The flood covered ${((100 * filled) / (cols * rows)).toFixed(0)}% of the grid; ` +
          `anything above about 70% means it escaped inland. Usually a coastline tile that ` +
          `never downloaded: re-run \`npm run mesh:coastline\` and check its output for FAILED.`
      );
    }
  };
  floodFromSea();


  // Lakes and tidal rivers, each flooded inside its own polygon rings
  // and capped, so a seed that lands outside one cannot escape.
  const fillInlandWater = () => {
      const inlandBlocked = new Uint8Array(cols * rows);
      let inlandSegments = 0;
      for (const flat of loadCoastlineWays(options.inlandDir)) {
        for (let i = 0; i + 3 < flat.length; i += 2) {
          drawLine(
            inlandBlocked,
            cols,
            rows,
            col(flat[i] as number),
            row(flat[i + 1] as number),
            col(flat[i + 2] as number),
            row(flat[i + 3] as number)
          );
          inlandSegments++;
        }
      }
      log(`inland water: ${inlandSegments} ring segments`);

      for (const body of options.inland) {
        const cap = body.maxCells ?? 500_000;
        const seedCol = col(body.seed[0]);
        const seedRow = row(body.seed[1]);
        if (seedCol < 0 || seedCol >= cols || seedRow < 0 || seedRow >= rows) continue;
        const seedIndex = seedRow * cols + seedCol;
        if (inlandBlocked[seedIndex] === 1 || water[seedIndex] === 1) {
          log(`  ${body.name}: seed already blocked or wet, skipped`);
          continue;
        }
        const local = new Int32Array(cap);
        const seen = new Set<number>();
        let head = 0;
        let tail = 0;
        local[tail++] = seedIndex;
        seen.add(seedIndex);
        let overflowed = false;
        while (head < tail) {
          const index = local[head++] as number;
          const x = index % cols;
          const y = (index - x) / cols;
          const neighbours = [
            x > 0 ? index - 1 : -1,
            x + 1 < cols ? index + 1 : -1,
            y > 0 ? index - cols : -1,
            y + 1 < rows ? index + cols : -1,
          ];
          for (const next of neighbours) {
            if (next < 0 || inlandBlocked[next] === 1 || seen.has(next)) continue;
            if (tail >= cap) {
              overflowed = true;
              break;
            }
            seen.add(next);
            local[tail++] = next;
          }
          if (overflowed) break;
        }
        if (overflowed) {
          log(`  ${body.name}: fill exceeded ${cap} cells and was discarded`);
          continue;
        }
        for (const index of seen) water[index] = 1;
        log(`  ${body.name}: ${seen.size} cells`);
      }
    };
  if (options.inland.length > 0) fillInlandWater();


  const paintPatches = () => {
    // Dredged cuts and lock chambers, added on top of the flood.
    for (const patch of options.patches) {
      for (let i = 0; i + 1 < patch.path.length; i++) {
        const a = patch.path[i] as readonly [number, number];
        const b = patch.path[i + 1] as readonly [number, number];
        const steps = Math.max(
          1,
          Math.ceil(Math.hypot(col(b[0]) - col(a[0]), row(b[1]) - row(a[1])))
        );
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = Math.round(col(a[0]) + t * (col(b[0]) - col(a[0])));
          const cy = Math.round(row(a[1]) + t * (row(b[1]) - row(a[1])));
          for (let oy = -patch.widthCells; oy <= patch.widthCells; oy++) {
            for (let ox = -patch.widthCells; ox <= patch.widthCells; ox++) {
              const x = cx + ox;
              const y = cy + oy;
              if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
              water[y * cols + x] = 1;
            }
          }
        }
      }
    }

    if (options.patches.length > 0) log(`${options.patches.length} water patches applied`);
  };
  paintPatches();


  const openEnclosedBays = () => {
    // Bays whose entrance is narrower than a cell — Gorge Harbour, Von
    // Donop Inlet, Princess Louisa behind Malibu Rapids — are never
    // reached by the ocean flood, so their harbours end up with no water
    // around them at all. Each is filled separately, seeded from the
    // coastline's own orientation and bounded by the shoreline barrier.
    //
    // Every fill is capped. OSM's land-on-the-left convention is right
    // almost everywhere and wrong occasionally, and a single seed on the
    // wrong side of a misdrawn way would otherwise turn a whole landmass
    // into navigable water. A region that runs past the cap is thrown
    // away, and its cells are remembered so the next seed inside it costs
    // nothing.
    const BAY_CAP = 6_000;
    /**
     * How far to look for the sea when opening a bay's lost entrance.
     * Deliberately short: the barrier around a bay is one cell of
     * shoreline, so a real lost entrance shows up within two or three
     * cells. Reaching further would cut a channel through genuine land —
     * and because the cut counts as water afterwards, the build's own
     * land check could not tell.
     */
    const ENTRANCE_REACH = 3;
    const rejected = new Uint8Array(cols * rows);
    let baysOpened = 0;
    let baysRejected = 0;
    let baysLandlocked = 0;

    for (const seed of seaSide) {
      if (blocked[seed] === 1 || water[seed] === 1 || rejected[seed] === 1) continue;

      const seen: number[] = [seed];
      const visiting = new Set<number>([seed]);
      let head = 0;
      let overflowed = false;
      while (head < seen.length) {
        const index = seen[head++] as number;
        const x = index % cols;
        const y = (index - x) / cols;
        const neighbours = [
          x > 0 ? index - 1 : -1,
          x + 1 < cols ? index + 1 : -1,
          y > 0 ? index - cols : -1,
          y + 1 < rows ? index + cols : -1,
        ];
        for (const next of neighbours) {
          if (next < 0 || blocked[next] === 1 || water[next] === 1 || visiting.has(next)) continue;
          if (seen.length >= BAY_CAP) {
            overflowed = true;
            break;
          }
          visiting.add(next);
          seen.push(next);
        }
        if (overflowed) break;
      }

      if (overflowed) {
        baysRejected++;
        for (const index of visiting) rejected[index] = 1;
        continue;
      }
      for (const index of visiting) water[index] = 1;
      baysOpened++;

      // The bay is water now, but still walled off from the sea by the
      // one or two cells its entrance was lost in — so a boat could not
      // get there and the spur search would give up. Find the narrowest
      // gap between the new water and the old, and open it.
      let bestGap = Number.POSITIVE_INFINITY;
      let from = -1;
      let to = -1;
      for (const index of visiting) {
        const x = index % cols;
        const y = (index - x) / cols;
        for (let dy = -ENTRANCE_REACH; dy <= ENTRANCE_REACH && bestGap > 2; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= rows) continue;
          for (let dx = -ENTRANCE_REACH; dx <= ENTRANCE_REACH; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= cols) continue;
            const candidate = ny * cols + nx;
            if (water[candidate] !== 1 || visiting.has(candidate)) continue;
            const gap = Math.hypot(dx, dy);
            if (gap < bestGap) {
              bestGap = gap;
              from = index;
              to = candidate;
            }
          }
        }
      }
      if (from === -1 || to === -1) {
        baysLandlocked++;
        continue;
      }
      const fromX = from % cols;
      const fromY = (from - fromX) / cols;
      const toX = to % cols;
      const toY = (to - toX) / cols;
      const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
      for (let step = 0; step <= steps; step++) {
        const t = steps === 0 ? 0 : step / steps;
        const x = Math.round(fromX + t * (toX - fromX));
        const y = Math.round(fromY + t * (toY - fromY));
        water[y * cols + x] = 1;
      }
    }
    log(
      `${baysOpened} enclosed bays opened (${baysLandlocked} with no reachable entrance), ` +
        `${baysRejected} seeds rejected as land`
    );
  };
  openEnclosedBays();


  // Everything above adds water: lakes, dredged cuts, bays whose
  // entrance the raster lost. Some of it ends up walled off — a bay
  // whose entrance could not be found, a lake with no lock painted in —
  // and water a boat cannot reach is worse than no water at all, because
  // a control point or a harbour snaps into it and the search then has
  // nowhere to go. This last pass keeps only what is reachable from the
  // open sea, which is the invariant the rest of the build relies on.
  /**
   * Discards water the open sea cannot reach.
   */
  const keepOnlyReachable = () => {
      const reachable = new Uint8Array(cols * rows);
      const queue = new Int32Array(cols * rows);
      let head = 0;
      let tail = 0;
      for (const [seedLon, seedLat] of options.seeds) {
        const seedCol = col(seedLon);
        const seedRow = row(seedLat);
        if (seedCol < 0 || seedCol >= cols || seedRow < 0 || seedRow >= rows) continue;
        const index = seedRow * cols + seedCol;
        if (water[index] !== 1 || reachable[index] === 1) continue;
        reachable[index] = 1;
        queue[tail++] = index;
      }
      while (head < tail) {
        const index = queue[head++] as number;
        const x = index % cols;
        const y = (index - x) / cols;
        const neighbours = [
          x > 0 ? index - 1 : -1,
          x + 1 < cols ? index + 1 : -1,
          y > 0 ? index - cols : -1,
          y + 1 < rows ? index + cols : -1,
        ];
        for (const next of neighbours) {
          if (next < 0 || water[next] !== 1 || reachable[next] === 1) continue;
          reachable[next] = 1;
          queue[tail++] = next;
        }
      }
      let stranded = 0;
      for (let i = 0; i < water.length; i++) {
        if (water[i] === 1 && reachable[i] !== 1) {
          water[i] = 0;
          stranded++;
        }
      }
      log(`reachability: kept ${(tail / 1e6).toFixed(1)}M cells, dropped ${stranded} unreachable`);
    };
  keepOnlyReachable();


  const buildClearance = (): Uint8Array => {
    // Chamfer distance to the nearest non-water cell, in cells. Drives the
    // mid-channel preference in the search below.
    const clearance = new Uint8Array(cols * rows);
    const CAP = 255;
    for (let i = 0; i < clearance.length; i++) clearance[i] = water[i] === 1 ? CAP : 0;
    const relax = (index: number, from: number, cost: number) => {
      const candidate = (clearance[from] as number) + cost;
      if (candidate < (clearance[index] as number)) clearance[index] = candidate;
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (clearance[i] === 0) continue;
        if (x > 0) relax(i, i - 1, 1);
        if (y > 0) relax(i, i - cols, 1);
        if (y > 0 && x > 0) relax(i, i - cols - 1, 1);
        if (y > 0 && x + 1 < cols) relax(i, i - cols + 1, 1);
      }
    }
    for (let y = rows - 1; y >= 0; y--) {
      for (let x = cols - 1; x >= 0; x--) {
        const i = y * cols + x;
        if (clearance[i] === 0) continue;
        if (x + 1 < cols) relax(i, i + 1, 1);
        if (y + 1 < rows) relax(i, i + cols, 1);
        if (y + 1 < rows && x + 1 < cols) relax(i, i + cols + 1, 1);
        if (y + 1 < rows && x > 0) relax(i, i + cols - 1, 1);
      }
    }
    log("clearance transform done");
    return clearance;
  };
  const clearance = buildClearance();


  return { cols, rows, minLon: REGION.minLon, minLat: REGION.minLat, dLon, dLat, water, clearance, col, row, lon, lat };
};
