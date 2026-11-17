import { GPX_DESCRIPTION, type GpxRoute } from "@/application/gpx-export";

const entities: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const xmlText = (text: string): string => text
  // XML 1.0 permits these Unicode ranges and whitespace characters.
  .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "\uFFFD")
  .replace(/[&<>"']/gu, (character) => entities[character] ?? character);

// GPX uses xsd:decimal, which does not permit exponent notation.
const decimal = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  maximumSignificantDigits: 17,
});

export function serializeGpx(routes: readonly GpxRoute[]): string {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Salish Sea Nav Planner" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><desc>${xmlText(GPX_DESCRIPTION)}</desc></metadata>`,
  ];
  for (const route of routes) {
    xml.push("  <rte>", `    <name>${xmlText(route.name)}</name>`, `    <desc>${xmlText(GPX_DESCRIPTION)}</desc>`);
    for (const { coordinates: [lon, lat], name } of route.points) {
      const attributes = `lat="${decimal.format(lat)}" lon="${decimal.format(lon)}"`;
      xml.push(name === undefined
        ? `    <rtept ${attributes}/>`
        : `    <rtept ${attributes}><name>${xmlText(name)}</name></rtept>`);
    }
    xml.push("  </rte>");
  }
  return [...xml, "</gpx>", ""].join("\n");
}
