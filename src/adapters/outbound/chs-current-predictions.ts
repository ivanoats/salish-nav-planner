import type {
  CurrentPredictionsProvider,
  CurrentPredictionsRequest,
} from "@/application/ports/current-predictions-provider";
import type { CurrentEvent, CurrentEventType } from "@/domain/tidal";

const ENDPOINT = "https://api-iwls.dfo-mpo.gc.ca/api/v1/stations";

/** Same reasoning as NOAA: predictions don't go stale, the API is free. */
const CACHE_SECONDS = 86_400;

interface IwlsEvent {
  readonly eventDate?: string;
  readonly qualifier?: string;
  readonly value?: number;
}

const IWLS_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const EVENT_TYPES: Record<string, CurrentEventType> = {
  SLACK: "slack",
  EXTREMA_FLOOD: "maxFlood",
  EXTREMA_EBB: "maxEbb",
};

/**
 * Current predictions from the Canadian Hydrographic Service's IWLS API.
 *
 * This is the only source for the Canadian passes, and they're the ones
 * that most reward getting right — Dodd Narrows, Porlier, Gabriola,
 * Active Pass and Seymour Narrows all run hard enough to be timed rather
 * than attempted. IWLS publishes them as `wcp1-events`: the same slack
 * and extrema shape NOAA uses, in UTC.
 */
export class ChsCurrentPredictions implements CurrentPredictionsProvider {
  async predictions({
    station,
    fromMs,
    toMs,
  }: CurrentPredictionsRequest): Promise<readonly CurrentEvent[]> {
    const url = new URL(`${ENDPOINT}/${station.id}/data`);
    url.searchParams.set("time-series-code", "wcp1-events");
    url.searchParams.set("from", new Date(fromMs).toISOString());
    url.searchParams.set("to", new Date(toMs).toISOString());

    const response = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!response.ok) {
      throw new Error(`CHS returned ${response.status} for station ${station.id}`);
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];

    const events: CurrentEvent[] = [];

    for (const entry of payload as readonly IwlsEvent[]) {
      const type = EVENT_TYPES[entry.qualifier ?? ""];
      if (type === undefined || entry.eventDate === undefined) continue;

      // Shape-checked before parsing: Date.parse accepts a truncated
      // "2026-08" as the first of the month, so a half-written field
      // would become a plausible-looking wrong slack time rather than
      // being rejected. Outright garbage already yields NaN; this covers
      // the partial dates that do not.
      if (!IWLS_TIMESTAMP.test(entry.eventDate)) continue;
      const atMs = Date.parse(entry.eventDate);
      if (Number.isNaN(atMs)) continue;

      events.push({ type, atMs, speedKnots: Math.abs(entry.value ?? 0) });
    }

    return events.sort((a, b) => a.atMs - b.atMs);
  }
}
