import type { Coordinates } from "./location";

/**
 * Something you have to fit *under*. Bridges mostly, plus the occasional
 * overhead cable.
 *
 * The distance tables know nothing about air draft, so without this a
 * plan will happily send a 60-foot rig through the Port Townsend Canal
 * and under its 58-foot fixed span. Height is the one constraint where
 * being slightly wrong is not a matter of a longer day.
 */
export interface Obstruction extends Coordinates {
  readonly id: string;
  readonly name: string;
  /** Names as they appear in the scraped `via` notes, e.g. "Ballard Locks". */
  readonly aliases?: readonly string[];
  /**
   * Vertical clearance in feet at mean high water, with the span closed.
   * Real clearance is usually a little more, since the tide is rarely at
   * MHW — which is margin in your favour, so it stays out of the maths.
   */
  readonly clearanceFeet: number;
  /**
   * True for a bascule, swing or lift span that opens on request or on a
   * schedule. An opening bridge is a delay and a radio call, not a
   * barrier, so it never blocks a route — it's reported instead.
   */
  readonly opens: boolean;
  readonly note?: string;
}

/** A common sloop; deliberately low enough that the control gets noticed. */
export const DEFAULT_MAST_HEIGHT_FEET = 50;
export const MIN_MAST_HEIGHT_FEET = 0;
export const MAX_MAST_HEIGHT_FEET = 200;

/**
 * Added to the stated mast height before comparing against a clearance.
 *
 * Masthead gear — VHF whip, windvane, anchor light — is rarely counted
 * when someone says "fifty feet", and a published clearance is a nominal
 * figure rather than a survey. Three feet is small enough not to rule out
 * passages that genuinely fit and large enough to cover the usual gap
 * between what's on the spec sheet and what's actually up there.
 */
export const AIR_DRAFT_MARGIN_FEET = 3;

export const clampMastHeight = (feet: number): number =>
  Number.isFinite(feet)
    ? Math.min(MAX_MAST_HEIGHT_FEET, Math.max(MIN_MAST_HEIGHT_FEET, feet))
    : MIN_MAST_HEIGHT_FEET;

/** Height that actually has to fit, including the margin above. */
export const airDraftFor = (mastHeightFeet: number): number =>
  mastHeightFeet + AIR_DRAFT_MARGIN_FEET;

/** Whether the rig fits under this span as it stands. */
export const clearsUnder = (obstruction: Obstruction, mastHeightFeet: number): boolean =>
  obstruction.clearanceFeet >= airDraftFor(mastHeightFeet);

/**
 * Whether this obstruction makes a route impassable. Only fixed spans
 * can: an opening bridge that you don't fit under is still a bridge you
 * get through.
 */
export const blocksPassage = (obstruction: Obstruction, mastHeightFeet: number): boolean =>
  !obstruction.opens && !clearsUnder(obstruction, mastHeightFeet);

/** How an obstruction bears on a particular boat. */
export type ClearanceVerdict = "clears" | "opens" | "blocked";

export const clearanceVerdict = (
  obstruction: Obstruction,
  mastHeightFeet: number
): ClearanceVerdict => {
  if (clearsUnder(obstruction, mastHeightFeet)) return "clears";
  return obstruction.opens ? "opens" : "blocked";
};
