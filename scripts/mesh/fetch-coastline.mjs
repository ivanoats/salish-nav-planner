/**
 * Downloads OSM `natural=coastline` geometry for the Salish Sea and the
 * BC Inside Passage, and caches it as compact per-tile JSON.
 *
 * The mesh builder needs to know where the water actually is. Tracing
 * that from memory produces lines that look right at strait scale and
 * cut across islands at anchorage scale, so the shoreline comes from
 * OSM instead. Output is a local, regenerable cache (ODbL data, same
 * posture as data/raw) — not committed.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "data", "coastline");

/** Whole-region bounds: Olympia to Prince Rupert, Neah Bay to Hecate Strait. */
export const REGION = { minLat: 46.9, maxLat: 54.6, minLon: -130.9, maxLon: -121.9 };

const TILE_DEGREES = 1;
const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tileName = (lat, lon) => `coastline_${lat}_${lon}.json`.replaceAll("-", "m");

/** Overpass returns whole ways, so the same way lands in several tiles. */
const compactWays = (elements) => {
  const ways = [];
  for (const element of elements) {
    if (element.type !== "way" || !Array.isArray(element.geometry)) continue;
    const flat = [];
    for (const point of element.geometry) {
      if (point === null) continue; // clipped node, no coordinates
      flat.push(point.lon, point.lat);
    }
    if (flat.length >= 4) ways.push({ id: element.id, flat });
  }
  return ways;
};

const fetchBox = async (south, west, north, east) => {
  const query =
    `[out:json][timeout:180];` +
    `way["natural"="coastline"](${south},${west},${north},${east});` +
    `out geom;`;

  let lastError;
  for (let attempt = 0; attempt < 9; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass asks for a contactable agent; an anonymous flood is
          // what gets a client throttled to 502s in the first place.
          "User-Agent": "salish-nav-planner mesh builder (github.com/ivanoats)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return compactWays(json.elements ?? []);
    } catch (error) {
      lastError = error;
      // Overpass sheds load with 502/429 long before it refuses
      // outright, so back off hard rather than hammering a busy server.
      await sleep(Math.min(60_000, 4000 * 2 ** attempt));
    }
  }
  throw new Error(`box ${south},${west} failed after 9 attempts: ${lastError}`);
};

/**
 * One tile, falling back to its four quadrants.
 *
 * Overpass answers a whole-degree query over a dense coast with a 500 as
 * often as with data, and the same area asked for in quarters comes back
 * fine — the cost of assembling a tile is nothing next to the cost of a
 * gap in the shoreline barrier.
 */
const fetchTile = async (lat, lon) => {
  try {
    return await fetchBox(lat, lon, lat + TILE_DEGREES, lon + TILE_DEGREES);
  } catch {
    process.stdout.write(`    ${lat},${lon} whole-tile query failed, trying quadrants\n`);
    const half = TILE_DEGREES / 2;
    const byId = new Map();
    for (const [south, west] of [
      [lat, lon],
      [lat, lon + half],
      [lat + half, lon],
      [lat + half, lon + half],
    ]) {
      for (const way of await fetchBox(south, west, south + half, west + half)) {
        if (!byId.has(way.id)) byId.set(way.id, way);
      }
      await sleep(1500);
    }
    return [...byId.values()];
  }
};

const main = async () => {
  await mkdir(CACHE_DIR, { recursive: true });

  const tiles = [];
  for (let lat = Math.floor(REGION.minLat); lat < REGION.maxLat; lat += TILE_DEGREES) {
    for (let lon = Math.floor(REGION.minLon); lon < REGION.maxLon; lon += TILE_DEGREES) {
      tiles.push([lat, lon]);
    }
  }

  // Serial on purpose. Overpass is a shared free service and the whole
  // job is a one-off cache fill, so politeness costs minutes and buys a
  // run that actually finishes.
  let done = 0;
  const failed = [];
  for (const [lat, lon] of tiles) {
    done++;
    const path = join(CACHE_DIR, tileName(lat, lon));
    if (existsSync(path)) {
      process.stdout.write(`  [${done}/${tiles.length}] cached ${lat},${lon}\n`);
      continue;
    }
    try {
      const ways = await fetchTile(lat, lon);
      await writeFile(path, JSON.stringify(ways));
      process.stdout.write(`  [${done}/${tiles.length}] ${lat},${lon} -> ${ways.length} ways\n`);
    } catch (error) {
      // One bad tile should not throw away the tiles already banked;
      // the run is resumable, so report and move on.
      failed.push([lat, lon]);
      process.stdout.write(`  [${done}/${tiles.length}] ${lat},${lon} FAILED ${error}\n`);
    }
    await sleep(1200);
  }

  if (failed.length > 0) {
    console.log(`${failed.length} tiles failed; re-run to retry: ${JSON.stringify(failed)}`);
    process.exitCode = 1;
    return;
  }
  console.log("coastline cache complete");
};

/** Loads every cached tile, de-duplicating ways that span tile borders. */
export const loadCoastlineWays = async () => {
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(CACHE_DIR)).filter((f) => f.endsWith(".json"));
  const byId = new Map();
  for (const file of files) {
    const ways = JSON.parse(await readFile(join(CACHE_DIR, file), "utf8"));
    for (const way of ways) if (!byId.has(way.id)) byId.set(way.id, way.flat);
  }
  return [...byId.values()];
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
