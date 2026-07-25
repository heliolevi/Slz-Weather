import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CronAuthGuard } from '../guards/cron-auth.guard';
import { AlertEngineService } from '../services/alert-engine.service';
import { WeatherService } from '../services/weather.service';

/**
 * Endpoints que substituem os jobs internos do @nestjs/schedule (WeatherCron/TaskService) no
 * ambiente serverless da Vercel: lá, o processo não fica de pé entre requisições, então um
 * `@Cron` registrado no boot nunca dispara sozinho depois. Aqui, quem dispara é um agendador
 * externo batendo em HTTP — Vercel Cron Jobs (ver vercel.json) e/ou o workflow do GitHub Actions
 * (ver .github/workflows/cron.yml), autenticados via CronAuthGuard.
 *
 * Fora do escopo do Swagger público (@ApiExcludeController): não são endpoints de consumo da API,
 * são gatilhos operacionais.
 */
@ApiExcludeController()
@Controller('cron')
@UseGuards(CronAuthGuard)
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly weatherService: WeatherService,
    private readonly alertEngineService: AlertEngineService,
  ) {}

  @Get('analise-climatica')
  async executarAnaliseClimatica(): Promise<{ ok: true; nivelSeveridade: string }> {
    this.logger.log('[CRON] Iniciando verificação de alerta precoce para São Luís - MA.');

    const alert = await this.weatherService.evaluateAndPersistCurrentWeather();
    const isCritical = alert.nivelSeveridade === 'ALERTA' || alert.nivelSeveridade === 'EMERGÊNCIA';

    this.logger.log(
      `[CRON] Alerta registrado: ${alert.nivelSeveridade} | ${alert.tipoAlerta} | ${alert.descricao} | timestamp=${alert.timestamp.toISOString()}`,
    );

    if (isCritical) {
      this.logger.warn(
        `[CRON] EVENTO CRÍTICO: ${alert.nivelSeveridade} detectado. Inicie protocolo de despacho para Defesa Civil.`,
      );
    }

    return { ok: true, nivelSeveridade: alert.nivelSeveridade };
  }

  @Get('motor-alertas')
  async executarMotorDeAlertas(): Promise<{ ok: true }> {
    this.logger.log('[CRON] Executando ciclo do AlertEngineService.');
    await this.alertEngineService.avaliarEEmitirAlertas();
    return { ok: true };
  }
}
