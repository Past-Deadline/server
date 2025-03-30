import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import fetch from 'cross-fetch';
import * as satellite from 'satellite.js';

import { KeepTrackSatellite } from './dto/keeptrack-satellite.dto';
import { HeatmapDto } from './dto/heatmap.dto';
import { ScheduleRequirementsDTO } from './dto/ScheduleRequirements.dto';

@Injectable()
export class AppService {
  /**
   * Heatmap logic:
   *  - Приема опционално bounding region (lat/lon).
   *  - minAlt и maxAlt са задължителни.
   *  - Изтегля сателитите от KeepTrack
   *  - Пропагира всеки сателит до посочения timestamp
   *  - Конвертира от ECI към LLA
   *  - Филтрира по bounding box, altitude и по тип (ако е зададен)
   *  - Връща GeoJSON FeatureCollection
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
      types,
    } = heatmapDto;

    try {
      // 1. Изтегля сателитите от KeepTrack
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

      // 2. Създаваме обект Date от timestamp-а
      const targetDate = new Date(timestamp);

      // Масив за резултатите
      const results: Array<{
        name: string;
        lat: number;
        lon: number;
        alt: number;
      }> = [];

      // 3. Обхождаме всеки сателит
      for (const sat of data) {
        try {
          // Филтриране по тип, ако е зададен
          if (Array.isArray(types) && types.length > 0) {
            const allowedTypes = new Set(types);
            // Ако сателитът е класифициран (1, 2 или 3)
            if (sat.type === 1 || sat.type === 2 || sat.type === 3) {
              if (!allowedTypes.has(sat.type)) {
                continue;
              }
            } else {
              // За некласифицирани обекти (тип, различен от 1,2,3)
              if (!allowedTypes.has("undefined")) {
                continue;
              }
            }
          }

          // Конвертиране на TLE към satrec
          const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
          const posVel = satellite.propagate(satrec, targetDate);
          if (!posVel.position || posVel.position === true) {
            continue;
          }

          // Преобразуване от ECI към геодезически координати
          const positionEci = posVel.position;
          const gmst = satellite.gstime(targetDate);
          const positionGd = satellite.eciToGeodetic(positionEci, gmst);

          const latDeg = satellite.degreesLat(positionGd.latitude);
          const lonDeg = satellite.degreesLong(positionGd.longitude);
          const altKm = positionGd.height;

          // Филтриране по bounding box, ако е зададен
          if (minLat !== undefined && latDeg < minLat) continue;
          if (maxLat !== undefined && latDeg > maxLat) continue;
          if (minLon !== undefined && lonDeg < minLon) continue;
          if (maxLon !== undefined && lonDeg > maxLon) continue;

          // Филтриране по височина
          if (altKm < minAlt || altKm > maxAlt) {
            continue;
          }

          // Добавяне към резултатите
          results.push({
            name: sat.name,
            lat: parseFloat(latDeg.toFixed(4)),
            lon: parseFloat(lonDeg.toFixed(4)),
            alt: parseFloat(altKm.toFixed(2)),
          });
        } catch (error) {
          // Пропускаме сателити с невалидни TLE или други грешки
        }
      }

      // Преобразуваме резултатите в GeoJSON FeatureCollection
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
