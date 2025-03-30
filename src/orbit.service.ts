import { Injectable } from '@nestjs/common';
import { Vector3 } from 'three';

/**
 * OrbitService:
 *   - Provides a method to generate TLE lines from an ECI state vector (r, v) at a given epoch.
 *   - Manually computes the orbital elements and creates TLE lines using a custom formatter.
 */
@Injectable()
export class OrbitService {
  /**
   * Universal gravitational parameter for Earth, mu = GM (km^3 / s^2).
   * Using the WGS-84 Earth GM ~ 398600.4418 km^3/s^2.
   */
  private readonly MU_EARTH = 398600.4418;

  /**
   * High-level wrapper:
   *   - Takes an ECI position/velocity (km, km/s),
   *   - Computes the orbital elements,
   *   - Generates TLE lines.
   *
   * @param r ECI position (km) [THREE.Vector3]
   * @param v ECI velocity (km/s) [THREE.Vector3]
   * @param epoch Date for TLE epoch
   * @param satNum Satellite catalog number
   * @param classification Usually 'U' for unclassified
   * @param satelliteName The sat name to embed in line 0 (optional usage)
   * @returns { line1: string, line2: string }
   */
  public generateTleFromState(
    r: Vector3,
    v: Vector3,
    epoch: Date,
    satNum = 99999,
    classification = 'U',
    satelliteName = 'MY-SAT',
  ): { line1: string; line2: string } {
    // 1) Compute classical orbital elements from [r, v]
    const coe = this.rvToCoe(r, v, this.MU_EARTH);

    // 2) Format them into TLE lines
    const { line1, line2 } = this.exportTle(
      coe,
      epoch,
      satNum,
      classification,
      satelliteName,
    );

    return { line1, line2 };
  }

  /**
   * Convert position/velocity in ECI frame to classical orbital elements.
   *   - inclination (i) [radians]
   *   - RAAN (Omega) [radians]
   *   - eccentricity (e)
   *   - argument of perigee (omega) [radians]
   *   - mean anomaly (M) at epoch [radians]
   *   - mean motion (n) [revs/day]
   *
   * @param r ECI position vector in km
   * @param v ECI velocity vector in km/s
   * @param mu Gravitational parameter km^3 / s^2
   */
  private rvToCoe(r: Vector3, v: Vector3, mu: number) {
    // Magnitudes
    const R = r.length();
    const V = v.length();

    // Specific angular momentum h = r x v
    const hVec = new Vector3().copy(r).cross(v);
    const h = hVec.length();

    // Node vector n = k x h
    const kVec = new Vector3(0, 0, 1);
    const nVec = new Vector3().copy(kVec).cross(hVec);
    const n = nVec.length();

    // Eccentricity vector e = 1/mu * ( (v x h) - mu * r/|r| )
    const eVec = new Vector3()
      .copy(v)
      .cross(hVec)
      .multiplyScalar(1 / mu)
      .sub(new Vector3().copy(r).multiplyScalar(1 / R));
    const e = eVec.length();

    // Inclination i = arccos(h_z / |h|)
    const i = Math.acos(hVec.z / h);

    // RAAN (Omega): angle in XY plane from X-axis to nVec
    let Omega = 0;
    if (n >= 1e-8) {
      // If nVec is not near zero
      Omega = Math.acos(nVec.x / n);
      if (nVec.y < 0) {
        Omega = 2 * Math.PI - Omega;
      }
    } else {
      // Equatorial orbit fallback
      Omega = 0;
    }

    // Argument of perigee (omega)
    let argp = 0;
    if (n >= 1e-8 && e > 1e-8) {
      argp = Math.acos(nVec.dot(eVec) / (n * e));
      if (eVec.z < 0) {
        argp = 2 * Math.PI - argp;
      }
    } else {
      argp = 0;
    }

    // True anomaly (theta)
    let trueAnomaly = 0;
    if (e > 1e-8) {
      const rDotE = r.dot(eVec);
      trueAnomaly = Math.acos(rDotE / (R * e));
      if (r.dot(v) < 0) {
        trueAnomaly = 2 * Math.PI - trueAnomaly;
      }
    } else {
      // Circular orbit fallback
      // For circular orbits, we define true anomaly wrt nVec if e ~ 0
      trueAnomaly = 0;
    }

    // Semi-major axis
    const energy = 0.5 * V * V - mu / R;
    const a = -mu / (2 * energy);

    // Convert true anomaly -> eccentric anomaly E -> mean anomaly M
    // E = 2 * atan( sqrt((1-e)/(1+e)) * tan(trueAnomaly/2) )
    let E = 0;
    if (e < 1e-8) {
      // circular
      // E ~ theta for a circular orbit
      E = trueAnomaly;
    } else {
      E =
        2 *
        Math.atan2(
          Math.sqrt(1 - e) * Math.sin(trueAnomaly / 2),
          Math.sqrt(1 + e) * Math.cos(trueAnomaly / 2),
        );
    }
    // Normalize E to [0, 2pi)
    if (E < 0) {
      E += 2 * Math.PI;
    }

    // Mean anomaly M = E - e*sin(E)
    const M = E - e * Math.sin(E);

    // Mean motion n [revs per day] = sqrt(mu / a^3) in rad/s => convert to rev/day
    const nRadSec = Math.sqrt(mu / (a * a * a));
    const nRevDay = (nRadSec * 86400) / (2 * Math.PI);

    return {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: i, // radians
      raan: Omega, // radians
      argOfPerigee: argp, // radians
      meanAnomaly: M, // radians
      meanMotion: nRevDay, // rev/day
    };
  }

  /**
   * Given orbital elements + epoch, produce TLE lines (Line 1 & 2).
   * For the sake of simplicity, we set BSTAR = 0, NDOT/6 = 0, NDDOT = 0.
   */
  private exportTle(
    coe: {
      semiMajorAxis: number;
      eccentricity: number;
      inclination: number; // radians
      raan: number; // radians
      argOfPerigee: number; // radians
      meanAnomaly: number; // radians
      meanMotion: number; // rev/day
    },
    epoch: Date,
    satNum: number,
    classification: string,
    satelliteName: string,
  ): { line1: string; line2: string } {
    // ==============
    // 0) TLE epoch
    //    TLE uses YYDDD.ddddd format. Let's build that from the actual date:
    //    - Year in last two digits
    //    - Day of year with fraction
    // ==============
    const year = epoch.getUTCFullYear();
    const twoDigitYear = year % 100; // e.g. 2025 => 25
    const startOfYear = Date.UTC(year, 0, 1, 0, 0, 0);
    const dayOfYearNum = (epoch.getTime() - startOfYear) / 86400000 + 1;
    // fraction
    const dayOfYear = dayOfYearNum.toFixed(8).padStart(11, '0'); // e.g. "  91.29140000"

    // ==============
    // 1) Format line 1
    //    We set NDOT/6 = 0.00000000, NDDOT = 0, BSTAR = 0
    // ==============
    const line1SatNum = satNum.toString().padStart(5, '0');
    const epochStr = `${twoDigitYear.toString().padStart(2, '0')}${dayOfYear}`;

    // Example TLE fields in line 1:
    // 1 NNNNNU AAAAA YYDDD.DDDDDDDD .XXXXXXXX  ±Y.YYYYY- Z  ...
    // We'll zero them out for simplicity
    const ndot_str = '.00000000'; // 8 digits
    const nddot_str = ' 00000-0'; // 7 characters
    const bstar_str = ' 00000-0'; // 7 characters

    let line1 =
      `1 ${line1SatNum}${classification} ` + // e.g. "1 99999U "
      `${epochStr} ` + // e.g. "25089.12345678 "
      `${ndot_str} ` + // .00000000
      `${nddot_str} ` + // 00000-0
      `${bstar_str} ` + // 00000-0
      ` 0  9999`; // ephemeris type 0, element set # 9999

    // ==============
    // 2) Format line 2
    //    i (deg), raan (deg), e (no decimal), argp (deg), M (deg), n (rev/day), rev# (we set 00001)
    // ==============
    // Convert angles from radians to degrees
    const iDeg = (coe.inclination * 180) / Math.PI;
    const raanDeg = (coe.raan * 180) / Math.PI;
    const argpDeg = (coe.argOfPerigee * 180) / Math.PI;
    const mDeg = (coe.meanAnomaly * 180) / Math.PI;
    const eStr = coe.eccentricity.toString().split('.').join('').slice(0, 7); // up to 7 digits, no decimal point
    const nStr = coe.meanMotion.toFixed(8).padStart(11, ' '); // 11 wide, 8 decimals

    const revNumber = 1; // Arbitrary

    let line2 =
      `2 ${line1SatNum} ` +
      `${iDeg.toFixed(4).padStart(8, ' ')} ` +
      `${raanDeg.toFixed(4).padStart(8, ' ')} ` +
      `${eStr.padStart(7, '0')} ` + // zero-pad e (7 digits)
      `${argpDeg.toFixed(4).padStart(8, ' ')} ` +
      `${mDeg.toFixed(4).padStart(8, ' ')} ` +
      `${nStr}${revNumber.toString().padStart(5, ' ')}`;

    // ==============
    // 3) Compute checksums for line1 & line2
    // ==============
    const line1Chk = this.computeChecksum(line1);
    const line2Chk = this.computeChecksum(line2);

    line1 += line1Chk.toString();
    line2 += line2Chk.toString();

    return { line1, line2 };
  }

  /**
   * Simple TLE checksum function:
   *   - Sum of all digits + each '-' sign counts as 1
   *   - Then mod 10
   */
  private computeChecksum(line: string): number {
    let sum = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line.charAt(i);
      if (c >= '0' && c <= '9') {
        sum += parseInt(c, 10);
      } else if (c === '-') {
        sum += 1;
      }
    }
    return sum % 10;
  }
}
