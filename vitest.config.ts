import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "styled-system/css": fileURLToPath(
        new URL("./vitest.styled-system-css-stub.ts", import.meta.url)
      ),
      "server-only": fileURLToPath(
        new URL("./vitest.server-only-stub.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/domain/**/*.ts",
        "src/application/**/*.ts",
        "src/adapters/**/*.ts",
        // The hooks, not the views. useTripPlan holds the override
        // invalidation and the currents window, which is logic worth
        // gating; the .tsx files are markup and stay out.
        "src/components/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        // Ports are interfaces: no runtime code to cover.
        "src/**/ports/**",
        // Constant declarations only — no statements or branches to
        // exercise, and v8 scores it zero purely because no test has
        // cause to import it.
        "src/components/map/map-constants.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
