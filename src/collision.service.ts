import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CollisionCheckDto } from './dto/collision-check.dto';
import fetch from 'cross-fetch';
import * as fs from 'fs';
import * as satellite from 'satellite.js';

/**
 * Minimal shape from KeepTrack's /v2/sats
 */
interface KeepTrackSatellite {
  tle1: string;
  tle2: string;
  name: string;
  type: number;
}

/**
 * Container for a parsed SatRec plus basic metadata.
 */
interface KeepTrackSatRec {
  name: string;
  type: number;
  satrec: satellite.SatRec;
}

/**
 * ECI position from satellite.js: an object { x, y, z } in kilometers
 */
interface EciPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Type guard for EciPosition
 */
function isEciPosition(obj: any): obj is EciPosition {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.x === 'number' &&
    typeof obj.y === 'number' &&
    typeof obj.z === 'number'
  );
}

/**
 * Utility: Calculate 3D Euclidean distance (km) between two ECI positions.
 */
function eciDistance(posA: EciPosition, posB: EciPosition): number {
  const dx = posA.x - posB.x;
  const dy = posA.y - posB.y;
  const dz = posA.z - posB.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * eciToGeodetic returns an object { longitude, latitude, height } in radians, except for height in km
 * We'll parse it to degrees below.
 */
interface EciGeodetic {
  longitude: number; // in radians
  latitude: number;  // in radians
  height: number;    // in km
}

/**
 * Convert the geodetic object to degrees for lat/lon, plus altitude in km
 */
function geodeticToDeg(geo: EciGeodetic) {
  const latDeg = satellite.degreesLat(geo.latitude);
  const lonDeg = satellite.degreesLong(geo.longitude);
  return {
    latitude: latDeg,
    longitude: lonDeg,
    altitude: geo.height,
  };
}

/**
 * Helper: format Date to ISO string.
 */
function toIsoString(date: Date): string {
  return date.toISOString();
}

/**
 * The collision service:
 * - Validates user TLE
 * - Fetches KeepTrack sats
 * - Propagates orbits over a time window
 * - Finds "risky points" (distance < thresholdKm)
 * - Logs them to .csv
 * - Returns final risk data
 */
@Injectable()
export class CollisionService {
  private readonly TLE_VALID_DAYS = 14;

  public async checkCollision(dto: CollisionCheckDto): Promise<any> {
    const {
      tle1,
      tle2,
      startTime,
      endTime,
      intervalMinutes = 10,
      thresholdKm = 1,
    } = dto;

    // 1) Validate the user's TLE
    let userSatrec: satellite.SatRec;
    try {
      userSatrec = satellite.twoline2satrec(tle1.trim(), tle2.trim());
    } catch (error) {
      throw new HttpException('Invalid TLE data provided.', HttpStatus.BAD_REQUEST);
    }

    // 2) Validate start/end times
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (end <= start) {
      throw new HttpException(
        'endTime must be strictly after startTime',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3) Enforce 14-day limit
    const maxEnd = new Date(start.getTime() + this.TLE_VALID_DAYS * 86400000);
    let clampedEnd = end;
    let isBeyond14Days = false;
    if (end.getTime() > maxEnd.getTime()) {
      clampedEnd = maxEnd;
      isBeyond14Days = true;
    }

    // 4) Fetch all satellites from KeepTrack
    let keepTrackSats: KeepTrackSatellite[] = [];
    try {
      const res = await fetch('https://api.keeptrack.space/v2/sats');
      if (!res.ok) {
        throw new HttpException(
          `Failed to fetch from KeepTrack: ${res.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new HttpException('Expected an array of satellites.', HttpStatus.BAD_REQUEST);
      }
      keepTrackSats = data;
    } catch (err) {
      throw new HttpException(
        `Error fetching KeepTrack: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Convert TLE => SatRec. Filter out invalid TLEs.
    const keepTrackSatRecs: KeepTrackSatRec[] = keepTrackSats
      .map((sat) => {
        try {
          return {
            name: sat.name,
            type: sat.type,
            satrec: satellite.twoline2satrec(sat.tle1, sat.tle2),
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is KeepTrackSatRec => !!item);

    // Prepare our times array
    const stepMillis = intervalMinutes * 60_000;
    const times: Date[] = [];
    for (let t = start.getTime(); t <= clampedEnd.getTime(); t += stepMillis) {
      times.push(new Date(t));
    }

    // We'll track each "risky point"
    interface RiskyPoint {
      timestamp: string;
      latitude: number;
      longitude: number;
      altitude: number;
      otherSatellite: string;
      distance: number;
    }
    const riskyPoints: RiskyPoint[] = [];

    // We'll also track how many comparisons we do, to compute a probability
    let totalChecks = 0;

    // 5) For each time step, propagate user satellite
    for (const time of times) {
      const userPosVel = satellite.propagate(userSatrec, time);
      if (!userPosVel.position || !isEciPosition(userPosVel.position)) {
        // Invalid or unpropagatable
        continue;
      }
      const userEciPos = userPosVel.position;

      // Compare with each keepTrack satellite
      for (const keepSat of keepTrackSatRecs) {
        const posVel = satellite.propagate(keepSat.satrec, time);
        if (!posVel.position || !isEciPosition(posVel.position)) {
          continue;
        }
        const otherEciPos = posVel.position;
        totalChecks++;

        // Distance check
        const distKm = eciDistance(userEciPos, otherEciPos);
        if (distKm <= thresholdKm) {
          // We have a "risky point"
          const gmst = satellite.gstime(time);
          // eciToGeodetic => { longitude, latitude, height }
          const geo = satellite.eciToGeodetic(userEciPos, gmst) as EciGeodetic;

          const { latitude, longitude, altitude } = geodeticToDeg(geo);

          riskyPoints.push({
            timestamp: toIsoString(time),
            latitude: +latitude.toFixed(4),
            longitude: +longitude.toFixed(4),
            altitude: +altitude.toFixed(2),
            otherSatellite: keepSat.name,
            distance: +distKm.toFixed(3),
          });
        }
      }
    }

    // 6) Compute collision probability
    const totalRisky = riskyPoints.length;
    const collisionProbability =
      totalChecks === 0 ? 0 : (totalRisky / totalChecks) * 100;

    // Determine risk level
    let riskLevel: 'low' | 'moderate' | 'high' = 'low';
    if (collisionProbability >= 5) {
      riskLevel = 'high';
    } else if (collisionProbability >= 1) {
      riskLevel = 'moderate';
    }

    // "validUntil" based on TLE reliability
    const validUntil = toIsoString(maxEnd);

    // 7) Write risky points to CSV
    const csvHeader = 'timestamp,latitude,longitude,altitude,otherSatellite\n';
    const csvLines = riskyPoints
      .map(
        (rp) =>
          `${rp.timestamp},${rp.latitude},${rp.longitude},${rp.altitude},${rp.otherSatellite}`,
      )
      .join('\n');

    try {
      fs.writeFileSync('collision_risk_points.csv', csvHeader + csvLines, 'utf8');
    } catch (err) {
      // Not mission-critical, but log
      console.error('Failed to write collision_risk_points.csv', err);
    }

    // 8) Prepare final response
    const response: any = {
      riskLevel,
      collisionProbability: +collisionProbability.toFixed(3),
      validUntil,
      warnings: [] as string[],
      riskyPoints,
    };

    if (isBeyond14Days) {
      response.warnings.push(
        'Predictions beyond 14 days are unreliable. Results were clamped to 14 days.',
      );
    }

    return response;
  }
}
