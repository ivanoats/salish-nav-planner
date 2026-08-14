/**
 * One-shot crawler for nwcruising.net's cruising-distance tables:
 * ~230 `nm_folders/<slug>.html` (US) / `ca-nm_folders/<slug>.html` (CA)
 * pages, each headed by a DMS coordinate and a table of nautical-mile
 * distances/times/remarks to other locations. Output feeds this app's
 * routing graph.
 *
 * Run with: npm run scrape
 *
 * robots.txt allows crawling nm_folders/ and routesN/ (only /cgi-bin and
 * /graphics are disallowed). No license/permission to redistribute this
 * data has been sought, so output stays gitignored (see README) — this
 * is a personal trip-planning cache, not a redistributed copy of the
 * site.
 *
 * Two-pass because a page's "To" cell for another location frequently
 * doesn't match that location's *index* display name (e.g. the index
 * calls it "Bremerton Marina" but every cross-referencing "To" cell,
 * and Bremerton's own "From" cells on its own page, say "Bremerton").
 * Pass 1 fetches every page and harvests each location's own
 * self-reported name (its "From" cells) alongside its index name. Pass
 * 2 resolves "To" names against the union of both, which is what
 * actually shows up as text across the site.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDms } from "../src/domain/dms";
import { normalizeName, slugFromHref } from "../src/domain/slug";
import type { Location, Region } from "../src/domain/location";
import type { RouteEdge } from "../src/domain/route";

const REPO_ROOT = process.cwd();
const RAW_DIR = join(REPO_ROOT, "data", "raw");
const OUT_DIR = join(REPO_ROOT, "public", "data");
const BASE_URL = "https://www.nwcruising.net";

const REQUEST_DELAY_MS = 250;
const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT =
  "salish-nav-planner one-shot scraper (personal trip-planning tool; " +
  "contact via github.com/ivanoats)";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const decodeEntities = (text: string): string =>
  text
    .replace(/&deg;/g, "°")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cachePath = (slug: string) => join(RAW_DIR, `${slug}.html`);

/**
 * This site declares no charset and serves plain Windows-1252 (some
 * pages leak a raw 0xB0 degree-sign byte instead of the `&deg;`
 * entity). `res.text()` defaults to UTF-8, which turns that byte into
 * U+FFFD and drops the coordinate — decode as windows-1252 instead.
 */
const fetchCached = async (slug: string, url: string): Promise<string> => {
  try {
    return await readFile(cachePath(slug), "utf-8");
  } catch {
    // not cached yet, fall through to fetch
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    const buffer = await res.arrayBuffer();
    html = new TextDecoder("windows-1252").decode(buffer);
  } finally {
    clearTimeout(timer);
  }
  await writeFile(cachePath(slug), html, "utf-8");
  await sleep(REQUEST_DELAY_MS);
  return html;
};

interface IndexEntry {
  readonly slug: string;
  readonly name: string;
  readonly region: Region;
  readonly dir: "nm_folders" | "ca-nm_folders";
}

// US rows: <td><font size="-1">NAME</td><td align="center"><a href="nm_folders/slug.html">
// CA rows: <td><font size="-1">NAME</td></font><td align="center"><a href="ca-nm_folders/slug.html">
const INDEX_ROW =
  /<td><font size="-1">([^<]+)<\/td>(?:<\/font>)?<td align="center"><a href="((?:ca-)?nm_folders\/[a-z0-9_.-]+\.html)">/gi;

const parseIndex = (html: string): IndexEntry[] => {
  const caHeaderIndex = html.indexOf("Canadian Ports and Locations");
  const entries: IndexEntry[] = [];
  for (const found of html.matchAll(INDEX_ROW)) {
    const [, rawName, href] = found;
    if (rawName === undefined || href === undefined) continue;
    const region: Region =
      caHeaderIndex !== -1 && (found.index ?? 0) > caHeaderIndex ? "CA" : "US";
    entries.push({
      slug: slugFromHref(href),
      name: decodeEntities(rawName),
      region,
      dir: href.startsWith("ca-") ? "ca-nm_folders" : "nm_folders",
    });
  }
  return entries;
};

// A few pages typo the entity as "&deg" (no trailing ;) or leak a raw
// ° byte instead of the entity — tolerate all three.
const HEADER_COORD = /(\d+(?:&deg;?|°)[^<]*?[NS],\s*\d+(?:&deg;?|°)[^<]*?[EW])/;

// Route chart links vary: routes/route.0233.html, routes10/chs_391.html, etc.
const ROW =
  /<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([\d.]+)<\/td><td>([^<]+)<\/td><td>([^<]*)<\/td><td align="center"><a href="(\.\.\/routes\d*\/[a-z0-9_.-]+\.html)">/gi;

interface ParsedRow {
  readonly fromName: string;
  readonly toName: string;
  readonly nm: number;
  readonly hrMin: string;
  readonly remarks: string;
  readonly routeUrl: string;
}

const findHeaderCoord = (html: string): RegExpMatchArray | null =>
  html.match(HEADER_COORD);

const parseLocationPage = (
  html: string
): { coords: { lat: number; lon: number } | null; rows: ParsedRow[] } => {
  const coordFound = findHeaderCoord(html);
  let coords: { lat: number; lon: number } | null = null;
  if (coordFound !== null) {
    try {
      coords = parseDms(decodeEntities(coordFound[1] ?? ""));
    } catch {
      coords = null;
    }
  }

  const rows: ParsedRow[] = [];
  for (const found of html.matchAll(ROW)) {
    const [, fromName, toName, nmText, hrMin, remarks, routeUrl] = found;
    if (
      fromName === undefined ||
      toName === undefined ||
      nmText === undefined ||
      hrMin === undefined
    ) {
      continue;
    }
    rows.push({
      fromName: decodeEntities(fromName),
      toName: decodeEntities(toName),
      nm: Number(nmText),
      hrMin: decodeEntities(hrMin),
      remarks: decodeEntities(remarks ?? ""),
      routeUrl: routeUrl ?? "",
    });
  }
  return { coords, rows };
};

const parseVia = (remarks: string): string[] => {
  const trimmed = remarks.replace(/^via\s+/i, "").trim();
  if (trimmed === "" || trimmed === "&nbsp;") return [];
  return trimmed
    .split(/,|&|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

interface FetchedPage {
  readonly entry: IndexEntry;
  readonly coords: { lat: number; lon: number } | null;
  readonly rows: ParsedRow[];
}

const main = async (): Promise<void> => {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching site index...");
  const indexHtml = await fetchCached("__index", `${BASE_URL}/index.html`);
  const index = parseIndex(indexHtml);
  console.log(`Found ${index.length} locations in index.`);

  // Pass 1: fetch every page, parse coords + rows, don't resolve names yet.
  const pages: FetchedPage[] = [];
  let pageFailures = 0;
  for (const [i, entry] of index.entries()) {
    process.stdout.write(
      `\r[fetch ${i + 1}/${index.length}] ${entry.name.padEnd(40).slice(0, 40)}`
    );
    let html: string;
    try {
      html = await fetchCached(
        entry.slug,
        `${BASE_URL}/${entry.dir}/${entry.slug}.html`
      );
    } catch (cause) {
      pageFailures++;
      console.warn(`\nFailed to fetch ${entry.slug}: ${String(cause)}`);
      continue;
    }
    const { coords, rows } = parseLocationPage(html);
    pages.push({ entry, coords, rows });
  }
  process.stdout.write("\n");

  // Build the name->slug map from index names AND each page's own
  // self-reported "From" name(s) — see file header comment.
  const nameToSlug = new Map<string, string>();
  for (const { entry } of pages) {
    nameToSlug.set(normalizeName(entry.name), entry.slug);
  }
  for (const { entry, rows } of pages) {
    for (const row of rows) {
      const key = normalizeName(row.fromName);
      if (key !== "" && !nameToSlug.has(key)) {
        nameToSlug.set(key, entry.slug);
      }
    }
  }

  // The index occasionally lists the same physical page under two
  // display names (e.g. "Langley" and "Port of South Whidbey
  // (Langley)" both link to nm_folders/langley.html). Keep one page
  // per slug for the actual location/edge output — the discarded
  // name(s) already fed nameToSlug above, so they still resolve as
  // "To" names elsewhere.
  const pagesBySlug = new Map<string, FetchedPage>();
  for (const page of pages) {
    if (!pagesBySlug.has(page.entry.slug)) pagesBySlug.set(page.entry.slug, page);
  }
  const dedupedPages = [...pagesBySlug.values()];

  // A handful of names get referenced with a suffix dropped or
  // abbreviated somewhere on the site ("Port Orchard" for "Port
  // Orchard Marina", "Nanaimo, Vancouver Is." for "Nanaimo"). Fall back
  // to a whitespace-bounded prefix match in either direction against
  // the exact map above, only when exactly one candidate matches.
  const knownNames = [...nameToSlug.entries()];
  const prefixCache = new Map<string, string | null>();
  const isPrefixOf = (shorter: string, longer: string) =>
    shorter === longer || longer.startsWith(`${shorter} `);
  const resolveByPrefix = (normalized: string): string | null => {
    const cached = prefixCache.get(normalized);
    if (cached !== undefined) return cached;
    const candidates = knownNames.filter(
      ([fullName]) => isPrefixOf(normalized, fullName) || isPrefixOf(fullName, normalized)
    );
    const uniqueSlugs = new Set(candidates.map(([, slug]) => slug));
    const resolved = uniqueSlugs.size === 1 ? [...uniqueSlugs][0]! : null;
    prefixCache.set(normalized, resolved);
    return resolved;
  };

  // A page with no coordinates isn't a real point (e.g. "Circumnavigating
  // Various Islands" — a page of island-loop mileages, not point-to-point
  // routes, that happens to sit in the same alphabetical index as real
  // harbors). Drop it, and any edge touching it, entirely — otherwise
  // its tiny "loop distance" values corrupt Dijkstra with bogus
  // shortcuts between unrelated real locations.
  const slugsWithCoords = new Set(
    dedupedPages.filter((p) => p.coords !== null).map((p) => p.entry.slug)
  );

  // Pass 2: resolve locations + edges now that the name map is complete.
  const locations: Location[] = [];
  const edges: RouteEdge[] = [];
  const unmatchedNames = new Map<string, number>();
  let coordFailures = 0;

  for (const { entry, coords, rows } of dedupedPages) {
    if (coords === null) {
      coordFailures++;
      console.warn(`No coordinates found for ${entry.slug}`);
      continue;
    }
    locations.push({
      slug: entry.slug,
      name: entry.name,
      region: entry.region,
      ...coords,
    });

    for (const row of rows) {
      const normalizedToName = normalizeName(row.toName);
      const toSlug = nameToSlug.get(normalizedToName) ?? resolveByPrefix(normalizedToName);
      if (toSlug === null || toSlug === undefined) {
        unmatchedNames.set(row.toName, (unmatchedNames.get(row.toName) ?? 0) + 1);
        continue;
      }
      if (!slugsWithCoords.has(toSlug)) continue;
      edges.push({
        from: entry.slug,
        to: toSlug,
        nm: row.nm,
        hrMin: row.hrMin,
        via: parseVia(row.remarks),
        routeUrl: row.routeUrl,
      });
    }
  }

  const geojson = {
    type: "FeatureCollection" as const,
    features: locations.map((location) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [location.lon, location.lat] },
      properties: { slug: location.slug, name: location.name, region: location.region },
    })),
  };

  await writeFile(
    join(OUT_DIR, "locations.geojson"),
    `${JSON.stringify(geojson, null, 2)}\n`
  );
  await writeFile(join(OUT_DIR, "edges.json"), `${JSON.stringify(edges, null, 2)}\n`);

  console.log(`\nWrote ${locations.length}/${index.length} locations.`);
  console.log(`Wrote ${edges.length} edges.`);
  if (pageFailures > 0) console.log(`${pageFailures} page fetch failures.`);
  if (coordFailures > 0) console.log(`${coordFailures} locations missing coordinates.`);
  if (unmatchedNames.size > 0) {
    const top = [...unmatchedNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const totalOccurrences = [...unmatchedNames.values()].reduce((a, b) => a + b, 0);
    console.log(
      `${unmatchedNames.size} distinct unmatched destination names (${totalOccurrences} row occurrences), top 20:`
    );
    for (const [name, count] of top) console.log(`  ${count}x  ${name}`);
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
