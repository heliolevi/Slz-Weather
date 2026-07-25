import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WeatherService } from '../services/weather.service';
import { WeatherAlert } from '../schemas/weather.schema';
import { LIMITE_CLIMA_ATUAL } from './weather.controller';

@Controller()
export class AppController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  @Throttle({ default: LIMITE_CLIMA_ATUAL })
  @ApiOperation({
    summary: 'Executa a análise crítica de São Luís e retorna o alerta climático atual do sistema de defesa civil.',
  })
  @ApiResponse({
    status: 200,
    description: 'Alerta climático atual gerado pelo motor de defesa civil.',
    type: WeatherAlert,
  })
  @ApiResponse({ status: 429, description: 'Limite de requisições excedido (10 por minuto por IP).' })
  async getCurrentWeather(): Promise<WeatherAlert> {
    const alert = await this.weatherService.evaluateAndPersistCurrentWeather();
    return alert;
  }
}
