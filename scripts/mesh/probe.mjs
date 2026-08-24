/**
 * Prints where the shoreline crosses a line of latitude (or longitude),
 * so a corridor control point can be placed mid-channel from the data
 * rather than from memory.
 *
 * Usage:
 *   node scripts/mesh/probe.mjs lat 47.55 -123.2 -122.7
 *   node scripts/mesh/probe.mjs lon -122.62 47.30 47.45
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "data", "coastline");
const [axis, valueRaw, fromRaw, toRaw] = process.argv.slice(2);
const value = Number(valueRaw);
const from = Number(fromRaw);
const to = Number(toRaw);

const ways = [];
for (const file of readdirSync(CACHE_DIR).filter((name) => name.endsWith(".json"))) {
  for (const way of JSON.parse(readFileSync(join(CACHE_DIR, file), "utf8"))) {
    ways.push(way.flat);
  }
}

const crossings = [];
for (const flat of ways) {
  for (let point = 0; point + 3 < flat.length; point += 2) {
    const aLon = flat[point];
    const aLat = flat[point + 1];
    const bLon = flat[point + 2];
    const bLat = flat[point + 3];
    if (axis === "lat") {
      if (aLat === bLat) continue;
      const along = (value - aLat) / (bLat - aLat);
      if (along < 0 || along > 1) continue;
      const lon = aLon + along * (bLon - aLon);
      if (lon >= from && lon <= to) crossings.push(lon);
    } else {
      if (aLon === bLon) continue;
      const along = (value - aLon) / (bLon - aLon);
      if (along < 0 || along > 1) continue;
      const lat = aLat + along * (bLat - aLat);
      if (lat >= from && lat <= to) crossings.push(lat);
    }
  }
}

crossings.sort((left, right) => left - right);
// Duplicate crossings within a few metres are one shoreline touched twice.
const unique = crossings.filter(
  (crossing, at) => at === 0 || Math.abs(crossing - crossings[at - 1]) > 0.0004
);
console.log(`${unique.length} shoreline crossings along ${axis}=${value}:`);
console.log(unique.map((crossing) => crossing.toFixed(4)).join("  "));
// Crossings alternate land->water->land, so with a window that starts
// on land the even-numbered gaps are the water ones. Printing them in
// order rather than by width is what makes the right channel obvious.
console.log("\ngaps in order (start the window on land; W = water):");
for (let gap = 0; gap + 1 < unique.length; gap++) {
  const width = unique[gap + 1] - unique[gap];
  const kilometres =
    axis === "lat" ? width * 111.32 * Math.cos((value * Math.PI) / 180) : width * 111.32;
  const mid = (unique[gap] + unique[gap + 1]) / 2;
  console.log(
    `  ${gap % 2 === 0 ? "W" : " "} ${unique[gap].toFixed(4)} .. ${unique[gap + 1].toFixed(4)}` +
      `   mid ${mid.toFixed(4)}   ${kilometres.toFixed(2)} km`
  );
}
