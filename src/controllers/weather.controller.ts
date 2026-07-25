import { Controller, Get, Logger, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginatedResult, WeatherService, RainTrendResult } from '../services/weather.service';
import { WeatherAlert } from '../schemas/weather.schema';

// Limite bem mais restrito que o padrão global (60/min — ver ThrottlerModule em app.module.ts):
// esta rota, diferente das outras de /clima/*, dispara uma avaliação real a cada chamada
// (consulta à Open-Meteo + gravação no MongoDB + possível webhook para a Defesa Civil). Sem um
// limite próprio, um cliente insistente poderia estourar a cota da Open-Meteo e inflar o banco
// com registros inúteis. 10/min dá folga confortável pro polling do painel (1x/min por aba) e
// ainda barra abuso.
export const LIMITE_CLIMA_ATUAL = { limit: 10, ttl: 60_000 };

@ApiTags('clima')
@Controller('clima')
export class WeatherController {
  private readonly logger = new Logger(WeatherController.name);

  constructor(private readonly weatherService: WeatherService) {}

  @Get('atual')
  @Throttle({ default: LIMITE_CLIMA_ATUAL })
  @ApiOperation({ summary: 'Executa a análise crítica de São Luís, salva o alerta atual e retorna o estado de risco.' })
  @ApiResponse({ status: 200, description: 'Alerta atual gerado pelo motor de defesa civil.', type: WeatherAlert })
  @ApiResponse({ status: 429, description: 'Limite de requisições excedido (10 por minuto por IP).' })
  async getCurrentWeather(@Req() request: Request): Promise<WeatherAlert> {
    const origem = request.ip ?? request.socket.remoteAddress ?? 'desconhecida';
    const userAgent = request.headers['user-agent'] ?? 'desconhecido';
    this.logger.log(`[ACESSO] GET /clima/atual origem=${origem} user-agent="${userAgent}"`);
    return this.weatherService.evaluateAndPersistCurrentWeather();
  }

  @Get('alertas')
  @ApiOperation({
    summary: 'Retorna o histórico paginado de eventos registrados em São Luís, ordenado do mais recente ao mais antigo.',
    description: 'Paginado (page/limit — ver PaginationQueryDto) para não devolver a coleção inteira a cada chamada.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página do histórico do sistema de alerta precoce, com metadados de paginação.',
    schema: {
      example: {
        data: [],
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
      },
    },
  })
  async getAlertsHistory(@Query() query: PaginationQueryDto): Promise<PaginatedResult<WeatherAlert>> {
    return this.weatherService.findAllAlerts(query.page, query.limit);
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
