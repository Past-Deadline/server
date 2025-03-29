import { ApiProperty } from '@nestjs/swagger';

/** Represents a single debris position */
export class DebrisData {
  @ApiProperty({ example: 'COSMOS 2251 DEB' })
  name: string;

  @ApiProperty({ example: 1234.56 })
  x: number;

  @ApiProperty({ example: 7890.12 })
  y: number;

  @ApiProperty({ example: 3456.78 })
  z: number;
}

/** The final response object from /satellites/debris */
export class DebrisResponse {
  @ApiProperty({
    example: '🛰️ Космически отпадък след 7 дни в избрания диапазон: 5',
    description: 'Message summarizing the result count',
  })
  message: string;

  @ApiProperty({ type: [DebrisData], description: 'Array of debris positions' })
  data: DebrisData[];
}
