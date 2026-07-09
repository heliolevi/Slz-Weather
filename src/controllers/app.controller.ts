import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WeatherService } from '../services/weather.service';
import { WeatherAlert } from '../schemas/weather.schema';

@Controller()
export class AppController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  @ApiOperation({
    summary: 'Executa a análise crítica de São Luís e retorna o alerta climático atual do sistema de defesa civil.',
  })
  @ApiResponse({
    status: 200,
    description: 'Alerta climático atual gerado pelo motor de defesa civil.',
    type: WeatherAlert,
  })
  async getCurrentWeather(): Promise<WeatherAlert> {
    const alert = await this.weatherService.evaluateAndPersistCurrentWeather();
    return alert;
  }
}
