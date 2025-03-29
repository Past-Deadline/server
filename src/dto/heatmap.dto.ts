import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class HeatmapDto {
  @ApiProperty({
    example: -10,
    description: 'Minimum latitude of the bounding box',
  })
  @IsNumber()
  @IsNotEmpty()
  minLat: number;

  @ApiProperty({
    example: 10,
    description: 'Maximum latitude of the bounding box',
  })
  @IsNumber()
  @IsNotEmpty()
  maxLat: number;

  @ApiProperty({
    example: -20,
    description: 'Minimum longitude of the bounding box',
  })
  @IsNumber()
  @IsNotEmpty()
  minLon: number;

  @ApiProperty({
    example: 20,
    description: 'Maximum longitude of the bounding box',
  })
  @IsNumber()
  @IsNotEmpty()
  maxLon: number;

  @ApiProperty({
    example: '2026-01-01T00:00:00Z',
    description: 'ISO8601 timestamp for which you want positions',
  })
  @IsString()
  @IsNotEmpty()
  timestamp: string;

  @ApiProperty({
    example: 0,
    description: 'Minimum altitude (km) to include',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  minAlt?: number;

  @ApiProperty({
    example: 2000,
    description: 'Maximum altitude (km) to include',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  maxAlt?: number;

  @ApiProperty({
    example: 5,
    description: 'Zoom level from the front-end (optional)',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  zoom?: number;

  @ApiProperty({
    example: 'forward',
    description: 'Optional direction if you want to move forward/back in time',
    required: false,
  })
  @IsString()
  @IsOptional()
  timeDirection?: string;

  @ApiProperty({
    type: [Number],
    required: false,
    description: 'Array of satellite "type" codes to include, e.g. [3] for debris or [0,3] for both',
    example: [0, 3],
  })
  @IsArray()
  @IsOptional()
  @IsNumber({}, { each: true })
  types?: number[];
}
