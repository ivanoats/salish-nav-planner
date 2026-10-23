import { drawnRoute, expect, pickLocation, test } from "./fixtures";

/**
 * Phase 1: the planner loads, plans a day, and draws it.
 *
 * Runs against the synthetic dataset in `fixtures/dataset/` — seven real
 * harbours with made-up distances — and the offline wind and currents
 * providers, so every number below is fixed by the fixtures rather than
 * by the weather.
 */

const FIXTURE_HARBOURS = [
  "Anacortes",
  "Bellingham",
  "Deer Harbor",
  "La Conner",
  "Oak Harbor",
  "Port Ludlow",
  "Port Townsend",
];

test("loads with the fixture harbours and no errors", async ({ page, pageErrors }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Salish Sea Nav Planner" })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  // The picker opens on the arrow key, not on click.
  await page.getByRole("combobox", { name: "Start" }).press("ArrowDown");
  const options = page.getByRole("option");
  for (const name of FIXTURE_HARBOURS) {
    await expect(options.filter({ hasText: name })).toHaveCount(1);
  }
  // In the scrape but not the fixtures: proves the server read the latter.
  await expect(options.filter({ hasText: "Alderbrook" })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("plans a one-day trip with wind and currents", async ({ page, pageErrors }) => {
  await page.goto("/");

  await pickLocation(page, "Start", "Anacortes");
  await pickLocation(page, "Destination", "Deer Harbor");

  const day = page.getByRole("listitem").filter({ hasText: "Day 1" }).first();
  await expect(day).toContainText("Anacortes → Deer Harbor");
  await expect(day).toContainText("22.2 nm");
  // From the synthetic forecast: a steady 12–18 kt southwesterly.
  await expect(day).toContainText("SW 12–18 kt");
  // From the synthetic currents: some pass on the way has a slack time.
  await expect(day.getByRole("listitem").first()).toContainText(/slack \d{2}:\d{2}/);

  await expect(page).toHaveURL(/[?&]start=anacortes(&|$)/);
  await expect(page).toHaveURL(/[?&]first=deer_harbor(&|$)/);

  expect(pageErrors).toEqual([]);
});

test("draws the route over the navigation mesh", async ({ page, pageErrors }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto("/");

  const mesh = page.waitForResponse((response) => response.url().endsWith("/data/salish-mesh.json"));
  await pickLocation(page, "Start", "Anacortes");
  await pickLocation(page, "Destination", "Deer Harbor");
  expect((await mesh).ok()).toBe(true);

  // A straight line between two stops is two points; one walked through
  // the mesh bends around the islands in between. The straight line is
  // drawn first, while the mesh is still parsing, so the poll waits past it.
  await expect
    .poll(async () => {
      const days = await drawnRoute(page);
      return days.length === 1 && days[0]?.day === 1 ? days[0].points : 0;
    })
    .toBeGreaterThan(2);

  expect(warnings.filter((text) => text.includes("[map]"))).toEqual([]);
  expect(pageErrors).toEqual([]);
});
