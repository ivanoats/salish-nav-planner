const DMS_PATTERN =
  /(\d+)\D+(\d+)\D+([\d.]+)"?\s*([NS]),?\s*(\d+)\D+(\d+)\D+([\d.]+)"?\s*([EW])/;

/**
 * Parses nwcruising.net's "47&deg; 40' 39.15" N, 122&deg; 24' 40.19" W"
 * coordinate header (already HTML-entity-decoded) into decimal degrees.
 */
export const parseDms = (text: string): { lat: number; lon: number } => {
  const found = DMS_PATTERN.exec(text);
  if (found === null) {
    throw new Error(`Could not parse DMS coordinates from: ${text}`);
  }
  const [
    ,
    latDeg,
    latMin,
    latSec,
    latHemi,
    lonDeg,
    lonMin,
    lonSec,
    lonHemi,
  ] = found as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const toDecimal = (deg: string, min: string, sec: string, hemi: string) => {
    const sign = hemi === "S" || hemi === "W" ? -1 : 1;
    return sign * (Number(deg) + Number(min) / 60 + Number(sec) / 3600);
  };

  return {
    lat: toDecimal(latDeg, latMin, latSec, latHemi),
    lon: toDecimal(lonDeg, lonMin, lonSec, lonHemi),
  };
};
