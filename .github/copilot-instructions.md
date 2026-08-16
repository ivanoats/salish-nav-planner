<!-- mermaid-ai-skills:start -->
## Mermaid Diagrams

When the user asks to create, edit, or visualize a diagram, follow the
instructions in `.github/instructions/mermaid.instructions.md`.
<!-- mermaid-ai-skills:end -->

# Copilot Instructions

## Project Overview

Salish Nav Planner is a multi-day trip-planning aid for cruising Puget Sound and
the Salish Sea. Users pick a start, a first-night destination, and a trip length
(1–7 days); the planner chains the remaining stops automatically. **Not for
navigation** — carry current charts.

## Commands

```sh
npm run dev           # stage maplibre worker + panda codegen + next dev
npm run build         # stage maplibre worker + panda codegen + next build
npm run typecheck     # panda codegen + tsc --noEmit
npm run test          # vitest run
npm run test:coverage # vitest run --coverage
npm run test:watch    # vitest watch mode
npm run lint          # eslint
npm run scrape        # re-run the nwcruising.net crawler
```

## Architecture

Hexagonal (Ports & Adapters) layering — keep the domain independent of
frameworks, UI, and infrastructure:

```
src/
  domain/        # Pure business logic — no framework imports
  application/   # Use cases & ports (interfaces the domain exposes)
  adapters/      # Implementations: Next.js glue, data loaders
  components/    # React UI components (thin — delegate to application layer)
```

- Domain code must not import from `next`, `maplibre-gl`, or any adapter.
- Adapters implement ports defined in `application/ports/`.
- UI components call use cases, not domain logic directly.

## Tech Stack

### Next.js (App Router)

- React Server Components by default; add `"use client"` only when needed.
- `params` and `searchParams` are async — always `await` them.
- Default to Node.js runtime (not Edge) unless there's a specific reason.

### Styling: Panda CSS + Ark UI

- **No Tailwind.** All styling via Panda CSS only.
- Use `css()` for one-off styles, `cva` recipes for multi-variant components.
- Ark UI provides headless, accessible components — style them with Panda CSS
  recipes, not inline styles.
- Design tokens live in `panda.config.ts`; use semantic tokens for light/dark mode.

### MapLibre GL JS

- MapLibre is a client-side library — map components must be `"use client"`.
- Never import MapLibre in Server Components; use dynamic imports with
  `ssr: false` if needed.
- Coordinates are `[longitude, latitude]` (GeoJSON standard) — MapLibre expects
  this order.
- Map view constants (center, zoom, colors, etc.) live in
  `src/components/map/map-constants.ts` — do not hardcode them in component files.
- The maplibre-gl web worker is staged by `scripts/copy-maplibre-worker.mjs` into
  `public/maplibre/`. Call `setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")` once
  before creating the map instance.
- Register the pmtiles protocol via `pmtiles.Protocol` before using any
  `pmtiles://` tile sources.

### PMTiles / Nautical Charts

- The app supports an optional local nautical chart overlay via the
  `NEXT_PUBLIC_CHART_PMTILES_URL` env var pointing at a `.pmtiles` archive.
- Never bake licensed CHS/NOAA chart data into a public deploy.

## Data Conventions

- **Coordinate order**: GeoJSON standard `[longitude, latitude]`.
- **Distance unit**: Nautical miles (`nm`).
- Scraped routing data (`public/data/*.geojson`, `public/data/edges.json`) is
  gitignored — regenerate locally with `npm run scrape`.
- `public/data/waypoints.json` is hand-authored and committed.

## Testing

- **Target**: 80% coverage across statements, branches, functions, and lines —
  enforced in CI.
- Test files live in `__tests__/` sibling directories: `foo.ts` → `__tests__/foo.test.ts`.
- Coverage includes `src/domain/` and `src/application/`.

## CI/CD

### Branching & Commits

Branch names follow conventional branching:

```
<type>/<short-description>
feat/nautical-chart-overlay
fix/route-line-rendering
chore/upgrade-maplibre
docs/adr-hexagonal-architecture
```

Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(map): add nautical chart pmtiles overlay
fix(route): correct bearing calculation for northbound legs
chore(deps): upgrade maplibre-gl to latest
docs(readme): update chart overlay instructions
test(domain): add route-line edge-case tests
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

### GitHub Actions

All CI runs on GitHub Actions (`.github/workflows/ci.yml`). Every PR must pass CI
before merge. Pipeline:

1. **lint-markdown** — markdownlint on all `**/*.md`
2. **lint** — ESLint on app code
3. **typecheck** — TypeScript strict check
4. **test** — Vitest with coverage; fails if below 80%
5. **build** — `next build`

### Code Quality

- Fix all lint errors before merging; do not suppress findings with inline ignore
  comments without a code comment explaining why.

## Architectural Decision Records (ADRs)

Document significant decisions in `docs/adr/`. File format:
`NNNN-title-in-kebab-case.md`

```md
# NNNN. Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded

## Context
## Decision
## Consequences
```

Create a new ADR for: framework/library choices, architectural patterns, data
flow decisions, and any reversal of a prior decision.

## Module System

- **ESM throughout** — use `import`/`export` in all app code.
- Legacy scripts (`scripts/*.ts`) may use tsx/CommonJS — do not import them from
  app code.

