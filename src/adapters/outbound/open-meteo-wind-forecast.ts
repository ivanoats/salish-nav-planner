import {
  addDaysIso,
  daysBetweenIso,
  FORECAST_HORIZON_DAYS,
  SALISH_SEA_TIME_ZONE,
  todayIso,
  type IsoDate,
} from "@/domain/calendar";
import type {
  WindForecastProvider,
  WindForecastRequest,
} from "@/application/ports/wind-forecast-provider";
import type { ZoneWindForecast } from "@/domain/wind-field";
import type { DailyWind } from "@/domain/wind";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** Model runs land a few times a day; half an hour is fresh enough. */
const CACHE_SECONDS = 1800;

interface OpenMeteoDaily {
  readonly time?: readonly string[];
  readonly wind_speed_10m_max?: readonly (number | null)[];
  readonly wind_gusts_10m_max?: readonly (number | null)[];
  readonly wind_direction_10m_dominant?: readonly (number | null)[];
  readonly weather_code?: readonly (number | null)[];
  readonly precipitation_probability_max?: readonly (number | null)[];
}

interface OpenMeteoResponse {
  readonly daily?: OpenMeteoDaily;
}

/**
 * Open-Meteo returns a bare object for a single coordinate and an array
 * for several. Zone lists are configuration, so both shapes are reachable
 * and normalising here keeps that out of the mapping below.
 */
const asResponseArray = (payload: unknown): readonly OpenMeteoResponse[] =>
  Array.isArray(payload) ? (payload as OpenMeteoResponse[]) : [payload as OpenMeteoResponse];

/**
 * The overlap between the days asked for and the days the model actually
 * produces. Asking outside that range is an error to Open-Meteo rather
 * than an empty result, so the window is clamped before the request and
 * the caller simply gets fewer days back.
 */
const clampToForecastWindow = (
  startDate: IsoDate,
  days: number,
  today: IsoDate
): { readonly from: IsoDate; readonly to: IsoDate } | null => {
  const lastAvailable = addDaysIso(today, FORECAST_HORIZON_DAYS - 1);
  const from = daysBetweenIso(today, startDate) < 0 ? today : startDate;
  const requestedEnd = addDaysIso(startDate, days - 1);
  const to = daysBetweenIso(requestedEnd, lastAvailable) < 0 ? lastAvailable : requestedEnd;

  return daysBetweenIso(from, to) < 0 ? null : { from, to };
};

const toDailyWind = (daily: OpenMeteoDaily, index: number): DailyWind | null => {
  const date = daily.time?.[index];
  const speed = daily.wind_speed_10m_max?.[index];
  const direction = daily.wind_direction_10m_dominant?.[index];
  if (date === undefined || speed === null || speed === undefined) return null;
  if (direction === null || direction === undefined) return null;

  const gust = daily.wind_gusts_10m_max?.[index];

  return {
    date,
    speedKnots: speed,
    // A model that reports no gust is reporting a steady wind, not a
    // calm one — falling back to the sustained speed keeps the
    // "effective wind" maths from reading it as a lull.
    gustKnots: gust ?? speed,
    fromDegrees: direction,
    weatherCode: daily.weather_code?.[index] ?? null,
    precipitationChance: daily.precipitation_probability_max?.[index] ?? null,
  };
};

/**
 * Wind from Open-Meteo, which needs no key and takes every zone in a
 * single request — so a week of planning across the whole cruising ground
 * costs one call.
 */
export class OpenMeteoWindForecast implements WindForecastProvider {
  constructor(private readonly now: () => IsoDate = todayIso) {}

  async forecast({ zones, startDate, days }: WindForecastRequest): Promise<readonly ZoneWindForecast[]> {
    if (zones.length === 0 || days <= 0) return [];

    const window = clampToForecastWindow(startDate, days, this.now());
    if (window === null) return [];

    const url = new URL(ENDPOINT);
    url.searchParams.set("latitude", zones.map((zone) => zone.lat).join(","));
    url.searchParams.set("longitude", zones.map((zone) => zone.lon).join(","));
    url.searchParams.set(
      "daily",
      [
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "wind_direction_10m_dominant",
        "weather_code",
        "precipitation_probability_max",
      ].join(",")
    );
    url.searchParams.set("wind_speed_unit", "kn");
    url.searchParams.set("timezone", SALISH_SEA_TIME_ZONE);
    url.searchParams.set("start_date", window.from);
    url.searchParams.set("end_date", window.to);

    const response = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!response.ok) {
      throw new Error(`Open-Meteo returned ${response.status}`);
    }

    const payloads = asResponseArray(await response.json());

    return zones.map((zone, index) => {
      const daily = payloads[index]?.daily;
      const dates = daily?.time ?? [];
      const forecasts: DailyWind[] = [];

      for (let day = 0; day < dates.length; day++) {
        const wind = daily === undefined ? null : toDailyWind(daily, day);
        if (wind !== null) forecasts.push(wind);
      }

      return { zoneId: zone.id, days: forecasts };
    });
  }
}
