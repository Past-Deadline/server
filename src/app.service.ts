import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import fetch from 'cross-fetch';
import * as satellite from 'satellite.js';

import { KeepTrackSatellite } from './dto/keeptrack-satellite.dto';
import { HeatmapDto } from './dto/heatmap.dto';
import { ScheduleRequirementsDTO } from './dto/ScheduleRequirements.dto';
import { count } from 'console';

@Injectable()
export class AppService {
  /**
   * Heatmap logic:
   *  - Takes optional bounding region (lat/lon).
   *  - minAlt, maxAlt са задължителни.
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

          // 5. Filter by bounding box only if provided
          if (minLat !== undefined && latDeg < minLat) continue;
          if (maxLat !== undefined && latDeg > maxLat) continue;
          if (minLon !== undefined && lonDeg < minLon) continue;
          if (maxLon !== undefined && lonDeg > maxLon) continue;

          // 6. Filter by altitude (now required)
          if (altKm < minAlt || altKm > maxAlt) {
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
