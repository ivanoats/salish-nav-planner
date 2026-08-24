/**
 * Applies the mid-channel positions the last mesh build worked out for
 * control points that were placed on land.
 *
 * The build already routes through the cell it suggests here, so this
 * changes no geometry — it moves the correction out of the log and into
 * the skeleton, where the next reader can see the corridor is described
 * by points that are actually in the water.
 *
 * Suggestions further than --max-metres from the original are left
 * alone and printed: that far off, the nearest water may be a different
 * inlet altogether, which is a judgement call rather than a typo.
 *
 * Usage: node scripts/mesh/apply-suggestions.mjs [--max-metres 3000] [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flagIndex = args.indexOf("--max-metres");
const maxMetresRaw = flagIndex === -1 ? "3000" : args[flagIndex + 1];
const maxMetres = Number(maxMetresRaw);
if (!Number.isFinite(maxMetres) || maxMetres <= 0) {
  console.error(`--max-metres needs a positive number, got "${maxMetresRaw}"`);
  process.exit(1);
}
const dryRun = args.includes("--dry-run");

const WARNINGS = join(process.cwd(), "scripts", "mesh", ".build-warnings.txt");
const FILES = [
  "scripts/mesh/skeleton-puget.ts",
  "scripts/mesh/skeleton-sanjuans.ts",
  "scripts/mesh/skeleton-georgia.ts",
  "scripts/mesh/skeleton-north.ts",
].map((path) => join(process.cwd(), path));

const metresBetween = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const pattern =
  /^(\S+): control point \[(-?[\d.]+), (-?[\d.]+)\] is \d+ m from any water — mid-channel is \[(-?[\d.]+), (-?[\d.]+)\]$/u;

const sources = new Map(FILES.map((path) => [path, readFileSync(path, "utf8")]));
let applied = 0;
const skipped = [];

for (const line of readFileSync(WARNINGS, "utf8").split("\n")) {
  const match = pattern.exec(line.trim());
  if (match === null) continue;
  const [, corridor, fromLon, fromLat, toLon, toLat] = match;
  const moved = metresBetween([Number(fromLon), Number(fromLat)], [Number(toLon), Number(toLat)]);
  if (moved > maxMetres) {
    skipped.push(`${corridor}: [${fromLon}, ${fromLat}] -> [${toLon}, ${toLat}] (${Math.round(moved)} m)`);
    continue;
  }
  // A whole number prints as "-123" but is written "-123.0" in the
  // skeleton, so match both spellings rather than reporting a miss.
  const spellings = (value) => {
    const forms = new Set([value]);
    if (!value.includes(".")) forms.add(`${value}.0`);
    if (value.endsWith(".0")) forms.add(value.slice(0, -2));
    return [...forms];
  };
  const replacement = `[${toLon}, ${toLat}],`;
  let hit = false;
  for (const lonForm of spellings(fromLon)) {
    for (const latForm of spellings(fromLat)) {
      const needle = `[${lonForm}, ${latForm}],`;
      for (const [path, text] of sources) {
        if (!text.includes(needle)) continue;
        sources.set(path, text.split(needle).join(replacement));
        hit = true;
      }
    }
  }
  if (hit) applied++;
  else skipped.push(`${corridor}: could not find [${fromLon}, ${fromLat}] in any skeleton file`);
}

if (!dryRun) for (const [path, text] of sources) writeFileSync(path, text);
console.log(`${applied} control points ${dryRun ? "would move" : "moved"} to mid-channel`);
if (skipped.length > 0) {
  console.log(`\n${skipped.length} left for review:`);
  for (const note of skipped) console.log(`  ${note}`);
}
