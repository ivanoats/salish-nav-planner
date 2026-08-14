import { describe, expect, it } from "vitest";
import { normalizeName, slugFromHref } from "../slug";

describe("normalizeName", () => {
  it("lowercases, decodes &amp;, and collapses whitespace", () => {
    expect(normalizeName("Princess Louisa Inlet")).toBe(
      "princess louisa inlet"
    );
    expect(normalizeName("Colvos  &amp;  Drayton Passages")).toBe(
      "colvos & drayton passages"
    );
    expect(normalizeName("Bedwell Harbour, B.C.")).toBe("bedwell harbour bc");
  });
});

describe("slugFromHref", () => {
  it("extracts the slug from an nm_folders link", () => {
    expect(slugFromHref("nm_folders/shilshole.html")).toBe("shilshole");
    expect(slugFromHref("../nm_folders/friday_harbor.html")).toBe(
      "friday_harbor"
    );
  });

  it("throws for a non-nm_folders link", () => {
    expect(() => slugFromHref("../routes/route.0233.html")).toThrow();
  });
});
