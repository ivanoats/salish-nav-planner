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
 * Whether a build with no route data at all is acceptable.
 *
 * It is exactly once: in CI, which has no scrape and no business
 * fetching one, and only wants to know the app compiles. Everywhere else
 * an empty dataset is a broken deploy — the site once shipped looking
 * perfectly functional with an empty destination picker, because a
 * missing file only warned. So this stays opt-in and loud by default.
 */
const allowsEmptyDataset = (): boolean => process.env.ALLOW_EMPTY_DATASET === "1";

/**
 * Reads one of the two gitignored scrape outputs.
 *
 * Missing means either nobody has run `npm run scrape`, or the deploy
 * never fetched the hosted copy — see `scripts/fetch-dataset.mjs`. Both
 * are faults worth stopping for, so this throws unless the build has
 * explicitly said it can live without the data.
 */
const readScrapedJson = async <T>(fileName: string, whenAllowedEmpty: T): Promise<T> => {
  try {
    return await readJson<T>(fileName);
  } catch (error) {
    if (!isMissingFile(error)) throw error;

    if (!allowsEmptyDataset()) {
      throw new Error(
        `Route data is missing: public/data/${fileName} does not exist.\n` +
          `  • Locally, run \`npm run scrape\` to generate it.\n` +
          `  • On a deploy, set DATASET_BASE_URL so \`npm run dataset\` can fetch it.\n` +
          `  • To build without route data anyway (CI), set ALLOW_EMPTY_DATASET=1.`
      );
    }

    console.warn(
      `[load-dataset] ${fileName} is missing and ALLOW_EMPTY_DATASET is set — ` +
        `continuing with no route data, so the planner will have no destinations.`
    );
    return whenAllowedEmpty;
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
    readScrapedJson<LocationFeatureCollection>("locations.geojson", EMPTY_FEATURES),
    readScrapedJson<RouteEdge[]>("edges.json", []),
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
