import { isIsoDate, type IsoDate } from "@/domain/calendar";
import { formatClock, parseClock } from "@/domain/clock";
import {
  MAX_MAST_HEIGHT_FEET,
  MIN_MAST_HEIGHT_FEET,
} from "@/domain/obstruction";
import {
  MAX_DAY_HOURS,
  MAX_SPEED_KNOTS,
  MAX_TRIP_DAYS,
  MIN_DAY_HOURS,
  MIN_SPEED_KNOTS,
  MIN_TRIP_DAYS,
} from "@/domain/trip";

export const SHARED_TRIP_VERSION = 1 as const;

export const SHARED_TRIP_QUERY_KEYS = [
  "v",
  "days",
  "min-hours",
  "max-hours",
  "speed",
  "start",
  "first",
  "date",
  "depart",
  "mast",
  "wind",
  "round",
  "end",
  "stops",
  "pins",
] as const;

type SharedTripQueryKey = (typeof SHARED_TRIP_QUERY_KEYS)[number];

export interface SharedTripState {
  readonly version: typeof SHARED_TRIP_VERSION;
  readonly days: number;
  readonly minHours: number;
  readonly maxHours: number;
  readonly speedKnots: number;
  readonly startSlug: string;
  readonly firstDestinationSlug: string;
  readonly startDate: IsoDate;
  readonly departureMinutes: number;
  readonly mastHeightFeet: number;
  readonly windAware: boolean;
  readonly roundTrip: boolean;
  readonly customEndSlug: string | null;
  /** Start followed by one resolved destination for every day. */
  readonly stopSlugs: readonly string[];
  /** Actual user pins only; shared automatic-stop locks are intentionally separate. */
  readonly pinnedDays: readonly number[];
}

export type SharedTripIssueCode =
  | "duplicate-parameter"
  | "missing-parameter"
  | "unsupported-version"
  | "invalid-value"
  | "unknown-location"
  | "inconsistent-stops";

export interface SharedTripIssue {
  readonly code: SharedTripIssueCode;
  readonly parameter: SharedTripQueryKey;
  readonly message: string;
}

export interface SharedTripDecodeResult {
  readonly state: SharedTripState | null;
  readonly issues: readonly SharedTripIssue[];
  readonly hasSharedTrip: boolean;
}

interface SearchParamsReader {
  has(name: string): boolean;
  getAll(name: string): string[];
}

const normalizedNumber = (value: number): string =>
  String(Number(value.toFixed(3)));

export const encodeSharedTrip = (state: SharedTripState): URLSearchParams => {
  const query = new URLSearchParams();
  query.set("v", String(SHARED_TRIP_VERSION));
  query.set("days", String(state.days));
  query.set("min-hours", normalizedNumber(state.minHours));
  query.set("max-hours", normalizedNumber(state.maxHours));
  query.set("speed", normalizedNumber(state.speedKnots));
  query.set("start", state.startSlug);
  query.set("first", state.firstDestinationSlug);
  query.set("date", state.startDate);
  query.set("depart", formatClock(state.departureMinutes));
  query.set("mast", normalizedNumber(state.mastHeightFeet));
  query.set("wind", state.windAware ? "1" : "0");
  query.set("round", state.roundTrip ? "1" : "0");
  query.set("end", state.customEndSlug ?? "-");
  query.set("stops", state.stopSlugs.join(","));
  query.set("pins", state.pinnedDays.length === 0 ? "-" : state.pinnedDays.join(","));
  return query;
};

const issue = (
  code: SharedTripIssueCode,
  parameter: SharedTripQueryKey,
  message: string
): SharedTripIssue => ({ code, parameter, message });

const readFields = (
  query: SearchParamsReader,
  issues: SharedTripIssue[]
): Partial<Record<SharedTripQueryKey, string>> => {
  const fields: Partial<Record<SharedTripQueryKey, string>> = {};
  for (const key of SHARED_TRIP_QUERY_KEYS) {
    const values = query.getAll(key);
    if (values.length === 0) {
      issues.push(issue("missing-parameter", key, `Missing “${key}” from the shared trip.`));
    } else if (values.length > 1) {
      issues.push(issue("duplicate-parameter", key, `“${key}” appears more than once.`));
    } else {
      fields[key] = values[0];
    }
  }
  return fields;
};

const parseNumber = (
  value: string | undefined,
  parameter: SharedTripQueryKey,
  issues: SharedTripIssue[],
  { min, max, integer = false }: { min: number; max: number; integer?: boolean }
): number | null => {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (
    value.trim() === "" ||
    !Number.isFinite(parsed) ||
    parsed < min ||
    parsed > max ||
    (integer && !Number.isInteger(parsed))
  ) {
    issues.push(issue("invalid-value", parameter, `“${parameter}” has an invalid value.`));
    return null;
  }
  return parsed;
};

const parseBoolean = (
  value: string | undefined,
  parameter: SharedTripQueryKey,
  issues: SharedTripIssue[]
): boolean | null => {
  if (value === "1") return true;
  if (value === "0") return false;
  if (value !== undefined) {
    issues.push(issue("invalid-value", parameter, `“${parameter}” must be 0 or 1.`));
  }
  return null;
};

const knownLocation = (
  value: string | undefined,
  parameter: SharedTripQueryKey,
  knownSlugs: ReadonlySet<string>,
  issues: SharedTripIssue[],
  nullable = false
): string | null => {
  if (nullable && value === "-") return null;
  if (value === undefined) return null;
  if (!knownSlugs.has(value)) {
    issues.push(issue("unknown-location", parameter, `“${value}” is not a known location.`));
    return null;
  }
  return value;
};

const parsePins = (
  value: string | undefined,
  days: number | null,
  hasFixedEnd: boolean,
  issues: SharedTripIssue[]
): number[] | null => {
  if (value === undefined) return null;
  if (value === "-") return [];

  const pins = value.split(",").map(Number);
  const lastPinnableDay = days === null ? 0 : days - (hasFixedEnd && days > 1 ? 1 : 0);
  if (
    days === null ||
    pins.some(
      (day) => !Number.isInteger(day) || day < 2 || day > lastPinnableDay
    ) ||
    new Set(pins).size !== pins.length ||
    pins.some((day, index) => index > 0 && day <= (pins[index - 1] ?? 0))
  ) {
    issues.push(issue("invalid-value", "pins", "Pinned days are invalid or out of order."));
    return null;
  }
  return pins;
};

const validateStops = (
  value: string | undefined,
  days: number | null,
  startSlug: string | null,
  firstDestinationSlug: string | null,
  roundTrip: boolean | null,
  customEndSlug: string | null,
  knownSlugs: ReadonlySet<string>,
  issues: SharedTripIssue[]
): string[] | null => {
  if (value === undefined) return null;
  const stops = value.split(",");
  for (const slug of stops) {
    if (!knownSlugs.has(slug)) {
      issues.push(issue("unknown-location", "stops", `“${slug}” is not a known location.`));
    }
  }

  const expectedEnd = roundTrip ? startSlug : customEndSlug;
  const hasConsistentShape =
    days !== null &&
    stops.length === days + 1 &&
    stops[0] === startSlug &&
    stops[1] === firstDestinationSlug &&
    (days === 1 || expectedEnd === null || stops.at(-1) === expectedEnd);

  const seen = new Set<string>();
  const hasInvalidDuplicate = stops.some((slug, index) => {
    const allowedRoundTripReturn =
      roundTrip === true && days !== null && days > 1 && index === stops.length - 1 && slug === startSlug;
    if (seen.has(slug) && !allowedRoundTripReturn) return true;
    seen.add(slug);
    return false;
  });

  if (!hasConsistentShape || hasInvalidDuplicate) {
    issues.push(
      issue(
        "inconsistent-stops",
        "stops",
        "The resolved stops do not match the shared trip settings."
      )
    );
  }
  return stops;
};

interface ParsedSharedTrip {
  readonly days: number | null;
  readonly minHours: number | null;
  readonly maxHours: number | null;
  readonly speedKnots: number | null;
  readonly startSlug: string | null;
  readonly firstDestinationSlug: string | null;
  readonly startDate: IsoDate | null;
  readonly departureMinutes: number | null;
  readonly mastHeightFeet: number | null;
  readonly windAware: boolean | null;
  readonly roundTrip: boolean | null;
  readonly customEndSlug: string | null;
  readonly stopSlugs: string[] | null;
  readonly pinnedDays: number[] | null;
}

interface CompleteParsedSharedTrip extends ParsedSharedTrip {
  readonly days: number;
  readonly minHours: number;
  readonly maxHours: number;
  readonly speedKnots: number;
  readonly startSlug: string;
  readonly firstDestinationSlug: string;
  readonly startDate: IsoDate;
  readonly departureMinutes: number;
  readonly mastHeightFeet: number;
  readonly windAware: boolean;
  readonly roundTrip: boolean;
  readonly stopSlugs: string[];
  readonly pinnedDays: number[];
}

const validateVersion = (
  value: string | undefined,
  issues: SharedTripIssue[]
): void => {
  if (value !== undefined && value !== String(SHARED_TRIP_VERSION)) {
    issues.push(
      issue(
        "unsupported-version",
        "v",
        `Shared trip version “${value}” is not supported.`
      )
    );
  }
};

const parseHourRange = (
  fields: Partial<Record<SharedTripQueryKey, string>>,
  issues: SharedTripIssue[]
): Pick<ParsedSharedTrip, "minHours" | "maxHours"> => {
  const minHours = parseNumber(fields["min-hours"], "min-hours", issues, {
    min: MIN_DAY_HOURS,
    max: MAX_DAY_HOURS,
  });
  const maxHours = parseNumber(fields["max-hours"], "max-hours", issues, {
    min: MIN_DAY_HOURS,
    max: MAX_DAY_HOURS,
  });
  if (minHours !== null && maxHours !== null && minHours > maxHours) {
    issues.push(issue("invalid-value", "min-hours", "Minimum hours exceed maximum hours."));
  }
  return { minHours, maxHours };
};

const parseStartDate = (
  value: string | undefined,
  issues: SharedTripIssue[]
): IsoDate | null => {
  if (value === undefined) return null;
  if (isIsoDate(value)) return value;
  issues.push(issue("invalid-value", "date", "Start date is invalid."));
  return null;
};

const parseDeparture = (
  value: string | undefined,
  issues: SharedTripIssue[]
): number | null => {
  if (value === undefined) return null;
  const minutes = parseClock(value);
  if (minutes === null) {
    issues.push(issue("invalid-value", "depart", "Departure time is invalid."));
  }
  return minutes;
};

const parseSharedTripFields = (
  fields: Partial<Record<SharedTripQueryKey, string>>,
  knownSlugs: ReadonlySet<string>,
  issues: SharedTripIssue[]
): ParsedSharedTrip => {
  const days = parseNumber(fields.days, "days", issues, {
    min: MIN_TRIP_DAYS,
    max: MAX_TRIP_DAYS,
    integer: true,
  });
  const { minHours, maxHours } = parseHourRange(fields, issues);
  const speedKnots = parseNumber(fields.speed, "speed", issues, {
    min: MIN_SPEED_KNOTS,
    max: MAX_SPEED_KNOTS,
  });
  const mastHeightFeet = parseNumber(fields.mast, "mast", issues, {
    min: MIN_MAST_HEIGHT_FEET,
    max: MAX_MAST_HEIGHT_FEET,
  });
  const startDate = parseStartDate(fields.date, issues);
  const departureMinutes = parseDeparture(fields.depart, issues);
  const windAware = parseBoolean(fields.wind, "wind", issues);
  const roundTrip = parseBoolean(fields.round, "round", issues);
  const startSlug = knownLocation(fields.start, "start", knownSlugs, issues);
  const firstDestinationSlug = knownLocation(fields.first, "first", knownSlugs, issues);
  const customEndSlug = knownLocation(fields.end, "end", knownSlugs, issues, true);
  const stopSlugs = validateStops(
    fields.stops,
    days,
    startSlug,
    firstDestinationSlug,
    roundTrip,
    customEndSlug,
    knownSlugs,
    issues
  );
  const pinnedDays = parsePins(
    fields.pins,
    days,
    Boolean(roundTrip || customEndSlug),
    issues
  );

  return {
    days,
    minHours,
    maxHours,
    speedKnots,
    startSlug,
    firstDestinationSlug,
    startDate,
    departureMinutes,
    mastHeightFeet,
    windAware,
    roundTrip,
    customEndSlug,
    stopSlugs,
    pinnedDays,
  };
};

const isCompleteSharedTrip = (
  parsed: ParsedSharedTrip
): parsed is CompleteParsedSharedTrip =>
  [
    parsed.days,
    parsed.minHours,
    parsed.maxHours,
    parsed.speedKnots,
    parsed.startSlug,
    parsed.firstDestinationSlug,
    parsed.startDate,
    parsed.departureMinutes,
    parsed.mastHeightFeet,
    parsed.windAware,
    parsed.roundTrip,
    parsed.stopSlugs,
    parsed.pinnedDays,
  ].every((value) => value !== null);

export const decodeSharedTrip = (
  query: SearchParamsReader,
  knownSlugs: ReadonlySet<string>
): SharedTripDecodeResult => {
  // `v` is the namespace sentinel. Generic query keys such as `date` or
  // `start` may belong to another integration and must not trigger a warning.
  const hasSharedTrip = query.has("v");
  if (!hasSharedTrip) return { state: null, issues: [], hasSharedTrip: false };

  const issues: SharedTripIssue[] = [];
  const fields = readFields(query, issues);
  validateVersion(fields.v, issues);
  const parsed = parseSharedTripFields(fields, knownSlugs, issues);

  if (issues.length > 0 || !isCompleteSharedTrip(parsed)) {
    return { state: null, issues, hasSharedTrip };
  }

  return {
    state: {
      version: SHARED_TRIP_VERSION,
      ...parsed,
    },
    issues: [],
    hasSharedTrip,
  };
};

export const searchParamsFromRecord = (
  values: Readonly<Record<string, string | string[] | undefined>>
): URLSearchParams => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }
  return query;
};
