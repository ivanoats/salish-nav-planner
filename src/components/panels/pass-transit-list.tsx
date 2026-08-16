"use client";

import { css } from "styled-system/css";
import { formatClockWithDay, formatInstant } from "@/domain/clock";
import { type TransitVerdict } from "@/domain/tidal";
import type { PassTransitConditions } from "@/application/day-conditions";

interface PassTransitListProps {
  readonly passes: readonly PassTransitConditions[];
  readonly loading: boolean;
}

const VERDICT_TEXT: Record<TransitVerdict, string> = {
  slack: css({ color: "colorPalette.11" }),
  fair: css({ color: "colorPalette.11" }),
  workable: css({ color: "fg.muted" }),
  foul: css({ color: "amber.11" }),
  dangerous: css({ color: "red.11" }),
};

const VERDICT_LABEL: Record<TransitVerdict, string> = {
  slack: "at slack",
  fair: "fair current",
  workable: "workable",
  foul: "foul current",
  dangerous: "too strong",
};

/** How many minutes off slack still counts as "near enough". */
const NEAR_SLACK_MINUTES = 30;

const formatWait = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

/**
 * The passes on a day's route, each with what the water will be doing
 * when the boat gets there.
 *
 * A pass is an appointment rather than a distance, so the row leads with
 * the ETA and the current at that moment, then says when the next slack
 * is — which is the actual decision: press on, or wait for the turn.
 */
export function PassTransitList({ passes, loading }: PassTransitListProps) {
  if (passes.length === 0) return null;

  return (
    <ul className={css({ display: "flex", flexDirection: "column", gap: "1.5", marginTop: "1.5" })}>
      {passes.map(({ transit, advice }) => {
        const { pass } = transit;
        const eta = formatClockWithDay(transit.etaMinutes);

        return (
          <li
            key={pass.id}
            className={css({
              fontSize: "xs",
              borderLeftWidth: "2px",
              borderColor: advice === null ? "border.default" : "colorPalette.6",
              paddingLeft: "2",
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
              <span className={css({ fontWeight: "medium" })}>
                {pass.name}
                {transit.detection === "nearby" ? (
                  <span className={css({ color: "fg.muted", fontWeight: "normal" })}> (nearby)</span>
                ) : null}
              </span>
              <span className={css({ color: "fg.muted", flexShrink: 0 })}>ETA {eta}</span>
            </div>

            {advice === null ? (
              <div className={css({ color: "fg.muted" })}>
                {loading ? "loading currents…" : "no current prediction for this time"}
              </div>
            ) : (
              <div className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}>
                <span className={VERDICT_TEXT[advice.verdict]}>
                  {advice.signedKnots === 0
                    ? "slack"
                    : `${Math.abs(advice.signedKnots).toFixed(1)} kt ${advice.signedKnots > 0 ? "flood" : "ebb"}`}{" "}
                  · {VERDICT_LABEL[advice.verdict]}
                  {advice.setsWithYou === false && advice.verdict !== "dangerous"
                    ? " against you"
                    : ""}
                </span>
                {advice.nextSlack !== null && advice.minutesToNextSlack !== null ? (
                  <span className={css({ color: "fg.muted" })}>
                    · slack {formatInstant(advice.nextSlack.atMs)}
                    {advice.minutesToNextSlack > NEAR_SLACK_MINUTES &&
                    (advice.verdict === "foul" || advice.verdict === "dangerous")
                      ? ` — wait ${formatWait(advice.minutesToNextSlack)}`
                      : ""}
                  </span>
                ) : null}
              </div>
            )}

            {pass.maxKnots !== null ? (
              <div className={css({ color: "fg.subtle" })}>
                {pass.stationName} · runs to {pass.maxKnots} kt
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
