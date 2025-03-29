import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PointOfInterest {
  @IsNotEmpty()
  @IsNumberString()
  latitude: string;

  @IsNotEmpty()
  @IsNumberString()
  longitude: string;
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
  @Type(() => PointOfInterest)
  point_of_interest?: PointOfInterest;
}

export class PointOfOrbiting {
  latitude: number;
  longitude: number;
  altitude?: number;
}
