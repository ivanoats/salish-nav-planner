# 0002. A Salish Sea navigation mesh traced from a rasterised shoreline

**Date:** 2026-08-23
**Status:** Accepted

## Context

ADR 0001 laid out four ways to stop the map drawing route lines across
land, and recommended starting with Option A: hand-authored corridor
polylines for a handful of named passages. That work has since run into
its own limit. Hand-typed coordinates are only as good as the author's
recollection of where a channel actually sits, and the failures are
quiet — a control point a kilometre inland still produces a plausible
line on a small-scale map, and only shows itself when someone zooms in.

Meanwhile the planner needs more than prettier lines. It has 220
harbours and no notion of the water between them beyond the scraped
distance tables, so there is nowhere to hang per-edge geometry, pass
timing along a track, or an obstruction check that follows the route
rather than a straight line.

## Decision

Build `public/data/salish-mesh.json`: one connected GeoJSON network of
deep-water corridors, tidal passes, and an entrance spur for every
harbour in the dataset. This is ADR 0001's Option B, generalised from
per-edge geometry to a reusable network.

Generate it offline, from data rather than from memory:

1. Cache the OpenStreetMap `natural=coastline` ways for the region, plus
   the freshwater bodies the coastline layer does not cover (Lake
   Washington and the ship canal above the Ballard Locks).
2. Rasterise the shoreline as a barrier at 80 m and flood-fill inward
   from the open Pacific. What the flood reaches is water connected to
   the sea, which is the same question a navigator asks. A short list of
   named patches reopens the few channels narrower than a cell — the
   lock chambers, the Fremont and Montlake cuts, the dredged Swinomish
   cut.
3. Hand-author only the *skeleton*: which named waterways exist, what
   class each is, what it branches from, and a handful of control points
   that put it in the right body of water. Everything between the
   control points is traced by an A\* search biased towards mid-channel.
4. Trace each harbour's spur the same way, outward until it meets the
   network, and split the corridor at that point so the two share an
   exact vertex.

## Consequences

### What this buys

- Corridors follow real water. The build fails the run loudly if any
  emitted line crosses land, and reports whether the mesh is one
  connected component.
- The skeleton is reviewable. A corridor is a name, a class, and four to
  twenty control points, which is a thing a person can check; the
  thousand-point traced geometry is not, and is now generated.
- Passes and bridges attach themselves. `passes.json` and
  `obstructions.json` entries are matched to the corridor that runs past
  them, so the associations cannot drift out of step by hand.
- It is regenerable. The shoreline cache is a local, gitignored artefact
  on the same footing as `data/raw`; `npm run mesh` rebuilds the file.

### What it costs

- A one-off Overpass crawl of ~90 tiles, which is slow and depends on a
  free shared service. The cache makes it a one-off.
- A build that holds an 80-million-cell raster in memory, so the script
  runs under a raised heap limit rather than as part of `npm run build`.
- Resolution limits. An 80 m cell cannot describe a 40 m dredged cut, so
  those channels are described by hand-drawn patches and are the least
  trustworthy geometry in the file.
- OSM's shoreline is mean high water, not a sounding. The mesh says
  where the water is, never how deep — see the caution in the file's own
  metadata.

### What it does not do

Nothing in the app reads the mesh yet. Wiring `route-line.ts` to snap a
planned leg onto the network, so displayed geometry and pass ETAs both
come from it, is the next step and is deliberately out of this change.

ADR 0001 stands as the record of the options considered; this supersedes
its recommendation of Option A as the starting point.
