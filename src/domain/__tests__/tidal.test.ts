import { describe, expect, it } from "vitest";
import {
  currentAtMs,
  nearestSlack,
  nextSlackAfter,
  signedSpeedOf,
  transitAdviceAt,
  type CurrentEvent,
} from "../tidal";

/** Hours past midnight, kept as a real number — Date.UTC would floor it. */
const at = (hour: number): number => Date.UTC(2026, 7, 15, 0, 0, 0) + hour * 3_600_000;

/** A plain cycle: slack, peak flood, slack, peak ebb, slack. */
const events: CurrentEvent[] = [
  { type: "slack", atMs: at(0), speedKnots: 0 },
  { type: "maxFlood", atMs: at(3), speedKnots: 4 },
  { type: "slack", atMs: at(6), speedKnots: 0 },
  { type: "maxEbb", atMs: at(9), speedKnots: 6 },
  { type: "slack", atMs: at(12), speedKnots: 0 },
];

describe("signedSpeedOf", () => {
  it("makes flood positive and ebb negative", () => {
    expect(signedSpeedOf({ type: "maxFlood", atMs: 0, speedKnots: 4 })).toBe(4);
    expect(signedSpeedOf({ type: "maxEbb", atMs: 0, speedKnots: 6 })).toBe(-6);
    expect(signedSpeedOf({ type: "slack", atMs: 0, speedKnots: 0 })).toBe(0);
  });

  it("treats a magnitude as a magnitude even if the source signed it", () => {
    expect(signedSpeedOf({ type: "maxEbb", atMs: 0, speedKnots: -6 })).toBe(-6);
  });
});

describe("currentAtMs", () => {
  it("returns the published value at a turning point", () => {
    expect(currentAtMs(events, at(3))).toBeCloseTo(4, 5);
    expect(currentAtMs(events, at(9))).toBeCloseTo(-6, 5);
    expect(currentAtMs(events, at(6))).toBeCloseTo(0, 5);
  });

  it("reaches half the peak halfway from slack to max", () => {
    // The half-cosine puts the midpoint of the interval at the midpoint
    // of the two values — the smooth form of the rule of thirds.
    expect(currentAtMs(events, at(1.5))).toBeCloseTo(2, 5);
    expect(currentAtMs(events, at(7.5))).toBeCloseTo(-3, 5);
  });

  it("eases away from slack rather than ramping linearly", () => {
    // One third of the way from slack to peak flood, a linear model says
    // 1.33kt; the cosine says less, which is what the water actually does.
    const oneThird = currentAtMs(events, at(1)) ?? 0;
    expect(oneThird).toBeLessThan(4 / 3);
    expect(oneThird).toBeGreaterThan(0);
  });

  it("returns null outside the predicted window", () => {
    expect(currentAtMs(events, at(-1))).toBeNull();
    expect(currentAtMs(events, at(13))).toBeNull();
  });

  it("does not depend on the events arriving in order", () => {
    const shuffled = [events[3], events[0], events[4], events[2], events[1]] as CurrentEvent[];
    expect(currentAtMs(shuffled, at(1.5))).toBeCloseTo(2, 5);
  });
});

describe("nearestSlack and nextSlackAfter", () => {
  it("finds the closest slack in either direction", () => {
    expect(nearestSlack(events, at(4))?.atMs).toBe(at(6));
    expect(nearestSlack(events, at(2))?.atMs).toBe(at(0));
  });

  it("only looks forward for the slack you would wait for", () => {
    expect(nextSlackAfter(events, at(4))?.atMs).toBe(at(6));
    expect(nextSlackAfter(events, at(7))?.atMs).toBe(at(12));
    expect(nextSlackAfter(events, at(13))).toBeNull();
  });
});

describe("transitAdviceAt", () => {
  // Deception Pass floods east, so a course of 108° runs with the flood.
  const eastbound = { courseDegrees: 108, floodDirectionDegrees: 108, boatSpeedKnots: 6 };
  const westbound = { courseDegrees: 288, floodDirectionDegrees: 108, boatSpeedKnots: 6 };

  it("calls a peak flood fair for a boat going the same way", () => {
    const advice = transitAdviceAt(events, at(3), eastbound);
    expect(advice?.verdict).toBe("fair");
    expect(advice?.setsWithYou).toBe(true);
  });

  it("calls the same peak flood dangerous for a boat going the other way", () => {
    const advice = transitAdviceAt(events, at(3), westbound);
    expect(advice?.setsWithYou).toBe(false);
    expect(advice?.verdict).toBe("dangerous");
  });

  it("reports slack when the water has stopped", () => {
    expect(transitAdviceAt(events, at(6), westbound)?.verdict).toBe("slack");
  });

  it("scales severity to the boat, not to an absolute number", () => {
    // 2kt against: a nuisance at twelve knots, half your speed at four.
    const fast = transitAdviceAt(events, at(1.5), { ...westbound, boatSpeedKnots: 12 });
    const slow = transitAdviceAt(events, at(1.5), { ...westbound, boatSpeedKnots: 4 });
    expect(fast?.verdict).toBe("workable");
    expect(slow?.verdict).toBe("foul");
  });

  it("claims nothing about direction when the flood direction is unknown", () => {
    const advice = transitAdviceAt(events, at(3), {
      courseDegrees: 108,
      floodDirectionDegrees: null,
      boatSpeedKnots: 6,
    });
    expect(advice?.setsWithYou).toBeNull();
    // Without a direction it can't be called fair, only sized.
    expect(advice?.verdict).not.toBe("fair");
  });

  it("says how long to wait for the turn", () => {
    const advice = transitAdviceAt(events, at(4), westbound);
    expect(advice?.nextSlack?.atMs).toBe(at(6));
    expect(advice?.minutesToNextSlack).toBe(120);
  });

  it("returns null when predictions do not cover the arrival", () => {
    expect(transitAdviceAt(events, at(20), westbound)).toBeNull();
  });
});
