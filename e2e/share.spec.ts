import { dayItems, expect, pickLocation, test } from "./fixtures";

/** Today on the water, which is the date a fresh plan starts on. */
const todayInSalishSea = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

test("a copied link reopens the same plan", async ({ page, context, pageErrors }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await pickLocation(page, "Start", "Anacortes");
  await pickLocation(page, "Destination", "Deer Harbor");
  // Captured once both the forecast and the currents have landed, since
  // each fills in part of the day's text.
  await expect(dayItems(page).first()).toContainText("SW 12–18 kt");
  await expect(dayItems(page).first()).toContainText(/slack \d{2}:\d{2}/);
  const planned = await dayItems(page).first().innerText();

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("status")).toHaveText("Link copied.");
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const reopened = await context.newPage();
  await reopened.goto(link);
  await expect(reopened.getByRole("combobox", { name: "Start" })).toHaveValue("Anacortes");
  await expect(reopened.getByRole("combobox", { name: "Destination" })).toHaveValue("Deer Harbor");
  // Retried, so the reopened tab gets the same chance to settle.
  await expect.poll(() => dayItems(reopened).first().innerText()).toBe(planned);
  await expect(reopened.getByText("Shared link problem")).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("a shared multi-day link plans without any input", async ({ page, pageErrors }) => {
  const query = new URLSearchParams({
    v: "1",
    days: "2",
    "min-hours": "3",
    "max-hours": "8",
    speed: "6",
    start: "anacortes",
    first: "bellingham",
    date: todayInSalishSea(),
    depart: "08:00",
    mast: "50",
    wind: "1",
    round: "1",
    end: "-",
    stops: "anacortes,bellingham,anacortes",
    pins: "-",
  });
  await page.goto(`/?${query}`);

  await expect(page.getByRole("button", { name: "2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("checkbox", { name: /Round trip/ })).toBeChecked();
  await expect(dayItems(page)).toHaveCount(2);
  await expect(dayItems(page).nth(0)).toContainText("Anacortes → Bellingham");
  await expect(dayItems(page).nth(1)).toContainText("Bellingham → Anacortes");

  expect(pageErrors).toEqual([]);
});

test("a broken link warns and falls back to an empty plan", async ({ page }) => {
  await page.goto("/?v=1&days=2&start=atlantis&first=anacortes");

  await expect(page.getByRole("alert").filter({ hasText: "Shared link problem" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Start" })).toHaveValue("");
  await expect(dayItems(page)).toHaveCount(0);
});
