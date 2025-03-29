import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';
import { HeatmapDto } from './dto/heatmap.dto';

@ApiTags('satellites')
@Controller('satellites')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('heatmap')
  @ApiOperation({
    summary: 'Returns positions of satellites (optionally filtered by type) within a bounding box and altitude range at a given time',
  })
  async heatmap(@Body() heatmapDto: HeatmapDto) {
    return this.appService.heatmap(heatmapDto);
  }
}
