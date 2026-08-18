# salish-nav-planner

Multi-day trip-planning aid for cruising Puget Sound and the Salish Sea.
Pick a start, a first-night destination, and a trip length (1–7 days);
the planner chains the remaining days for you, picking each night's stop
to fit your preferred day length. **Not for navigation** — carry current
charts.

Controls:

- **Days** (1–7) — how many days to plan.
- **Min / max hours per day** — the day-length window auto-picked stops
  must fit. Days are chosen closest to the middle of the window. Hours
  rather than miles because a cruising day is bounded by daylight, not
  distance.
- **Speed (kt)** — your boat's cruising speed, default 6. Reachable
  distance is hours × speed, so changing speed **replans the stops**,
  not just the times: a 3–8h day reaches 18–48 nm at 6 kt but 30–80 nm
  at 10 kt.
- **Round trip** — finish back where you started. Leave it off and you
  can optionally name an **End at** port to finish somewhere else
  (deliver the boat to Anacortes), or leave that blank to wander one-way
  with no return obligation.
- **Mast (ft)** — height above the water. Five feet is added for
  masthead gear, and hops under fixed spans that don't clear are removed
  from the graph, so the planner routes *around* them: at 45 ft Port
  Ludlow to Port Townsend runs 12.9 nm through the Port Townsend Canal,
  and at 60 ft it becomes 35.1 nm around Marrowstone Island. Opening
  bridges never block a route — they're a radio call and a wait — so
  they're reported rather than avoided. See
  [Bridges and air draft](#bridges-and-air-draft).
- **Start date** and **Depart** — when the trip begins and what time you
  get underway each day. Together they turn the plan from a sequence of
  hops into dated, clock-timed days, which is what makes a weather
  forecast and a slack-water table mean anything.
- **Let the forecast shape the plan** — when on, wind is a ranking term
  alongside day length and return shape, so a day that means a long beat
  into a blow loses out to a shorter or more sheltered one. Turn it off
  to see the forecast without letting it move your stops. It disables
  itself past the ~16-day forecast horizon, where planning falls back to
  distance alone.
- Each day after the first can be re-rolled (**Next** cycles through the
  other candidates) or pinned to a specific stop; pinning a day resets
  the auto-picked days after it, since they were chosen relative to a
  different upstream stop. A pinned stop outside your day-length window
  is honored but flagged.

Each planned day shows the day's wind (direction, sustained and gust
speed, Beaufort force, and your point of sail on that heading), plus
every tidal pass on the route with your **estimated arrival time**, the
predicted current at that moment, and the next slack — so a pass reads
as an appointment rather than a distance.

Routing data is scraped from [nwcruising.net](https://www.nwcruising.net)'s
~220 harbor/marina/point pages, each listing distances, times, and
"via" passage notes to other locations. See [Data](#data) below for how
that's licensed and why the scraped output isn't committed to this repo.

## Stack

- **Next.js** App Router + React + TypeScript strict
- **PandaCSS** + **Park UI** preset + **Ark UI** primitives
- **MapLibre GL** + **pmtiles** protocol for the map — matches the
  chart-tile pipeline in the sibling
  [`bc-charts-pm`](../bc-charts-pm) repo
- **Vitest** for unit tests
- Hexagonal-ish layering: `src/domain` (pure types/logic) →
  `src/application` (routing graph, trip planner, ports) →
  `src/adapters` (fs-backed repository, Next server glue) →
  `src/components` (UI)

### MapLibre worker

`scripts/copy-maplibre-worker.mjs` stages maplibre-gl's web worker into
`public/maplibre/` (run automatically on install, dev, and build).
maplibre otherwise computes its worker URL at runtime from
`import.meta.url`, which under Turbopack resolves to a chunk path that's
never emitted — the worker 404s and **every GeoJSON layer silently fails
to draw** while raster tiles and markers still render. `map.tsx` calls
`setWorkerUrl()` to point at the staged copy. If vector layers ever stop
rendering, check that copy is present and matches the installed
maplibre-gl version (`public/maplibre/VERSION`).

## Getting started

```sh
npm install
npm run scrape   # crawl nwcruising.net -> public/data/*.json (one-shot, ~2 min)
npm run dev      # http://localhost:3000
```

Run `npm run scrape` before `npm run dev` or `npm run build` to populate the
planner. Without the generated files, the app still builds but has no routes
(see [Data](#data)).

## Deployment

[`netlify.toml`](netlify.toml) configures Netlify to use Node.js 24, run the
standard npm build, and deploy Next.js through Netlify's automatically managed
OpenNext adapter.

### Getting route data into a deploy

`edges.json` and `locations.geojson` are gitignored, so a Git-based build
checks out a repo with no routes in it. The home page is prerendered and
reads them, so without something in place the site deploys looking
perfectly functional with an **empty destination picker** — which is
exactly what happened once.

`npm run build` therefore runs `npm run dataset` first
([`scripts/fetch-dataset.mjs`](scripts/fetch-dataset.mjs)), which pulls both
files from wherever you host them:

The files live in a **private Cloudflare R2 bucket**, read over R2's
S3-compatible API with a SigV4-signed request:

| Variable | Required | Purpose |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | for deploys | Cloudflare account ID (the subdomain of the R2 S3 endpoint) |
| `R2_BUCKET` | for deploys | Bucket name, e.g. `salish-nav-planner` |
| `R2_ACCESS_KEY_ID` | for deploys | R2 API token, **Object Read only**, scoped to that bucket |
| `R2_SECRET_ACCESS_KEY` | for deploys | Secret half of the same token |
| `ALLOW_EMPTY_DATASET` | CI only | Set to `1` to permit a build with no route data |

Any plain HTTPS store works too, as a fallback: set `DATASET_BASE_URL`
(plus `DATASET_AUTH_TOKEN` for a bearer header) instead of the R2 group.

On Netlify, mark **only** `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as
secret. Netlify's secret scanning fails any build whose output contains the
value of a variable marked secret, and `R2_BUCKET` is `salish-nav-planner` —
which is also the site name and the npm package name, so it appears in
`package.json` and throughout the build. Marking it secret fails every
deploy. It isn't a credential anyway: the bucket is private, and access is
controlled by the key and secret, not by the name being hard to guess. The
same goes for `R2_ACCOUNT_ID`, which appears in the endpoint hostname.

Note also that `netlify build` run locally cannot read secret values back
out of the API — it substitutes a 20-character mask — so a local run of it
will fail signature checks even when the real deploy is fine. Debug against
a real deploy, or against `.env`.

Configure neither and the script does nothing, which is what a local
checkout wants — `npm run scrape` has already put the real files there. For
local testing against R2, put the four variables in a gitignored `.env`;
the script loads it automatically.

**The bucket must stay private.** Enabling its public `r2.dev` URL would
publish nwcruising.net's tables to anyone who finds the address, which is
exactly what keeping them out of this repo avoids. Read-only, bucket-scoped
credentials keep the blast radius small if one leaks. For the same reason,
do **not** add `npm run scrape` to the hosted build: that crawls their site
on every deploy, which is a different thing from an occasional local
refresh.

Refresh the hosted copy after a re-scrape with:

```sh
wrangler r2 object put salish-nav-planner/edges.json \
  --file=public/data/edges.json --content-type=application/json --remote
wrangler r2 object put salish-nav-planner/locations.geojson \
  --file=public/data/locations.geojson --content-type=application/geo+json --remote
```

A missing dataset now **fails the build** rather than shipping an empty
planner. CI is the one exception — it has no scrape and only needs to know
the app compiles, so its build step sets `ALLOW_EMPTY_DATASET=1`.

`NEXT_PUBLIC_CHART_PMTILES_URL` is optional and must remain unset on a public
deployment unless the chart archive's licence permits public hosting.

## Commands

```sh
npm run dev         # stage maplibre worker + panda codegen + next dev
npm run build       # maplibre worker + fetch dataset + panda codegen + next build
npm run typecheck   # panda codegen + tsc --noEmit
npm run test         # vitest run
npm run test:coverage # vitest run --coverage
npm run test:watch  # vitest watch mode
npm run lint         # eslint
npm run scrape       # re-run the nwcruising.net crawler
npm run dataset      # fetch hosted route data (needs the R2_* vars)
npm run build:passes # rebuild public/data/passes.json from NOAA + CHS
```

## Weather and tides

Two live sources, both free and keyless, both proxied through
`src/app/api/` route handlers so the upstream responses are cached once
for everyone rather than once per visitor:

- **Wind** — [Open-Meteo](https://open-meteo.com), fetched for the
  ~16 marine zones in `public/data/wind-zones.json` rather than per
  stop. A synoptic wind over the Salish Sea is coherent across tens of
  miles and the model's grid is coarser than the gap between
  neighbouring harbours, so per-harbour forecasts would be slower and
  falsely precise. Zones also mean the forecast depends only on the
  *dates*, not on the plan — which is what lets it feed back into route
  ranking without the plan and the weather waiting on each other.
- **Currents** — NOAA
  [Tides & Currents](https://tidesandcurrents.noaa.gov) for US passes,
  and the Canadian Hydrographic Service's
  [IWLS](https://api-iwls.dfo-mpo.gc.ca) for Canadian ones. The border
  is a fact about data publishers, not about the water: Active Pass,
  Dodd Narrows, Porlier, Gabriola and Seymour Narrows simply aren't in
  NOAA's tables, and they're the passes that most reward getting right.
  `src/adapters/outbound/regional-current-predictions.ts` routes each
  pass to its agency.

Both agencies publish the same shape of data — slack and maximum
current — so that's the interchange format. `src/domain/tidal.ts`
interpolates between those turning points with a half-cosine, the smooth
form of the "rule of thirds" every cruising guide prints, to get a real
current at your estimated arrival rather than leaving you to eyeball
where you fall between two table rows.

Currents are astronomical and predictable years ahead; wind is not.
Anything past the forecast horizon gets no wind at all, and both the
planner and the UI say so rather than assuming calm.

## Bridges and air draft

`public/data/obstructions.json` is a hand-curated list of spans with
their clearance and whether they open. Each hop in the routing graph is
annotated once, at load, with the bridges it goes under, so changing the
mast height re-filters the graph rather than re-measuring it (13 ms for
all 4,104 hops).

Working out *which* bridges a hop passes under is the hard part, because
the source data is point-to-point distances with no route geometry. Two
signals are combined:

1. **The route table naming it.** nwcruising.net lists "Port Townsend
   Canal" as a via note on 39 hops. That's as direct as this dataset
   gets, and it's trusted outright.
2. **Geometry, checked against the mileage.** Proximity to the drawn
   track alone gives false positives — the straight line from Everett to
   Port Angeles sweeps right past the Port Townsend Canal while actually
   rounding Point Wilson miles away. So a bridge only counts if the
   published distance *agrees* it's on the way: passing through costs at
   least the two great-circle legs either side of it, which bounds the
   ratio from below, and a hop far longer than that went round instead.
   Port Ludlow to Port Townsend sits at 1.11 and is a real canal
   transit; Port Hadlock to Port Townsend at 0.85 runs up the bay, and
   Port Townsend to Poulsbo at 1.62 takes the long way via Agate Passage.

The failure mode is deliberately the safe one. An over-eager match makes
a route longer, never impossible — every one of the 220 locations stays
reachable at any mast height, they just cost more miles. **Verify
clearances against current charts before you rely on one**; these are
nominal figures at mean high water, and the app is a planning aid.

## Data

`scripts/scrape-nwcruising.ts` crawls nwcruising.net's site index and
every `nm_folders/` (US) / `ca-nm_folders/` (CA) location page:

- **Locations** — each page's own DMS coordinate header (its only
  source of lat/lon).
- **Edges** — each page's distance table: nautical miles, time, "via"
  passage notes, and a route-detail link, per destination.

Coverage isn't complete or perfectly clean — the site itself is a set
of ~220 hand-authored HTML pages with inconsistent naming (a page's
index title and its own self-referenced name sometimes differ) and a
few non-point pages (e.g. an "island circumnavigation" mileage table)
mixed into the same alphabetical index as real harbors. The scraper
works around the naming inconsistencies with a two-pass name resolution
(see the file's header comment) and drops anything without real
coordinates. Where the site doesn't have a direct point-to-point entry,
`src/application/route-graph.ts` finds a path through intermediate
hub locations (Dijkstra by nautical miles).

There's no real polyline data — nwcruising.net itself only gives
point-to-point distance/time, not a routed track. The map draws a
straight line between each leg's endpoints, bent through any `via`
passage name that resolves against `public/data/waypoints.json` (a
small hand-curated set of well-known straits/passages with no own
nwcruising.net page — Deception Pass, Admiralty Inlet, Colvos Passage,
etc). This is an approximation for trip planning, not a chartplotter
route.

**Licensing**: robots.txt permits crawling `nm_folders/`, `ca-nm_folders/`,
and `routes*/`, but no redistribution permission has been sought from
nwcruising.net, and the site carries its own "not to be used for
navigation" / non-CHS-endorsement disclaimers on every page. Scraped
output (`public/data/*.geojson`, `public/data/edges.json`, and the raw
HTML cache in `data/raw/`) is gitignored — regenerate it locally with
`npm run scrape` rather than expecting it in a fresh checkout.
`public/data/waypoints.json` (hand-authored, not scraped) is the one
scraper-adjacent data file that is committed.

`public/data/passes.json` and `public/data/wind-zones.json` are also
committed, on the same reasoning that keeps the scrape out. The zones are
hand-authored outright. The passes start from a hand-written list in
`scripts/build-passes.ts` — which channels actually run hard enough to
plan around, since plenty are named on a chart without carrying much
current — and `npm run build:passes` fills in the mechanical part from
the agencies: which depth bin to read, which way the flood sets, and how
hard each pass runs at springs. That output is US and Canadian
government open data (NOAA's is public domain, CHS's under the Open
Government Licence – Canada), so unlike the scrape it's ours to
redistribute. Re-run the script when you add a pass; there's no need to
run it to get a working checkout. `public/data/obstructions.json` is
hand-authored and committed for the same reason.

### Bad coordinates upstream

A few nwcruising.net pages carry coordinate headers that are simply
wrong, and a wrong position is worse than a missing one: it drags the
map line across the chart and puts the stop in the wrong weather zone.
Three were found by checking every edge's straight-line distance against
its published mileage — the great circle can never be longer than the
distance by water, so a big excess means an endpoint is misplaced:

- **Wollochet Bay** reads `123° 122' 33.85" W`. Minutes can't exceed 59,
  and the stray value silently became two extra degrees, putting the
  harbour ~100 nm out in the Pacific.
- **Mud Bay, Lopez Island** reads `47° 27' N` — that's Mud Bay in Eld
  Inlet near Olympia, about 70 nm from the Lopez bay the page is about.
- **Sandy Hook, Cultus Bay** reads a position out in mid-Sound off
  Kingston rather than on south Whidbey.

`parseDms` now rejects out-of-range minutes and seconds rather than
folding them into degrees, and the corrections live in
`public/data/location-fixes.json` — committed, each with the evidence
for it, and applied by `loadDataset`. They're kept there rather than
edited into the scraper's output, which the next crawl would overwrite.

The same check flags a handful of edges whose *published distance* looks
impossible — Bremerton to Desolation Sound is listed at 128.1 nm against
a 173.9 nm straight line, which no boat can do. Those are a different
class of error (a bad table row rather than a bad position) and are
currently left in the graph, where they act as shortcuts the planner will
happily take. Filtering edges whose published distance falls below the
great-circle distance between their endpoints would fix it; it isn't done
yet because the same check would drop legitimate edges wherever a
coordinate is still wrong.

## Optional: real chart tiles

The map defaults to an OpenStreetMap raster basemap. If you've built
the CHS chart layer in the sibling `bc-charts-pm` repo (licensed, not
redistributable — see that repo's README), you can overlay it locally
by pointing `NEXT_PUBLIC_CHART_PMTILES_URL` at wherever
`bc-charts-pm.pmtiles` is being served, e.g.:

```sh
# in bc-charts-pm/
make serve   # serves data/tiles/bc-charts-pm.pmtiles at :8080

# in salish-nav-planner/
NEXT_PUBLIC_CHART_PMTILES_URL="http://localhost:8080/../data/tiles/bc-charts-pm.pmtiles" npm run dev
```

Never bake this into a public deploy — the underlying CHS ENC data is
licensed to the registrant only.
