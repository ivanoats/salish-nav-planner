import { css } from "styled-system/css";
import { nmToHrMin } from "@/domain/hr-min";
import type { Location } from "@/domain/location";
import type { TripDay } from "@/domain/trip";

interface RouteSummaryPanelProps {
  readonly tripDays: readonly TripDay[];
  readonly totalNm: number;
  readonly speedKnots: number;
  readonly locationsBySlug: ReadonlyMap<string, Location>;
}

const nameOf = (locationsBySlug: ReadonlyMap<string, Location>, slug: string) =>
  locationsBySlug.get(slug)?.name ?? slug;

const statLabel = css({ fontSize: "xs", color: "fg.muted" });
const statValue = css({ fontSize: "xl", fontWeight: "semibold" });

export function RouteSummaryPanel({
  tripDays,
  totalNm,
  speedKnots,
  locationsBySlug,
}: RouteSummaryPanelProps) {
  const plannedDays = tripDays.filter((day) => day.route !== null);
  if (plannedDays.length === 0) return null;

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
                Day {day.dayNumber} · {dayNm.toFixed(1)} nm · {nmToHrMin(dayNm, speedKnots)}
              </div>
              {(day.route?.legs ?? []).map((leg, i) => (
                <div key={`${leg.from}-${leg.to}-${i}`} className={css({ marginTop: "1" })}>
                  <div className={css({ fontSize: "sm", fontWeight: "medium" })}>
                    {nameOf(locationsBySlug, leg.from)} → {nameOf(locationsBySlug, leg.to)}
                  </div>
                  <div className={css({ fontSize: "sm", color: "fg.muted" })}>
                    {leg.nm.toFixed(1)} nm · {nmToHrMin(leg.nm, speedKnots)}
                    {leg.via.length > 0 ? ` · via ${leg.via.join(", ")}` : ""}
                  </div>
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
