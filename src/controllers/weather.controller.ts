import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WeatherService, RainTrendResult } from '../services/weather.service';
import { WeatherAlert } from '../schemas/weather.schema';

@ApiTags('clima')
@Controller('clima')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get('atual')
  @ApiOperation({ summary: 'Executa a análise crítica de São Luís, salva o alerta atual e retorna o estado de risco.' })
  @ApiResponse({ status: 200, description: 'Alerta atual gerado pelo motor de defesa civil.', type: WeatherAlert })
  async getCurrentWeather(): Promise<WeatherAlert> {
    return this.weatherService.evaluateAndPersistCurrentWeather();
  }

  @Get('alertas')
  @ApiOperation({ summary: 'Retorna o histórico completo de eventos registrados em São Luís, ordenado do mais recente ao mais antigo.' })
  @ApiResponse({ status: 200, description: 'Lista de registros históricos do sistema de alerta precoce.', type: [WeatherAlert] })
  async getAlertsHistory(): Promise<WeatherAlert[]> {
    return this.weatherService.findAllAlerts();
  }

  @Get('emergencias')
  @ApiOperation({ summary: 'Feed de crises com alertas de ALTA severidade das últimas 24 horas.', description: 'Retorna apenas registros em estado de ALERTA ou EMERGÊNCIA para ações imediatas da Defesa Civil e comunicação pública.' })
  @ApiResponse({ status: 200, description: 'Eventos críticos dos últimos 24 horas.', type: [WeatherAlert] })
  async getCriticalEmergencies(): Promise<WeatherAlert[]> {
    return this.weatherService.findCriticalAlertsLast24h();
  }

  @Get('tendencia')
  @ApiOperation({
    summary: 'Calcula a média móvel de precipitação das últimas 3 horas para detecção de inundação súbita.',
    description:
      'Executa uma pipeline de agregação sobre os alertas registrados nas últimas 3 horas e sinaliza risco de inundação súbita quando a média de chuva ultrapassa 10mm.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tendência pluviométrica calculada a partir do histórico recente de alertas.',
    schema: {
      example: {
        riscoInundacaoSubita: true,
        mediaChuva: 14.32,
        mensagem: 'RISCO DE INUNDAÇÃO SÚBITA: média de precipitação de 14.32mm nas últimas 3 horas.',
      },
    },
  })
  async getRainTrend(): Promise<RainTrendResult> {
    return this.weatherService.getRainTrend();
  }
}
