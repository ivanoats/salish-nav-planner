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
- Each day after the first can be re-rolled (**Next** cycles through the
  other candidates) or pinned to a specific stop; pinning a day resets
  the auto-picked days after it, since they were chosen relative to a
  different upstream stop. A pinned stop outside your day-length window
  is honored but flagged.

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

`npm run scrape` must be run at least once before `npm run dev` /
`npm run build` — the app reads `public/data/locations.geojson` and
`public/data/edges.json` at request/build time and there's nothing
checked into git to fall back on (see [Data](#data)).

## Commands

```sh
npm run dev         # stage maplibre worker + panda codegen + next dev
npm run build       # stage maplibre worker + panda codegen + next build
npm run typecheck   # panda codegen + tsc --noEmit
npm run test         # vitest run
npm run test:coverage # vitest run --coverage
npm run test:watch  # vitest watch mode
npm run lint         # eslint
npm run scrape       # re-run the nwcruising.net crawler
```

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
data file that is committed.

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
