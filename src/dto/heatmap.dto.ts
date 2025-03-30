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
    required: false,
  })
  @IsNumber()
  @IsOptional()
  minLat?: number;

  @ApiProperty({
    example: 10,
    description: 'Maximum latitude of the bounding box',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  maxLat?: number;

  @ApiProperty({
    example: -20,
    description: 'Minimum longitude of the bounding box',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  minLon?: number;

  @ApiProperty({
    example: 20,
    description: 'Maximum longitude of the bounding box',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  maxLon?: number;

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
    required: true,
  })
  @IsNumber()
  @IsNotEmpty()
  minAlt: number;

  @ApiProperty({
    example: 2000,
    description: 'Maximum altitude (km) to include',
    required: true,
  })
  @IsNumber()
  @IsNotEmpty()
  maxAlt: number;

  @ApiProperty({
    type: [String],
    required: false,
    description:
      'Array of satellite "type" codes to include. Valid values: 1 (Active), 2 (Rocket Bodies), 3 (Space Debris) and "undefined" (Unclassified).',
    example: [1, "undefined"],
  })
  @IsArray()
  @IsOptional()
  // Поддържа както числови стойности, така и стринг "undefined"
  types?: (number | string)[];
}
