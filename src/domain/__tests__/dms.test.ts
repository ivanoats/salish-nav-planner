import { describe, expect, it } from "vitest";
import { parseDms } from "../dms";

describe("parseDms", () => {
  it("parses the Shilshole Bay header coordinate", () => {
    const { lat, lon } = parseDms(
      "47° 40' 39.15\" N, 122° 24' 40.19\" W - NOAA Chart 18446"
    );
    expect(lat).toBeCloseTo(47.6775, 4);
    expect(lon).toBeCloseTo(-122.4112, 4);
  });

  it("handles southern/eastern hemispheres with a negative sign", () => {
    const { lat, lon } = parseDms('12° 0\' 0.00" S, 45° 0\' 0.00" E');
    expect(lat).toBeCloseTo(-12, 4);
    expect(lon).toBeCloseTo(45, 4);
  });

  it("throws on unparseable input", () => {
    expect(() => parseDms("not a coordinate")).toThrow();
  });
});
