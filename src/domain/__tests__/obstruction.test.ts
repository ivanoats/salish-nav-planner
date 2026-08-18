import { describe, expect, it } from "vitest";
import {
  AIR_DRAFT_MARGIN_FEET,
  airDraftFor,
  blocksPassage,
  clampMastHeight,
  clearanceVerdict,
  clearsUnder,
  MAX_MAST_HEIGHT_FEET,
  MIN_MAST_HEIGHT_FEET,
  type Obstruction,
} from "../obstruction";

/** The Port Townsend Canal: 58ft, fixed, and the reason this exists. */
const canal: Obstruction = {
  id: "port-townsend-canal",
  name: "Port Townsend Canal Bridge",
  lat: 48.0325,
  lon: -122.7326,
  clearanceFeet: 58,
  opens: false,
};

/** The Hood Canal Bridge: lower, but it opens on request. */
const hoodCanal: Obstruction = { ...canal, id: "hood-canal", clearanceFeet: 35, opens: true };

describe("clampMastHeight", () => {
  it("keeps a sensible height as given", () => {
    expect(clampMastHeight(50)).toBe(50);
  });

  it("clamps to the allowed range", () => {
    expect(clampMastHeight(-10)).toBe(MIN_MAST_HEIGHT_FEET);
    expect(clampMastHeight(9999)).toBe(MAX_MAST_HEIGHT_FEET);
  });

  it("falls back to the minimum for a value that isn't a number", () => {
    // An emptied number input reads as NaN, and NaN would otherwise
    // propagate through every clearance comparison as a silent false.
    expect(clampMastHeight(Number.NaN)).toBe(MIN_MAST_HEIGHT_FEET);
    expect(clampMastHeight(Number.POSITIVE_INFINITY)).toBe(MIN_MAST_HEIGHT_FEET);
  });
});

describe("airDraftFor", () => {
  it("adds the margin for masthead gear", () => {
    expect(airDraftFor(50)).toBe(50 + AIR_DRAFT_MARGIN_FEET);
  });
});

describe("clearsUnder", () => {
  it("fits a short rig under a fixed span", () => {
    expect(clearsUnder(canal, 40)).toBe(true);
  });

  it("does not fit a tall one", () => {
    expect(clearsUnder(canal, 60)).toBe(false);
  });

  it("turns back a rig at exactly the stated clearance", () => {
    // The point of the margin: a published clearance is a nominal figure,
    // not a survey, so a 58ft rig under a 58ft span is not a fit. Pinned
    // separately from the boundary below, which is margin-agnostic and so
    // would go on passing if the margin were ever zeroed out.
    expect(AIR_DRAFT_MARGIN_FEET).toBeGreaterThan(0);
    expect(clearsUnder(canal, canal.clearanceFeet)).toBe(false);
  });

  it("counts the margin, not just the mast", () => {
    // The tallest rig that reaches the clearance exactly, once the margin
    // is counted, still fits; a foot more does not. Derived rather than
    // written out, so retuning the margin doesn't read as a regression.
    const exactFit = canal.clearanceFeet - AIR_DRAFT_MARGIN_FEET;
    expect(clearsUnder(canal, exactFit)).toBe(true);
    expect(clearsUnder(canal, exactFit + 1)).toBe(false);
  });
});

describe("blocksPassage", () => {
  it("blocks a tall rig at a fixed span", () => {
    expect(blocksPassage(canal, 60)).toBe(true);
  });

  it("never blocks at an opening span, however tall", () => {
    expect(blocksPassage(hoodCanal, 90)).toBe(false);
  });

  it("does not block anyone who fits", () => {
    expect(blocksPassage(canal, 40)).toBe(false);
  });
});

describe("clearanceVerdict", () => {
  it("distinguishes fitting, waiting, and turning back", () => {
    expect(clearanceVerdict(canal, 40)).toBe("clears");
    expect(clearanceVerdict(canal, 60)).toBe("blocked");
    expect(clearanceVerdict(hoodCanal, 60)).toBe("opens");
  });

  it("prefers 'clears' over 'opens' when the rig simply fits", () => {
    // No point telling someone to call for an opening they don't need.
    expect(clearanceVerdict(hoodCanal, 20)).toBe("clears");
  });
});
