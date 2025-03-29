import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';
import { HeatmapDto } from './dto/heatmap.dto';
import { ScheduleRequirementsDTO } from './dto/ScheduleRequirements.dto';
import { ScheduleService } from './schedule.service';

// Import our new DTO and Service
import { CollisionCheckDto } from './dto/collision-check.dto';
import { CollisionService } from './collision.service';

@ApiTags('satellites')
@Controller('v01')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly scheduleService: ScheduleService,
    private readonly collisionService: CollisionService,
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
      'Returns commercial launches of rockets for sending payloads to LEO orbit',
  })
  async schedule(@Body() requirements: ScheduleRequirementsDTO) {
    return this.scheduleService.schedule({ ...requirements });
  }

  /**
   * New endpoint: Collision-check
   */
  @Post('collision-check')
  @ApiOperation({
    summary: 'Estimates collision risk for a user-defined satellite TLE within a future time window',
  })
  public async collisionCheck(
    @Body() collisionCheckDto: CollisionCheckDto,
  ): Promise<any> {
    return this.collisionService.checkCollision(collisionCheckDto);
  }
}
