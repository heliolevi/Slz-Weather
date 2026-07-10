import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { WeatherAlert } from '../schemas/weather.schema';
import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  let service: WeatherService;
  let httpService: { get: jest.Mock; post: jest.Mock };
  let weatherAlertModel: any;
  let mockSave: jest.Mock;

  beforeEach(async () => {
    mockSave = jest.fn();

    weatherAlertModel = jest.fn().mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save: mockSave,
    }));
    weatherAlertModel.find = jest.fn();
    weatherAlertModel.findOne = jest.fn();
    weatherAlertModel.aggregate = jest.fn();

    httpService = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeatherService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-openweather-api-key') } },
        { provide: getModelToken(WeatherAlert.name), useValue: weatherAlertModel },
      ],
    }).compile();

    service = module.get<WeatherService>(WeatherService);

    // Neutraliza o sensor de terremoto (aleatório) para manter os cenários de vento/chuva determinísticos.
    jest.spyOn(service as unknown as { simulateEarthquakeSensor: () => number }, 'simulateEarthquakeSensor').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Engenharia 1 & 3 - Geofencing e Severidade EMERGÊNCIA por vento', () => {
    it('deve gerar severidade EMERGÊNCIA, descrição crítica e as zonas afetadas corretas quando o vento ultrapassa 60km/h', async () => {
      httpService.get.mockReturnValue(
        of({
          data: {
            current: {
              temperature_2m: 29,
              relative_humidity_2m: 80,
              precipitation: 2,
              wind_speed_10m: 65,
              wind_gusts_10m: 72,
            },
          },
        }),
      );
      mockSave.mockImplementation(function (this: Record<string, unknown>) {
        return Promise.resolve({ ...this, id: 'alert-emergencia-vento' });
      });
      httpService.post.mockReturnValue(of({ data: {} }));

      const result = await service.evaluateAndPersistCurrentWeather();

      expect(result.nivelSeveridade).toBe('EMERGÊNCIA');
      expect(result.tipoAlerta).toBe('VENTANIA');
      expect(result.descricao).toContain('PERIGO CRÍTICO');
      expect(result.zonasAfetadas).toEqual(['Orla Marítima', 'Península', 'Avenida Litorânea']);
    });

    it('deve disparar o webhook de forma não-bloqueante quando a severidade é EMERGÊNCIA', async () => {
      httpService.get.mockReturnValue(
        of({
          data: {
            current: {
              temperature_2m: 29,
              relative_humidity_2m: 80,
              precipitation: 2,
              wind_speed_10m: 65,
              wind_gusts_10m: 72,
            },
          },
        }),
      );
      mockSave.mockImplementation(function (this: Record<string, unknown>) {
        return Promise.resolve({ ...this, id: 'alert-webhook' });
      });
      httpService.post.mockReturnValue(of({ data: {} }));

      await service.evaluateAndPersistCurrentWeather();
      await Promise.resolve();

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ nivelSeveridade: 'EMERGÊNCIA' }),
      );
    });

    it('NÃO deve disparar o webhook quando a severidade é INFORMATIVO', async () => {
      httpService.get.mockReturnValue(
        of({
          data: {
            current: {
              temperature_2m: 29,
              relative_humidity_2m: 80,
              precipitation: 1,
              wind_speed_10m: 5,
              wind_gusts_10m: 8,
            },
          },
        }),
      );
      mockSave.mockImplementation(function (this: Record<string, unknown>) {
        return Promise.resolve({ ...this, id: 'alert-normal' });
      });

      await service.evaluateAndPersistCurrentWeather();
      await Promise.resolve();

      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('NÃO deve tentar enviar webhook quando DEFESA_CIVIL_WEBHOOK_URL não está configurada', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WeatherService,
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
          { provide: getModelToken(WeatherAlert.name), useValue: weatherAlertModel },
        ],
      }).compile();
      const serviceSemWebhook = module.get<WeatherService>(WeatherService);
      jest
        .spyOn(serviceSemWebhook as unknown as { simulateEarthquakeSensor: () => number }, 'simulateEarthquakeSensor')
        .mockReturnValue(0);

      httpService.get.mockReturnValue(
        of({
          data: {
            current: {
              temperature_2m: 29,
              relative_humidity_2m: 80,
              precipitation: 2,
              wind_speed_10m: 65,
              wind_gusts_10m: 72,
            },
          },
        }),
      );
      mockSave.mockImplementation(function (this: Record<string, unknown>) {
        return Promise.resolve({ ...this, id: 'alert-sem-webhook' });
      });

      await serviceSemWebhook.evaluateAndPersistCurrentWeather();
      await Promise.resolve();

      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('Engenharia 2 - Circuit Breaker com Fallback', () => {
    it('deve ativar o fallback e retornar o último registro em cache quando a API Open-Meteo falhar', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('Timeout na API Open-Meteo')));

      const cachedAlert = {
        id: 'cached-alert-id',
        cidade: 'São Luís - MA',
        tipoAlerta: 'VENTANIA',
        descricao: 'Ventos moderados. Atenção na circulação da Avenida Litorânea.',
        nivelSeveridade: 'ATENÇÃO',
        acaoPreventiva: 'Monitorar atualizações meteorológicas.',
        velocidadeVento: 28,
        precipitacao: 3,
        temperatura: 27,
        zonasAfetadas: ['Orla Marítima', 'Península', 'Avenida Litorânea'],
        timestamp: new Date(),
      };

      const execMock = jest.fn().mockResolvedValue(cachedAlert);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      weatherAlertModel.findOne.mockReturnValue({ sort: sortMock });

      const result = await service.evaluateAndPersistCurrentWeather();

      expect(weatherAlertModel.findOne).toHaveBeenCalled();
      expect(sortMock).toHaveBeenCalledWith({ timestamp: -1 });
      expect(result.descricao).toBe(
        '[MODO CONTINGÊNCIA - DADO EM CACHE] Ventos moderados. Atenção na circulação da Avenida Litorânea.',
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('deve lançar erro quando a API falhar e não houver nenhum registro em cache', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('Timeout na API Open-Meteo')));

      const execMock = jest.fn().mockResolvedValue(null);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      weatherAlertModel.findOne.mockReturnValue({ sort: sortMock });

      await expect(service.evaluateAndPersistCurrentWeather()).rejects.toThrow();
    });
  });

  describe('Engenharia de Resiliência - Retry seletivo e classificação de falhas HTTP', () => {
    const createAxiosError = (status?: number, code?: string) => ({
      isAxiosError: true,
      code,
      message: 'Request failed',
      response: status ? { status } : undefined,
    });

    it('deve reexecutar (retry) automaticamente em erro 503 e ter sucesso quando a API se recupera', async () => {
      let chamadas = 0;
      httpService.get.mockImplementation(() => {
        chamadas += 1;
        if (chamadas < 3) {
          return throwError(() => createAxiosError(503));
        }
        return of({
          data: {
            current: {
              temperature_2m: 30,
              relative_humidity_2m: 70,
              precipitation: 1,
              wind_speed_10m: 10,
              wind_gusts_10m: 15,
            },
          },
        });
      });
      mockSave.mockImplementation(function (this: Record<string, unknown>) {
        return Promise.resolve({ ...this, id: 'alert-retry-503' });
      });

      const result = await service.evaluateAndPersistCurrentWeather();

      expect(httpService.get).toHaveBeenCalledTimes(3);
      expect(result.nivelSeveridade).toBe('INFORMATIVO');
      expect(weatherAlertModel.findOne).not.toHaveBeenCalled();
    }, 10000);

    it('NÃO deve reexecutar em erro de DNS (ENOTFOUND) — ativa o fallback já na primeira falha', async () => {
      httpService.get.mockImplementation(() => throwError(() => createAxiosError(undefined, 'ENOTFOUND')));

      const cachedAlert = {
        id: 'cached-dns-fallback',
        descricao: 'Condições climáticas estáveis. Situação segura para a população.',
        nivelSeveridade: 'INFORMATIVO',
      };
      const execMock = jest.fn().mockResolvedValue(cachedAlert);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      weatherAlertModel.findOne.mockReturnValue({ sort: sortMock });

      const result = await service.evaluateAndPersistCurrentWeather();

      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(result.descricao).toContain('[MODO CONTINGÊNCIA - DADO EM CACHE]');
    });

    it('deve esgotar as tentativas quando o 503 persiste e então ativar o circuito de contingência', async () => {
      httpService.get.mockImplementation(() => throwError(() => createAxiosError(503)));

      const cachedAlert = {
        id: 'cached-503-exhausted',
        descricao: 'Ventos moderados. Atenção na circulação da Avenida Litorânea.',
        nivelSeveridade: 'ATENÇÃO',
      };
      const execMock = jest.fn().mockResolvedValue(cachedAlert);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      weatherAlertModel.findOne.mockReturnValue({ sort: sortMock });

      const result = await service.evaluateAndPersistCurrentWeather();

      // 1 tentativa inicial + 3 retries (MAX_TENTATIVAS_RETRY) = 4 chamadas HTTP no total.
      expect(httpService.get).toHaveBeenCalledTimes(4);
      expect(result.descricao).toContain('[MODO CONTINGÊNCIA - DADO EM CACHE]');
    }, 10000);
  });

  describe('Engenharia 4 - Pipeline de Agregação de Média Móvel', () => {
    it('deve agrupar corretamente os alertas das últimas 3 horas e sinalizar risco de inundação súbita quando a média > 10mm', async () => {
      const execMock = jest.fn().mockResolvedValue([{ _id: null, mediaChuva: 14.333 }]);
      weatherAlertModel.aggregate.mockReturnValue({ exec: execMock });

      const result = await service.getRainTrend();

      expect(weatherAlertModel.aggregate).toHaveBeenCalledWith([
        { $match: { timestamp: { $gte: expect.any(Date) } } },
        { $group: { _id: null, mediaChuva: { $avg: '$precipitacao' } } },
      ]);
      expect(result.mediaChuva).toBe(14.33);
      expect(result.riscoInundacaoSubita).toBe(true);
      expect(result.mensagem).toContain('RISCO DE INUNDAÇÃO SÚBITA');
    });

    it('não deve sinalizar risco de inundação quando a média de chuva é menor ou igual a 10mm', async () => {
      const execMock = jest.fn().mockResolvedValue([{ _id: null, mediaChuva: 4.2 }]);
      weatherAlertModel.aggregate.mockReturnValue({ exec: execMock });

      const result = await service.getRainTrend();

      expect(result.mediaChuva).toBe(4.2);
      expect(result.riscoInundacaoSubita).toBe(false);
      expect(result.mensagem).toContain('Sem risco');
    });

    it('deve retornar mediaChuva zero quando não houver nenhum alerta nas últimas 3 horas', async () => {
      const execMock = jest.fn().mockResolvedValue([]);
      weatherAlertModel.aggregate.mockReturnValue({ exec: execMock });

      const result = await service.getRainTrend();

      expect(result.mediaChuva).toBe(0);
      expect(result.riscoInundacaoSubita).toBe(false);
    });
  });
});
