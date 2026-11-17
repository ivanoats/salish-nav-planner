import { GPX_DESCRIPTION, type GpxRoute } from "@/application/gpx-export";

const entities: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  "\r": "&#13;",
};

function xmlText(text: string): string {
  let escaped = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    // XML 1.0 Char production. Iteration preserves supplementary characters.
    const valid = codePoint === 0x09 || codePoint === 0x0A || codePoint === 0x0D ||
      (codePoint >= 0x20 && codePoint <= 0xD7FF) ||
      (codePoint >= 0xE000 && codePoint <= 0xFFFD) ||
      (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
    escaped += valid ? (entities[character] ?? character) : "\uFFFD";
  }
  return escaped;
}

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
