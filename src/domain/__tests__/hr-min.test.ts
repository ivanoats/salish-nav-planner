import { describe, expect, it } from "vitest";
import { hrMinToMinutes, minutesToHrMin, nmToHrMin } from "../hr-min";

describe("hrMinToMinutes / minutesToHrMin", () => {
  it("round-trips", () => {
    expect(hrMinToMinutes("8:34")).toBe(514);
    expect(minutesToHrMin(514)).toBe("8:34");
  });

  it("pads single-digit minutes", () => {
    expect(minutesToHrMin(61)).toBe("1:01");
  });
});

describe("nmToHrMin", () => {
  it("matches nwcruising.net's own Shilshole -> Friday Harbor table (60.0nm @ 7.0kt = 8:34)", () => {
    expect(nmToHrMin(60.0, 7.0)).toBe("8:34");
  });
});
