/**
 * A calendar date with no time and no zone, "YYYY-MM-DD". Trip days are
 * dates rather than instants — "day 3" is a square on a calendar, and
 * only becomes an instant once a departure time is attached to it.
 */
export type IsoDate = string;

/**
 * The whole cruising ground shares one civil time zone: Washington and
 * British Columbia both observe Pacific time and change on the same
 * dates, so a single zone covers every stop, slack water and forecast
 * hour the planner shows.
 */
export const SALISH_SEA_TIME_ZONE = "America/Los_Angeles";

/**
 * How far ahead the weather model actually forecasts. Tidal currents are
 * astronomical and predictable years out, but wind past this horizon
 * simply isn't known, and the planner says so rather than showing stale
 * or invented numbers.
 */
export const FORECAST_HORIZON_DAYS = 16;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

/**
 * Dates are handled at UTC midnight throughout. Doing the arithmetic in
 * the local zone would let a day-length change move "tomorrow" by an
 * hour and occasionally land it back on today.
 */
const toUtcMidnight = (date: IsoDate): Date => new Date(`${date}T00:00:00Z`);

const fromUtcMidnight = (date: Date): IsoDate => date.toISOString().slice(0, 10);

/** Today's date in the cruising ground's zone, not the viewer's. */
export const todayIso = (): IsoDate => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SALISH_SEA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
};

export const addDaysIso = (date: IsoDate, days: number): IsoDate => {
  const shifted = toUtcMidnight(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return fromUtcMidnight(shifted);
};

export const daysBetweenIso = (from: IsoDate, to: IsoDate): number =>
  Math.round((toUtcMidnight(to).getTime() - toUtcMidnight(from).getTime()) / 86_400_000);

/** Day 1 of a trip is its start date, day 2 the next day, and so on. */
export const dateForDay = (startDate: IsoDate, dayNumber: number): IsoDate =>
  addDaysIso(startDate, dayNumber - 1);

/** True when the weather model reaches this far ahead. */
export const isWithinForecastHorizon = (date: IsoDate, today: IsoDate = todayIso()): boolean => {
  const offset = daysBetweenIso(today, date);
  return offset >= 0 && offset < FORECAST_HORIZON_DAYS;
};

/** "Sat 15 Aug" — enough to orient a plan without eating panel width. */
export const formatDayLabel = (date: IsoDate): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(toUtcMidnight(date));
