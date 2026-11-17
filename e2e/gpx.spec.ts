import { readFile } from "node:fs/promises";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { dayItems, expect, pickLocation, test } from "./fixtures";

test("downloads the current multi-day itinerary and every displayed mesh vertex", async ({ page }) => {
  let finishMeshRequest = () => {};
  const meshDelay = new Promise<void>((resolve) => { finishMeshRequest = resolve; });
  await page.route("**/data/salish-mesh.json", async (route) => {
    await meshDelay;
    await route.continue();
  });
  await page.goto("/");
  const downloadButton = page.getByRole("button", { name: "Download GPX" });
  await expect(downloadButton).toBeDisabled();
  await expect(page.getByText("Choose a start and destination to download GPX.")).toBeVisible();

  try {
    await page.getByRole("button", { name: "2", exact: true }).click();
    await pickLocation(page, "Start", "Anacortes");
    await pickLocation(page, "Day 1 destination", "Bellingham");
    await expect(downloadButton).toBeDisabled();
    await expect(page.getByText("Day 1: Route geometry is loading.")).toBeVisible();
    await pickLocation(page, "End at (optional)", "Deer Harbor");
  } finally {
    finishMeshRequest();
  }
  await expect(downloadButton).toBeEnabled();

  await pickLocation(page, "End at (optional)", "Anacortes");
  await expect(dayItems(page).nth(1)).toContainText("Bellingham → Anacortes");
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("salish-sea-itinerary.gpx");
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(await download.path()));

  const exported = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    const ns = "http://www.topografix.com/GPX/1/1";
    return Array.from(doc.getElementsByTagNameNS(ns, "rte"), (route) => {
      const points = Array.from(route.getElementsByTagNameNS(ns, "rtept"));
      return {
        name: route.firstElementChild?.textContent,
        start: points[0]?.textContent,
        end: points.at(-1)?.textContent,
        coordinates: points.map((point) => [
          Number(point.getAttribute("lon")), Number(point.getAttribute("lat")),
        ]),
      };
    });
  }, xml);

  expect(exported.map(({ name, start, end }) => ({ name, start, end }))).toEqual([
    { name: "Day 1: Anacortes → Bellingham", start: "Anacortes", end: "Bellingham" },
    { name: "Day 2: Bellingham → Anacortes", start: "Bellingham", end: "Anacortes" },
  ]);
  expect(exported.every(({ coordinates }) => coordinates.length > 2)).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const map = (window as Window & { __navPlannerMap?: MapLibreMap }).__navPlannerMap;
    const data = await map?.getSource<GeoJSONSource>("planned-route")?.getData();
    if (data?.type !== "FeatureCollection") return [];
    return data.features.map((feature) =>
      feature.geometry.type === "LineString" ? feature.geometry.coordinates : []
    );
  })).toEqual(exported.map(({ coordinates }) => coordinates));
});

test("blocks approximate and unreachable itineraries", async ({ page }) => {
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.route("**/data/salish-mesh.json", (route) =>
    route.fulfill({ json: { type: "FeatureCollection", features: [] } })
  );
  await page.goto("/");
  const downloadButton = page.getByRole("button", { name: "Download GPX" });
  await pickLocation(page, "Start", "Anacortes");
  await pickLocation(page, "Destination", "Deer Harbor");
  await expect(page.getByText("Day 1: Route geometry is approximate.")).toBeVisible();
  await expect(downloadButton).toBeDisabled();

  // The synthetic graph intentionally has no edges to Friday Harbor.
  await pickLocation(page, "Destination", "Friday Harbor");
  await expect(page.getByText("Day 1: Destination is unreachable.")).toBeVisible();
  await expect(downloadButton).toBeDisabled();
  expect(downloads).toEqual([]);
});
