import { angleBetweenDegrees } from "./geo";

export type CurrentEventType = "slack" | "maxFlood" | "maxEbb";

/**
 * One turning point in a pass's predicted current: the water stopping,
 * or running as hard as it will this cycle. Both agencies publish this
 * same shape of data, which is why it's the interchange format here.
 */
export interface CurrentEvent {
  readonly type: CurrentEventType;
  /** Epoch milliseconds. */
  readonly atMs: number;
  /** Magnitude in knots — always positive, zero at slack. */
  readonly speedKnots: number;
}

/** Flood positive, ebb negative, slack zero. */
export const signedSpeedOf = ({ type, speedKnots }: CurrentEvent): number => {
  if (type === "slack") return 0;
  return type === "maxFlood" ? Math.abs(speedKnots) : -Math.abs(speedKnots);
};

/** Under this the water is doing nothing worth planning around. */
export const SLACK_KNOTS = 0.5;

/**
 * Predicted current at an arbitrary instant, signed (+flood / −ebb), or
 * null outside the range the events cover.
 *
 * Between two turning points the flow follows a half-cosine — the smooth
 * form behind the "rule of thirds" every cruising guide prints, but
 * evaluated properly instead of in three coarse steps. It reads a real
 * value between the published extremes rather than making the sailor
 * eyeball where they fall between two table rows.
 */
export const currentAtMs = (
  events: readonly CurrentEvent[],
  atMs: number
): number | null => {
  const ordered = [...events].sort((a, b) => a.atMs - b.atMs);

  for (let i = 0; i < ordered.length - 1; i++) {
    const start = ordered[i];
    const end = ordered[i + 1];
    if (start === undefined || end === undefined) continue;
    if (atMs < start.atMs || atMs > end.atMs) continue;

    const span = end.atMs - start.atMs;
    if (span === 0) return signedSpeedOf(start);

    const from = signedSpeedOf(start);
    const to = signedSpeedOf(end);
    const phase = (atMs - start.atMs) / span;
    return (from + to) / 2 + ((from - to) / 2) * Math.cos(Math.PI * phase);
  }

  return null;
};

/** The slack nearest an instant, in either direction. */
export const nearestSlack = (
  events: readonly CurrentEvent[],
  atMs: number
): CurrentEvent | null => {
  let best: CurrentEvent | null = null;
  for (const event of events) {
    if (event.type !== "slack") continue;
    if (best === null || Math.abs(event.atMs - atMs) < Math.abs(best.atMs - atMs)) {
      best = event;
    }
  }
  return best;
};

/** The next slack at or after an instant — the one you'd wait for. */
export const nextSlackAfter = (
  events: readonly CurrentEvent[],
  atMs: number
): CurrentEvent | null => {
  let best: CurrentEvent | null = null;
  for (const event of events) {
    if (event.type !== "slack" || event.atMs < atMs) continue;
    if (best === null || event.atMs < best.atMs) best = event;
  }
  return best;
};

export type TransitVerdict = "slack" | "fair" | "workable" | "foul" | "dangerous";

export interface TransitAdvice {
  /** Predicted current at the ETA, signed (+flood / −ebb). */
  readonly signedKnots: number;
  readonly verdict: TransitVerdict;
  /**
   * Whether the current carries you through or holds you back. Null when
   * the pass has no recorded flood direction, in which case the verdict
   * rests on magnitude alone and claims nothing about which way it sets.
   */
  readonly setsWithYou: boolean | null;
  readonly nearestSlack: CurrentEvent | null;
  readonly nextSlack: CurrentEvent | null;
  /** Minutes to wait for the next slack; null when none is predicted. */
  readonly minutesToNextSlack: number | null;
}

export interface TransitQuery {
  /** Course through the pass, degrees true. */
  readonly courseDegrees: number;
  readonly floodDirectionDegrees: number | null;
  readonly boatSpeedKnots: number;
}

/**
 * Whether the water is going your way. A flood sets toward the pass's
 * flood direction and an ebb the opposite way, so the sign of the
 * current picks which, and anything inside a right angle of the course
 * counts as helping.
 */
const setsWithCourse = (
  signedKnots: number,
  courseDegrees: number,
  floodDirectionDegrees: number | null
): boolean | null => {
  if (floodDirectionDegrees === null) return null;
  if (Math.abs(signedKnots) < SLACK_KNOTS) return null;
  const setsToward =
    signedKnots > 0 ? floodDirectionDegrees : (floodDirectionDegrees + 180) % 360;
  return angleBetweenDegrees(courseDegrees, setsToward) < 90;
};

/**
 * Thresholds scale with boat speed because that's what makes a current
 * matter: three knots against is a nuisance at eight knots and a wall at
 * five. The absolute floor stops a fast boat from being told a six-knot
 * pass is fine.
 */
const verdictFor = (
  signedKnots: number,
  setsWithYou: boolean | null,
  boatSpeedKnots: number
): TransitVerdict => {
  const magnitude = Math.abs(signedKnots);
  if (magnitude < SLACK_KNOTS) return "slack";
  if (setsWithYou === true) return "fair";

  if (magnitude >= Math.min(4, boatSpeedKnots * 0.7)) return "dangerous";
  if (magnitude >= boatSpeedKnots * 0.35) return "foul";
  return "workable";
};

/**
 * What you'd meet arriving at a pass at a given moment, and when the
 * water next stops. This is the whole point of the tidal panel: a pass
 * isn't a distance problem, it's an appointment.
 */
export const transitAdviceAt = (
  events: readonly CurrentEvent[],
  atMs: number,
  { courseDegrees, floodDirectionDegrees, boatSpeedKnots }: TransitQuery
): TransitAdvice | null => {
  const signedKnots = currentAtMs(events, atMs);
  if (signedKnots === null) return null;

  const setsWithYou = setsWithCourse(signedKnots, courseDegrees, floodDirectionDegrees);
  const upcoming = nextSlackAfter(events, atMs);

  return {
    signedKnots,
    verdict: verdictFor(signedKnots, setsWithYou, boatSpeedKnots),
    setsWithYou,
    nearestSlack: nearestSlack(events, atMs),
    nextSlack: upcoming,
    minutesToNextSlack:
      upcoming === null ? null : Math.round((upcoming.atMs - atMs) / 60_000),
  };
};

/** Whether a verdict is worth interrupting the plan over. */
export const isTransitConcerning = (verdict: TransitVerdict): boolean =>
  verdict === "foul" || verdict === "dangerous";
