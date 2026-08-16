import { dateForDay, type IsoDate } from "@/domain/calendar";
import { localTimeToMs } from "@/domain/clock";
import { passTransitsForDay, type PassTransit } from "@/domain/pass-transit";
import { transitAdviceAt, type CurrentEvent, type TransitAdvice } from "@/domain/tidal";
import type { Coordinates, Location, Waypoint } from "@/domain/location";
import type { TidalPass } from "@/domain/pass";
import type { TripDay } from "@/domain/trip";
import type { DailyWind } from "@/domain/wind";
import type { WindField } from "@/domain/wind-field";

export interface DayPassTransits {
  readonly dayNumber: number;
  readonly date: IsoDate;
  readonly transits: readonly PassTransit[];
}

export interface PassTransitConditions {
  readonly transit: PassTransit;
  /** Null when the station returned nothing covering the arrival time. */
  readonly advice: TransitAdvice | null;
}

export interface DayConditions {
  readonly dayNumber: number;
  readonly date: IsoDate;
  /** Null past the forecast horizon, or before a route exists. */
  readonly wind: DailyWind | null;
  readonly passes: readonly PassTransitConditions[];
}

export interface TripScheduleInput {
  readonly tripDays: readonly TripDay[];
  readonly startDate: IsoDate;
  /** Minutes past local midnight each day gets underway. */
  readonly departureMinutes: number;
  readonly speedKnots: number;
  readonly locationsBySlug: ReadonlyMap<string, Location>;
  readonly waypoints: readonly Waypoint[];
  readonly passes: readonly TidalPass[];
}

/**
 * Every tidal pass the trip goes through, day by day.
 *
 * Split out from the conditions below because it answers the question
 * that has to come first: which stations are worth asking for
 * predictions. Fetching all 47 passes when a trip crosses two is the kind
 * of waste that makes a free public API stop being free.
 */
export const passTransitsForTrip = ({
  tripDays,
  startDate,
  departureMinutes,
  speedKnots,
  locationsBySlug,
  waypoints,
  passes,
}: TripScheduleInput): DayPassTransits[] =>
  tripDays.map((day) => ({
    dayNumber: day.dayNumber,
    date: dateForDay(startDate, day.dayNumber),
    transits:
      day.route === null
        ? []
        : passTransitsForDay({
            route: day.route,
            locationsBySlug,
            waypoints,
            passes,
            departureMinutes,
            speedKnots,
          }),
  }));

/** Where a day is sailed, for the purpose of picking a wind zone. */
const dayMidpoint = (
  day: TripDay,
  locationsBySlug: ReadonlyMap<string, Location>
): Coordinates | null => {
  const from = locationsBySlug.get(day.fromSlug);
  const to = day.toSlug === null ? undefined : locationsBySlug.get(day.toSlug);
  if (from === undefined) return null;
  if (to === undefined) return { lat: from.lat, lon: from.lon };
  return { lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 };
};

export interface DayConditionsInput extends TripScheduleInput {
  readonly windField: WindField;
  /** Predicted current events for the whole trip window, keyed by pass id. */
  readonly currentsByPassId: ReadonlyMap<string, readonly CurrentEvent[]>;
}

/**
 * The weather and tide picture for each day of a plan.
 *
 * Wind is read at the midpoint of the day's run rather than at either
 * end, since that's the water actually crossed. Each pass gets its
 * predicted current at the moment the boat is expected to reach it, which
 * is the number that decides whether to press on, leave earlier, or
 * anchor and wait for the turn.
 */
export const buildDayConditions = (input: DayConditionsInput): DayConditions[] => {
  const { tripDays, startDate, speedKnots, locationsBySlug, windField, currentsByPassId } = input;
  const transitsByDay = new Map(
    passTransitsForTrip(input).map((day) => [day.dayNumber, day.transits] as const)
  );

  return tripDays.map((day) => {
    const date = dateForDay(startDate, day.dayNumber);
    const midpoint = dayMidpoint(day, locationsBySlug);

    const passes: PassTransitConditions[] = (transitsByDay.get(day.dayNumber) ?? []).map(
      (transit) => {
        const events = currentsByPassId.get(transit.pass.id) ?? [];
        const atMs = localTimeToMs(date, transit.etaMinutes);

        return {
          transit,
          advice:
            events.length === 0
              ? null
              : transitAdviceAt(events, atMs, {
                  courseDegrees: transit.courseDegrees,
                  floodDirectionDegrees: transit.pass.floodDirectionDegrees,
                  boatSpeedKnots: speedKnots,
                }),
        };
      }
    );

    return {
      dayNumber: day.dayNumber,
      date,
      wind: midpoint === null ? null : windField.windAt(midpoint, date),
      passes,
    };
  });
};
