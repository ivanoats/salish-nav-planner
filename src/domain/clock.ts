import { SALISH_SEA_TIME_ZONE, type IsoDate } from "./calendar";

export const MINUTES_PER_DAY = 1440;

/** Anchor lifted after breakfast — the usual start of a cruising day. */
export const DEFAULT_DEPARTURE_MINUTES = 8 * 60;

/** Parses "HH:MM" into minutes past local midnight; null if malformed. */
export const parseClock = (value: string): number | null => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

/**
 * "HH:MM" in 24-hour time. Minutes past 24:00 wrap, so an ETA that runs
 * past midnight reads as a real clock time — use `dayOffsetOf` alongside
 * it to say which day that is.
 */
export const formatClock = (minutes: number): string => {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  return `${String(hours).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
};

/** How many midnights a minutes-past-midnight value crosses. */
export const dayOffsetOf = (minutes: number): number => Math.floor(minutes / MINUTES_PER_DAY);

/** "14:20" alone, or "01:40 +1d" when it lands on a later date. */
export const formatClockWithDay = (minutes: number): string => {
  const offset = dayOffsetOf(minutes);
  return offset === 0 ? formatClock(minutes) : `${formatClock(minutes)} +${offset}d`;
};

/**
 * The zone's UTC offset at a given instant, in milliseconds. Read back
 * out of `Intl` rather than hardcoded, so the March and November DST
 * changes are handled by the same code that handles the rest of the year.
 */
const zoneOffsetMs = (utcMs: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const field = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // `hour` comes back as 24 at midnight under hour12: false in some
  // engines; 24:00 and 00:00 name the same instant, so fold it down.
  const hour = field("hour") % 24;
  const asUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    hour,
    field("minute"),
    field("second")
  );

  return asUtc - utcMs;
};

/**
 * A local wall-clock time on a given date, as an instant.
 *
 * The offset depends on the instant, and the instant is what we're
 * solving for, so this guesses once and corrects — the second pass
 * settles it everywhere except the hour that DST skips, which has no
 * correct answer to find.
 */
export const localTimeToMs = (
  date: IsoDate,
  minutesPastMidnight: number,
  timeZone: string = SALISH_SEA_TIME_ZONE
): number => {
  const asIfUtc = new Date(`${date}T00:00:00Z`).getTime() + minutesPastMidnight * 60_000;
  const firstGuess = asIfUtc - zoneOffsetMs(asIfUtc, timeZone);
  return asIfUtc - zoneOffsetMs(firstGuess, timeZone);
};

/** Minutes past local midnight of `date` for an instant, possibly ≥ 1440. */
export const msToMinutesPastMidnight = (
  atMs: number,
  date: IsoDate,
  timeZone: string = SALISH_SEA_TIME_ZONE
): number => Math.round((atMs - localTimeToMs(date, 0, timeZone)) / 60_000);

/** "09:27" in the cruising ground's local time. */
export const formatInstant = (atMs: number, timeZone: string = SALISH_SEA_TIME_ZONE): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(atMs));
