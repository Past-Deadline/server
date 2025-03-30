import { dot, cross, norm, subtract, multiply, acos, atan2 } from 'mathjs';

type Vec3 = [number, number, number];

export interface KeplerianElements {
  semiMajorAxis: number; // a in km
  eccentricity: number; // e
  inclination: number; // i in degrees
  raan: number; // Ω in degrees
  argOfPerigee: number; // ω in degrees
  trueAnomaly: number; // ν in degrees
}

/**
 * Computes Keplerian elements from position and velocity vectors.
 * Assumes Earth’s standard gravitational parameter (mu = 398600.4418 km^3/s^2)
 */
export function getKeplerianFromRV(r: Vec3, v: Vec3): KeplerianElements {
  const mu = 398600.4418; // km^3/s^2

  const rMag = norm(r) as number;
  const vMag = norm(v) as number;

  const h = cross(r, v) as Vec3;
  const hMag = norm(h) as number;

  const inclination = Math.acos(h[2] / hMag);

  const K: Vec3 = [0, 0, 1];
  const n = cross(K, h) as Vec3;
  const nMag = norm(n) as number;

  const eVec = subtract(
    multiply(v, vMag ** 2 - mu / rMag),
    multiply(r, dot(r, v)),
  ) as number;
  const e = (norm(eVec) as number) / mu;

  const raan = nMag !== 0 ? Math.acos(n[0] / nMag) : 0;
  const omega =
    e > 1e-8 && nMag !== 0
      ? //@ts-ignore
        Math.acos((dot(n, eVec as any) / (nMag * norm(eVec))) as any)
      : 0;
  const nu = Math.acos(dot(eVec as any, r) / ((norm(eVec) as any) * rMag));

  const isNuOpposite = dot(r, v) < 0;
  const isOmegaOpposite = eVec[2] < 0;
  const isRaanOpposite = n[1] < 0;

  const energy = vMag ** 2 / 2 - mu / rMag;
  const semiMajorAxis = -mu / (2 * energy);

  return {
    semiMajorAxis,
    eccentricity: (norm(eVec) as any) / mu,
    inclination: inclination * (180 / Math.PI),
    raan: isRaanOpposite
      ? 360 - raan * (180 / Math.PI)
      : raan * (180 / Math.PI),
    argOfPerigee: isOmegaOpposite
      ? 360 - omega * (180 / Math.PI)
      : omega * (180 / Math.PI),
    trueAnomaly: isNuOpposite
      ? 360 - nu * (180 / Math.PI)
      : nu * (180 / Math.PI),
  };
}
