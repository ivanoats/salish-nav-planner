import { nearestZone, type WindZone } from "./wind-zone";
import type { IsoDate } from "./calendar";
import type { Coordinates } from "./location";
import type { DailyWind } from "./wind";

/** A zone's forecast, one entry per day. */
export interface ZoneWindForecast {
  readonly zoneId: string;
  readonly days: readonly DailyWind[];
}

/**
 * The forecast as the rest of the app wants to ask about it: what's the
 * wind here, on this date. Returns null past the model's horizon or for a
 * zone that came back empty, and every caller has to handle that — a trip
 * three weeks out has no weather, and the planner says so rather than
 * quietly assuming calm.
 */
export interface WindField {
  windAt(point: Coordinates, date: IsoDate): DailyWind | null;
  /** True when at least one zone has at least one day of forecast. */
  readonly hasData: boolean;
}

export const EMPTY_WIND_FIELD: WindField = {
  windAt: () => null,
  hasData: false,
};

export const createWindField = (
  zones: readonly WindZone[],
  forecasts: readonly ZoneWindForecast[]
): WindField => {
  const byZone = new Map<string, Map<IsoDate, DailyWind>>();

  for (const forecast of forecasts) {
    const byDate = new Map<IsoDate, DailyWind>();
    for (const day of forecast.days) byDate.set(day.date, day);
    byZone.set(forecast.zoneId, byDate);
  }

  const hasData = [...byZone.values()].some((byDate) => byDate.size > 0);

  return {
    hasData,
    windAt: (point, date) => {
      const zone = nearestZone(point, zones);
      if (zone === null) return null;
      return byZone.get(zone.id)?.get(date) ?? null;
    },
  };
};
