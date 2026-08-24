/**
 * A* through the water raster, biased towards the middle of the channel.
 *
 * A shortest path in open water hugs every headland, which is a fine
 * line on a map and a poor one to hand a navigator. The clearance term
 * pushes the track off the beach wherever there is room to be off it,
 * and relaxes automatically where there isn't — which is exactly how a
 * narrow pass should be drawn.
 */
import { CELL_METRES, type WaterGrid } from "./water-grid";

/** How far off the shore a corridor tries to sit, in cells (~800 m). */
const COMFORT_CELLS = 10;
/** Cost multiplier at the water's edge relative to mid-channel. */
const SHORE_PENALTY = 8;

const DIAGONAL = Math.SQRT2;

const stepWeight = (clearance: number): number => {
  const short = COMFORT_CELLS - Math.min(clearance, COMFORT_CELLS);
  const ratio = short / COMFORT_CELLS;
  return 1 + SHORE_PENALTY * ratio * ratio;
};

/** Binary heap keyed by f-score; values are local cell indices. */
class MinHeap {
  private keys: Float64Array;
  private values: Int32Array;
  private size = 0;

  constructor(capacity: number) {
    this.keys = new Float64Array(capacity);
    this.values = new Int32Array(capacity);
  }

  private grow() {
    const keys = new Float64Array(this.keys.length * 2);
    const values = new Int32Array(this.values.length * 2);
    keys.set(this.keys);
    values.set(this.values);
    this.keys = keys;
    this.values = values;
  }

  push(key: number, value: number) {
    if (this.size === this.keys.length) this.grow();
    let i = this.size++;
    this.keys[i] = key;
    this.values[i] = value;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.keys[parent] as number) <= (this.keys[i] as number)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.values[0] as number;
    this.size--;
    if (this.size > 0) {
      this.keys[0] = this.keys[this.size] as number;
      this.values[0] = this.values[this.size] as number;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.size && (this.keys[left] as number) < (this.keys[smallest] as number)) {
          smallest = left;
        }
        if (right < this.size && (this.keys[right] as number) < (this.keys[smallest] as number)) {
          smallest = right;
        }
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    const key = this.keys[a] as number;
    const value = this.values[a] as number;
    this.keys[a] = this.keys[b] as number;
    this.values[a] = this.values[b] as number;
    this.keys[b] = key;
    this.values[b] = value;
  }

  get length() {
    return this.size;
  }
}

export interface Cell {
  readonly col: number;
  readonly row: number;
}

/**
 * Walks uphill on the clearance field to the middle of whatever channel
 * the cell is already in.
 *
 * A control point placed a kilometre off still names the right body of
 * water; snapping it to the nearest wet cell puts it against the beach,
 * where the shore penalty then bends the whole corridor. Climbing to the
 * local clearance maximum lands it mid-channel instead, and because the
 * climb only ever steps through water it cannot cross into the next
 * inlet over.
 */
export const centreInChannel = (grid: WaterGrid, start: Cell, maxSteps: number): Cell => {
  let cell = start;
  for (let step = 0; step < maxSteps; step++) {
    // Stop as soon as there is sea room. Climbing all the way to the
    // local maximum walks a point placed in Agate Passage out of the
    // pass and into Port Madison, where the water is simply wider.
    if ((grid.clearance[cell.row * grid.cols + cell.col] as number) >= COMFORT_CELLS) break;
    let best = cell;
    let bestClearance = grid.clearance[cell.row * grid.cols + cell.col] as number;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const col = cell.col + dx;
        const row = cell.row + dy;
        if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
        const index = row * grid.cols + col;
        if (grid.water[index] !== 1) continue;
        const clearance = grid.clearance[index] as number;
        if (clearance > bestClearance) {
          bestClearance = clearance;
          best = { col, row };
        }
      }
    }
    if (best === cell) break;
    cell = best;
  }
  return cell;
};

/** Nearest water cell to a position, preferring one with room around it. */
export const snapToWater = (
  grid: WaterGrid,
  lon: number,
  lat: number,
  options: {
    readonly maxCells?: number;
    readonly wantClearance?: number;
    /** Climb to mid-channel afterwards, at most this many cells. */
    readonly centreWithin?: number;
  } = {}
): Cell | null => {
  const maxCells = options.maxCells ?? 60;
  const want = options.wantClearance ?? 1;
  const col0 = grid.col(lon);
  const row0 = grid.row(lat);

  let best: Cell | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let radius = 0; radius <= maxCells; radius++) {
    // Once something acceptable is found, finish the ring it was found
    // on and stop: anything further out is strictly worse.
    if (best !== null && radius > bestScore + 2) break;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const col = col0 + dx;
        const row = row0 + dy;
        if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
        const index = row * grid.cols + col;
        if (grid.water[index] !== 1) continue;
        const clearance = grid.clearance[index] as number;
        const distance = Math.hypot(dx, dy);
        const shortfall = Math.max(0, want - clearance);
        const score = distance + shortfall * 3;
        if (score < bestScore) {
          bestScore = score;
          best = { col, row };
        }
      }
    }
  }

  if (best === null) return null;
  return options.centreWithin === undefined
    ? best
    : centreInChannel(grid, best, options.centreWithin);
};

export interface RouteOptions {
  /** Extra cells of search window beyond the endpoints' bounding box. */
  readonly margin?: number;
  /** Give up after this many pops, so a mistake cannot hang the build. */
  readonly maxExpansions?: number;
}

/**
 * Traces water between two cells, returning the cells the track passes
 * through, or null when they are not connected inside the window.
 *
 * Searching a window rather than the whole 80-million-cell grid is what
 * keeps this fast enough to run a few hundred times; the window grows
 * and the search retries when a leg needs to detour further than the
 * straight line between its ends suggested.
 */
export const routeThroughWater = (
  grid: WaterGrid,
  start: Cell,
  goal: Cell,
  options: RouteOptions = {}
): Cell[] | null => {
  const spanCols = Math.abs(goal.col - start.col);
  const spanRows = Math.abs(goal.row - start.row);
  let margin = options.margin ?? Math.max(90, Math.round(0.45 * Math.max(spanCols, spanRows)));

  for (let attempt = 0; attempt < 4; attempt++, margin *= 2) {
    const path = searchWindow(grid, start, goal, margin, options.maxExpansions ?? 40_000_000);
    if (path !== null) return path;
  }
  return null;
};

const searchWindow = (
  grid: WaterGrid,
  start: Cell,
  goal: Cell,
  margin: number,
  maxExpansions: number
): Cell[] | null => {
  const x0 = Math.max(0, Math.min(start.col, goal.col) - margin);
  const x1 = Math.min(grid.cols - 1, Math.max(start.col, goal.col) + margin);
  const y0 = Math.max(0, Math.min(start.row, goal.row) - margin);
  const y1 = Math.min(grid.rows - 1, Math.max(start.row, goal.row) + margin);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const cells = width * height;

  const gScore = new Float64Array(cells).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(cells).fill(-1);
  const closed = new Uint8Array(cells);

  const local = (col: number, row: number) => (row - y0) * width + (col - x0);
  const startLocal = local(start.col, start.row);
  const goalLocal = local(goal.col, goal.row);

  const heuristic = (index: number) => {
    const col = (index % width) + x0;
    const row = ((index - (index % width)) / width) + y0;
    const dx = Math.abs(col - goal.col);
    const dy = Math.abs(row - goal.row);
    return (Math.max(dx, dy) + (DIAGONAL - 1) * Math.min(dx, dy)) * CELL_METRES;
  };

  const open = new MinHeap(1 << 16);
  gScore[startLocal] = 0;
  open.push(heuristic(startLocal), startLocal);

  let expansions = 0;
  while (open.length > 0) {
    const current = open.pop();
    if (closed[current] === 1) continue;
    closed[current] = 1;
    if (current === goalLocal) break;
    if (++expansions > maxExpansions) return null;

    const localCol = current % width;
    const localRow = (current - localCol) / width;
    const col = localCol + x0;
    const row = localRow + y0;
    const base = gScore[current] as number;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nextCol = col + dx;
        const nextRow = row + dy;
        if (nextCol < x0 || nextCol > x1 || nextRow < y0 || nextRow > y1) continue;
        const globalIndex = nextRow * grid.cols + nextCol;
        if (grid.water[globalIndex] !== 1) continue;
        // No corner-cutting: both orthogonal neighbours must be water,
        // or the track slips diagonally between two touching rocks.
        if (dx !== 0 && dy !== 0) {
          if (grid.water[row * grid.cols + nextCol] !== 1) continue;
          if (grid.water[nextRow * grid.cols + col] !== 1) continue;
        }
        const nextLocal = local(nextCol, nextRow);
        if (closed[nextLocal] === 1) continue;

        const distance = (dx !== 0 && dy !== 0 ? DIAGONAL : 1) * CELL_METRES;
        const tentative = base + distance * stepWeight(grid.clearance[globalIndex] as number);
        if (tentative < (gScore[nextLocal] as number)) {
          gScore[nextLocal] = tentative;
          cameFrom[nextLocal] = current;
          open.push(tentative + heuristic(nextLocal), nextLocal);
        }
      }
    }
  }

  if (closed[goalLocal] !== 1) return null;

  const path: Cell[] = [];
  for (let index = goalLocal; index !== -1; index = cameFrom[index] as number) {
    const localCol = index % width;
    const localRow = (index - localCol) / width;
    path.push({ col: localCol + x0, row: localRow + y0 });
    if (index === startLocal) break;
  }
  return path.reverse();
};

/**
 * Dijkstra out from a cell until it reaches any cell the predicate
 * accepts — how a harbour finds the corridor it should hang off, rather
 * than being told which one in advance.
 */
export const routeToNearestTarget = (
  grid: WaterGrid,
  start: Cell,
  isTarget: (index: number) => boolean,
  options: { readonly startRadius?: number; readonly maxRadius?: number } = {}
): Cell[] | null => {
  let radius = options.startRadius ?? 150;
  const maxRadius = options.maxRadius ?? 2400;

  for (; radius <= maxRadius; radius *= 2) {
    const x0 = Math.max(0, start.col - radius);
    const x1 = Math.min(grid.cols - 1, start.col + radius);
    const y0 = Math.max(0, start.row - radius);
    const y1 = Math.min(grid.rows - 1, start.row + radius);
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;

    const gScore = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
    const cameFrom = new Int32Array(width * height).fill(-1);
    const closed = new Uint8Array(width * height);
    const local = (col: number, row: number) => (row - y0) * width + (col - x0);

    const open = new MinHeap(1 << 14);
    const startLocal = local(start.col, start.row);
    gScore[startLocal] = 0;
    open.push(0, startLocal);

    let found = -1;
    while (open.length > 0) {
      const current = open.pop();
      if (closed[current] === 1) continue;
      closed[current] = 1;

      const localCol = current % width;
      const localRow = (current - localCol) / width;
      const col = localCol + x0;
      const row = localRow + y0;
      // The start itself can sit on a corridor; that is a harbour that
      // needs no spur, and the caller reads it off the one-cell path.
      if (current !== startLocal && isTarget(row * grid.cols + col)) {
        found = current;
        break;
      }
      const base = gScore[current] as number;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nextCol = col + dx;
          const nextRow = row + dy;
          if (nextCol < x0 || nextCol > x1 || nextRow < y0 || nextRow > y1) continue;
          const globalIndex = nextRow * grid.cols + nextCol;
          if (grid.water[globalIndex] !== 1) continue;
          if (dx !== 0 && dy !== 0) {
            if (grid.water[row * grid.cols + nextCol] !== 1) continue;
            if (grid.water[nextRow * grid.cols + col] !== 1) continue;
          }
          const nextLocal = local(nextCol, nextRow);
          if (closed[nextLocal] === 1) continue;
          const distance = (dx !== 0 && dy !== 0 ? DIAGONAL : 1) * CELL_METRES;
          const tentative = base + distance * stepWeight(grid.clearance[globalIndex] as number);
          if (tentative < (gScore[nextLocal] as number)) {
            gScore[nextLocal] = tentative;
            cameFrom[nextLocal] = current;
            open.push(tentative, nextLocal);
          }
        }
      }
    }

    if (found === -1) continue;

    const path: Cell[] = [];
    for (let index = found; index !== -1; index = cameFrom[index] as number) {
      const localCol = index % width;
      const localRow = (index - localCol) / width;
      path.push({ col: localCol + x0, row: localRow + y0 });
      if (index === startLocal) break;
    }
    // Corridor end first, harbour last.
    return path;
  }

  return null;
};

/**
 * Pulls a grid path straight: replaces runs of cells with the longest
 * straight leg that still stays in water and does not wander far from
 * the traced track.
 *
 * An 80 m raster search returns a staircase, and a plain Douglas–Peucker
 * either keeps the steps or cuts corners onto the beach. Testing each
 * candidate leg against the water itself gives a line that reads like a
 * course to steer and is still guaranteed wet.
 */
export const stringPullThroughWater = (
  grid: WaterGrid,
  cells: readonly Cell[],
  maxDeviationCells: number
): Cell[] => {
  if (cells.length <= 2) return [...cells];

  const clearOfLand = (a: Cell, b: Cell): boolean => {
    // Twice per cell. Sampling once per cell lets a leg clip the corner
    // of a headland between samples, which then shows up in the build's
    // land check as a handful of dry points.
    const steps = 2 * Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
    for (let step = 0; step <= steps; step++) {
      const t = steps === 0 ? 0 : step / steps;
      const col = Math.round(a.col + t * (b.col - a.col));
      const row = Math.round(a.row + t * (b.row - a.row));
      if (grid.water[row * grid.cols + col] !== 1) return false;
    }
    return true;
  };

  /**
   * How far a straightened leg may wander here. Open water can take the
   * full allowance; a dredged cut two cells wide cannot, or the leg
   * leaves the cut and the land check picks it up afterwards.
   */
  const allowance = (from: number, to: number): number => {
    let tightest = Number.POSITIVE_INFINITY;
    for (let i = from; i <= to; i++) {
      const cell = cells[i] as Cell;
      tightest = Math.min(tightest, grid.clearance[cell.row * grid.cols + cell.col] as number);
    }
    return Math.min(maxDeviationCells, Math.max(0.5, tightest - 0.5));
  };

  const strays = (from: number, to: number): boolean => {
    const a = cells[from] as Cell;
    const b = cells[to] as Cell;
    const dx = b.col - a.col;
    const dy = b.row - a.row;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return false;
    const limit = allowance(from, to);
    for (let i = from + 1; i < to; i++) {
      const point = cells[i] as Cell;
      const t = ((point.col - a.col) * dx + (point.row - a.row) * dy) / lengthSquared;
      const clamped = Math.max(0, Math.min(1, t));
      const offset = Math.hypot(
        point.col - (a.col + clamped * dx),
        point.row - (a.row + clamped * dy)
      );
      if (offset > limit) return true;
    }
    return false;
  };

  const out: Cell[] = [cells[0] as Cell];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let reach = anchor + 1;
    for (let candidate = anchor + 2; candidate < cells.length; candidate++) {
      if (!clearOfLand(cells[anchor] as Cell, cells[candidate] as Cell)) break;
      if (strays(anchor, candidate)) break;
      reach = candidate;
    }
    out.push(cells[reach] as Cell);
    anchor = reach;
  }
  return out;
};
