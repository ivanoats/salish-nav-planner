"use client";

import { css } from "styled-system/css";
import { formatClock, parseClock } from "@/domain/clock";
import { isIsoDate, type IsoDate } from "@/domain/calendar";
import {
  AIR_DRAFT_MARGIN_FEET,
  airDraftFor,
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
import type { FetchStatus } from "@/components/use-conditions";

interface TripControlsProps {
  readonly days: number;
  readonly minHours: number;
  readonly maxHours: number;
  /** Derived from the hour window and speed; shown, not edited. */
  readonly minNm: number;
  readonly maxNm: number;
  readonly speedKnots: number;
  readonly roundTrip: boolean;
  readonly startDate: IsoDate;
  readonly departureMinutes: number;
  readonly mastHeightFeet: number;
  readonly windAware: boolean;
  readonly hasWind: boolean;
  readonly windStatus: FetchStatus;
  readonly onDaysChange: (days: number) => void;
  readonly onMinHoursChange: (hours: number) => void;
  readonly onMaxHoursChange: (hours: number) => void;
  readonly onSpeedChange: (knots: number) => void;
  readonly onRoundTripChange: (roundTrip: boolean) => void;
  readonly onStartDateChange: (date: IsoDate) => void;
  readonly onDepartureChange: (minutes: number) => void;
  readonly onMastHeightChange: (feet: number) => void;
  readonly onWindAwareChange: (windAware: boolean) => void;
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

const checkboxRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "sm",
  cursor: "pointer",
});

/** What the wind toggle can honestly claim at the moment. */
const windStatusNote = (
  windAware: boolean,
  hasWind: boolean,
  status: FetchStatus
): string | null => {
  if (status === "loading") return "Fetching forecast…";
  if (status === "error") return "Forecast unavailable — planning on distance alone.";
  if (!hasWind) return "No forecast for these dates — planning on distance alone.";
  if (!windAware) return "Forecast shown, but not used to pick stops.";
  return null;
};

export function TripControls({
  days,
  minHours,
  maxHours,
  minNm,
  maxNm,
  speedKnots,
  roundTrip,
  startDate,
  departureMinutes,
  mastHeightFeet,
  windAware,
  hasWind,
  windStatus,
  onDaysChange,
  onMinHoursChange,
  onMaxHoursChange,
  onSpeedChange,
  onRoundTripChange,
  onStartDateChange,
  onDepartureChange,
  onMastHeightChange,
  onWindAwareChange,
}: TripControlsProps) {
  const note = windStatusNote(windAware, hasWind, windStatus);

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
        <div className={css({ flex: "2", display: "flex", flexDirection: "column", gap: "1.5" })}>
          <label htmlFor="start-date" className={fieldLabel}>
            Start date
          </label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => {
              // An empty or half-typed date would otherwise be handed
              // straight to the forecast request as a 400.
              if (isIsoDate(e.target.value)) onStartDateChange(e.target.value);
            }}
            className={numberInput}
          />
        </div>
        <div className={css({ flex: "1", display: "flex", flexDirection: "column", gap: "1.5" })}>
          <label htmlFor="departure" className={fieldLabel}>
            Depart
          </label>
          <input
            id="departure"
            type="time"
            value={formatClock(departureMinutes)}
            onChange={(e) => {
              const minutes = parseClock(e.target.value);
              if (minutes !== null) onDepartureChange(minutes);
            }}
            className={numberInput}
          />
        </div>
        <div className={css({ flex: "1", display: "flex", flexDirection: "column", gap: "1.5" })}>
          <label htmlFor="mast-height" className={fieldLabel}>
            Mast (ft)
          </label>
          <input
            id="mast-height"
            type="number"
            min={MIN_MAST_HEIGHT_FEET}
            max={MAX_MAST_HEIGHT_FEET}
            step={1}
            value={mastHeightFeet}
            onChange={(e) => onMastHeightChange(Number(e.target.value))}
            className={numberInput}
          />
        </div>
      </div>

      <p className={css({ fontSize: "xs", color: "fg.muted" })}>
        Mast height above the water. With {AIR_DRAFT_MARGIN_FEET} ft added for masthead gear
        that needs {airDraftFor(mastHeightFeet)} ft of clearance, so routes under lower fixed
        spans are dropped. Opening bridges are flagged, not avoided.
      </p>

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

      <label className={checkboxRow}>
        <input
          type="checkbox"
          checked={roundTrip}
          onChange={(e) => onRoundTripChange(e.target.checked)}
          className={css({ cursor: "pointer" })}
        />
        Round trip — end back at the start
      </label>

      <div className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
        <label className={checkboxRow}>
          <input
            type="checkbox"
            checked={windAware}
            disabled={!hasWind}
            onChange={(e) => onWindAwareChange(e.target.checked)}
            className={css({ cursor: "pointer" })}
          />
          Let the forecast shape the plan
        </label>
        {note === null ? (
          <p className={css({ fontSize: "xs", color: "fg.muted", paddingLeft: "6" })}>
            Days that mean a long beat into a blow lose out to shorter or more sheltered ones.
          </p>
        ) : (
          <p className={css({ fontSize: "xs", color: "fg.muted", paddingLeft: "6" })}>{note}</p>
        )}
      </div>
    </div>
  );
}
