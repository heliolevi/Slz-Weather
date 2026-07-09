import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WeatherService } from './weather.service';

@Injectable()
export class WeatherCron {
  private readonly logger = new Logger(WeatherCron.name);

  constructor(private readonly weatherService: WeatherService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async runWeatherAnalysis(): Promise<void> {
    this.logger.log('Iniciando verificação de alerta precoce para São Luís - MA.');

    try {
      const alert = await this.weatherService.evaluateAndPersistCurrentWeather();
      const isCritical = alert.nivelSeveridade === 'ALERTA' || alert.nivelSeveridade === 'EMERGÊNCIA';

      this.logger.log(
        `Alerta registrado: ${alert.nivelSeveridade} | ${alert.tipoAlerta} | ${alert.descricao} | timestamp=${alert.timestamp.toISOString()}`,
      );

      if (isCritical) {
        this.logger.warn(
          `EVENTO CRÍTICO: ${alert.nivelSeveridade} detectado. Inicie protocolo de despacho para Defesa Civil.`,
        );
      }
    } catch (error) {
      this.logger.error('Falha ao executar cron de alerta precoce.', error as Error);
    }
  }
}
