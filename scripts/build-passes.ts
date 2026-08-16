/**
 * Builds `public/data/passes.json` — the tidal passes the planner times
 * transits through, each bound to a current-prediction station.
 *
 * The pass list itself is hand-written below and deliberately so: plenty
 * of channels are named on a chart without running hard enough to plan
 * around, and a couple of genuinely nasty spots aren't named at all. What
 * the script contributes is the mechanical part — which depth bin to
 * read, which way the flood sets, and how hard the pass runs at springs —
 * fetched from NOAA and the Canadian Hydrographic Service so those
 * numbers are theirs rather than half-remembered.
 *
 * Run with: npx tsx scripts/build-passes.ts
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const NOAA_STATIONS =
  "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=currentpredictions&units=english";
const NOAA_DATA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const CHS_STATIONS = "https://api-iwls.dfo-mpo.gc.ca/api/v1/stations";

/** A month of predictions is enough to catch a spring tide's peak rate. */
const SAMPLE_DAYS = 30;

interface PassSeed {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly aliases?: readonly string[];
  /** NOAA station id, or a CHS five-digit station code. */
  readonly station: string;
  readonly source: "noaa" | "chs";
}

/**
 * Coordinates are the middle of the navigable channel, not the station —
 * they decide whether a route passes through, so they want to sit where
 * a boat actually goes.
 */
const SEEDS: readonly PassSeed[] = [
  // Puget Sound and the approaches
  { id: "deception-pass", name: "Deception Pass", lat: 48.4064, lon: -122.6428, station: "PUG1701", source: "noaa" },
  { id: "admiralty-inlet", name: "Admiralty Inlet", lat: 48.15, lon: -122.7167, aliases: ["Point Wilson"], station: "PUG1624", source: "noaa" },
  { id: "tacoma-narrows", name: "Tacoma Narrows", lat: 47.2743, lon: -122.5453, aliases: ["The Narrows"], station: "PUG1527", source: "noaa" },
  { id: "colvos-passage", name: "Colvos Passage", lat: 47.4167, lon: -122.55, station: "PUG1518", source: "noaa" },
  { id: "agate-passage", name: "Agate Passage", lat: 47.7128, lon: -122.5464, aliases: ["Agate Pass"], station: "PUG1501", source: "noaa" },
  { id: "rich-passage", name: "Rich Passage", lat: 47.585, lon: -122.555, station: "PUG1513", source: "noaa" },
  { id: "port-townsend-canal", name: "Port Townsend Canal", lat: 48.0325, lon: -122.7326, station: "PUG1614", source: "noaa" },
  { id: "dana-passage", name: "Dana Passage", lat: 47.165, lon: -122.87, station: "PUG1539", source: "noaa" },
  { id: "balch-passage", name: "Balch Passage", lat: 47.2, lon: -122.69, station: "PUG1535", source: "noaa" },
  { id: "drayton-passage", name: "Drayton Passage", lat: 47.2167, lon: -122.7833, station: "PUG1537", source: "noaa" },
  { id: "pickering-passage", name: "Pickering Passage", lat: 47.26, lon: -122.88, station: "PUG1546", source: "noaa" },
  { id: "hale-passage-south", name: "Hale Passage", lat: 47.31, lon: -122.66, station: "PUG1529", source: "noaa" },

  // San Juans, Rosario and the Strait of Georgia approaches
  { id: "cattle-pass", name: "Cattle Pass", lat: 48.4506, lon: -122.9522, aliases: ["Cattle Point", "San Juan Channel"], station: "PUG1703", source: "noaa" },
  { id: "rosario-strait", name: "Rosario Strait", lat: 48.5667, lon: -122.75, station: "PUG1702", source: "noaa" },
  { id: "guemes-channel", name: "Guemes Channel", lat: 48.5167, lon: -122.6333, station: "PUG1734", source: "noaa" },
  { id: "thatcher-pass", name: "Thatcher Pass", lat: 48.5167, lon: -122.7167, station: "PUG1733", source: "noaa" },
  { id: "burrows-pass", name: "Burrows Pass", lat: 48.49, lon: -122.68, station: "PUG1738", source: "noaa" },
  { id: "lopez-pass", name: "Lopez Pass", lat: 48.4797, lon: -122.8189, station: "PUG1730", source: "noaa" },
  { id: "obstruction-pass", name: "Obstruction Pass", lat: 48.5983, lon: -122.8264, station: "PUG1705", source: "noaa" },
  { id: "peavine-pass", name: "Peavine Pass", lat: 48.595, lon: -122.81, station: "PUG1704", source: "noaa" },
  { id: "wasp-passage", name: "Wasp Passage", lat: 48.5925, lon: -122.9896, station: "PUG1721", source: "noaa" },
  { id: "upright-channel", name: "Upright Channel", lat: 48.5538, lon: -122.9226, station: "PUG1723", source: "noaa" },
  { id: "harney-channel", name: "Harney Channel", lat: 48.61, lon: -122.92, station: "PUG1722", source: "noaa" },
  { id: "spieden-channel", name: "Spieden Channel", lat: 48.64, lon: -123.12, station: "PUG1719", source: "noaa" },
  { id: "president-channel", name: "President Channel", lat: 48.6667, lon: -122.9333, station: "PUG1715", source: "noaa" },
  { id: "haro-strait", name: "Haro Strait", lat: 48.5833, lon: -123.1833, station: "PUG1718", source: "noaa" },
  { id: "boundary-pass", name: "Boundary Pass", lat: 48.7333, lon: -123.0833, aliases: ["Turn Point"], station: "PUG1717", source: "noaa" },
  { id: "swinomish-channel", name: "Swinomish Channel", lat: 48.42, lon: -122.5378, station: "PUG1628", source: "noaa" },

  // Gulf Islands and the British Columbia coast
  { id: "active-pass", name: "Active Pass", lat: 48.8664, lon: -123.2894, station: "07527", source: "chs" },
  { id: "porlier-pass", name: "Porlier Pass", lat: 49.0113, lon: -123.5859, station: "07438", source: "chs" },
  { id: "gabriola-passage", name: "Gabriola Passage", lat: 49.1291, lon: -123.7043, station: "07545", source: "chs" },
  { id: "dodd-narrows", name: "Dodd Narrows", lat: 49.1319, lon: -123.8083, station: "07487", source: "chs" },
  { id: "race-passage", name: "Race Passage", lat: 48.3067, lon: -123.5367, aliases: ["Race Rocks"], station: "07090", source: "chs" },
  { id: "first-narrows", name: "First Narrows", lat: 49.316, lon: -123.1401, aliases: ["Lions Gate"], station: "07721", source: "chs" },
  { id: "second-narrows", name: "Second Narrows", lat: 49.2947, lon: -123.0245, station: "07745", source: "chs" },
  { id: "sechelt-rapids", name: "Sechelt Rapids", lat: 49.7383, lon: -123.8983, aliases: ["Skookumchuck Narrows", "Skookumchuck"], station: "07845", source: "chs" },
  { id: "beazley-passage", name: "Beazley Passage", lat: 50.2263, lon: -125.142, aliases: ["Surge Narrows"], station: "07840", source: "chs" },
  { id: "hole-in-the-wall", name: "Hole in the Wall", lat: 50.3001, lon: -125.2083, station: "08052", source: "chs" },
  { id: "gillard-passage", name: "Gillard Passage", lat: 50.3933, lon: -125.1567, aliases: ["Gillard", "Yuculta Rapids"], station: "08059", source: "chs" },
  { id: "dent-rapids", name: "Dent Rapids", lat: 50.41, lon: -125.2117, station: "08138", source: "chs" },
  { id: "arran-rapids", name: "Arran Rapids", lat: 50.42, lon: -125.14, station: "08064", source: "chs" },
  { id: "seymour-narrows", name: "Seymour Narrows", lat: 50.1333, lon: -125.35, aliases: ["Discovery Passage"], station: "08108", source: "chs" },
  { id: "johnstone-strait", name: "Johnstone Strait", lat: 50.4717, lon: -126.1367, station: "08246", source: "chs" },
  { id: "blackney-passage", name: "Blackney Passage", lat: 50.555, lon: -126.6842, station: "08272", source: "chs" },
  { id: "weynton-passage", name: "Weynton Passage", lat: 50.6033, lon: -126.8117, station: "08277", source: "chs" },
  { id: "nakwakto-rapids", name: "Nakwakto Rapids", lat: 51.0967, lon: -127.5033, station: "08450", source: "chs" },
  { id: "quatsino-narrows", name: "Quatsino Narrows", lat: 50.555, lon: -127.555, station: "08760", source: "chs" },
];

const getJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
};

const compact = (date: Date): string => date.toISOString().slice(0, 10).replace(/-/g, "");

interface ResolvedPass {
  id: string;
  name: string;
  lat: number;
  lon: number;
  aliases?: readonly string[];
  station: { source: "noaa" | "chs"; id: string; bin?: number; depthFeet?: number };
  stationName: string;
  floodDirectionDegrees: number | null;
  maxKnots: number | null;
}

interface NoaaStation {
  readonly id: string;
  readonly name: string;
  readonly currbin?: number;
  readonly depth?: number | null;
}

/**
 * NOAA's harmonic stations publish one profile per depth bin. A hull sits
 * in the top few metres, so the shallowest bin is the one that matches
 * what the boat meets; subordinate stations have a single bin and no
 * depth at all.
 */
const shallowestBin = (candidates: readonly NoaaStation[]): NoaaStation | undefined => {
  const withDepth = candidates.filter((s) => typeof s.depth === "number");
  if (withDepth.length === 0) return candidates[0];
  return withDepth.sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))[0];
};

const resolveNoaa = async (seed: PassSeed, stations: readonly NoaaStation[]): Promise<ResolvedPass> => {
  const matches = stations.filter((s) => s.id === seed.station);
  if (matches.length === 0) throw new Error(`No NOAA station ${seed.station} for ${seed.name}`);

  const chosen = shallowestBin(matches);
  if (chosen === undefined) throw new Error(`No usable bin for ${seed.station}`);

  const from = new Date();
  const to = new Date(from.getTime() + SAMPLE_DAYS * 86_400_000);

  const url = new URL(NOAA_DATA);
  url.searchParams.set("product", "currents_predictions");
  url.searchParams.set("application", "salish-nav-planner-build");
  url.searchParams.set("station", seed.station);
  url.searchParams.set("begin_date", compact(from));
  url.searchParams.set("end_date", compact(to));
  url.searchParams.set("time_zone", "gmt");
  url.searchParams.set("interval", "MAX_SLACK");
  url.searchParams.set("units", "english");
  url.searchParams.set("format", "json");
  if (chosen.currbin !== undefined && chosen.depth !== null && chosen.depth !== undefined) {
    url.searchParams.set("bin", String(chosen.currbin));
  }

  const payload = (await getJson(url.toString())) as {
    current_predictions?: {
      cp?: readonly { Type?: string; Velocity_Major?: number; meanFloodDir?: number }[];
    };
  };

  const rows = payload.current_predictions?.cp ?? [];
  const maxKnots = rows.reduce((peak, row) => Math.max(peak, Math.abs(row.Velocity_Major ?? 0)), 0);
  const floodDirection = rows.find((row) => typeof row.meanFloodDir === "number")?.meanFloodDir;

  return {
    id: seed.id,
    name: seed.name,
    lat: seed.lat,
    lon: seed.lon,
    ...(seed.aliases === undefined ? {} : { aliases: seed.aliases }),
    station: {
      source: "noaa",
      id: seed.station,
      ...(chosen.currbin !== undefined && typeof chosen.depth === "number"
        ? { bin: chosen.currbin, depthFeet: chosen.depth }
        : {}),
    },
    stationName: chosen.name,
    floodDirectionDegrees: floodDirection ?? null,
    maxKnots: maxKnots > 0 ? Math.round(maxKnots * 10) / 10 : null,
  };
};

interface ChsStation {
  readonly id: string;
  readonly code: string;
  readonly officialName: string;
}

const resolveChs = async (seed: PassSeed, stations: readonly ChsStation[]): Promise<ResolvedPass> => {
  const station = stations.find((s) => s.code === seed.station);
  if (station === undefined) throw new Error(`No CHS station ${seed.station} for ${seed.name}`);

  const from = new Date();
  const to = new Date(from.getTime() + SAMPLE_DAYS * 86_400_000);
  const window = `from=${from.toISOString()}&to=${to.toISOString()}`;

  const events = (await getJson(
    `${CHS_STATIONS}/${station.id}/data?time-series-code=wcp1-events&${window}`
  )) as readonly { eventDate?: string; qualifier?: string; value?: number }[];

  const maxKnots = events.reduce((peak, e) => Math.max(peak, Math.abs(e.value ?? 0)), 0);

  // CHS publishes speed and direction as separate series, so the flood
  // direction has to be read off the direction series at the moment of a
  // flood peak rather than coming attached to the event.
  let floodDirectionDegrees: number | null = null;
  const flood = events.find((e) => e.qualifier === "EXTREMA_FLOOD" && e.eventDate !== undefined);

  if (flood?.eventDate !== undefined) {
    const at = Date.parse(flood.eventDate);
    const directions = (await getJson(
      `${CHS_STATIONS}/${station.id}/data?time-series-code=wcdp1` +
        `&from=${new Date(at - 900_000).toISOString()}&to=${new Date(at + 900_000).toISOString()}`
    )) as readonly { eventDate?: string; value?: number }[];

    const nearest = directions
      .filter((d) => d.eventDate !== undefined && typeof d.value === "number")
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.eventDate ?? "") - at) - Math.abs(Date.parse(b.eventDate ?? "") - at)
      )[0];

    if (nearest?.value !== undefined) floodDirectionDegrees = Math.round(nearest.value);
  }

  return {
    id: seed.id,
    name: seed.name,
    lat: seed.lat,
    lon: seed.lon,
    ...(seed.aliases === undefined ? {} : { aliases: seed.aliases }),
    station: { source: "chs", id: station.id },
    stationName: station.officialName,
    floodDirectionDegrees,
    maxKnots: maxKnots > 0 ? Math.round(maxKnots * 10) / 10 : null,
  };
};

const main = async (): Promise<void> => {
  console.log(`Resolving ${SEEDS.length} passes…`);

  const [noaaPayload, chsStations] = await Promise.all([
    getJson(NOAA_STATIONS) as Promise<{ stations: readonly NoaaStation[] }>,
    getJson(CHS_STATIONS) as Promise<readonly ChsStation[]>,
  ]);

  const resolved: ResolvedPass[] = [];
  const failures: string[] = [];

  for (const seed of SEEDS) {
    try {
      const pass =
        seed.source === "noaa"
          ? await resolveNoaa(seed, noaaPayload.stations)
          : await resolveChs(seed, chsStations);
      resolved.push(pass);
      const flood = pass.floodDirectionDegrees;
      console.log(
        `  ${pass.name.padEnd(22)} ${pass.station.source.toUpperCase()} ${pass.stationName.slice(0, 34).padEnd(36)}` +
          ` flood=${flood === null ? "?" : `${flood}°`} max=${pass.maxKnots ?? "?"}kt`
      );
    } catch (error) {
      failures.push(`${seed.name}: ${(error as Error).message}`);
      console.warn(`  ! ${seed.name} — ${(error as Error).message}`);
    }
  }

  const target = join(process.cwd(), "public", "data", "passes.json");
  await writeFile(target, `${JSON.stringify(resolved, null, 2)}\n`, "utf-8");

  console.log(`\nWrote ${resolved.length} passes to ${target}`);
  if (failures.length > 0) console.log(`${failures.length} unresolved:\n  ${failures.join("\n  ")}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
