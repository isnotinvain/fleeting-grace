import { describe, it, expect } from "vitest";
import {
  G,
  SOLAR_MASS,
  SOLAR_RADIUS,
  AU,
  YEAR_SECONDS,
  solarMassesToKg,
  auToMeters,
  kmsToMs,
  yearsToSeconds,
  hoursToSeconds,
  bodyRadius,
} from "../../src/simulation/config";

describe("config constants", () => {
  it("G is the gravitational constant", () => {
    expect(G).toBeCloseTo(6.67408e-11, 16);
  });

  it("YEAR_SECONDS is about 31.56M", () => {
    expect(YEAR_SECONDS).toBeCloseTo(31_557_600, 0);
  });
});

describe("unit conversions", () => {
  it("solarMassesToKg", () => {
    expect(solarMassesToKg(1)).toBe(SOLAR_MASS);
    expect(solarMassesToKg(2)).toBe(2 * SOLAR_MASS);
  });

  it("auToMeters", () => {
    expect(auToMeters(1)).toBe(AU);
  });

  it("kmsToMs", () => {
    expect(kmsToMs(1)).toBe(1000);
    expect(kmsToMs(20)).toBe(20_000);
  });

  it("yearsToSeconds", () => {
    expect(yearsToSeconds(1)).toBe(YEAR_SECONDS);
  });

  it("hoursToSeconds", () => {
    expect(hoursToSeconds(1)).toBe(3600);
    expect(hoursToSeconds(5)).toBe(18_000);
  });
});

describe("bodyRadius", () => {
  it("1 solar mass gives 1 solar radius", () => {
    expect(bodyRadius(SOLAR_MASS)).toBeCloseTo(SOLAR_RADIUS, 0);
  });

  it("larger mass gives larger radius", () => {
    expect(bodyRadius(10 * SOLAR_MASS)).toBeGreaterThan(SOLAR_RADIUS);
  });

  it("smaller mass gives smaller radius", () => {
    expect(bodyRadius(0.5 * SOLAR_MASS)).toBeLessThan(SOLAR_RADIUS);
  });

  it("follows the 0.8 power law", () => {
    const m = 4 * SOLAR_MASS;
    const expected = SOLAR_RADIUS * Math.pow(4, 0.8);
    expect(bodyRadius(m)).toBeCloseTo(expected, 0);
  });
});
