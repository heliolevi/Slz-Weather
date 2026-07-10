import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  buildWeatherTestApp,
  createEmptyConfigServiceMock,
  createHttpServiceMock,
} from './utils/build-weather-test-app';

/**
 * Simula `.find(filter).sort(spec).exec()` aplicando de fato os operadores `$in`/`$gte` sobre um
 * array em memória — assim o teste valida o resultado real do filtro (quem entra/quem fica de fora),
 * não apenas se o método foi chamado com os argumentos esperados.
 */
function createFilteringModelMock(seedAlerts: Record<string, unknown>[]) {
  const findSpy = jest.fn((filter: { nivelSeveridade?: { $in: string[] }; timestamp?: { $gte: Date } }) => {
    const filtrados = seedAlerts.filter((alerta) => {
      const severidadeOk = !filter.nivelSeveridade || filter.nivelSeveridade.$in.includes(alerta.nivelSeveridade as string);
      const dentroDaJanela =
        !filter.timestamp || new Date(alerta.timestamp as string).getTime() >= filter.timestamp.$gte.getTime();
      return severidadeOk && dentroDaJanela;
    });

    return {
      sort: jest.fn().mockReturnValue({ exec: () => Promise.resolve(filtrados) }),
    };
  });

  return { model: { find: findSpy }, findSpy };
}

describe('GET /clima/emergencias (integração)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('deve retornar apenas alertas ALERTA/EMERGÊNCIA das últimas 24 horas, excluindo os demais', async () => {
    const agora = Date.now();
    const horasAtras = (h: number) => new Date(agora - h * 60 * 60 * 1000);

    const emergenciaRecente = {
      id: 'emergencia-recente',
      nivelSeveridade: 'EMERGÊNCIA',
      descricao: 'Emergência há 2h',
      timestamp: horasAtras(2),
      zonasAfetadas: [],
    };
    const alertaRecente = {
      id: 'alerta-recente',
      nivelSeveridade: 'ALERTA',
      descricao: 'Alerta há 10h',
      timestamp: horasAtras(10),
      zonasAfetadas: [],
    };
    const emergenciaAntiga = {
      id: 'emergencia-antiga',
      nivelSeveridade: 'EMERGÊNCIA',
      descricao: 'Emergência há 30h (fora da janela)',
      timestamp: horasAtras(30),
      zonasAfetadas: [],
    };
    const informativoRecente = {
      id: 'informativo-recente',
      nivelSeveridade: 'INFORMATIVO',
      descricao: 'Informativo há 1h (severidade não crítica)',
      timestamp: horasAtras(1),
      zonasAfetadas: [],
    };

    const { model, findSpy } = createFilteringModelMock([
      emergenciaRecente,
      alertaRecente,
      emergenciaAntiga,
      informativoRecente,
    ]);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/emergencias').expect(200);

    const idsRetornados = response.body.map((alerta: { id: string }) => alerta.id).sort();
    expect(idsRetornados).toEqual(['alerta-recente', 'emergencia-recente'].sort());

    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        nivelSeveridade: { $in: ['ALERTA', 'EMERGÊNCIA'] },
        timestamp: { $gte: expect.any(Date) },
      }),
    );
  });

  it('deve respeitar a borda exata da janela de 24 horas', async () => {
    const agora = Date.now();
    const dentroDaJanela = {
      id: 'dentro-da-janela',
      nivelSeveridade: 'ALERTA',
      descricao: 'A 23h59 do limite',
      timestamp: new Date(agora - (23 * 60 + 59) * 60 * 1000),
      zonasAfetadas: [],
    };
    const foraDaJanela = {
      id: 'fora-da-janela',
      nivelSeveridade: 'ALERTA',
      descricao: 'A 24h01 do limite',
      timestamp: new Date(agora - (24 * 60 + 1) * 60 * 1000),
      zonasAfetadas: [],
    };

    const { model } = createFilteringModelMock([dentroDaJanela, foraDaJanela]);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/emergencias').expect(200);

    expect(response.body.map((alerta: { id: string }) => alerta.id)).toEqual(['dentro-da-janela']);
  });
});
