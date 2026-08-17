import type {
  CurrentPredictionsProvider,
  CurrentPredictionsRequest,
} from "@/application/ports/current-predictions-provider";
import type { CurrentEvent, CurrentEventType } from "@/domain/tidal";

const ENDPOINT = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

/** NOAA asks callers to identify themselves; this is that identifier. */
const APPLICATION = "salish-nav-planner";

/**
 * Currents are astronomical, so a prediction made today is the same one
 * made next week. Cached for a day purely to be a good citizen of a free
 * public API.
 */
const CACHE_SECONDS = 86_400;

interface NoaaCurrentPrediction {
  readonly Type?: string;
  readonly Time?: string;
  readonly Velocity_Major?: number | string;
}

interface NoaaResponse {
  readonly current_predictions?: { readonly cp?: readonly NoaaCurrentPrediction[] };
  readonly error?: { readonly message?: string };
}

/** "20260815" — the only date format the datagetter accepts. */
const toCompactDate = (atMs: number): string =>
  new Date(atMs).toISOString().slice(0, 10).replace(/-/g, "");

const EVENT_TYPES: Record<string, CurrentEventType> = {
  slack: "slack",
  flood: "maxFlood",
  ebb: "maxEbb",
};

/**
 * NOAA hands back "2026-08-15 00:21" with no offset, so the request asks
 * for GMT and this reads it as such. Requesting local time instead would
 * mean re-deriving the station's DST rules to get back to an instant.
 */
const toEpochMs = (time: string): number | null => {
  const parsed = Date.parse(`${time.replace(" ", "T")}:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Slack and maximum currents from NOAA's Tides & Currents service, which
 * covers the US side of the border — Deception Pass, Cattle Pass, Agate
 * Passage, Admiralty Inlet and the rest of Puget Sound.
 */
export class NoaaCurrentPredictions implements CurrentPredictionsProvider {
  async predictions({
    station,
    fromMs,
    toMs,
  }: CurrentPredictionsRequest): Promise<readonly CurrentEvent[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("product", "currents_predictions");
    url.searchParams.set("application", APPLICATION);
    url.searchParams.set("station", station.id);
    url.searchParams.set("begin_date", toCompactDate(fromMs));
    url.searchParams.set("end_date", toCompactDate(toMs));
    url.searchParams.set("time_zone", "gmt");
    url.searchParams.set("interval", "MAX_SLACK");
    url.searchParams.set("units", "english");
    url.searchParams.set("format", "json");
    if (station.bin !== undefined) {
      url.searchParams.set("bin", String(station.bin));
    }

    const response = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!response.ok) {
      throw new Error(`NOAA returned ${response.status} for station ${station.id}`);
    }

    const payload = (await response.json()) as NoaaResponse;
    if (payload.error?.message !== undefined) {
      throw new Error(`NOAA: ${payload.error.message}`);
    }

    const events: CurrentEvent[] = [];

    for (const prediction of payload.current_predictions?.cp ?? []) {
      const type = EVENT_TYPES[(prediction.Type ?? "").toLowerCase()];
      if (type === undefined || prediction.Time === undefined) continue;

      const atMs = toEpochMs(prediction.Time);
      if (atMs === null) continue;

      events.push({
        type,
        atMs,
        speedKnots: Math.abs(Number(prediction.Velocity_Major ?? 0)),
      });
    }

    return events.sort((a, b) => a.atMs - b.atMs);
  }
}
