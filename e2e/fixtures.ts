import { test as base, expect, type Page } from "@playwright/test";

/** 1×1 transparent PNG, served in place of every basemap tile. */
const BLANK_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

interface PlannerFixtures {
  /** Console errors and uncaught exceptions seen so far on `page`. */
  readonly pageErrors: string[];
}

/**
 * Every test gets a page that never reaches OpenStreetMap — tiles are
 * answered locally, which keeps runs off a volunteer-run tile server and
 * independent of the network — and a running list of anything the page
 * reported as an error.
 */
export const test = base.extend<PlannerFixtures>({
  pageErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.fulfill({ contentType: "image/png", body: BLANK_TILE })
    );
    await provide(errors);
  },
});

export { expect };

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
      points: feature.geometry.type === "LineString" ? feature.geometry.coordinates.length : 0,
    }));
  });
