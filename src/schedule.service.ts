import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as satellite from 'satellite.js';
import { cross, norm, multiply, subtract, add, dot } from 'mathjs';
import {
  ScheduleRequirementsDTO,
  TImeFrame,
  Vec3,
} from './dto/ScheduleRequirements.dto';
import fetch from 'cross-fetch';
import { KeepTrackSatellite } from './dto/keeptrack-satellite.dto';

@Injectable()
export class ScheduleService {
  EARTH_RADIUS = 6371;
  EARTH_ROTATION_SPEED = 1670 / 3600;
  ORBITAL_VELOCITY = 7.12;
  ALTITUDE_AT_ENTRY = 750;

  INTERVAL_DAYS = 3;
  TOTAL_MONTHS = 6;
  SAMPLES_PER_ORBIT = 16;
  TRESHOLD_KM = 30;

  // Normalize a vector
  normalize(v: Vec3): Vec3 {
    const length = norm(v) as any;
    if (!length || length === 0) throw new Error('Zero-length vector');
    return multiply(v, 1 / length) as Vec3;
  }

  getOrbitPoints(
    tleLine1: string,
    tleLine2: string,
    startDate: Date,
    samples: number,
  ): satellite.EciVec3<number>[] {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const periodMinutes = 1440 / satrec.no; // orbital period in minutes
    const orbitPoints: satellite.EciVec3<number>[] = [];

    for (let i = 0; i < samples; i++) {
      const timeOffsetMin = (periodMinutes / samples) * i;
      const date = new Date(startDate.getTime() + timeOffsetMin * 60 * 1000);
      const { position } = satellite.propagate(satrec, date);
      if (!position || position === true) {
        continue; // skip invalid positions
      }
      orbitPoints.push(position);
    }

    return orbitPoints;
  }

  estimateLEOEntry(lat, lon, rocket_family, azimuth = 90, burnTime = 480) {
    lon = parseFloat(lon);
    let earthRotationOffset = 0;
    let distanceTraveled = 0;

    if (rocket_family === 'Falcon') {
      // Falcon 9 parameters
      const STAGE_1_BURN = 162; // seconds
      const STAGE_2_BURN = 348; // seconds
      const TOTAL_BURN_TIME = STAGE_1_BURN + STAGE_2_BURN;

      // Earth's rotation offset
      const launchLatRad = lat * (Math.PI / 180);
      const rotationSpeedAtLat =
        this.EARTH_ROTATION_SPEED * Math.cos(launchLatRad);
      earthRotationOffset = rotationSpeedAtLat * TOTAL_BURN_TIME; // km

      // Approx rocket movement
      distanceTraveled = (this.ORBITAL_VELOCITY * TOTAL_BURN_TIME) / 2;
    } else if (rocket_family === 'Long March') {
      // Similar approach
      const STAGE_1_BURN = 170;
      const STAGE_2_BURN = 430;
      const TOTAL_BURN_TIME = STAGE_1_BURN + STAGE_2_BURN;

      const launchLatRad = lat * (Math.PI / 180);
      const rotationSpeedAtLat =
        this.EARTH_ROTATION_SPEED * Math.cos(launchLatRad);
      earthRotationOffset = rotationSpeedAtLat * TOTAL_BURN_TIME;
      distanceTraveled = (this.ORBITAL_VELOCITY * TOTAL_BURN_TIME) / 2;
    } else {
      // Generic fallback
      const launchLatRad = lat * (Math.PI / 180);
      const rotationSpeedAtLat =
        this.EARTH_ROTATION_SPEED * Math.cos(launchLatRad);
      earthRotationOffset = rotationSpeedAtLat * burnTime;
      distanceTraveled = (this.ORBITAL_VELOCITY * burnTime) / 2;
    }

    const lonOffset =
      ((earthRotationOffset + distanceTraveled) /
        (2 * Math.PI * this.EARTH_RADIUS)) *
      360;
    const newLon = (lon + lonOffset) % 360;

    return { latitude: lat, longitude: newLon };
  }

  async requestLaunches(orbit: string) {
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
    const launchesResp = await upcomingLaunches.json();
    const launches = launchesResp.results;
    if (!Array.isArray(launches)) {
      throw new HttpException(
        'Expected an array of launches',
        HttpStatus.BAD_REQUEST,
      );
    }
    return launches;
  }

  async getAdeqateLaunches(
    launches: any[],
    orbit: string,
    time_frame: TImeFrame,
  ) {
    return launches.filter((launch) => {
      if (launch.launch_service_provider.type !== 'Commercial') {
        return false;
      }

      if (!launch.mission.orbit || launch.mission.orbit.abbrev !== orbit) {
        return false;
      }

      const launchDate = new Date(
        (new Date(launch.window_start).getTime() +
          new Date(launch.window_end).getTime()) /
          2,
      );
      const startDate = new Date(time_frame.start);
      const endDate = new Date(time_frame.end);
      if (launchDate < startDate || launchDate > endDate) {
        return false;
      }

      return true;
    });
  }

  async calculateInterceptionsForAll(
    opts_for_orbiting: Array<{
      time: Date;
      point: Vec3;
      orbit: Vec3[];
      launch: any;
    }>,
  ): Promise<
    Array<{
      point: Vec3;
      launch: any;
      interceptions: Array<{
        sat: KeepTrackSatellite;
        interceptions: { poi: Vec3; distance: number }[];
      }>;
      interceptions_count: number;
    }>
  > {
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

    const objects: Array<{ satelite: KeepTrackSatellite; orbit: Vec3[] }> =
      data.map((sat) => ({
        satelite: sat,
        orbit: this.generateEllipseFromTLE(
          sat.tle1,
          sat.tle2,
          this.SAMPLES_PER_ORBIT,
        ),
      }));

    return opts_for_orbiting.map((opt) => {
      const point = opt.point;
      const intercepted: Array<{
        sat: KeepTrackSatellite;
        interceptions: { poi: Vec3; distance: number }[];
      }> = [];
      for (const obj of objects) {
        const interceptions = this.checkOrbitIntersection(opt.orbit, obj.orbit);
        if (interceptions.length > 0) {
          intercepted.push({ sat: obj.satelite, interceptions });
        }
      }

      console.log('The intercepted for this point are: ');
      console.log(intercepted);

      return {
        point: point,
        launch: {
          window_start: opt.launch.window_start,
          window_end: opt.launch.window_end,
          rocket: opt.launch.rocket.configuration.family,
          name: opt.launch.name,
          service_provider: opt.launch.launch_service_provider.name,
          rocket_anme: opt.launch.rocket.configuration.name,
          country: opt.launch.pad.location.country_code,
          pad: {
            latitude: opt.launch.pad.latitude,
            longitude: opt.launch.pad.longitude,
          },
        },
        interceptions: intercepted,
        interceptions_count: intercepted.length,
      };
    });
  }

  checkOrbitIntersection(
    orbit1: Vec3[],
    orbit2: Vec3[],
  ): { poi: Vec3; distance: number }[] {
    let count = 0;
    const interceptions: { poi: Vec3; distance: number }[] = [];
    for (const p1 of orbit1) {
      for (const p2 of orbit2) {
        const d = norm(subtract(p1, p2)) as number;
        if (d < this.TRESHOLD_KM) {
          interceptions.push({
            poi: p2,
            distance: d,
          });
          if (count > 1) break;
          count++;
        }
        if (count > 1) break;
      }
    }
    if (count > 0) console.log(count + ' interceptions found!');
    return interceptions;
  }

  generateEllipseFromTLE(
    tleLine1: string,
    tleLine2: string,
    sampleCount: number,
  ): Vec3[] {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const startTime = new Date();
    const periodSeconds = 86400 / satrec.no; // satrec.no = mean motion (rev/day)

    const points: Vec3[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const time = new Date(
        startTime.getTime() + (i * periodSeconds * 1000) / sampleCount,
      );
      const positionVelocity = satellite.propagate(satrec, time);
      const positionEci = positionVelocity.position;

      if (!positionEci || positionEci === true) {
        continue; // skip invalid positions
      }

      if (positionEci) {
        points.push([positionEci.x, positionEci.y, positionEci.z]);
      }
    }

    return points;
  }

  generateEllipseFromTwoECI(
    r1: Vec3,
    r2: Vec3,
    velocity: number,
    sampleCount: number,
  ): Vec3[] {
    const h = cross(r1, r2) as Vec3;
    const hUnit = this.normalize(h);

    const vDirection = this.normalize(cross(h, r1) as Vec3);
    const v = multiply(vDirection, velocity) as unknown as Vec3;

    const r1Mag = norm(r1) as number;
    const vMag = norm(v) as number;
    const mu = 398600.4418;

    //@ts-ignore
    const energy = vMag ** 2 / 2 - mu / r1Mag;
    const a = -mu / (2 * energy);
    const hMag = norm(cross(r1, v));
    //@ts-ignore
    const e = Math.sqrt(1 - hMag ** 2 / (a * mu));

    const eccentricityVector = subtract(
      multiply(v, vMag ** 2 - mu / r1Mag),
      multiply(r1, dot(r1, v) / r1Mag),
    ) as Vec3;

    const eUnit = this.normalize(eccentricityVector);
    const periapsis = multiply(eUnit, a * (1 - e)) as Vec3;

    const ref1 = this.normalize(periapsis);
    const ref2 = this.normalize(cross(hUnit, ref1) as Vec3);

    const points: Vec3[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const theta = (2 * Math.PI * i) / sampleCount;
      const r = (a * (1 - e ** 2)) / (1 + e * Math.cos(theta));
      const point = add(
        multiply(ref1, r * Math.cos(theta)),
        multiply(ref2, r * Math.sin(theta)),
      ) as Vec3;
      points.push(point);
    }
    return points;
  }

  geodeticToEci(
    latDeg: number,
    lonDeg: number,
    altKm: number,
    date: Date,
  ): Vec3 {
    // Convert degrees to radians
    const latRad = satellite.degreesToRadians(latDeg);
    const lonRad = satellite.degreesToRadians(lonDeg);

    // Convert to ECF (Earth-Centered Fixed)
    const positionEcf = satellite.geodeticToEcf({
      latitude: latRad,
      longitude: lonRad,
      height: altKm,
    });

    // Compute Greenwich Mean Sidereal Time at given date
    const gmst = satellite.gstime(date);

    // Convert ECF to ECI
    const positionEci = satellite.ecfToEci(positionEcf, gmst);

    return [positionEci.x, positionEci.y, positionEci.z];
  }

  async schedule({
    time_frame,
    orbit,
    points_of_interest,
  }: ScheduleRequirementsDTO) {
    const launches = await this.requestLaunches(orbit);
    const filtered = await this.getAdeqateLaunches(launches, orbit, time_frame);

    if (!points_of_interest || points_of_interest?.length < 1) {
      throw new HttpException(
        'Expecting at least one point of interest',
        HttpStatus.BAD_REQUEST,
      );
    }

    const points_of_orbiting = filtered.map(
      (launch): { time: Date; point: Vec3; orbit: Vec3[]; launch: any } => {
        const geoedicPoe = this.estimateLEOEntry(
          launch.pad.latitude,
          launch.pad.longitude,
          launch.rocket.configuration.family,
        );

        const poe = this.geodeticToEci(
          geoedicPoe.latitude,
          geoedicPoe.longitude,
          this.ALTITUDE_AT_ENTRY,
          new Date(
            (new Date(launch.window_start).getTime() +
              new Date(launch.window_end).getTime()) /
              2,
          ),
        );
        const orbit = this.generateEllipseFromTwoECI(
          poe,
          points_of_interest![0],
          this.ORBITAL_VELOCITY,
          Math.round(this.SAMPLES_PER_ORBIT * 1.5),
        );
        return {
          time: new Date(
            (new Date(launch.window_start).getTime() +
              new Date(launch.window_end).getTime()) /
              2,
          ),
          point: poe,
          orbit,
          launch: launch,
        };
      },
    );

    const calculated =
      await this.calculateInterceptionsForAll(points_of_orbiting);

    if (!calculated) {
      throw new HttpException(
        'Brother, provide me a target point',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      count: calculated.length,
      adequete_launches: calculated,
    };
  }
}
