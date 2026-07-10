import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { WeatherController } from '../../src/controllers/weather.controller';
import { WeatherAlert } from '../../src/schemas/weather.schema';
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
}

export interface WeatherTestApp {
  app: INestApplication;
  weatherService: WeatherService;
}

export async function buildWeatherTestApp(deps: WeatherTestAppDeps): Promise<WeatherTestApp> {
  const moduleRef = await Test.createTestingModule({
    controllers: [WeatherController],
    providers: [
      WeatherService,
      { provide: HttpService, useValue: deps.httpService },
      { provide: ConfigService, useValue: deps.configService },
      { provide: getModelToken(WeatherAlert.name), useValue: deps.weatherAlertModel },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
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
