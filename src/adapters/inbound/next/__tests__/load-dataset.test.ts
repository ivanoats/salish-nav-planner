import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocked per-file so each case can decide which files "exist"; the real
// implementation reads them off disk relative to cwd. Partially mocked
// and re-exported as `default` too, because node:path pulls the module
// namespace in and a bare { readFile } factory leaves it without one.
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: readFileMock, default: { ...actual, readFile: readFileMock } };
});

const { loadDataset } = await import("../load-dataset");

const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });

const feature = (slug: string, lon: number, lat: number, region = "US") => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { slug, name: slug, region },
});

/** Files present by default; pass `null` to make one missing. */
const givenFiles = (over: Record<string, unknown | null> = {}) => {
  const files: Record<string, unknown> = {
    "locations.geojson": {
      type: "FeatureCollection",
      features: [feature("shilshole", -122.4112, 47.6775)],
    },
    "edges.json": [{ from: "shilshole", to: "ganges", nm: 10, hrMin: "1:40", via: [], routeUrl: "" }],
    "waypoints.json": [],
    "passes.json": [],
    "wind-zones.json": [],
    "obstructions.json": [],
    "location-fixes.json": [],
    ...over,
  };

  readFileMock.mockImplementation((path: unknown) => {
    const name = String(path).split(/[/\\]/).pop() ?? "";
    const value = files[name];
    if (value === null || value === undefined) return Promise.reject(enoent());
    return Promise.resolve(JSON.stringify(value));
  });
};

beforeEach(() => {
  readFileMock.mockReset();
  delete process.env.ALLOW_EMPTY_DATASET;
});

afterEach(() => {
  delete process.env.ALLOW_EMPTY_DATASET;
});

describe("loadDataset", () => {
  it("reads locations out of the GeoJSON, flipping coordinates to lat/lon", async () => {
    givenFiles();

    const { locations } = await loadDataset();

    expect(locations).toEqual([
      { slug: "shilshole", name: "shilshole", region: "US", lat: 47.6775, lon: -122.4112 },
    ]);
  });

  describe("when the scraped route data is missing", () => {
    it("fails the build rather than shipping a planner with no destinations", async () => {
      givenFiles({ "edges.json": null });

      await expect(loadDataset()).rejects.toThrow(/Route data is missing/);
    });

    it("names the file and the three ways to fix it", async () => {
      givenFiles({ "locations.geojson": null });

      await expect(loadDataset()).rejects.toThrow(/locations\.geojson/);
      await expect(loadDataset()).rejects.toThrow(/npm run scrape/);
      await expect(loadDataset()).rejects.toThrow(/R2_ACCOUNT_ID/);
      await expect(loadDataset()).rejects.toThrow(/ALLOW_EMPTY_DATASET=1/);
    });

    it("continues with an empty dataset only when CI opts in", async () => {
      process.env.ALLOW_EMPTY_DATASET = "1";
      givenFiles({ "edges.json": null, "locations.geojson": null });

      const dataset = await loadDataset();

      expect(dataset.locations).toEqual([]);
      expect(dataset.edges).toEqual([]);
    });

    it("treats any value other than 1 as not opting in", async () => {
      process.env.ALLOW_EMPTY_DATASET = "true";
      givenFiles({ "edges.json": null });

      await expect(loadDataset()).rejects.toThrow(/Route data is missing/);
    });
  });

  it("still fails on an unreadable file, which is a real fault rather than a missing scrape", async () => {
    givenFiles();
    readFileMock.mockImplementation((path: unknown) =>
      String(path).endsWith("edges.json")
        ? Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" }))
        : Promise.resolve("[]")
    );

    await expect(loadDataset()).rejects.toThrow(/EACCES/);
  });

  it("fails on the committed data too — those are not regenerable", async () => {
    givenFiles({ "passes.json": null });

    await expect(loadDataset()).rejects.toThrow();
  });

  describe("location fixes", () => {
    it("overwrites a bad scraped position but keeps the scraped name", async () => {
      givenFiles({
        "location-fixes.json": [
          {
            slug: "shilshole",
            name: "ignored when the scrape has one",
            region: "US",
            lat: 1,
            lon: 2,
            reason: "test",
          },
        ],
      });

      const { locations } = await loadDataset();

      expect(locations[0]).toMatchObject({ name: "shilshole", lat: 1, lon: 2 });
    });

    it("inserts a location the scrape had to drop entirely", async () => {
      givenFiles({
        "location-fixes.json": [
          {
            slug: "wollochet_bay",
            name: "Wollochet Bay Outstation",
            region: "US",
            lat: 47.289,
            lon: -122.5594,
            reason: "source page reads 123° 122' W",
          },
        ],
      });

      const { locations } = await loadDataset();

      expect(locations.map((l) => l.slug)).toContain("wollochet_bay");
      expect(locations.find((l) => l.slug === "wollochet_bay")).toMatchObject({
        name: "Wollochet Bay Outstation",
        lat: 47.289,
      });
    });

    it("does not resurrect fixes into an intentionally empty dataset", async () => {
      process.env.ALLOW_EMPTY_DATASET = "1";
      givenFiles({
        "locations.geojson": null,
        "edges.json": null,
        "location-fixes.json": [
          { slug: "wollochet_bay", name: "W", region: "US", lat: 1, lon: 2, reason: "test" },
        ],
      });

      const { locations } = await loadDataset();

      // An empty build is empty; three stray fixes are not a dataset.
      expect(locations).toEqual([]);
    });
  });
});
