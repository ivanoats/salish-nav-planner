import { test as base, type Page } from "@playwright/test";

export { expect } from "@playwright/test";

/** 1×1 transparent PNG, served in place of every basemap tile. */
const BLANK_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

interface PlannerFixtures {
  readonly offlineTiles: undefined;
  /** Console errors and uncaught exceptions seen so far on `page`. */
  readonly pageErrors: string[];
}

/**
 * The automatic fixture keeps every test off the volunteer-run OpenStreetMap
 * tile server. `pageErrors` tracks anything the page reported as an error.
 */
export const test = base.extend<PlannerFixtures>({
  offlineTiles: [
    async ({ page }, provide) => {
      await page.route("https://tile.openstreetmap.org/**", (route) =>
        route.fulfill({ contentType: "image/png", body: BLANK_TILE })
      );
      await provide(undefined);
    },
    { auto: true },
  ],
  pageErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await provide(errors);
  },
});

/** Picks a location in one of the planner's comboboxes by typing part of its name. */
export const pickLocation = async (page: Page, field: string | RegExp, name: string) => {
  await page.getByRole("combobox", { name: field }).fill(name.slice(0, 4));
  await page.getByRole("option", { name, exact: true }).click();
};

/** The planned-route features MapLibre is currently drawing. */
export const drawnRoute = (page: Page) =>
  page.evaluate(async () => {
    const map = (
      window as unknown as {
        __navPlannerMap?: {
          getSource(id: string): { getData(): Promise<GeoJSON.FeatureCollection> } | undefined;
        };
      }
    ).__navPlannerMap;
    const data = await map?.getSource("planned-route")?.getData();
    return (data?.features ?? []).map((feature) => ({
      day: feature.properties?.day as number,
      approximate: feature.properties?.approximate === true,
      points: feature.geometry.type === "LineString" ? feature.geometry.coordinates.length : 0,
    }));
  });
