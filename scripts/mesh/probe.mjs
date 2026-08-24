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
for (const file of readdirSync(CACHE_DIR).filter((n) => n.endsWith(".json"))) {
  for (const way of JSON.parse(readFileSync(join(CACHE_DIR, file), "utf8"))) {
    ways.push(way.flat);
  }
}

const crossings = [];
for (const flat of ways) {
  for (let i = 0; i + 3 < flat.length; i += 2) {
    const aLon = flat[i];
    const aLat = flat[i + 1];
    const bLon = flat[i + 2];
    const bLat = flat[i + 3];
    if (axis === "lat") {
      if (aLat === bLat) continue;
      const t = (value - aLat) / (bLat - aLat);
      if (t < 0 || t > 1) continue;
      const lon = aLon + t * (bLon - aLon);
      if (lon >= from && lon <= to) crossings.push(lon);
    } else {
      if (aLon === bLon) continue;
      const t = (value - aLon) / (bLon - aLon);
      if (t < 0 || t > 1) continue;
      const lat = aLat + t * (bLat - aLat);
      if (lat >= from && lat <= to) crossings.push(lat);
    }
  }
}

crossings.sort((a, b) => a - b);
// Duplicate crossings within a few metres are one shoreline touched twice.
const unique = crossings.filter((v, i) => i === 0 || Math.abs(v - crossings[i - 1]) > 0.0004);
console.log(`${unique.length} shoreline crossings along ${axis}=${value}:`);
console.log(unique.map((v) => v.toFixed(4)).join("  "));
// Crossings alternate land->water->land, so with a window that starts
// on land the even-numbered gaps are the water ones. Printing them in
// order rather than by width is what makes the right channel obvious.
console.log("\ngaps in order (start the window on land; W = water):");
for (let i = 0; i + 1 < unique.length; i++) {
  const width = unique[i + 1] - unique[i];
  const km =
    axis === "lat" ? width * 111.32 * Math.cos((value * Math.PI) / 180) : width * 111.32;
  const mid = (unique[i] + unique[i + 1]) / 2;
  console.log(
    `  ${i % 2 === 0 ? "W" : " "} ${unique[i].toFixed(4)} .. ${unique[i + 1].toFixed(4)}` +
      `   mid ${mid.toFixed(4)}   ${km.toFixed(2)} km`
  );
}
