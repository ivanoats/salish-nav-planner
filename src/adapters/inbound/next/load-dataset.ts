import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Location, Waypoint } from "@/domain/location";
import type { Obstruction } from "@/domain/obstruction";
import type { TidalPass } from "@/domain/pass";
import type { RouteEdge } from "@/domain/route";
import type { WindZone } from "@/domain/wind-zone";

const DATA_DIR = join(process.cwd(), "public", "data");

interface LocationFeature {
  readonly type: "Feature";
  readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  readonly properties: { readonly slug: string; readonly name: string; readonly region: "US" | "CA" };
}

interface LocationFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly LocationFeature[];
}

/**
 * A hand-checked correction to a scraped location's position.
 *
 * A handful of nwcruising.net pages carry malformed or plainly wrong
 * coordinate headers. The distances in their tables are still good — the
 * error is only in the lat/lon — so dropping the location would lose
 * real routing data, and editing the scraper's output would be undone by
 * the next crawl. Corrections live here instead, committed, each with the
 * evidence for it, and are applied on load.
 */
interface LocationFix {
  readonly slug: string;
  readonly name: string;
  readonly region: "US" | "CA";
  readonly lat: number;
  readonly lon: number;
  readonly reason: string;
}

export interface Dataset {
  readonly locations: readonly Location[];
  readonly edges: readonly RouteEdge[];
  readonly waypoints: readonly Waypoint[];
  /** Tidal passes, from `scripts/build-passes.ts`. */
  readonly passes: readonly TidalPass[];
  readonly windZones: readonly WindZone[];
  /** Bridges and other overhead clearances. */
  readonly obstructions: readonly Obstruction[];
}

const readJson = async <T>(fileName: string): Promise<T> => {
  const text = await readFile(join(DATA_DIR, fileName), "utf-8");
  return JSON.parse(text) as T;
};

/**
 * True when a file simply isn't there, as opposed to being unreadable or
 * malformed — those are real faults and still throw.
 */
const isMissingFile = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as NodeJS.ErrnoException).code === "ENOENT";

/**
 * Reads a scraped file, or returns `fallback` if it hasn't been generated.
 *
 * The scrape output is deliberately gitignored (see the README on
 * nwcruising.net's terms), so a fresh checkout — CI's included — has no
 * `edges.json` or `locations.geojson`. The home page is statically
 * prerendered and reads them at build time, which turned a missing
 * regenerable cache into a hard build failure.
 *
 * Degrading to an empty dataset keeps the build and the page working;
 * the planner then has nowhere to sail to, which the warning explains
 * rather than leaving someone to puzzle over an empty picker.
 */
const readOptionalJson = async <T>(fileName: string, fallback: T): Promise<T> => {
  try {
    return await readJson<T>(fileName);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    console.warn(
      `[load-dataset] ${fileName} is missing — run \`npm run scrape\` to generate it. ` +
        `Continuing without it, so the planner will have no routes.`
    );
    return fallback;
  }
};

/**
 * Applies the committed corrections. A fix normally overwrites the
 * position of a location the scrape already found, but it also inserts
 * one the scrape had to drop — `parseDms` now rejects headers with
 * out-of-range minutes rather than turning them into a point in the
 * ocean, so the worst-formed pages arrive here missing entirely.
 */
const applyLocationFixes = (
  locations: readonly Location[],
  fixes: readonly LocationFix[]
): Location[] => {
  const bySlug = new Map(locations.map((location) => [location.slug, location] as const));

  for (const fix of fixes) {
    const existing = bySlug.get(fix.slug);
    bySlug.set(fix.slug, {
      slug: fix.slug,
      name: existing?.name ?? fix.name,
      region: existing?.region ?? fix.region,
      lat: fix.lat,
      lon: fix.lon,
    });
  }

  return [...bySlug.values()];
};

const EMPTY_FEATURES: LocationFeatureCollection = { type: "FeatureCollection", features: [] };

export const loadDataset = async (): Promise<Dataset> => {
  // Only the two scraped files are optional. The rest are committed, so
  // a missing one is a broken checkout rather than an ungenerated cache,
  // and should fail loudly.
  const [geojson, edges, waypoints, passes, windZones, obstructions, fixes] = await Promise.all([
    readOptionalJson<LocationFeatureCollection>("locations.geojson", EMPTY_FEATURES),
    readOptionalJson<RouteEdge[]>("edges.json", []),
    readJson<Waypoint[]>("waypoints.json"),
    readJson<TidalPass[]>("passes.json"),
    readJson<WindZone[]>("wind-zones.json"),
    readJson<Obstruction[]>("obstructions.json"),
    readJson<LocationFix[]>("location-fixes.json"),
  ]);

  const scraped: Location[] = geojson.features.map((feature) => ({
    slug: feature.properties.slug,
    name: feature.properties.name,
    region: feature.properties.region,
    lon: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
  }));

  return {
    // With no scrape at all, the corrections have nothing to correct —
    // applying them would conjure three lone harbours with no routes
    // between them, which reads as a bug rather than as missing data.
    locations: scraped.length === 0 ? [] : applyLocationFixes(scraped, fixes),
    edges,
    waypoints,
    passes,
    windZones,
    obstructions,
  };
};
