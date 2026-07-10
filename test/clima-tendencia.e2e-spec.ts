import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  buildWeatherTestApp,
  createEmptyConfigServiceMock,
  createHttpServiceMock,
} from './utils/build-weather-test-app';

/**
 * O `$avg` em si é responsabilidade do MongoDB (não é reimplementado aqui). O que este teste
 * garante é a parte que É nosso código: arredondamento para 2 casas decimais e o limiar de risco
 * (`> 10mm`) aplicados sobre o resultado bruto que o aggregate devolveria.
 */
function createAggregateModelMock(mediaChuvaBruta: number | null) {
  const aggregateSpy = jest.fn().mockReturnValue({
    exec: () => Promise.resolve(mediaChuvaBruta === null ? [] : [{ _id: null, mediaChuva: mediaChuvaBruta }]),
  });
  return { model: { aggregate: aggregateSpy }, aggregateSpy };
}

describe('GET /clima/tendencia (integração)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('deve calcular a média corretamente a partir de um conjunto de precipitações e sinalizar risco quando > 10mm', async () => {
    // Precipitações simuladas das últimas 3h: (5 + 8 + 22) / 3 = 11.666...7mm
    const precipitacoes = [5, 8, 22];
    const mediaEsperadaBruta = precipitacoes.reduce((soma, valor) => soma + valor, 0) / precipitacoes.length;

    const { model, aggregateSpy } = createAggregateModelMock(mediaEsperadaBruta);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/tendencia').expect(200);

    expect(response.body.mediaChuva).toBeCloseTo(11.67, 2);
    expect(response.body.riscoInundacaoSubita).toBe(true);
    expect(response.body.mensagem).toContain('RISCO DE INUNDAÇÃO SÚBITA');

    expect(aggregateSpy).toHaveBeenCalledWith([
      { $match: { timestamp: { $gte: expect.any(Date) } } },
      { $group: { _id: null, mediaChuva: { $avg: '$precipitacao' } } },
    ]);
  });

  it('NÃO deve sinalizar risco quando a média for exatamente 10mm (limiar é estritamente > 10)', async () => {
    const { model } = createAggregateModelMock(10);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/tendencia').expect(200);

    expect(response.body.mediaChuva).toBe(10);
    expect(response.body.riscoInundacaoSubita).toBe(false);
  });

  it('deve sinalizar risco quando a média ultrapassar 10mm por uma margem pequena', async () => {
    const { model } = createAggregateModelMock(10.01);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/tendencia').expect(200);

    expect(response.body.mediaChuva).toBe(10.01);
    expect(response.body.riscoInundacaoSubita).toBe(true);
  });

  it('deve retornar mediaChuva zero quando não houver nenhum alerta nas últimas 3 horas', async () => {
    const { model } = createAggregateModelMock(null);

    const built = await buildWeatherTestApp({
      httpService: createHttpServiceMock(),
      configService: createEmptyConfigServiceMock(),
      weatherAlertModel: model,
    });
    app = built.app;

    const response = await request(app.getHttpServer()).get('/clima/tendencia').expect(200);

    expect(response.body.mediaChuva).toBe(0);
    expect(response.body.riscoInundacaoSubita).toBe(false);
  });
});
