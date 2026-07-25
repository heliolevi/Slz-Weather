import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CronController } from '../src/controllers/cron.controller';
import { CronAuthGuard } from '../src/guards/cron-auth.guard';
import { AlertEngineService } from '../src/services/alert-engine.service';
import { WeatherService } from '../src/services/weather.service';

const CRON_SECRET_DE_TESTE = 'segredo-de-teste-para-e2e';

describe('/cron/* (integração)', () => {
  let app: INestApplication<App>;
  let weatherService: { evaluateAndPersistCurrentWeather: jest.Mock };
  let alertEngineService: { avaliarEEmitirAlertas: jest.Mock };

  beforeEach(async () => {
    weatherService = {
      evaluateAndPersistCurrentWeather: jest.fn().mockResolvedValue({
        nivelSeveridade: 'INFORMATIVO',
        tipoAlerta: 'NORMAL',
        descricao: 'Condições climáticas estáveis.',
        timestamp: new Date(),
      }),
    };
    alertEngineService = { avaliarEEmitirAlertas: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CronController],
      providers: [
        CronAuthGuard,
        { provide: WeatherService, useValue: weatherService },
        { provide: AlertEngineService, useValue: alertEngineService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(CRON_SECRET_DE_TESTE) } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('deve rejeitar (401) uma chamada a /cron/analise-climatica sem o header Authorization', async () => {
    await request(app.getHttpServer()).get('/cron/analise-climatica').expect(401);
    expect(weatherService.evaluateAndPersistCurrentWeather).not.toHaveBeenCalled();
  });

  it('deve rejeitar (401) uma chamada com o CRON_SECRET errado', async () => {
    await request(app.getHttpServer())
      .get('/cron/analise-climatica')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
    expect(weatherService.evaluateAndPersistCurrentWeather).not.toHaveBeenCalled();
  });

  it('deve executar a análise climática (200) quando o CRON_SECRET está correto', async () => {
    const response = await request(app.getHttpServer())
      .get('/cron/analise-climatica')
      .set('Authorization', `Bearer ${CRON_SECRET_DE_TESTE}`)
      .expect(200);

    expect(weatherService.evaluateAndPersistCurrentWeather).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({ ok: true, nivelSeveridade: 'INFORMATIVO' });
  });

  it('deve rejeitar (401) uma chamada a /cron/motor-alertas sem autenticação', async () => {
    await request(app.getHttpServer()).get('/cron/motor-alertas').expect(401);
    expect(alertEngineService.avaliarEEmitirAlertas).not.toHaveBeenCalled();
  });

  it('deve executar o motor de alertas (200) quando o CRON_SECRET está correto', async () => {
    const response = await request(app.getHttpServer())
      .get('/cron/motor-alertas')
      .set('Authorization', `Bearer ${CRON_SECRET_DE_TESTE}`)
      .expect(200);

    expect(alertEngineService.avaliarEEmitirAlertas).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({ ok: true });
  });
});
