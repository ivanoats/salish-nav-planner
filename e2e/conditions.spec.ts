import { dayItems, expect, pickLocation, test } from "./fixtures";

/**
 * The planner's own API routes are what the browser calls, so a test can
 * fail them here even though the upstreams behind them are offline.
 */
const failWith502 = (url: string) => async (route: import("@playwright/test").Route) => {
  await route.fulfill({ status: 502, json: { error: `${url} unavailable` } });
};

test("a failed forecast still plans, on distance alone", async ({ page }) => {
  await page.route("**/api/wind?**", failWith502("/api/wind"));
  await page.goto("/");
  await pickLocation(page, "Start", "Anacortes");
  await pickLocation(page, "Destination", "Deer Harbor");

  await expect(
    page.getByText("Forecast unavailable — planning on distance alone.")
  ).toBeVisible();
  const day = dayItems(page).first();
  await expect(day).toContainText("Anacortes → Deer Harbor");
  await expect(day).toContainText("22.2 nm");
  await expect(day).not.toContainText("SW 12–18 kt");
});

test("failed current predictions still plan, without slack times", async ({ page }) => {
  await page.route("**/api/currents?**", failWith502("/api/currents"));
  await page.goto("/");
  await pickLocation(page, "Start", "Anacortes");
  await pickLocation(page, "Destination", "Deer Harbor");

  const day = dayItems(page).first();
  await expect(day).toContainText("22.2 nm");
  await expect(day.getByRole("listitem").first()).toContainText(
    "no current prediction for this time"
  );
  await expect(day).not.toContainText(/slack \d{2}:\d{2}/);
});
