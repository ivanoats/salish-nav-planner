import { defineConfig } from "@pandacss/dev";
import { createPreset } from "@park-ui/panda-preset";
import amber from "@park-ui/panda-preset/colors/amber";
import blue from "@park-ui/panda-preset/colors/blue";
import slate from "@park-ui/panda-preset/colors/slate";

export default defineConfig({
  preflight: true,
  presets: [
    "@pandacss/preset-base",
    createPreset({ accentColor: blue, grayColor: slate, radius: "md" }),
  ],
  theme: {
    extend: {
      // Weather and tide readouts need a middle warning step: the preset
      // ships an accent and a red, which leaves "watch this" and "don't"
      // sharing one colour. A fresh breeze and a gale shouldn't look alike.
      tokens: { colors: { amber: amber.tokens } },
      semanticTokens: { colors: { amber: amber.semanticTokens } },
    },
  },
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  jsxFramework: "react",
  outdir: "styled-system",
  importMap: "styled-system",
});
