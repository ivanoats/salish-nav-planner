# 0001. Water-route geometry options

**Date:** 2026-08-18
**Status:** Proposed

## Context

The current planner finds plausible stop-to-stop routes, but the map
does not have real route geometry. `src/domain/route-line.ts` draws a
line from each leg's start to its end, bent only through any named
`via` waypoint that can be resolved from `public/data/waypoints.json`.
That keeps the implementation small, but some displayed lines still cut
across land.

Issue #15 asks for options before implementation work starts. Any
solution should fit the current Next.js + TypeScript app, preserve the
existing route graph and mast-height logic, and keep the app firmly in
"planning aid, not navigation" territory.

## Decision

Do not adopt `searoute-py` directly.

Instead, choose between the options below, with a phased local-data
approach recommended as the lowest-risk next step:

1. Extend the existing waypoint data from single points to short
   water-following corridor polylines for the busiest named passages.
2. If that still leaves too many bad lines, add an offline build step
   that computes per-edge water-following geometry and stores it in the
   dataset.
3. Revisit a searoute-style library only if we later build our own
   Salish Sea network and want a reusable pathfinding engine around it.

## Consequences

### Option A — Extend the current waypoint approach

Add ordered corridor coordinates for the most important passages already
named in `public/data/waypoints.json` such as Deception Pass, Swinomish
Channel, Port Townsend Canal, Active Pass, Dodd Narrows, and Seymour
Narrows.

**Pros**

- Smallest change to the current architecture.
- Stays TypeScript-native with no new runtime service.
- Improves the routes users notice most quickly.
- Keeps the same route graph, wind ranking, and bridge-clearance logic.

**Cons**

- Manual data curation.
- Only improves passages we explicitly map.
- Still an approximation, not full route geometry for every edge.

### Option B — Precompute route geometry offline

Generate water-following polylines for each edge during dataset
preparation, then store those coordinates alongside the existing edge
distance and timing data.

**Pros**

- Best long-term accuracy without adding runtime latency.
- Fits the current "prepare data once, read it at runtime" model.
- Could improve both route display and geometry-based obstruction checks.

**Cons**

- More engineering work up front.
- Needs a trustworthy water dataset and manual QA for tricky passages.
- Makes the generated route dataset larger.

### Option C — Use `searoute-py`

`searoute-py` returns GeoJSON water routes and can load a custom graph,
but its bundled network is aimed at global shipping lanes, not narrow
inland channels like the Salish Sea. It also adds a Python dependency to
an otherwise Node/TypeScript project.

**Pros**

- Already solves shortest-path routing on a water network.
- Emits GeoJSON directly.
- Could be useful as inspiration for an offline tool or custom-network
  experiment.

**Cons**

- Poor fit for this repository's runtime stack.
- Bundled data is too coarse for Puget Sound and the Gulf Islands.
- No built-in notion of mast-height or the app's obstruction rules.

### Option D — Use a TypeScript searoute-style library with a custom network

A TypeScript port such as `searoute-ts` is a better stack fit than
`searoute-py`, but it still needs a Salish Sea-specific water network to
be useful here.

**Pros**

- Better language fit than Python.
- Could reuse a tested pathfinding wrapper if we later build local graph
  data.

**Cons**

- Does not remove the hardest part, which is building trustworthy local
  water geometry.
- Still not enough on its own to fix the current map lines.

## Recommended next step

Start with Option A:

1. Add corridor polylines for the handful of passages that cause the
   most obvious land crossings.
2. Update `buildDisplayedRouteLineCoordinates` to expand a named passage into its
   corridor coordinates instead of a single midpoint when available.
3. Re-check how that affects both map output and obstruction matching.

If that proves too manual or leaves too many wrong lines, move to Option
B and generate per-edge geometry offline.
