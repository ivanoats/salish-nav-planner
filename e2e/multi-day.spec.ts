import { dayItems, drawnRoute, expect, pickLocation, test } from "./fixtures";

test("a round trip ends back at the start", async ({ page, pageErrors }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "2", exact: true }).click();
  await pickLocation(page, "Start", "Anacortes");
  await pickLocation(page, "Day 1 destination", "Bellingham");
  await page.getByRole("checkbox", { name: /Round trip/ }).check();

  await expect(dayItems(page)).toHaveCount(2);
  await expect(dayItems(page).nth(0)).toContainText("Anacortes → Bellingham");
  await expect(dayItems(page).nth(1)).toContainText("Bellingham → Anacortes");
  await expect(page.getByText("39.4 nm", { exact: true })).toBeVisible();
  // A round trip has nowhere else to end, so the end picker goes away.
  await expect(page.getByRole("combobox", { name: "End at (optional)" })).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]round=1(&|$)/);

  expect(pageErrors).toEqual([]);
});

test("a one-way trip with a chosen end stops there", async ({ page, pageErrors }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "2", exact: true }).click();
  await pickLocation(page, "Start", "Anacortes");
  await pickLocation(page, "Day 1 destination", "Bellingham");
  await pickLocation(page, "End at (optional)", "Deer Harbor");

  await expect(dayItems(page)).toHaveCount(2);
  await expect(dayItems(page).nth(1)).toContainText("Bellingham → Deer Harbor");
  await expect(dayItems(page).nth(1)).toContainText("28.0 nm");

  // One line per day, each walked through the mesh.
  await expect
    .poll(async () => {
      const days = await drawnRoute(page);
      return days.map((day) => day.day).join(",") + (days.every((day) => day.points > 2) ? "" : "!");
    })
    .toBe("1,2");

  expect(pageErrors).toEqual([]);
});
