/**
 * Scores the mesh against the scraped distance tables.
 *
 * The build's own gates prove the mesh is wet and connected; neither
 * notices a corridor that connects at one end only, which leaves the
 * graph correct and the routes absurd — Port Ludlow reachable solely by
 * running up Admiralty Inlet, through the Port Townsend Canal, and back
 * down. nwcruising.net published a distance for thousands of harbour
 * pairs, and those numbers are the independent check: a mesh leg much
 * longer than its published distance means a topology gap.
 *
 * Usage: node scripts/mesh/check-distances.mjs [overBy]
 */
import { readFileSync } from "node:fs";

const overBy = Number(process.argv[2] ?? 1.25);
const mesh = JSON.parse(readFileSync("public/data/salish-mesh.json", "utf8"));
const edges = JSON.parse(readFileSync("public/data/edges.json", "utf8"));

const key = (c) => `${c[0]},${c[1]}`;
const toRad = (degrees) => (degrees * Math.PI) / 180;
const nm = (a, b) => {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const halfChord =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(halfChord)));
};

const adjacency = new Map();
const position = new Map();
const connect = (a, b) => {
  if (!adjacency.has(key(a))) adjacency.set(key(a), []);
  adjacency.get(key(a)).push([key(b), nm(a, b)]);
};
for (const feature of mesh.features) {
  if (feature.geometry.type !== "LineString") continue;
  const line = feature.geometry.coordinates;
  for (const point of line) position.set(key(point), point);
  for (let at = 0; at + 1 < line.length; at++) {
    connect(line[at], line[at + 1]);
    connect(line[at + 1], line[at]);
  }
}
const harbours = new Map();
for (const feature of mesh.features) {
  if (feature.properties.kind === "harbour") {
    harbours.set(feature.properties.slug, key(feature.geometry.coordinates));
  }
}

/** Every harbour's mesh distance from one origin, in one sweep. */
const distancesFrom = (origin) => {
  const dist = new Map([[origin, 0]]);
  const done = new Set();
  const queue = [[0, origin]];
  while (queue.length > 0) {
    queue.sort((left, right) => left[0] - right[0]);
    const [cost, at] = queue.shift();
    if (done.has(at)) continue;
    done.add(at);
    for (const [next, weight] of adjacency.get(at) ?? []) {
      const candidate = cost + weight;
      if (dist.get(next) === undefined || candidate < dist.get(next)) {
        dist.set(next, candidate);
        queue.push([candidate, next]);
      }
    }
  }
  return dist;
};

const byOrigin = new Map();
for (const edge of edges) {
  if (!byOrigin.has(edge.from)) byOrigin.set(edge.from, []);
  byOrigin.get(edge.from).push(edge);
}

const worst = [];
let compared = 0;
let over = 0;
for (const [from, list] of byOrigin) {
  const origin = harbours.get(from);
  if (origin === undefined) continue;
  const dist = distancesFrom(origin);
  for (const edge of list) {
    const target = harbours.get(edge.to);
    if (target === undefined || !Number.isFinite(edge.nm) || edge.nm <= 0) continue;
    const meshNm = dist.get(target);
    if (meshNm === undefined) continue;
    compared++;
    const ratio = meshNm / edge.nm;
    if (ratio > overBy) {
      over++;
      worst.push({ from, to: edge.to, published: edge.nm, mesh: meshNm, ratio });
    }
  }
}

worst.sort((left, right) => right.ratio - left.ratio);
console.log(`compared ${compared} published legs; ${over} are more than ${((overBy - 1) * 100).toFixed(0)}% longer over the mesh\n`);
console.log("worst 25:");
for (const row of worst.slice(0, 25)) {
  console.log(
    `  ${row.from.padEnd(20)} -> ${row.to.padEnd(20)} published ${row.published.toFixed(1).padStart(6)}  mesh ${row.mesh.toFixed(1).padStart(6)}  x${row.ratio.toFixed(2)}`
  );
}
const tally = {};
for (const row of worst) {
  tally[row.from] = (tally[row.from] ?? 0) + 1;
  tally[row.to] = (tally[row.to] ?? 0) + 1;
}
console.log("\nharbours appearing most often in the over-long legs:");
for (const [slug, count] of Object.entries(tally).sort((left, right) => right[1] - left[1]).slice(0, 15)) {
  console.log(`  ${String(count).padStart(4)}  ${slug}`);
}
