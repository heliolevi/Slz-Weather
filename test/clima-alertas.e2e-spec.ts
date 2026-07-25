import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  buildWeatherTestApp,
  createEmptyConfigServiceMock,
  createHttpServiceMock,
} from './utils/build-weather-test-app';

/**
 * Simula o comportamento de `.find().sort().skip().limit().exec()` e `.countDocuments().exec()`
 * do Mongoose sobre um array em memória. Deliberadamente ordena/pagina o array de acordo com os
 * argumentos recebidos, em vez de devolver os dados já prontos — assim o teste valida o pipeline
 * real (Controller -> Service -> "Mongo"), não apenas se os métodos foram chamados com os
 * argumentos certos.
 */
function createSeededModelMock(seedAlerts: Record<string, unknown>[]) {
  let skipValue = 0;
  let limitValue = seedAlerts.length;

  const sortSpy = jest.fn((sortSpec: Record<string, 1 | -1>) => {
    const [[campo, direcao]] = Object.entries(sortSpec);
    const ordenados = [...seedAlerts].sort((a, b) => {
      const diff = new Date(a[campo] as string).getTime() - new Date(b[campo] as string).getTime();
      return direcao === -1 ? -diff : diff;
    });

    return {
      skip: jest.fn((skip: number) => {
        skipValue = skip;
        return {
          limit: jest.fn((limit: number) => {
            limitValue = limit;
            return { exec: () => Promise.resolve(ordenados.slice(skipValue, skipValue + limitValue)) };
          }),
        };
      }),
    };
  });

  const model: any = {
    find: jest.fn().mockReturnValue({ sort: sortSpy }),
    countDocuments: jest.fn().mockReturnValue({ exec: () => Promise.resolve(seedAlerts.length) }),
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

  it('deve retornar os alertas ordenados do mais recente para o mais antigo, com metadados de paginação', async () => {
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

    expect(response.body.data.map((alerta: { id: string }) => alerta.id)).toEqual([
      'recente',
      'intermediario',
      'antigo',
    ]);
    expect(sortSpy).toHaveBeenCalledWith({ timestamp: -1 });
    expect(response.body).toMatchObject({ page: 1, limit: 50, total: 3, totalPages: 1 });
  });

  it('deve paginar de acordo com page/limit informados na query string', async () => {
    const alertas = Array.from({ length: 5 }, (_, i) => ({
      id: `alerta-${i}`,
      nivelSeveridade: 'INFORMATIVO',
      descricao: `Alerta ${i}`,
      timestamp: new Date(2026, 0, i + 1),
      zonasAfetadas: [],
    }));

    const { model } = createSeededModelMock(alertas);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    // Mais recente primeiro é alerta-4; page=2&limit=2 deve pular os 2 mais recentes e trazer os 2 seguintes.
    const response = await request(app.getHttpServer()).get('/clima/alertas?page=2&limit=2').expect(200);

    expect(response.body.data.map((alerta: { id: string }) => alerta.id)).toEqual(['alerta-2', 'alerta-1']);
    expect(response.body).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it('deve rejeitar (400) page/limit inválidos', async () => {
    const { model } = createSeededModelMock([]);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    await request(app.getHttpServer()).get('/clima/alertas?page=0').expect(400);
    await request(app.getHttpServer()).get('/clima/alertas?limit=201').expect(400);
  });

  it('deve retornar data vazio quando não houver alertas registrados', async () => {
    const { model } = createSeededModelMock([]);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/alertas').expect(200);

    expect(response.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
  });
});
