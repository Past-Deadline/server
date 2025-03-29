import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CollisionCheckDto {
  @ApiProperty({
    example: '1 25544U 98067A   23087.53864583  .00006480  00000-0  12455-3 0  9993',
    description: 'First line of the TLE for the user satellite',
  })
  @IsString()
  @IsNotEmpty()
  tle1: string;

  @ApiProperty({
    example: '2 25544  51.6432 242.6212 0007114  53.4827 306.6181 15.50096253393068',
    description: 'Second line of the TLE for the user satellite',
  })
  @IsString()
  @IsNotEmpty()
  tle2: string;

  @ApiProperty({
    example: '2026-01-01T00:00:00Z',
    description: 'Start of the simulation time window (ISO8601)',
  })
  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    example: '2026-01-02T00:00:00Z',
    description:
      'End of the simulation time window (ISO8601). Must not exceed ~14 days from startTime',
  })
  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @ApiProperty({
    example: 10,
    description:
      'Time step (minutes) for the propagation loop. Defaults to 10 minutes.',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  intervalMinutes?: number;

  @ApiProperty({
    example: 1,
    description:
      'Proximity threshold in kilometers. If distance < threshold, we log a risky point. Defaults to 1 km.',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  thresholdKm?: number;
}
