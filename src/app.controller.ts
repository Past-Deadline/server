import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';
import { HeatmapDto } from './dto/heatmap.dto';
import { ScheduleRequirementsDTO } from './dto/ScheduleRequirements.dto';
import { ScheduleService } from './schedule.service';

@ApiTags('satellites')
@Controller('v01')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly scheduleService: ScheduleService,
  ) {}

  @Post('heatmap')
  @ApiOperation({
    summary:
      'Returns positions of satellites (optionally filtered by type) within a bounding box and altitude range at a given time',
  })
  async heatmap(@Body() heatmapDto: HeatmapDto) {
    return this.appService.heatmap(heatmapDto);
  }

  @Post('schedule')
  @ApiOperation({
    summary:
      'Returns commercial launches of rockets to which you can attach your payload in ordre for it to be sent to space',
  })
  async schedule(@Body() requirements: ScheduleRequirementsDTO) {
    return this.scheduleService.schedule({ ...requirements });
  }
}
