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

  it("throws when minutes or seconds are out of range", () => {
    expect(() =>
      parseDms('47° 40\' 39.15" N, 123° 122\' 33.85" W')
    ).toThrow(/minutes and seconds must be under 60/);
    expect(() =>
      parseDms('47° 40\' 90.00" N, 123° 22\' 33.85" W')
    ).toThrow(/minutes and seconds must be under 60/);
  });
});

describe("malformed source headers", () => {
  it("rejects minutes of 60 or more rather than rolling them into degrees", () => {
    // nwcruising.net's Wollochet Bay page reads 123° 122' 33.85" W.
    // Silently accepting it moved the harbour ~100nm into the Pacific.
    expect(() => parseDms('47° 17\' 20.38" N, 123° 122\' 33.85" W')).toThrow(/under 60/);
  });

  it("rejects seconds of 60 or more", () => {
    expect(() => parseDms('47° 17\' 90.00" N, 122° 33\' 33.85" W')).toThrow(/under 60/);
  });

  it("still accepts a well-formed header", () => {
    const parsed = parseDms('47° 40\' 39.15" N, 122° 24\' 40.19" W');
    expect(parsed.lat).toBeCloseTo(47.6775, 4);
    expect(parsed.lon).toBeCloseTo(-122.4112, 4);
  });
});
