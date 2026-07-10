import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, HttpException, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { defer, firstValueFrom, retry, timer } from 'rxjs';
import { isAxiosError } from 'axios';
import { Model } from 'mongoose';
import { OpenMeteoCurrentWeatherDto } from '../dto/open-meteo-current-weather.dto';
import { WeatherAlert, WeatherAlertDocument } from '../schemas/weather.schema';

export interface CurrentWeather {
  temperature_2m: number;
  relative_humidity_2m: number;
  precipitation: number;
  wind_speed_10m: number;
  wind_gusts_10m: number;
}

interface OpenMeteoResponse {
  current_weather?: CurrentWeather;
  current?: CurrentWeather;
}

export interface RainTrendResult {
  riscoInundacaoSubita: boolean;
  mediaChuva: number;
  mensagem: string;
}

type TipoFalhaExterna = 'DNS' | 'TIMEOUT' | 'INDISPONIVEL' | 'CANCELADO' | 'DESCONHECIDO';

interface FalhaExternaClassificada {
  tipo: TipoFalhaExterna;
  retryable: boolean;
  codigo?: string;
  statusHttp?: number;
  mensagemAmigavel: string;
}

const ZONAS_VENTO = ['Orla Marítima', 'Península', 'Avenida Litorânea'];
const ZONAS_CHUVA = ['Cohab', 'Centro Histórico', 'Anjo da Guarda', 'Avenida Guajajaras'];
const SEVERIDADES_VENTO_AFETADO = ['ATENÇÃO', 'ALERTA', 'EMERGÊNCIA'];
const SEVERIDADES_CHUVA_AFETADA = ['ALERTA', 'EMERGÊNCIA'];
const CONTINGENCIA_PREFIXO = '[MODO CONTINGÊNCIA - DADO EM CACHE]';

const MAX_TENTATIVAS_RETRY = 3;
const RETRY_BACKOFF_BASE_MS = 300;
const RETRY_BACKOFF_MAX_MS = 1200;

const LIMIAR_TERREMOTO_EMERGENCIA = 3.5;
const LIMIAR_VENTANIA_EMERGENCIA_GUST = 60;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly apiUrl =
    'https://api.open-meteo.com/v1/forecast?latitude=-2.5297&longitude=-44.3028&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m';
  private readonly webhookUrl: string;
  private readonly openWeatherApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectModel(WeatherAlert.name)
    private readonly weatherAlertModel: Model<WeatherAlertDocument>,
  ) {
    // Exemplo de carregamento seguro de API key via @nestjs/config, lida do .env (nunca hardcoded).
    this.openWeatherApiKey = this.configService.get<string>('OPENWEATHER_API_KEY', '');
    // Sem valor padrão hardcoded: se não configurado, o disparo de webhook é simplesmente ignorado.
    this.webhookUrl = this.configService.get<string>('DEFESA_CIVIL_WEBHOOK_URL', '');
  }

  /**
   * Orquestra a análise climática: busca dados na Open-Meteo, monta o alerta e persiste.
   * Engenharia 2 (Circuit Breaker): se a API externa falhar, cai para o último registro em cache.
   */
  async evaluateAndPersistCurrentWeather(): Promise<WeatherAlertDocument> {
    try {
      const current = await this.fetchCurrentWeather();
      let alertPayload = this.buildAlertPayload(current);

      if (alertPayload.nivelSeveridade === 'EMERGÊNCIA') {
        // Sanity Check (Double-Check): nenhuma EMERGÊNCIA é persistida com base em uma única leitura.
        alertPayload = await this.confirmarEmergenciaOuRebaixar(alertPayload, current);
      }

      const created = await this.saveAlert(alertPayload);
      this.logger.log(`Alerta registrado: ${created.nivelSeveridade} - ${created.descricao}`);

      this.dispatchCriticalWebhook(created);

      return created;
    } catch (error) {
      if (error instanceof HttpException) {
        // Falha de contrato (ex.: 422) é um erro estrutural, não uma indisponibilidade transitória —
        // não deve ser mascarada pelo circuit breaker; o cliente precisa saber que o contrato quebrou.
        throw error;
      }

      this.logger.warn(`Todas as tentativas contra a Open-Meteo se esgotaram: ${(error as Error).message}. Ativando circuito de contingência.`);
      return this.fallbackToLastCachedAlert();
    }
  }

  async findAllAlerts(): Promise<WeatherAlertDocument[]> {
    return this.weatherAlertModel.find().sort({ timestamp: -1 }).exec();
  }

  async findCriticalAlertsLast24h(): Promise<WeatherAlertDocument[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.weatherAlertModel
      .find({
        nivelSeveridade: { $in: ['ALERTA', 'EMERGÊNCIA'] },
        timestamp: { $gte: since },
      })
      .sort({ timestamp: -1 })
      .exec();
  }

  /**
   * Engenharia 4 (Pipeline de Agregação): média móvel de precipitação nas últimas 3 horas.
   */
  async getRainTrend(): Promise<RainTrendResult> {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    const result = await this.weatherAlertModel
      .aggregate<{ _id: null; mediaChuva: number }>([
        { $match: { timestamp: { $gte: threeHoursAgo } } },
        { $group: { _id: null, mediaChuva: { $avg: '$precipitacao' } } },
      ])
      .exec();

    const mediaChuvaBruta = result[0]?.mediaChuva ?? 0;
    const mediaChuva = Math.round(mediaChuvaBruta * 100) / 100;
    const riscoInundacaoSubita = mediaChuva > 10;

    return {
      riscoInundacaoSubita,
      mediaChuva,
      mensagem: riscoInundacaoSubita
        ? `RISCO DE INUNDAÇÃO SÚBITA: média de precipitação de ${mediaChuva}mm nas últimas 3 horas.`
        : `Sem risco de inundação súbita no momento. Média de precipitação de ${mediaChuva}mm nas últimas 3 horas.`,
    };
  }

  /**
   * Leitura climática crua (sem persistir alerta nem disparar webhook), reaproveitando o mesmo
   * pipeline de retry/circuit-breaker/classificação de falhas. Usada por outros motores de regras
   * (ex.: AlertEngineService) que precisam apenas do dado atual, não do ciclo completo de alerta.
   */
  async getCurrentWeatherReading(): Promise<CurrentWeather> {
    return this.fetchCurrentWeather();
  }

  /**
   * Busca o clima atual: rede resiliente (retry/circuit-breaker) + validação de contrato.
   * As duas responsabilidades ficam em métodos separados de propósito — uma falha de rede
   * (Error genérico) aciona o circuit breaker; uma falha de contrato (UnprocessableEntityException)
   * precisa atravessar esse circuit breaker sem ser mascarada (ver `evaluateAndPersistCurrentWeather`).
   */
  private async fetchCurrentWeather(): Promise<CurrentWeather> {
    const payloadBruto = await this.fetchRawCurrentWeatherPayload();
    return this.validarContratoOpenMeteo(payloadBruto);
  }

  /**
   * Busca o clima atual na Open-Meteo com retry automático para falhas transitórias (503, timeout).
   * Cada tentativa dispara uma requisição HTTP nova (via `defer`) — sem isso, `retry` apenas
   * repetiria a Promise/observable já resolvida da primeira chamada, sem nunca tocar a rede de novo.
   */
  private async fetchRawCurrentWeatherPayload(): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        defer(() => this.httpService.get<OpenMeteoResponse>(this.apiUrl)).pipe(
          retry({
            count: MAX_TENTATIVAS_RETRY,
            delay: (error, tentativa) => {
              const classificacao = this.classificarFalhaExterna(error);
              this.logFalhaExterna('warn', error, classificacao, tentativa);

              if (!classificacao.retryable) {
                throw error;
              }

              return timer(Math.min(RETRY_BACKOFF_BASE_MS * 2 ** (tentativa - 1), RETRY_BACKOFF_MAX_MS));
            },
          }),
        ),
      );

      const payload = response.data.current ?? response.data.current_weather;

      if (!payload) {
        throw new Error('Resposta da API Open-Meteo sem dados de clima atual (payload vazio).');
      }

      return payload;
    } catch (error) {
      const classificacao = this.classificarFalhaExterna(error);
      this.logFalhaExterna('error', error, classificacao);
      throw new Error(classificacao.mensagemAmigavel);
    }
  }

  /**
   * Validação de contrato (class-validator): garante que o payload da Open-Meteo ainda tem o
   * formato esperado. Se a API externa mudar a estrutura (renomear/remover campo, tipo diferente),
   * lança 422 em vez de deixar `undefined`/NaN vazar silenciosamente para o motor de regras.
   */
  private async validarContratoOpenMeteo(payloadBruto: unknown): Promise<CurrentWeather> {
    const payloadValidado = plainToInstance(OpenMeteoCurrentWeatherDto, payloadBruto);
    const erros = await validate(payloadValidado);

    if (erros.length > 0) {
      const detalhes = erros
        .map((erro) => Object.values(erro.constraints ?? {}).join(', '))
        .filter(Boolean)
        .join(' | ');

      this.logger.error(`[origem=Open-Meteo tipo=CONTRATO_INVALIDO] Resposta fora do contrato esperado: ${detalhes}`);
      throw new UnprocessableEntityException(
        `A resposta da API Open-Meteo não corresponde ao contrato de dados esperado: ${detalhes}`,
      );
    }

    return {
      temperature_2m: payloadValidado.temperature_2m,
      relative_humidity_2m: payloadValidado.relative_humidity_2m,
      precipitation: payloadValidado.precipitation,
      wind_speed_10m: payloadValidado.wind_speed_10m,
      wind_gusts_10m: payloadValidado.wind_gusts_10m,
    };
  }

  /**
   * Classifica falhas de rede/HTTP para permitir retry seletivo e logs precisos.
   * Distingue DNS (ENOTFOUND/EAI_AGAIN), timeout (ETIMEDOUT/ECONNABORTED), cancelamento (ERR_CANCELED)
   * e indisponibilidade real do servidor (status 5xx) — só 503 é considerado retryable.
   */
  private classificarFalhaExterna(error: unknown): FalhaExternaClassificada {
    if (isAxiosError(error)) {
      const codigo = error.code;
      const statusHttp = error.response?.status;

      if (codigo === 'ENOTFOUND' || codigo === 'EAI_AGAIN') {
        return {
          tipo: 'DNS',
          retryable: false,
          codigo,
          mensagemAmigavel:
            'Falha de resolução DNS ao contatar api.open-meteo.com. Verifique a conectividade/DNS do servidor.',
        };
      }

      if (codigo === 'ETIMEDOUT' || codigo === 'ECONNABORTED') {
        return {
          tipo: 'TIMEOUT',
          retryable: true,
          codigo,
          mensagemAmigavel: 'Timeout ao contatar a API Open-Meteo.',
        };
      }

      if (codigo === 'ERR_CANCELED') {
        return {
          tipo: 'CANCELADO',
          retryable: false,
          codigo,
          mensagemAmigavel: 'Requisição à Open-Meteo foi cancelada antes da conclusão.',
        };
      }

      if (statusHttp && statusHttp >= 500 && statusHttp < 600) {
        return {
          tipo: 'INDISPONIVEL',
          retryable: statusHttp === 503,
          codigo,
          statusHttp,
          mensagemAmigavel: `Serviço Open-Meteo temporariamente indisponível (HTTP ${statusHttp}). Tente novamente em instantes.`,
        };
      }

      return {
        tipo: 'DESCONHECIDO',
        retryable: false,
        codigo,
        statusHttp,
        mensagemAmigavel: `Erro inesperado ao consultar a Open-Meteo (${codigo ?? statusHttp ?? 'sem detalhes'}).`,
      };
    }

    return {
      tipo: 'DESCONHECIDO',
      retryable: false,
      mensagemAmigavel: 'Erro desconhecido ao consultar dados climáticos externos.',
    };
  }

  private logFalhaExterna(
    nivel: 'warn' | 'error',
    error: unknown,
    classificacao: FalhaExternaClassificada,
    tentativa?: number,
  ): void {
    const contexto = [
      'origem=Open-Meteo',
      `tipo=${classificacao.tipo}`,
      classificacao.codigo ? `codigo=${classificacao.codigo}` : undefined,
      classificacao.statusHttp ? `status=${classificacao.statusHttp}` : undefined,
      tentativa ? `tentativa=${tentativa}/${MAX_TENTATIVAS_RETRY}` : undefined,
    ]
      .filter(Boolean)
      .join(' ');

    const mensagem = `[${contexto}] ${classificacao.mensagemAmigavel}`;

    if (nivel === 'error') {
      this.logger.error(mensagem, (error as Error)?.stack);
    } else {
      this.logger.warn(mensagem);
    }
  }

  /**
   * Sanity Check (Double-Check): nenhuma EMERGÊNCIA vira alerta oficial com base numa leitura só.
   * Exige uma segunda verificação independente da MESMA dimensão que disparou o gatilho (vento
   * re-medido para VENTANIA, um segundo rolamento do sensor sísmico para TERREMOTO) antes de
   * confirmar. Se a rede falhar durante essa confirmação — ou se a segunda leitura não bater —
   * o alerta é rebaixado por segurança, nunca escalado. Um estado de indisponibilidade nunca
   * pode ser interpretado como EMERGÊNCIA confirmada.
   */
  private async confirmarEmergenciaOuRebaixar(
    payload: Omit<WeatherAlert, 'timestamp'>,
    leituraOriginal: CurrentWeather,
  ): Promise<Omit<WeatherAlert, 'timestamp'>> {
    this.logger.warn(
      `Sanity Check: EMERGÊNCIA (${payload.tipoAlerta}) detectada na primeira leitura. Solicitando confirmação antes de oficializar o alerta.`,
    );

    let confirmado: boolean;
    let motivoNaoConfirmado = 'segunda leitura não indicou o mesmo evento crítico (provável falso positivo)';

    try {
      confirmado = await this.confirmarCriticidade(payload.tipoAlerta);
    } catch (error) {
      motivoNaoConfirmado = `falha ao obter a segunda leitura de confirmação: ${(error as Error).message}`;
      confirmado = false;
    }

    if (confirmado) {
      this.logger.warn(`Sanity Check: segunda leitura CONFIRMOU o evento crítico (${payload.tipoAlerta}). EMERGÊNCIA mantida.`);
      return payload;
    }

    // Log de auditoria — registro explícito e grepável (`[AUDITORIA]`) de por que uma EMERGÊNCIA
    // NÃO foi oficializada. Se a Defesa Civil perguntar "por que tal alerta não tocou?", a resposta está aqui.
    this.logger.warn(
      `[AUDITORIA] EMERGÊNCIA (${payload.tipoAlerta}) descartada — confirmação falhou. ` +
        `motivo="${motivoNaoConfirmado}" timestampDecisao=${new Date().toISOString()}`,
    );

    return this.rebaixarAlertaNaoConfirmado(payload.tipoAlerta, leituraOriginal);
  }

  /**
   * Reverifica exatamente a dimensão que gerou a EMERGÊNCIA, isolada das demais:
   * - TERREMOTO: um segundo rolamento independente do sensor (o único jeito de "confirmar" um
   *   dado que é, por natureza, simulado/aleatório — não reaproveita a leitura de vento).
   * - VENTANIA: uma nova consulta real à Open-Meteo, checando só a rajada — sem recalcular sismo.
   */
  private async confirmarCriticidade(tipoAlerta: string): Promise<boolean> {
    if (tipoAlerta === 'TERREMOTO') {
      const segundaLeituraSismica = this.simulateEarthquakeSensor();
      return segundaLeituraSismica > LIMIAR_TERREMOTO_EMERGENCIA;
    }

    if (tipoAlerta === 'VENTANIA') {
      const segundaLeituraClimatica = await this.fetchCurrentWeather();
      return segundaLeituraClimatica.wind_gusts_10m > LIMIAR_VENTANIA_EMERGENCIA_GUST;
    }

    return false;
  }

  /**
   * EMERGÊNCIA não confirmada: nunca simplesmente descartamos a leitura. TERREMOTO não confirmado
   * cai para a classificação normal de vento/chuva (a leitura original ainda é válida, só o gatilho
   * sísmico não se sustentou). VENTANIA não confirmada é rebaixada um degrau — o vento é dado real,
   * só a rajada extrema não se manteve na segunda medição.
   */
  private rebaixarAlertaNaoConfirmado(
    tipoAlertaNaoConfirmado: string,
    current: CurrentWeather,
  ): Omit<WeatherAlert, 'timestamp'> {
    if (tipoAlertaNaoConfirmado === 'TERREMOTO') {
      return this.buildAlertPayloadPorVentoEChuva(current);
    }

    return this.withZonasAfetadas({
      cidade: 'São Luís - MA',
      tipoAlerta: 'VENTANIA',
      descricao:
        'RAJADA CRÍTICA NÃO CONFIRMADA na segunda leitura de verificação — rebaixado para ALERTA por segurança. Mantenha atenção redobrada.',
      nivelSeveridade: 'ALERTA',
      acaoPreventiva: 'Fiquem longe de árvores, estruturas leves e desliguem equipamentos expostos ao vento.',
      velocidadeVento: current.wind_speed_10m,
      precipitacao: current.precipitation,
      temperatura: current.temperature_2m,
    });
  }

  private async fallbackToLastCachedAlert(): Promise<WeatherAlertDocument> {
    const lastAlert = await this.weatherAlertModel.findOne().sort({ timestamp: -1 }).exec();

    if (!lastAlert) {
      throw new InternalServerErrorException(
        'Falha na API externa e nenhum registro em cache disponível no MongoDB.',
      );
    }

    lastAlert.descricao = `${CONTINGENCIA_PREFIXO} ${lastAlert.descricao}`;
    this.logger.warn(
      `Circuito de contingência ativado. Retornando último registro em cache: ${lastAlert.id} ` +
        `(severidade em cache: ${lastAlert.nivelSeveridade} — pode estar desatualizada, status atual é desconhecido).`,
    );

    return lastAlert;
  }

  /**
   * Engenharia 3 (Webhook Assíncrono): disparo não-bloqueante, isolado da persistência principal.
   */
  private dispatchCriticalWebhook(alert: WeatherAlertDocument): void {
    if (!['ALERTA', 'EMERGÊNCIA'].includes(alert.nivelSeveridade)) {
      return;
    }

    if (!this.webhookUrl) {
      this.logger.debug('DEFESA_CIVIL_WEBHOOK_URL não configurado — disparo de webhook ignorado.');
      return;
    }

    void this.sendWebhookNotification(alert);
  }

  private async sendWebhookNotification(alert: WeatherAlertDocument): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(this.webhookUrl, {
          cidade: alert.cidade,
          tipoAlerta: alert.tipoAlerta,
          nivelSeveridade: alert.nivelSeveridade,
          descricao: alert.descricao,
          zonasAfetadas: alert.zonasAfetadas,
          timestamp: alert.timestamp,
        }),
      );
      this.logger.log(`Webhook de alerta crítico disparado com sucesso para ${this.webhookUrl}.`);
    } catch (error) {
      this.logger.error(
        `Falha ao disparar webhook de alerta crítico para a Defesa Civil (${this.webhookUrl}).`,
        (error as Error)?.stack,
      );
    }
  }

  /**
   * Só decide o gatilho sísmico (o único componente puramente simulado/aleatório do motor).
   * Delega tudo o mais para `buildAlertPayloadPorVentoEChuva`, que trabalha só com dados reais
   * da Open-Meteo — separar os dois evita que uma segunda leitura de confirmação de vento
   * "role o dado" do sismo de novo por engano (ver `confirmarCriticidade`).
   */
  private buildAlertPayload(current: CurrentWeather): Omit<WeatherAlert, 'timestamp'> {
    const earthquake = this.simulateEarthquakeSensor();

    if (earthquake > LIMIAR_TERREMOTO_EMERGENCIA) {
      return this.withZonasAfetadas({
        cidade: 'São Luís - MA',
        tipoAlerta: 'TERREMOTO',
        descricao: 'ABALO SÍSMICO DETECTADO. Defesa Civil acionada para vistoria de estruturas prediais.',
        nivelSeveridade: 'EMERGÊNCIA',
        acaoPreventiva: 'Atingidos devem evacuar áreas inseguras e buscar abrigo estrutural seguro imediatamente.',
        velocidadeVento: current.wind_speed_10m,
        precipitacao: current.precipitation,
        temperatura: current.temperature_2m,
      });
    }

    return this.buildAlertPayloadPorVentoEChuva(current);
  }

  private buildAlertPayloadPorVentoEChuva(current: CurrentWeather): Omit<WeatherAlert, 'timestamp'> {
    const windSpeed = current.wind_speed_10m;
    const windGust = current.wind_gusts_10m;
    const precipitation = current.precipitation;

    if (windGust > LIMIAR_VENTANIA_EMERGENCIA_GUST) {
      return this.withZonasAfetadas({
        cidade: 'São Luís - MA',
        tipoAlerta: 'VENTANIA',
        descricao:
          'PERIGO CRÍTICO. Risco de destelhamento e colapso de redes elétricas. Busque abrigo seguro imediatamente.',
        nivelSeveridade: 'EMERGÊNCIA',
        acaoPreventiva: 'Desligue aparelhos elétricos, mantenha distância de fachadas e busque abrigo seguro.',
        velocidadeVento: windSpeed,
        precipitacao: precipitation,
        temperatura: current.temperature_2m,
      });
    }

    if (windSpeed > 40) {
      return this.withZonasAfetadas({
        cidade: 'São Luís - MA',
        tipoAlerta: 'VENTANIA',
        descricao: 'RISCO DE QUEDA DE ÁRVORES E ESTRUTURAS. Evitem áreas abertas e coberturas leves na ilha.',
        nivelSeveridade: 'ALERTA',
        acaoPreventiva: 'Fiquem longe de árvores, estruturas leves e desliguem equipamentos expostos ao vento.',
        velocidadeVento: windSpeed,
        precipitacao: precipitation,
        temperatura: current.temperature_2m,
      });
    }

    if (windSpeed >= 25) {
      return this.withZonasAfetadas({
        cidade: 'São Luís - MA',
        tipoAlerta: 'VENTANIA',
        descricao: 'Ventos moderados. Atenção na circulação da Avenida Litorânea e prática de esportes náuticos.',
        nivelSeveridade: 'ATENÇÃO',
        acaoPreventiva: 'Monitorar atualizações meteorológicas e evitar atividades náuticas na orla.',
        velocidadeVento: windSpeed,
        precipitacao: precipitation,
        temperatura: current.temperature_2m,
      });
    }

    if (precipitation > 10) {
      return this.withZonasAfetadas({
        cidade: 'São Luís - MA',
        tipoAlerta: 'TEMPORAL',
        descricao:
          'ALAGAMENTO IMINENTE. Evitar pontos críticos históricos de São Luís (como trechos da Cohab, Centro Histórico e Areinha).',
        nivelSeveridade: 'ALERTA',
        acaoPreventiva: 'Evite áreas baixas e desloque-se por rotas alternativas seguras.',
        velocidadeVento: windSpeed,
        precipitacao: precipitation,
        temperatura: current.temperature_2m,
      });
    }

    return this.withZonasAfetadas({
      cidade: 'São Luís - MA',
      tipoAlerta: 'NORMAL',
      descricao: 'Condições climáticas estáveis. Situação segura para a população.',
      nivelSeveridade: 'INFORMATIVO',
      acaoPreventiva: 'Permaneça atento às atualizações e mantenha os canais de comunicação abertos.',
      velocidadeVento: windSpeed,
      precipitacao: precipitation,
      temperatura: current.temperature_2m,
    });
  }

  /**
   * Engenharia 1 (Geofencing Lógico): calcula os bairros afetados a partir do tipo/severidade do alerta.
   */
  private withZonasAfetadas(
    payload: Omit<WeatherAlert, 'timestamp' | 'zonasAfetadas'>,
  ): Omit<WeatherAlert, 'timestamp'> {
    return { ...payload, zonasAfetadas: this.resolveZonasAfetadas(payload.tipoAlerta, payload.nivelSeveridade) };
  }

  private resolveZonasAfetadas(tipoAlerta: string, nivelSeveridade: string): string[] {
    const zonas: string[] = [];
    const isEventoDeVento = tipoAlerta === 'VENTANIA';
    const isEventoDeChuva = tipoAlerta === 'TEMPORAL' || tipoAlerta === 'CHUVA_FORTE';

    if (isEventoDeVento && SEVERIDADES_VENTO_AFETADO.includes(nivelSeveridade)) {
      zonas.push(...ZONAS_VENTO);
    }

    if (isEventoDeChuva && SEVERIDADES_CHUVA_AFETADA.includes(nivelSeveridade)) {
      zonas.push(...ZONAS_CHUVA);
    }

    return zonas;
  }

  private simulateEarthquakeSensor(): number {
    const randomValue = Math.random() * 5;
    return Math.round(randomValue * 10) / 10;
  }

  private async saveAlert(alertPayload: Omit<WeatherAlert, 'timestamp'>): Promise<WeatherAlertDocument> {
    const created = new this.weatherAlertModel({ ...alertPayload, timestamp: new Date() });
    return created.save();
  }
}
