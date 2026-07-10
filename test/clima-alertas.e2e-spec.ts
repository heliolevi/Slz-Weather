import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  buildWeatherTestApp,
  createEmptyConfigServiceMock,
  createHttpServiceMock,
} from './utils/build-weather-test-app';

/**
 * Simula o comportamento de `.find().sort(spec).exec()` do Mongoose sobre um array em memória.
 * Deliberadamente ordena o array de acordo com o `sortSpec` recebido, em vez de devolver os dados
 * já prontos — assim o teste valida o pipeline real (Controller -> Service -> "Mongo"), não apenas
 * se o método foi chamado com os argumentos certos.
 */
function createSeededModelMock(seedAlerts: Record<string, unknown>[]) {
  const sortSpy = jest.fn((sortSpec: Record<string, 1 | -1>) => {
    const [[campo, direcao]] = Object.entries(sortSpec);
    const ordenados = [...seedAlerts].sort((a, b) => {
      const diff = new Date(a[campo] as string).getTime() - new Date(b[campo] as string).getTime();
      return direcao === -1 ? -diff : diff;
    });
    return { exec: () => Promise.resolve(ordenados) };
  });

  const model: any = {
    find: jest.fn().mockReturnValue({ sort: sortSpy }),
  };

  return { model, sortSpy };
}

describe('GET /clima/alertas (integração)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('deve retornar os alertas ordenados do mais recente para o mais antigo', async () => {
    // Seed inserido propositalmente fora de ordem, para provar que quem ordena é o código, não a inserção.
    const alertaAntigo = {
      id: 'antigo',
      nivelSeveridade: 'INFORMATIVO',
      descricao: 'Alerta mais antigo',
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      zonasAfetadas: [],
    };
    const alertaIntermediario = {
      id: 'intermediario',
      nivelSeveridade: 'ATENÇÃO',
      descricao: 'Alerta intermediário',
      timestamp: new Date('2026-01-02T00:00:00.000Z'),
      zonasAfetadas: [],
    };
    const alertaRecente = {
      id: 'recente',
      nivelSeveridade: 'EMERGÊNCIA',
      descricao: 'Alerta mais recente',
      timestamp: new Date('2026-01-03T00:00:00.000Z'),
      zonasAfetadas: [],
    };

    const { model, sortSpy } = createSeededModelMock([alertaIntermediario, alertaRecente, alertaAntigo]);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/alertas').expect(200);

    expect(response.body.map((alerta: { id: string }) => alerta.id)).toEqual(['recente', 'intermediario', 'antigo']);
    expect(sortSpy).toHaveBeenCalledWith({ timestamp: -1 });
  });

  it('deve retornar um array vazio quando não houver alertas registrados', async () => {
    const { model } = createSeededModelMock([]);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/alertas').expect(200);

    expect(response.body).toEqual([]);
  });
});
