import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertEngineService } from './alert-engine.service';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(private readonly alertEngineService: AlertEngineService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async executarMotorDeAlertas(): Promise<void> {
    this.logger.log('Executando ciclo do AlertEngineService (a cada 10 minutos).');

    try {
      await this.alertEngineService.avaliarEEmitirAlertas();
    } catch (error) {
      this.logger.error('Falha inesperada ao executar o motor de alertas.', (error as Error)?.stack);
    }
  }
}
