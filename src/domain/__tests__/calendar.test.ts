import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  dateForDay,
  daysBetweenIso,
  formatDayLabel,
  isIsoDate,
  isWithinForecastHorizon,
} from "../calendar";
import {
  dayOffsetOf,
  formatClock,
  formatClockWithDay,
  formatInstant,
  localTimeToMs,
  msToMinutesPastMidnight,
  parseClock,
} from "../clock";

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-08-15")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    expect(isIsoDate("2026-8-15")).toBe(false);
    expect(isIsoDate("15/08/2026")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("addDaysIso", () => {
  it("crosses month and year boundaries", () => {
    expect(addDaysIso("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("is unaffected by the daylight saving change", () => {
    // The Sunday the clocks go forward is still one calendar day long.
    expect(addDaysIso("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDaysIso("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDaysIso("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("daysBetweenIso and dateForDay", () => {
  it("counts days between dates", () => {
    expect(daysBetweenIso("2026-08-15", "2026-08-18")).toBe(3);
    expect(daysBetweenIso("2026-08-18", "2026-08-15")).toBe(-3);
  });

  it("starts a trip on its start date", () => {
    expect(dateForDay("2026-08-15", 1)).toBe("2026-08-15");
    expect(dateForDay("2026-08-15", 4)).toBe("2026-08-18");
  });
});

describe("isWithinForecastHorizon", () => {
  it("covers today through the fifteenth day out", () => {
    expect(isWithinForecastHorizon("2026-08-15", "2026-08-15")).toBe(true);
    expect(isWithinForecastHorizon("2026-08-30", "2026-08-15")).toBe(true);
  });

  it("excludes the past and anything past the horizon", () => {
    expect(isWithinForecastHorizon("2026-08-14", "2026-08-15")).toBe(false);
    expect(isWithinForecastHorizon("2026-08-31", "2026-08-15")).toBe(false);
  });
});

describe("formatDayLabel", () => {
  it("names the weekday of the date itself, not of a shifted instant", () => {
    expect(formatDayLabel("2026-08-15")).toBe("Sat 15 Aug");
  });
});

describe("parseClock and formatClock", () => {
  it("round-trips a wall clock time", () => {
    expect(parseClock("08:00")).toBe(480);
    expect(formatClock(480)).toBe("08:00");
    expect(parseClock("23:59")).toBe(1439);
  });

  it("rejects nonsense rather than guessing", () => {
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("08:60")).toBeNull();
    expect(parseClock("eight")).toBeNull();
  });

  it("wraps an arrival that runs past midnight", () => {
    expect(formatClock(1500)).toBe("01:00");
    expect(dayOffsetOf(1500)).toBe(1);
    expect(formatClockWithDay(1500)).toBe("01:00 +1d");
    expect(formatClockWithDay(600)).toBe("10:00");
  });
});

describe("localTimeToMs", () => {
  it("reads a summer morning as Pacific daylight time", () => {
    // 08:00 PDT on 15 Aug 2026 is 15:00 UTC.
    expect(localTimeToMs("2026-08-15", 8 * 60)).toBe(Date.UTC(2026, 7, 15, 15, 0));
  });

  it("reads a winter morning as Pacific standard time", () => {
    // 08:00 PST on 15 Jan 2026 is 16:00 UTC — one hour later than summer.
    expect(localTimeToMs("2026-01-15", 8 * 60)).toBe(Date.UTC(2026, 0, 15, 16, 0));
  });

  it("stays correct across the day the clocks go forward", () => {
    // 2026-03-08 loses an hour at 02:00 local, so 12:00 local is 19:00 UTC.
    expect(localTimeToMs("2026-03-08", 12 * 60)).toBe(Date.UTC(2026, 2, 8, 19, 0));
    // The day before is still standard time: 12:00 local is 20:00 UTC.
    expect(localTimeToMs("2026-03-07", 12 * 60)).toBe(Date.UTC(2026, 2, 7, 20, 0));
  });

  it("handles minutes past the end of the day", () => {
    expect(localTimeToMs("2026-08-15", 26 * 60)).toBe(localTimeToMs("2026-08-16", 2 * 60));
  });

  it("inverts back to minutes past midnight", () => {
    const instant = localTimeToMs("2026-08-15", 9 * 60 + 30);
    expect(msToMinutesPastMidnight(instant, "2026-08-15")).toBe(570);
  });
});

describe("formatInstant", () => {
  it("shows an instant in the cruising ground's own time", () => {
    expect(formatInstant(Date.UTC(2026, 7, 15, 16, 27))).toBe("09:27");
  });
});
