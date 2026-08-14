/** Parses nwcruising.net's "H:MM" duration format into total minutes. */
export const hrMinToMinutes = (hrMin: string): number => {
  const [hoursPart, minutesPart] = hrMin.split(":");
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid Hr:Min value: ${hrMin}`);
  }
  return hours * 60 + minutes;
};

export const minutesToHrMin = (totalMinutes: number): string => {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
};

/** Nautical miles -> Hr:Min at the given speed in knots. */
export const nmToHrMin = (nm: number, knots: number): string =>
  minutesToHrMin((nm / knots) * 60);
