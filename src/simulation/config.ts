/** Gravitational constant in N·m²/kg² */
export const G = 6.67408e-11;

/** Solar mass in kg */
export const SOLAR_MASS = 2e30;

/** Solar radius in meters */
export const SOLAR_RADIUS = 7e8;

/** One astronomical unit in meters */
export const AU = 1.5e11;

/** Seconds in one Julian year */
export const YEAR_SECONDS = 365.25 * 24 * 3600;

/** Convert solar masses to kg */
export function solarMassesToKg(m: number): number {
  return m * SOLAR_MASS;
}

/** Convert AU to meters */
export function auToMeters(au: number): number {
  return au * AU;
}

/** Convert km/s to m/s */
export function kmsToMs(kms: number): number {
  return kms * 1000;
}

/** Convert years to seconds */
export function yearsToSeconds(years: number): number {
  return years * YEAR_SECONDS;
}

/** Convert hours to seconds */
export function hoursToSeconds(hours: number): number {
  return hours * 3600;
}

/**
 * Compute stellar radius from mass using the mass-radius relation:
 * R = R_sun × (M / M_sun)^0.8
 */
export function bodyRadius(massKg: number): number {
  return SOLAR_RADIUS * Math.pow(massKg / SOLAR_MASS, 0.8);
}
