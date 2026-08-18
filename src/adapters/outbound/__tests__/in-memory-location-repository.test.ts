import { describe, expect, it } from "vitest";
import { InMemoryLocationRepository } from "../in-memory-location-repository";
import type { Location } from "@/domain/location";

const locations: Location[] = [
  { slug: "shilshole", name: "Shilshole Bay, Seattle", region: "US", lat: 47.6775, lon: -122.4112 },
  { slug: "ganges", name: "Ganges, Salt Spring Is.", region: "CA", lat: 48.8542, lon: -123.4964 },
];

describe("InMemoryLocationRepository", () => {
  it("lists every location, in the order given", () => {
    expect(new InMemoryLocationRepository(locations).list().map((l) => l.slug)).toEqual([
      "shilshole",
      "ganges",
    ]);
  });

  it("finds a location by slug", () => {
    expect(new InMemoryLocationRepository(locations).find("ganges")?.name).toBe(
      "Ganges, Salt Spring Is."
    );
  });

  it("returns undefined for an unknown slug rather than throwing", () => {
    expect(new InMemoryLocationRepository(locations).find("nowhere")).toBeUndefined();
  });

  it("copes with an empty dataset, which is what a build without the scrape has", () => {
    const empty = new InMemoryLocationRepository([]);
    expect(empty.list()).toEqual([]);
    expect(empty.find("shilshole")).toBeUndefined();
  });
});
