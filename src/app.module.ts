import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleService } from './schedule.service';
import { OrbitService } from './orbit.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, ScheduleService, OrbitService],
  exports: [OrbitService],
})
export class AppModule {}
