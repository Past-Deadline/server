import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PointOfInterest {
  @IsNumberString()
  x: number;
  @IsNumberString()
  y: number;
  @IsNumberString()
  z: number;
}

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
  @ValidateNested()
  @Type(() => Array<PointOfInterest>)
  points_of_interest?: Array<PointOfInterest>;
}

export class PointOfOrbiting {
  latitude: number;
  longitude: number;
  altitude?: number;
}
