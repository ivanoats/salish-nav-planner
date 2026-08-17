/**
 * Fetches the scraped route dataset into `public/data/` at build time.
 *
 * `edges.json` and `locations.geojson` are gitignored — no redistribution
 * permission has been sought from nwcruising.net, so they stay out of a
 * public repo (see README). That leaves a deploy with no route data at
 * all, which is how the site once shipped with an empty destination
 * picker: the build succeeded and the planner had nowhere to sail to.
 *
 * So the files are hosted outside git and pulled in here. Set
 * `DATASET_BASE_URL` to wherever they live (Netlify Blobs, S3, a private
 * gist — anything that serves them over HTTPS) and, if that store is
 * private, `DATASET_AUTH_TOKEN` for a bearer header.
 *
 * With no `DATASET_BASE_URL` this does nothing and says so, which is what
 * a local checkout wants: `npm run scrape` has already put the real files
 * there, and re-downloading them on every build would be wasted work.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "public", "data");

/**
 * Each file with a cheap sanity check. A misconfigured URL usually
 * answers with an HTML error page rather than a 404, and writing that to
 * `edges.json` would trade a clear build failure for a confusing crash
 * at request time.
 */
const FILES = [
  {
    name: "edges.json",
    looksRight: (parsed) => Array.isArray(parsed) && parsed.length > 0,
    describe: "a non-empty array of route edges",
  },
  {
    name: "locations.geojson",
    looksRight: (parsed) =>
      parsed?.type === "FeatureCollection" && Array.isArray(parsed.features) && parsed.features.length > 0,
    describe: "a GeoJSON FeatureCollection with at least one feature",
  },
];

const baseUrl = process.env.DATASET_BASE_URL?.trim();
const authToken = process.env.DATASET_AUTH_TOKEN?.trim();

const fetchOne = async ({ name, looksRight, describe }) => {
  const url = `${baseUrl.replace(/\/+$/, "")}/${name}`;

  const response = await fetch(url, {
    headers: authToken ? { authorization: `Bearer ${authToken}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }

  const text = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${url} did not return JSON — check the URL points at the raw file`);
  }
  if (!looksRight(parsed)) {
    throw new Error(`${url} parsed, but is not ${describe}`);
  }

  await writeFile(join(DATA_DIR, name), text, "utf-8");
  const size = (text.length / 1024).toFixed(0);
  console.log(`  ${name.padEnd(20)} ${String(size).padStart(5)} KB from ${url}`);
};

const main = async () => {
  if (baseUrl === undefined || baseUrl === "") {
    console.log(
      "[dataset] DATASET_BASE_URL not set — using whatever is already in public/data/. " +
        "Run `npm run scrape` locally, or set DATASET_BASE_URL to fetch a hosted copy."
    );
    return;
  }

  console.log("[dataset] fetching route data…");
  await mkdir(DATA_DIR, { recursive: true });
  await Promise.all(FILES.map(fetchOne));
  console.log("[dataset] done.");
};

main().catch((error) => {
  // Failing here is the point. Carrying on would deploy a planner with no
  // destinations, which looks like a working site until someone tries it.
  console.error(`[dataset] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
