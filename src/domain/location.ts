export type Region = "US" | "CA";

export interface Coordinates {
  readonly lat: number;
  readonly lon: number;
}

export interface Location extends Coordinates {
  readonly slug: string;
  readonly name: string;
  readonly region: Region;
}

/** A named passage/strait with no own nwcruising.net page, curated by hand. */
export interface Waypoint extends Coordinates {
  readonly name: string;
  /** Alternate spellings/forms that should resolve to this waypoint's coordinates. */
  readonly aliases?: readonly string[];
  /** Optional display-only water corridor, stored in one canonical direction. */
  readonly corridor?: readonly Coordinates[];
}
