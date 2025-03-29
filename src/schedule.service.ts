import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  PointOfInterest,
  PointOfOrbiting,
  ScheduleRequirementsDTO,
  TImeFrame,
} from './dto/ScheduleRequirements.dto';

@Injectable()
export class ScheduleService {
  EARTH_RADIUS = 6371;
  EARTH_ROTATION_SPEED = 1670 / 3600;
  ORBITAL_VELOCITY = 7.12;

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

  async calculateSurvivalRate(
    points_of_orbiting: PointOfOrbiting[],
    point_of_interest?: PointOfInterest,
  ) {
    if (!point_of_interest) return null;

    return points_of_orbiting.map((orbit) => {
      if (!orbit.altitude) orbit.altitude = 750; // Default altitude for LEO
      const { latitude: lat, longitude: lng, altitude: alt } = orbit;

      return orbit;
    });
  }

  async schedule({
    time_frame,
    orbit,
    point_of_interest,
  }: ScheduleRequirementsDTO) {
    const launches = await this.requestLaunches(orbit);

    const filtered = await this.getAdeqateLaunches(launches, orbit, time_frame);

    const points_of_orbiting = filtered.map(
      (launch): PointOfOrbiting => ({
        latitude: launch.pad.location.latitude,
        longitude: launch.pad.location.longitude,
        altitude: 750, // Default altitude for LEO
      }),
    );

    const calculated = await this.calculateSurvivalRate(
      points_of_orbiting,
      point_of_interest,
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
