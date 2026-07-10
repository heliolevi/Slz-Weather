import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { of } from 'rxjs';
import {
  buildWeatherTestApp,
  createEmptyConfigServiceMock,
  createHttpServiceMock,
} from './utils/build-weather-test-app';

const LEITURA_EMERGENCIA_VENTO = {
  temperature_2m: 29,
  relative_humidity_2m: 80,
  precipitation: 2,
  wind_speed_10m: 65,
  wind_gusts_10m: 72,
};

function createWeatherAlertModelMock() {
  const mockSave = jest.fn();
  const model: any = jest.fn().mockImplementation((data: Record<string, unknown>) => ({
    ...data,
    save: mockSave,
  }));
  model.find = jest.fn();
  model.findOne = jest.fn();
  model.aggregate = jest.fn();
  return { model, mockSave };
}

describe('GET /clima/atual (integração)', () => {
  let app: INestApplication<App>;
  let httpService: { get: jest.Mock; post: jest.Mock };
  let mockSave: jest.Mock;

  const iniciarApp = async () => {
    httpService = createHttpServiceMock();
    const { model, mockSave: save } = createWeatherAlertModelMock();
    mockSave = save;
    mockSave.mockImplementation(function (this: Record<string, unknown>) {
      return Promise.resolve({ ...this, id: 'mock-alert-id' });
    });

    const built = await buildWeatherTestApp({
      httpService,
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    // Neutraliza o sensor sísmico aleatório para manter os cenários de vento determinísticos.
    jest
      .spyOn(
        built.weatherService as unknown as { simulateEarthquakeSensor: () => number },
        'simulateEarthquakeSensor',
      )
      .mockReturnValue(0);
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.restoreAllMocks();
  });

  it('deve retornar nivel (nivelSeveridade), mensagem (descricao) e timestamp válidos', async () => {
    await iniciarApp();
    httpService.get.mockReturnValue(of({ data: { current: LEITURA_EMERGENCIA_VENTO } }));

    const response = await request(app.getHttpServer()).get('/clima/atual').expect(200);

    expect(response.body).toHaveProperty('nivelSeveridade');
    expect(typeof response.body.nivelSeveridade).toBe('string');
    expect(response.body).toHaveProperty('descricao');
    expect(typeof response.body.descricao).toBe('string');
    expect(response.body).toHaveProperty('timestamp');
    expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('deve persistir o alerta no MongoDB (via repositório mockado)', async () => {
    await iniciarApp();
    httpService.get.mockReturnValue(of({ data: { current: LEITURA_EMERGENCIA_VENTO } }));

    await request(app.getHttpServer()).get('/clima/atual').expect(200);

    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  describe('Validação de contrato (class-validator) — API externa muda de forma', () => {
    it('deve retornar 422 quando um campo vier com tipo inesperado (string em vez de number)', async () => {
      await iniciarApp();
      httpService.get.mockReturnValue(
        of({
          data: {
            current: {
              temperature_2m: 29,
              relative_humidity_2m: 80,
              precipitation: 2,
              wind_speed_10m: 'muito forte', // contrato quebrado: deveria ser number
              wind_gusts_10m: 72,
            },
          },
        }),
      );

      const response = await request(app.getHttpServer()).get('/clima/atual');

      expect(response.status).toBe(422);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('deve retornar 422 quando a API externa remover um campo obrigatório', async () => {
      await iniciarApp();
      httpService.get.mockReturnValue(
        of({
          data: {
            current: {
              temperature_2m: 29,
              relative_humidity_2m: 80,
              // precipitation ausente: simula uma mudança de contrato da Open-Meteo
              wind_speed_10m: 65,
              wind_gusts_10m: 72,
            },
          },
        }),
      );

      const response = await request(app.getHttpServer()).get('/clima/atual');

      expect(response.status).toBe(422);
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  it('snapshot: corpo da resposta para o cenário de EMERGÊNCIA por vento não deve regredir', async () => {
    await iniciarApp();
    httpService.get.mockReturnValue(of({ data: { current: LEITURA_EMERGENCIA_VENTO } }));

    const response = await request(app.getHttpServer()).get('/clima/atual').expect(200);

    // timestamp/id variam a cada execução; removidos antes de comparar com o snapshot.
    const { timestamp, id, ...corpoEstavel } = response.body;
    expect(corpoEstavel).toMatchSnapshot();
  });
});
