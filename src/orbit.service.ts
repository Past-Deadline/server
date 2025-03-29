import { Injectable } from '@nestjs/common';
import { Vector3 } from 'three';
import { Satrec, jday } from 'sgp4';

@Injectable()
export class OrbitService {
  /**
   * Generate a TLE from an ECI state vector using the SGP4 library in Node.js
   *
   * @param r ECI position (km)
   * @param v ECI velocity (km/s)
   * @param epoch Date object for the desired epoch
   * @param satNum Satellite number (e.g., 99999)
   * @param classification Usually 'U' for unclassified
   */
  generateTleFromState(
    r: Vector3,
    v: Vector3,
    epoch: Date,
    satNum = 99999,
    classification = 'U',
    satelliteName = 'MY-SAT',
  ): { line1: string; line2: string } {
    // 1) Convert epoch to Julian date
    const year = epoch.getUTCFullYear();
    const month = epoch.getUTCMonth() + 1;
    const day = epoch.getUTCDate();
    const hour = epoch.getUTCHours();
    const minute = epoch.getUTCMinutes();
    const second = epoch.getUTCSeconds();

    // jday() returns { whole, fraction }
    const jdObj = jday(year, month, day, hour, minute, second);
    const jd = jdObj.whole + jdObj.fraction;

    // 2) Initialize the satellite record
    const satrec = new Satrec();

    // sgp4init parameters:
    // gravity model: 72 for WGS72
    // opsmode: 'i' (improved) or 'a' (afspc)
    // satellite number, epoch (JD),
    // bstar, ndot, nddot,
    // position (x, y, z) in km,
    // velocity (vx, vy, vz) in km/s
    satrec.sgp4init(
      72,
      'i',
      satNum,
      jd,
      0.0, // bstar
      0.0, // ndot
      0.0, // nddot
      r.x,
      r.y,
      r.z,
      v.x,
      v.y,
      v.z,
    );

    // 3) Export TLE lines
    // The built-in Python sgp4 library has satrec.export_tle(...), but
    // the JS port does not. So we implement a custom function:
    const { line1, line2 } = this.exportTle(
      satrec,
      satelliteName,
      classification,
    );

    return { line1, line2 };
  }

  /**
   * Custom TLE formatter, adapted from python-sgp4's `export_tle()` approach.
   */
  private exportTle(satrec: Satrec, satName: string, classification = 'U') {
    // - satrec.epoch:   Julian date
    // - satrec.ecco:    Eccentricity
    // - satrec.inclo:   Inclination (radians)
    // - satrec.nodeo:   RAAN (radians)
    // - satrec.argpo:   Arg of perigee (radians)
    // - satrec.mo:      Mean anomaly at epoch (radians)
    // - satrec.no:      Mean motion (radians/min)
    // - satrec.bstar:   B* drag term
    //
    // - TLE wants:
    //   1) Line 1: 1 NNNNNU YYDDD.DDDDDDDD .xxxxxxxx +yyyyy-zz ...
    //   2) Line 2: 2 NNNNN iiii.iiii rrrr.rrrr eeeeeee gggg.gggg MMMM.MMMM nnnn.nnnnnnnn
    //
    //   where:
    //    - i (deg), RAAN (deg), e, ArgPerigee (deg), M (deg), n (rev/day)

    // 1) Satellite number
    const satNum = Math.abs(satrec.satnum || 99999);

    // 2) Compute TLE epoch format: last two digits of year + day of year with fractional day
    //    from the satrec.epoch which is in JD
    const jdFloor = Math.floor(satrec.epoch);
    const dayFraction = satrec.epoch - jdFloor;
    // Convert JD back to a calendar date to format TLE epoch
    // JD reference for 1 Jan 1950 is 2433282.5. We'll convert for the TLE epoch year.
    // But let's do a simpler approach: the SGP4 library also stores epochyr/epochdays?
    // This might only be set properly for older expansions. Let's do our own approach:

    // The reference epoch for TLE is 1950, but usually, TLE's two-digit year is "00" for 2000-2099.
    // Let's do an approximate approach using the same method the Python library does.
    // That library sets satrec.epochyr and satrec.epochtyper to handle the year offset.
    // If that's not set, we guess from the JD. We'll assume it's 20xx for simplicity.

    // The python-sgp4 does:
    //    (year, day_of_year) = days2mdhms_frac(eForEpoch) -> sets epochyr, epochdays
    // We'll do a simpler approach: let's parse satrec.epochdays & epochyr if they exist:
    let epochYear = satrec.epochyr;
    let epochDays = satrec.epochdays;

    // If the library didn't set them, we'll approximate
    if (!epochYear || !epochDays) {
      // We'll do a quick J2000 approach:
      const JD_JAN_1_2000 = 2451545.0;
      // Days from 2000
      const daysSince2000 = satrec.epoch - JD_JAN_1_2000;
      // Approx year
      const approximateYear = 2000 + Math.floor(daysSince2000 / 365.25);
      epochYear = approximateYear % 100; // TLE uses last two digits
      // Day of year
      const yearStartJD =
        Date.UTC(approximateYear, 0, 1, 0, 0, 0) / 86400000 + 2440587.5; // Convert from UTC to JD
      const doy = satrec.epoch - yearStartJD + 1;
      epochDays = doy;
    }

    // Format day of year with fraction
    const dayOfYear = Math.floor(epochDays);
    const fractionOfDay = epochDays - dayOfYear;
    const dayFractionString = (dayOfYear + fractionOfDay)
      .toFixed(8)
      .padStart(11, '0');

    // 3) Format B* (drag term)
    // "SGP4" B* can be around e-05 -> e+05 range
    // TLE format: ±x.xxxxxx±yy (mantissa + exponent)
    const bstar = satrec.bstar || 0.0;
    const bstarString = this.formatExponential(bstar);

    // 4) Format Mean motion in rev/day, not rad/min
    const nRadMin = satrec.no; // rad/min
    const nRevDay = (nRadMin * 1440) / (2 * Math.PI);

    // 5) Build line 1
    // Example:
    // 1 25544U 98067A   21060.54513889  .00000272  00000-0  10270-4 0  9006
    // Let’s do minimal fields: (we’ll set NDOT=0, NDDOT=0 for simplicity)
    const line1SatNum = satNum.toString().padStart(5, '0');
    const line1EpochYear = epochYear.toString().padStart(2, '0');
    const line1EpochDays = dayFractionString; // e.g. 060.54513889

    // We'll set NDOT = .00000000 + exponent, NDDOT=0, B* from above
    const ndot = 0.0;
    const ndotStr = this.formatExponential(ndot).replace('.', '');
    // NDDOT in TLE is typically 5 digits for exponent
    const nddot = 0.0;
    const nddotStr = `0 00000-0`; // Usually kept at 0 if not known

    // classification:
    // 'U' means unclassified
    const line1 =
      `1 ${line1SatNum}${classification} ` +
      `${line1EpochYear}${line1EpochDays} ` +
      `${ndotStr} ` +
      `${nddotStr} ` +
      `${bstarString} ` +
      `0  9999`; // The "0" is ephemeris type, "9999" is element set number

    // 6) Build line 2
    // Example:
    // 2 25544  51.6448 316.3225 0004371  73.8203 321.3235 15.48961739255038

    // Convert angles from radians to degrees
    const inclDeg = (satrec.inclo * 180) / Math.PI;
    const raanDeg = (satrec.nodeo * 180) / Math.PI;
    const ecco = satrec.ecco; // eccentricity, no decimal point in TLE
    const argpDeg = (satrec.argpo * 180) / Math.PI;
    const moDeg = (satrec.mo * 180) / Math.PI;

    // Format eccentricity as 7 digits, no decimal
    const eccoStr = ecco
      .toString()
      .slice(2, 2 + 7)
      .padEnd(7, '0'); // e.g. "0004371"

    // Format mean motion with 8 decimals
    const nStr = nRevDay.toFixed(8);

    // We'll guess revolution number at epoch as 0
    const revNumAtEpoch = 1; // or pick your own

    const line2 =
      `2 ${line1SatNum} ` +
      `${inclDeg.toFixed(4).padStart(8, ' ')} ` +
      `${raanDeg.toFixed(4).padStart(8, ' ')} ` +
      `${eccoStr} ` +
      `${argpDeg.toFixed(4).padStart(8, ' ')} ` +
      `${moDeg.toFixed(4).padStart(8, ' ')} ` +
      `${nStr.padStart(11, ' ')}${revNumAtEpoch.toString().padStart(5, ' ')}`;

    // 7) Add checksums
    const line1Chk = this.checksum(line1);
    const line2Chk = this.checksum(line2);

    const line1Final = line1 + line1Chk.toString();
    const line2Final = line2 + line2Chk.toString();

    // For neatness, you might also want to keep a line 0 with satelliteName
    // "0 MY-SAT"
    return { line1: line1Final, line2: line2Final };
  }

  /**
   * Format a floating number in TLE '±x.xxxxx-yy' style
   */
  private formatExponential(value: number): string {
    // e.g., 0.0001234 => ".1234-3"
    // in TLE: sign is in front, decimal after first digit, exponent is always 2 digits with sign
    const sign = value >= 0 ? ' ' : '-';

    // Convert to scientific notation
    const scientific = value.toExponential(5); // e.g. "-1.23456e-5"
    // Parse it
    const match = /^(-?)(\d\.\d+)[eE]([+-]\d+)$/.exec(scientific);
    if (!match) {
      return ' 00000-0'; // fallback
    }

    const mantissaSign = match[1];
    const mantissa = match[2]; // e.g. "1.23456"
    let exponent = parseInt(match[3], 10); // e.g. -5

    // TLE has a weird format: " x.xxxxx±yy"
    // We'll keep 5 digits in the fractional part
    // e.g. " 12345-5"
    // sign char at position 0 if negative
    let signChar = mantissaSign === '-' ? '-' : ' ';
    // remove decimal point
    const mantissaDigits = mantissa.replace('.', '').slice(0, 5).padEnd(5, '0'); // "12345"

    // exponent must be 2 digits
    let exponentSign = exponent >= 0 ? '+' : '-';
    exponent = Math.abs(exponent);
    const exponentStr = exponent.toString().padStart(1, '0');

    return `${signChar}.${mantissaDigits}${exponentSign}${exponentStr}`;
  }

  /**
   * Simple checksum function for TLE lines:
   *  - Sum of all digits (not letters or periods) + count of '-' sign as 1
   *  - Then mod 10
   */
  private checksum(line: string): number {
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
