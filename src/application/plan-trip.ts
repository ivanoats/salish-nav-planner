import {
  findRoute,
  rankNextDestinations,
  shortestDistancesFrom,
  type DestinationCandidate,
  type ReturnLegContext,
  type RouteGraph,
  type WindRankingContext,
} from "./route-graph";
import { dateForDay, type IsoDate } from "@/domain/calendar";
import { idealDistanceToEnd, RETURN_SHAPE_WEIGHT, type DayLengthRange, type TripDay } from "@/domain/trip";
import type { Coordinates } from "@/domain/location";
import type { WindField } from "@/domain/wind-field";

/**
 * Everything the planner needs to let weather shape the trip. Optional
 * throughout: without it the plan is the same distance-only plan it has
 * always been, which is what a trip beyond the forecast horizon gets.
 */
export interface WeatherContext {
  readonly startDate: IsoDate;
  readonly windField: WindField;
  readonly coordinatesBySlug: ReadonlyMap<string, Coordinates>;
  readonly weight: number;
}

export interface PlanTripInput {
  readonly graph: RouteGraph;
  readonly startSlug: string;
  /** Day 1's destination, always chosen by the user. */
  readonly firstDestinationSlug: string | null;
  /**
   * Where the trip has to finish. Equal to `startSlug` for a round
   * trip, some other location to end up elsewhere, or null to wander
   * one-way with no return obligation.
   */
  readonly endSlug: string | null;
  readonly days: number;
  readonly range: DayLengthRange;
  /**
   * Manual destination overrides for days 2..N, keyed by day number.
   * A day absent from this map gets an auto-picked destination.
   */
  readonly overrides: ReadonlyMap<number, string>;
  /** Omit to plan on distance alone. */
  readonly weather?: WeatherContext;
  /**
   * Mast height above the water, in feet. Given it, hops under fixed
   * spans the rig won't clear are dropped from the graph entirely, so
   * the planner routes around them rather than proposing a day that
   * ends at a bridge.
   */
  readonly mastHeightFeet?: number;
}

/**
 * The wind shaping for one day, anchored at the stop it departs from.
 * Each day gets its own date, so a week-long trip is ranked against the
 * weather it will actually meet rather than against today's.
 */
const windContextFor = (
  weather: WeatherContext | undefined,
  dayNumber: number,
  fromSlug: string
): WindRankingContext | undefined => {
  if (weather === undefined) return undefined;

  const originCoordinates = weather.coordinatesBySlug.get(fromSlug);
  if (originCoordinates === undefined) return undefined;

  const date = dateForDay(weather.startDate, dayNumber);

  return {
    originCoordinates,
    coordinatesBySlug: weather.coordinatesBySlug,
    windAt: (point) => weather.windField.windAt(point, date),
    weight: weather.weight,
  };
};

/**
 * Distances from every location to the trip's end point. The graph is
 * undirected, so one search from the end point answers "how far is it
 * home from here?" for every candidate on every day.
 */
const distancesToEndPoint = (
  graph: RouteGraph,
  endSlug: string | null,
  mastHeightFeet: number | undefined
): ReadonlyMap<string, number> | null =>
  endSlug === null ? null : shortestDistancesFrom(graph, endSlug, mastHeightFeet);

const returnContextFor = (
  distancesToEnd: ReadonlyMap<string, number> | null,
  dayNumber: number,
  days: number,
  range: DayLengthRange
): ReturnLegContext | undefined => {
  if (distancesToEnd === null) return undefined;
  const target = (range.minNm + range.maxNm) / 2;
  return {
    distancesToEnd,
    daysRemaining: days - dayNumber,
    idealDistanceToEnd: idealDistanceToEnd(dayNumber, days, target),
    weight: RETURN_SHAPE_WEIGHT,
  };
};

/**
 * Stops that a given day must not pick: everywhere the trip has already
 * been, plus the end point itself (arriving there early would end the
 * trip mid-plan — the final day is forced to it instead).
 */
const exclusionsFor = (
  visited: ReadonlySet<string>,
  endSlug: string | null
): ReadonlySet<string> => {
  if (endSlug === null) return visited;
  const exclude = new Set(visited);
  exclude.add(endSlug);
  return exclude;
};

/**
 * Builds the day-by-day chain: day 1 runs start -> firstDestination,
 * and each later day departs from wherever the previous day ended.
 *
 * Destinations for days 2..N are auto-picked as the best candidate
 * within the day-length range that hasn't been visited yet, unless the
 * user pinned one via `overrides`. When the trip has an `endSlug`, the
 * final day is forced to it and every earlier day is both constrained
 * (must still be able to reach the end point in the days left) and
 * shaped (pulled outbound early, homeward late).
 *
 * Chaining stops early (remaining days get a null destination) when
 * nothing is reachable in range — better to show the user the trip runs
 * out of options than to silently invent a leg outside their stated
 * day length.
 */
export const planTrip = ({
  graph,
  startSlug,
  firstDestinationSlug,
  endSlug,
  days,
  range,
  overrides,
  weather,
  mastHeightFeet,
}: PlanTripInput): TripDay[] => {
  const result: TripDay[] = [];
  const visited = new Set<string>([startSlug]);
  const distancesToEnd = distancesToEndPoint(graph, endSlug, mastHeightFeet);
  let current = startSlug;

  for (let dayNumber = 1; dayNumber <= days; dayNumber++) {
    const isFinalDay = dayNumber === days;
    const override = dayNumber === 1 ? firstDestinationSlug : overrides.get(dayNumber);

    let toSlug: string | null;
    let source: TripDay["source"];

    if (isFinalDay && endSlug !== null && dayNumber > 1) {
      // The trip has to finish here, so this day isn't up for grabs.
      toSlug = endSlug;
      source = "endpoint";
    } else if (override !== undefined && override !== null) {
      toSlug = override;
      source = "manual";
    } else if (dayNumber === 1) {
      toSlug = null;
      source = "manual";
    } else {
      toSlug =
        rankNextDestinations(graph, current, {
          range,
          exclude: exclusionsFor(visited, endSlug),
          returnLeg: returnContextFor(distancesToEnd, dayNumber, days, range),
          wind: windContextFor(weather, dayNumber, current),
          mastHeightFeet,
        })[0]?.slug ?? null;
      source = "auto";
    }

    const route = toSlug === null ? null : findRoute(graph, current, toSlug, mastHeightFeet);
    result.push({ dayNumber, fromSlug: current, toSlug, source, route });

    if (toSlug === null) {
      // No destination for this day, so later days have no origin to
      // depart from — emit them as empty rather than resuming the chain.
      for (let rest = dayNumber + 1; rest <= days; rest++) {
        result.push({
          dayNumber: rest,
          fromSlug: current,
          toSlug: null,
          source: "auto",
          route: null,
        });
      }
      break;
    }

    visited.add(toSlug);
    current = toSlug;
  }

  return result;
};

/**
 * The ranked alternatives for one day, using the same origin,
 * exclusions and shaping the planner itself applied — so cycling
 * through them stays consistent with how the day was picked.
 */
export const candidatesForDay = (
  input: PlanTripInput,
  dayNumber: number
): DestinationCandidate[] => {
  const tripDays = planTrip(input);
  const day = tripDays.find((d) => d.dayNumber === dayNumber);
  if (day === undefined || dayNumber === 1) return [];
  if (day.source === "endpoint") return [];

  const visited = new Set<string>([input.startSlug]);
  for (const earlier of tripDays) {
    if (earlier.dayNumber >= dayNumber) break;
    if (earlier.toSlug !== null) visited.add(earlier.toSlug);
  }

  return rankNextDestinations(input.graph, day.fromSlug, {
    range: input.range,
    exclude: exclusionsFor(visited, input.endSlug),
    returnLeg: returnContextFor(
      distancesToEndPoint(input.graph, input.endSlug, input.mastHeightFeet),
      dayNumber,
      input.days,
      input.range
    ),
    wind: windContextFor(input.weather, dayNumber, day.fromSlug),
    mastHeightFeet: input.mastHeightFeet,
  });
};
