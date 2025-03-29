import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import fetch from 'cross-fetch';
import * as satellite from 'satellite.js';

import { KeepTrackSatellite } from './dto/keeptrack-satellite.dto';
import { HeatmapDto } from './dto/heatmap.dto';
import { ScheduleRequirementsDTO } from './dto/ScheduleRequirements.dto';

@Injectable()
export class AppService {
  EARTH_RADIUS = 6371;
  EARTH_ROTATION_SPEED = 1670 / 3600;
  ORBITAL_VELOCITY = 7.8;

  estimateLEOEntry(lat, lon, azimuth = 90, burnTime = 480, rocket_family) {
    let earthRotationOffset = 0;
    let distanceTraveled = 0;

    if (rocket_family === 'Falcon') {
      // Falcon 9 specific parameters
      const STAGE_1_BURN = 162; // seconds (approx)
      const STAGE_2_BURN = 348; // seconds (approx)
      const TOTAL_BURN_TIME = STAGE_1_BURN + STAGE_2_BURN;

      // Approximate how far the rocket moves east due to Earth's rotation during ascent
      const launchLatRad = lat * (Math.PI / 180);
      const rotationSpeedAtLat =
        this.EARTH_ROTATION_SPEED * Math.cos(launchLatRad);
      earthRotationOffset = rotationSpeedAtLat * TOTAL_BURN_TIME; // km moved due to Earth's rotation

      // Approximate rocket movement in the launch azimuth direction
      distanceTraveled = (this.ORBITAL_VELOCITY * TOTAL_BURN_TIME) / 2; // Average speed assumption
    } else if (rocket_family === 'Long March') {
      // Long March specific parameters (general estimate for LEO insertion)
      const STAGE_1_BURN = 170; // seconds (approx)
      const STAGE_2_BURN = 430; // seconds (approx)
      const TOTAL_BURN_TIME = STAGE_1_BURN + STAGE_2_BURN;

      // Approximate how far the rocket moves east due to Earth's rotation during ascent
      const launchLatRad = lat * (Math.PI / 180);
      const rotationSpeedAtLat =
        this.EARTH_ROTATION_SPEED * Math.cos(launchLatRad);
      earthRotationOffset = rotationSpeedAtLat * TOTAL_BURN_TIME; // km moved due to Earth's rotation

      // Approximate rocket movement in the launch azimuth direction
      distanceTraveled = (this.ORBITAL_VELOCITY * TOTAL_BURN_TIME) / 2; // Average speed assumption
    } else {
      const launchLatRad = lat * (Math.PI / 180);
      const rotationSpeedAtLat =
        this.EARTH_ROTATION_SPEED * Math.cos(launchLatRad);
      earthRotationOffset = rotationSpeedAtLat * burnTime; // km moved due to Earth's rotation

      distanceTraveled = (this.ORBITAL_VELOCITY * burnTime) / 2; // Average speed assumption
    }

    const lonOffset =
      ((earthRotationOffset + distanceTraveled) /
        (2 * Math.PI * this.EARTH_RADIUS)) *
      360;
    const newLon = (lon + lonOffset) % 360;

    return { latitude: lat, longitude: newLon };
  }

  async schedule({
    time_frame,
    orbit,
    point_of_interest,
  }: ScheduleRequirementsDTO) {
    if (orbit !== 'LEO') {
      throw new HttpException(
        'Only LEO orbit is supported for now',
        HttpStatus.BAD_REQUEST,
      );
    }

    const upcomingLaunches = await fetch(
      'https://ll.thespacedevs.com/2.0.0/launch/upcoming/',
    );
    if (!upcomingLaunches.ok) {
      throw new HttpException(
        `HTTP error! Status: ${upcomingLaunches.status}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const launches = await upcomingLaunches.json();
    if (!Array.isArray(launches)) {
      throw new HttpException(
        'Expected an array of launches',
        HttpStatus.BAD_REQUEST,
      );
    }

    const filtered = launches.filter((launch) => {
      if (launch.launch_service_provider.type !== 'Commercial') {
        return false;
      }

      if (!launch.orbit || launch.orbit.abbrev !== orbit) {
        return false;
      }

      const launchDate = new Date(
        (new Date(launch.window_start).getTime() +
          new Date(launch.window_start).getTime()) /
          2,
      );
      const startDate = new Date(time_frame.start);
      const endDate = new Date(time_frame.end);
      if (launchDate < startDate || launchDate > endDate) {
        return false;
      }

      if (point_of_interest) {
        const { latitude, longitude } = point_of_interest;
        const distance = Math.sqrt(
          Math.pow(latitude - launch.latitude, 2) +
            Math.pow(longitude - launch.longitude, 2),
        );
        if (distance > 1) {
          return false;
        }
      }
      return true;
    });

    return filtered.map((launch) => ({
      launch_pad: {
        name: launch.pad.name,
        latitude: launch.pad.latitude,
        longitude: launch.pad.longitude,
        country: launch.pad.location.country_code,
      },
      service_provider: launch.launch_service_provider.name,
      rocket: launch.rocket.configuration.name,
      name: launch.name,
      window_start: launch.window_start,
      window_end: launch.window_end,
    }));
  }
  /**
   * Heatmap logic:
   *  - Takes bounding region (lat/lon) + a timestamp
   *  - Optionally filters by altitude range (minAlt, maxAlt)
   *  - Optionally uses zoom to throttle results
   *  - Optionally filters by "types" array (only certain type codes)
   *  - Also has timeDirection (but not implemented in logic currently)
   *  - Fetches sats from KeepTrack
   *  - Propagates each to `timestamp`
   *  - Converts ECI -> LLA
   *  - Filters those within bounding box & altitude constraints
   *  - Returns GeoJSON FeatureCollection
   */
  async heatmap(heatmapDto: HeatmapDto) {
    const {
      minLat,
      maxLat,
      minLon,
      maxLon,
      timestamp,
      minAlt,
      maxAlt,
      zoom,
      types,
      timeDirection, // currently not used, but available
    } = heatmapDto;

    try {
      // 1. Fetch satellites from keeptrack
      const res = await fetch('https://api.keeptrack.space/v2/sats');
      if (!res.ok) {
        throw new HttpException(
          `HTTP error! Status: ${res.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const data: KeepTrackSatellite[] = await res.json();
      if (!Array.isArray(data)) {
        throw new HttpException(
          'Expected an array of satellites',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 2. Prepare date object from timestamp
      const targetDate = new Date(timestamp);

      // We'll store results in this array
      const results: Array<{
        name: string;
        lat: number;
        lon: number;
        alt: number;
      }> = [];

      // 3. Loop over each satellite from KeepTrack
      for (const sat of data) {
        try {
          // (Optional) Filter by "type" array if provided
          if (Array.isArray(types) && types.length > 0) {
            if (!types.includes(sat.type)) {
              // skip if this sat's type is not in the allowed set
              continue;
            }
          }

          // Convert TLE => satrec
          const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
          const posVel = satellite.propagate(satrec, targetDate);
          if (!posVel.position || posVel.position === true) {
            // skip invalid or unpropagatable TLE
            continue;
          }

          // 4. Convert ECI -> Geodetic
          const positionEci = posVel.position;
          const gmst = satellite.gstime(targetDate);
          const positionGd = satellite.eciToGeodetic(positionEci, gmst);

          // lat/lon in radians, alt in km
          const latDeg = satellite.degreesLat(positionGd.latitude);
          const lonDeg = satellite.degreesLong(positionGd.longitude);
          const altKm = positionGd.height;

          // 5. Filter by bounding box
          if (
            latDeg < minLat ||
            latDeg > maxLat ||
            lonDeg < minLon ||
            lonDeg > maxLon
          ) {
            continue;
          }

          // 6. Filter by altitude if minAlt or maxAlt are provided
          if (typeof minAlt === 'number' && altKm < minAlt) {
            continue;
          }
          if (typeof maxAlt === 'number' && altKm > maxAlt) {
            continue;
          }

          // 7. Optional zoom logic: skip satellites if zoom is too low
          if (zoom !== undefined && zoom < 3) {
            // Example: skip ~70% to lighten load
            if (Math.random() < 0.7) {
              continue;
            }
          }

          // 8. All filters passed => add to results
          results.push({
            name: sat.name,
            lat: parseFloat(latDeg.toFixed(4)),
            lon: parseFloat(lonDeg.toFixed(4)),
            alt: parseFloat(altKm.toFixed(2)),
          });
        } catch (error) {
          // skip any invalid TLE or other errors
        }
      }

      // 9. Convert results to GeoJSON FeatureCollection
      const geoJson = {
        type: 'FeatureCollection',
        crs: {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:OGC:1.3:CRS84',
          },
        },
        features: results.map((sat) => ({
          type: 'Feature',
          properties: {
            name: sat.name,
            alt: sat.alt,
          },
          geometry: {
            type: 'Point',
            coordinates: [sat.lon, sat.lat, sat.alt],
          },
        })),
      };

      return geoJson;
    } catch (err) {
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
