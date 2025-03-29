import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { DebrisResponse } from './dto/debris-response.dto';

@ApiTags('satellites')
@Controller('satellites')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('debris')
  @ApiOperation({
    summary: 'Retrieves debris data 7 days in the future from keeptrack.space',
  })
  async getDebris(): Promise<DebrisResponse> {
    return this.appService.getDebris();
  }
}
