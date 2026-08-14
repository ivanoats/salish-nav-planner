"use client";

import { css } from "styled-system/css";
import {
  MAX_DAY_HOURS,
  MAX_SPEED_KNOTS,
  MAX_TRIP_DAYS,
  MIN_DAY_HOURS,
  MIN_SPEED_KNOTS,
  MIN_TRIP_DAYS,
} from "@/domain/trip";

interface TripControlsProps {
  readonly days: number;
  readonly minHours: number;
  readonly maxHours: number;
  /** Derived from the hour window and speed; shown, not edited. */
  readonly minNm: number;
  readonly maxNm: number;
  readonly speedKnots: number;
  readonly roundTrip: boolean;
  readonly onDaysChange: (days: number) => void;
  readonly onMinHoursChange: (hours: number) => void;
  readonly onMaxHoursChange: (hours: number) => void;
  readonly onSpeedChange: (knots: number) => void;
  readonly onRoundTripChange: (roundTrip: boolean) => void;
}

const fieldLabel = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "fg.muted",
});

const numberInput = css({
  width: "full",
  height: "9",
  paddingX: "2",
  fontSize: "sm",
  borderWidth: "1px",
  borderColor: "border.default",
  borderRadius: "md",
  backgroundColor: "bg.default",
  _focusVisible: { outline: "2px solid", outlineColor: "colorPalette.9", outlineOffset: "-1px" },
});

export function TripControls({
  days,
  minHours,
  maxHours,
  minNm,
  maxNm,
  speedKnots,
  roundTrip,
  onDaysChange,
  onMinHoursChange,
  onMaxHoursChange,
  onSpeedChange,
  onRoundTripChange,
}: TripControlsProps) {
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
      <div className={css({ display: "flex", flexDirection: "column", gap: "1.5" })}>
        <label htmlFor="trip-days" className={fieldLabel}>
          Days
        </label>
        <div className={css({ display: "flex", gap: "1" })}>
          {Array.from({ length: MAX_TRIP_DAYS - MIN_TRIP_DAYS + 1 }, (_, i) => i + MIN_TRIP_DAYS).map(
            (value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === days}
                onClick={() => onDaysChange(value)}
                className={css({
                  flex: "1",
                  height: "9",
                  fontSize: "sm",
                  fontWeight: "medium",
                  borderWidth: "1px",
                  borderRadius: "md",
                  cursor: "pointer",
                  transition: "background-color 0.15s, color 0.15s",
                  borderColor: value === days ? "colorPalette.9" : "border.default",
                  backgroundColor: value === days ? "colorPalette.9" : "bg.default",
                  color: value === days ? "colorPalette.contrast" : "fg.default",
                  _hover: { backgroundColor: value === days ? "colorPalette.10" : "colorPalette.3" },
                })}
              >
                {value}
              </button>
            )
          )}
        </div>
      </div>

      <div className={css({ display: "flex", gap: "3" })}>
        <div className={css({ flex: "1", display: "flex", flexDirection: "column", gap: "1.5" })}>
          <label htmlFor="min-hours" className={fieldLabel}>
            Min / day (hrs)
          </label>
          <input
            id="min-hours"
            type="number"
            min={MIN_DAY_HOURS}
            max={maxHours}
            step={0.5}
            value={minHours}
            onChange={(e) => onMinHoursChange(Number(e.target.value))}
            className={numberInput}
          />
        </div>
        <div className={css({ flex: "1", display: "flex", flexDirection: "column", gap: "1.5" })}>
          <label htmlFor="max-hours" className={fieldLabel}>
            Max / day (hrs)
          </label>
          <input
            id="max-hours"
            type="number"
            min={minHours}
            max={MAX_DAY_HOURS}
            step={0.5}
            value={maxHours}
            onChange={(e) => onMaxHoursChange(Number(e.target.value))}
            className={numberInput}
          />
        </div>
        <div className={css({ flex: "1", display: "flex", flexDirection: "column", gap: "1.5" })}>
          <label htmlFor="speed-kt" className={fieldLabel}>
            Speed (kt)
          </label>
          <input
            id="speed-kt"
            type="number"
            min={MIN_SPEED_KNOTS}
            max={MAX_SPEED_KNOTS}
            step={0.5}
            value={speedKnots}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className={numberInput}
          />
        </div>
      </div>

      <p className={css({ fontSize: "xs", color: "fg.muted" })}>
        {minHours}–{maxHours} hrs at {speedKnots} kt reaches {minNm.toFixed(0)}–
        {maxNm.toFixed(0)} nm per day.
      </p>

      <label
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          fontSize: "sm",
          cursor: "pointer",
        })}
      >
        <input
          type="checkbox"
          checked={roundTrip}
          onChange={(e) => onRoundTripChange(e.target.checked)}
          className={css({ cursor: "pointer" })}
        />
        Round trip — end back at the start
      </label>
    </div>
  );
}
