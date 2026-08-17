/**
 * Fetches the scraped route dataset into `public/data/` at build time.
 *
 * `edges.json` and `locations.geojson` are gitignored — no redistribution
 * permission has been sought from nwcruising.net, so they stay out of a
 * public repo (see README). That leaves a deploy with no route data at
 * all, which is how the site once shipped with an empty destination
 * picker: the build succeeded and the planner had nowhere to sail to.
 *
 * So the files live in a private store and are pulled in here. Two ways
 * to reach one, tried in order:
 *
 *   1. Cloudflare R2 over its S3-compatible API, signed with SigV4.
 *      Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and
 *      R2_SECRET_ACCESS_KEY. The bucket stays private — no public r2.dev
 *      URL — which is the point: a world-readable bucket would publish
 *      the data as surely as committing it would.
 *
 *   2. Any plain HTTPS store, via DATASET_BASE_URL and an optional
 *      DATASET_AUTH_TOKEN bearer header.
 *
 * With neither configured this does nothing and says so, which is what a
 * local checkout wants: `npm run scrape` has already put the real files
 * there, and re-downloading them on every build would be wasted work.
 */
import { AwsClient } from "aws4fetch";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Local convenience: keeps R2 keys in a gitignored .env rather than in a
// shell profile. Absent in CI and on Netlify, where the platform supplies
// the environment directly.
try {
  process.loadEnvFile(join(process.cwd(), ".env"));
} catch {
  // No .env, which is the normal case everywhere but a laptop.
}

const DATA_DIR = join(process.cwd(), "public", "data");

/**
 * Each file with a cheap sanity check. A misconfigured store usually
 * answers with an error document rather than a 404, and writing that to
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
      parsed?.type === "FeatureCollection" &&
      Array.isArray(parsed.features) &&
      parsed.features.length > 0,
    describe: "a GeoJSON FeatureCollection with at least one feature",
  },
];

const env = (name) => {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
};

/**
 * Picks where the data comes from, or null when nothing is configured.
 * Each source resolves a file name to a URL and a `fetch` that can reach
 * it — R2 needs a signed request, a plain store needs at most a header.
 */
const resolveSource = () => {
  const accountId = env("R2_ACCOUNT_ID");
  const bucket = env("R2_BUCKET");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");

  if (accountId && bucket && accessKeyId && secretAccessKey) {
    // R2's SigV4 wants a region, and "auto" is the one it accepts.
    const client = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
    const base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
    return {
      label: `R2 bucket "${bucket}"`,
      urlFor: (name) => `${base}/${name}`,
      get: (url) => client.fetch(url),
    };
  }

  // Partially configured is a mistake worth naming — silently falling
  // through to "nothing configured" would look like the build ignoring
  // credentials that are right there.
  if (accountId || bucket || accessKeyId || secretAccessKey) {
    const missing = [
      ["R2_ACCOUNT_ID", accountId],
      ["R2_BUCKET", bucket],
      ["R2_ACCESS_KEY_ID", accessKeyId],
      ["R2_SECRET_ACCESS_KEY", secretAccessKey],
    ]
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);
    throw new Error(`R2 is partly configured — missing ${missing.join(", ")}`);
  }

  const baseUrl = env("DATASET_BASE_URL");
  if (baseUrl) {
    const authToken = env("DATASET_AUTH_TOKEN");
    const trimmed = baseUrl.replace(/\/+$/, "");
    return {
      label: baseUrl,
      urlFor: (name) => `${trimmed}/${name}`,
      get: (url) =>
        fetch(url, {
          headers: authToken ? { authorization: `Bearer ${authToken}` } : undefined,
        }),
    };
  }

  return null;
};

const fetchOne = async (source, { name, looksRight, describe }) => {
  const url = source.urlFor(name);

  const response = await source.get(url);
  if (!response.ok) {
    // S3-compatible stores explain themselves in the body — "InvalidAccessKeyId"
    // and "SignatureDoesNotMatch" are different mistakes with the same 400, and
    // the status line alone sends you looking in the wrong place. Only the code
    // and message are surfaced; neither carries anything secret.
    const detail = await response.text().then(
      (body) => {
        const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1];
        const message = body.match(/<Message>([^<]+)<\/Message>/)?.[1];
        if (code) return ` — ${code}${message ? `: ${message}` : ""}`;
        return body.trim() === "" ? "" : ` — ${body.trim().slice(0, 200)}`;
      },
      () => ""
    );
    throw new Error(
      `${name} came back ${response.status} ${response.statusText} from ${source.label}${detail}`
    );
  }

  const text = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${name} did not arrive as JSON — check the key exists in ${source.label}`);
  }
  if (!looksRight(parsed)) {
    throw new Error(`${name} parsed, but is not ${describe}`);
  }

  await writeFile(join(DATA_DIR, name), text, "utf-8");
  console.log(`  ${name.padEnd(20)} ${String((text.length / 1024).toFixed(0)).padStart(5)} KB`);
};

const main = async () => {
  const source = resolveSource();

  if (source === null) {
    console.log(
      "[dataset] no store configured — using whatever is already in public/data/. " +
        "Run `npm run scrape` locally, or set R2_* (or DATASET_BASE_URL) to fetch a hosted copy."
    );
    return;
  }

  console.log(`[dataset] fetching route data from ${source.label}…`);
  await mkdir(DATA_DIR, { recursive: true });
  await Promise.all(FILES.map((file) => fetchOne(source, file)));
  console.log("[dataset] done.");
};

main().catch((error) => {
  // Failing here is the point. Carrying on would deploy a planner with no
  // destinations, which looks like a working site until someone tries it.
  console.error(`[dataset] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
