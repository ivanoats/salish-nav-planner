import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * End-to-end tests against a production build — `next start`, not
 * `next dev`, so codegen and HMR can't make a run flaky.
 *
 * The server reads the synthetic dataset in `e2e/fixtures/dataset/` and
 * answers wind and currents from offline providers, so a run needs
 * neither the scrape nor the network. Both are runtime switches: the
 * build itself is the ordinary one.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI has just built the app in an earlier step; locally the suite
    // builds for itself unless a server is already up on the port.
    command: process.env.CI
      ? `npx next start --port ${PORT}`
      : `npm run maplibre-worker && npx panda codegen --silent && npx next build && npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      SCRAPED_DATA_DIR: "e2e/fixtures/dataset",
      SYNTHETIC_CONDITIONS: "1",
      NEXT_PUBLIC_CHART_PMTILES_URL: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
