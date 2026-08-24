/**
 * Downloads the freshwater and tidal-river polygons the coastline layer
 * does not carry: Lake Washington and the ship canal above the Ballard
 * Locks, and the Duwamish Waterway.
 *
 * `natural=coastline` stops at the seaward end of both, yet the dataset
 * has marinas up each of them, so without this they would be harbours
 * with no water around them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "data", "coastline", "inland");

const AREAS = [
  { name: "seattle-lakes", bbox: [47.48, -122.45, 47.78, -122.17] },
];

const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flatten = (geometry) => {
  const flat = [];
  for (const point of geometry) {
    if (point === null || point === undefined) continue;
    flat.push(point.lon, point.lat);
  }
  return flat;
};

/**
 * Rings come back either as standalone ways or as the members of a
 * multipolygon relation. Lake Washington is a relation, and skipping
 * relation members leaves its outline open — which lets the fill escape
 * the lake and swallow the county.
 */
const ringFromWay = (element) => {
  if (element.type !== "way" || !Array.isArray(element.geometry)) return [];
  const flat = flatten(element.geometry);
  return flat.length >= 6 ? [{ id: element.id, flat }] : [];
};

const ringsFromRelation = (element, nextId) => {
  if (element.type !== "relation" || !Array.isArray(element.members)) return [];
  const rings = [];
  for (const member of element.members) {
    if (!Array.isArray(member.geometry)) continue;
    const flat = flatten(member.geometry);
    if (flat.length >= 4) rings.push({ id: nextId(), flat });
  }
  return rings;
};

const compact = (elements) => {
  const rings = [];
  let syntheticId = -1;
  const nextId = () => syntheticId--;
  for (const element of elements) {
    rings.push(...ringFromWay(element), ...ringsFromRelation(element, nextId));
  }
  return rings;
};

const main = async () => {
  await mkdir(CACHE_DIR, { recursive: true });

  for (const area of AREAS) {
    const path = join(CACHE_DIR, `${area.name}.json`);
    if (existsSync(path)) {
      console.log(`cached ${area.name}`);
      continue;
    }
    const [s, w, n, e] = area.bbox;
    const query =
      `[out:json][timeout:180];` +
      `(` +
      `way["natural"="water"](${s},${w},${n},${e});` +
      `way["waterway"="riverbank"](${s},${w},${n},${e});` +
      `relation["natural"="water"](${s},${w},${n},${e});` +
      `);` +
      `out geom;`;

    let saved = false;
    for (let attempt = 0; attempt < 6 && !saved; attempt++) {
      try {
        const response = await fetch(ENDPOINTS[attempt % ENDPOINTS.length], {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "salish-nav-planner mesh builder (github.com/ivanoats)",
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(240_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        const ways = compact(json.elements ?? []);
        await writeFile(path, JSON.stringify(ways));
        console.log(`${area.name} -> ${ways.length} rings`);
        saved = true;
      } catch (error) {
        console.log(`${area.name} attempt ${attempt + 1} failed: ${error}`);
        await sleep(Math.min(60_000, 4000 * 2 ** attempt));
      }
    }
    if (!saved) process.exitCode = 1;
  }
};

await main();
