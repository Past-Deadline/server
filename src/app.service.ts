import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import fetch from 'cross-fetch';
import * as satellite from 'satellite.js';

import { KeepTrackSatellite } from './dto/keeptrack-satellite.dto';
import { DebrisData, DebrisResponse } from './dto/debris-response.dto';

@Injectable()
export class AppService {
  async getDebris(): Promise<DebrisResponse> {
    try {
      // 1. Fetch data from keeptrack.space
      const res = await fetch('https://api.keeptrack.space/v2/sats');
      if (!res.ok) {
        throw new HttpException(
          `HTTP error! Status: ${res.status}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // 2. Parse the response as an array of KeepTrackSatellite
      const data: KeepTrackSatellite[] = await res.json();

      if (!Array.isArray(data)) {
        throw new HttpException(
          'Expected an array of satellites',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 3. Date 7 days in the future
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const filtered: DebrisData[] = [];

      // 4. Iterate over the array
      for (const obj of data) {
        const { tle1, tle2, name, type } = obj;

        // Only type == 3 => debris
        if (type !== 3) {
          continue;
        }

        try {
          // Convert TLE lines to satellite record
          const satrec = satellite.twoline2satrec(tle1, tle2);

          // Propagate for the future date
          const { position, velocity } = satellite.propagate(satrec, futureDate);

          // If position is boolean, skip
          if (position === true || position === false) {
            continue;
          }

          // Now `position` is guaranteed to be EciVec3<number>
          const { x, y, z } = position;


          filtered.push({
            name,
            x: parseFloat(x.toFixed(2)),
            y: parseFloat(y.toFixed(2)),
            z: parseFloat(z.toFixed(2)),
          });
        } catch (err) {
          // If TLE invalid or other errors, skip
        }
      }

      // 5. Construct final response
      const message = `🛰️ Космически отпадък след 7 дни: ${filtered.length} обекта (тип 3)`;
      return { message, data: filtered };
    } catch (err) {
      // 6. Rethrow as 500 internal if unknown
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
