/**
 * Cuts a bbox out of the mesh and writes it as its own .geojson, small
 * enough to drop straight into geojson.io.
 *
 * The whole mesh is far too big to hand that editor, and checking a
 * strait at national scale proves nothing anyway — the mistakes worth
 * catching are a few hundred metres wide. geojson.io no longer reads a
 * `#data=` URL, so the output is a file: open geojson.io and use Import,
 * or paste the contents into its JSON panel.
 *
 * Usage:
 *   node scripts/mesh/clip-region.mjs <minLon> <minLat> <maxLon> <maxLat> [out.geojson]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [minLon, minLat, maxLon, maxLat, outPath = "mesh-clip.geojson"] = process.argv.slice(2);
if (maxLat === undefined) {
  console.error("usage: clip-region.mjs <minLon> <minLat> <maxLon> <maxLat> [out.geojson]");
  process.exit(1);
}

const bounds = [Number(minLon), Number(minLat), Number(maxLon), Number(maxLat)];
const mesh = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "salish-mesh.json"), "utf8")
);

const inside = ([lon, lat]) =>
  lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3];

// Keep any line with a vertex in view, trimmed to the runs of vertices
// near the box, so one strait-long corridor does not drag the whole
// coast into the clip.
const pad = 0.05;
const near = ([lon, lat]) =>
  lon >= bounds[0] - pad &&
  lon <= bounds[2] + pad &&
  lat >= bounds[1] - pad &&
  lat <= bounds[3] + pad;

const clipped = [];
for (const feature of mesh.features) {
  if (feature.geometry.type === "Point") {
    if (inside(feature.geometry.coordinates)) clipped.push(feature);
    continue;
  }
  let run = [];
  const runs = [];
  for (const point of feature.geometry.coordinates) {
    if (near(point)) run.push(point);
    else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  for (const [index, piece] of runs.entries()) {
    if (piece.length < 2) continue;
    clipped.push({
      type: "Feature",
      properties: runs.length > 1 ? { ...feature.properties, part: index } : feature.properties,
      geometry: { type: "LineString", coordinates: piece },
    });
  }
}

const json = JSON.stringify({ type: "FeatureCollection", features: clipped });
writeFileSync(outPath, json);
console.log(`${clipped.length} features, ${(json.length / 1024).toFixed(0)} KB -> ${outPath}`);
