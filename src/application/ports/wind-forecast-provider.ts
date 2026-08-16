import type { IsoDate } from "@/domain/calendar";
import type { ZoneWindForecast } from "@/domain/wind-field";
import type { WindZone } from "@/domain/wind-zone";

export interface WindForecastRequest {
  readonly zones: readonly WindZone[];
  readonly startDate: IsoDate;
  /** Number of consecutive days wanted, starting at `startDate`. */
  readonly days: number;
}

/**
 * Daily wind for a set of zones. Implementations return only the days the
 * model actually covers — a request reaching past the forecast horizon
 * comes back short rather than padded.
 */
export interface WindForecastProvider {
  forecast(request: WindForecastRequest): Promise<readonly ZoneWindForecast[]>;
}
