import { describe, expect, it } from "vitest";
import {
  beaufortForce,
  compassPoint,
  describeWind,
  discomfortFactor,
  effectiveWindKnots,
  pointOfSail,
  windPenaltyNm,
  windSeverity,
  type Wind,
} from "../wind";

const wind = (speedKnots: number, fromDegrees: number, gustKnots = speedKnots): Wind => ({
  speedKnots,
  gustKnots,
  fromDegrees,
});

describe("compassPoint", () => {
  it("names the 16 points", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(225)).toBe("SW");
    expect(compassPoint(247.5)).toBe("WSW");
  });

  it("wraps past a full circle and handles negatives", () => {
    expect(compassPoint(360)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
  });
});

describe("beaufortForce", () => {
  it("maps knots to the conventional scale", () => {
    expect(beaufortForce(0)).toBe(0);
    expect(beaufortForce(12)).toBe(4);
    expect(beaufortForce(22)).toBe(6);
    expect(beaufortForce(35)).toBe(8);
    expect(beaufortForce(90)).toBe(12);
  });
});

describe("windSeverity", () => {
  it("steps at the thresholds a marine forecast is issued against", () => {
    expect(windSeverity(wind(5, 180))).toBe("light");
    expect(windSeverity(wind(10, 180))).toBe("moderate");
    expect(windSeverity(wind(17, 180))).toBe("fresh");
    expect(windSeverity(wind(24, 180))).toBe("strong");
    expect(windSeverity(wind(38, 180))).toBe("gale");
  });

  it("lets gusts push a day up a step", () => {
    // 16kt sustained is only "fresh", but gusting 30 is a different day.
    expect(windSeverity(wind(16, 180, 30))).toBe("strong");
  });

  it("agrees with the numbers printed next to it", () => {
    // Both of these print as "8–11 kt"; they must not be labelled
    // differently just because the raw model output straddles a boundary.
    expect(windSeverity(wind(7.6, 180, 11.4))).toBe(windSeverity(wind(8.4, 180, 10.6)));
  });
});

describe("effectiveWindKnots", () => {
  it("weighs gusts, but less than the sustained wind they punctuate", () => {
    expect(effectiveWindKnots(wind(20, 180, 20))).toBe(20);
    expect(effectiveWindKnots(wind(20, 180, 40))).toBe(30);
  });
});

describe("pointOfSail", () => {
  // Wind from 225 (southwesterly).
  const sw = wind(20, 225);

  it("calls a course into the wind a beat", () => {
    expect(pointOfSail(225, sw)).toBe("beat");
    expect(pointOfSail(200, sw)).toBe("beat");
  });

  it("calls a course across the wind a beam reach", () => {
    expect(pointOfSail(135, sw)).toBe("beam reach");
  });

  it("calls a course away from the wind a run", () => {
    expect(pointOfSail(45, sw)).toBe("run");
  });

  it("is symmetric about the wind", () => {
    expect(pointOfSail(285, sw)).toBe(pointOfSail(165, sw));
  });
});

describe("discomfortFactor", () => {
  it("is zero in a pleasant breeze whatever the heading", () => {
    expect(discomfortFactor(wind(8, 225), 225)).toBe(0);
  });

  it("costs more upwind than downwind in the same blow", () => {
    const gale = wind(35, 225);
    expect(discomfortFactor(gale, 225)).toBeGreaterThan(discomfortFactor(gale, 45) * 2);
  });

  it("rises with strength and saturates", () => {
    expect(discomfortFactor(wind(20, 225), 225)).toBeLessThan(
      discomfortFactor(wind(28, 225), 225)
    );
    expect(discomfortFactor(wind(50, 225), 225)).toBe(1);
  });
});

describe("windPenaltyNm", () => {
  it("scales with the length of the day, since exposure is time spent out", () => {
    const gale = wind(35, 225);
    expect(windPenaltyNm(gale, 225, 40)).toBeCloseTo(windPenaltyNm(gale, 225, 20) * 2, 5);
  });

  it("adds nothing at all in light air", () => {
    expect(windPenaltyNm(wind(6, 225), 225, 40)).toBe(0);
  });

  it("stays below the leg distance so it can never dominate outright", () => {
    expect(windPenaltyNm(wind(60, 225), 225, 30)).toBeLessThanOrEqual(30);
  });
});

describe("describeWind", () => {
  it("reads as a forecast would", () => {
    expect(describeWind(wind(18, 225, 26))).toBe("SW 18–26 kt");
  });

  it("drops the gust when there isn't one", () => {
    expect(describeWind(wind(12, 90, 12))).toBe("E 12 kt");
  });
});
