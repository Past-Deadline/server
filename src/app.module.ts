import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleService } from './schedule.service';
import { CollisionService } from './collision.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, ScheduleService, CollisionService],
})
export class AppModule {}
