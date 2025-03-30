import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export type Vec3 = [number, number, number];

export class TLE {
  @IsNotEmpty()
  @IsString()
  tle1: string;

  @IsNotEmpty()
  @IsString()
  tle2: string;
}

export class TImeFrame {
  @IsNotEmpty()
  @IsString()
  start: string;

  @IsNotEmpty()
  @IsString()
  end: string;
}

export class ScheduleRequirementsDTO {
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => TImeFrame)
  time_frame: TImeFrame;

  @IsNotEmpty()
  @IsString()
  orbit: string;

  @IsOptional()
  @IsArray()
  points_of_interest?: Array<Vec3>;
}

export class PointOfOrbiting {
  latitude: number;
  longitude: number;
  altitude?: number;
}
