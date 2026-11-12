import { dayItems, expect, pickLocation, test } from "./fixtures";

test("the speed field keeps a half-typed number while it is being edited", async ({ page }) => {
  // The regression fixed in #25: "7." used to snap back to "7" before the
  // "5" could follow it, so typing "7.5" landed as 75. (Chromium reports a
  // half-typed "7." as "7" through `.value`, so only the end state is
  // checkable — which is the one that broke.)
  await page.goto("/");
  const speed = page.getByRole("spinbutton", { name: "Speed (kt)" });

  await speed.selectText();
  await speed.pressSequentially("7.5");
  await expect(speed).toHaveValue("7.5");
  await expect(page.getByText(/at 7\.5 kt reaches/)).toBeVisible();

  await speed.selectText();
  await speed.press("Backspace");
  await expect(speed).toHaveValue("");
  await speed.blur();
  await expect(speed).toHaveValue("7.5");
});

test("a mast too tall for a fixed bridge routes the long way round", async ({ page }) => {
  await page.goto("/");
  await pickLocation(page, "Start", "Port Ludlow");
  await pickLocation(page, "Destination", "Port Townsend");

  // 50 ft plus 3 ft of masthead gear clears the canal's 58 ft span.
  const day = dayItems(page).first();
  await expect(day).toContainText("13.0 nm");
  await expect(day).toContainText("via Port Townsend Canal");
  await expect(day).toContainText("Port Townsend Canal Bridge · 58 ft · clears");

  // 60 ft needs 63 ft, so the canal is out.
  await page.getByRole("spinbutton", { name: "Mast (ft)" }).fill("60");
  await expect(day).toContainText("20.0 nm");
  await expect(day).toContainText("via Admiralty Inlet");
  await expect(day).not.toContainText("via Port Townsend Canal");
  await expect(day).not.toContainText("Port Townsend Canal Bridge");
  await expect(page).toHaveURL(/[?&]mast=60(&|$)/);
});

test("the day buttons set the trip length", async ({ page }) => {
  await page.goto("/");
  const three = page.getByRole("button", { name: "3", exact: true });

  await three.click();

  await expect(three).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "1", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(page.getByRole("combobox", { name: "Day 1 destination" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "End at (optional)" })).toBeVisible();
});
