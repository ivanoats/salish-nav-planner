/**
 * Copies MapLibre's web worker (and the shared chunk it imports) into
 * public/maplibre/ so the app can serve it at a stable URL.
 *
 * Why this is needed: maplibre-gl derives its worker URL at *runtime*
 * from `import.meta.url` of its own bundled chunk —
 *
 *     new URL("./maplibre-gl-worker.mjs", import.meta.url).href
 *
 * Under Next/Turbopack that resolves to
 * /_next/static/chunks/maplibre-gl-worker.mjs, which the bundler never
 * emits (the URL is computed, so it can't be statically analyzed).
 * The request 404s to Next's HTML error page, the worker fails the
 * module MIME check, and every GeoJSON source silently stays unparsed
 * — raster tiles and DOM markers still render, so the failure looks
 * like "vector layers just don't draw".
 *
 * Copying the files and calling `setWorkerUrl()` (see map.tsx) sidesteps
 * the computed URL entirely. Re-run on install/dev/build so the copy
 * can't drift from the installed maplibre-gl version.
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const distDir = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const outDir = join(process.cwd(), "public", "maplibre");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

const { version } = JSON.parse(
  await readFile(require.resolve("maplibre-gl/package.json"), "utf-8")
);

await mkdir(outDir, { recursive: true });
for (const file of FILES) {
  await copyFile(join(distDir, file), join(outDir, file));
}
// Stamped so a stale copy from an older maplibre-gl is obvious.
await writeFile(join(outDir, "VERSION"), `${version}\n`);

console.log(`maplibre worker ${version} -> public/maplibre/`);
