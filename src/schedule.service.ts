import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Vector3 } from 'three';
import * as satellite from 'satellite.js';
import { pi, sqrt, cos } from 'mathjs';
import {
  TLE,
  PointOfOrbiting,
  ScheduleRequirementsDTO,
  TImeFrame,
  PointOfInterest,
} from './dto/ScheduleRequirements.dto';
import { OrbitService } from './orbit.service';

@Injectable()
export class ScheduleService {
  EARTH_RADIUS = 6371;
  EARTH_ROTATION_SPEED = 1670 / 3600;
  ORBITAL_VELOCITY = 7.12;

  INTERVAL_DAYS = 3;
  TOTAL_MONTHS = 6;
  SAMPLES_PER_ORBIT = 500;
  INTERSECTION_THRESHOLD_KM = 3;

  constructor(private readonly orbitService: OrbitService) {}

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
      if (position) {
        orbitPoints.push(position);
      }
    }

    return orbitPoints;
  }

  euclideanDistanceKm(
    pos1: satellite.EciVec3<any>,
    pos2: satellite.EciVec3<any>,
  ): number {
    const dx = pos1.x! - pos2.x!;
    const dy = pos1.y! - pos2.y!;
    const dz = pos1.z! - pos2.z!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  countGeometricIntersections(
    pathA: satellite.EciVec3<any>[],
    pathB: satellite.EciVec3<any>[],
    thresholdKm: number,
  ): number {
    let count = 0;
    for (const pointA of pathA) {
      for (const pointB of pathB) {
        const dist = this.euclideanDistanceKm(pointA, pointB);
        if (dist <= thresholdKm) {
          count++;
        }
      }
    }
    return count;
  }

  async countInterceptions(now: Date, tle_a: TLE, tle_b: TLE) {
    const end = new Date(now.getTime());
    end.setMonth(end.getMonth() + this.TOTAL_MONTHS);

    let totalIntersections = 0;

    for (
      let segmentStart = new Date(now);
      segmentStart < end;
      segmentStart.setDate(segmentStart.getDate() + this.INTERVAL_DAYS)
    ) {
      console.log(
        `\n🌀 Checking static orbits for window starting ${segmentStart.toISOString()}`,
      );

      const pointsA = this.getOrbitPoints(
        tle_a.tle1,
        tle_a.tle2,
        segmentStart,
        this.SAMPLES_PER_ORBIT,
      );
      const pointsB = this.getOrbitPoints(
        tle_b.tle1,
        tle_b.tle2,
        segmentStart,
        this.SAMPLES_PER_ORBIT,
      );

      const segmentIntersections = this.countGeometricIntersections(
        pointsA,
        pointsB,
        this.INTERSECTION_THRESHOLD_KM,
      );
      console.log(
        `  ➤ Found ${segmentIntersections} intersection point(s) in 3D (within ${this.INTERSECTION_THRESHOLD_KM} km)`,
      );

      totalIntersections += segmentIntersections;
    }

    console.log(
      `\n✅ Total geometric intersections (over ${this.TOTAL_MONTHS} months): ${totalIntersections}`,
    );
  }

  estimateLEOEntry(lat, lon, rocket_family, azimuth = 90, burnTime = 480) {
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
          new Date(launch.window_start).getTime()) /
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

  async calculateInterceptionsForAllObjects(
    opts_for_orbiting: Array<{
      time: Date;
      point: TLE;
    }>,
    satelite?: TLE,
  ) {
    if (!satelite) return null;

    return opts_for_orbiting.map((opt) => {
      const point = opt.point;

      const interceptions = this.countInterceptions(opt.time, point, satelite);

      return point;
    });
  }

  async calculateTleOfSatelite(
    poi1: PointOfInterest,
    poi2: PointOfInterest,
    date_of_entering: string,
    speed: number = 7.48,
  ): Promise<TLE> {
    // Epoch (timestamp for pos1)
    const t1 = new Date(date_of_entering);

    // === PROCESSING ===

    // Get direction unit vector from pos1 to pos2
    const direction = new Vector3().subVectors(poi1, poi2).normalize();

    // Scale direction by known speed to get velocity vector
    const velocity = direction.multiplyScalar(speed);

    const tiles = this.orbitService.generateTleFromState(
      direction,
      velocity,
      t1,
      99999, // satellite number
      'U', // classification
      'MY-SAT', // name
    );

    return {
      tle1: tiles.line1,
      tle2: tiles.line2,
    };
  }

  async schedule({
    time_frame,
    orbit,
    points_of_interest,
  }: ScheduleRequirementsDTO) {
    const launches = await this.requestLaunches(orbit);

    const filtered = await this.getAdeqateLaunches(launches, orbit, time_frame);

    const points_of_orbiting = filtered.map(
      (
        launch,
      ): {
        time: Date;
        point: TLE;
      } => ({
        time: new Date(
          (new Date(launch.window_start).getTime() +
            new Date(launch.window_start).getTime()) /
            2,
        ),
        point: {
          tle1: '1 00012U 59001B   25087.80297988  .00000771  00000+0  42819-3 0  9992',
          tle2: '2 00012  32.9143 353.8702 1651680 267.9557  73.1899 11.47653321480128',
        },
      }),
    );

    if (
      points_of_interest === undefined ||
      points_of_interest[0] === undefined ||
      points_of_interest[1] === undefined
    ) {
      throw new HttpException(
        'Expecting two points of interest',
        HttpStatus.BAD_REQUEST,
      );
    }

    const satelite = await this.calculateTleOfSatelite(
      points_of_interest[0],
      points_of_interest[1],
      time_frame.start,
    );

    const calculated = await this.calculateInterceptionsForAllObjects(
      points_of_orbiting,
      satelite,
    );

    if (!calculated) {
      throw new HttpException(
        'Brother provide me a target point',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      count: calculated.length,
      adequete_launches: calculated,
    };
  }
}
