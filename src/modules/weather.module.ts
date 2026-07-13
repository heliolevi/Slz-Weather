import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { WeatherController } from '../controllers/weather.controller';
import { AlertEngineService } from '../services/alert-engine.service';
import { SmsService } from '../services/sms.service';
import { TaskService } from '../services/task.service';
import { WeatherCron } from '../services/weather.cron';
import { WeatherService } from '../services/weather.service';
import { WeatherAlert, WeatherAlertSchema } from '../schemas/weather.schema';
import { AlertEngineState, AlertEngineStateSchema } from '../schemas/alert-engine-state.schema';
import { SeismicSensorState, SeismicSensorStateSchema } from '../schemas/seismic-sensor-state.schema';

@Module({
  imports: [
    HttpModule.register({
      timeout: 8000,
      maxRedirects: 3,
      // User-Agent explícito evita bloqueios de alguns provedores/WAFs que rejeitam requisições sem esse header.
      headers: { 'User-Agent': 'SaoLuisWeatherWatch/1.0 (+defesa-civil-slz)' },
    }),
    ScheduleModule,
    MongooseModule.forFeature([
      { name: WeatherAlert.name, schema: WeatherAlertSchema },
      { name: AlertEngineState.name, schema: AlertEngineStateSchema },
      { name: SeismicSensorState.name, schema: SeismicSensorStateSchema },
    ]),
  ],
  controllers: [WeatherController],
  providers: [WeatherService, WeatherCron, AlertEngineService, SmsService, TaskService],
  exports: [WeatherService],
})
export class WeatherModule {}
