import { addDaysIso } from "@/domain/calendar";
import type {
  CurrentPredictionsProvider,
  CurrentPredictionsRequest,
} from "@/application/ports/current-predictions-provider";
import type {
  WindForecastProvider,
  WindForecastRequest,
} from "@/application/ports/wind-forecast-provider";
import type { CurrentEvent, CurrentEventType } from "@/domain/tidal";
import type { ZoneWindForecast } from "@/domain/wind-field";

/**
 * Offline stand-ins for Open-Meteo, NOAA and CHS, selected with
 * `SYNTHETIC_CONDITIONS=1`.
 *
 * The API routes call those agencies from the server, where a browser
 * test cannot intercept them, so the e2e suite swaps the providers here
 * instead. Both are deterministic: the same request always gets the same
 * answer, which is what lets a test assert on what the page shows.
 */
export const usesSyntheticConditions = (): boolean => process.env.SYNTHETIC_CONDITIONS === "1";

/** A steady moderate southwesterly in every zone, every day asked for. */
export class SyntheticWindForecast implements WindForecastProvider {
  async forecast({ zones, startDate, days }: WindForecastRequest): Promise<readonly ZoneWindForecast[]> {
    return zones.map((zone) => ({
      zoneId: zone.id,
      days: Array.from({ length: days }, (_, offset) => ({
        date: addDaysIso(startDate, offset),
        speedKnots: 12,
        gustKnots: 18,
        fromDegrees: 225,
        weatherCode: 1,
        precipitationChance: 10,
      })),
    }));
  }
}

const MINUTE_MS = 60_000;

/** A quarter of a semidiurnal cycle: slack, max flood, slack, max ebb. */
const QUARTER_CYCLE_MS = 186 * MINUTE_MS;

const CYCLE: readonly CurrentEventType[] = ["slack", "maxFlood", "slack", "maxEbb"];

/**
 * A clean semidiurnal current, phased off the Unix epoch so every pass
 * and every request agrees on when slack falls.
 */
export class SyntheticCurrentPredictions implements CurrentPredictionsProvider {
  async predictions({ fromMs, toMs }: CurrentPredictionsRequest): Promise<readonly CurrentEvent[]> {
    const events: CurrentEvent[] = [];
    for (let step = Math.floor(fromMs / QUARTER_CYCLE_MS); step * QUARTER_CYCLE_MS <= toMs; step++) {
      const atMs = step * QUARTER_CYCLE_MS;
      if (atMs < fromMs) continue;
      const type = CYCLE[((step % CYCLE.length) + CYCLE.length) % CYCLE.length] as CurrentEventType;
      events.push({ type, atMs, speedKnots: type === "slack" ? 0 : 3.5 });
    }
    return events;
  }
}
