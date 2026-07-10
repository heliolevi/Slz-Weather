import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ALERT_ENGINE_STATE_ID,
  AlertEngineState,
  AlertEngineStateDocument,
  EstadoAlerta,
} from '../schemas/alert-engine-state.schema';
import { SmsService } from './sms.service';
import { WeatherService } from './weather.service';

const LIMITE_EMERGENCIA_KMH = 60;
const LIMITE_ATENCAO_KMH = 40;

@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);
  private readonly numeroDestinoDefesaCivil: string;

  constructor(
    private readonly weatherService: WeatherService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
    @InjectModel(AlertEngineState.name)
    private readonly alertStateModel: Model<AlertEngineStateDocument>,
  ) {
    this.numeroDestinoDefesaCivil = this.configService.get<string>('SMS_DESTINATARIO_DEFESA_CIVIL', '');
  }

  /**
   * Ciclo principal do motor: lê o clima atual, classifica o estado (máquina de estados de 3 níveis)
   * e só dispara SMS quando há transição em relação ao último estado persistido no MongoDB.
   * Se a leitura climática falhar (mesmo após o retry do WeatherService), o ciclo é abortado com log
   * e o último estado persistido permanece válido — nada é notificado indevidamente.
   */
  async avaliarEEmitirAlertas(): Promise<void> {
    let leituraAtual: { wind_speed_10m: number };

    try {
      leituraAtual = await this.weatherService.getCurrentWeatherReading();
    } catch (error) {
      this.logger.warn(
        `Não foi possível obter leitura climática neste ciclo: ${(error as Error).message}. Estado atual mantido sem alteração.`,
      );
      return;
    }

    const novoEstado = this.determinarEstado(leituraAtual.wind_speed_10m);
    const estadoPersistido = await this.obterOuCriarEstadoAtual();

    if (novoEstado === estadoPersistido.currentState) {
      this.logger.log(`Estado inalterado (${novoEstado}). Nenhum SMS será disparado.`);
      return;
    }

    this.logger.warn(
      `Transição de estado detectada: ${estadoPersistido.currentState} -> ${novoEstado} (vento=${leituraAtual.wind_speed_10m}km/h).`,
    );

    await this.dispararSmsDeTransicao(novoEstado, leituraAtual.wind_speed_10m);
    await this.persistirNovoEstado(novoEstado, leituraAtual.wind_speed_10m);
  }

  /**
   * Máquina de estados: NORMAL -> ATENCAO (vento > 40km/h) -> EMERGENCIA (vento > 60km/h).
   */
  private determinarEstado(windSpeed: number): EstadoAlerta {
    if (windSpeed > LIMITE_EMERGENCIA_KMH) {
      return 'EMERGENCIA';
    }

    if (windSpeed > LIMITE_ATENCAO_KMH) {
      return 'ATENCAO';
    }

    return 'NORMAL';
  }

  /**
   * Recupera o documento singleton de estado; na primeira execução (ou após uma queda do banco),
   * cria-o com estado NORMAL — garantindo que um reinício do servidor não dispare SMS espúrio.
   */
  private async obterOuCriarEstadoAtual(): Promise<AlertEngineStateDocument> {
    const estado = await this.alertStateModel
      .findOneAndUpdate(
        { identificador: ALERT_ENGINE_STATE_ID },
        {
          $setOnInsert: {
            identificador: ALERT_ENGINE_STATE_ID,
            currentState: 'NORMAL',
            updatedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    return estado;
  }

  private async persistirNovoEstado(novoEstado: EstadoAlerta, windSpeed: number): Promise<void> {
    await this.alertStateModel
      .findOneAndUpdate(
        { identificador: ALERT_ENGINE_STATE_ID },
        { currentState: novoEstado, updatedAt: new Date(), velocidadeVento: windSpeed },
        { upsert: true },
      )
      .exec();
  }

  private async dispararSmsDeTransicao(novoEstado: EstadoAlerta, windSpeed: number): Promise<void> {
    if (!this.numeroDestinoDefesaCivil) {
      this.logger.warn('SMS_DESTINATARIO_DEFESA_CIVIL não configurado — SMS de transição não enviado.');
      return;
    }

    const mensagem = this.montarMensagem(novoEstado, windSpeed);
    await this.smsService.enviarSms(this.numeroDestinoDefesaCivil, mensagem);
  }

  private montarMensagem(novoEstado: EstadoAlerta, windSpeed: number): string {
    switch (novoEstado) {
      case 'EMERGENCIA':
        return `[Defesa Civil - São Luís] EMERGÊNCIA: vento de ${windSpeed}km/h. Risco crítico, busque abrigo seguro imediatamente.`;
      case 'ATENCAO':
        return `[Defesa Civil - São Luís] ATENÇÃO: vento de ${windSpeed}km/h. Monitore atualizações e evite áreas de risco.`;
      case 'NORMAL':
      default:
        return `[Defesa Civil - São Luís] Situação normalizada. Vento atual: ${windSpeed}km/h.`;
    }
  }
}
