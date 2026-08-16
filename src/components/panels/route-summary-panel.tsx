"use client";

import { css } from "styled-system/css";
import { PassTransitList } from "./pass-transit-list";
import { WindBadge } from "./wind-badge";
import { formatDayLabel } from "@/domain/calendar";
import { formatClock } from "@/domain/clock";
import { bearingDegrees } from "@/domain/geo";
import { nmToHrMin } from "@/domain/hr-min";
import { clearanceVerdict, type Obstruction } from "@/domain/obstruction";
import type { DayConditions } from "@/application/day-conditions";
import type { Location } from "@/domain/location";
import type { TripDay } from "@/domain/trip";

interface RouteSummaryPanelProps {
  readonly tripDays: readonly TripDay[];
  readonly totalNm: number;
  readonly speedKnots: number;
  readonly departureMinutes: number;
  readonly mastHeightFeet: number;
  readonly locationsBySlug: ReadonlyMap<string, Location>;
  readonly dayConditions: readonly DayConditions[];
  readonly currentsLoading: boolean;
  readonly obstructionsFor: (ids: readonly string[]) => Obstruction[];
}

/**
 * Bridges on a leg. Anything the rig won't clear on its own is worth
 * saying out loud even though the planner already routed around fixed
 * spans — what's left is opening bridges, where the cost is a radio call
 * and a wait rather than a detour.
 */
function LegObstructions({
  obstructions,
  mastHeightFeet,
}: {
  readonly obstructions: readonly Obstruction[];
  readonly mastHeightFeet: number;
}) {
  if (obstructions.length === 0) return null;

  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "0.5" })}>
      {obstructions.map((obstruction) => {
        const verdict = clearanceVerdict(obstruction, mastHeightFeet);
        return (
          <div
            key={obstruction.id}
            className={css({
              fontSize: "xs",
              color: verdict === "clears" ? "fg.subtle" : "amber.11",
            })}
          >
            {obstruction.name} · {obstruction.clearanceFeet} ft
            {verdict === "clears"
              ? " · clears"
              : verdict === "opens"
                ? " · opens on request — you do not fit under it closed"
                : " · fixed span, you do not fit"}
          </div>
        );
      })}
    </div>
  );
}

const nameOf = (locationsBySlug: ReadonlyMap<string, Location>, slug: string) =>
  locationsBySlug.get(slug)?.name ?? slug;

const statLabel = css({ fontSize: "xs", color: "fg.muted" });
const statValue = css({ fontSize: "xl", fontWeight: "semibold" });

/** Straight-line course for the day, for naming the point of sail. */
const courseFor = (
  day: TripDay,
  locationsBySlug: ReadonlyMap<string, Location>
): number | undefined => {
  const from = locationsBySlug.get(day.fromSlug);
  const to = day.toSlug === null ? undefined : locationsBySlug.get(day.toSlug);
  if (from === undefined || to === undefined) return undefined;
  return bearingDegrees(from, to);
};

export function RouteSummaryPanel({
  tripDays,
  totalNm,
  speedKnots,
  departureMinutes,
  mastHeightFeet,
  locationsBySlug,
  dayConditions,
  currentsLoading,
  obstructionsFor,
}: RouteSummaryPanelProps) {
  const plannedDays = tripDays.filter((day) => day.route !== null);
  if (plannedDays.length === 0) return null;

  const conditionsByDay = new Map(dayConditions.map((day) => [day.dayNumber, day] as const));

  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
      <div className={css({ display: "flex", gap: "4" })}>
        <div>
          <div className={statLabel}>Total</div>
          <div className={statValue}>{totalNm.toFixed(1)} nm</div>
        </div>
        <div>
          <div className={statLabel}>Underway @ {speedKnots}kt</div>
          <div className={statValue}>{nmToHrMin(totalNm, speedKnots)}</div>
        </div>
        <div>
          <div className={statLabel}>Days</div>
          <div className={statValue}>{plannedDays.length}</div>
        </div>
      </div>

      <ol className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
        {plannedDays.map((day) => {
          const dayNm = day.route?.totalNm ?? 0;
          const conditions = conditionsByDay.get(day.dayNumber);

          return (
            <li
              key={day.dayNumber}
              className={css({
                borderLeftWidth: "2px",
                borderColor: "colorPalette.7",
                paddingLeft: "3",
              })}
            >
              <div className={css({ fontSize: "xs", color: "fg.muted", fontWeight: "semibold" })}>
                Day {day.dayNumber}
                {conditions === undefined ? "" : ` · ${formatDayLabel(conditions.date)}`} ·{" "}
                {dayNm.toFixed(1)} nm · {nmToHrMin(dayNm, speedKnots)}
              </div>
              <div className={css({ fontSize: "xs", color: "fg.subtle" })}>
                depart {formatClock(departureMinutes)}
              </div>

              {conditions?.wind != null ? (
                <div className={css({ marginTop: "1" })}>
                  <WindBadge
                    wind={conditions.wind}
                    courseDegrees={courseFor(day, locationsBySlug)}
                  />
                </div>
              ) : null}

              {(day.route?.legs ?? []).map((leg, i) => (
                <div key={`${leg.from}-${leg.to}-${i}`} className={css({ marginTop: "1" })}>
                  <div className={css({ fontSize: "sm", fontWeight: "medium" })}>
                    {nameOf(locationsBySlug, leg.from)} → {nameOf(locationsBySlug, leg.to)}
                  </div>
                  <div className={css({ fontSize: "sm", color: "fg.muted" })}>
                    {leg.nm.toFixed(1)} nm · {nmToHrMin(leg.nm, speedKnots)}
                    {leg.via.length > 0 ? ` · via ${leg.via.join(", ")}` : ""}
                  </div>
                  <LegObstructions
                    obstructions={obstructionsFor(leg.obstructionIds ?? [])}
                    mastHeightFeet={mastHeightFeet}
                  />
                </div>
              ))}

              <PassTransitList passes={conditions?.passes ?? []} loading={currentsLoading} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
