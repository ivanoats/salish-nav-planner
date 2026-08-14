"use client";

import { css } from "styled-system/css";
import { LocationPicker } from "./location-picker";
import { nmToHrMin } from "@/domain/hr-min";
import type { Location } from "@/domain/location";
import type { TripDay } from "@/domain/trip";

interface DayItineraryProps {
  readonly tripDays: readonly TripDay[];
  readonly locations: readonly Location[];
  readonly locationsBySlug: ReadonlyMap<string, Location>;
  readonly minNm: number;
  readonly maxNm: number;
  readonly speedKnots: number;
  readonly onPin: (dayNumber: number, slug: string) => void;
  readonly onClearPin: (dayNumber: number) => void;
  readonly onCycle: (dayNumber: number) => void;
  readonly isPinned: (dayNumber: number) => boolean;
}

const nameOf = (locationsBySlug: ReadonlyMap<string, Location>, slug: string) =>
  locationsBySlug.get(slug)?.name ?? slug;

const smallButton = css({
  fontSize: "xs",
  paddingX: "2",
  height: "6",
  borderRadius: "sm",
  borderWidth: "1px",
  borderColor: "border.default",
  backgroundColor: "bg.default",
  cursor: "pointer",
  _hover: { backgroundColor: "colorPalette.3" },
});

export function DayItinerary({
  tripDays,
  locations,
  locationsBySlug,
  minNm,
  maxNm,
  speedKnots,
  onPin,
  onClearPin,
  onCycle,
  isPinned,
}: DayItineraryProps) {
  // Day 1's destination is chosen in the main picker above, so this
  // panel only covers the auto-planned tail of the trip.
  const laterDays = tripDays.filter((day) => day.dayNumber > 1);
  if (laterDays.length === 0) return null;

  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
      {laterDays.map((day) => {
        const nm = day.route?.totalNm ?? null;
        const outOfRange = nm !== null && (nm < minNm || nm > maxNm);

        return (
          <div
            key={day.dayNumber}
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "1.5",
              borderTopWidth: "1px",
              borderColor: "border.default",
              paddingTop: "3",
            })}
          >
            <div
              className={css({
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "2",
              })}
            >
              <span className={css({ fontSize: "sm", fontWeight: "semibold" })}>
                Day {day.dayNumber}
              </span>
              <span className={css({ fontSize: "xs", color: "fg.muted" })}>
                from {nameOf(locationsBySlug, day.fromSlug)}
              </span>
            </div>

            {day.toSlug === null ? (
              <p className={css({ fontSize: "sm", color: "fg.muted" })}>
                Nothing within {minNm.toFixed(0)}–{maxNm.toFixed(0)} nm from here. Widen the
                day length, sail faster, or pin a stop:
              </p>
            ) : (
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "2",
                })}
              >
                <div>
                  <div className={css({ fontSize: "sm", fontWeight: "medium" })}>
                    {nameOf(locationsBySlug, day.toSlug)}
                  </div>
                  <div
                    className={css({
                      fontSize: "xs",
                      color: outOfRange ? "red.11" : "fg.muted",
                    })}
                  >
                    {nm !== null
                      ? `${nm.toFixed(1)} nm · ${nmToHrMin(nm, speedKnots)}`
                      : "no route"}
                    {outOfRange ? " · outside day range" : ""}
                    {day.source === "endpoint" ? " · trip ends here" : ""}
                    {isPinned(day.dayNumber) ? " · pinned" : ""}
                  </div>
                </div>
                {day.source === "endpoint" ? null : (
                  <div className={css({ display: "flex", gap: "1", flexShrink: 0 })}>
                    <button
                      type="button"
                      className={smallButton}
                      onClick={() => onCycle(day.dayNumber)}
                      title="Try the next-best stop for this day"
                    >
                      Next
                    </button>
                    {isPinned(day.dayNumber) ? (
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() => onClearPin(day.dayNumber)}
                        title="Go back to an auto-picked stop"
                      >
                        Auto
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {day.source === "endpoint" ? null : (
              <LocationPicker
                label={`Pin a different Day ${day.dayNumber} stop`}
                locations={locations}
                value={isPinned(day.dayNumber) ? day.toSlug : null}
                onChange={(slug) =>
                  slug === null ? onClearPin(day.dayNumber) : onPin(day.dayNumber, slug)
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
