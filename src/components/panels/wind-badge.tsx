"use client";

import { css } from "styled-system/css";
import {
  compassPoint,
  describeWind,
  displayedBeaufortForce,
  pointOfSail,
  windSeverity,
  type DailyWind,
  type WindSeverity,
} from "@/domain/wind";

interface WindBadgeProps {
  readonly wind: DailyWind;
  /** Course made good for the day, if known — enables the point of sail. */
  readonly courseDegrees?: number;
}

/**
 * Written out one class per severity rather than composed from a colour
 * variable, because Panda extracts styles statically — a colour assembled
 * at runtime produces no CSS at all.
 *
 * The steps track the thresholds a Salish Sea forecast is actually issued
 * against: a small craft advisory at 21 knots, a gale warning at 34.
 */
const SEVERITY_TEXT: Record<WindSeverity, string> = {
  light: css({ color: "fg.muted" }),
  moderate: css({ color: "fg.default" }),
  fresh: css({ color: "amber.11" }),
  strong: css({ color: "amber.11" }),
  gale: css({ color: "red.11" }),
};

const SEVERITY_LABEL: Record<WindSeverity, string> = {
  light: "light",
  moderate: "moderate",
  fresh: "fresh breeze",
  strong: "small craft advisory",
  gale: "gale",
};

const arrowBase = css({ width: "3.5", height: "3.5", flexShrink: 0 });

/**
 * The arrow points the way the wind is *going*, which is how it reads on
 * a weather map — a southwesterly, blowing from 225°, shows an arrow
 * pointing northeast.
 */
function WindArrow({ fromDegrees, className }: { fromDegrees: number; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${arrowBase} ${className}`}
      style={{ transform: `rotate(${fromDegrees + 180}deg)` }}
    >
      <path
        d="M12 2 L12 22 M12 22 L7 16 M12 22 L17 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function WindBadge({ wind, courseDegrees }: WindBadgeProps) {
  const severity = windSeverity(wind);
  const textClass = SEVERITY_TEXT[severity];

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "1.5",
        fontSize: "xs",
        flexWrap: "wrap",
      })}
    >
      <WindArrow fromDegrees={wind.fromDegrees} className={textClass} />
      <span className={`${css({ fontWeight: "semibold" })} ${textClass}`}>
        {describeWind(wind)}
      </span>
      <span className={css({ color: "fg.muted" })}>
        F{displayedBeaufortForce(wind)} · {SEVERITY_LABEL[severity]}
        {courseDegrees === undefined ? "" : ` · ${pointOfSail(courseDegrees, wind)}`}
      </span>
    </div>
  );
}

/** Just the direction and speed, for tight rows. */
export function WindSummary({ wind }: { readonly wind: DailyWind }) {
  return (
    <span className={`${css({ fontSize: "xs" })} ${SEVERITY_TEXT[windSeverity(wind)]}`}>
      {compassPoint(wind.fromDegrees)} {Math.round(wind.speedKnots)}
      {wind.gustKnots > wind.speedKnots ? `–${Math.round(wind.gustKnots)}` : ""} kt
    </span>
  );
}
