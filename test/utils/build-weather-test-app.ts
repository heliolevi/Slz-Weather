import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configureApp } from '../../src/app.setup';
import { WeatherController } from '../../src/controllers/weather.controller';
import { WeatherAlert } from '../../src/schemas/weather.schema';
import { SeismicSensorState } from '../../src/schemas/seismic-sensor-state.schema';
import { WeatherService } from '../../src/services/weather.service';

/**
 * Monta uma INestApplication real (Controller + Service reais) para os testes de integração
 * de `/clima/*`, mockando apenas as bordas externas: HttpService (Open-Meteo/webhook),
 * ConfigService (.env) e o Model do Mongoose (MongoDB).
 *
 * Optamos por mockar o repositório em vez de subir um MongoDB in-memory: é determinístico,
 * não depende de baixar um binário do Mongo (indisponível em ambientes de CI/sandbox sem rede)
 * e ainda assim exercita o fluxo real HTTP -> Controller -> Service -> "repositório".
 */
export interface WeatherTestAppDeps {
  httpService: { get: jest.Mock; post: jest.Mock };
  configService: { get: jest.Mock };
  weatherAlertModel: any;
  /** Opcional: por padrão, nenhuma leitura sísmica pendente (sem estado em aberto). */
  seismicStateModel?: any;
}

export interface WeatherTestApp {
  app: INestApplication;
  weatherService: WeatherService;
}

export async function buildWeatherTestApp(deps: WeatherTestAppDeps): Promise<WeatherTestApp> {
  const seismicStateModel = deps.seismicStateModel ?? createEmptySeismicStateModelMock();

  const moduleRef = await Test.createTestingModule({
    // Mesma config de ThrottlerModule usada em produção (ver AppModule) — os testes de rate
    // limiting (test/clima-atual.e2e-spec.ts) dependem de o guard estar realmente ativo aqui.
    imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
    controllers: [WeatherController],
    providers: [
      WeatherService,
      { provide: HttpService, useValue: deps.httpService },
      { provide: ConfigService, useValue: deps.configService },
      { provide: getModelToken(WeatherAlert.name), useValue: deps.weatherAlertModel },
      { provide: getModelToken(SeismicSensorState.name), useValue: seismicStateModel },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  // Mesma configuração usada em produção (main.ts/api/index.ts) — sobretudo o ValidationPipe
  // global, do qual a validação de PaginationQueryDto em /clima/alertas depende. Reaproveitar
  // configureApp() aqui evita que o harness de teste e a produção divirjam silenciosamente.
  configureApp(app);
  const weatherService = moduleRef.get(WeatherService);
  await app.init();

  return { app, weatherService };
}

/** ConfigService mockado que sempre devolve string vazia (webhook/API key desligados nos testes). */
export function createEmptyConfigServiceMock(): { get: jest.Mock } {
  return { get: jest.fn().mockReturnValue('') };
}

/** HttpService mockado, sem comportamento pré-configurado — cada teste define get/post conforme o cenário. */
export function createHttpServiceMock(): { get: jest.Mock; post: jest.Mock } {
  return { get: jest.fn(), post: jest.fn() };
}

/** Model do sensor sísmico mockado sem nenhuma leitura pendente (comportamento padrão nos testes). */
export function createEmptySeismicStateModelMock(): { findOne: jest.Mock; findOneAndUpdate: jest.Mock } {
  return {
    findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
  };
}
